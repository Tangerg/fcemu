import { describe, expect, it } from "vitest";
import { DmcDma } from "./dmc-dma.js";

describe("DmcDma", () => {
  it("rejects invalid state without changing the transfer", () => {
    const dma = new DmcDma();
    dma.start(0xc123, "get");
    const before = dma.captureState();

    expect(() =>
      dma.restoreState({
        ...before,
        requested: 1 as unknown as boolean,
      }),
    ).toThrow(/request state/i);
    expect(dma.captureState()).toEqual(before);
  });
});
