import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";
import { UnsupportedMapperConfigurationError } from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("Sunsoft2Mapper", () => {
  it("selects PRG, split-field CHR and one-screen mirroring through one register", () => {
    const cartridge = createTestCartridge({ mapper: 89, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    cartridge.prgRom[7 * 0x4000 + 0x0123] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0xc123, 0xda);

    expect(mapper.read(0x8000)).toBe(0x45);
    expect(mapper.read(0xc000)).toBe(0x47);
    expect(mapper.read(0)).toBe(0x6a);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
  });

  it("applies the currently visible PRG byte as an AND bus conflict", () => {
    const cartridge = createTestCartridge({ mapper: 89, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    cartridge.prgRom[0] = 0x11;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0xff);

    expect(mapper.read(0x8000)).toBe(0x41);
    expect(mapper.read(0)).toBe(0x61);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("ignores writes below its $8000-$FFFF register range", () => {
    const cartridge = createTestCartridge({ mapper: 89, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x7fff, 0xda);

    expect(mapper.read(0x8000)).toBe(0x40);
    expect(mapper.read(0)).toBe(0x60);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("leaves the absent PRG-RAM window on CPU open bus", () => {
    const bus = new Bus(createTestCartridge({ mapper: 89, prgBanks: 2, chrBanks: 1 }));
    bus.RAM[0] = 0x5a;
    bus.CPU.readByte(0);

    expect(bus.CPU.readByte(0x6000)).toBe(0x5a);
  });

  it("round-trips its physical latch and rejects a non-byte state", () => {
    const cartridge = createTestCartridge({ mapper: 89, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    cartridge.prgRom[7 * 0x4000] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);
    mapper.write(0xc000, 0xda);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, register: 256 } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it("rejects capacities and writable memory absent from the Sunsoft-3 board", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 89, prgBanks: 16, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 89, prgBanks: 2 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < cartridge.prgRom.byteLength / 0x4000; bank++) {
    cartridge.prgRom.fill(0x40 + bank, bank * 0x4000, (bank + 1) * 0x4000);
  }
  for (let bank = 0; bank < cartridge.chrRom.byteLength / 0x2000; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}
