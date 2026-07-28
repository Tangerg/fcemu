import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { GxromMapper } from "./gxrom-mapper.js";

describe("GxromMapper", () => {
  it("selects 32 KiB PRG and 8 KiB CHR banks from one register", () => {
    const cartridge = createTestCartridge({ mapper: 66, prgBanks: 8, chrBanks: 4 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.prgRom[bank * 0x8000] = 0xa0 + bank;
      cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    cartridge.prgRom[0] = 0xff; // conflict-free write target in bank 0
    const mapper = new GxromMapper(cartridge);

    mapper.write(0x8000, 0x23); // PRG bank 2 (bits 5-4), CHR bank 3 (bits 1-0)

    expect(mapper.read(0x8000)).toBe(0xa2);
    expect(mapper.read(0x0000)).toBe(0xc3);
  });

  it("masks the register against PRG ROM as an AND bus conflict", () => {
    const cartridge = createTestCartridge({ mapper: 66, prgBanks: 8, chrBanks: 4 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    cartridge.prgRom[0] = 0x01;
    const mapper = new GxromMapper(cartridge);

    mapper.write(0x8000, 0x23); // 0x23 & 0x01 = 0x01 -> CHR bank 1, PRG bank 0

    expect(mapper.read(0x0000)).toBe(0xc1);
    expect(mapper.read(0x8000)).toBe(0x01);
  });

  it("round-trips bank selection through save state", () => {
    const cartridge = createTestCartridge({ mapper: 66, prgBanks: 8, chrBanks: 4 });
    cartridge.prgRom[0] = 0xff;
    const mapper = new GxromMapper(cartridge);
    mapper.write(0x8000, 0x31); // PRG bank 3, CHR bank 1

    const state = mapper.captureState();
    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedPrgBank: 0, selectedChrBank: 0 });

    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });

  it("rejects an out-of-range PRG bank when restoring", () => {
    const cartridge = createTestCartridge({ mapper: 66, prgBanks: 8, chrBanks: 4 });
    const mapper = new GxromMapper(cartridge);

    expect(() =>
      mapper.restoreState({ kind: "gxrom", selectedPrgBank: 9, selectedChrBank: 0 }),
    ).toThrow(RangeError);
  });
});
