import { describe, expect, it } from "vitest";
import { AUDIO_BATCH_SIZE, createAudioBufferPolicy } from "./audio-buffer-policy.js";

describe("createAudioBufferPolicy", () => {
  it.each([
    [44_100, 1024, 8192],
    [48_000, 1024, 9216],
    [96_000, 2048, 17_920],
  ])("keeps time-based latency targets at %i Hz", (sampleRate, startThreshold, ringCapacity) => {
    const policy = createAudioBufferPolicy(sampleRate);

    expect(policy).toMatchObject({ startThreshold, ringCapacity });
    expect(policy.startThreshold % AUDIO_BATCH_SIZE).toBe(0);
    expect(policy.ringCapacity % AUDIO_BATCH_SIZE).toBe(0);
    expect(policy.startThreshold / sampleRate).toBeGreaterThanOrEqual(0.02);
    expect(policy.startThreshold / sampleRate).toBeLessThan(0.02 + AUDIO_BATCH_SIZE / sampleRate);
    expect(policy.ringCapacity / sampleRate).toBeGreaterThanOrEqual(0.185);
    expect(policy.ringCapacity / sampleRate).toBeLessThan(0.185 + AUDIO_BATCH_SIZE / sampleRate);
  });

  it("rejects invalid device rates", () => {
    expect(() => createAudioBufferPolicy(0)).toThrow(RangeError);
    expect(() => createAudioBufferPolicy(Number.NaN)).toThrow(RangeError);
  });
});
