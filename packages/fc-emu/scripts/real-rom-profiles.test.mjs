import { describe, expect, it } from "vitest";
import { REAL_ROM_PROFILES, validateRealRomProfiles } from "./real-rom-profiles.mjs";

const BUTTON_NAMES = ["a", "b", "select", "start", "up", "down", "left", "right"];

describe("real-ROM profile validation", () => {
  it("accepts the committed profile catalog", () => {
    expect(() => validateRealRomProfiles(REAL_ROM_PROFILES, BUTTON_NAMES)).not.toThrow();
  });

  it("rejects path-bearing fixture names", () => {
    const profiles = cloneOneProfile();
    profiles.fixture.fileName = "../fixture.nes";

    expect(() => validateRealRomProfiles(profiles, BUTTON_NAMES)).toThrowError(/fileName.*path/);
  });

  it("rejects missing and unknown cartridge metadata fields", () => {
    const missing = cloneOneProfile();
    delete missing.fixture.cartridge.consoleRegion;
    expect(() => validateRealRomProfiles(missing, BUTTON_NAMES)).toThrowError(
      /missing required field consoleRegion/,
    );

    const unknown = cloneOneProfile();
    unknown.fixture.cartridge.prgROMBytes = unknown.fixture.cartridge.prgRomBytes;
    expect(() => validateRealRomProfiles(unknown, BUTTON_NAMES)).toThrowError(
      /unknown field prgROMBytes/,
    );
  });

  it("rejects invalid cartridge metadata values", () => {
    const format = cloneOneProfile();
    format.fixture.cartridge.format = "unif";
    expect(() => validateRealRomProfiles(format, BUTTON_NAMES)).toThrowError(
      /cartridge\.format.*one of ines, nes2/,
    );

    const mapper = cloneOneProfile();
    mapper.fixture.cartridge.mapperNumber = 0x1000;
    expect(() => validateRealRomProfiles(mapper, BUTTON_NAMES)).toThrowError(
      /cartridge\.mapperNumber.*between 0 and 4095/,
    );

    const battery = cloneOneProfile();
    battery.fixture.cartridge.hasBatteryBackup = 1;
    expect(() => validateRealRomProfiles(battery, BUTTON_NAMES)).toThrowError(
      /cartridge\.hasBatteryBackup.*boolean/,
    );
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

  it("accepts coin events and rejects ambiguous cabinet input", () => {
    const coin = cloneOneProfile();
    coin.fixture.interactive.events[0] = { frame: 1, coin: 1 };
    expect(() => validateRealRomProfiles(coin, BUTTON_NAMES)).not.toThrow();

    const invalidSlot = cloneOneProfile();
    invalidSlot.fixture.interactive.events[0] = { frame: 1, coin: 3 };
    expect(() => validateRealRomProfiles(invalidSlot, BUTTON_NAMES)).toThrowError(
      /coin.*between 1 and 2/,
    );

    const hybrid = cloneOneProfile();
    hybrid.fixture.interactive.events[0] = {
      frame: 1,
      coin: 1,
      button: "start",
      pressed: true,
    };
    expect(() => validateRealRomProfiles(hybrid, BUTTON_NAMES)).toThrowError(
      /exactly one controller, coin or tablet event/,
    );
  });

  it("accepts native tablet reports and rejects impossible stylus input", () => {
    const tablet = cloneOneProfile();
    tablet.fixture.interactive.events[0] = {
      frame: 1,
      tablet: { x: 239, y: 255, touching: true, clicked: true },
    };
    expect(() => validateRealRomProfiles(tablet, BUTTON_NAMES)).not.toThrow();

    const invalidCoordinate = cloneOneProfile();
    invalidCoordinate.fixture.interactive.events[0] = {
      frame: 1,
      tablet: { x: 240, y: 0, touching: true, clicked: false },
    };
    expect(() => validateRealRomProfiles(invalidCoordinate, BUTTON_NAMES)).toThrowError(
      /tablet\.x.*between 0 and 239/,
    );

    const impossibleClick = cloneOneProfile();
    impossibleClick.fixture.interactive.events[0] = {
      frame: 1,
      tablet: { x: 0, y: 0, touching: false, clicked: true },
    };
    expect(() => validateRealRomProfiles(impossibleClick, BUTTON_NAMES)).toThrowError(
      /cannot click without touching/,
    );
  });

  it("rejects unknown input-event fields", () => {
    const profiles = cloneOneProfile();
    profiles.fixture.interactive.events[0].player = 2;

    expect(() => validateRealRomProfiles(profiles, BUTTON_NAMES)).toThrowError(
      /unknown field player/,
    );
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

  it("rejects malformed mapper-state checkpoints", () => {
    const outsideScenario = cloneOneProfile();
    outsideScenario.fixture.interactive.mapperCheckpoints = { 9999: { kind: "mmc3" } };
    expect(() => validateRealRomProfiles(outsideScenario, BUTTON_NAMES)).toThrowError(
      /mapperCheckpoints contains invalid frame 9999/,
    );

    const missingKind = cloneOneProfile();
    missingKind.fixture.interactive.mapperCheckpoints = { 1: { prgBank: 2 } };
    expect(() => validateRealRomProfiles(missingKind, BUTTON_NAMES)).toThrowError(
      /mapperCheckpoints\.1.*mapper kind/,
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
