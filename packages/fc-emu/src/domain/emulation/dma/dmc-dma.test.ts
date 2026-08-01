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

  it("rejects transfer addresses that contradict the request phase", () => {
    const dma = new DmcDma();
    const before = dma.captureState();

    for (const invalid of [
      { ...before, address: 1 },
      { ...before, haltAddress: 1 },
      { ...before, address: 0x7fff, requested: true, haltPhase: "get" as const },
      {
        ...before,
        address: 0xc000,
        haltAddress: 0x8000,
        requested: true,
        haltPhase: "get" as const,
      },
    ]) {
      expect(() => dma.restoreState(invalid)).toThrow(/transfer addresses/i);
      expect(dma.captureState()).toEqual(before);
    }
  });
});
