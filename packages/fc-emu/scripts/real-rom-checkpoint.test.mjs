import { describe, expect, it } from "vitest";
import { summarizeRealRomCheckpoint } from "./real-rom-checkpoint.mjs";

describe("real-ROM mapper checkpoints", () => {
  it("hashes only the bytes exposed by a typed-array view", () => {
    const backing = Uint8Array.from([0xaa, 1, 2, 3, 0xbb]);

    expect(summarizeRealRomCheckpoint({ kind: "fixture", memory: backing.subarray(1, 4) })).toEqual(
      {
        kind: "fixture",
        memory: {
          type: "Uint8Array",
          byteLength: 3,
          sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
        },
      },
    );
  });

  it("preserves ordinary nested mapper state", () => {
    const state = {
      kind: "fixture",
      banks: [1, 2, 3],
      irq: { enabled: true, counter: 7 },
    };

    expect(summarizeRealRomCheckpoint(state)).toEqual(state);
    expect(summarizeRealRomCheckpoint(state)).not.toBe(state);
  });
});
