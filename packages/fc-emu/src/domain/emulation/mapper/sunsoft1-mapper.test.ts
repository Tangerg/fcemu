import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";
import { UnsupportedMapperConfigurationError } from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("Sunsoft1Mapper", () => {
  it("keeps 32 KiB PRG fixed and selects two independently wired 4 KiB CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 4 });
    fillChrBanks(cartridge.chrRom);
    cartridge.prgRom[0] = 0x35;
    cartridge.prgRom[0x7fff] = 0x36;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x6000, 0x21);

    expect(mapper.read(0x8000)).toBe(0x35);
    expect(mapper.read(0xffff)).toBe(0x36);
    expect(mapper.read(0)).toBe(0x71);
    expect(mapper.read(0x1000)).toBe(0x76);
  });

  it("hard-wires the upper CHR half high and mirrors it on 16 KiB ROMs", () => {
    const cartridge = createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 2 });
    fillChrBanks(cartridge.chrRom);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x7fff, 0x21);

    expect(mapper.read(0)).toBe(0x71);
    expect(mapper.read(0x1000)).toBe(0x72);
  });

  it("ignores register writes outside $6000-$7FFF", () => {
    const cartridge = createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 4 });
    fillChrBanks(cartridge.chrRom);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x5fff, 0x21);
    mapper.write(0x8000, 0x21);

    expect(mapper.read(0)).toBe(0x70);
    expect(mapper.read(0x1000)).toBe(0x74);
  });

  it("leaves reads from its write-only register window on open bus", () => {
    const bus = new Bus(createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 2 }));
    bus.RAM[0] = 0x5a;
    bus.CPU.readByte(0);

    expect(bus.CPU.readByte(0x6000)).toBe(0x5a);
    expect(bus.CPU.readByte(0x7fff)).toBe(0x5a);
  });

  it("round-trips bank state and rejects an unreachable upper bank", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 4 }),
      interruptPort,
    );
    mapper.write(0x6000, 0x21);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({ ...state, selectedChrBank1: 1 } as MapperState),
    ).toThrowError(RangeError);
  });

  it("accepts only the PRG and CHR ROM geometries used by Sunsoft-1", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 184, prgBanks: 4, chrBanks: 4 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 184, prgBanks: 2, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillChrBanks(chrRom: Uint8Array): void {
  for (let bank = 0; bank < chrRom.byteLength / 0x1000; bank++) {
    chrRom.fill(0x70 + bank, bank * 0x1000, (bank + 1) * 0x1000);
  }
}
