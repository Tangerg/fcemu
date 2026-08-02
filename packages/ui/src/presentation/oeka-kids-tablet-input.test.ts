import { describe, expect, it } from "vitest";
import { mapOekaKidsTabletPointer } from "./oeka-kids-tablet-input.js";

describe("mapOekaKidsTabletPointer", () => {
  it("maps the 256x240 frame to the tablet's reversed 240x256 coordinate ranges", () => {
    const bounds = { left: 10, top: 20, width: 512, height: 480 };

    expect(mapOekaKidsTabletPointer(bounds, 10, 20, true, false)).toEqual({
      x: 0,
      y: 0,
      touching: true,
      clicked: false,
    });
    expect(mapOekaKidsTabletPointer(bounds, 266, 260, true, true)).toEqual({
      x: 120,
      y: 128,
      touching: true,
      clicked: true,
    });
    expect(mapOekaKidsTabletPointer(bounds, 522, 500, true, true)).toEqual({
      x: 239,
      y: 255,
      touching: true,
      clicked: true,
    });
  });

  it("excludes object-fit letterboxes from the drawing surface", () => {
    const wide = { left: 0, top: 0, width: 600, height: 240 };

    expect(mapOekaKidsTabletPointer(wide, 100, 120, true, true)).toMatchObject({
      x: 0,
      touching: false,
      clicked: false,
    });
    expect(mapOekaKidsTabletPointer(wide, 172, 120, true, false)).toMatchObject({
      x: 0,
      y: 128,
      touching: true,
    });
  });

  it("keeps the last clamped coordinate while contact is released", () => {
    expect(
      mapOekaKidsTabletPointer({ left: 0, top: 0, width: 256, height: 240 }, -10, 300, false, true),
    ).toEqual({ x: 0, y: 255, touching: false, clicked: false });
  });

  it("rejects an unmeasurable canvas instead of producing NaN input", () => {
    expect(() =>
      mapOekaKidsTabletPointer({ left: 0, top: 0, width: 0, height: 240 }, 0, 0, true, false),
    ).toThrow(/positive canvas bounds/);
  });
});
