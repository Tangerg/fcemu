import { isByte } from "../numeric-range.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

interface Vrc7SlotState {
  readonly phase: number;
  readonly currentOutput: number;
  readonly previousOutput: number;
  readonly envelopeState: number;
  readonly envelopeOutput: number;
  readonly keyOn: boolean;
}

export interface Vrc7AudioState {
  readonly reset: boolean;
  readonly selectedRegister: number;
  readonly registers: readonly number[];
  readonly divider: number;
  readonly output: number;
  readonly pmPhase: number;
  readonly amPhase: number;
  readonly envelopeCounter: number;
  readonly slots: readonly Vrc7SlotState[];
}

interface Vrc7Patch {
  readonly totalLevel: number;
  readonly feedback: number;
  readonly sustainedTone: number;
  readonly multiple: number;
  readonly attackRate: number;
  readonly decayRate: number;
  readonly sustainLevel: number;
  readonly releaseRate: number;
  readonly keyScaleRate: number;
  readonly keyScaleLevel: number;
  readonly tremolo: number;
  readonly vibrato: number;
  readonly rectifiedWave: number;
}

interface MutableVrc7Slot {
  phase: number;
  currentOutput: number;
  previousOutput: number;
  envelopeState: EnvelopeState;
  envelopeOutput: number;
  keyOn: boolean;
}

const enum EnvelopeState {
  Attack,
  Decay,
  Sustain,
  Release,
  Damp,
}

const CHANNEL_COUNT = 6;
const SLOT_COUNT = CHANNEL_COUNT * 2;
const OPLL_CPU_DIVIDER = 36;
const PHASE_MASK = (1 << 19) - 1;
const PHASE_TABLE_MASK = (1 << 10) - 1;
const ENVELOPE_MUTE = 127;
const ENVELOPE_END = 123;
const DAMPER_RATE = 12;
const TEST_REGISTER = 0x0f;

const MULTIPLIER_TABLE = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];
const KEY_LEVEL_TABLE = [
  0, 18, 24, 27.75, 30, 32.25, 33.75, 35.25, 36, 37.5, 38.25, 39, 39.75, 40.5, 41.25, 42,
];
const ENVELOPE_STEP_TABLES = [
  [0, 1, 0, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1],
] as const;
const PITCH_MODULATION_TABLE = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, -1, 0],
  [0, 1, 2, 1, 0, -1, -2, -1],
  [0, 1, 3, 1, 0, -1, -3, -1],
  [0, 2, 4, 2, 0, -2, -4, -2],
  [0, 2, 5, 2, 0, -2, -5, -2],
  [0, 3, 6, 3, 0, -3, -6, -3],
  [0, 3, 7, 3, 0, -3, -7, -3],
] as const;

// VRC7 instrument ROM, as recovered from the DS1001/VRC7 die.
const VRC7_PATCH_BYTES = [
  [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  [0x03, 0x21, 0x05, 0x06, 0xe8, 0x81, 0x42, 0x27],
  [0x13, 0x41, 0x14, 0x0d, 0xd8, 0xf6, 0x23, 0x12],
  [0x11, 0x11, 0x08, 0x08, 0xfa, 0xb2, 0x20, 0x12],
  [0x31, 0x61, 0x0c, 0x07, 0xa8, 0x64, 0x61, 0x27],
  [0x32, 0x21, 0x1e, 0x06, 0xe1, 0x76, 0x01, 0x28],
  [0x02, 0x01, 0x06, 0x00, 0xa3, 0xe2, 0xf4, 0xf4],
  [0x21, 0x61, 0x1d, 0x07, 0x82, 0x81, 0x11, 0x07],
  [0x23, 0x21, 0x22, 0x17, 0xa2, 0x72, 0x01, 0x17],
  [0x35, 0x11, 0x25, 0x00, 0x40, 0x73, 0x72, 0x01],
  [0xb5, 0x01, 0x0f, 0x0f, 0xa8, 0xa5, 0x51, 0x02],
  [0x17, 0xc1, 0x24, 0x07, 0xf8, 0xf8, 0x22, 0x12],
  [0x71, 0x23, 0x11, 0x06, 0x65, 0x74, 0x18, 0x16],
  [0x01, 0x02, 0xd3, 0x05, 0xc9, 0x95, 0x03, 0x02],
  [0x61, 0x63, 0x0c, 0x00, 0x94, 0xc0, 0x33, 0xf6],
  [0x21, 0x72, 0x0d, 0x00, 0xc1, 0xd5, 0x56, 0x06],
] as const;

const EXPONENT_TABLE = Array.from({ length: 256 }, (_, index) =>
  Math.round((2 ** (index / 256) - 1) * 1024),
);
const FULL_SINE_TABLE = createSineTable();
const HALF_SINE_TABLE = FULL_SINE_TABLE.map((value, index) => (index < 512 ? value : 0x0fff));
const AMPLITUDE_MODULATION_TABLE = createAmplitudeModulationTable();
const ROM_PATCHES = VRC7_PATCH_BYTES.map((bytes) => parsePatch(bytes));

/**
 * Six-channel VRC7 FM core.
 *
 * The synthesis path is a VRC7-only TypeScript adaptation of emu2413 1.5.9:
 * no rhythm mode, resampler, panning, YM2413 instruments or ninth channel are
 * carried into the mapper domain. One internal OPLL sample is produced every
 * 36 NTSC CPU clocks, matching the VRC7's 3.58 MHz oscillator / 72 divider.
 */
export class Vrc7Audio {
  private reset = false;
  private selectedRegister = 0;
  private registers = Array.from({ length: 0x40 }, () => 0);
  private divider = OPLL_CPU_DIVIDER;
  private currentOutput = 0;
  private pmPhase = 0;
  private amPhase = 0;
  private envelopeCounter = 0;
  private slots = Array.from({ length: SLOT_COUNT }, createSlot);
  private customPatches = parsePatch(VRC7_PATCH_BYTES[0]);

  powerOn(): void {
    this.resetSynth(false);
  }

  setReset(asserted: boolean): void {
    if (asserted && !this.reset) {
      const continuingPmPhase = this.pmPhase;
      this.resetSynth(true);
      this.pmPhase = continuingPmPhase;
    }
    this.reset = asserted;
    if (asserted) this.currentOutput = 0;
  }

  writeAddress(value: number): void {
    if (!this.reset) this.selectedRegister = value & 0xff;
  }

  writeData(value: number): void {
    if (this.reset || this.selectedRegister >= 0x40) return;
    this.writeRegister(this.selectedRegister, value & 0xff);
  }

  tick(): void {
    this.divider--;
    if (this.divider !== 0) return;
    this.divider = OPLL_CPU_DIVIDER;
    if (this.reset) {
      this.clockPitchLfo();
      this.currentOutput = 0;
      return;
    }
    this.clockSynth();
  }

  output(): number {
    return this.reset ? 0 : this.currentOutput / 32768;
  }

  captureState(): Vrc7AudioState {
    return {
      reset: this.reset,
      selectedRegister: this.selectedRegister,
      registers: [...this.registers],
      divider: this.divider,
      output: this.currentOutput,
      pmPhase: this.pmPhase,
      amPhase: this.amPhase,
      envelopeCounter: this.envelopeCounter,
      slots: this.slots.map((slot) => ({ ...slot })),
    };
  }

  restoreState(state: Vrc7AudioState): void {
    if (
      !areBooleans(state.reset) ||
      !isByte(state.selectedRegister) ||
      !isFixedByteArray(state.registers, 0x40) ||
      !isIntegerInRange(state.divider, 1, OPLL_CPU_DIVIDER) ||
      !isIntegerInRange(state.output, -0x8000, 0x7fff) ||
      !isIntegerInRange(state.pmPhase, 0, 0x1fff) ||
      !isIntegerInRange(state.amPhase, 0, AMPLITUDE_MODULATION_TABLE.length * 64 - 1) ||
      !isIntegerInRange(state.envelopeCounter, 0, 0xffff_ffff) ||
      !Array.isArray(state.slots) ||
      state.slots.length !== SLOT_COUNT ||
      !state.slots.every(isSlotState) ||
      !isCoherentAudioState(state)
    ) {
      throw new RangeError("VRC7 audio save state contains invalid FM state");
    }
    this.reset = state.reset;
    this.selectedRegister = state.selectedRegister;
    this.registers = [...state.registers];
    this.divider = state.divider;
    this.currentOutput = state.output;
    this.pmPhase = state.pmPhase;
    this.amPhase = state.amPhase;
    this.envelopeCounter = state.envelopeCounter;
    this.slots = state.slots.map((slot) => ({ ...slot })) as MutableVrc7Slot[];
    this.customPatches = parsePatch(this.registers);
  }

  private resetSynth(preserveReset: boolean): void {
    this.reset = preserveReset;
    this.selectedRegister = 0;
    this.registers.fill(0);
    this.divider = OPLL_CPU_DIVIDER;
    this.currentOutput = 0;
    this.pmPhase = 0;
    this.amPhase = 0;
    this.envelopeCounter = 0;
    this.slots = Array.from({ length: SLOT_COUNT }, createSlot);
    this.customPatches = parsePatch(VRC7_PATCH_BYTES[0]);
  }

  private writeRegister(register: number, value: number): void {
    if (!isImplementedRegister(register)) return;
    const previous = this.registers[register] ?? 0;
    this.registers[register] = value;
    if (register <= 0x07) this.customPatches = parsePatch(this.registers);
    if (register >= 0x20 && register <= 0x25 && ((previous ^ value) & 0x10) !== 0) {
      const channel = register - 0x20;
      this.setKeyOn(channel, (value & 0x10) !== 0);
    }
  }

  private setKeyOn(channel: number, keyOn: boolean): void {
    const modulator = this.slots[channel * 2]!;
    const carrier = this.slots[channel * 2 + 1]!;
    modulator.keyOn = keyOn;
    carrier.keyOn = keyOn;
    if (keyOn) {
      modulator.envelopeState = EnvelopeState.Damp;
      carrier.envelopeState = EnvelopeState.Damp;
    } else {
      carrier.envelopeState = EnvelopeState.Release;
    }
  }

  private clockSynth(): void {
    this.clockLfos();
    this.envelopeCounter = (this.envelopeCounter + 1) >>> 0;

    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      const modulator = this.slots[channel * 2]!;
      const carrier = this.slots[channel * 2 + 1]!;
      const [modulatorPatch, carrierPatch] = this.channelPatches(channel);
      this.clockEnvelope(modulator, carrier, modulatorPatch, channel, false);
      this.clockPhase(modulator, modulatorPatch, channel);
      this.clockEnvelope(carrier, modulator, carrierPatch, channel, true);
      this.clockPhase(carrier, carrierPatch, channel);
    }

    let mixed = 0;
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      const modulator = this.slots[channel * 2]!;
      const carrier = this.slots[channel * 2 + 1]!;
      const [modulatorPatch, carrierPatch] = this.channelPatches(channel);
      const modulatorOutput = this.clockOperator(
        modulator,
        modulatorPatch,
        channel,
        modulatorPatch.feedback === 0
          ? 0
          : (modulator.currentOutput + modulator.previousOutput) >> (9 - modulatorPatch.feedback),
      );
      const carrierOutput = this.clockOperator(
        carrier,
        carrierPatch,
        channel,
        2 * (modulatorOutput >> 1),
      );
      mixed += -carrierOutput >> 1;
    }
    this.currentOutput = Math.max(-0x8000, Math.min(0x7fff, mixed));
  }

  private clockLfos(): void {
    const test = this.registers[TEST_REGISTER] ?? 0;
    if ((test & 2) !== 0) {
      this.pmPhase = 0;
      this.amPhase = 0;
      return;
    }
    const fast = (test & 8) !== 0;
    this.pmPhase = (this.pmPhase + (fast ? 1024 : 1)) & 0x1fff;
    this.amPhase = (this.amPhase + (fast ? 64 : 1)) % (AMPLITUDE_MODULATION_TABLE.length * 64);
  }

  private clockPitchLfo(): void {
    this.pmPhase = (this.pmPhase + 1) & 0x1fff;
  }

  private clockPhase(slot: MutableVrc7Slot, patch: Vrc7Patch, channel: number): void {
    const test = this.registers[TEST_REGISTER] ?? 0;
    if ((test & 4) !== 0) slot.phase = 0;
    const fNumber = this.fNumber(channel);
    const pitch =
      patch.vibrato !== 0
        ? (PITCH_MODULATION_TABLE[(fNumber >>> 6) & 7]?.[(this.pmPhase >>> 10) & 7] ?? 0)
        : 0;
    const increment =
      ((((fNumber * 2 + pitch) * (MULTIPLIER_TABLE[patch.multiple] ?? 1)) << this.block(channel)) >>
        2) >>>
      0;
    slot.phase = (slot.phase + increment) & PHASE_MASK;
  }

  private clockEnvelope(
    slot: MutableVrc7Slot,
    buddy: MutableVrc7Slot,
    patch: Vrc7Patch,
    channel: number,
    carrier: boolean,
  ): void {
    const rks = this.keyScaleRate(channel, patch);
    const parameterRate = this.parameterRate(slot, patch, carrier, channel);
    const rateHigh = parameterRate === 0 ? 0 : Math.min(15, parameterRate + (rks >>> 2));
    const rateLow = parameterRate === 0 ? 0 : rks & 3;
    const shift =
      slot.envelopeState === EnvelopeState.Attack
        ? rateHigh > 0 && rateHigh < 12
          ? 13 - rateHigh
          : 0
        : rateHigh < 13
          ? 13 - rateHigh
          : 0;
    const mask = (1 << shift) - 1;

    if (slot.envelopeState === EnvelopeState.Attack) {
      if (slot.envelopeOutput > 0 && rateHigh > 0 && (this.envelopeCounter & mask & ~3) === 0) {
        const step = lookupAttackStep(rateHigh, rateLow, shift, this.envelopeCounter);
        if (step > 0) {
          slot.envelopeOutput = Math.max(
            0,
            slot.envelopeOutput - (slot.envelopeOutput >>> step) - 1,
          );
        }
      }
    } else if (rateHigh > 0 && (this.envelopeCounter & mask) === 0) {
      slot.envelopeOutput = Math.min(
        ENVELOPE_MUTE,
        slot.envelopeOutput + lookupDecayStep(rateHigh, rateLow, shift, this.envelopeCounter),
      );
    }

    if (slot.envelopeState === EnvelopeState.Damp) {
      if (slot.envelopeOutput >= ENVELOPE_END && (this.envelopeCounter & mask) === 0) {
        if (Math.min(15, patch.attackRate + (rks >>> 2)) === 15) {
          slot.envelopeState = EnvelopeState.Decay;
          slot.envelopeOutput = 0;
        } else {
          slot.envelopeState = EnvelopeState.Attack;
        }
        if (carrier) {
          slot.phase = 0;
          buddy.phase = 0;
        }
      }
    } else if (slot.envelopeState === EnvelopeState.Attack && slot.envelopeOutput === 0) {
      slot.envelopeState = EnvelopeState.Decay;
    } else if (
      slot.envelopeState === EnvelopeState.Decay &&
      slot.envelopeOutput >>> 3 === patch.sustainLevel
    ) {
      slot.envelopeState = EnvelopeState.Sustain;
    }

    if (((this.registers[TEST_REGISTER] ?? 0) & 1) !== 0) slot.envelopeOutput = 0;
  }

  private parameterRate(
    slot: MutableVrc7Slot,
    patch: Vrc7Patch,
    carrier: boolean,
    channel: number,
  ): number {
    if (!carrier && !slot.keyOn) return 0;
    switch (slot.envelopeState) {
      case EnvelopeState.Attack:
        return patch.attackRate;
      case EnvelopeState.Decay:
        return patch.decayRate;
      case EnvelopeState.Sustain:
        return patch.sustainedTone !== 0 ? 0 : patch.releaseRate;
      case EnvelopeState.Release:
        if (((this.registers[0x20 + channel] ?? 0) & 0x20) !== 0) return 5;
        return patch.sustainedTone !== 0 ? patch.releaseRate : 7;
      case EnvelopeState.Damp:
        return DAMPER_RATE;
    }
  }

  private clockOperator(
    slot: MutableVrc7Slot,
    patch: Vrc7Patch,
    channel: number,
    modulation: number,
  ): number {
    slot.previousOutput = slot.currentOutput;
    if (slot.envelopeOutput > ENVELOPE_END) {
      slot.currentOutput = 0;
      return 0;
    }
    const phase = ((slot.phase >>> 9) + modulation) & PHASE_TABLE_MASK;
    const wave = patch.rectifiedWave !== 0 ? HALF_SINE_TABLE : FULL_SINE_TABLE;
    const amplitudeModulation =
      patch.tremolo !== 0 ? (AMPLITUDE_MODULATION_TABLE[this.amPhase >>> 6] ?? 0) : 0;
    const totalLevel = this.totalLevel(slot, patch, channel);
    const attenuation =
      Math.min(ENVELOPE_MUTE, slot.envelopeOutput + totalLevel + amplitudeModulation) << 4;
    slot.currentOutput = lookupExponent((wave[phase] ?? 0x0fff) + attenuation);
    return slot.currentOutput;
  }

  private totalLevel(slot: MutableVrc7Slot, patch: Vrc7Patch, channel: number): number {
    const fNumber = this.fNumber(channel);
    const block = this.block(channel);
    const carrier = this.slots[channel * 2 + 1] === slot;
    const level = carrier ? ((this.registers[0x30 + channel] ?? 0) & 0x0f) << 2 : patch.totalLevel;
    if (patch.keyScaleLevel === 0) return level << 1;
    const keyLevel = (KEY_LEVEL_TABLE[fNumber >>> 5] ?? 0) - 6 * (7 - block);
    if (keyLevel <= 0) return level << 1;
    const scaledKeyLevel = Math.trunc(keyLevel) >> (3 - patch.keyScaleLevel);
    return Math.trunc(scaledKeyLevel / 0.375) + (level << 1);
  }

  private channelPatches(channel: number): readonly [Vrc7Patch, Vrc7Patch] {
    const instrument = (this.registers[0x30 + channel] ?? 0) >>> 4;
    if (instrument !== 0) return ROM_PATCHES[instrument]!;
    return this.customPatches;
  }

  private fNumber(channel: number): number {
    return (
      (this.registers[0x10 + channel] ?? 0) | (((this.registers[0x20 + channel] ?? 0) & 1) << 8)
    );
  }

  private block(channel: number): number {
    return ((this.registers[0x20 + channel] ?? 0) >>> 1) & 7;
  }

  private keyScaleRate(channel: number, patch: Vrc7Patch): number {
    const blockAndMsb = (this.block(channel) << 1) | (this.fNumber(channel) >>> 8);
    return patch.keyScaleRate !== 0 ? blockAndMsb : blockAndMsb >>> 2;
  }
}

function parsePatch(bytes: readonly number[]): readonly [Vrc7Patch, Vrc7Patch] {
  return [
    {
      tremolo: (bytes[0]! >>> 7) & 1,
      vibrato: (bytes[0]! >>> 6) & 1,
      sustainedTone: (bytes[0]! >>> 5) & 1,
      keyScaleRate: (bytes[0]! >>> 4) & 1,
      multiple: bytes[0]! & 0x0f,
      keyScaleLevel: (bytes[2]! >>> 6) & 3,
      totalLevel: bytes[2]! & 0x3f,
      feedback: bytes[3]! & 7,
      rectifiedWave: (bytes[3]! >>> 3) & 1,
      attackRate: (bytes[4]! >>> 4) & 0x0f,
      decayRate: bytes[4]! & 0x0f,
      sustainLevel: (bytes[6]! >>> 4) & 0x0f,
      releaseRate: bytes[6]! & 0x0f,
    },
    {
      tremolo: (bytes[1]! >>> 7) & 1,
      vibrato: (bytes[1]! >>> 6) & 1,
      sustainedTone: (bytes[1]! >>> 5) & 1,
      keyScaleRate: (bytes[1]! >>> 4) & 1,
      multiple: bytes[1]! & 0x0f,
      keyScaleLevel: (bytes[3]! >>> 6) & 3,
      totalLevel: 0,
      feedback: 0,
      rectifiedWave: (bytes[3]! >>> 4) & 1,
      attackRate: (bytes[5]! >>> 4) & 0x0f,
      decayRate: bytes[5]! & 0x0f,
      sustainLevel: (bytes[7]! >>> 4) & 0x0f,
      releaseRate: bytes[7]! & 0x0f,
    },
  ];
}

function createSlot(): MutableVrc7Slot {
  return {
    phase: 0,
    currentOutput: 0,
    previousOutput: 0,
    envelopeState: EnvelopeState.Release,
    envelopeOutput: ENVELOPE_MUTE,
    keyOn: false,
  };
}

function createSineTable(): number[] {
  const table = Array.from({ length: 1024 }, () => 0);
  for (let index = 0; index < 256; index++) {
    table[index] = Math.round(-Math.log2(Math.sin(((index + 0.5) * Math.PI) / 512)) * 256);
  }
  for (let index = 0; index < 256; index++) table[256 + index] = table[255 - index]!;
  for (let index = 0; index < 512; index++) table[512 + index] = 0x8000 | table[index]!;
  return table;
}

function createAmplitudeModulationTable(): number[] {
  const rising = Array.from({ length: 13 }, (_, level) => Array<number>(8).fill(level)).flat();
  return [...rising, 13, 13, 13, ...[...rising].reverse().slice(0, -1)];
}

function lookupAttackStep(
  rateHigh: number,
  rateLow: number,
  shift: number,
  counter: number,
): number {
  const table = ENVELOPE_STEP_TABLES[rateLow]!;
  if (rateHigh >= 12 && rateHigh <= 14) {
    const index = (counter & 0x0c) >>> 1;
    return 16 - rateHigh - (table[index] ?? 0);
  }
  if (rateHigh === 0 || rateHigh === 15) return 0;
  return table[(counter >>> shift) & 7] ? 4 : 0;
}

function lookupDecayStep(
  rateHigh: number,
  rateLow: number,
  shift: number,
  counter: number,
): number {
  const table = ENVELOPE_STEP_TABLES[rateLow]!;
  if (rateHigh === 0) return 0;
  if (rateHigh === 13) {
    return table[(((counter & 0x0c) >>> 1) | (counter & 1)) & 7] ?? 0;
  }
  if (rateHigh === 14) return (table[(counter & 0x0c) >>> 1] ?? 0) + 1;
  if (rateHigh === 15) return 2;
  return table[(counter >>> shift) & 7] ?? 0;
}

function lookupExponent(value: number): number {
  const base = (EXPONENT_TABLE[(value & 0xff) ^ 0xff] ?? 0) + 1024;
  const result = base >>> ((value & 0x7f00) >>> 8);
  return ((value & 0x8000) !== 0 ? ~result : result) << 1;
}

function isImplementedRegister(register: number): boolean {
  return (
    (register >= 0x00 && register <= 0x07) ||
    register === TEST_REGISTER ||
    (register >= 0x10 && register <= 0x15) ||
    (register >= 0x20 && register <= 0x25) ||
    (register >= 0x30 && register <= 0x35)
  );
}

function isSlotState(state: unknown): state is Vrc7SlotState {
  if (typeof state !== "object" || state === null) return false;
  const slot = state as Partial<Vrc7SlotState>;
  return (
    isIntegerInRange(slot.phase, 0, PHASE_MASK) &&
    isIntegerInRange(slot.currentOutput, -4096, 4094) &&
    isIntegerInRange(slot.previousOutput, -4096, 4094) &&
    isIntegerInRange(slot.envelopeState, EnvelopeState.Attack, EnvelopeState.Damp) &&
    isIntegerInRange(slot.envelopeOutput, 0, ENVELOPE_MUTE) &&
    areBooleans(slot.keyOn)
  );
}

function isCoherentAudioState(state: Vrc7AudioState): boolean {
  if (state.registers.some((value, register) => !isImplementedRegister(register) && value !== 0)) {
    return false;
  }
  for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
    const keyOn = ((state.registers[0x20 + channel] ?? 0) & 0x10) !== 0;
    if (
      state.slots[channel * 2]?.keyOn !== keyOn ||
      state.slots[channel * 2 + 1]?.keyOn !== keyOn
    ) {
      return false;
    }
  }
  if (!state.reset) return true;
  return (
    state.selectedRegister === 0 &&
    state.output === 0 &&
    state.amPhase === 0 &&
    state.envelopeCounter === 0 &&
    state.registers.every((value) => value === 0) &&
    state.slots.every(
      (slot) =>
        slot.phase === 0 &&
        slot.currentOutput === 0 &&
        slot.previousOutput === 0 &&
        slot.envelopeState === EnvelopeState.Release &&
        slot.envelopeOutput === ENVELOPE_MUTE &&
        !slot.keyOn,
    )
  );
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}
