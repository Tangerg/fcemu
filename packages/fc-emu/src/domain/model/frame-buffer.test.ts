import { describe, expect, it } from "vitest";
import { FrameBuffer } from "./frame-buffer.js";

describe("FrameBuffer", () => {
  it("exports pixels in canvas RGBA order", () => {
    const frame = new FrameBuffer(1, 1);
    frame.setRGBA(0, 0, FrameBuffer.createRGBA(12, 34, 56, 255));
    expect([...frame.toCanvasImageData()]).toEqual([12, 34, 56, 255]);
  });

  it("clones without sharing pixel state", () => {
    const frame = new FrameBuffer(1, 1, 1);
    const clone = frame.clone();
    clone.setRGBA(0, 0, 2);
    expect(frame.getRGBA(0, 0)).toBe(1);
  });

  it("converts conventional RRGGBBAA palette constants", () => {
    expect(FrameBuffer.extractRGBA(FrameBuffer.fromRgbaHex(0x123456ff))).toEqual({
      r: 0x12,
      g: 0x34,
      b: 0x56,
      a: 0xff,
    });
  });

  it("rejects fractional coordinates", () => {
    expect(() => new FrameBuffer(2, 2).setRGBA(0.5, 1, 0)).toThrow(RangeError);
  });
});
