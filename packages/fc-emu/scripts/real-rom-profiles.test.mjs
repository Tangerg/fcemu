import { describe, expect, it } from "vitest";
import { REAL_ROM_PROFILES, validateRealRomProfiles } from "./real-rom-profiles.mjs";

const BUTTON_NAMES = ["a", "b", "start", "up", "down", "left", "right"];

describe("real-ROM profile validation", () => {
  it("accepts the committed profile catalog", () => {
    expect(() => validateRealRomProfiles(REAL_ROM_PROFILES, BUTTON_NAMES)).not.toThrow();
  });

  it("rejects path-bearing fixture names", () => {
    const profiles = cloneOneProfile();
    profiles.fixture.fileName = "../fixture.nes";

    expect(() => validateRealRomProfiles(profiles, BUTTON_NAMES)).toThrowError(/fileName.*path/);
  });

  it("rejects unknown buttons and unsorted input events", () => {
    const unknownButton = cloneOneProfile();
    unknownButton.fixture.interactive.events[0].button = "turbo";
    expect(() => validateRealRomProfiles(unknownButton, BUTTON_NAMES)).toThrowError(
      /button.*unknown/,
    );

    const unsorted = cloneOneProfile();
    unsorted.fixture.interactive.events[1].frame = unsorted.fixture.interactive.events[0].frame - 1;
    expect(() => validateRealRomProfiles(unsorted, BUTTON_NAMES)).toThrowError(/sorted by frame/);
  });

  it("rejects invalid checkpoints and mismatched final frames", () => {
    const outsideScenario = cloneOneProfile();
    outsideScenario.fixture.interactive.checkpoints[9999] = "0".repeat(64);
    expect(() => validateRealRomProfiles(outsideScenario, BUTTON_NAMES)).toThrowError(
      /invalid frame 9999/,
    );

    const mismatchedFinal = cloneOneProfile();
    mismatchedFinal.fixture.interactive.checkpoints[mismatchedFinal.fixture.interactive.frames] =
      "0".repeat(64);
    expect(() => validateRealRomProfiles(mismatchedFinal, BUTTON_NAMES)).toThrowError(
      /final checkpoint/,
    );
  });

  it("rejects replay segments outside the pinned interactive timeline", () => {
    const profiles = cloneOneProfile();
    profiles.fixture.replay.frames = profiles.fixture.interactive.frames;

    expect(() => validateRealRomProfiles(profiles, BUTTON_NAMES)).toThrowError(
      /replay segment exceeds/,
    );
  });
});

function cloneOneProfile() {
  return { fixture: structuredClone(REAL_ROM_PROFILES.dbz5) };
}
