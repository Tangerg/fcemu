import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("UxROM-family boards", () => {
  it("takes mapper 94 UN1ROM's PRG bank from bits 4-2", () => {
    const cartridge = createTestCartridge({ mapper: 94, prgBanks: 8 });
    fillPrgBanks(cartridge.prgRom, 8);
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0x14);

    expect(mapper.read(0x8000)).toBe(0x45);
    expect(mapper.read(0xc000)).toBe(0x47);
  });

  it("applies UN1ROM's AND bus conflict before decoding the shifted bank field", () => {
    const cartridge = createTestCartridge({ mapper: 94, prgBanks: 8 });
    fillPrgBanks(cartridge.prgRom, 8);
    cartridge.prgRom[0] = 0x0c;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0x1c);

    expect(mapper.read(0x8000)).toBe(0x43);
  });

  it("fixes mapper 180's first bank below its switchable upper bank", () => {
    const cartridge = createTestCartridge({ mapper: 180, prgBanks: 8 });
    fillPrgBanks(cartridge.prgRom, 8);
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 5);

    expect(mapper.read(0x8000)).toBe(0xff);
    expect(mapper.read(0xc000)).toBe(0x45);
  });

  it("uses mapper 180 NES 2.0 submappers to make bus conflicts explicit", () => {
    const conflictFreeCartridge = createTestCartridge({
      nes2: true,
      mapper: 180,
      submapper: 1,
      prgBanks: 8,
    });
    const conflictCartridge = createTestCartridge({
      nes2: true,
      mapper: 180,
      submapper: 2,
      prgBanks: 8,
    });
    for (const cartridge of [conflictFreeCartridge, conflictCartridge]) {
      fillPrgBanks(cartridge.prgRom, 8);
      cartridge.prgRom[0] = 0x01;
    }

    const conflictFree = createMapper(conflictFreeCartridge, interruptPort);
    conflictFree.write(0x8000, 5);
    const conflict = createMapper(conflictCartridge, interruptPort);
    conflict.write(0x8000, 5);

    expect(conflictFree.read(0xc000)).toBe(0x45);
    expect(conflict.read(0xc000)).toBe(0x41);
  });

  it("round-trips and validates the selected bank for each wiring", () => {
    for (const mapperNumber of [94, 180]) {
      const cartridge = createTestCartridge({ mapper: mapperNumber, prgBanks: 8 });
      cartridge.prgRom[0] = 0xff;
      const mapper = createMapper(cartridge, interruptPort);
      mapper.write(0x8000, mapperNumber === 94 ? 0x14 : 5);
      const state = mapper.captureState();

      mapper.powerOn();
      mapper.restoreState(state);

      expect(mapper.captureState()).toEqual(state);
      expect(() => mapper.restoreState({ kind: "uxrom", selectedPrgBank: 8 })).toThrowError(
        RangeError,
      );
    }
  });

  it("does not expose legacy iNES's implicit RAM allocation on boards without a RAM decoder", () => {
    for (const mapperNumber of [94, 180]) {
      const mapper = createMapper(
        createTestCartridge({ mapper: mapperNumber, prgBanks: 8 }),
        interruptPort,
      );

      mapper.write(0x6000, 0x5a);

      expect(mapper.read(0x6000)).toBe(0);
    }
  });
});

function fillPrgBanks(prgRom: Uint8Array, count: number): void {
  for (let bank = 0; bank < count; bank++) {
    prgRom.fill(0x40 + bank, bank * 0x4000, (bank + 1) * 0x4000);
  }
}
