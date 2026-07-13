const LENGTH_TABLE: readonly number[] = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14, 12, 16, 24, 18, 48, 20, 96, 22, 192,
  24, 72, 26, 16, 28, 32, 30,
];

export interface LengthCounterState {
  readonly channelEnabled: boolean;
  readonly halted: boolean;
  readonly pendingHalt: boolean;
  readonly counter: number;
  readonly pendingReload: number;
  readonly valueBeforeReload: number;
  readonly valueBeforeClock: number;
  readonly lastClockCycle?: number;
}

/** Shared automatic duration counter for pulse, triangle, and noise channels. */
export class LengthCounter {
  private channelEnabled = false;
  private halted = false;
  private pendingHalt = false;
  private counter = 0;
  private pendingReload = 0;
  private valueBeforeReload = 0;
  private valueBeforeClock = 0;
  private lastClockCycle: number | undefined;

  set enabled(enabled: boolean) {
    this.channelEnabled = enabled;
    if (!enabled) {
      this.counter = 0;
      this.pendingReload = 0;
      this.lastClockCycle = undefined;
    }
  }

  get enabled(): boolean {
    return this.channelEnabled;
  }

  set halt(halted: boolean) {
    this.pendingHalt = halted;
  }

  load(index: number, cpuCycle?: number): void {
    if (!this.channelEnabled) return;
    this.pendingReload = LENGTH_TABLE[index & 0x1f] ?? 0;
    this.valueBeforeReload =
      cpuCycle !== undefined && this.lastClockCycle === cpuCycle
        ? this.valueBeforeClock
        : this.counter;
  }

  clock(cpuCycle?: number): void {
    this.valueBeforeClock = this.counter;
    this.lastClockCycle = cpuCycle;
    if (!this.halted && this.counter > 0) this.counter--;
  }

  /** Applies CPU register writes after a possible same-cycle frame-counter clock. */
  commitRegisterWrites(): void {
    if (this.pendingReload > 0) {
      if (this.counter === this.valueBeforeReload) this.counter = this.pendingReload;
      this.pendingReload = 0;
    }
    this.halted = this.pendingHalt;
  }

  get value(): number {
    return this.counter;
  }

  captureState(): LengthCounterState {
    return {
      channelEnabled: this.channelEnabled,
      halted: this.halted,
      pendingHalt: this.pendingHalt,
      counter: this.counter,
      pendingReload: this.pendingReload,
      valueBeforeReload: this.valueBeforeReload,
      valueBeforeClock: this.valueBeforeClock,
      ...(this.lastClockCycle === undefined ? {} : { lastClockCycle: this.lastClockCycle }),
    };
  }

  restoreState(state: LengthCounterState): void {
    this.channelEnabled = state.channelEnabled;
    this.halted = state.halted;
    this.pendingHalt = state.pendingHalt;
    this.counter = state.counter;
    this.pendingReload = state.pendingReload;
    this.valueBeforeReload = state.valueBeforeReload;
    this.valueBeforeClock = state.valueBeforeClock;
    this.lastClockCycle = state.lastClockCycle;
  }
}
