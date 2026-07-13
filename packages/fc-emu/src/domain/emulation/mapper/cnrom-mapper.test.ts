import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { CnromMapper } from "./cnrom-mapper.js";

describe("CnromMapper", () => {
  it("keeps PRG fixed and mirrors a 16 KiB image across the CPU window", () => {
    const cartridge = createTestCartridge({ mapper: 3, prgBanks: 1, chrBanks: 1 });
    cartridge.prgRom[0] = 0x31;
    cartridge.prgRom[0x3fff] = 0x42;
    const mapper = new CnromMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x31);
    expect(mapper.read(0xc000)).toBe(0x31);
    expect(mapper.read(0xbfff)).toBe(0x42);
    expect(mapper.read(0xffff)).toBe(0x42);
  });

  it("switches 8 KiB CHR banks using the original board's AND bus conflict", () => {
    const cartridge = createTestCartridge({ mapper: 3, prgBanks: 2, chrBanks: 4 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.chrRom.fill(0x20 + bank, bank * 0x2000, (bank + 1) * 0x2000);
    }
    cartridge.prgRom[0] = 0x02;
    cartridge.prgRom[1] = 0xff;
    const mapper = new CnromMapper(cartridge);

    mapper.write(0x8000, 0x03);
    expect(mapper.read(0x0000)).toBe(0x22);
    mapper.write(0x8001, 0x01);
    expect(mapper.read(0x1fff)).toBe(0x21);
  });

  it("supports the mapper-3 oversize four-bit CHR register", () => {
    const cartridge = createTestCartridge({ mapper: 3, prgBanks: 2, chrBanks: 8 });
    cartridge.prgRom[0] = 0xff;
    cartridge.chrRom.fill(0x77, 7 * 0x2000, 8 * 0x2000);
    const mapper = new CnromMapper(cartridge);

    mapper.write(0x8000, 7);

    expect(mapper.read(0x0100)).toBe(0x77);
  });

  it("keeps CHR ROM immutable", () => {
    const cartridge = createTestCartridge({ mapper: 3, chrBanks: 1 });
    cartridge.chrRom[0x10] = 0x55;
    const mapper = new CnromMapper(cartridge);

    mapper.write(0x0010, 0xaa);

    expect(mapper.read(0x0010)).toBe(0x55);
  });

  it("treats a legacy mapper-3 image without CHR ROM as one writable CHR-RAM bank", () => {
    const cartridge = createTestCartridge({ mapper: 3, chrBanks: 0 });
    const mapper = new CnromMapper(cartridge);

    mapper.write(0x0010, 0x7a);
    mapper.write(0x8000, 3);

    expect(mapper.read(0x0010)).toBe(0x7a);
  });
});
