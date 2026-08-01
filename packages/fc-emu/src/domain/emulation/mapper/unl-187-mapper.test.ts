import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Unl187Mapper } from "./unl-187-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Unl187Mapper", () => {
  it("retains MMC3 PRG banking while override mode is disabled", () => {
    const cartridge = createMapper187Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new Unl187Mapper(noopInterrupt, cartridge);

    mapper.write(0x8000, 0x06);
    mapper.write(0x8001, 0x05);
    mapper.write(0x8000, 0x07);
    mapper.write(0x8001, 0x06);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 6, 30, 31]);
  });

  it("selects mirrored 16 KiB and both 32 KiB PRG override wirings", () => {
    const cartridge = createMapper187Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new Unl187Mapper(noopInterrupt, cartridge);

    mapper.writeCpuExpansion(0x5000, 0x85);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([10, 11, 10, 11]);

    mapper.writeCpuExpansion(0x5000, 0xe5);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([4, 5, 6, 7]);

    mapper.write(0x6000, 0xa5);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([8, 9, 10, 11]);

    mapper.writeCpuExpansion(0x5001, 0x80);
    mapper.write(0x6001, 0x80);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([8, 9, 10, 11]);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("connects CHR A18 only to the half sourced by MMC3 R0/R1", () => {
    const cartridge = createMapper187Cartridge();
    const mapper = new Unl187Mapper(noopInterrupt, cartridge);
    setChrByte(cartridge.chrRom, 0x000, 0x10);
    setChrByte(cartridge.chrRom, 0x007, 0x17);
    setChrByte(cartridge.chrRom, 0x100, 0x80);
    setChrByte(cartridge.chrRom, 0x101, 0x81);

    expect(mapper.read(0x0000)).toBe(0x80);
    expect(mapper.read(0x0400)).toBe(0x81);
    expect(mapper.read(0x1000)).toBe(0x10);

    mapper.write(0x8000, 0x82);
    mapper.write(0x8001, 0x07);
    expect(mapper.read(0x0000)).toBe(0x17);
    expect(mapper.read(0x1000)).toBe(0x80);
  });

  it("gates exact $8001 until an exact $8000 write and exposes the protection byte", () => {
    const cartridge = createMapper187Cartridge();
    const mapper = new Unl187Mapper(noopInterrupt, cartridge);
    setChrByte(cartridge.chrRom, 0x100, 0x80);
    setChrByte(cartridge.chrRom, 0x104, 0x84);

    expect(mapper.readCpuExpansion(0x5000)).toEqual({ value: 0x83, drivenMask: 0xff });
    expect(mapper.readCpuExpansion(0x5fff)).toEqual({ value: 0x83, drivenMask: 0xff });
    expect(mapper.readCpuExpansion(0x4fff)).toBeUndefined();

    mapper.write(0x8001, 0x05);
    expect(mapper.read(0x0000)).toBe(0x80);
    expect(mapper.captureState()).toMatchObject({ securityIndex: 0 });

    mapper.write(0x8000, 0x00);
    mapper.write(0x8001, 0x05);
    expect(mapper.read(0x0000)).toBe(0x84);
    expect(mapper.captureState()).toMatchObject({ securityIndex: 1 });
  });

  it("retains MMC3 mirroring and filtered A12 IRQ behavior", () => {
    const cartridge = createMapper187Cartridge();
    const bus = new Bus(cartridge);

    bus.Mapper.write(0xa000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips both board layers and rejects malformed state atomically", () => {
    const mapper = new Unl187Mapper(noopInterrupt, createMapper187Cartridge());
    mapper.writeCpuExpansion(0x5000, 0xe5);
    mapper.write(0x8000, 0x82);
    mapper.write(0x8001, 0x07);
    mapper.write(0xc000, 3);
    mapper.write(0xc001, 0);
    const state = mapper.captureState();
    if (state.kind !== "unl-187") throw new Error("unexpected mapper state");

    const restored = new Unl187Mapper(noopInterrupt, createMapper187Cartridge());
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgControl: 0x100 },
      { ...state, securityIndex: 2 },
      { ...state, mmc3: null },
      { ...state, mmc3: { ...state.mmc3, counter: 0x100 } },
    ]) {
      expect(() => restored.restoreState(invalid as MapperState)).toThrow(/save state/);
      expect(restored.captureState()).toEqual(state);
    }
  });

  it("accepts documented ROM capacities and rejects unsupported board geometry", () => {
    for (const [prgBanks, chrBanks] of [
      [8, 32],
      [8, 64],
      [16, 32],
      [16, 64],
    ]) {
      expect(() =>
        createMapper(createTestCartridge({ mapper: 187, prgBanks, chrBanks }), noopInterrupt),
      ).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 187,
          nes2: true,
          submapper: 1,
          prgBanks: 16,
          chrBanks: 64,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 187, prgBanks: 4, chrBanks: 64 }),
      createTestCartridge({ mapper: 187, prgBanks: 32, chrBanks: 64 }),
      createTestCartridge({ mapper: 187, prgBanks: 16, chrBanks: 16 }),
      createTestCartridge({ mapper: 187, prgBanks: 16 }),
      createTestCartridge({ mapper: 187, prgBanks: 16, chrBanks: 64, battery: true }),
      createTestCartridge({ mapper: 187, prgBanks: 16, chrBanks: 64, fourScreen: true }),
      createTestCartridge({
        mapper: 187,
        nes2: true,
        prgBanks: 16,
        chrBanks: 64,
        prgRamShift: 7,
      }),
    ]) {
      expect(() => createMapper(cartridge, noopInterrupt)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper187Cartridge() {
  return createTestCartridge({ mapper: 187, prgBanks: 16, chrBanks: 64 });
}

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function setChrByte(bytes: Uint8Array, bank: number, value: number): void {
  bytes[bank * 0x0400] = value;
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
