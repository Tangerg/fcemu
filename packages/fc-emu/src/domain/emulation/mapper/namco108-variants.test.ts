import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { PPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("Namco 108 board variants", () => {
  it("maps Mapper 76 as four independently selected 2 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 76, prgBanks: 8, chrBanks: 16 });
    fillChrBanks(cartridge, 0x0800);
    const mapper = createMapper(cartridge, interruptPort);

    bank(mapper, 0, 1);
    bank(mapper, 1, 2);
    bank(mapper, 2, 17);
    bank(mapper, 3, 18);
    bank(mapper, 4, 19);
    bank(mapper, 5, 20);

    expect(mapper.read(0x0000)).toBe(17);
    expect(mapper.read(0x0800)).toBe(18);
    expect(mapper.read(0x1000)).toBe(19);
    expect(mapper.read(0x1800)).toBe(20);
  });

  it("maps Mapper 88's left and right pattern tables into separate 64 KiB halves", () => {
    const cartridge = createTestCartridge({ mapper: 88, prgBanks: 8, chrBanks: 16 });
    fillChrBanks(cartridge, 0x0400);
    const mapper = createMapper(cartridge, interruptPort);

    bank(mapper, 0, 4);
    bank(mapper, 1, 8);
    bank(mapper, 2, 4);
    bank(mapper, 3, 5);
    bank(mapper, 4, 6);
    bank(mapper, 5, 7);

    expect(mapper.read(0x0000)).toBe(4);
    expect(mapper.read(0x0400)).toBe(5);
    expect(mapper.read(0x0800)).toBe(8);
    expect(mapper.read(0x0c00)).toBe(9);
    expect(mapper.read(0x1000)).toBe(68);
    expect(mapper.read(0x1400)).toBe(69);
    expect(mapper.read(0x1800)).toBe(70);
    expect(mapper.read(0x1c00)).toBe(71);
  });

  it("routes Mapper 95 CIRAM A10 from CHR A15 for each 2 KiB nametable pair", () => {
    const cartridge = createTestCartridge({ mapper: 95, prgBanks: 8, chrBanks: 8 });
    const bus = new Bus(cartridge);
    const ppuMemory = new PPUMemory(bus);

    bank(bus.Mapper, 0, 0x20);
    bank(bus.Mapper, 1, 0x00);
    ppuMemory.write(0x2000, 0xaa);
    ppuMemory.write(0x2800, 0xbb);

    expect(ppuMemory.read(0x2400)).toBe(0xaa);
    expect(ppuMemory.read(0x2c00)).toBe(0xbb);

    bank(bus.Mapper, 0, 0x00);
    expect(ppuMemory.read(0x2000)).toBe(0xbb);
  });

  it("round-trips Mapper 95 bank-selected nametable wiring", () => {
    const cartridge = createTestCartridge({ mapper: 95, prgBanks: 8, chrBanks: 8 });
    const mapper = createMapper(cartridge, interruptPort);
    bank(mapper, 0, 0x20);
    bank(mapper, 6, 3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(mapper.mapNametableAddress?.(0x2000)).toBe(0x0400);
    if (state.kind !== "namco-118") throw new Error("Expected Namco 118 state");
    expect(() =>
      mapper.restoreState({
        ...state,
        registers: [0x40, ...state.registers.slice(1)],
      } as MapperState),
    ).toThrowError(RangeError);
  });

  it("rejects unsupported Namco variant submappers and board geometries", () => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 76,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 16,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 76, prgBanks: 16, chrBanks: 16 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 88, prgBanks: 8, chrBanks: 17 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 95, prgBanks: 8 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 95,
          nes2: true,
          prgBanks: 8,
          chrBanks: 8,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 95, prgBanks: 8, chrBanks: 8, fourScreen: true }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function bank(mapper: ReturnType<typeof createMapper>, register: number, value: number): void {
  mapper.write(0x8000, register);
  mapper.write(0x8001, value);
}

function fillChrBanks(cartridge: ReturnType<typeof createTestCartridge>, bankSize: number): void {
  for (let bank = 0; bank < cartridge.chrRom.byteLength / bankSize; bank++) {
    cartridge.chrRom.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
