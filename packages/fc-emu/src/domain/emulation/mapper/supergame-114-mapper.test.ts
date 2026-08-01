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

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("SuperGame mapper 114", () => {
  it("decodes submapper 0's MMC3 register and index permutation", () => {
    const cartridge = createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 32 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xa000, 0x04); // Scrambled index 4 selects MMC3 R6.
    mapper.write(0xc000, 0x03);
    expect(mapper.read(0x8000)).toBe(3);

    mapper.write(0xc000, 0x09); // The translated MMC3 data register remains selected.
    expect(mapper.read(0x8000)).toBe(9);

    mapper.write(0xa000, 0x01); // Scrambled index 1 selects MMC3 R3.
    mapper.write(0xc000, 0x12);
    expect(mapper.read(0x1400)).toBe(0x12);

    mapper.write(0x8001, 1); // Physical $8001 is MMC3 $A000.
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("decodes submapper 1's distinct address and index permutation", () => {
    const cartridge = createTestCartridge({
      mapper: 114,
      nes2: true,
      submapper: 1,
      prgBanks: 16,
      chrBanks: 32,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xa000, 0x01); // Scrambled index 1 selects MMC3 R2.
    mapper.write(0x8001, 0x21); // Physical $8001 is the direct data port.
    expect(mapper.read(0x1000)).toBe(0x21);

    mapper.write(0xa000, 0x04); // Scrambled index 4 selects MMC3 R6.
    mapper.write(0x8001, 0x05);
    expect(mapper.read(0x8000)).toBe(5);

    mapper.write(0xc000, 1); // Physical $C000 is MMC3 $A000.
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("applies the NROM override and outer CHR line independently of MMC3", () => {
    const cartridge = createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 64 });
    fillBanks(cartridge.prgRom, 0x2000);
    cartridge.chrRom[4 * 0x0400] = 0x44;
    cartridge.chrRom[0x104 * 0x0400] = 0xa4;
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x6000, 0x83);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([6, 7, 6, 7]);

    mapper.write(0x6000, 0xa6);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([12, 13, 14, 15]);

    mapper.write(0x6000, 0);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([0, 1, 30, 31]);

    mapper.write(0xa000, 0);
    mapper.write(0xc000, 4);
    expect(mapper.read(0x0000)).toBe(0x44);
    mapper.write(0x6001, 1);
    expect(mapper.read(0x0000)).toBe(0xa4);
  });

  it("uses MMC3A zero-latch IRQ behavior with the filtered PPU A12 input", () => {
    const bus = new Bus(createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 32 }));

    bus.Mapper.write(0xa001, 0);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);

    bus.Mapper.write(0xe000, 0);
    bus.Mapper.write(0xa001, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    const state = bus.captureState();
    bus.Mapper.powerOn();
    bus.restoreState(state);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips board protection and nested MMC3 state transactionally", () => {
    const cartridge = createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 64 });
    fillBanks(cartridge.prgRom, 0x2000);
    const bus = new Bus(cartridge);
    bus.Mapper.write(0x6000, 0xa6);
    bus.Mapper.write(0x6001, 1);
    bus.Mapper.write(0xa000, 4);
    bus.Mapper.write(0x8001, 1);
    const state = bus.captureState();

    bus.Mapper.powerOn();
    bus.restoreState(state);
    expect(bus.captureState()).toEqual(state);
    expect(readAt(bus.Mapper, [0x8000, 0xc000])).toEqual([12, 14]);

    const mapperState = state.mapper as Extract<MapperState, { kind: "supergame-114" }>;
    expect(() => bus.Mapper.restoreState({ ...mapperState, variant: 1 })).toThrow(RangeError);
    expect(bus.captureState()).toEqual(state);
  });

  it("fails closed on unmodeled variants, memory and nametable geometry", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 114, prgBanks: 8, chrBanks: 1 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 114,
          nes2: true,
          submapper: 1,
          prgBanks: 16,
          chrBanks: 64,
        }),
        noopInterrupt,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 114,
          nes2: true,
          submapper: 2,
          prgBanks: 16,
          chrBanks: 32,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 114, prgBanks: 7, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 114, prgBanks: 17, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 65 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 114, prgBanks: 16 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 32, battery: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 32, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);

    const mapper = createMapper(
      createTestCartridge({ mapper: 114, prgBanks: 16, chrBanks: 32 }),
      noopInterrupt,
    );
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
  });
});

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bankIndex = 0; bankIndex < bytes.byteLength / bankSize; bankIndex++) {
    bytes.fill(bankIndex, bankIndex * bankSize, (bankIndex + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
