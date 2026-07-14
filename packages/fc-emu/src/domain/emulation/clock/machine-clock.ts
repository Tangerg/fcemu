export interface MachineClockState {
  readonly committedCpuCycle: number;
  readonly synchronizedApuCycle: number;
  readonly synchronizedPpuMasterClock: number;
  readonly ppuClockRemainder: number;
  readonly cpuCycleAtUpdateStart: number;
}

export interface MachineClockTiming {
  readonly cpuMasterClockDivider: number;
  readonly ppuMasterClockDivider: number;
  readonly readSampleMasterClock: number;
  readonly writeSampleMasterClock: number;
  readonly interruptSampleMasterClock: number;
}

export type PpuClock = (masterClock: number) => void;

/** The console's single CPU/APU/PPU time source and synchronization boundary. */
export class MachineClock {
  private committedCpuCycle = 0;
  private synchronizedApuCycle = 0;
  private synchronizedPpuMasterClock = 0;
  private ppuClockRemainder = 0;
  private cpuCycleAtUpdateStart = 0;

  constructor(private readonly timing: MachineClockTiming) {
    MachineClock.validateTiming(timing);
  }

  get readSampleRequiresPpuSynchronization(): boolean {
    return (
      this.timing.cpuMasterClockDivider % this.timing.ppuMasterClockDivider !== 0 ||
      this.timing.readSampleMasterClock >= this.timing.ppuMasterClockDivider
    );
  }

  get synchronizedApuCpuCycle(): number {
    return this.synchronizedApuCycle;
  }

  get remainingCommittedApuCycles(): number {
    return this.committedCpuCycle - this.synchronizedApuCycle;
  }

  beginCpuUpdate(totalCpuCycles: number): void {
    MachineClock.validateNonNegativeSafeInteger(totalCpuCycles, "CPU cycle watermark");
    this.cpuCycleAtUpdateStart = totalCpuCycles;
  }

  currentCpuBusCycle(totalCpuCycles: number): number {
    return this.committedCpuCycle + Math.max(1, this.elapsedCpuCycles(totalCpuCycles));
  }

  completedCpuCycles(totalCpuCycles: number): number {
    return this.committedCpuCycle + this.elapsedCpuCycles(totalCpuCycles);
  }

  commitCpuCycles(cycles: number): void {
    MachineClock.validateNonNegativeSafeInteger(cycles, "Committed CPU cycles");
    const committedCpuCycle = this.committedCpuCycle + cycles;
    const committedMasterClock = committedCpuCycle * this.timing.cpuMasterClockDivider;
    if (!Number.isSafeInteger(committedCpuCycle) || !Number.isSafeInteger(committedMasterClock)) {
      throw new RangeError("Committed machine clock exceeds the safe integer range");
    }
    this.committedCpuCycle = committedCpuCycle;
  }

  synchronizeApuTo(targetCpuCycle: number, clockApu: () => void): void {
    while (this.synchronizedApuCycle < targetCpuCycle) {
      clockApu();
      this.synchronizedApuCycle++;
    }
  }

  synchronizeApuCommitted(clockApu: () => void): void {
    this.synchronizeApuTo(this.committedCpuCycle, clockApu);
  }

  synchronizePpuCurrentRead(totalCpuCycles: number, clockPpu: PpuClock): void {
    this.synchronizePpuTo(
      this.currentCpuCycleStartMasterClock(totalCpuCycles) + this.timing.readSampleMasterClock,
      clockPpu,
    );
  }

  synchronizePpuCurrentWrite(totalCpuCycles: number, clockPpu: PpuClock): void {
    this.synchronizePpuTo(
      this.currentCpuCycleStartMasterClock(totalCpuCycles) + this.timing.writeSampleMasterClock,
      clockPpu,
    );
  }

  synchronizePpuAdvancedRead(totalCpuCycles: number, clockPpu: PpuClock): void {
    this.synchronizePpuTo(
      this.advancedCpuCycleStartMasterClock(totalCpuCycles) + this.timing.readSampleMasterClock,
      clockPpu,
    );
  }

  synchronizePpuAdvancedWrite(totalCpuCycles: number, clockPpu: PpuClock): void {
    this.synchronizePpuTo(
      this.advancedCpuCycleStartMasterClock(totalCpuCycles) + this.timing.writeSampleMasterClock,
      clockPpu,
    );
  }

  synchronizePpuCompletedCpuCycles(totalCpuCycles: number, clockPpu: PpuClock): void {
    this.synchronizePpuTo(
      (this.committedCpuCycle + this.elapsedCpuCycles(totalCpuCycles)) *
        this.timing.cpuMasterClockDivider,
      clockPpu,
    );
  }

  synchronizePpuCompletedInterruptSample(totalCpuCycles: number, clockPpu: PpuClock): void {
    const completedCpuCycles = this.committedCpuCycle + this.elapsedCpuCycles(totalCpuCycles);
    if (completedCpuCycles === 0) return;
    this.synchronizePpuTo(
      (completedCpuCycles - 1) * this.timing.cpuMasterClockDivider +
        this.timing.interruptSampleMasterClock,
      clockPpu,
    );
  }

  synchronizePpuCommitted(clockPpu: PpuClock): void {
    this.synchronizePpuTo(this.committedCpuCycle * this.timing.cpuMasterClockDivider, clockPpu);
  }

  synchronizePpuCommittedInterruptSample(clockPpu: PpuClock): void {
    if (this.committedCpuCycle === 0) return;
    this.synchronizePpuTo(
      (this.committedCpuCycle - 1) * this.timing.cpuMasterClockDivider +
        this.timing.interruptSampleMasterClock,
      clockPpu,
    );
  }

  reset(): void {
    this.committedCpuCycle = 0;
    this.synchronizedApuCycle = 0;
    this.synchronizedPpuMasterClock = 0;
    this.ppuClockRemainder = 0;
    this.cpuCycleAtUpdateStart = 0;
  }

  captureState(): MachineClockState {
    return {
      committedCpuCycle: this.committedCpuCycle,
      synchronizedApuCycle: this.synchronizedApuCycle,
      synchronizedPpuMasterClock: this.synchronizedPpuMasterClock,
      ppuClockRemainder: this.ppuClockRemainder,
      cpuCycleAtUpdateStart: this.cpuCycleAtUpdateStart,
    };
  }

  restoreState(state: MachineClockState): void {
    const values = [
      state.committedCpuCycle,
      state.synchronizedApuCycle,
      state.synchronizedPpuMasterClock,
      state.cpuCycleAtUpdateStart,
    ];
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
      throw new RangeError("Machine-clock save state contains an invalid watermark");
    }
    if (
      !Number.isInteger(state.ppuClockRemainder) ||
      state.ppuClockRemainder < 0 ||
      state.ppuClockRemainder >= this.timing.ppuMasterClockDivider
    ) {
      throw new RangeError("Machine-clock save state contains an invalid PPU remainder");
    }
    const committedMasterClock = state.committedCpuCycle * this.timing.cpuMasterClockDivider;
    if (
      !Number.isSafeInteger(committedMasterClock) ||
      state.synchronizedApuCycle > state.committedCpuCycle ||
      state.cpuCycleAtUpdateStart > state.committedCpuCycle ||
      state.synchronizedPpuMasterClock > committedMasterClock
    ) {
      throw new RangeError("Machine-clock save-state watermarks are inconsistent");
    }
    this.committedCpuCycle = state.committedCpuCycle;
    this.synchronizedApuCycle = state.synchronizedApuCycle;
    this.synchronizedPpuMasterClock = state.synchronizedPpuMasterClock;
    this.ppuClockRemainder = state.ppuClockRemainder;
    this.cpuCycleAtUpdateStart = state.cpuCycleAtUpdateStart;
  }

  private currentCpuCycleStartMasterClock(totalCpuCycles: number): number {
    return (
      (this.committedCpuCycle + this.elapsedCpuCycles(totalCpuCycles)) *
      this.timing.cpuMasterClockDivider
    );
  }

  private advancedCpuCycleStartMasterClock(totalCpuCycles: number): number {
    const elapsedCpuCycles = this.elapsedCpuCycles(totalCpuCycles);
    if (elapsedCpuCycles === 0) {
      throw new RangeError("An advanced DMA bus sample requires one completed CPU cycle");
    }
    return (this.committedCpuCycle + elapsedCpuCycles - 1) * this.timing.cpuMasterClockDivider;
  }

  private elapsedCpuCycles(totalCpuCycles: number): number {
    const elapsed = totalCpuCycles - this.cpuCycleAtUpdateStart;
    if (!Number.isSafeInteger(totalCpuCycles) || elapsed < 0) {
      throw new RangeError("CPU cycle watermark moved backwards during an update");
    }
    return elapsed;
  }

  private synchronizePpuTo(targetMasterClock: number, clockPpu: PpuClock): void {
    if (
      !Number.isSafeInteger(targetMasterClock) ||
      targetMasterClock < this.synchronizedPpuMasterClock
    ) {
      throw new RangeError("PPU synchronization target moved backwards");
    }
    const elapsedMasterClocks = targetMasterClock - this.synchronizedPpuMasterClock;
    const accumulatedMasterClocks = elapsedMasterClocks + this.ppuClockRemainder;
    if (accumulatedMasterClocks < this.timing.ppuMasterClockDivider) {
      this.ppuClockRemainder = accumulatedMasterClocks;
      this.synchronizedPpuMasterClock = targetMasterClock;
      return;
    }
    const firstDotOffset = this.timing.ppuMasterClockDivider - this.ppuClockRemainder;
    const ppuDots = Math.floor(accumulatedMasterClocks / this.timing.ppuMasterClockDivider);
    const firstDotMasterClock = this.synchronizedPpuMasterClock + firstDotOffset;
    for (let dot = 0; dot < ppuDots; dot++) {
      clockPpu(firstDotMasterClock + dot * this.timing.ppuMasterClockDivider);
    }
    this.ppuClockRemainder = accumulatedMasterClocks % this.timing.ppuMasterClockDivider;
    this.synchronizedPpuMasterClock = targetMasterClock;
  }

  private static validateTiming(timing: MachineClockTiming): void {
    const values = [
      timing.cpuMasterClockDivider,
      timing.ppuMasterClockDivider,
      timing.readSampleMasterClock,
      timing.writeSampleMasterClock,
      timing.interruptSampleMasterClock,
    ];
    if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
      throw new RangeError("Machine-clock timing must contain positive integers");
    }
    if (
      timing.readSampleMasterClock >= timing.cpuMasterClockDivider ||
      timing.writeSampleMasterClock >= timing.cpuMasterClockDivider ||
      timing.interruptSampleMasterClock >= timing.cpuMasterClockDivider
    ) {
      throw new RangeError("CPU samples must occur within their master-clock cycle");
    }
  }

  private static validateNonNegativeSafeInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer`);
    }
  }
}
