import { isByte } from "./numeric-range.js";

export interface OekaKidsTabletInput {
  /** Native tablet X coordinate reported in the hardware's 0-239 range. */
  readonly x: number;
  /** Native tablet Y coordinate reported in the hardware's 0-255 range. */
  readonly y: number;
  readonly touching: boolean;
  readonly clicked: boolean;
}

export interface OekaKidsTabletState extends OekaKidsTabletInput {
  readonly strobeSignal: boolean;
  readonly advanceSignal: boolean;
  readonly report: number;
}

export interface OekaKidsTabletRead {
  readonly value: number;
  readonly drivenMask: 0x0c;
}

const MAX_X = 239;
const MAX_REPORT = 0x7ffff;

/**
 * Bandai Oeka Kids drawing tablet connected to the Famicom expansion port.
 *
 * OUT0 latches or enables reads, OUT1 advances the 18-bit report, and the
 * peripheral drives D2/D3 on $4017. Cartridge banking deliberately remains
 * outside this device even though both known games use mapper 96.
 */
export class OekaKidsTablet {
  private x = 0;
  private y = 0;
  private touching = false;
  private clicked = false;
  private strobeSignal = false;
  private advanceSignal = false;
  private report = 0;

  /** Resets console-side serial state without changing the physical stylus. */
  powerOn(): void {
    this.strobeSignal = false;
    this.advanceSignal = false;
    this.report = 0;
  }

  setInput(input: OekaKidsTabletInput): void {
    OekaKidsTablet.validateInput(input, "Oeka Kids tablet input");
    this.x = input.x;
    this.y = input.y;
    this.touching = input.touching;
    this.clicked = input.clicked;
  }

  /** Applies the RP2A03 OUT0/OUT1 latch after the shared $4016 write commits. */
  writeLatch(value: number): void {
    if (!isByte(value)) throw new RangeError("Oeka Kids tablet latch value must be a byte");
    const nextStrobe = (value & 0x01) !== 0;
    const nextAdvance = (value & 0x02) !== 0;

    if (!nextStrobe) {
      this.report =
        (this.x << 10) | (this.y << 2) | (Number(this.touching) << 1) | Number(this.clicked);
    } else if (!this.advanceSignal && nextAdvance) {
      // The receiver raises OUT1 before sampling D3, so shifting once places
      // the original report MSB on bit 18 as observed by real software.
      this.report = (this.report << 1) & MAX_REPORT;
    }

    this.strobeSignal = nextStrobe;
    this.advanceSignal = nextAdvance;
  }

  read(): OekaKidsTabletRead {
    let value = 0;
    if (this.strobeSignal) {
      value = this.advanceSignal ? (this.report & 0x40000 ? 0 : 0x08) : 0x04;
    }
    return { value, drivenMask: 0x0c };
  }

  captureState(): OekaKidsTabletState {
    return {
      x: this.x,
      y: this.y,
      touching: this.touching,
      clicked: this.clicked,
      strobeSignal: this.strobeSignal,
      advanceSignal: this.advanceSignal,
      report: this.report,
    };
  }

  restoreState(state: OekaKidsTabletState): void {
    OekaKidsTablet.validateInput(state, "Oeka Kids tablet save state");
    if (
      typeof state.strobeSignal !== "boolean" ||
      typeof state.advanceSignal !== "boolean" ||
      !Number.isInteger(state.report) ||
      state.report < 0 ||
      state.report > MAX_REPORT
    ) {
      throw new RangeError("Oeka Kids tablet save state contains invalid serial state");
    }
    this.x = state.x;
    this.y = state.y;
    this.touching = state.touching;
    this.clicked = state.clicked;
    this.strobeSignal = state.strobeSignal;
    this.advanceSignal = state.advanceSignal;
    this.report = state.report;
  }

  private static validateInput(input: OekaKidsTabletInput, label: string): void {
    if (!Number.isInteger(input.x) || input.x < 0 || input.x > MAX_X || !isByte(input.y)) {
      throw new RangeError(`${label} coordinates must use native X 0-239 and Y 0-255 ranges`);
    }
    if (typeof input.touching !== "boolean" || typeof input.clicked !== "boolean") {
      throw new TypeError(`${label} contact states must be boolean`);
    }
    if (input.clicked && !input.touching) {
      throw new RangeError(`${label} cannot click without touching the tablet`);
    }
  }
}
