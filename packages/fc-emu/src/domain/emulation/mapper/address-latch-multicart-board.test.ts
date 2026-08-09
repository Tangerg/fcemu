import { describe, expect, it } from "vitest";
import { findAddressLatchMulticartBoard } from "./address-latch-multicart-board.js";

describe("address-latch multicart board selection", () => {
  it.each([
    [15, "ines", 0, "mapper-15-legacy", "declared"],
    [15, "nes2", 0, "k-1029", "none"],
    [225, "ines", 0, "et-4310", "none"],
    [227, "ines", 0, "mapper-227-rpg", "battery"],
    [227, "nes2", 1, "mapper-227-multicart", "none"],
    [227, "nes2", 2, "mapper-227-outer-reset", "none"],
    [228, "ines", 0, "active-enterprises", "none"],
    [242, "ines", 0, "mapper-242", "battery"],
  ] as const)(
    "resolves mapper %i %s submapper %i to %s",
    (mapper, format, submapper, id, prgRamWindow) => {
      expect(findAddressLatchMulticartBoard(mapper, format, submapper)).toMatchObject({
        id,
        mapperNumber: mapper,
        prgRamWindow,
      });
    },
  );

  it.each([
    [15, 1],
    [225, 1],
    [227, 3],
    [228, 1],
    [242, 1],
  ])("rejects unallocated mapper %i submapper %i", (mapper, submapper) => {
    expect(findAddressLatchMulticartBoard(mapper, "nes2", submapper)).toBeUndefined();
  });
});
