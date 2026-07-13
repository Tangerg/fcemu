export interface CpuInterruptSnapshot {
  readonly nmiLineAsserted: boolean;
  readonly nmiLineSampled: boolean;
  readonly nmiPending: boolean;
  readonly nmiSampled: boolean;
  readonly softwareIrqPending: boolean;
  readonly irqLineAsserted: boolean;
  readonly irqLineSampled: boolean;
  readonly deferDmaIrqUntilAfterInstruction: boolean;
  readonly deferIrqSampleUntilNextInstruction: boolean;
  readonly irqPollingDisabled: boolean;
  readonly deferNmiUntilAfterInstruction: boolean;
  readonly interruptEntryFinishedThisCycle: boolean;
}

/** Owns 2A03 interrupt lines, polling snapshots and recognition deferrals. */
export class CpuInterruptState {
  /** Physical /NMI input after active-low conversion. */
  private nmiLineAsserted = false;
  /** /NMI level captured at the preceding CPU input-sampling phase. */
  private nmiLineSampled = false;
  /** NMI edge detector output (`_needNmi` in visual6502-style descriptions). */
  private nmiPending = false;
  /** One-cycle-later NMI sample used at an instruction boundary (`_prevNeedNmi`). */
  private nmiSampled = false;
  private softwareIrqPending = false;
  private irqLineAsserted = false;
  private irqLineSampled = false;
  private deferDmaIrqUntilAfterInstruction = false;
  private deferIrqSampleUntilNextInstruction = false;
  private irqPollingDisabled = true;
  private deferNmiUntilAfterInstruction = false;
  private interruptEntryFinishedThisCycle = false;

  reset(irqPollingDisabled: boolean): void {
    this.nmiLineAsserted = false;
    this.nmiLineSampled = false;
    this.nmiPending = false;
    this.nmiSampled = false;
    this.softwareIrqPending = false;
    this.irqLineAsserted = false;
    this.irqLineSampled = false;
    this.deferDmaIrqUntilAfterInstruction = false;
    this.deferIrqSampleUntilNextInstruction = false;
    this.irqPollingDisabled = irqPollingDisabled;
    this.deferNmiUntilAfterInstruction = false;
    this.interruptEntryFinishedThisCycle = false;
  }

  captureState(): CpuInterruptSnapshot {
    return {
      nmiLineAsserted: this.nmiLineAsserted,
      nmiLineSampled: this.nmiLineSampled,
      nmiPending: this.nmiPending,
      nmiSampled: this.nmiSampled,
      softwareIrqPending: this.softwareIrqPending,
      irqLineAsserted: this.irqLineAsserted,
      irqLineSampled: this.irqLineSampled,
      deferDmaIrqUntilAfterInstruction: this.deferDmaIrqUntilAfterInstruction,
      deferIrqSampleUntilNextInstruction: this.deferIrqSampleUntilNextInstruction,
      irqPollingDisabled: this.irqPollingDisabled,
      deferNmiUntilAfterInstruction: this.deferNmiUntilAfterInstruction,
      interruptEntryFinishedThisCycle: this.interruptEntryFinishedThisCycle,
    };
  }

  restoreState(state: CpuInterruptSnapshot): void {
    Object.assign(this, state);
  }

  beginCpuUpdate(): void {
    this.interruptEntryFinishedThisCycle = false;
    this.deferIrqSampleUntilNextInstruction = false;
  }

  requestNmi(instructionSampled = false): void {
    if (this.interruptEntryFinishedThisCycle) {
      this.nmiPending = true;
      this.deferNmiUntilAfterInstruction = true;
    } else {
      this.nmiPending = true;
    }
    if (instructionSampled) this.nmiSampled = true;
  }

  setNmiLine(asserted: boolean): void {
    this.nmiLineAsserted = asserted;
  }

  /** Captures the physical line and latches only a newly asserted edge. */
  sampleNmiLine(): void {
    // `_prevNeedNmi` captures the old edge-detector output before this same
    // sampling edge can set `_needNmi`. Vector hijacking sees the new value
    // immediately; an instruction boundary sees it after the following sample.
    this.nmiSampled = this.nmiPending;
    if (this.nmiLineAsserted && !this.nmiLineSampled) this.requestNmi();
    this.nmiLineSampled = this.nmiLineAsserted;
  }

  requestIrq(): void {
    this.softwareIrqPending = true;
  }

  setIrqLine(asserted: boolean): void {
    this.irqLineAsserted = asserted;
  }

  sampleIrqLine(allowDeferredBranchSample = false): void {
    if (!this.deferIrqSampleUntilNextInstruction || allowDeferredBranchSample) {
      // A page-crossing branch can poll twice. Once either poll recognizes
      // the asserted level, a later poll in the same branch cannot revoke it.
      this.irqLineSampled ||= this.irqLineAsserted;
    }
  }

  captureIrqWhileHalted(): void {
    this.irqLineSampled = this.irqLineAsserted;
  }

  /**
   * Captures an IRQ raised while DMA has halted the CPU read cycle. A line
   * already sampled before DMA keeps its original service point; a newly
   * sampled line waits until the halted instruction has completed.
   */
  captureIrqDuringDma(): void {
    if (this.irqLineAsserted && !this.irqLineSampled) {
      this.irqLineSampled = true;
      this.deferDmaIrqUntilAfterInstruction = true;
    }
  }

  deferIrqSampleAfterBranch(): void {
    this.deferIrqSampleUntilNextInstruction = true;
  }

  takeNmiForInstruction(): boolean {
    const deferred = this.deferNmiUntilAfterInstruction;
    this.deferNmiUntilAfterInstruction = false;
    if (!this.nmiSampled || deferred) return false;
    this.nmiPending = false;
    this.nmiSampled = false;
    return true;
  }

  takeIrqForInstruction(): boolean {
    if (this.irqPollingDisabled) {
      // A level observed while I masked this boundary was not recognized.
      // A still-asserted physical line can be sampled again by a later poll.
      this.irqLineSampled = false;
      return false;
    }
    if (!this.softwareIrqPending && !this.irqLineSampled) {
      return false;
    }
    if (this.deferDmaIrqUntilAfterInstruction) {
      this.deferDmaIrqUntilAfterInstruction = false;
      return false;
    }
    this.softwareIrqPending = false;
    this.irqLineSampled = false;
    return true;
  }

  consumeNmiForVectorHijack(): boolean {
    if (!this.nmiPending) return false;
    this.nmiPending = false;
    this.nmiSampled = false;
    return true;
  }

  finishInterruptEntry(irqPollingDisabled: boolean): void {
    this.irqPollingDisabled = irqPollingDisabled;
    this.interruptEntryFinishedThisCycle = true;
    if (this.nmiPending) this.deferNmiUntilAfterInstruction = true;
  }

  setIrqPollingDisabled(disabled: boolean): void {
    this.irqPollingDisabled = disabled;
  }

  get hasPendingIrq(): boolean {
    return this.softwareIrqPending || this.irqLineAsserted || this.irqLineSampled;
  }

  get isIrqLineAsserted(): boolean {
    return this.irqLineAsserted;
  }
}
