import { describe, expect, it } from "vitest";
import { RebufferingAudioRing } from "./rebuffering-audio-ring.js";

describe("RebufferingAudioRing", () => {
  it("waits for its threshold before starting and rebuffering after an underrun", () => {
    const ring = new RebufferingAudioRing(8, 4);
    const output = new Float32Array(3);

    ring.push(Float32Array.from([1, 2, 3]));
    expect(ring.pull(output)).toEqual({ writtenSamples: 0, underrunStarted: false });
    expect([...output]).toEqual([0, 0, 0]);

    ring.push(Float32Array.from([4]));
    expect(ring.pull(output)).toEqual({ writtenSamples: 3, underrunStarted: false });
    expect([...output]).toEqual([1, 2, 3]);
    expect(ring.pull(output)).toEqual({ writtenSamples: 1, underrunStarted: true });
    expect([...output]).toEqual([4, 0, 0]);

    ring.push(Float32Array.from([5, 6, 7]));
    expect(ring.pull(output).writtenSamples).toBe(0);
  });

  it("drops oldest samples on overflow to keep real-time latency bounded", () => {
    const ring = new RebufferingAudioRing(4, 1);
    ring.push(Float32Array.from([1, 2, 3]));

    expect(ring.push(Float32Array.from([4, 5, 6]))).toBe(2);

    const output = new Float32Array(4);
    expect(ring.pull(output).writtenSamples).toBe(4);
    expect([...output]).toEqual([3, 4, 5, 6]);
  });

  it("retains only the newest capacity-sized suffix of an oversized batch", () => {
    const ring = new RebufferingAudioRing(3, 1);
    ring.push(Float32Array.from([9, 10]));

    expect(ring.push(Float32Array.from([1, 2, 3, 4, 5]))).toBe(4);

    const output = new Float32Array(3);
    ring.pull(output);
    expect([...output]).toEqual([3, 4, 5]);
  });
});
