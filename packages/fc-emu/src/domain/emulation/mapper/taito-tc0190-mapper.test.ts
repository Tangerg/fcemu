import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { TaitoTc0190Mapper } from "./taito-tc0190-mapper.js";

describe("TaitoTc0190Mapper", () => {
  it("maps two switchable and two fixed 8 KiB PRG windows", () => {
    const cartridge = createTestCartridge({ mapper: 33, prgBanks: 8, chrBanks: 8 });
    fillPrg8kBanks(cartridge.prgRom);
    const mapper = new TaitoTc0190Mapper(cartridge);

    mapper.write(0x8000, 5);
    mapper.write(0x8001, 9);

    expect(mapper.read(0x8000)).toBe(0x35);
    expect(mapper.read(0xa000)).toBe(0x39);
    expect(mapper.read(0xc000)).toBe(0x3e);
    expect(mapper.read(0xe000)).toBe(0x3f);
  });

  it("keeps the 2 KiB CHR register unit distinct from MMC3's even 1 KiB unit", () => {
    const cartridge = createTestCartridge({ mapper: 33, prgBanks: 2, chrBanks: 8 });
    fillChr1kBanks(cartridge.chrRom);
    const mapper = new TaitoTc0190Mapper(cartridge);

    mapper.write(0x9ffe, 3); // mirrored $8002
    mapper.write(0x8003, 5);
    mapper.write(0xbffc, 17); // mirrored $A000
    mapper.write(0xa003, 31);

    expect(mapper.read(0x0000)).toBe(0x76);
    expect(mapper.read(0x0800)).toBe(0x7a);
    expect(mapper.read(0x1000)).toBe(0x71);
    expect(mapper.read(0x1c00)).toBe(0x7f);
  });

  it("takes mirroring from bit 6 of the first PRG register", () => {
    const cartridge = createTestCartridge({ mapper: 33, prgBanks: 2, chrBanks: 1 });
    const mapper = new TaitoTc0190Mapper(cartridge);

    mapper.write(0x8000, 0x40);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(0x8000, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("round-trips all registers and rejects unreachable state", () => {
    const cartridge = createTestCartridge({ mapper: 33, prgBanks: 8, chrBanks: 8 });
    const mapper = new TaitoTc0190Mapper(cartridge);
    mapper.write(0x8000, 0x45);
    mapper.write(0x8001, 9);
    mapper.write(0x8002, 3);
    mapper.write(0xa003, 31);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({
        kind: "taito-tc0190",
        prgBanks: [64, 0],
        chrBanks: [0, 1, 2, 3, 4, 5],
        mirroring: NametableMirroring.Vertical,
      }),
    ).toThrowError(RangeError);
  });
});

function fillPrg8kBanks(prgRom: Uint8Array): void {
  for (let bank = 0; bank < prgRom.byteLength / 0x2000; bank++) {
    prgRom.fill(0x30 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}

function fillChr1kBanks(chrRom: Uint8Array): void {
  for (let bank = 0; bank < chrRom.byteLength / 0x0400; bank++) {
    chrRom.fill(0x70 + (bank & 0x0f), bank * 0x0400, (bank + 1) * 0x0400);
  }
}
