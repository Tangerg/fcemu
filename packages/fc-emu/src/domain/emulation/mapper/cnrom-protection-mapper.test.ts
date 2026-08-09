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

describe("CnromProtectionMapper", () => {
  it.each([4, 5, 6, 7])(
    "uses NES 2.0 submapper %i to identify the CHR-ROM enable value",
    (submapper) => {
      const cartridge = createTestCartridge({
        mapper: 185,
        nes2: true,
        submapper,
        prgBanks: 2,
        chrBanks: 1,
      });
      cartridge.prgRom[0] = 0xff;
      cartridge.chrRom[0x0155] = 0xa6;
      const bus = new Bus(cartridge);
      const ppuMemory = new PPUMemory(bus);
      const enabledChip = submapper - 4;

      expect(ppuMemory.read(0x0155)).toBe(enabledChip === 0 ? 0xa6 : 0x55);

      bus.Mapper.write(0x8000, enabledChip);
      expect(ppuMemory.read(0x0155)).toBe(0xa6);

      bus.Mapper.write(0x8000, (enabledChip + 1) & 0x03);
      expect(ppuMemory.read(0x0155)).toBe(0x55);
    },
  );

  it("pulls D0 high while disabled and leaves the other PPU data lines open", () => {
    const cartridge = createTestCartridge({
      mapper: 185,
      nes2: true,
      submapper: 5,
      prgBanks: 2,
      chrBanks: 1,
    });
    const bus = new Bus(cartridge);
    const ppuMemory = new PPUMemory(bus);

    expect(bus.Mapper.ppuReadDriveMask?.(0x0000)).toBe(0x01);
    expect(ppuMemory.read(0x0000)).toBe(0x01);
    expect(ppuMemory.read(0x0154)).toBe(0x55);
    expect(ppuMemory.read(0x0155)).toBe(0x55);
  });

  it("always applies CNROM's AND bus conflict before latching chip select", () => {
    const cartridge = createTestCartridge({
      mapper: 185,
      nes2: true,
      submapper: 6,
      prgBanks: 2,
      chrBanks: 1,
    });
    cartridge.prgRom[0] = 0x01;
    cartridge.prgRom[1] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0x02);
    expect(mapper.ppuReadDriveMask?.(0)).toBe(0x01);

    mapper.write(0x8001, 0x02);
    expect(mapper.ppuReadDriveMask?.(0)).toBe(0xff);
  });

  it("keeps PRG fixed and mirrors a 16 KiB image", () => {
    const cartridge = createTestCartridge({
      mapper: 185,
      nes2: true,
      submapper: 4,
      prgBanks: 1,
      chrBanks: 1,
    });
    cartridge.prgRom[0] = 0x31;
    cartridge.prgRom[0x3fff] = 0x42;
    const mapper = createMapper(cartridge, interruptPort);

    expect(mapper.read(0x8000)).toBe(0x31);
    expect(mapper.read(0xc000)).toBe(0x31);
    expect(mapper.read(0xbfff)).toBe(0x42);
    expect(mapper.read(0xffff)).toBe(0x42);
  });

  it("round-trips its latch and rejects an invalid state", () => {
    const cartridge = createTestCartridge({
      mapper: 185,
      nes2: true,
      submapper: 7,
      chrBanks: 1,
    });
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);
    mapper.write(0x8000, 3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, selectedChip: 4 } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it("fails closed for unknown chip-select variants and impossible board memory", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 185, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 185, nes2: true, submapper: 0, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 185,
          nes2: true,
          submapper: 4,
          prgBanks: 3,
          chrBanks: 1,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 185,
          nes2: true,
          submapper: 4,
          chrBanks: 2,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 185,
          nes2: true,
          submapper: 4,
          prgRamShift: 7,
          chrBanks: 1,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});
