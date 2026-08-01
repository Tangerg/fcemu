import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";
import { SachenSa015Mapper } from "./sachen-sa015-mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("SachenSa015Mapper", () => {
  it("routes the SA-015 PRG and CHR lines without inheriting SA-020A wiring", () => {
    const cartridge = createMapper150Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new SachenSa015Mapper(cartridge);

    writeRegister(mapper, 5, 3);
    writeRegister(mapper, 2, 1);
    writeRegister(mapper, 4, 1);
    writeRegister(mapper, 6, 3);

    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.read(0xffff)).toBe(3);
    expect(mapper.read(0x0000)).toBe(7);
    expect(mapper.read(0x1fff)).toBe(7);
  });

  it("decodes mirrored $4100/$4101 ports and leaves undriven CPU bits open", () => {
    const mapper = new SachenSa015Mapper(createMapper150Cartridge());

    for (const [indexAddress, dataAddress] of [
      [0x4100, 0x4101],
      [0x4300, 0x4301],
      [0x5f00, 0x5f01],
    ]) {
      mapper.writeCpuExpansion(indexAddress, 3);
      mapper.writeCpuExpansion(dataAddress, 5);
      expect(mapper.readCpuExpansion(dataAddress)).toEqual({ value: 5, drivenMask: 0x07 });
      expect(mapper.readCpuExpansion(indexAddress)).toBeUndefined();
    }

    mapper.writeCpuExpansion(0x4200, 6);
    mapper.writeCpuExpansion(0x4201, 7);
    mapper.write(0x8000, 7);
    expect(mapper.readCpuExpansion(0x4101)).toEqual({ value: 5, drivenMask: 0x07 });

    mapper.write(0x6100, 3);
    mapper.write(0x6101, 6);
    mapper.write(0x7f00, 3);
    mapper.write(0x7f01, 5);
    expect(mapper.read(0x6101)).toBe(5);
    expect(mapper.cpuReadDriveMask(0x6101)).toBe(0x07);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);

    const memory = new CPUMemory(new Bus(createMapper150Cartridge()));
    memory.write(0x4100, 3);
    memory.write(0x4101, 5);
    memory.write(0x4000, 0xa0);
    expect(memory.read(0x4101)).toBe(0xa5);
    memory.write(0x4000, 0xb8);
    expect(memory.read(0x4100)).toBe(0xb8);
  });

  it("retains all three bits in all eight registers, including unused outputs", () => {
    const mapper = new SachenSa015Mapper(createMapper150Cartridge());

    for (let register = 0; register < 8; register++) {
      writeRegister(mapper, register, 0xf8 | register);
    }
    for (let register = 0; register < 8; register++) {
      mapper.writeCpuExpansion(0x4100, register);
      expect(mapper.readCpuExpansion(0x4101)).toEqual({
        value: register,
        drivenMask: 0x07,
      });
    }
  });

  it("models the pin-14 Vcc solder pad on both writes and read data-line ownership", () => {
    const mapper = new SachenSa015Mapper(createMapper150Cartridge(), "vcc");

    mapper.writeCpuExpansion(0x4100, 2);
    mapper.writeCpuExpansion(0x4101, 1);

    expect(mapper.captureState()).toEqual({
      kind: "sachen-sa015-150",
      selectedRegister: 6,
      registers: [0, 0, 0, 0, 0, 0, 5, 0],
    });
    expect(mapper.readCpuExpansion(0x4101)).toEqual({ value: 1, drivenMask: 0x03 });
    expect(mapper.cpuReadDriveMask(0x6101)).toBe(0x03);
  });

  it("maps all four ASIC nametable arrangements without collapsing flipped-L mode", () => {
    const mapper = new SachenSa015Mapper(createMapper150Cartridge());
    const addresses = [0x2000, 0x2400, 0x2800, 0x2c00];

    for (const [value, expectedPages] of [
      [0, [0, 0, 0, 1]],
      [2, [0, 0, 1, 1]],
      [4, [0, 1, 0, 1]],
      [6, [1, 1, 1, 1]],
    ] as const) {
      writeRegister(mapper, 7, value);
      expect(addresses.map((address) => mapper.mapNametableAddress(address) >>> 10)).toEqual(
        expectedPages,
      );
    }
  });

  it("clears the ASIC only on cold power and preserves it across warm reset", () => {
    const cartridge = createMapper150Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x4100, 5);
    memory.write(0x4101, 3);
    bus.reset();
    expect(memory.read(0x8000)).toBe(3);

    bus.powerOn();
    expect(memory.read(0x8000)).toBe(0);
    expect(bus.Mapper.captureState()).toEqual({
      kind: "sachen-sa015-150",
      selectedRegister: 0,
      registers: [0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it("round-trips all registers and rejects malformed state atomically", () => {
    const mapper = new SachenSa015Mapper(createMapper150Cartridge());
    for (let register = 0; register < 8; register++) writeRegister(mapper, register, register);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, selectedRegister: 8 },
      { ...state, registers: [0, 1] },
      { ...state, registers: [0, 1, 2, 3, 4, 5, 6, 8] },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("accepts physical SA-015 ROM capacities and rejects incompatible boards", () => {
    expect(() => createMapper(createMapper150Cartridge(), interruptPort)).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 150, prgBanks: 2, chrBanks: 1 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 150, nes2: true, prgBanks: 4, chrBanks: 8 }),
        interruptPort,
      ),
    ).not.toThrow();

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 150,
          nes2: true,
          submapper: 1,
          prgBanks: 4,
          chrBanks: 8,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 150, prgRomBytes: 0x18_000, chrBanks: 8 }),
      createTestCartridge({ mapper: 150, prgBanks: 4, chrRomBytes: 0x18_000 }),
      createTestCartridge({ mapper: 150, prgBanks: 4 }),
      createTestCartridge({
        mapper: 150,
        nes2: true,
        prgBanks: 4,
        chrBanks: 8,
        prgRamShift: 7,
      }),
      createTestCartridge({ mapper: 150, prgBanks: 4, chrBanks: 8, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, interruptPort)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper150Cartridge() {
  return createTestCartridge({ mapper: 150, prgBanks: 8, chrBanks: 8 });
}

function writeRegister(mapper: SachenSa015Mapper, register: number, value: number): void {
  mapper.writeCpuExpansion(0x4100, register);
  mapper.writeCpuExpansion(0x4101, value);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
