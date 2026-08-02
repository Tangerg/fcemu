import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";
import { OekaKidsMapper } from "./oeka-kids-mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("OekaKidsMapper", () => {
  it("switches four 32 KiB PRG banks through an AND bus conflict", () => {
    const cartridge = createOekaKidsCartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    cartridge.prgRom[0x1000] = 0x05;
    const mapper = new OekaKidsMapper(cartridge);

    mapper.write(0x9000, 0x07);

    expect(mapper.read(0x8000)).toBe(1);
    expect(mapper.captureState()).toMatchObject({ register: 5 });
  });

  it("latches the lower CHR half only on an address-bus transition into $2xxx", () => {
    const mapper = new OekaKidsMapper(createOekaKidsCartridge());

    mapper.observePpuAddress(0x1200);
    mapper.observePpuAddress(0x2200);
    expect(mapper.captureState()).toMatchObject({ innerChrBank: 2 });

    mapper.observePpuAddress(0x2300);
    expect(mapper.captureState()).toMatchObject({ innerChrBank: 2 });

    mapper.observePpuAddress(0x3000);
    mapper.observePpuAddress(0x2300);
    expect(mapper.captureState()).toMatchObject({ innerChrBank: 3 });
  });

  it("projects CPU PPUADDR writes onto the cartridge address-line latch", () => {
    const bus = new Bus(createOekaKidsCartridge());

    bus.PPU.writeRegister(0x2006, 0x22);
    bus.PPU.writeRegister(0x2006, 0x00);

    expect(bus.Mapper.captureState()).toMatchObject({ innerChrBank: 2, lastPpuAddress: 0x2200 });
  });

  it("maps the latched lower and semi-fixed upper 4 KiB CHR-RAM banks", () => {
    const cartridge = createOekaKidsCartridge();
    cartridge.prgRom[0] = 0xff;
    const mapper = new OekaKidsMapper(cartridge);

    mapper.observePpuAddress(0x2200);
    mapper.write(0x0004, 0x22);
    mapper.write(0x1005, 0x33);
    mapper.write(0x8000, 0x04);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2100);
    mapper.write(0x0004, 0x51);
    mapper.write(0x1005, 0x73);

    mapper.write(0x8000, 0x00);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2200);
    expect(mapper.read(0x0004)).toBe(0x22);
    expect(mapper.read(0x1005)).toBe(0x33);

    mapper.write(0x8000, 0x04);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2100);
    expect(mapper.read(0x0004)).toBe(0x51);
    expect(mapper.read(0x1005)).toBe(0x73);
  });

  it("forces the board's hardwired vertical mirroring on power-on and restore", () => {
    const cartridge = createOekaKidsCartridge();
    const mapper = new OekaKidsMapper(cartridge);
    const state = mapper.captureState();

    cartridge.mirroringMode = NametableMirroring.SingleScreenLower;
    mapper.restoreState(state);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    cartridge.mirroringMode = NametableMirroring.Horizontal;
    mapper.powerOn();
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("round-trips all latches and rejects invalid state transaction inputs", () => {
    const cartridge = createOekaKidsCartridge();
    cartridge.prgRom[0] = 0xff;
    const mapper = new OekaKidsMapper(cartridge);
    mapper.write(0x8000, 6);
    mapper.observePpuAddress(0x2300);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, register: 8 } as MapperState)).toThrow(RangeError);
    expect(() => mapper.restoreState({ ...state, lastPpuAddress: 0x4000 } as MapperState)).toThrow(
      RangeError,
    );
  });

  it("keeps the absent PRG-RAM range electrically open", () => {
    const mapper = new OekaKidsMapper(createOekaKidsCartridge());

    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
  });

  it("accepts only the documented board geometry", () => {
    const legacyCartridge = createOekaKidsCartridge();
    expect(legacyCartridge).toMatchObject({ prgRamBytes: 0, prgNvRamBytes: 0 });
    expect(() => createMapper(legacyCartridge, interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 96, nes2: true, prgBanks: 8, chrRamShift: 9 }),
        interruptPort,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 96,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrRamShift: 9,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 96, prgBanks: 4 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 96, nes2: true, prgBanks: 8, chrRamShift: 8 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 96, prgBanks: 8, chrBanks: 4 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 96,
          nes2: true,
          prgBanks: 8,
          chrRamShift: 9,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 96, prgBanks: 8, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function createOekaKidsCartridge() {
  return createTestCartridge({ mapper: 96, prgBanks: 8 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
