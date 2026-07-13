import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Mmc1Board } from "./mmc1-board.js";

describe("MMC1 board wiring", () => {
  it.each([
    [1, "surom", { prgBanks: 32, battery: true, prgNvRamShift: 7 }],
    [2, "sorom", { prgBanks: 8, prgRamShift: 8 }],
    [4, "sxrom", { prgBanks: 32, prgRamShift: 9 }],
    [5, "serom", { prgBanks: 2, chrBanks: 1 }],
  ] as const)("accepts mapper 1 submapper %i as %s geometry", (submapper, kind, layout) => {
    const cartridge = createTestCartridge({ nes2: true, mapper: 1, submapper, ...layout });
    expect(Mmc1Board.resolve(cartridge).kind).toBe(kind);
  });

  it.each([
    [1, { prgBanks: 8, prgRamShift: 7 }],
    [2, { prgBanks: 8, prgRamShift: 7 }],
    [4, { prgBanks: 8, prgRamShift: 8 }],
    [5, { prgBanks: 4, chrBanks: 1 }],
  ] as const)(
    "rejects mapper 1 submapper %i with contradictory memory geometry",
    (submapper, layout) => {
      const cartridge = createTestCartridge({ nes2: true, mapper: 1, submapper, ...layout });
      expect(() => Mmc1Board.resolve(cartridge)).toThrow(/requires/i);
    },
  );

  it("models both MMC1B and CHR-A16 WRAM disables on SNROM", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      prgBanks: 8,
      prgRamShift: 7,
    });
    const board = Mmc1Board.resolve(cartridge);

    expect(board.kind).toBe("snrom");
    expect(board.isPrgRamEnabled(0x00, 0x00)).toBe(true);
    expect(board.isPrgRamEnabled(0x10, 0x00)).toBe(false);
    expect(board.isPrgRamEnabled(0x00, 0x10)).toBe(false);
  });

  it("keeps SEROM PRG wiring fixed", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper: 5,
      prgBanks: 2,
      chrBanks: 1,
    });
    expect(Mmc1Board.resolve(cartridge)).toMatchObject({ kind: "serom", hasFixedPrgRom: true });
  });

  it.each([3, 6])("keeps unsupported MMC1 hardware variant %i explicit", (submapper) => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper,
      prgBanks: 2,
      chrBanks: 1,
    });
    expect(() => Mmc1Board.resolve(cartridge)).toThrow(
      expect.objectContaining({ mapperNumber: 1, submapperNumber: submapper }),
    );
  });
});
