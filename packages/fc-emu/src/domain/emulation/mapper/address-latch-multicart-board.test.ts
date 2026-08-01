import { describe, expect, it } from "vitest";
import { findAddressLatchMulticartBoard } from "./address-latch-multicart-board.js";

describe("address-latch multicart board selection", () => {
  it.each([
    [15, 0, "k-1029"],
    [225, 0, "et-4310"],
    [227, 0, "mapper-227-rpg"],
    [227, 1, "mapper-227-multicart"],
    [227, 2, "mapper-227-outer-reset"],
    [228, 0, "active-enterprises"],
    [242, 0, "mapper-242"],
  ])("resolves mapper %i submapper %i to %s", (mapper, submapper, id) => {
    expect(findAddressLatchMulticartBoard(mapper, submapper)).toMatchObject({
      id,
      mapperNumber: mapper,
    });
  });

  it.each([
    [15, 1],
    [225, 1],
    [227, 3],
    [228, 1],
    [242, 1],
  ])("rejects unallocated mapper %i submapper %i", (mapper, submapper) => {
    expect(findAddressLatchMulticartBoard(mapper, submapper)).toBeUndefined();
  });
});
