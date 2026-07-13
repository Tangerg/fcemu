export interface CpuBranchCyclePort {
  readByte(address: number): number;
  getProgramCounter(): number;
  setProgramCounter(value: number): void;
}

export interface CpuBranchResult {
  readonly taken: boolean;
  readonly pageCrossed: boolean;
}

export interface CpuBranchCycleState {
  readonly taken: boolean;
  readonly step: number;
  readonly target: number;
  readonly wrongPageAddress: number;
  readonly pageCrossed: boolean;
}

/** Owns operand, taken-dummy and wrong-page cycles for one relative branch. */
export class CpuBranchCycle {
  private step = 0;
  private target = 0;
  private wrongPageAddress = 0;
  private pageCrossed = false;

  constructor(private readonly taken: boolean) {}

  captureState(): CpuBranchCycleState {
    return {
      taken: this.taken,
      step: this.step,
      target: this.target,
      wrongPageAddress: this.wrongPageAddress,
      pageCrossed: this.pageCrossed,
    };
  }

  static fromState(state: CpuBranchCycleState): CpuBranchCycle {
    const cycle = new CpuBranchCycle(state.taken);
    cycle.step = state.step;
    cycle.target = state.target;
    cycle.wrongPageAddress = state.wrongPageAddress;
    cycle.pageCrossed = state.pageCrossed;
    return cycle;
  }

  /** Branches poll before the operand cycle and crossings again before PCH fixup. */
  get pollsBeforeCurrentCycle(): boolean {
    return this.step === 0 || (this.taken && this.step === 2 && this.pageCrossed);
  }

  /** Clocks one post-opcode cycle and returns the result at the polling boundary. */
  clock(port: CpuBranchCyclePort): CpuBranchResult | undefined {
    switch (this.step++) {
      case 0:
        return this.readOffset(port);
      case 1:
        return this.clockTakenDummy(port);
      case 2:
        port.readByte(this.wrongPageAddress);
        port.setProgramCounter(this.target);
        return { taken: true, pageCrossed: true };
      default:
        throw new Error("A completed branch cycle cannot be clocked again");
    }
  }

  private readOffset(port: CpuBranchCyclePort): CpuBranchResult | undefined {
    const operandAddress = port.getProgramCounter();
    const offsetByte = port.readByte(operandAddress);
    const nextProgramCounter = (operandAddress + 1) & 0xffff;
    port.setProgramCounter(nextProgramCounter);
    if (!this.taken) return { taken: false, pageCrossed: false };

    const signedOffset = offsetByte < 0x80 ? offsetByte : offsetByte - 0x100;
    this.target = (nextProgramCounter + signedOffset) & 0xffff;
    this.pageCrossed = (nextProgramCounter & 0xff00) !== (this.target & 0xff00);
    this.wrongPageAddress = (nextProgramCounter & 0xff00) | (this.target & 0x00ff);
    return undefined;
  }

  private clockTakenDummy(port: CpuBranchCyclePort): CpuBranchResult | undefined {
    port.readByte(port.getProgramCounter());
    if (this.pageCrossed) {
      port.setProgramCounter(this.wrongPageAddress);
      return undefined;
    }
    port.setProgramCounter(this.target);
    return { taken: true, pageCrossed: false };
  }
}
