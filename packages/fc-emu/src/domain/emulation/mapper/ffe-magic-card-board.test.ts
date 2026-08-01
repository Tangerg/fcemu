import { describe, expect, it } from "vitest";
import { findFfeMagicCardBoard } from "./ffe-magic-card-board.js";

describe("FFE Magic Card board selection", () => {
  it("maps legacy mapper 6 to latch mode 1 and NES 2.0 submappers to modes 0-7", () => {
    expect(findFfeMagicCardBoard(6, "ines", 0)).toMatchObject({
      id: "magic-card-6",
      initialLatchMode: 1,
    });
    for (let mode = 0; mode <= 7; mode++) {
      expect(findFfeMagicCardBoard(6, "nes2", mode)).toMatchObject({
        id: "magic-card-6",
        initialLatchMode: mode,
      });
    }
    expect(findFfeMagicCardBoard(6, "nes2", 8)).toBeUndefined();
  });

  it("models mapper 8 as the mapper-6 mode-4 synonym", () => {
    expect(findFfeMagicCardBoard(8, "ines", 0)).toMatchObject({
      id: "magic-card-8",
      initialLatchMode: 4,
    });
    expect(findFfeMagicCardBoard(8, "nes2", 1)).toBeUndefined();
  });

  it.each([
    [0, 0x7000],
    [1, 0x5d00],
    [2, 0x5e00],
    [3, 0x5f00],
  ])("uses mapper 17 submapper %i trainer address $%s", (submapper, trainerLoadAddress) => {
    expect(findFfeMagicCardBoard(17, "nes2", submapper)).toMatchObject({
      id: "super-magic-card",
      trainerLoadAddress,
      trainerReturnsToResetVector: false,
    });
  });

  it("identifies only NES 2.0 mapper 12.1 as the 4M RAM-card extraction", () => {
    expect(findFfeMagicCardBoard(12, "nes2", 1)).toMatchObject({
      id: "super-magic-card-4m",
      initialSuperMode: 0x42,
      chrMemoryBytes: 0x8000,
      chrRomPrgOffset: 0x40_000,
      trainerLoadAddress: 0x7000,
      trainerReturnsToResetVector: true,
    });
    expect(findFfeMagicCardBoard(12, "ines", 0)).toBeUndefined();
    expect(findFfeMagicCardBoard(12, "nes2", 0)).toBeUndefined();
    expect(findFfeMagicCardBoard(12, "nes2", 2)).toBeUndefined();
  });
});
