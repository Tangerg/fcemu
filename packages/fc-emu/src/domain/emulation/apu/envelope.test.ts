import { describe, expect, it } from "vitest";
import { Envelope } from "./envelope.js";

describe("APU envelope", () => {
  it("waits period + 1 quarter frames between decay steps", () => {
    const envelope = new Envelope();
    envelope.configure(2);
    envelope.restart();

    envelope.clock();
    expect(envelope.output).toBe(15);
    envelope.clock();
    envelope.clock();
    expect(envelope.output).toBe(15);
    envelope.clock();
    expect(envelope.output).toBe(14);
  });

  it("loops from zero and can select constant volume", () => {
    const envelope = new Envelope();
    envelope.configure(0x20);
    envelope.restart();
    envelope.clock();
    for (let step = 0; step < 15; step++) envelope.clock();
    expect(envelope.output).toBe(0);
    envelope.clock();
    expect(envelope.output).toBe(15);

    envelope.configure(0x1b);
    expect(envelope.output).toBe(11);
  });

  it("rejects invalid state without changing the envelope", () => {
    const envelope = new Envelope();
    envelope.configure(0x2a);
    envelope.restart();
    envelope.clock();
    const before = envelope.captureState();

    expect(() => envelope.restoreState({ ...before, period: 16 })).toThrow(/envelope/i);
    expect(envelope.captureState()).toEqual(before);
  });
});
