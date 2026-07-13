import { describe, expect, it } from "vitest";
import { PpuIoBusLatch } from "./ppu-io-bus-latch.js";

describe("PPU I/O bus latch", () => {
  it("retains undriven bits without refreshing their decay deadlines", () => {
    const latch = new PpuIoBusLatch(10);
    latch.drive(0xff);
    latch.advanceDots(6);

    expect(latch.drive(0, 0xe0)).toBe(0x1f);
    latch.advanceDots(4);

    expect(latch.sample()).toBe(0);
  });

  it("does not refresh a value merely because it was sampled", () => {
    const latch = new PpuIoBusLatch(5);
    latch.drive(1);
    latch.advanceDots(3);
    expect(latch.sample()).toBe(1);

    latch.advanceDots(2);
    expect(latch.sample()).toBe(0);
  });

  it("round-trips independent bit deadlines", () => {
    const source = new PpuIoBusLatch(10);
    source.drive(1);
    source.advanceDots(3);
    source.drive(2, 2);
    const state = source.captureState();
    const restored = new PpuIoBusLatch(10);

    restored.restoreState(state);
    restored.advanceDots(7);

    expect(restored.sample()).toBe(2);
  });

  it("rejects latch values that disagree with their decay deadlines", () => {
    const latch = new PpuIoBusLatch(10);

    expect(() =>
      latch.restoreState({
        value: 1,
        elapsedDots: 10,
        decayDeadlines: new Float64Array([10, 0, 0, 0, 0, 0, 0, 0]),
      }),
    ).toThrow(/inconsistent/i);
    expect(() =>
      latch.restoreState({
        value: 0,
        elapsedDots: 0,
        decayDeadlines: new Float64Array([10, 0, 0, 0, 0, 0, 0, 0]),
      }),
    ).toThrow(/inconsistent/i);
  });
});
