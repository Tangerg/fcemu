export type CpuInterruptEntryKind = "irq" | "nmi" | "brk";

export interface CpuInterruptEntryState {
  readonly kind: CpuInterruptEntryKind;
  readonly step: number;
  readonly vector: number;
  readonly vectorLow: number;
}

export interface CpuInterruptEntryPort {
  readByte(address: number): number;
  pushByte(value: number): void;
  getProgramCounter(): number;
  setProgramCounter(value: number): void;
  getProcessorFlags(): number;
  setInterruptDisabled(): void;
  consumeNmiForVectorHijack(): boolean;
}

/** One bus-cycle-at-a-time IRQ, NMI or BRK entry sequence. */
export class CpuInterruptEntry {
  private step = 0;
  private vector: number;
  private vectorLow = 0;

  constructor(readonly kind: CpuInterruptEntryKind) {
    this.vector = kind === "nmi" ? 0xfffa : 0xfffe;
  }

  captureState(): CpuInterruptEntryState {
    return { kind: this.kind, step: this.step, vector: this.vector, vectorLow: this.vectorLow };
  }

  static fromState(state: CpuInterruptEntryState): CpuInterruptEntry {
    const entry = new CpuInterruptEntry(state.kind);
    entry.step = state.step;
    entry.vector = state.vector;
    entry.vectorLow = state.vectorLow;
    return entry;
  }

  /** Clocks one entry cycle and returns true after the vector high read. */
  clock(port: CpuInterruptEntryPort): boolean {
    const finished = this.kind === "brk" ? this.clockBrk(port) : this.clockHardware(port);
    if (!finished) this.step++;
    return finished;
  }

  private clockHardware(port: CpuInterruptEntryPort): boolean {
    switch (this.step) {
      case 0:
      case 1:
        port.readByte(port.getProgramCounter());
        break;
      case 2:
        port.pushByte(port.getProgramCounter() >> 8);
        break;
      case 3:
        port.pushByte(port.getProgramCounter());
        break;
      case 4:
        this.hijackIrqVector(port);
        port.pushByte(port.getProcessorFlags() & 0xef);
        port.setInterruptDisabled();
        break;
      case 5:
        this.vectorLow = port.readByte(this.vector);
        break;
      case 6:
        port.setProgramCounter(this.vectorLow | (port.readByte(this.vector + 1) << 8));
        return true;
    }
    return false;
  }

  private clockBrk(port: CpuInterruptEntryPort): boolean {
    switch (this.step) {
      case 0:
        port.readByte(port.getProgramCounter());
        port.setProgramCounter((port.getProgramCounter() + 1) & 0xffff);
        break;
      case 1:
        port.pushByte(port.getProgramCounter() >> 8);
        break;
      case 2:
        port.pushByte(port.getProgramCounter());
        break;
      case 3:
        if (port.consumeNmiForVectorHijack()) this.vector = 0xfffa;
        port.pushByte(port.getProcessorFlags() | 0x10);
        port.setInterruptDisabled();
        break;
      case 4:
        this.vectorLow = port.readByte(this.vector);
        break;
      case 5:
        port.setProgramCounter(this.vectorLow | (port.readByte(this.vector + 1) << 8));
        return true;
    }
    return false;
  }

  private hijackIrqVector(port: CpuInterruptEntryPort): void {
    if (this.kind === "irq" && port.consumeNmiForVectorHijack()) this.vector = 0xfffa;
  }
}
