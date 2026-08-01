import { isByte } from "../numeric-range.js";
import { areBooleans } from "./state-validation.js";

interface Vrc6PulseState {
  readonly control: number;
  readonly period: number;
  readonly divider: number;
  readonly dutyStep: number;
  readonly enabled: boolean;
}

interface Vrc6SawState {
  readonly rate: number;
  readonly period: number;
  readonly divider: number;
  readonly step: number;
  readonly accumulator: number;
  readonly enabled: boolean;
}

export interface Vrc6AudioState {
  readonly frequencyControl: number;
  readonly pulse1: Vrc6PulseState;
  readonly pulse2: Vrc6PulseState;
  readonly saw: Vrc6SawState;
}

const VRC6_DAC_STEP = 95.52 / (8128 / 15 + 100) / 15;

/**
 * The VRC6's two pulse oscillators, saw accumulator and shared linear DAC.
 *
 * The chip is clocked on every CPU M2 cycle. Its output scale follows the
 * measured relationship that one maximum VRC6 pulse is approximately as loud
 * as one maximum RP2A03 pulse; polarity is inverted by the cartridge circuit.
 */
export class Vrc6Audio {
  private frequencyControl = 0;
  private pulse1 = createPulseState();
  private pulse2 = createPulseState();
  private saw = createSawState();

  powerOn(): void {
    this.frequencyControl = 0;
    this.pulse1 = createPulseState();
    this.pulse2 = createPulseState();
    this.saw = createSawState();
  }

  tick(): void {
    if ((this.frequencyControl & 1) !== 0) return;
    const shift = (this.frequencyControl & 4) !== 0 ? 8 : (this.frequencyControl & 2) !== 0 ? 4 : 0;
    this.clockPulse(this.pulse1, shift);
    this.clockPulse(this.pulse2, shift);
    this.clockSaw(shift);
  }

  writeRegister(address: number, value: number): void {
    value &= 0xff;
    switch (address) {
      case 0x9000:
        this.pulse1.control = value;
        break;
      case 0x9001:
        this.pulse1.period = (this.pulse1.period & 0x0f00) | value;
        break;
      case 0x9002:
        this.pulse1.period = (this.pulse1.period & 0x00ff) | ((value & 0x0f) << 8);
        this.pulse1.enabled = (value & 0x80) !== 0;
        break;
      case 0x9003:
        this.frequencyControl = value & 7;
        break;
      case 0xa000:
        this.pulse2.control = value;
        break;
      case 0xa001:
        this.pulse2.period = (this.pulse2.period & 0x0f00) | value;
        break;
      case 0xa002:
        this.pulse2.period = (this.pulse2.period & 0x00ff) | ((value & 0x0f) << 8);
        this.pulse2.enabled = (value & 0x80) !== 0;
        break;
      case 0xb000:
        this.saw.rate = value & 0x3f;
        break;
      case 0xb001:
        this.saw.period = (this.saw.period & 0x0f00) | value;
        break;
      case 0xb002:
        this.saw.period = (this.saw.period & 0x00ff) | ((value & 0x0f) << 8);
        this.saw.enabled = (value & 0x80) !== 0;
        if (!this.saw.enabled) {
          this.saw.step = 0;
          this.saw.accumulator = 0;
        }
        break;
    }
  }

  output(): number {
    const raw = this.pulseOutput(this.pulse1) + this.pulseOutput(this.pulse2) + this.sawOutput();
    return raw === 0 ? 0 : -raw * VRC6_DAC_STEP;
  }

  captureState(): Vrc6AudioState {
    return {
      frequencyControl: this.frequencyControl,
      pulse1: { ...this.pulse1 },
      pulse2: { ...this.pulse2 },
      saw: { ...this.saw },
    };
  }

  restoreState(state: Vrc6AudioState): void {
    this.validateState(state);
    this.frequencyControl = state.frequencyControl;
    this.pulse1 = { ...state.pulse1 };
    this.pulse2 = { ...state.pulse2 };
    this.saw = { ...state.saw };
  }

  validateState(state: Vrc6AudioState): void {
    if (
      !isFrequencyControl(state.frequencyControl) ||
      !isPulseState(state.pulse1) ||
      !isPulseState(state.pulse2) ||
      !isSawState(state.saw) ||
      (!state.saw.enabled && (state.saw.step !== 0 || state.saw.accumulator !== 0))
    ) {
      throw new RangeError("VRC6 audio save state contains invalid oscillator state");
    }
  }

  private clockPulse(pulse: MutablePulseState, shift: number): void {
    if (pulse.divider === 0) {
      pulse.divider = pulse.period >>> shift;
      pulse.dutyStep = (pulse.dutyStep - 1) & 0x0f;
    } else {
      pulse.divider--;
    }
  }

  private clockSaw(shift: number): void {
    if (this.saw.divider !== 0) {
      this.saw.divider--;
      return;
    }
    this.saw.divider = this.saw.period >>> shift;
    if (!this.saw.enabled) {
      this.saw.step = 0;
      this.saw.accumulator = 0;
      return;
    }
    if (this.saw.step === 13) {
      this.saw.step = 0;
      this.saw.accumulator = 0;
      return;
    }
    this.saw.step++;
    if ((this.saw.step & 1) === 0) {
      this.saw.accumulator = (this.saw.accumulator + this.saw.rate) & 0xff;
    }
  }

  private pulseOutput(pulse: Vrc6PulseState): number {
    if (!pulse.enabled) return 0;
    const volume = pulse.control & 0x0f;
    return (pulse.control & 0x80) !== 0 || pulse.dutyStep <= ((pulse.control >>> 4) & 7)
      ? volume
      : 0;
  }

  private sawOutput(): number {
    return this.saw.enabled ? this.saw.accumulator >>> 3 : 0;
  }
}

type MutablePulseState = {
  -readonly [Key in keyof Vrc6PulseState]: Vrc6PulseState[Key];
};

type MutableSawState = {
  -readonly [Key in keyof Vrc6SawState]: Vrc6SawState[Key];
};

function createPulseState(): MutablePulseState {
  return { control: 0, period: 0, divider: 0, dutyStep: 0, enabled: false };
}

function createSawState(): MutableSawState {
  return { rate: 0, period: 0, divider: 0, step: 0, accumulator: 0, enabled: false };
}

function isFrequencyControl(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 7;
}

function isPulseState(state: Vrc6PulseState): boolean {
  return (
    isByte(state.control) &&
    isTwelveBit(state.period) &&
    isTwelveBit(state.divider) &&
    Number.isInteger(state.dutyStep) &&
    state.dutyStep >= 0 &&
    state.dutyStep <= 15 &&
    areBooleans(state.enabled)
  );
}

function isSawState(state: Vrc6SawState): boolean {
  return (
    Number.isInteger(state.rate) &&
    state.rate >= 0 &&
    state.rate <= 0x3f &&
    isTwelveBit(state.period) &&
    isTwelveBit(state.divider) &&
    Number.isInteger(state.step) &&
    state.step >= 0 &&
    state.step <= 13 &&
    isByte(state.accumulator) &&
    areBooleans(state.enabled)
  );
}

function isTwelveBit(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0x0fff;
}
