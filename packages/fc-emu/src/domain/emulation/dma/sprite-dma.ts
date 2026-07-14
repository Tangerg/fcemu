import { isByte } from "../numeric-range.js";
import { DmaBusPhase } from "./dma-bus-phase.js";

export interface SpriteDmaPort {
  readCpuByteForDma(address: number): number;

  writeOamByteForDma(value: number): void;
}

export type SpriteDmaCycle = "idle" | "halt" | DmaBusPhase;

export interface SpriteDmaState {
  readonly page: number;
  readonly index: number;
  readonly readValue: number;
  readonly phase: SpriteDmaCycle;
}

/**
 * OAM DMA owns the halt and 256-byte transfer after a write to $4014. The
 * arbiter owns cadence alignment because GET/PUT phase belongs to the shared
 * 2A03 DMA hardware rather than to this transfer.
 */
export class SpriteDma {
  private page = 0;
  private index = 0;
  private readValue = 0;
  private phase: SpriteDmaCycle = "idle";

  get active(): boolean {
    return this.phase !== "idle";
  }

  get nextCycle(): SpriteDmaCycle {
    return this.phase;
  }

  start(page: number): void {
    if (this.active && this.phase !== "halt") {
      throw new Error("Sprite DMA is already transferring");
    }
    this.page = page & 0xff;
    this.index = 0;
    this.readValue = 0;
    this.phase = "halt";
  }

  clock(port: SpriteDmaPort): SpriteDmaCycle {
    const currentPhase = this.phase;
    switch (currentPhase) {
      case "idle":
        return currentPhase;
      case "halt":
        this.phase = DmaBusPhase.Get;
        return currentPhase;
      case DmaBusPhase.Get:
        this.readValue = port.readCpuByteForDma((this.page << 8) | this.index);
        this.phase = DmaBusPhase.Put;
        return currentPhase;
      case DmaBusPhase.Put:
        port.writeOamByteForDma(this.readValue);
        this.index++;
        this.phase = this.index === 0x100 ? "idle" : DmaBusPhase.Get;
        return currentPhase;
    }
  }

  reset(): void {
    this.page = 0;
    this.index = 0;
    this.readValue = 0;
    this.phase = "idle";
  }

  captureState(): SpriteDmaState {
    return {
      page: this.page,
      index: this.index,
      readValue: this.readValue,
      phase: this.phase,
    };
  }

  restoreState(state: SpriteDmaState): void {
    if (
      !isByte(state.page) ||
      !Number.isInteger(state.index) ||
      state.index < 0 ||
      state.index > 0x100 ||
      !isByte(state.readValue)
    ) {
      throw new RangeError("Sprite DMA save state contains an invalid transfer value");
    }
    if (!["idle", "halt", DmaBusPhase.Get, DmaBusPhase.Put].includes(state.phase)) {
      throw new RangeError("Sprite DMA save state contains an invalid phase");
    }
    this.page = state.page;
    this.index = state.index;
    this.readValue = state.readValue;
    this.phase = state.phase;
  }
}
