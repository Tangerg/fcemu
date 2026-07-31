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

describe("Sunsoft3RMapper", () => {
  it("switches the lower 16 KiB PRG window and fixes the final bank", () => {
    const cartridge = createTestCartridge({ mapper: 93, prgBanks: 8 });
    fillPrgBanks(cartridge);
    cartridge.prgRom[7 * 0x4000 + 0x0123] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0xc123, 0x51);

    expect(mapper.read(0x8000)).toBe(0x45);
    expect(mapper.read(0xc000)).toBe(0x47);
  });

  it("tri-states disabled CHR RAM and ignores writes until D0 enables it", () => {
    const cartridge = createTestCartridge({ mapper: 93, prgBanks: 2 });
    cartridge.prgRom[0x4000] = 0xff;
    const bus = new Bus(cartridge);
    const ppuMemory = new PPUMemory(bus);

    ppuMemory.write(0x0123, 0xaa);
    expect(ppuMemory.read(0x0123)).toBe(0x23);

    bus.Mapper.write(0xc000, 0x01);
    ppuMemory.write(0x0123, 0xaa);

    expect(ppuMemory.read(0x0123)).toBe(0xaa);
  });

  it("applies the visible PRG byte as an AND bus conflict", () => {
    const cartridge = createTestCartridge({ mapper: 93, prgBanks: 8 });
    fillPrgBanks(cartridge);
    cartridge.prgRom[0] = 0x21;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0xff);

    expect(mapper.captureState()).toEqual({ kind: "sunsoft-3r", register: 0x21 });
    expect(mapper.read(0x8000)).toBe(0x42);
    expect(mapper.ppuReadDriveMask?.(0)).toBe(0xff);
  });

  it("keeps fixed header mirroring and leaves the absent PRG-RAM window open", () => {
    const cartridge = createTestCartridge({ mapper: 93, prgBanks: 2, fourScreen: true });
    cartridge.prgRom[0x4000] = 0xff;
    const bus = new Bus(cartridge);
    const mirroring = cartridge.mirroringMode;
    bus.RAM[0] = 0x5a;
    bus.CPU.readByte(0);

    bus.Mapper.write(0xc000, 0x01);

    expect(cartridge.mirroringMode).toBe(mirroring);
    expect(bus.CPU.readByte(0x6000)).toBe(0x5a);
  });

  it("round-trips its latch and rejects an invalid state", () => {
    const cartridge = createTestCartridge({ mapper: 93, prgBanks: 8 });
    cartridge.prgRom[7 * 0x4000] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);
    mapper.write(0xc000, 0x61);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, register: 256 } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it("rejects unsupported submappers, ROM geometry, CHR ROM and PRG RAM", () => {
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 93, nes2: true, submapper: 1, prgBanks: 2 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 93, prgBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 93, prgBanks: 16 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 93, prgBanks: 2, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 93, nes2: true, prgBanks: 2, prgRamShift: 7 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillPrgBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < cartridge.prgRom.byteLength / 0x4000; bank++) {
    cartridge.prgRom.fill(0x40 + bank, bank * 0x4000, (bank + 1) * 0x4000);
  }
}
