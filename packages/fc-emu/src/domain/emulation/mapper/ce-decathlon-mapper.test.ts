import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { CeDecathlonMapper } from "./ce-decathlon-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

const PRG_PERMUTATIONS = [
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [0, 2, 1, 3],
  [3, 1, 2, 0],
] as const;

const CHR_PERMUTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 2, 1, 3, 4, 6, 5, 7],
  [0, 1, 4, 5, 2, 3, 6, 7],
  [0, 4, 1, 5, 2, 6, 3, 7],
  [0, 4, 2, 6, 1, 5, 3, 7],
  [0, 2, 4, 6, 1, 3, 5, 7],
  [7, 6, 5, 4, 3, 2, 1, 0],
  [7, 6, 5, 4, 3, 2, 1, 0],
] as const;

describe("CeDecathlonMapper", () => {
  it("maps every PRG selector through the four hardware permutations", () => {
    const cartridge = createMapper244Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new CeDecathlonMapper(cartridge);

    for (let permutation = 0; permutation < PRG_PERMUTATIONS.length; permutation++) {
      for (let selector = 0; selector < 4; selector++) {
        mapper.write(0x8000, (permutation << 4) | selector);
        expect(mapper.read(0x8000)).toBe(PRG_PERMUTATIONS[permutation]?.[selector]);
      }
    }
  });

  it("maps every CHR selector through the eight hardware permutations", () => {
    const cartridge = createMapper244Cartridge();
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new CeDecathlonMapper(cartridge);

    for (let permutation = 0; permutation < CHR_PERMUTATIONS.length; permutation++) {
      for (let selector = 0; selector < 8; selector++) {
        mapper.write(0xffff, (permutation << 4) | 0x08 | selector);
        expect(mapper.read(0x0000)).toBe(CHR_PERMUTATIONS[permutation]?.[selector]);
      }
    }
  });

  it("keeps the independent PRG and CHR outputs and ignores disconnected data bits", () => {
    const cartridge = createMapper244Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new CeDecathlonMapper(cartridge);

    mapper.write(0x8000, 0x31);
    mapper.write(0x8000, 0xf1);
    expect(mapper.read(0x8000)).toBe(1);

    mapper.write(0x8000, 0x7b);
    mapper.write(0x8000, 0xfb);
    expect(mapper.read(0x8000)).toBe(1);
    expect(mapper.read(0x0000)).toBe(4);

    mapper.write(0x7fff, 0x02);
    expect(mapper.read(0x8000)).toBe(1);
    expect(mapper.read(0x0000)).toBe(4);
  });

  it("leaves the lower CPU range open and retains hardwired header mirroring", () => {
    const cartridge = createMapper244Cartridge();
    const mapper = new CeDecathlonMapper(cartridge);
    expect(mapper.cpuReadDriveMask(0x5fff)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    const memory = new CPUMemory(new Bus(cartridge));
    memory.write(0x4000, 0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
  });

  it("clears both outputs only on cold power and preserves them across warm reset", () => {
    const cartridge = createMapper244Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x8000, 0x31);
    memory.write(0x8000, 0xfb);
    bus.reset();
    expect(memory.read(0x8000)).toBe(1);
    expect(bus.Mapper.read(0)).toBe(4);

    bus.powerOn();
    expect(memory.read(0x8000)).toBe(0);
    expect(bus.Mapper.read(0)).toBe(0);
  });

  it("round-trips both bank outputs and rejects malformed state atomically", () => {
    const mapper = new CeDecathlonMapper(createMapper244Cartridge());
    mapper.write(0x8000, 0x31);
    mapper.write(0x8000, 0xfb);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, selectedPrgBank: 4 },
      { ...state, selectedChrBank: 8 },
      { ...state, selectedPrgBank: 1.5 },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("accepts only the known Decathlon board geometry", () => {
    expect(() => createMapper(createMapper244Cartridge(), interruptPort)).not.toThrow();

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 244,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 8,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 244, prgBanks: 4, chrBanks: 8 }),
      createTestCartridge({ mapper: 244, prgBanks: 8, chrBanks: 4 }),
      createTestCartridge({ mapper: 244, prgBanks: 8 }),
      createTestCartridge({
        mapper: 244,
        nes2: true,
        prgBanks: 8,
        chrBanks: 8,
        prgRamShift: 7,
      }),
      createTestCartridge({ mapper: 244, prgBanks: 8, chrBanks: 8, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, interruptPort)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper244Cartridge() {
  return createTestCartridge({ mapper: 244, prgBanks: 8, chrBanks: 8 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
