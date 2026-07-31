import { describe, expect, it } from "vitest";
import { Vrc7Audio } from "./vrc7-audio.js";

describe("Vrc7Audio", () => {
  it("clocks the six-channel OPLL at one sample per 36 CPU cycles", () => {
    const audio = createPlayingAudio();
    const initial = audio.captureState();

    for (let cycle = 0; cycle < 35; cycle++) audio.tick();
    expect(audio.captureState()).toMatchObject({
      divider: 1,
      envelopeCounter: initial.envelopeCounter,
      pmPhase: initial.pmPhase,
    });
    audio.tick();
    expect(audio.captureState()).toMatchObject({
      divider: 36,
      envelopeCounter: initial.envelopeCounter + 1,
      pmPhase: initial.pmPhase + 1,
    });

    for (let cycle = 0; cycle < 36 * 600; cycle++) audio.tick();
    expect(audio.output()).not.toBe(0);
    expect(Number.isFinite(audio.output())).toBe(true);
  });

  it("supports the shared custom patch and all six melodic register groups", () => {
    const audio = new Vrc7Audio();
    audio.powerOn();
    const customPatch = [0x71, 0x61, 0x1e, 0x17, 0xf0, 0xf0, 0x17, 0x17];
    for (let register = 0; register < customPatch.length; register++) {
      writeRegister(audio, register, customPatch[register]!);
    }
    for (let channel = 0; channel < 6; channel++) {
      writeRegister(audio, 0x10 + channel, 0x80 + channel);
      writeRegister(audio, 0x20 + channel, 0x19);
      writeRegister(audio, 0x30 + channel, channel);
    }
    let heardOutput = false;
    for (let cycle = 0; cycle < 36 * 1000; cycle++) {
      audio.tick();
      heardOutput ||= audio.output() !== 0;
    }

    expect(audio.captureState().registers.slice(0, 8)).toEqual(customPatch);
    expect(audio.captureState().slots.every((slot) => slot.keyOn)).toBe(true);
    expect(audio.captureState().slots.some((slot) => slot.phase !== 0)).toBe(true);
    expect(heardOutput).toBe(true);
  });

  it("holds reset silent, clears registers and tremolo state, but lets vibrato keep running", () => {
    const audio = createPlayingAudio();
    for (let cycle = 0; cycle < 36 * 20; cycle++) audio.tick();
    const beforeReset = audio.captureState();

    audio.setReset(true);
    const reset = audio.captureState();
    expect(reset.reset).toBe(true);
    expect(reset.output).toBe(0);
    expect(reset.registers.every((value) => value === 0)).toBe(true);
    expect(reset.amPhase).toBe(0);
    expect(reset.pmPhase).toBe(beforeReset.pmPhase);

    writeRegister(audio, 0x30, 0x10);
    for (let cycle = 0; cycle < 36; cycle++) audio.tick();
    expect(audio.captureState().registers[0x30]).toBe(0);
    expect(audio.captureState().pmPhase).toBe((beforeReset.pmPhase + 1) & 0x1fff);
    expect(audio.output()).toBe(0);

    audio.setReset(false);
    expect(audio.output()).toBe(0);
  });

  it("round-trips every FM phase and rejects unreachable snapshots", () => {
    const audio = createPlayingAudio();
    for (let cycle = 0; cycle < 36 * 80 + 7; cycle++) audio.tick();
    const state = audio.captureState();

    audio.powerOn();
    audio.restoreState(state);
    expect(audio.captureState()).toEqual(state);

    expect(() => audio.restoreState({ ...state, divider: 0 })).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({ ...state, registers: state.registers.slice(1) }),
    ).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({
        ...state,
        slots: state.slots.map((slot, index) =>
          index === 0 ? { ...slot, envelopeOutput: 128 } : slot,
        ),
      }),
    ).toThrowError(RangeError);
    expect(() =>
      audio.restoreState({
        ...state,
        slots: state.slots.map((slot, index) => (index === 0 ? { ...slot, keyOn: false } : slot)),
      }),
    ).toThrowError(RangeError);
    expect(() => audio.restoreState({ ...state, reset: true, output: 1 })).toThrowError(RangeError);
  });
});

function createPlayingAudio(): Vrc7Audio {
  const audio = new Vrc7Audio();
  audio.powerOn();
  writeRegister(audio, 0x10, 0xff);
  writeRegister(audio, 0x20, 0x19);
  writeRegister(audio, 0x30, 0x10);
  return audio;
}

function writeRegister(audio: Vrc7Audio, register: number, value: number): void {
  audio.writeAddress(register);
  audio.writeData(value);
}
