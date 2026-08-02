import { describe, expect, it } from "vitest";
import { OekaKidsTablet } from "./oeka-kids-tablet.js";

function readReport(tablet: OekaKidsTablet): number[] {
  const bits: number[] = [];
  for (let index = 0; index < 18; index++) {
    tablet.writeLatch(0x01);
    expect(tablet.read()).toEqual({ value: 0x04, drivenMask: 0x0c });
    tablet.writeLatch(0x03);
    bits.push((tablet.read().value >> 3) & 1);
  }
  return bits;
}

describe("OekaKidsTablet", () => {
  it("latches and returns an inverted MSB-first 18-bit stylus report", () => {
    const tablet = new OekaKidsTablet();
    tablet.setInput({ x: 0xa5, y: 0x3c, touching: true, clicked: false });
    tablet.writeLatch(0x00);

    const logicalReport = (0xa5 << 10) | (0x3c << 2) | 0x02;
    const expected = Array.from({ length: 18 }, (_, index) =>
      Number(((logicalReport >> (17 - index)) & 1) === 0),
    );
    expect(readReport(tablet)).toEqual(expected);
  });

  it("latches input only while OUT0 selects latch mode", () => {
    const tablet = new OekaKidsTablet();
    tablet.setInput({ x: 1, y: 2, touching: true, clicked: true });
    tablet.writeLatch(0x00);
    tablet.setInput({ x: 239, y: 255, touching: false, clicked: false });

    expect(readReport(tablet).slice(-2)).toEqual([0, 0]);

    tablet.writeLatch(0x00);
    expect(readReport(tablet).slice(-2)).toEqual([1, 1]);
  });

  it("advances once per OUT1 rising edge and drives only $4017 D2/D3", () => {
    const tablet = new OekaKidsTablet();
    tablet.setInput({ x: 0x80, y: 0, touching: false, clicked: false });
    tablet.writeLatch(0x00);

    expect(tablet.read()).toEqual({ value: 0, drivenMask: 0x0c });
    tablet.writeLatch(0x01);
    expect(tablet.read()).toEqual({ value: 0x04, drivenMask: 0x0c });
    tablet.writeLatch(0x03);
    expect(tablet.read()).toEqual({ value: 0, drivenMask: 0x0c });
    const afterFirstEdge = tablet.captureState().report;
    tablet.writeLatch(0x03);
    expect(tablet.captureState().report).toBe(afterFirstEdge);
    tablet.writeLatch(0x01);
    tablet.writeLatch(0x03);
    expect(tablet.captureState().report).toBe((afterFirstEdge << 1) & 0x7ffff);
  });

  it("power-on resets serial lines while preserving physical stylus input", () => {
    const tablet = new OekaKidsTablet();
    tablet.setInput({ x: 120, y: 127, touching: true, clicked: true });
    tablet.writeLatch(0x00);
    tablet.writeLatch(0x03);

    tablet.powerOn();

    expect(tablet.captureState()).toEqual({
      x: 120,
      y: 127,
      touching: true,
      clicked: true,
      strobeSignal: false,
      advanceSignal: false,
      report: 0,
    });
  });

  it("rejects invalid physical input and malformed save states transactionally", () => {
    const tablet = new OekaKidsTablet();
    tablet.setInput({ x: 120, y: 127, touching: true, clicked: false });
    tablet.writeLatch(0x00);
    const before = tablet.captureState();

    expect(() => tablet.setInput({ x: 240, y: 0, touching: false, clicked: false })).toThrow(
      /0-239/,
    );
    expect(() => tablet.setInput({ x: 0, y: 0, touching: false, clicked: true })).toThrow(
      /without touching/,
    );
    expect(() => tablet.restoreState({ ...before, report: 0x80000 })).toThrow(/serial state/);
    expect(tablet.captureState()).toEqual(before);
  });
});
