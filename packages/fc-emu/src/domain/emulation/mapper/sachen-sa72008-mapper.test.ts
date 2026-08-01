import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";
import { SachenSa72008Mapper } from "./sachen-sa72008-mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("SachenSa72008Mapper", () => {
  it("routes D2 to the 32 KiB PRG line and D1-D0 to the 8 KiB CHR lines", () => {
    const cartridge = createMapper133Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new SachenSa72008Mapper(cartridge);

    mapper.writeCpuExpansion(0x4120, 0x07);
    expect(mapper.read(0x8000)).toBe(1);
    expect(mapper.read(0xffff)).toBe(1);
    expect(mapper.read(0x0000)).toBe(3);
    expect(mapper.read(0x1fff)).toBe(3);
  });

  it("decodes only $4100 pages selected by the complete $E100 mask", () => {
    const cartridge = createMapper133Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new SachenSa72008Mapper(cartridge);

    for (const address of [0x4100, 0x4120, 0x41ff, 0x4300, 0x5f00, 0x5fff]) {
      mapper.writeCpuExpansion(address, 0x04);
      expect(mapper.read(0x8000)).toBe(1);
      mapper.writeCpuExpansion(0x4100, 0);
    }

    for (const address of [0x4000, 0x4200, 0x6000, 0x6100]) {
      mapper.writeCpuExpansion(address, 0x04);
      expect(mapper.read(0x8000)).toBe(0);
    }
    mapper.write(0x8000, 0x04);
    expect(mapper.read(0x8000)).toBe(0);
  });

  it("retains the full physical latch while leaving reads open and mirroring hardwired", () => {
    const cartridge = createMapper133Cartridge();
    const mapper = new SachenSa72008Mapper(cartridge);
    mapper.writeCpuExpansion(0x4120, 0xff);

    expect(mapper.captureState()).toEqual({ kind: "sachen-sa72008-133", register: 0xff });
    expect(mapper.cpuReadDriveMask(0x5fff)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    const memory = new CPUMemory(new Bus(cartridge));
    memory.write(0x4120, 0x07);
    memory.write(0x4000, 0xa5);
    expect(memory.read(0x4120)).toBe(0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
  });

  it("clears the latch only on cold power and preserves it across warm reset", () => {
    const cartridge = createMapper133Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x4120, 0x04);
    bus.reset();
    expect(memory.read(0x8000)).toBe(1);

    bus.powerOn();
    expect(memory.read(0x8000)).toBe(0);
    expect(bus.Mapper.captureState()).toEqual({ kind: "sachen-sa72008-133", register: 0 });
  });

  it("round-trips the latch and rejects malformed state atomically", () => {
    const mapper = new SachenSa72008Mapper(createMapper133Cartridge());
    mapper.writeCpuExpansion(0x4120, 0xa7);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const register of [-1, 0x100, 1.5, Number.NaN]) {
      expect(() => mapper.restoreState({ ...state, register } as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("accepts SA-72008 capacities and rejects incompatible mapper variants", () => {
    expect(() => createMapper(createMapper133Cartridge(), interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 133, nes2: true, prgBanks: 2, chrBanks: 1 }),
        interruptPort,
      ),
    ).not.toThrow();

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 133,
          nes2: true,
          submapper: 1,
          prgBanks: 4,
          chrBanks: 4,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 133, prgRomBytes: 0x18_000, chrBanks: 4 }),
      createTestCartridge({ mapper: 133, prgBanks: 4, chrRomBytes: 0x6000 }),
      createTestCartridge({ mapper: 133, prgBanks: 4 }),
      createTestCartridge({
        mapper: 133,
        nes2: true,
        prgBanks: 4,
        chrBanks: 4,
        prgRamShift: 7,
      }),
      createTestCartridge({ mapper: 133, prgBanks: 4, chrBanks: 4, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, interruptPort)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper133Cartridge() {
  return createTestCartridge({ mapper: 133, prgBanks: 4, chrBanks: 4 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
