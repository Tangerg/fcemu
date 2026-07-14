import { describe, expect, it } from "vitest";
import { SpritePatternAddress } from "./sprite-pattern-address.js";

describe("sprite pattern address", () => {
  it("uses PPUCTRL's table and flips rows within an 8x8 tile", () => {
    expect(
      new SpritePatternAddress({
        tileIndex: 0x23,
        row: 2,
        height: 8,
        patternTable: 1,
        verticallyFlipped: false,
      }).lowPlaneAddress,
    ).toBe(0x1232);
    expect(
      new SpritePatternAddress({
        tileIndex: 0x23,
        row: 2,
        height: 8,
        patternTable: 1,
        verticallyFlipped: true,
      }).lowPlaneAddress,
    ).toBe(0x1235);
  });

  it("uses the tile low bit as the 8x16 table and selects the lower tile", () => {
    expect(
      new SpritePatternAddress({
        tileIndex: 0x25,
        row: 10,
        height: 16,
        patternTable: 0,
        verticallyFlipped: false,
      }).lowPlaneAddress,
    ).toBe(0x1252);
  });

  it("exchanges the two 8x16 tiles when vertically flipped", () => {
    expect(
      new SpritePatternAddress({
        tileIndex: 0x25,
        row: 0,
        height: 16,
        patternTable: 0,
        verticallyFlipped: true,
      }).lowPlaneAddress,
    ).toBe(0x1257);
    expect(
      new SpritePatternAddress({
        tileIndex: 0x25,
        row: 8,
        height: 16,
        patternTable: 0,
        verticallyFlipped: true,
      }).lowPlaneAddress,
    ).toBe(0x1247);
  });

  it("uses the live sprite-size wiring when PPUCTRL changes after evaluation", () => {
    expect(
      new SpritePatternAddress({
        tileIndex: 0xce,
        row: 15,
        height: 8,
        patternTable: 0,
        verticallyFlipped: false,
      }).lowPlaneAddress,
    ).toBe(0x0ce7);
    expect(
      new SpritePatternAddress({
        tileIndex: 0xce,
        row: 15,
        height: 8,
        patternTable: 0,
        verticallyFlipped: true,
      }).lowPlaneAddress,
    ).toBe(0x0ce0);
  });
});
