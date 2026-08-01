import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { Bmc226Mapper } from "./bmc-226-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("Bmc226Mapper", () => {
  it("combines both registers into all seven PRG bank lines and supports both PRG modes", () => {
    const cartridge = createMapper226Cartridge(0x200_000);
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new Bmc226Mapper(cartridge);
    mapper.powerOn();

    mapper.write(0x8000, 0x85);
    mapper.write(0x8001, 0x01);
    expect(readPrgWindows(mapper)).toEqual([100, 101]);

    mapper.write(0x8002, 0xa5);
    expect(readPrgWindows(mapper)).toEqual([101, 101]);
  });

  it("mirrors missing outer lines on 1 MiB images", () => {
    const cartridge = createMapper226Cartridge(0x100_000);
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new Bmc226Mapper(cartridge);

    mapper.write(0x8000, 0xa5);
    mapper.write(0xffff, 0x01);

    expect(readPrgWindows(mapper)).toEqual([37, 37]);
  });

  it("maps the 63-in-1 three-chip outer selectors in physical 0/0/1/2 order", () => {
    const cartridge = createMapper226Cartridge(0x180_000);
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new Bmc226Mapper(cartridge);

    const observed: number[] = [];
    for (const [register0High, register1Low] of [
      [0x00, 0x00],
      [0x80, 0x00],
      [0x00, 0x01],
      [0x80, 0x01],
    ]) {
      mapper.write(0x8000, register0High | 0x20);
      mapper.write(0x8001, register1Low);
      observed.push(mapper.read(0x8000));
    }

    expect(observed).toEqual([0, 0, 32, 64]);
  });

  it("controls mirroring and the documented CHR-RAM write-protect line", () => {
    const cartridge = createMapper226Cartridge();
    const mapper = new Bmc226Mapper(cartridge);
    mapper.powerOn();

    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.write(0x0010, 0x12);
    expect(mapper.read(0x0010)).toBe(0x12);

    mapper.write(0x8000, 0x40);
    mapper.write(0x8001, 0x02);
    mapper.write(0x0010, 0x34);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    expect(mapper.read(0x0010)).toBe(0x12);

    mapper.write(0xffff, 0);
    mapper.write(0x0010, 0x34);
    expect(mapper.read(0x0010)).toBe(0x34);
  });

  it("clears both registers, mirroring and CHR protection on warm reset", () => {
    const cartridge = createMapper226Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x8000, 0xe5);
    memory.write(0x8001, 0x03);
    expect(memory.read(0x8000)).toBe(37);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    bus.reset();

    expect(memory.read(0x8000)).toBe(0);
    expect(memory.read(0xc000)).toBe(1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    expect(bus.Mapper.captureState()).toEqual({ kind: "bmc-226", register0: 0, register1: 0 });
  });

  it("round-trips state and rejects malformed registers atomically", () => {
    const mapper = new Bmc226Mapper(createMapper226Cartridge());
    mapper.write(0x8000, 0xe5);
    mapper.write(0x8001, 0x03);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, register0: 0x100 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, register1: -1 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
  });

  it("accepts complete multicart geometries and rejects unsupported variants and memory", () => {
    for (const prgRomBytes of [0x100_000, 0x180_000, 0x200_000]) {
      expect(() =>
        createMapper(createMapper226Cartridge(prgRomBytes), interruptPort),
      ).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 226,
          nes2: true,
          submapper: 1,
          prgRomBytes: 0x100_000,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 226, prgRomBytes: 0x80_000 }),
      createTestCartridge({ mapper: 226, prgRomBytes: 0x100_000, chrBanks: 1 }),
      createTestCartridge({
        mapper: 226,
        nes2: true,
        prgRomBytes: 0x100_000,
        chrRamShift: 8,
      }),
      createTestCartridge({
        mapper: 226,
        nes2: true,
        prgRomBytes: 0x100_000,
        prgRamShift: 7,
      }),
      createTestCartridge({
        mapper: 226,
        prgRomBytes: 0x100_000,
        battery: true,
      }),
      createTestCartridge({ mapper: 226, prgRomBytes: 0x100_000, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, interruptPort)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper226Cartridge(prgRomBytes = 0x100_000) {
  return createTestCartridge({ mapper: 226, prgRomBytes });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readPrgWindows(mapper: Bmc226Mapper): number[] {
  return [mapper.read(0x8000), mapper.read(0xc000)];
}
