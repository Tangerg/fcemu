import { isByte, isIntegerInRange } from "../numeric-range.js";
import { areBooleans } from "./state-validation.js";

interface Mmc5PulseState {
  readonly control: number;
  readonly period: number;
  readonly divider: number;
  readonly dutyStep: number;
  readonly length: number;
  readonly envelopeStart: boolean;
  readonly envelopeDivider: number;
  readonly envelopeDecay: number;
}

export interface Mmc5AudioState {
  readonly enabledMask: number;
  readonly frameDivider: number;
  readonly timerPhase: boolean;
  readonly pcmControl: number;
  readonly pcmOutput: number;
  readonly pcmPending: boolean;
  readonly pulses: readonly Mmc5PulseState[];
}

type MutablePulseState = {
  -readonly [Key in keyof Mmc5PulseState]: Mmc5PulseState[Key];
};

const DUTY_SEQUENCES: readonly (readonly number[])[] = [
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 1, 1],
];
const MMC5_LENGTH_TABLE: readonly number[] = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192,
  24, 72, 26, 16, 28, 32, 30,
];
const FRAME_DIVIDER_PERIOD = 7424;
const APU_PULSE_MAX = 95.52 / (8128 / 15 + 100);
const PULSE_DAC_STEP = APU_PULSE_MAX / 15;
const DMC_MAX = 163.67 / (24329 / 127 + 100);
const PCM_DAC_STEP = DMC_MAX / 127;

/** MMC5's two pulse generators and direct/read-mode PCM DAC. */
export class Mmc5Audio {
  private enabledMask = 0;
  private frameDivider = 0;
  private timerPhase = false;
  private pcmControl = 0;
  private pcmOutput = 0;
  private pcmPending = false;
  private pulses: [MutablePulseState, MutablePulseState] = [createPulse(), createPulse()];

  powerOn(): void {
    this.enabledMask = 0;
    this.frameDivider = 0;
    this.timerPhase = false;
    this.pcmControl = 0;
    this.pcmOutput = 0;
    this.pcmPending = false;
    this.pulses = [createPulse(), createPulse()];
  }

  /** Applies the MMC5 reset detector without resetting non-reset pulse/DAC state. */
  reset(): void {
    this.pcmControl = 0;
  }

  tick(): void {
    this.timerPhase = !this.timerPhase;
    if (this.timerPhase) {
      this.clockTimer(this.pulses[0]);
      this.clockTimer(this.pulses[1]);
    }
    this.frameDivider++;
    if (this.frameDivider < FRAME_DIVIDER_PERIOD) return;
    this.frameDivider = 0;
    this.clockEnvelopeAndLength(this.pulses[0]);
    this.clockEnvelopeAndLength(this.pulses[1]);
  }

  readRegister(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (address === 0x5010) {
      const value = (this.pcmPending && (this.pcmControl & 0x80) !== 0 ? 0x80 : 0) | 1;
      this.pcmPending = false;
      return { value, drivenMask: 0x81 };
    }
    if (address === 0x5015) {
      return {
        value: Number(this.pulses[0].length > 0) | (Number(this.pulses[1].length > 0) << 1),
        drivenMask: 0x03,
      };
    }
    return undefined;
  }

  writeRegister(address: number, value: number): boolean {
    value &= 0xff;
    if (address >= 0x5000 && address <= 0x5007) {
      const pulse = this.pulses[address >= 0x5004 ? 1 : 0];
      switch (address & 3) {
        case 0:
          pulse.control = value;
          break;
        case 1:
          break;
        case 2:
          pulse.period = (pulse.period & 0x0700) | value;
          break;
        case 3:
          pulse.period = (pulse.period & 0x00ff) | ((value & 7) << 8);
          pulse.dutyStep = 0;
          pulse.envelopeStart = true;
          if ((this.enabledMask & (address >= 0x5004 ? 2 : 1)) !== 0) {
            pulse.length = MMC5_LENGTH_TABLE[value >>> 3] ?? 0;
          }
          break;
      }
      return true;
    }
    if (address === 0x5010) {
      this.pcmControl = value & 0x81;
      return true;
    }
    if (address === 0x5011) {
      if ((this.pcmControl & 1) === 0) this.feedPcm(value);
      return true;
    }
    if (address === 0x5015) {
      this.enabledMask = value & 3;
      if ((value & 1) === 0) this.pulses[0].length = 0;
      if ((value & 2) === 0) this.pulses[1].length = 0;
      return true;
    }
    return false;
  }

  observeCpuRead(address: number, value: number): void {
    if ((this.pcmControl & 1) !== 0 && address >= 0x8000 && address <= 0xbfff) {
      this.feedPcm(value);
    }
  }

  output(): number {
    const pulse = this.pulseOutput(this.pulses[0], 1) + this.pulseOutput(this.pulses[1], 2);
    return -(pulse * PULSE_DAC_STEP + this.pcmOutput * PCM_DAC_STEP);
  }

  get irqPending(): boolean {
    return this.pcmPending && (this.pcmControl & 0x80) !== 0;
  }

  captureState(): Mmc5AudioState {
    return {
      enabledMask: this.enabledMask,
      frameDivider: this.frameDivider,
      timerPhase: this.timerPhase,
      pcmControl: this.pcmControl,
      pcmOutput: this.pcmOutput,
      pcmPending: this.pcmPending,
      pulses: this.pulses.map((pulse) => ({ ...pulse })),
    };
  }

  restoreState(state: Mmc5AudioState): void {
    if (
      !isIntegerInRange(state.enabledMask, 0, 3) ||
      !isIntegerInRange(state.frameDivider, 0, FRAME_DIVIDER_PERIOD - 1) ||
      !areBooleans(state.timerPhase, state.pcmPending) ||
      !isByte(state.pcmControl) ||
      (state.pcmControl & 0x7e) !== 0 ||
      !isByte(state.pcmOutput) ||
      !Array.isArray(state.pulses) ||
      state.pulses.length !== 2 ||
      !state.pulses.every(isPulseState)
    ) {
      throw new RangeError("MMC5 audio save state contains invalid channel state");
    }
    this.enabledMask = state.enabledMask;
    this.frameDivider = state.frameDivider;
    this.timerPhase = state.timerPhase;
    this.pcmControl = state.pcmControl;
    this.pcmOutput = state.pcmOutput;
    this.pcmPending = state.pcmPending;
    this.pulses = [
      { ...(state.pulses[0] as Mmc5PulseState) },
      { ...(state.pulses[1] as Mmc5PulseState) },
    ];
  }

  private feedPcm(value: number): void {
    value &= 0xff;
    this.pcmPending = value === 0;
    if (value !== 0) this.pcmOutput = value;
  }

  private clockTimer(pulse: MutablePulseState): void {
    if (pulse.divider === 0) {
      pulse.divider = pulse.period;
      pulse.dutyStep = (pulse.dutyStep + 1) & 7;
    } else {
      pulse.divider--;
    }
  }

  private clockEnvelopeAndLength(pulse: MutablePulseState): void {
    if ((pulse.control & 0x20) === 0 && pulse.length > 0) pulse.length--;
    const period = pulse.control & 0x0f;
    if (pulse.envelopeStart) {
      pulse.envelopeStart = false;
      pulse.envelopeDecay = 15;
      pulse.envelopeDivider = period;
    } else if (pulse.envelopeDivider > 0) {
      pulse.envelopeDivider--;
    } else {
      pulse.envelopeDivider = period;
      if (pulse.envelopeDecay > 0) pulse.envelopeDecay--;
      else if ((pulse.control & 0x20) !== 0) pulse.envelopeDecay = 15;
    }
  }

  private pulseOutput(pulse: Mmc5PulseState, enableBit: number): number {
    if ((this.enabledMask & enableBit) === 0 || pulse.length === 0) return 0;
    const sequence = DUTY_SEQUENCES[pulse.control >>> 6];
    if (sequence?.[pulse.dutyStep] !== 1) return 0;
    const volume = (pulse.control & 0x10) !== 0 ? pulse.control & 0x0f : pulse.envelopeDecay;
    return volume;
  }
}

function createPulse(): MutablePulseState {
  return {
    control: 0,
    period: 0,
    divider: 0,
    dutyStep: 0,
    length: 0,
    envelopeStart: false,
    envelopeDivider: 0,
    envelopeDecay: 0,
  };
}

function isPulseState(state: Mmc5PulseState): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    isByte(state.control) &&
    isIntegerInRange(state.period, 0, 0x07ff) &&
    isIntegerInRange(state.divider, 0, 0x07ff) &&
    isIntegerInRange(state.dutyStep, 0, 7) &&
    isIntegerInRange(state.length, 0, 0xfe) &&
    areBooleans(state.envelopeStart) &&
    isIntegerInRange(state.envelopeDivider, 0, 15) &&
    isIntegerInRange(state.envelopeDecay, 0, 15)
  );
}
