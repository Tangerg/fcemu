import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { CeFongShenBangMapper } from "./ce-fong-shen-bang-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("CeFongShenBangMapper", () => {
  it("maps four independent 8 KiB PRG registers and their repeated write decode", () => {
    const cartridge = createMapper246Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new CeFongShenBangMapper(cartridge);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([63, 63, 63, 63]);

    mapper.write(0x6000, 1);
    mapper.write(0x6009, 2);
    mapper.write(0x6012, 3);
    mapper.write(0x601b, 4);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([1, 2, 3, 4]);
  });

  it("maps four independent 2 KiB CHR registers and ignores CHR-ROM writes", () => {
    const cartridge = createMapper246Cartridge();
    fillBanks(cartridge.chrRom, 0x0800);
    const mapper = new CeFongShenBangMapper(cartridge);

    mapper.write(0x6004, 4);
    mapper.write(0x600d, 5);
    mapper.write(0x6016, 6);
    mapper.write(0x601f, 7);
    expect(readAt(mapper, [0x0000, 0x0800, 0x1000, 0x1800])).toEqual([4, 5, 6, 7]);

    mapper.write(0x0000, 0xaa);
    expect(mapper.read(0x0000)).toBe(4);
  });

  it("forces PRG A17 only for the sixteen traced high-address aliases", () => {
    const cartridge = createMapper246Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new CeFongShenBangMapper(cartridge);
    mapper.write(0x6000, 2);
    mapper.write(0x6003, 2);

    const aliases = new Set([
      0xffe4, 0xffe5, 0xffe6, 0xffe7, 0xffec, 0xffed, 0xffee, 0xffef, 0xfff4, 0xfff5, 0xfff6,
      0xfff7, 0xfffc, 0xfffd, 0xfffe, 0xffff,
    ]);
    for (let address = 0xffe0; address <= 0xffff; address++) {
      expect(mapper.read(address), `$${address.toString(16)}`).toBe(aliases.has(address) ? 18 : 2);
    }
    expect(mapper.read(0x9fe4)).toBe(2);
  });

  it("maps exactly 2 KiB of WRAM at $6800-$6FFF and leaves both gaps open", () => {
    const bus = new Bus(createMapper246Cartridge());
    const memory = new CPUMemory(bus);

    memory.write(0x6800, 0x12);
    memory.write(0x6fff, 0x34);
    expect(memory.read(0x6800)).toBe(0x12);
    expect(memory.read(0x6fff)).toBe(0x34);
    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x67ff)).toBe(0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x6800)).toBe(0xff);
    expect(bus.Mapper.cpuReadDriveMask?.(0x6fff)).toBe(0xff);
    expect(bus.Mapper.cpuReadDriveMask?.(0x7000)).toBe(0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x7fff)).toBe(0);

    memory.write(0x0000, 0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
    memory.write(0x0000, 0x5a);
    expect(memory.read(0x7000)).toBe(0x5a);
  });

  it("retains register files and WRAM across warm reset but restores cold-power bits", () => {
    const bus = new Bus(createMapper246Cartridge());
    bus.Mapper.write(0x6000, 3);
    bus.Mapper.write(0x6004, 4);
    bus.Mapper.write(0x6800, 0x55);
    const beforeReset = bus.Mapper.captureState();

    bus.reset();
    expect(bus.Mapper.captureState()).toEqual(beforeReset);
    expect(bus.Mapper.read(0x6800)).toBe(0x55);

    bus.powerOn();
    expect(bus.Mapper.captureState()).toMatchObject({
      kind: "ce-fong-shen-bang-246",
      prgBanks: [0xff, 0xff, 0xff, 0xff],
      chrBanks: [0xff, 0xff, 0xff, 0xff],
    });
  });

  it("round-trips raw bank registers and rejects malformed state atomically", () => {
    const mapper = new CeFongShenBangMapper(createMapper246Cartridge());
    for (let register = 0; register < 4; register++) {
      mapper.write(0x6000 + register, 0x40 + register);
      mapper.write(0x6004 + register, 0x80 + register);
    }
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgBanks: [0, 1, 2] },
      { ...state, chrBanks: [0, 1, 2, 3, 4] },
      { ...state, prgBanks: [0, 1, 2, 256] },
      { ...state, chrBanks: [0, 1, 2, 3.5] },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it.each([
    {
      name: "legacy 8 KiB allocation mapped through the 2 KiB board window",
      cartridge: createMapper246Cartridge(),
    },
    {
      name: "NES 2.0 volatile 2 KiB WRAM",
      cartridge: createTestCartridge({
        mapper: 246,
        nes2: true,
        prgBanks: 32,
        chrBanks: 64,
        prgRamShift: 5,
      }),
    },
    {
      name: "NES 2.0 battery-backed 2 KiB NVRAM",
      cartridge: createTestCartridge({
        mapper: 246,
        nes2: true,
        prgBanks: 32,
        chrBanks: 64,
        prgNvRamShift: 5,
        battery: true,
      }),
    },
  ])("accepts the physical ROM geometry with $name", ({ cartridge }) => {
    expect(() => createMapper(cartridge, interruptPort)).not.toThrow();
  });

  it.each([
    {
      name: "unknown submapper",
      options: {
        mapper: 246,
        nes2: true,
        submapper: 1,
        prgBanks: 32,
        chrBanks: 64,
        prgRamShift: 5,
      },
      error: UnsupportedMapperVariantError,
    },
    {
      name: "smaller PRG ROM",
      options: { mapper: 246, prgBanks: 31, chrBanks: 64 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "smaller CHR ROM",
      options: { mapper: 246, prgBanks: 32, chrBanks: 63 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "CHR RAM",
      options: { mapper: 246, prgBanks: 32 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "missing NES 2.0 WRAM",
      options: { mapper: 246, nes2: true, prgBanks: 32, chrBanks: 64 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "4 KiB NES 2.0 WRAM",
      options: {
        mapper: 246,
        nes2: true,
        prgBanks: 32,
        chrBanks: 64,
        prgRamShift: 6,
      },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "mixed NES 2.0 RAM and NVRAM",
      options: {
        mapper: 246,
        nes2: true,
        prgBanks: 32,
        chrBanks: 64,
        prgRamShift: 5,
        prgNvRamShift: 5,
        battery: true,
      },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 246, prgBanks: 32, chrBanks: 64, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), interruptPort)).toThrowError(error);
  });

  it("retains hardwired header mirroring", () => {
    const cartridge = createMapper246Cartridge();
    const mapper = createMapper(cartridge, interruptPort);
    mapper.write(0x6000, 0xaa);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });
});

function createMapper246Cartridge() {
  return createTestCartridge({ mapper: 246, prgBanks: 32, chrBanks: 64 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: CeFongShenBangMapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
