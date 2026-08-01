import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperState } from "./mapper.js";
import { RexSoft12Mapper } from "./rex-soft-12-mapper.js";

const noopInterrupt = { setMapperIrq() {} };

describe("RexSoft12Mapper", () => {
  it("uses MMC3 PRG banking and independently extends each PPU pattern half", () => {
    const cartridge = createRexSoftCartridge();
    fillPrgBanks(cartridge.prgRom);
    fillChrBanks(cartridge.chrRom);
    const mapper = new RexSoft12Mapper(noopInterrupt, cartridge);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([0, 1, 30, 31]);

    mapper.write(0x8000, 0x00);
    mapper.write(0x8001, 0x02);
    mapper.write(0x8000, 0x02);
    mapper.write(0x8001, 0x04);
    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0x02, 0x04]);

    mapper.writeCpuExpansion(0x4132, 0x11);
    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0x82, 0x84]);

    mapper.write(0x8000, 0x80);
    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0x84, 0x82]);
  });

  it("decodes every $E100-masked register alias and applies writes immediately", () => {
    const cartridge = createRexSoftCartridge();
    fillChrBanks(cartridge.chrRom);
    const mapper = new RexSoft12Mapper(noopInterrupt, cartridge);

    for (const address of [0x4100, 0x4132, 0x43ff, 0x5f00]) {
      mapper.writeCpuExpansion(address, 0x01);
      expect(mapper.read(0x0000)).toBe(0x80);
      mapper.writeCpuExpansion(address, 0x10);
      expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0, 0x80]);
    }

    const state = mapper.captureState();
    for (const address of [0x4032, 0x4232, 0x6000]) mapper.writeCpuExpansion(address, 0x11);
    expect(mapper.captureState()).toEqual(state);
  });

  it("drives only the hard-wired Chinese language bit on register reads", () => {
    const bus = new Bus(createRexSoftCartridge());
    const memory = new CPUMemory(bus);

    for (const address of [0x4100, 0x4132, 0x43ff, 0x5f00]) {
      expect(bus.Mapper.readCpuExpansion?.(address)).toEqual({ value: 1, drivenMask: 1 });
    }
    expect(bus.Mapper.readCpuExpansion?.(0x4032)).toBeUndefined();

    memory.write(0x0000, 0xa4);
    expect(memory.read(0x4132)).toBe(0xa5);
  });

  it("routes the MMC3 WRAM window with enable and write-protect control", () => {
    const bus = new Bus(createRexSoftCartridge());
    const memory = new CPUMemory(bus);

    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0xff);
    memory.write(0x6000, 0x5a);
    expect(memory.read(0x6000)).toBe(0x5a);

    bus.Mapper.write(0xa001, 0xc0);
    memory.write(0x6000, 0xa5);
    expect(memory.read(0x6000)).toBe(0x5a);

    bus.Mapper.write(0xa001, 0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x8000)).toBe(0xff);
  });

  it("uses MMC3A zero-latch IRQ behavior", () => {
    const bus = new Bus(createRexSoftCartridge());

    bus.Mapper.write(0xc000, 0);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);

    bus.Mapper.write(0xe000, 0);
    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips the GAL and nested MMC3 state transactionally", () => {
    const bus = new Bus(createRexSoftCartridge());
    bus.Mapper.writeCpuExpansion?.(0x4132, 0x11);
    bus.Mapper.write(0x8000, 6);
    bus.Mapper.write(0x8001, 9);
    const state = bus.Mapper.captureState();
    if (state.kind !== "rex-soft-12") throw new Error("expected Rex Soft mapper state");

    bus.Mapper.powerOn();
    bus.Mapper.restoreState(state);
    expect(bus.Mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, chrOuterBits: 2 },
      { ...state, chrOuterBits: -1 },
      { ...state, mmc3: { ...state.mmc3, registers: [0] } },
    ]) {
      expect(() => bus.Mapper.restoreState(invalid as MapperState)).toThrowError(/state/i);
      expect(bus.Mapper.captureState()).toEqual(state);
    }
  });

  it("clears the outer latch on power-on", () => {
    const cartridge = createRexSoftCartridge();
    fillChrBanks(cartridge.chrRom);
    const mapper = new RexSoft12Mapper(noopInterrupt, cartridge);
    mapper.writeCpuExpansion(0x4132, 0x11);

    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ chrOuterBits: 0 });
    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0, 0]);
  });

  it.each([
    { nes2: false, submapper: 0 },
    { nes2: true, submapper: 0 },
  ])("accepts the exact SL-5020B geometry (NES 2.0=$nes2)", ({ nes2, submapper }) => {
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 12, nes2, submapper, prgBanks: 16, chrBanks: 64 }),
        noopInterrupt,
      ),
    ).not.toThrow();
  });

  it.each([
    { name: "volatile WRAM", prgRamShift: 7, prgNvRamShift: 0, battery: false },
    { name: "battery WRAM", prgRamShift: 0, prgNvRamShift: 7, battery: true },
  ])("accepts exact SL-5020B geometry with $name", ({ prgRamShift, prgNvRamShift, battery }) => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 12,
          nes2: true,
          prgBanks: 16,
          chrBanks: 64,
          prgRamShift,
          prgNvRamShift,
          battery,
        }),
        noopInterrupt,
      ),
    ).not.toThrow();
  });

  it.each([
    {
      name: "128 KiB PRG ROM",
      options: { mapper: 12, prgBanks: 8, chrBanks: 64 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "256 KiB CHR ROM",
      options: { mapper: 12, prgBanks: 16, chrBanks: 32 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "4 KiB NES 2.0 PRG RAM",
      options: { mapper: 12, nes2: true, prgBanks: 16, chrBanks: 64, prgRamShift: 6 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 12, prgBanks: 16, chrBanks: 64, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "unallocated submapper",
      options: { mapper: 12, nes2: true, submapper: 2, prgBanks: 16, chrBanks: 1 },
      error: UnsupportedMapperVariantError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(error);
  });
});

function createRexSoftCartridge() {
  return createTestCartridge({ mapper: 12, prgBanks: 16, chrBanks: 64 });
}

function fillPrgBanks(bytes: Uint8Array): void {
  for (let bank = 0; bank < bytes.byteLength / 0x2000; bank++) {
    bytes.fill(bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}

function fillChrBanks(bytes: Uint8Array): void {
  for (let bank = 0; bank < bytes.byteLength / 0x0400; bank++) {
    const marker = (bank & 0x7f) | ((bank >>> 8) << 7);
    bytes.fill(marker, bank * 0x0400, (bank + 1) * 0x0400);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}
