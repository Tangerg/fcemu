import { isByte } from "../numeric-range.js";
import type { MapperInterruptPort } from "./mapper.js";
import { areBooleans } from "./state-validation.js";

export interface VrcIrqState {
  readonly latch: number;
  readonly counter: number;
  readonly prescaler: number;
  readonly enabled: boolean;
  readonly enabledAfterAcknowledge: boolean;
  readonly cycleMode: boolean;
  readonly pending: boolean;
}

/**
 * CPU-clocked IRQ device shared by VRC4, VRC6 and VRC7.
 *
 * Scanline mode divides CPU clocks by 113⅔ using a 341-dot accumulator; cycle
 * mode bypasses that divider. The owner maps its own register addresses.
 */
export class VrcIrq {
  private latch = 0;
  private counter = 0;
  private prescaler = 341;
  private enabled = false;
  private enabledAfterAcknowledge = false;
  private cycleMode = false;
  private pending = false;

  constructor(private readonly interruptPort: MapperInterruptPort) {
    this.powerOn();
  }

  powerOn(): void {
    this.latch = 0;
    this.counter = 0;
    this.prescaler = 341;
    this.enabled = false;
    this.enabledAfterAcknowledge = false;
    this.cycleMode = false;
    this.pending = false;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): VrcIrqState {
    return {
      latch: this.latch,
      counter: this.counter,
      prescaler: this.prescaler,
      enabled: this.enabled,
      enabledAfterAcknowledge: this.enabledAfterAcknowledge,
      cycleMode: this.cycleMode,
      pending: this.pending,
    };
  }

  restoreState(state: VrcIrqState): void {
    if (
      !isByte(state.latch) ||
      !isByte(state.counter) ||
      !Number.isInteger(state.prescaler) ||
      state.prescaler < 1 ||
      state.prescaler > 341 ||
      !areBooleans(state.enabled, state.enabledAfterAcknowledge, state.cycleMode, state.pending) ||
      (state.pending && !state.enabled)
    ) {
      throw new RangeError("VRC IRQ save state contains invalid counter or control state");
    }
    this.latch = state.latch;
    this.counter = state.counter;
    this.prescaler = state.prescaler;
    this.enabled = state.enabled;
    this.enabledAfterAcknowledge = state.enabledAfterAcknowledge;
    this.cycleMode = state.cycleMode;
    this.pending = state.pending;
    this.interruptPort.setMapperIrq(this.pending);
  }

  tick(): void {
    if (!this.enabled) return;
    if (this.cycleMode) {
      this.clockCounter();
      return;
    }
    this.prescaler -= 3;
    if (this.prescaler <= 0) {
      this.prescaler += 341;
      this.clockCounter();
    }
  }

  writeLatchNibble(value: number, high: boolean): void {
    this.latch = high
      ? (this.latch & 0x0f) | ((value & 0x0f) << 4)
      : (this.latch & 0xf0) | (value & 0x0f);
  }

  writeLatch(value: number): void {
    this.latch = value & 0xff;
  }

  writeControl(value: number): void {
    this.acknowledgeLine();
    this.enabledAfterAcknowledge = (value & 0x01) !== 0;
    this.enabled = (value & 0x02) !== 0;
    this.cycleMode = (value & 0x04) !== 0;
    this.prescaler = 341;
    if (this.enabled) this.counter = this.latch;
  }

  acknowledge(): void {
    this.acknowledgeLine();
    this.enabled = this.enabledAfterAcknowledge;
  }

  private clockCounter(): void {
    if (this.counter === 0xff) {
      this.counter = this.latch;
      this.pending = true;
      this.interruptPort.setMapperIrq(true);
    } else {
      this.counter++;
    }
  }

  private acknowledgeLine(): void {
    this.pending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
