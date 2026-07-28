import { describe, expect, it } from "vitest";
import { NametableMirroring } from "../../model/cartridge.js";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Mmc4Mapper } from "./mmc4-mapper.js";

function createMmc4Cartridge() {
  const cartridge = createTestCartridge({ mapper: 10, prgBanks: 8, chrBanks: 8 });
  for (let bank = 0; bank < 8; bank++) cartridge.prgRom[bank * 0x4000] = 0xa0 + bank;
  for (let bank = 0; bank < 16; bank++) {
    cartridge.chrRom.fill(0xc0 + bank, bank * 0x1000, (bank + 1) * 0x1000);
  }
  return cartridge;
}

describe("Mmc4Mapper", () => {
  it("switches the 16 KiB bank at $8000 and fixes the last bank at $C000", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0xa0);
    expect(mapper.read(0xc000)).toBe(0xa7);

    mapper.write(0xa000, 0x03);
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0xc000)).toBe(0xa7);
  });

  it("selects CHR banks through the two PPU latches", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);
    mapper.write(0xb000, 0x01);
    mapper.write(0xc000, 0x02);
    mapper.write(0xd000, 0x03);
    mapper.write(0xe000, 0x04);

    expect(mapper.read(0x0000)).toBe(0xc0 + 1);
    expect(mapper.read(0x1000)).toBe(0xc0 + 3);

    mapper.observePpuAddress(0x0fe8);
    expect(mapper.read(0x0000)).toBe(0xc0 + 2);
    mapper.observePpuAddress(0x1fe8);
    expect(mapper.read(0x1000)).toBe(0xc0 + 4);
  });

  it("flips the left latch across the whole $0FD8-$0FDF / $0FE8-$0FEF ranges", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);
    mapper.write(0xb000, 0x01);
    mapper.write(0xc000, 0x02);

    mapper.observePpuAddress(0x0fe9); // in range on MMC4, unlike MMC2
    expect(mapper.read(0x0000)).toBe(0xc0 + 2);
    mapper.observePpuAddress(0x0fdf);
    expect(mapper.read(0x0000)).toBe(0xc0 + 1);
  });

  it("maps 8 KiB PRG RAM at $6000-$7FFF", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);

    mapper.write(0x6000, 0x5a);
    mapper.write(0x7fff, 0xa5);
    expect(mapper.read(0x6000)).toBe(0x5a);
    expect(mapper.read(0x7fff)).toBe(0xa5);
  });

  it("sets nametable mirroring from the $F000 register", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);

    mapper.write(0xf000, 0x00);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0xf000, 0x01);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("round-trips banking, latches and mirroring through save state", () => {
    const cartridge = createMmc4Cartridge();
    const mapper = new Mmc4Mapper(cartridge);
    mapper.write(0xa000, 0x03);
    mapper.write(0xc000, 0x02);
    mapper.observePpuAddress(0x0fe8);
    mapper.write(0xf000, 0x01);

    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
