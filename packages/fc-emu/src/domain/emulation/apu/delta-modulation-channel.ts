import { DmaBusPhase } from "../dma/dma-bus-phase.js";

export interface DmcChannelPort {
  requestDma(address: number, haltPhase: DmaBusPhase): void;
  cancelDma(): void;
  setIrq(asserted: boolean): void;
  currentDmaPhase(): DmaBusPhase;
}

export interface DmcSiliconProfile {
  readonly implicitStopAbort: boolean;
  readonly unexpectedReload: boolean;
}

/** Common late NTSC 2A03 behavior (RP2A03H and late RP2A03G). */
export const RP2A03H_DMC_PROFILE: DmcSiliconProfile = Object.freeze({
  implicitStopAbort: true,
  unexpectedReload: true,
});

/** Used where the corresponding silicon behavior has not been measured. */
export const CONSERVATIVE_DMC_PROFILE: DmcSiliconProfile = Object.freeze({
  implicitStopAbort: false,
  unexpectedReload: false,
});

export interface DeltaModulationChannelState {
  readonly outputLevel: number;
  readonly sampleAddress: number;
  readonly sampleLength: number;
  readonly currentAddress: number;
  readonly currentLength: number;
  readonly shiftRegister: number;
  readonly sampleBuffer?: number;
  readonly bitsRemaining: number;
  readonly silence: boolean;
  readonly tickPeriod: number;
  readonly tickValue: number;
  readonly loop: boolean;
  readonly irqEnabled: boolean;
  readonly irqPending: boolean;
  readonly dmaRequested: boolean;
  readonly transferStartDelay: number;
  readonly disableDelay: number;
}

/** 2A03 delta modulation channel, independent from the complete emulation bus. */
export class DeltaModulationChannel {
  private outputLevel = 0;
  private sampleAddress = 0xc000;
  private sampleLength = 1;
  private currentAddress = 0;
  public currentLength = 0;
  private shiftRegister = 0;
  private sampleBuffer: number | undefined;
  private bitsRemaining = 8;
  private silence = true;
  private tickPeriod: number;
  private tickValue: number;
  private loop = false;
  private irqEnabled = false;
  private irqPending = false;
  private dmaRequested = false;
  private transferStartDelay = 0;
  private disableDelay = 0;

  constructor(
    private readonly port: DmcChannelPort,
    private readonly timerPeriods: readonly number[],
    private readonly silicon: DmcSiliconProfile = RP2A03H_DMC_PROFILE,
  ) {
    if (
      this.timerPeriods.length !== 16 ||
      this.timerPeriods.some((period) => !Number.isSafeInteger(period) || period <= 0 || period % 2)
    ) {
      throw new RangeError("DMC timing requires sixteen positive even CPU-cycle periods");
    }
    // The power-on timer is preloaded so the output unit does not clock immediately.
    this.tickPeriod = this.timerPeriods[0];
    // Full DMC periods are even, so the first expiration fixes the output
    // unit's APU half-cycle forever. Align it with this power-on GET/PUT
    // selection instead of accidentally tying it to CPU cycle-number parity.
    this.tickValue =
      this.port.currentDmaPhase() === DmaBusPhase.Get ? this.tickPeriod : this.tickPeriod - 1;
  }

  set control(value: number) {
    this.irqEnabled = (value & 0x80) !== 0;
    if (!this.irqEnabled) this.clearIRQ();
    this.loop = (value & 0x40) !== 0;
    this.tickPeriod = this.timerPeriods[value & 0x0f];
  }

  set value(value: number) {
    this.outputLevel = value & 0x7f;
  }

  set address(value: number) {
    this.sampleAddress = 0xc000 | ((value & 0xff) << 6);
  }

  set length(value: number) {
    this.sampleLength = ((value & 0xff) << 4) | 1;
  }

  restart(): void {
    this.currentAddress = this.sampleAddress;
    this.currentLength = this.sampleLength;
  }

  private requestReaderDma(haltPhase: DmaBusPhase): void {
    if (
      this.transferStartDelay === 0 &&
      this.currentLength > 0 &&
      this.sampleBuffer === undefined &&
      !this.dmaRequested
    ) {
      this.dmaRequested = true;
      this.port.requestDma(this.currentAddress, haltPhase);
    }
  }

  /** Advances delayed $4015 enable/disable effects by one CPU cycle. */
  clockCpu(): void {
    if (this.disableDelay > 0 && --this.disableDelay === 0) {
      this.currentLength = 0;
      if (this.dmaRequested) {
        this.port.cancelDma();
        this.dmaRequested = false;
      }
    }
    if (this.transferStartDelay > 0 && --this.transferStartDelay === 0) {
      this.requestReaderDma(DmaBusPhase.Get);
    }
  }

  completeDmaByte(value: number): void {
    this.dmaRequested = false;
    if (this.currentLength === 0) return;

    this.sampleBuffer = value & 0xff;
    this.currentAddress = (this.currentAddress + 1) & 0xffff;
    if (this.currentAddress === 0) this.currentAddress = 0x8000;
    this.currentLength--;
    if (this.currentLength === 0 && this.loop) {
      this.restart();
    } else if (this.currentLength === 0 && this.irqEnabled) {
      this.irqPending = true;
      this.port.setIrq(true);
    }
    this.applyImplicitStopGlitch();
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      if (this.disableDelay === 0) {
        this.disableDelay = this.port.currentDmaPhase() === DmaBusPhase.Get ? 2 : 3;
      }
    } else if (this.currentLength === 0) {
      this.restart();
      // The sample fetch halts the CPU on the third or fourth cycle after the
      // $4015 write, depending on whether that write landed on GET or PUT.
      this.transferStartDelay = this.port.currentDmaPhase() === DmaBusPhase.Get ? 3 : 4;
    }
  }

  updateShifter(): void {
    if (!this.silence && (this.shiftRegister & 1) !== 0) {
      if (this.outputLevel <= 125) this.outputLevel += 2;
    } else if (!this.silence && this.outputLevel >= 2) {
      this.outputLevel -= 2;
    }
    this.shiftRegister >>= 1;
    if (--this.bitsRemaining > 0) return;

    this.bitsRemaining = 8;
    if (this.sampleBuffer === undefined) {
      this.silence = true;
    } else {
      this.silence = false;
      this.shiftRegister = this.sampleBuffer;
      this.sampleBuffer = undefined;
      // Emptying the reader buffer schedules a reload DMA immediately. Waiting
      // for the next timer tick shifts the request by a complete DMC period.
      this.requestReaderDma(DmaBusPhase.Put);
    }
  }

  updateTimer(): void {
    if (this.tickValue <= 1) {
      this.tickValue = this.tickPeriod;
      this.updateShifter();
    } else {
      this.tickValue--;
    }
  }

  output(): number {
    return this.outputLevel;
  }

  get interruptPending(): boolean {
    return this.irqPending;
  }

  get mayRequestDma(): boolean {
    return this.currentLength > 0 || this.dmaRequested;
  }

  clearIRQ(): void {
    this.irqPending = false;
    this.port.setIrq(false);
  }

  /**
   * Models the one-byte implicit-stop races measured on NTSC 2A03 silicon.
   * These depend on the DMA completion landing at the output bit-counter
   * boundary and are intentionally separate from ordinary reader reloads.
   */
  private applyImplicitStopGlitch(): void {
    if (this.sampleLength !== 1 || this.loop || this.sampleBuffer === undefined) return;

    if (
      this.silicon.unexpectedReload &&
      this.bitsRemaining === 8 &&
      this.tickValue === this.tickPeriod
    ) {
      this.shiftRegister = this.sampleBuffer;
      this.silence = false;
      this.sampleBuffer = undefined;
      this.restart();
      this.requestReaderDma(DmaBusPhase.Put);
      return;
    }

    if (this.silicon.implicitStopAbort && this.bitsRemaining === 1 && this.tickValue < 2) {
      this.shiftRegister = this.sampleBuffer;
      this.restart();
      // The following output clock empties the buffer and schedules a reload;
      // clearing the length three CPU cycles later aborts it after its halt.
      this.disableDelay = 3;
    }
  }

  captureState(): DeltaModulationChannelState {
    return {
      outputLevel: this.outputLevel,
      sampleAddress: this.sampleAddress,
      sampleLength: this.sampleLength,
      currentAddress: this.currentAddress,
      currentLength: this.currentLength,
      shiftRegister: this.shiftRegister,
      ...(this.sampleBuffer === undefined ? {} : { sampleBuffer: this.sampleBuffer }),
      bitsRemaining: this.bitsRemaining,
      silence: this.silence,
      tickPeriod: this.tickPeriod,
      tickValue: this.tickValue,
      loop: this.loop,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      dmaRequested: this.dmaRequested,
      transferStartDelay: this.transferStartDelay,
      disableDelay: this.disableDelay,
    };
  }

  restoreState(state: DeltaModulationChannelState): void {
    this.outputLevel = state.outputLevel;
    this.sampleAddress = state.sampleAddress;
    this.sampleLength = state.sampleLength;
    this.currentAddress = state.currentAddress;
    this.currentLength = state.currentLength;
    this.shiftRegister = state.shiftRegister;
    this.sampleBuffer = state.sampleBuffer;
    this.bitsRemaining = state.bitsRemaining;
    this.silence = state.silence;
    this.tickPeriod = state.tickPeriod;
    this.tickValue = state.tickValue;
    this.loop = state.loop;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.dmaRequested = state.dmaRequested;
    this.transferStartDelay = state.transferStartDelay;
    this.disableDelay = state.disableDelay;
  }
}
