import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import { IremLrog017Mapper } from "./irem-lrog017-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("IremLrog017Mapper", () => {
  it("switches 32 KiB PRG and 2 KiB CHR-ROM banks through one conflicted latch", () => {
    const cartridge = createLrog017Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x0800);
    cartridge.prgRom[0x1000] = 0xff;
    const mapper = new IremLrog017Mapper(cartridge);

    mapper.write(0x9000, 0xb2);

    expect(mapper.read(0x8000)).toBe(2);
    expect(mapper.read(0x0000)).toBe(11);
  });

  it("applies the currently selected PRG byte as an AND bus conflict", () => {
    const cartridge = createLrog017Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x0800);
    cartridge.prgRom[0x1000] = 0x31;
    const mapper = new IremLrog017Mapper(cartridge);

    mapper.write(0x9000, 0xf7);

    expect(mapper.captureState()).toMatchObject({ prgBank: 1, chrRomBank: 3 });
  });

  it("keeps three fixed writable 2 KiB pattern banks separate from CHR ROM", () => {
    const cartridge = createLrog017Cartridge();
    cartridge.prgRom[0] = 0xff;
    cartridge.chrRom[0] = 0x31;
    const mapper = new IremLrog017Mapper(cartridge);

    mapper.write(0x0000, 0xaa);
    mapper.write(0x0800, 0x41);
    mapper.write(0x1000, 0x42);
    mapper.write(0x1800, 0x43);
    mapper.write(0x8000, 0x10);

    expect(mapper.read(0x0000)).toBe(0);
    mapper.write(0x8000, 0x00);
    expect(mapper.read(0x0000)).toBe(0x31);
    expect([0x0800, 0x1000, 0x1800].map((address) => mapper.read(address))).toEqual([
      0x41, 0x42, 0x43,
    ]);
  });

  it("routes cartridge RAM, CIRAM and open bus as three distinct nametable owners", () => {
    const bus = new Bus(createLrog017Cartridge());
    bus.PPU.write(0x2004, 0x21);
    bus.PPU.write(0x2404, 0x22);
    bus.PPU.write(0x2804, 0x23);
    bus.PPU.write(0x2c04, 0x24);
    bus.PPU.write(0x3004, 0xff);

    expect([0x2004, 0x2404, 0x2804, 0x2c04].map((address) => bus.PPU.read(address))).toEqual([
      0x21, 0x22, 0x23, 0x24,
    ]);
    expect(bus.PPU.read(0x3004)).toBe(0x04);
    expect(bus.PPU.read(0x2004)).toBe(0x21);
  });

  it("power-on and restore force the physical four-screen arrangement", () => {
    const cartridge = createLrog017Cartridge();
    const mapper = new IremLrog017Mapper(cartridge);
    const state = mapper.captureState();

    cartridge.mirroringMode = NametableMirroring.Horizontal;
    mapper.restoreState(state);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.FourScreen);

    cartridge.mirroringMode = NametableMirroring.Vertical;
    mapper.powerOn();
    expect(cartridge.mirroringMode).toBe(NametableMirroring.FourScreen);
  });

  it("round-trips bank state and rejects invalid bank values", () => {
    const cartridge = createLrog017Cartridge();
    cartridge.prgRom[0] = 0xff;
    const mapper = new IremLrog017Mapper(cartridge);
    mapper.write(0x8000, 0x32);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, prgBank: 4 } as MapperState)).toThrow(RangeError);
    expect(() => mapper.restoreState({ ...state, chrRomBank: 16 } as MapperState)).toThrow(
      RangeError,
    );
  });

  it("keeps the absent PRG-RAM range electrically open", () => {
    const mapper = new IremLrog017Mapper(createLrog017Cartridge());

    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
  });

  it("accepts only the singleton LROG017 hardware geometry", () => {
    const legacyCartridge = createLrog017Cartridge();
    expect(legacyCartridge).toMatchObject({ prgRamBytes: 0, prgNvRamBytes: 0 });
    expect(() => createMapper(legacyCartridge, interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 77,
          nes2: true,
          prgBanks: 8,
          chrBanks: 4,
          chrRamShift: 7,
          fourScreen: true,
        }),
        interruptPort,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 77,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 4,
          chrRamShift: 7,
          fourScreen: true,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 77, prgBanks: 4, chrBanks: 4, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 77, prgBanks: 8, chrBanks: 2, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 77, prgBanks: 8, chrBanks: 4 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 77,
          nes2: true,
          prgBanks: 8,
          chrBanks: 4,
          chrRamShift: 6,
          fourScreen: true,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 77,
          nes2: true,
          prgBanks: 8,
          chrBanks: 4,
          chrRamShift: 7,
          prgRamShift: 7,
          fourScreen: true,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function createLrog017Cartridge() {
  return createTestCartridge({ mapper: 77, prgBanks: 8, chrBanks: 4, fourScreen: true });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
