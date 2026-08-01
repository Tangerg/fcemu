import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("JalecoJf13Mapper", () => {
  it("selects one of four 32 KiB PRG banks and eight 8 KiB CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x6000, 0x62);

    expect(mapper.read(0x8000)).toBe(0x42);
    expect(mapper.read(0xffff)).toBe(0x42);
    expect(mapper.read(0x0000)).toBe(0x66);
    expect(mapper.read(0x1fff)).toBe(0x66);
  });

  it("decodes the banking register at $6xxx and its hardware $Exxx mirror", () => {
    const cartridge = createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    for (const address of [0x5000, 0x7000, 0x8000, 0xdfff, 0xf000]) {
      mapper.write(address, 0x73);
      expect(mapper.read(0x8000)).toBe(0x40);
      expect(mapper.read(0x0000)).toBe(0x60);
    }

    mapper.write(0x6fff, 0x31);
    expect(mapper.read(0x8000)).toBe(0x43);
    expect(mapper.read(0x0000)).toBe(0x61);

    mapper.write(0xefff, 0x42);
    expect(mapper.read(0x8000)).toBe(0x40);
    expect(mapper.read(0x0000)).toBe(0x66);
  });

  it("leaves $6000-$7FFF reads open while PRG ROM continues to drive $E000-$FFFF", () => {
    const cartridge = createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8 });
    cartridge.prgRom.fill(0x3c);
    const bus = new Bus(cartridge);
    bus.RAM[0] = 0xa5;
    bus.CPU.readByte(0);

    expect(bus.CPU.readByte(0x6000)).toBe(0xa5);
    expect(bus.CPU.readByte(0x7fff)).toBe(0xa5);
    expect(bus.CPU.readByte(0xe000)).toBe(0x3c);
    expect(bus.CPU.readByte(0xffff)).toBe(0x3c);
  });

  it("round-trips bank state and validates every captured bank", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    mapper.write(0x6000, 0x73);
    const state = mapper.captureState();

    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedPrgBank: 0, selectedChrBank: 0 });
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, selectedPrgBank: 4 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, selectedChrBank: 8 } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it("accepts only the physical JF-13 ROM geometry and base submapper", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 86, prgBanks: 2, chrBanks: 4 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 4 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 86, prgBanks: 8, nes2: true, chrRamShift: 10 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8, fourScreen: true }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 86,
          prgBanks: 8,
          chrBanks: 8,
          nes2: true,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 86, prgBanks: 8, chrBanks: 8, nes2: true, submapper: 1 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < 4; bank++) {
    cartridge.prgRom.fill(0x40 + bank, bank * 0x8000, (bank + 1) * 0x8000);
  }
  for (let bank = 0; bank < 8; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}
