import { describe, expect, it } from "vitest";
import { Vrc6Audio } from "./vrc6-audio.js";

describe("Vrc6Audio", () => {
  it("clocks the descending 16-step pulse duty generator and supports constant-volume mode", () => {
    const audio = new Vrc6Audio();
    audio.writeRegister(0x9000, 0x05);
    audio.writeRegister(0x9002, 0x80);

    audio.tick();
    expect(audio.captureState().pulse1.dutyStep).toBe(15);
    expect(audio.output()).toBe(0);
    for (let step = 0; step < 15; step++) audio.tick();
    expect(audio.captureState().pulse1.dutyStep).toBe(0);
    expect(audio.output()).toBeLessThan(-0.04);

    audio.writeRegister(0x9000, 0x8f);
    expect(audio.output()).toBeLessThan(-0.14);
    audio.writeRegister(0x9002, 0);
    expect(audio.output()).toBe(0);
  });

  it("advances the saw accumulator on even steps and resets on the fourteenth", () => {
    const audio = new Vrc6Audio();
    audio.writeRegister(0xb000, 8);
    audio.writeRegister(0xb002, 0x80);

    audio.tick();
    expect(audio.captureState().saw).toMatchObject({ step: 1, accumulator: 0 });
    audio.tick();
    expect(audio.captureState().saw).toMatchObject({ step: 2, accumulator: 8 });
    expect(audio.output()).toBeLessThan(0);
    for (let step = 2; step < 14; step++) audio.tick();
    expect(audio.captureState().saw).toMatchObject({ step: 0, accumulator: 0 });
    expect(audio.output()).toBe(0);
  });

  it("applies shared halt and frequency scaling without losing oscillator phase", () => {
    const audio = new Vrc6Audio();
    audio.writeRegister(0x9000, 0x8f);
    audio.writeRegister(0x9001, 0x40);
    audio.writeRegister(0x9002, 0x81);
    audio.tick();
    const running = audio.captureState();
    expect(running.pulse1).toMatchObject({ divider: 0x140, dutyStep: 15 });

    audio.writeRegister(0x9003, 1);
    for (let cycle = 0; cycle < 20; cycle++) audio.tick();
    expect(audio.captureState().pulse1).toEqual(running.pulse1);

    audio.writeRegister(0x9003, 4);
    audio.tick();
    expect(audio.captureState().pulse1.divider).toBe(0x13f);
    for (let cycle = 0; cycle < 0x13f; cycle++) audio.tick();
    audio.tick();
    expect(audio.captureState().pulse1.divider).toBe(1);
  });

  it("immediately resets and halts a disabled pulse duty generator without resetting its divider", () => {
    const audio = new Vrc6Audio();
    audio.writeRegister(0x9000, 0x05);
    audio.writeRegister(0x9001, 2);
    audio.writeRegister(0x9002, 0x80);
    audio.tick();
    expect(audio.captureState().pulse1).toMatchObject({ divider: 2, dutyStep: 15 });

    audio.writeRegister(0x9002, 0);
    expect(audio.captureState().pulse1).toMatchObject({ divider: 2, dutyStep: 0, enabled: false });
    expect(audio.output()).toBe(0);
    for (let cycle = 0; cycle < 3; cycle++) audio.tick();
    expect(audio.captureState().pulse1).toMatchObject({ divider: 2, dutyStep: 0 });

    audio.writeRegister(0x9002, 0x80);
    expect(audio.output()).toBeLessThan(0);
    for (let cycle = 0; cycle < 3; cycle++) audio.tick();
    expect(audio.captureState().pulse1).toMatchObject({ divider: 2, dutyStep: 15 });
  });

  it("round-trips oscillator state and rejects unreachable snapshots", () => {
    const audio = new Vrc6Audio();
    audio.writeRegister(0x9000, 0x75);
    audio.writeRegister(0x9001, 0x34);
    audio.writeRegister(0x9002, 0x82);
    audio.writeRegister(0xa000, 0x8a);
    audio.writeRegister(0xa002, 0x80);
    audio.writeRegister(0xb000, 0x2a);
    audio.writeRegister(0xb002, 0x80);
    for (let cycle = 0; cycle < 5; cycle++) audio.tick();
    const state = audio.captureState();

    audio.powerOn();
    audio.restoreState(state);
    expect(audio.captureState()).toEqual(state);

    expect(() => audio.restoreState({ ...state, frequencyControl: 8 })).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({ ...state, pulse1: { ...state.pulse1, period: 0x1000 } }),
    ).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({
        ...state,
        pulse1: { ...state.pulse1, enabled: false, dutyStep: 1 },
      }),
    ).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({
        ...state,
        saw: { ...state.saw, enabled: false, accumulator: 1 },
      }),
    ).toThrowError(RangeError);
  });
});
