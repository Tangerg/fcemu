export interface EnvelopeState {
  readonly loop: boolean;
  readonly constant: boolean;
  readonly period: number;
  readonly start: boolean;
  readonly divider: number;
  readonly decay: number;
}

/** Shared pulse/noise volume envelope. */
export class Envelope {
  private loop = false;
  private constant = false;
  private period = 0;
  private start = false;
  private divider = 0;
  private decay = 0;

  configure(registerValue: number): void {
    this.loop = (registerValue & 0x20) !== 0;
    this.constant = (registerValue & 0x10) !== 0;
    this.period = registerValue & 0x0f;
  }

  restart(): void {
    this.start = true;
  }

  clock(): void {
    if (this.start) {
      this.start = false;
      this.decay = 15;
      this.divider = this.period;
      return;
    }
    if (this.divider > 0) {
      this.divider--;
      return;
    }

    this.divider = this.period;
    if (this.decay > 0) this.decay--;
    else if (this.loop) this.decay = 15;
  }

  get output(): number {
    return this.constant ? this.period : this.decay;
  }

  captureState(): EnvelopeState {
    return {
      loop: this.loop,
      constant: this.constant,
      period: this.period,
      start: this.start,
      divider: this.divider,
      decay: this.decay,
    };
  }

  restoreState(state: EnvelopeState): void {
    this.loop = state.loop;
    this.constant = state.constant;
    this.period = state.period;
    this.start = state.start;
    this.divider = state.divider;
    this.decay = state.decay;
  }
}
