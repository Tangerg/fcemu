import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Mapper34Board } from "./mapper34-board.js";

describe("Mapper 34 board identity", () => {
  it("uses CHR geometry to select exactly one legacy board", () => {
    const bnrom = createTestCartridge({ mapper: 34, prgBanks: 8 });
    const nina001 = createTestCartridge({ mapper: 34, prgBanks: 4, chrBanks: 2 });

    expect(Mapper34Board.resolve(bnrom).kind).toBe("bnrom");
    expect(Mapper34Board.resolve(nina001).kind).toBe("nina-001");
  });

  it.each([
    [1, "nina-001", { prgBanks: 4, chrBanks: 8, prgRamShift: 7 }],
    [2, "bnrom", { prgBanks: 8, chrRamShift: 7 }],
  ] as const)("maps explicit submapper %i to %s", (submapper, kind, layout) => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 34,
      submapper,
      ...layout,
    });

    expect(Mapper34Board.resolve(cartridge).kind).toBe(kind);
  });

  it.each([
    ["NINA-001 with CHR RAM", { submapper: 1, prgBanks: 4, chrRamShift: 7 }],
    ["BNROM with banked CHR ROM", { submapper: 2, prgBanks: 8, chrBanks: 2 }],
    ["NINA-001 without PRG RAM", { submapper: 1, prgBanks: 4, chrBanks: 8 }],
    ["NINA-001 with three PRG banks", { submapper: 1, prgBanks: 6, chrBanks: 8, prgRamShift: 7 }],
    ["NINA-001 with three CHR banks", { submapper: 1, prgBanks: 4, chrBanks: 3, prgRamShift: 7 }],
    ["BNROM with three PRG banks", { submapper: 2, prgBanks: 6 }],
  ] as const)("rejects %s", (_name, layout) => {
    const cartridge = createTestCartridge({ nes2: true, mapper: 34, ...layout });
    expect(() => Mapper34Board.resolve(cartridge)).toThrow(
      expect.objectContaining({ mapperNumber: 34, submapperNumber: layout.submapper }),
    );
  });

  it("keeps unknown Mapper 34 hardware variants explicit", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 34,
      submapper: 3,
      prgBanks: 8,
    });
    expect(() => Mapper34Board.resolve(cartridge)).toThrow(
      expect.objectContaining({ mapperNumber: 34, submapperNumber: 3 }),
    );
  });
});
