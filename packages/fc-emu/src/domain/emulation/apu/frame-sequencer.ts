export interface FrameSequencerSink {
  quarterFrame(): void;
  halfFrame(): void;
  requestIRQ(): void;
  clearIRQ(): void;
}

export interface FrameSequencerState {
  readonly cycle: number;
  readonly period: 4 | 5;
  readonly pendingPeriod: 4 | 5;
  readonly resetDelay: number;
  readonly irqEnabled: boolean;
  readonly lastRegisterValue: number;
}

/** Region-configured APU frame sequencer, clocked once per CPU cycle. */
export class FrameSequencer {
  private cycle = 0;
  private period: 4 | 5 = 4;
  private pendingPeriod: 4 | 5 = 4;
  private resetDelay = 0;
  private irqEnabled = true;
  private lastRegisterValue = 0;

  constructor(
    private readonly sink: FrameSequencerSink,
    private readonly timing: ApuTiming = NTSC_APU_TIMING,
  ) {}

  powerOn(): void {
    this.lastRegisterValue = 0;
    this.applyResetState(0);
  }

  reset(): void {
    this.applyResetState(this.lastRegisterValue);
  }

  captureState(): FrameSequencerState {
    return {
      cycle: this.cycle,
      period: this.period,
      pendingPeriod: this.pendingPeriod,
      resetDelay: this.resetDelay,
      irqEnabled: this.irqEnabled,
      lastRegisterValue: this.lastRegisterValue,
    };
  }

  restoreState(state: FrameSequencerState): void {
    this.cycle = state.cycle;
    this.period = state.period;
    this.pendingPeriod = state.pendingPeriod;
    this.resetDelay = state.resetDelay;
    this.irqEnabled = state.irqEnabled;
    this.lastRegisterValue = state.lastRegisterValue;
  }

  write(value: number, cpuCycle: number): void {
    this.lastRegisterValue = value & 0xff;
    this.pendingPeriod = (4 + ((value >> 7) & 1)) as 4 | 5;
    this.irqEnabled = (value & 0x40) === 0;
    if (!this.irqEnabled) this.sink.clearIRQ();
    this.resetDelay = (cpuCycle & 1) === 0 ? 3 : 4;
  }

  tick(): void {
    if (this.resetDelay > 0) {
      this.resetDelay--;
      if (this.resetDelay === 0) {
        this.period = this.pendingPeriod;
        this.cycle = 0;
        if (this.period === 5) this.sink.halfFrame();
      }
      return;
    }

    this.cycle++;
    if (this.period === 4) this.tickFourStepSequence();
    else this.tickFiveStepSequence();
  }

  private applyResetState(registerValue: number): void {
    this.period = (4 + ((registerValue >> 7) & 1)) as 4 | 5;
    this.pendingPeriod = this.period;
    this.irqEnabled = (registerValue & 0x40) === 0;
    this.resetDelay = 0;
    this.cycle = 5;
    this.sink.clearIRQ();
  }

  private tickFourStepSequence(): void {
    switch (this.cycle) {
      case this.timing.firstQuarterCycle:
      case this.timing.secondQuarterCycle:
        this.sink.quarterFrame();
        break;
      case this.timing.firstHalfCycle:
      case this.timing.secondHalfCycle:
        this.sink.halfFrame();
        if (this.cycle === this.timing.secondHalfCycle) this.requestIRQ();
        break;
      case this.timing.secondHalfCycle - 1:
        this.requestIRQ();
        break;
      case this.timing.fourStepEndCycle:
        this.requestIRQ();
        this.cycle = 0;
        break;
    }
  }

  private tickFiveStepSequence(): void {
    switch (this.cycle) {
      case this.timing.firstQuarterCycle:
      case this.timing.secondQuarterCycle:
        this.sink.quarterFrame();
        break;
      case this.timing.firstHalfCycle:
      case this.timing.fiveStepFinalHalfCycle:
        this.sink.halfFrame();
        break;
      case this.timing.fiveStepEndCycle:
        this.cycle = 0;
        break;
    }
  }

  private requestIRQ(): void {
    if (this.irqEnabled) this.sink.requestIRQ();
  }
}
import { NTSC_APU_TIMING, type ApuTiming } from "../console-timing.js";
