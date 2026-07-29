import { describe, expect, it } from "vitest";
import { NametableMirroring } from "../../model/cartridge.js";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Mmc2Mapper } from "./mmc2-mapper.js";

function createMmc2Cartridge() {
  const cartridge = createTestCartridge({ mapper: 9, prgBanks: 8, chrBanks: 8 });
  for (let bank = 0; bank < 16; bank++) cartridge.prgRom[bank * 0x2000] = 0xa0 + bank;
  for (let bank = 0; bank < 16; bank++) {
    cartridge.chrRom.fill(0xc0 + bank, bank * 0x1000, (bank + 1) * 0x1000);
  }
  return cartridge;
}

describe("Mmc2Mapper", () => {
  it("switches the first 8 KiB bank and fixes the final three banks", () => {
    const cartridge = createMmc2Cartridge();
    const mapper = new Mmc2Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0xa0); // switchable, power-on bank 0
    expect(mapper.read(0xa000)).toBe(0xa0 + 13);
    expect(mapper.read(0xc000)).toBe(0xa0 + 14);
    expect(mapper.read(0xe000)).toBe(0xa0 + 15);

    mapper.write(0xa000, 0x05); // $A000-$AFFF selects the switchable bank
    expect(mapper.read(0x8000)).toBe(0xa0 + 5);
    expect(mapper.read(0xe000)).toBe(0xa0 + 15); // fixed banks unaffected
  });

  it("selects CHR banks through the two PPU latches", () => {
    const cartridge = createMmc2Cartridge();
    const mapper = new Mmc2Mapper(cartridge);
    mapper.write(0xb000, 0x01); // $0000-$0FFF when latch 0 = FD
    mapper.write(0xc000, 0x02); // $0000-$0FFF when latch 0 = FE
    mapper.write(0xd000, 0x03); // $1000-$1FFF when latch 1 = FD
    mapper.write(0xe000, 0x04); // $1000-$1FFF when latch 1 = FE

    expect(mapper.read(0x0000)).toBe(0xc0 + 1); // latches default to FD
    expect(mapper.read(0x1000)).toBe(0xc0 + 3);

    mapper.observePpuAddress(0x0fe8);
    expect(mapper.read(0x0000)).toBe(0xc0 + 2);
    mapper.observePpuAddress(0x0fd8);
    expect(mapper.read(0x0000)).toBe(0xc0 + 1);

    mapper.observePpuAddress(0x1fef);
    expect(mapper.read(0x1000)).toBe(0xc0 + 4);
    mapper.observePpuAddress(0x1fd8);
    expect(mapper.read(0x1000)).toBe(0xc0 + 3);
  });

  it("flips the left latch only on the exact $0FD8/$0FE8 fetches", () => {
    const cartridge = createMmc2Cartridge();
    const mapper = new Mmc2Mapper(cartridge);
    mapper.write(0xb000, 0x01);
    mapper.write(0xc000, 0x02);

    mapper.observePpuAddress(0x0fe8); // latch 0 -> FE
    mapper.observePpuAddress(0x0fd9); // not a trigger on MMC2
    expect(mapper.read(0x0000)).toBe(0xc0 + 2);
  });

  it("sets nametable mirroring from the $F000 register", () => {
    const cartridge = createMmc2Cartridge();
    const mapper = new Mmc2Mapper(cartridge);

    mapper.write(0xf000, 0x00);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0xf000, 0x01);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("round-trips banking, latches and mirroring through save state", () => {
    const cartridge = createMmc2Cartridge();
    const mapper = new Mmc2Mapper(cartridge);
    mapper.write(0xa000, 0x07);
    mapper.write(0xb000, 0x01);
    mapper.write(0xe000, 0x04);
    mapper.observePpuAddress(0x0fe8);
    mapper.write(0xf000, 0x01);

    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
