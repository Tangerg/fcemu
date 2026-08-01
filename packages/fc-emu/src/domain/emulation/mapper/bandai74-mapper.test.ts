import { describe, expect, it } from "vitest";
import { NametableMirroring } from "../../model/cartridge.js";
import { createTestCartridge } from "../../../../test-support/rom.js";
import type { MapperState } from "./mapper.js";
import { Bandai74Mapper } from "./bandai74-mapper.js";

function markedCartridge(mapper: number) {
  const cartridge = createTestCartridge({ mapper, prgBanks: 8, chrBanks: 8 });
  for (let bank = 0; bank < 8; bank++) cartridge.prgRom[bank * 0x4000] = 0xa0 + bank;
  for (let bank = 0; bank < 8; bank++) {
    cartridge.chrRom.fill(0xc0 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
  cartridge.prgRom[0] = 0xff; // conflict-free register write target in bank 0
  return cartridge;
}

describe("Bandai74Mapper", () => {
  it("switches 16 KiB PRG and 8 KiB CHR banks (mapper 70) with the last bank fixed", () => {
    const cartridge = markedCartridge(70);
    const mapper = new Bandai74Mapper(cartridge, false);

    expect(mapper.read(0xc000)).toBe(0xa7); // fixed final bank
    mapper.write(0x8000, 0x35); // PRG bank 3 (bits 7-4), CHR bank 5 (bits 3-0)
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0x0000)).toBe(0xc5);
    expect(mapper.read(0xc000)).toBe(0xa7);
  });

  it("applies AND bus conflicts against PRG ROM", () => {
    const cartridge = markedCartridge(70);
    cartridge.prgRom[0] = 0x12;
    const mapper = new Bandai74Mapper(cartridge, false);

    mapper.write(0x8000, 0x35); // 0x35 & 0x12 = 0x10 -> PRG bank 1, CHR bank 0
    expect(mapper.read(0x8000)).toBe(0xa1);
    expect(mapper.read(0x0000)).toBe(0xc0);
  });

  it("controls single-screen mirroring from bit 7 (mapper 152) without disturbing PRG", () => {
    const cartridge = markedCartridge(152);
    const mapper = new Bandai74Mapper(cartridge, true);
    mapper.powerOn();
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);

    mapper.write(0x8000, 0xb5); // bit 7 set, PRG bits 6-4 = 3, CHR = 5
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0x0000)).toBe(0xc5);

    mapper.write(0x8000, 0x30); // bit 7 clear
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("round-trips banking and mirroring through save state", () => {
    const cartridge = markedCartridge(152);
    const mapper = new Bandai74Mapper(cartridge, true);
    mapper.write(0x8000, 0xb5);

    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });

  it.each([
    ["hardwired", false, NametableMirroring.SingleScreenUpper],
    ["mapper 152", true, NametableMirroring.Vertical],
  ] as const)("rejects mirroring impossible on the %s board", (_, controlled, mirroring) => {
    const cartridge = markedCartridge(controlled ? 152 : 70);
    cartridge.mirroringMode = NametableMirroring.Horizontal;
    const mapper = new Bandai74Mapper(cartridge, controlled);
    mapper.powerOn();
    const before = mapper.captureState();

    expect(() =>
      mapper.restoreState({ ...before, selectedPrgBank: 3, mirroring } as MapperState),
    ).toThrow(/mirroring for this board/i);
    expect(mapper.captureState()).toEqual(before);
  });
});
