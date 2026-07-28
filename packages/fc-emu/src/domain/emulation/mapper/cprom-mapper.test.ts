import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { CpromMapper } from "./cprom-mapper.js";

/** CPROM implies 16 KiB CHR RAM, which only NES 2.0 headers can declare explicitly. */
function createCpromCartridge() {
  return createTestCartridge({ mapper: 13, nes2: true, prgBanks: 2, chrBanks: 0, chrRamShift: 8 });
}

describe("CpromMapper", () => {
  it("fixes the lower 4 KiB CHR region and switches the upper region", () => {
    const cartridge = createCpromCartridge();
    cartridge.prgRom[0] = 0xff; // conflict-free register write target
    const mapper = new CpromMapper(cartridge);

    mapper.write(0x0000, 0xaa); // lower region (bank 0)
    mapper.write(0x8000, 0x01); // select upper bank 1
    mapper.write(0x1000, 0xb1);
    mapper.write(0x8000, 0x02); // select upper bank 2
    mapper.write(0x1000, 0xb2);

    expect(mapper.read(0x0000)).toBe(0xaa);
    mapper.write(0x8000, 0x01);
    expect(mapper.read(0x1000)).toBe(0xb1);
    mapper.write(0x8000, 0x02);
    expect(mapper.read(0x1000)).toBe(0xb2);
  });

  it("mirrors the fixed lower bank into the upper region when bank 0 is selected", () => {
    const cartridge = createCpromCartridge();
    cartridge.prgRom[0] = 0xff;
    const mapper = new CpromMapper(cartridge);

    mapper.write(0x0000, 0x5c); // lower region byte
    mapper.write(0x8000, 0x00); // upper region also selects bank 0

    expect(mapper.read(0x1000)).toBe(0x5c);
  });

  it("keeps PRG ROM fixed as a 32 KiB NROM window", () => {
    const cartridge = createCpromCartridge();
    cartridge.prgRom[0] = 0x40;
    cartridge.prgRom[0x7fff] = 0x41;
    const mapper = new CpromMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x40);
    expect(mapper.read(0xffff)).toBe(0x41);
  });

  it("masks the CHR register against PRG ROM as an AND bus conflict", () => {
    const cartridge = createCpromCartridge();
    cartridge.prgRom[0] = 0x01;
    const mapper = new CpromMapper(cartridge);

    mapper.write(0x8000, 0x03); // 0x03 & 0x01 = 0x01 -> upper bank 1
    expect(mapper.captureState()).toMatchObject({ selectedChrBank: 1 });
  });

  it("round-trips bank selection through save state", () => {
    const cartridge = createCpromCartridge();
    cartridge.prgRom[0] = 0xff;
    const mapper = new CpromMapper(cartridge);
    mapper.write(0x8000, 0x03);

    const state = mapper.captureState();
    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedChrBank: 0 });

    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
