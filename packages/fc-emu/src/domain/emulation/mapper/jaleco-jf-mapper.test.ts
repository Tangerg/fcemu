import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";
import { UnsupportedMapperConfigurationError } from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("JalecoJfMapper", () => {
  it("selects 32 KiB PRG and 8 KiB CHR banks from the $6000 register", () => {
    const cartridge = createTestCartridge({ mapper: 140, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x6000, 0x2d);

    expect(mapper.read(0x8000)).toBe(0x42);
    expect(mapper.read(0xffff)).toBe(0x42);
    expect(mapper.read(0)).toBe(0x6d);
    expect(mapper.read(0x1fff)).toBe(0x6d);
  });

  it("decodes writes only throughout $6000-$7FFF", () => {
    const cartridge = createTestCartridge({ mapper: 140, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x5fff, 0x1a);
    mapper.write(0x8000, 0x1a);
    expect(mapper.read(0x8000)).toBe(0x40);
    expect(mapper.read(0)).toBe(0x60);

    mapper.write(0x7fff, 0x1a);
    expect(mapper.read(0x8000)).toBe(0x41);
    expect(mapper.read(0)).toBe(0x6a);
  });

  it("leaves reads from its write-only register window on open bus", () => {
    const bus = new Bus(createTestCartridge({ mapper: 140, prgBanks: 2, chrBanks: 1 }));
    bus.RAM[0] = 0xa5;
    bus.CPU.readByte(0);

    expect(bus.CPU.readByte(0x6000)).toBe(0xa5);
    expect(bus.CPU.readByte(0x7fff)).toBe(0xa5);
  });

  it("round-trips bank state and rejects unreachable banks", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 140, prgBanks: 8, chrBanks: 16 }),
      interruptPort,
    );
    mapper.write(0x6000, 0x2d);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, selectedPrgBank: 4 } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it("rejects board geometries that its address lines cannot decode", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 140, prgBanks: 16, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 140, prgBanks: 2 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 140, prgRomBytes: 0x18_000, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 140, prgBanks: 2, chrRomBytes: 0x6000 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < cartridge.prgRom.byteLength / 0x8000; bank++) {
    cartridge.prgRom.fill(0x40 + bank, bank * 0x8000, (bank + 1) * 0x8000);
  }
  for (let bank = 0; bank < cartridge.chrRom.byteLength / 0x2000; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}
