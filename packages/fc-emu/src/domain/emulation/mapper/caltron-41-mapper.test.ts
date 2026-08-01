import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { Caltron41Mapper } from "./caltron-41-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const noopInterrupt = { setMapperIrq() {} };

describe("Caltron41Mapper", () => {
  it("powers up on PRG/CHR bank zero with vertical mirroring", () => {
    const cartridge = createCaltronCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new Caltron41Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0);
    expect(mapper.read(0x0000)).toBe(0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("derives PRG, outer CHR and mirroring outputs from $6000-$67FF address lines", () => {
    const cartridge = createCaltronCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new Caltron41Mapper(cartridge);

    mapper.write(0x603b, 0xff);
    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.read(0x0000)).toBe(12);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    const state = mapper.captureState();
    mapper.write(0x6804, 0);
    mapper.write(0x5fff, 0);
    expect(mapper.captureState()).toEqual(state);
  });

  it("gates the conflicted inner CHR latch with outer PRG bit 2", () => {
    const cartridge = createCaltronCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new Caltron41Mapper(cartridge);

    mapper.write(0x6000, 0);
    mapper.write(0x8000, 3);
    expect(mapper.read(0x0000)).toBe(0);

    mapper.write(0x6004, 0);
    cartridge.prgRom[4 * 0x8000] = 0x02;
    mapper.write(0x8000, 3);
    expect(mapper.read(0x0000)).toBe(2);

    cartridge.prgRom[4 * 0x8000 + 1] = 0x01;
    mapper.write(0x8001, 3);
    expect(mapper.read(0x0000)).toBe(1);
  });

  it("combines retained inner CHR bits with each newly selected outer block", () => {
    const cartridge = createCaltronCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new Caltron41Mapper(cartridge);

    mapper.write(0x6004, 0);
    cartridge.prgRom[4 * 0x8000] = 3;
    mapper.write(0x8000, 3);
    expect(mapper.read(0x0000)).toBe(3);

    mapper.write(0x601c, 0);
    expect(mapper.read(0x0000)).toBe(15);
  });

  it("leaves the outer register range open on CPU reads", () => {
    const bus = new Bus(createCaltronCartridge());
    const memory = new CPUMemory(bus);

    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    memory.write(0x0000, 0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
    memory.write(0x0000, 0x5a);
    expect(memory.read(0x67ff)).toBe(0x5a);
  });

  it("round-trips both latches and rejects malformed state atomically", () => {
    const cartridge = createCaltronCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new Caltron41Mapper(cartridge);
    mapper.write(0x603c, 0);
    cartridge.prgRom[4 * 0x8000] = 3;
    mapper.write(0x8000, 3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, outerLatch: -1 },
      { ...state, outerLatch: 0x40 },
      { ...state, innerChrBank: 4 },
      { ...state, innerChrBank: 1.5 },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("clears both latches and selects vertical mirroring on warm reset", () => {
    const bus = new Bus(createCaltronCartridge());
    bus.Mapper.write(0x603c, 0);
    bus.Mapper.write(0x8000, 3);

    bus.reset();
    expect(bus.Mapper.captureState()).toEqual({
      kind: "caltron-41",
      outerLatch: 0,
      innerChrBank: 0,
    });
    expect(bus.Cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it.each([
    { name: "local Aladdin 3 mirror geometry", prgBanks: 2, chrBanks: 4 },
    { name: "fully populated Caltron 6-in-1", prgBanks: 16, chrBanks: 16 },
  ])("accepts the $name", ({ prgBanks, chrBanks }) => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 41, prgBanks, chrBanks }), noopInterrupt),
    ).not.toThrow();
  });

  it.each([
    {
      name: "unknown submapper",
      options: { mapper: 41, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 16 },
      error: UnsupportedMapperVariantError,
    },
    {
      name: "non-power-of-two PRG ROM",
      options: { mapper: 41, nes2: true, prgRomBytes: 0x18_000, chrBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "512 KiB PRG ROM",
      options: { mapper: 41, prgBanks: 32, chrBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "CHR RAM",
      options: { mapper: 41, prgBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "256 KiB CHR ROM",
      options: { mapper: 41, prgBanks: 16, chrBanks: 32 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "NES 2.0 PRG RAM",
      options: { mapper: 41, nes2: true, prgBanks: 16, chrBanks: 16, prgRamShift: 7 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "legacy battery memory",
      options: { mapper: 41, prgBanks: 16, chrBanks: 16, battery: true },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 41, prgBanks: 16, chrBanks: 16, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(error);
  });
});

function createCaltronCartridge() {
  return createTestCartridge({ mapper: 41, prgBanks: 16, chrBanks: 16 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
