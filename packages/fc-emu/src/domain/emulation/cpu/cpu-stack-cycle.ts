export interface CpuStackCyclePort {
  readByte(address: number): number;
  pushByte(value: number): void;
  pullByte(): number;
  getProgramCounter(): number;
}

export type CpuStackCycleResult =
  { readonly kind: "pushed" } | { readonly kind: "pulled"; readonly value: number };

export interface CpuStackCycleState {
  readonly operation: "push" | "pull";
  readonly pushedValue: number;
  readonly step: number;
}

/** Owns the post-opcode bus sequence shared by PHA/PHP and PLA/PLP. */
export class CpuStackCycle {
  private step = 0;

  private constructor(
    private readonly operation: "push" | "pull",
    private readonly pushedValue = 0,
  ) {}

  static push(value: number): CpuStackCycle {
    return new CpuStackCycle("push", value & 0xff);
  }

  static pull(): CpuStackCycle {
    return new CpuStackCycle("pull");
  }

  captureState(): CpuStackCycleState {
    return { operation: this.operation, pushedValue: this.pushedValue, step: this.step };
  }

  static fromState(state: CpuStackCycleState): CpuStackCycle {
    const cycle = new CpuStackCycle(state.operation, state.pushedValue);
    cycle.step = state.step;
    return cycle;
  }

  /** Clocks one post-opcode cycle and returns a value only at completion. */
  clock(port: CpuStackCyclePort): CpuStackCycleResult | undefined {
    if (this.operation === "push") return this.clockPush(port);
    return this.clockPull(port);
  }

  private clockPush(port: CpuStackCyclePort): CpuStackCycleResult | undefined {
    switch (this.step++) {
      case 0:
        port.readByte(port.getProgramCounter());
        return undefined;
      case 1:
        port.pushByte(this.pushedValue);
        return { kind: "pushed" };
      default:
        throw new Error("A completed stack push cannot be clocked again");
    }
  }

  private clockPull(port: CpuStackCyclePort): CpuStackCycleResult | undefined {
    switch (this.step++) {
      case 0:
        port.readByte(port.getProgramCounter());
        return undefined;
      case 1:
        port.readByte(port.getProgramCounter());
        return undefined;
      case 2:
        return { kind: "pulled", value: port.pullByte() & 0xff };
      default:
        throw new Error("A completed stack pull cannot be clocked again");
    }
  }
}
