export interface DmcDmaPort {
  readDmcByteForDma(address: number, haltedCpuAddress: number): number;

  repeatHaltedCpuReadForDma(address: number): void;

  completeDmcDmaByte(value: number): void;
}

export type DmcDmaCycle = "idle" | "halt" | "dummy" | "alignment" | "get";

export interface DmcDmaState {
  readonly address: number;
  readonly haltAddress: number;
  readonly preparationCycles: number;
  readonly requested: boolean;
  readonly running: boolean;
  readonly haltPhase?: "get" | "put";
}

/** Owns one DMC sample fetch from CPU halt through its GET cycle. */
export class DmcDma {
  private address = 0;
  private haltAddress = 0;
  private preparationCycles = 0;
  private requested = false;
  private running = false;
  private haltPhase: "get" | "put" | undefined;

  get active(): boolean {
    return this.running;
  }

  get pending(): boolean {
    return this.requested && !this.running;
  }

  canBegin(phase: "get" | "put"): boolean {
    return this.pending && (this.haltPhase === undefined || this.haltPhase === phase);
  }

  get preparing(): boolean {
    return this.preparationCycles > 0;
  }

  get ready(): boolean {
    return this.running && this.preparationCycles === 0;
  }

  start(address: number, haltPhase: "get" | "put"): void {
    if (this.requested) return;
    this.address = address & 0xffff;
    this.requested = true;
    this.haltPhase = haltPhase;
  }

  missHaltOnWrite(phase: "get" | "put"): void {
    if (this.canBegin(phase)) this.haltPhase = undefined;
  }

  begin(haltAddress: number): void {
    if (!this.pending) return;
    this.haltAddress = haltAddress & 0xffff;
    this.preparationCycles = 2;
    this.running = true;
  }

  clockPreparation(port: DmcDmaPort): DmcDmaCycle {
    if (!this.preparing) return "idle";
    const cycle = this.preparationCycles === 2 ? "halt" : "dummy";
    if (cycle === "halt" || !this.haltedReadHasSingleSideEffect) {
      port.repeatHaltedCpuReadForDma(this.haltAddress);
    }
    this.preparationCycles--;
    return cycle;
  }

  clockAlignment(port: DmcDmaPort): DmcDmaCycle {
    if (!this.ready) return "idle";
    if (!this.haltedReadHasSingleSideEffect) {
      port.repeatHaltedCpuReadForDma(this.haltAddress);
    }
    return "alignment";
  }

  clockGet(port: DmcDmaPort): DmcDmaCycle {
    if (!this.ready) return "idle";
    const value = port.readDmcByteForDma(this.address, this.haltAddress);
    this.reset();
    port.completeDmcDmaByte(value);
    return "get";
  }

  cancel(): void {
    this.reset();
  }

  reset(): void {
    this.address = 0;
    this.haltAddress = 0;
    this.preparationCycles = 0;
    this.requested = false;
    this.running = false;
    this.haltPhase = undefined;
  }

  captureState(): DmcDmaState {
    return {
      address: this.address,
      haltAddress: this.haltAddress,
      preparationCycles: this.preparationCycles,
      requested: this.requested,
      running: this.running,
      ...(this.haltPhase === undefined ? {} : { haltPhase: this.haltPhase }),
    };
  }

  restoreState(state: DmcDmaState): void {
    if (
      !isWord(state.address) ||
      !isWord(state.haltAddress) ||
      !Number.isInteger(state.preparationCycles) ||
      state.preparationCycles < 0 ||
      state.preparationCycles > 2
    ) {
      throw new RangeError("DMC DMA save state contains invalid transfer state");
    }
    if (state.running && !state.requested) {
      throw new RangeError("A running DMC DMA save state must retain its request");
    }
    if (state.haltPhase !== undefined && state.haltPhase !== "get" && state.haltPhase !== "put") {
      throw new RangeError("DMC DMA save state contains an invalid halt phase");
    }
    this.address = state.address;
    this.haltAddress = state.haltAddress;
    this.preparationCycles = state.preparationCycles;
    this.requested = state.requested;
    this.running = state.running;
    this.haltPhase = state.haltPhase;
  }

  private get haltedReadHasSingleSideEffect(): boolean {
    return this.haltAddress === 0x4016 || this.haltAddress === 0x4017;
  }
}

function isWord(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff;
}
