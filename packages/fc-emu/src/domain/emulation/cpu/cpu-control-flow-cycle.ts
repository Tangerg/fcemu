export interface CpuControlFlowCyclePort {
  readByte(address: number): number;
  pushByte(value: number): void;
  pullByte(): number;
  getProgramCounter(): number;
  setProgramCounter(value: number): void;
  setProcessorFlags(value: number): void;
}

export type CpuControlFlowKind = "jmp-absolute" | "jmp-indirect" | "jsr" | "rts" | "rti";

export interface CpuControlFlowCycleState {
  readonly kind: CpuControlFlowKind;
  readonly step: number;
  readonly lowByte: number;
}

/** Owns post-opcode stack and bus cycles for JSR, RTS and RTI. */
export class CpuControlFlowCycle {
  private step = 0;
  private lowByte = 0;

  constructor(readonly kind: CpuControlFlowKind) {}

  captureState(): CpuControlFlowCycleState {
    return { kind: this.kind, step: this.step, lowByte: this.lowByte };
  }

  static fromState(state: CpuControlFlowCycleState): CpuControlFlowCycle {
    const cycle = new CpuControlFlowCycle(state.kind);
    cycle.step = state.step;
    cycle.lowByte = state.lowByte;
    return cycle;
  }

  /** Clocks one post-opcode cycle and returns true at the instruction polling boundary. */
  clock(port: CpuControlFlowCyclePort): boolean {
    switch (this.kind) {
      case "jmp-absolute":
        return this.clockJmpAbsolute(port);
      case "jmp-indirect":
        return this.clockJmpIndirect(port);
      case "jsr":
        return this.clockJsr(port);
      case "rts":
        return this.clockRts(port);
      case "rti":
        return this.clockRti(port);
    }
  }

  private clockJmpAbsolute(port: CpuControlFlowCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.lowByte = this.readProgramByte(port);
        return false;
      case 1:
        port.setProgramCounter(this.lowByte | (port.readByte(port.getProgramCounter()) << 8));
        return true;
      default:
        throw new Error("A completed absolute JMP cycle cannot be clocked again");
    }
  }

  private clockJmpIndirect(port: CpuControlFlowCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.lowByte = this.readProgramByte(port);
        return false;
      case 1:
        this.lowByte |= this.readProgramByte(port) << 8;
        return false;
      case 2:
        this.stepTargetLow(port);
        return false;
      case 3: {
        const pointer = port.getProgramCounter();
        const highAddress = (pointer & 0xff00) | ((pointer + 1) & 0x00ff);
        port.setProgramCounter(this.lowByte | (port.readByte(highAddress) << 8));
        return true;
      }
      default:
        throw new Error("A completed indirect JMP cycle cannot be clocked again");
    }
  }

  private clockJsr(port: CpuControlFlowCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.lowByte = port.readByte(port.getProgramCounter());
        port.setProgramCounter(port.getProgramCounter() + 1);
        break;
      case 1:
        this.dummyRead(port);
        break;
      case 2:
        port.pushByte(port.getProgramCounter() >> 8);
        break;
      case 3:
        port.pushByte(port.getProgramCounter());
        break;
      case 4: {
        const highByte = port.readByte(port.getProgramCounter());
        port.setProgramCounter(this.lowByte | (highByte << 8));
        return true;
      }
      default:
        throw new Error("A completed JSR cycle cannot be clocked again");
    }
    return false;
  }

  private clockRts(port: CpuControlFlowCyclePort): boolean {
    switch (this.step++) {
      case 0:
        port.readByte(port.getProgramCounter());
        break;
      case 1:
        this.dummyRead(port);
        break;
      case 2:
        this.lowByte = port.pullByte();
        break;
      case 3:
        port.setProgramCounter(this.lowByte | (port.pullByte() << 8));
        break;
      case 4:
        port.readByte(port.getProgramCounter());
        port.setProgramCounter(port.getProgramCounter() + 1);
        return true;
      default:
        throw new Error("A completed RTS cycle cannot be clocked again");
    }
    return false;
  }

  private clockRti(port: CpuControlFlowCyclePort): boolean {
    switch (this.step++) {
      case 0:
        port.readByte(port.getProgramCounter());
        break;
      case 1:
        this.dummyRead(port);
        break;
      case 2:
        port.setProcessorFlags((port.pullByte() & 0xef) | 0x20);
        break;
      case 3:
        this.lowByte = port.pullByte();
        break;
      case 4:
        port.setProgramCounter(this.lowByte | (port.pullByte() << 8));
        return true;
      default:
        throw new Error("A completed RTI cycle cannot be clocked again");
    }
    return false;
  }

  private dummyRead(port: CpuControlFlowCyclePort): void {
    port.readByte(port.getProgramCounter());
  }

  private readProgramByte(port: CpuControlFlowCyclePort): number {
    const address = port.getProgramCounter();
    const value = port.readByte(address);
    port.setProgramCounter(address + 1);
    return value;
  }

  private stepTargetLow(port: CpuControlFlowCyclePort): void {
    const pointer = this.lowByte;
    this.lowByte = port.readByte(pointer);
    port.setProgramCounter(pointer);
  }
}
