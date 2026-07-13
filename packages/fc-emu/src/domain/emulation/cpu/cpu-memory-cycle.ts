export type CpuMemoryCycleKind =
  | "immediate"
  | "zero-page"
  | "zero-page-indexed"
  | "absolute"
  | "absolute-indexed-read"
  | "absolute-indexed-write"
  | "indexed-indirect"
  | "indirect-indexed-read"
  | "indirect-indexed-write";

export interface CpuMemoryCycleState {
  readonly kind: CpuMemoryCycleKind;
  readonly index: number;
  readonly step: number;
  readonly address: number;
  readonly effectiveAddress: number;
  readonly pageCrossed: boolean;
  readonly indexedDummyReadHalted: boolean;
}

export interface CpuMemoryCyclePort {
  readByte(address: number): number;
  dummyRead(address: number, effectiveAddress: number): boolean;
  execute(address: number): void;
  getProgramCounter(): number;
  setProgramCounter(value: number): void;
}

/** Resolves an operand address one external CPU bus cycle at a time. */
export class CpuMemoryCycle {
  private step = 0;
  private address = 0;
  private effectiveAddress = 0;
  private pageCrossed = false;
  private indexedDummyReadHalted = false;

  constructor(
    readonly kind: CpuMemoryCycleKind,
    private readonly index = 0,
  ) {}

  captureState(): CpuMemoryCycleState {
    return {
      kind: this.kind,
      index: this.index,
      step: this.step,
      address: this.address,
      effectiveAddress: this.effectiveAddress,
      pageCrossed: this.pageCrossed,
      indexedDummyReadHalted: this.indexedDummyReadHalted,
    };
  }

  static fromState(state: CpuMemoryCycleState): CpuMemoryCycle {
    const cycle = new CpuMemoryCycle(state.kind, state.index);
    cycle.step = state.step;
    cycle.address = state.address;
    cycle.effectiveAddress = state.effectiveAddress;
    cycle.pageCrossed = state.pageCrossed;
    cycle.indexedDummyReadHalted = state.indexedDummyReadHalted;
    return cycle;
  }

  /** Whether RDY stretched the indexed dummy read immediately before a write. */
  get indexedDummyReadWasHalted(): boolean {
    return this.indexedDummyReadHalted;
  }

  /** Clocks one post-opcode cycle and returns true after the data operation. */
  clock(port: CpuMemoryCyclePort): boolean {
    switch (this.kind) {
      case "immediate":
        return this.clockImmediate(port);
      case "zero-page":
        return this.clockZeroPage(port);
      case "zero-page-indexed":
        return this.clockZeroPageIndexed(port);
      case "absolute":
        return this.clockAbsolute(port);
      case "absolute-indexed-read":
        return this.clockAbsoluteIndexed(port, false);
      case "absolute-indexed-write":
        return this.clockAbsoluteIndexed(port, true);
      case "indexed-indirect":
        return this.clockIndexedIndirect(port);
      case "indirect-indexed-read":
        return this.clockIndirectIndexed(port, false);
      case "indirect-indexed-write":
        return this.clockIndirectIndexed(port, true);
    }
  }

  private clockImmediate(port: CpuMemoryCyclePort): boolean {
    if (this.step++ > 0) throw this.completedError();
    const address = port.getProgramCounter();
    port.setProgramCounter(address + 1);
    port.execute(address);
    return true;
  }

  private clockZeroPage(port: CpuMemoryCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        port.execute(this.address);
        return true;
      default:
        throw this.completedError();
    }
  }

  private clockZeroPageIndexed(port: CpuMemoryCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        this.effectiveAddress = (this.address + this.index) & 0xff;
        port.dummyRead(this.address, this.effectiveAddress);
        this.address = this.effectiveAddress;
        return false;
      case 2:
        port.execute(this.address);
        return true;
      default:
        throw this.completedError();
    }
  }

  private clockAbsolute(port: CpuMemoryCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        this.address |= this.readProgramByte(port) << 8;
        return false;
      case 2:
        port.execute(this.address);
        return true;
      default:
        throw this.completedError();
    }
  }

  private clockAbsoluteIndexed(port: CpuMemoryCyclePort, alwaysDummyRead: boolean): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        this.address |= this.readProgramByte(port) << 8;
        this.resolveIndexedAddress();
        return false;
      case 2:
        if (!alwaysDummyRead && !this.pageCrossed) {
          port.execute(this.effectiveAddress);
          return true;
        }
        this.indexedDummyReadHalted = port.dummyRead(
          this.wrongPageAddress(),
          this.effectiveAddress,
        );
        return false;
      case 3:
        port.execute(this.effectiveAddress);
        return true;
      default:
        throw this.completedError();
    }
  }

  private clockIndexedIndirect(port: CpuMemoryCyclePort): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        this.effectiveAddress = (this.address + this.index) & 0xff;
        port.dummyRead(this.address, this.effectiveAddress);
        this.address = this.effectiveAddress;
        return false;
      case 2:
        this.effectiveAddress = port.readByte(this.address);
        return false;
      case 3:
        this.effectiveAddress |= port.readByte((this.address + 1) & 0xff) << 8;
        return false;
      case 4:
        port.execute(this.effectiveAddress);
        return true;
      default:
        throw this.completedError();
    }
  }

  private clockIndirectIndexed(port: CpuMemoryCyclePort, alwaysDummyRead: boolean): boolean {
    switch (this.step++) {
      case 0:
        this.address = this.readProgramByte(port);
        return false;
      case 1:
        this.effectiveAddress = port.readByte(this.address);
        return false;
      case 2: {
        const highByte = port.readByte((this.address + 1) & 0xff);
        this.address = this.effectiveAddress | (highByte << 8);
        this.resolveIndexedAddress();
        return false;
      }
      case 3:
        if (!alwaysDummyRead && !this.pageCrossed) {
          port.execute(this.effectiveAddress);
          return true;
        }
        this.indexedDummyReadHalted = port.dummyRead(
          this.wrongPageAddress(),
          this.effectiveAddress,
        );
        return false;
      case 4:
        port.execute(this.effectiveAddress);
        return true;
      default:
        throw this.completedError();
    }
  }

  private resolveIndexedAddress(): void {
    this.effectiveAddress = (this.address + this.index) & 0xffff;
    this.pageCrossed = (this.address & 0xff00) !== (this.effectiveAddress & 0xff00);
  }

  private wrongPageAddress(): number {
    return (this.address & 0xff00) | (this.effectiveAddress & 0x00ff);
  }

  private readProgramByte(port: CpuMemoryCyclePort): number {
    const address = port.getProgramCounter();
    const value = port.readByte(address);
    port.setProgramCounter(address + 1);
    return value;
  }

  private completedError(): Error {
    return new Error(`A completed ${this.kind} memory cycle cannot be clocked again`);
  }
}
