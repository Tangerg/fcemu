import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { ColorDreamsMapper } from "./color-dreams-mapper.js";

describe("ColorDreamsMapper", () => {
  it("selects a 32 KiB PRG bank from bits 1-0 and an 8 KiB CHR bank from bits 7-4", () => {
    const cartridge = createTestCartridge({ mapper: 11, prgBanks: 8, chrBanks: 16 });
    for (let bank = 0; bank < 4; bank++) cartridge.prgRom[bank * 0x8000] = 0xa0 + bank;
    for (let bank = 0; bank < 16; bank++) {
      cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    cartridge.prgRom[0] = 0xff; // conflict-free write target
    const mapper = new ColorDreamsMapper(cartridge);

    mapper.write(0x8000, 0xf2); // CHR bank 15 (bits 7-4), PRG bank 2 (bits 1-0)

    expect(mapper.read(0x8000)).toBe(0xa2);
    expect(mapper.read(0x0000)).toBe(0xcf);
  });

  it("masks the register against PRG ROM as an AND bus conflict", () => {
    const cartridge = createTestCartridge({ mapper: 11, prgBanks: 8, chrBanks: 16 });
    for (let bank = 0; bank < 4; bank++) cartridge.prgRom[bank * 0x8000] = 0xa0 + bank;
    for (let bank = 0; bank < 16; bank++) {
      cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    cartridge.prgRom[0] = 0x31;
    const mapper = new ColorDreamsMapper(cartridge);

    mapper.write(0x8000, 0xf3); // 0xf3 & 0x31 = 0x31 -> CHR bank 3, PRG bank 1

    expect(mapper.read(0x0000)).toBe(0xc3);
    expect(mapper.read(0x8000)).toBe(0xa1);
  });

  it("round-trips bank selection through save state", () => {
    const cartridge = createTestCartridge({ mapper: 11, prgBanks: 8, chrBanks: 16 });
    cartridge.prgRom[0] = 0xff;
    const mapper = new ColorDreamsMapper(cartridge);
    mapper.write(0x8000, 0x93); // CHR bank 9, PRG bank 3

    const state = mapper.captureState();
    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedPrgBank: 0, selectedChrBank: 0 });

    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
