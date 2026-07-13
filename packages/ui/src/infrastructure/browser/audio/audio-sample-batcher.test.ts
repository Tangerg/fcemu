import { describe, expect, it, vi } from "vitest";
import { AudioSampleBatcher } from "./audio-sample-batcher.js";

describe("AudioSampleBatcher", () => {
  it("emits fixed-size transferable batches and clamps invalid samples", () => {
    const emit = vi.fn<(samples: Float32Array<ArrayBuffer>) => void>();
    const batcher = new AudioSampleBatcher(4, emit);

    batcher.write(-2);
    batcher.write(0.25);
    batcher.write(Number.NaN);
    expect(emit).not.toHaveBeenCalled();
    batcher.write(2);

    expect(emit).toHaveBeenCalledOnce();
    expect([...emit.mock.calls[0]![0]]).toEqual([-1, 0.25, 0, 1]);
    expect(batcher.pendingSamples).toBe(0);
  });

  it("discards a partial batch when the audio lifecycle resets", () => {
    const emit = vi.fn<(samples: Float32Array<ArrayBuffer>) => void>();
    const batcher = new AudioSampleBatcher(2, emit);
    batcher.write(0.5);

    batcher.reset();
    batcher.write(0.75);

    expect(emit).not.toHaveBeenCalled();
    expect(batcher.pendingSamples).toBe(1);
  });
});
