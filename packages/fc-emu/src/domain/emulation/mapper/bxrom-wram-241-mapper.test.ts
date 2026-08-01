import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { BxromWram241Mapper } from "./bxrom-wram-241-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const noopInterrupt = { setMapperIrq() {} };

describe("BxromWram241Mapper", () => {
  it("powers up in bank zero and switches one conflict-free 32 KiB PRG window", () => {
    const cartridge = createMapper241Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new BxromWram241Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0);
    mapper.write(0x8000, 1);
    expect(mapper.read(0x8000)).toBe(1);

    mapper.write(0xffff, 0xff);
    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.captureState()).toEqual({
      kind: "bxrom-wram-241",
      prgBankRegister: 0xff,
    });
  });

  it("maps direct 8 KiB WRAM and writable 8 KiB CHR RAM", () => {
    const cartridge = createMapper241Cartridge();
    const mapper = new BxromWram241Mapper(cartridge);

    mapper.write(0x6000, 0x31);
    mapper.write(0x7fff, 0x42);
    expect(mapper.read(0x6000)).toBe(0x31);
    expect(mapper.read(0x7fff)).toBe(0x42);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);

    mapper.write(0x0000, 0x53);
    mapper.write(0x1fff, 0x64);
    expect(mapper.read(0x0000)).toBe(0x53);
    expect(mapper.read(0x1fff)).toBe(0x64);
  });

  it("leaves the unimplemented optional LPC window electrically open", () => {
    const bus = new Bus(createMapper241Cartridge());
    const memory = new CPUMemory(bus);

    memory.write(0x0000, 0xa5);
    expect(memory.read(0x5000)).toBe(0xa5);
    memory.write(0x0000, 0x5a);
    expect(memory.read(0x5fff)).toBe(0x5a);
  });

  it("round-trips the raw latch and rejects malformed state atomically", () => {
    const mapper = new BxromWram241Mapper(createMapper241Cartridge());
    mapper.write(0x8000, 0xfe);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgBankRegister: -1 },
      { ...state, prgBankRegister: 256 },
      { ...state, prgBankRegister: 1.5 },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("preserves its latch across warm reset and clears it on cold power", () => {
    const bus = new Bus(createMapper241Cartridge());
    bus.Mapper.write(0x8000, 3);
    const warmState = bus.Mapper.captureState();

    bus.reset();
    expect(bus.Mapper.captureState()).toEqual(warmState);
    bus.powerOn();
    expect(bus.Mapper.captureState()).toEqual({
      kind: "bxrom-wram-241",
      prgBankRegister: 0,
    });
  });

  it.each([
    { name: "Journey to the West", prgBanks: 8, battery: false },
    { name: "Edu", prgBanks: 32, battery: true },
    { name: "maximum 1 MiB board", prgBanks: 64, battery: false },
  ])("accepts the $name geometry", ({ prgBanks, battery }) => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 241, prgBanks, battery }), noopInterrupt),
    ).not.toThrow();
  });

  it.each([
    {
      name: "unknown submapper",
      options: { mapper: 241, nes2: true, submapper: 1, prgBanks: 8, prgRamShift: 7 },
      error: UnsupportedMapperVariantError,
    },
    {
      name: "16 KiB PRG ROM",
      options: { mapper: 241, prgBanks: 1 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "2 MiB PRG ROM",
      options: { mapper: 241, nes2: true, prgBanks: 128, prgRamShift: 7 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "CHR ROM",
      options: { mapper: 241, prgBanks: 8, chrBanks: 1 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "16 KiB CHR RAM",
      options: { mapper: 241, nes2: true, prgBanks: 8, prgRamShift: 7, chrRamShift: 8 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "missing PRG RAM",
      options: { mapper: 241, nes2: true, prgBanks: 8 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "16 KiB PRG RAM",
      options: { mapper: 241, nes2: true, prgBanks: 8, prgRamShift: 8 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "mixed PRG RAM and NVRAM",
      options: {
        mapper: 241,
        nes2: true,
        battery: true,
        prgBanks: 8,
        prgRamShift: 7,
        prgNvRamShift: 7,
      },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 241, prgBanks: 8, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(error);
  });
});

function createMapper241Cartridge() {
  return createTestCartridge({ mapper: 241, prgBanks: 8 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
