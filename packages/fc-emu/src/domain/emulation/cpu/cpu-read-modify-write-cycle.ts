export interface CpuReadModifyWriteCyclePort {
  readByte(address: number): number;
  writeByte(address: number, value: number): void;
}

export interface CpuReadModifyWriteCycleState {
  readonly address: number;
  readonly step: number;
  readonly previousValue: number;
}

/** Owns the NMOS 6502 read/write-old/write-new data-bus sequence. */
export class CpuReadModifyWriteCycle {
  private step = 0;
  private previousValue = 0;

  constructor(
    private readonly address: number,
    private readonly transform: (previousValue: number) => number,
  ) {}

  captureState(): CpuReadModifyWriteCycleState {
    return { address: this.address, step: this.step, previousValue: this.previousValue };
  }

  static fromState(
    state: CpuReadModifyWriteCycleState,
    transform: (previousValue: number) => number,
  ): CpuReadModifyWriteCycle {
    const cycle = new CpuReadModifyWriteCycle(state.address, transform);
    cycle.step = state.step;
    cycle.previousValue = state.previousValue;
    return cycle;
  }

  /** Clocks one data cycle and returns the new byte after the final write. */
  clock(port: CpuReadModifyWriteCyclePort): number | undefined {
    switch (this.step++) {
      case 0:
        this.previousValue = port.readByte(this.address);
        return undefined;
      case 1:
        port.writeByte(this.address, this.previousValue);
        return undefined;
      case 2: {
        const value = this.transform(this.previousValue) & 0xff;
        port.writeByte(this.address, value);
        return value;
      }
      default:
        throw new Error("A completed read-modify-write cycle cannot be clocked again");
    }
  }
}
