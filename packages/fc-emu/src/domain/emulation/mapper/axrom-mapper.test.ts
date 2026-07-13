import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { AxromMapper } from "./axrom-mapper.js";

describe("AxromMapper", () => {
  it("switches the complete 32 KiB PRG window without legacy bus conflicts", () => {
    const cartridge = createTestCartridge({ mapper: 7, prgBanks: 4 });
    cartridge.prgRom.fill(0x11, 0, 0x8000);
    cartridge.prgRom.fill(0x22, 0x8000);
    cartridge.prgRom[1] = 0;
    const mapper = new AxromMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x11);
    mapper.write(0x8001, 1);
    expect(mapper.read(0x8000)).toBe(0x22);
    expect(mapper.read(0xffff)).toBe(0x22);
  });

  it("switches the single-screen nametable page used by live PPU accesses", () => {
    const bus = new Bus(createTestCartridge({ mapper: 7, prgBanks: 2 }));
    bus.PPU.write(0x2000, 0x11);
    expect(bus.Cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);

    bus.Mapper.write(0x8000, 0x10);
    bus.PPU.write(0x2c00, 0x22);

    expect(bus.Cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(bus.PPU.read(0x2000)).toBe(0x22);
    expect(bus.PPU.read(0x2800)).toBe(0x22);
    bus.Mapper.write(0x8000, 0x00);
    expect(bus.PPU.read(0x2400)).toBe(0x11);
  });

  it("provides fixed writable CHR RAM", () => {
    const mapper = new AxromMapper(createTestCartridge({ mapper: 7, chrBanks: 0 }));

    mapper.write(0x1234, 0x7a);

    expect(mapper.read(0x1234)).toBe(0x7a);
  });

  it("keeps CHR data immutable for a legacy image carrying CHR ROM", () => {
    const cartridge = createTestCartridge({ mapper: 7, chrBanks: 1 });
    cartridge.chrRom[0x10] = 0x55;
    const mapper = new AxromMapper(cartridge);

    mapper.write(0x0010, 0xaa);

    expect(mapper.read(0x0010)).toBe(0x55);
  });

  it("supports the common emulator extension for 512 KiB PRG images", () => {
    const cartridge = createTestCartridge({ mapper: 7, prgBanks: 32 });
    cartridge.prgRom.fill(0x0f, 15 * PRG_BANK_SIZE, 16 * PRG_BANK_SIZE);
    const mapper = new AxromMapper(cartridge);

    mapper.write(0x8000, 0x0f);

    expect(mapper.read(0x8000)).toBe(0x0f);
  });

  it("leaves the unsupported AxROM PRG-RAM window unmapped", () => {
    const mapper = new AxromMapper(createTestCartridge({ mapper: 7, battery: true }));

    mapper.write(0x6000, 0x42);

    expect(mapper.read(0x6000)).toBe(0);
  });
});

const PRG_BANK_SIZE = 0x8000;
