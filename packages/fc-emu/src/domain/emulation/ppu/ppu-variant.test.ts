import { describe, expect, it } from "vitest";
import { resolvePpuVariant } from "./ppu-variant.js";

describe("resolvePpuVariant", () => {
  it("keeps the standard composite PPU and odd-frame dot skip outside Vs. System", () => {
    const variant = resolvePpuVariant(0, 0);
    expect(variant.id).toBe("rp2c02");
    expect(variant.emphasisModel).toBe("composite-attenuation");
    expect(variant.skipsOddFrameDot).toBe(true);
  });

  it.each([
    [2, "rp2c04-0001", 0xff, 0xb6],
    [3, "rp2c04-0002", 0x00, 0x00],
    [4, "rp2c04-0003", 0xb6, 0x00],
    [5, "rp2c04-0004", 0x92, 0x6d],
  ] as const)("decodes RGB palette type %i as %s", (type, id, red, green) => {
    const variant = resolvePpuVariant(1, type);
    expect(variant.id).toBe(id);
    expect((variant.masterPaletteRgba[0] >>> 24) & 0xff).toBe(red);
    expect((variant.masterPaletteRgba[0] >>> 16) & 0xff).toBe(green);
    expect(variant.skipsOddFrameDot).toBe(false);
  });

  it("expresses 2C05 register swapping and status signatures without guessing 2C05-01", () => {
    expect(resolvePpuVariant(1, 8).statusSignature).toEqual({ value: 0, drivenMask: 0 });
    expect(resolvePpuVariant(1, 9).statusSignature).toEqual({
      value: 0x3d,
      drivenMask: 0x3f,
    });
    expect(resolvePpuVariant(1, 10).statusSignature).toEqual({
      value: 0x1c,
      drivenMask: 0x1f,
    });
    expect(resolvePpuVariant(1, 11).swapsControlAndMask).toBe(true);
  });
});
