import { DmcDma, type DmcDmaCycle, type DmcDmaPort, type DmcDmaState } from "./dmc-dma.js";
import {
  SpriteDma,
  type SpriteDmaCycle,
  type SpriteDmaPort,
  type SpriteDmaState,
} from "./sprite-dma.js";

export type DmaBusPhase = "get" | "put";

interface DmaAlignmentState {
  readonly getCycleParity: 0 | 1;
}

export interface DmaArbiterPort extends DmcDmaPort, SpriteDmaPort {}

export type DmaCycle = DmcDmaCycle | SpriteDmaCycle | "sprite-and-dmc-preparation";

export interface DmaArbiterState {
  readonly cadence: DmaAlignmentState;
  readonly sprite: SpriteDmaState;
  readonly dmc: DmcDmaState;
}

/** Arbitrates the shared CPU bus between OAM and DMC DMA transfers. */
export class DmaArbiter {
  private getCycleParity: 0 | 1 = 1;
  private readonly sprite = new SpriteDma();
  private readonly dmc = new DmcDma();

  get active(): boolean {
    return this.sprite.active || this.dmc.active;
  }

  /** A pending OAM halt must first observe a CPU read; an active transfer already owns the bus. */
  get ownsBusCycle(): boolean {
    return this.dmc.active || (this.sprite.active && this.sprite.nextCycle !== "halt");
  }

  get awaitingSpriteHalt(): boolean {
    return this.sprite.nextCycle === "halt";
  }

  get hasPendingDmc(): boolean {
    return this.dmc.pending;
  }

  phaseAt(completedCpuCycle: number): DmaBusPhase {
    return completedCpuCycle % 2 === this.getCycleParity ? "get" : "put";
  }

  startSprite(page: number): void {
    this.sprite.start(page);
  }

  startDmc(address: number, haltPhase: DmaBusPhase): void {
    this.dmc.start(address, haltPhase);
  }

  canBeginDmcAt(completedCpuCycle: number): boolean {
    return this.dmc.canBegin(this.phaseAt(completedCpuCycle));
  }

  missDmcHaltOnWrite(completedCpuCycle: number): void {
    this.dmc.missHaltOnWrite(this.phaseAt(completedCpuCycle));
  }

  beginDmc(haltAddress: number): void {
    this.dmc.begin(haltAddress);
  }

  cancelDmc(): void {
    this.dmc.cancel();
  }

  clock(completedCpuCycles: number, port: DmaArbiterPort): DmaCycle {
    const getCycle = this.phaseAt(completedCpuCycles) === "get";

    if (this.dmc.preparing) {
      const dmcCycle = this.dmc.clockPreparation(port);
      if (this.canClockSprite(getCycle)) {
        this.sprite.clock(port);
        return "sprite-and-dmc-preparation";
      }
      return dmcCycle;
    }

    if (this.dmc.ready && getCycle) return this.dmc.clockGet(port);
    if (this.canClockSprite(getCycle)) return this.sprite.clock(port);
    if (this.sprite.nextCycle === "get") return "alignment";
    if (this.dmc.ready) return this.dmc.clockAlignment(port);
    return "idle";
  }

  reset(): void {
    this.sprite.reset();
    this.dmc.reset();
  }

  captureState(): DmaArbiterState {
    return {
      cadence: { getCycleParity: this.getCycleParity },
      sprite: this.sprite.captureState(),
      dmc: this.dmc.captureState(),
    };
  }

  restoreState(state: DmaArbiterState): void {
    if (state.cadence.getCycleParity !== 0 && state.cadence.getCycleParity !== 1) {
      throw new RangeError("DMA save state contains an invalid GET-cycle parity");
    }
    this.getCycleParity = state.cadence.getCycleParity;
    this.sprite.restoreState(state.sprite);
    this.dmc.restoreState(state.dmc);
  }

  private canClockSprite(getCycle: boolean): boolean {
    if (!this.sprite.active) return false;
    const next = this.sprite.nextCycle;
    return next === "halt" || (next === "get" && getCycle) || (next === "put" && !getCycle);
  }
}
