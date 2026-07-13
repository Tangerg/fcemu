export interface PpuIoBusState {
  readonly value: number;
  readonly elapsedDots: number;
  readonly decayDeadlines: Float64Array;
}

/**
 * The PPU's CPU-facing eight-bit dynamic latch.
 *
 * Reads can drive only some data lines, while undriven lines retain their
 * previous values without refreshing their independent decay deadlines.
 */
export class PpuIoBusLatch {
  private value = 0;
  private elapsedDots = 0;
  private readonly decayDeadlines = new Float64Array(8);

  constructor(private readonly decayAfterDots: number) {
    if (!Number.isSafeInteger(decayAfterDots) || decayAfterDots <= 0) {
      throw new RangeError("PPU I/O bus decay interval must be a positive safe integer");
    }
  }

  advanceDots(dots: number): void {
    this.elapsedDots += dots;
  }

  sample(): number {
    this.applyDecay();
    return this.value;
  }

  drive(drivenValue: number, drivenMask = 0xff): number {
    this.applyDecay();
    const value = drivenValue & 0xff;
    const mask = drivenMask & 0xff;
    this.value = (this.value & ~mask) | (value & mask);
    for (let bit = 0; bit < 8; bit++) {
      const bitMask = 1 << bit;
      if ((mask & bitMask) === 0) continue;
      this.decayDeadlines[bit] =
        (value & bitMask) === 0 ? 0 : this.elapsedDots + this.decayAfterDots;
    }
    return this.value;
  }

  powerOn(): void {
    this.value = 0;
    this.elapsedDots = 0;
    this.decayDeadlines.fill(0);
  }

  captureState(): PpuIoBusState {
    this.applyDecay();
    return {
      value: this.value,
      elapsedDots: this.elapsedDots,
      decayDeadlines: this.decayDeadlines.slice(),
    };
  }

  restoreState(state: PpuIoBusState): void {
    PpuIoBusLatch.validateState(state);
    this.value = state.value;
    this.elapsedDots = state.elapsedDots;
    this.decayDeadlines.set(state.decayDeadlines);
    this.applyDecay();
  }

  static validateState(state: PpuIoBusState): void {
    if (!isByte(state.value) || !Number.isSafeInteger(state.elapsedDots) || state.elapsedDots < 0) {
      throw new RangeError("PPU I/O bus save state contains an invalid latch value or clock");
    }
    if (
      !(state.decayDeadlines instanceof Float64Array) ||
      state.decayDeadlines.length !== 8 ||
      state.decayDeadlines.some((deadline) => !Number.isSafeInteger(deadline) || deadline < 0)
    ) {
      throw new RangeError("PPU I/O bus save state contains invalid decay deadlines");
    }
    for (let bit = 0; bit < 8; bit++) {
      const deadline = state.decayDeadlines[bit] ?? 0;
      const isHigh = (state.value & (1 << bit)) !== 0;
      if ((!isHigh && deadline !== 0) || (isHigh && deadline <= state.elapsedDots)) {
        throw new RangeError("PPU I/O bus save state contains inconsistent decay state");
      }
    }
  }

  private applyDecay(): void {
    for (let bit = 0; bit < 8; bit++) {
      const bitMask = 1 << bit;
      const deadline = this.decayDeadlines[bit] ?? 0;
      if ((this.value & bitMask) !== 0 && this.elapsedDots >= deadline) {
        this.value &= ~bitMask;
        this.decayDeadlines[bit] = 0;
      }
    }
  }
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
