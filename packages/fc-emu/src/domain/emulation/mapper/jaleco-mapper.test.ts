import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { JalecoMapper } from "./jaleco-mapper.js";

describe("JalecoMapper", () => {
  it("selects an 8 KiB CHR bank from the reversed register bits at $6000-$7FFF", () => {
    const cartridge = createTestCartridge({ mapper: 87, prgBanks: 1, chrBanks: 4 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    const mapper = new JalecoMapper(cartridge);

    mapper.write(0x6000, 0x01); // value bit 0 -> CHR line 1 => bank 2
    expect(mapper.read(0x0000)).toBe(0xc2);
    mapper.write(0x6000, 0x02); // value bit 1 -> CHR line 0 => bank 1
    expect(mapper.read(0x0000)).toBe(0xc1);
    mapper.write(0x6000, 0x03); // both bits => bank 3
    expect(mapper.read(0x1fff)).toBe(0xc3);
  });

  it("keeps PRG ROM fixed and mirrors a 16 KiB image", () => {
    const cartridge = createTestCartridge({ mapper: 87, prgBanks: 1, chrBanks: 1 });
    cartridge.prgRom[0] = 0x40;
    cartridge.prgRom[0x3fff] = 0x41;
    const mapper = new JalecoMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x40);
    expect(mapper.read(0xc000)).toBe(0x40);
    expect(mapper.read(0xffff)).toBe(0x41);
  });

  it("round-trips CHR selection through save state", () => {
    const cartridge = createTestCartridge({ mapper: 87, prgBanks: 1, chrBanks: 4 });
    const mapper = new JalecoMapper(cartridge);
    mapper.write(0x6000, 0x03);

    const state = mapper.captureState();
    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedChrBank: 0 });

    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
