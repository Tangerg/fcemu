import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";

describe("NINA-001 mapper", () => {
  it("banks PRG and both 4 KiB CHR windows through its three RAM-overlay registers", () => {
    const cartridge = createNina001Cartridge();
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x7ffd, 3);
    mapper.write(0x7ffe, 2);
    mapper.write(0x7fff, 13);

    expect(mapper.read(0x8000)).toBe(0x13);
    expect(mapper.read(0x0000)).toBe(0x22);
    expect(mapper.read(0x1000)).toBe(0x2d);
    expect(mapper.read(0x7ffd)).toBe(3);
    expect(mapper.read(0x7ffe)).toBe(2);
    expect(mapper.read(0x7fff)).toBe(13);
  });

  it("does not react to BNROM's high-address bank register", () => {
    const mapper = createMapper(createNina001Cartridge(), { setMapperIrq() {} });
    mapper.write(0x7ffd, 1);

    mapper.write(0x8000, 3);

    expect(mapper.read(0x8000)).toBe(0x11);
  });

  it("round-trips all three bank latches", () => {
    const mapper = createMapper(createNina001Cartridge(), { setMapperIrq() {} });
    mapper.write(0x7ffd, 2);
    mapper.write(0x7ffe, 4);
    mapper.write(0x7fff, 9);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual({
      kind: "nina-001",
      selectedPrgBank: 2,
      selectedChrBank0: 4,
      selectedChrBank1: 9,
    });
  });
});

function createNina001Cartridge() {
  const cartridge = createTestCartridge({
    nes2: true,
    mapper: 34,
    submapper: 1,
    prgBanks: 8,
    chrBanks: 8,
    prgRamShift: 7,
  });
  for (let bank = 0; bank < 4; bank++) {
    cartridge.prgRom.fill(0x10 + bank, bank * 0x8000, (bank + 1) * 0x8000);
  }
  for (let bank = 0; bank < 16; bank++) {
    cartridge.chrRom.fill(0x20 + bank, bank * 0x1000, (bank + 1) * 0x1000);
  }
  return cartridge;
}
