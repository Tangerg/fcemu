const UNUSED_STACK_BIT = 0x20;

/** The six physical NMOS 6502 status latches with a canonical byte projection. */
export class ProcessorStatus {
  C = false;
  private zero = false;
  I = false;
  D = false;
  V = false;
  private negative = false;

  private static readonly POWER_ON_FLAGS = 0x24;

  /** Bit 5 is canonicalized high; stack-only bit 4 is synthesized by the push operation. */
  get flags(): number {
    return (
      UNUSED_STACK_BIT |
      (this.C ? 0x01 : 0) |
      (this.zero ? 0x02 : 0) |
      (this.I ? 0x04 : 0) |
      (this.D ? 0x08 : 0) |
      (this.V ? 0x40 : 0) |
      (this.negative ? 0x80 : 0)
    );
  }

  /** Restores the six physical flags and ignores the two stack-only bits. */
  set flags(flags: number) {
    this.C = (flags & 0x01) !== 0;
    this.zero = (flags & 0x02) !== 0;
    this.I = (flags & 0x04) !== 0;
    this.D = (flags & 0x08) !== 0;
    this.V = (flags & 0x40) !== 0;
    this.negative = (flags & 0x80) !== 0;
  }

  set Z(value: number) {
    this.zero = value === 0;
  }

  get Z(): boolean {
    return this.zero;
  }

  set N(value: number) {
    this.negative = (value & 0x80) !== 0;
  }

  get N(): boolean {
    return this.negative;
  }

  set ZN(value: number) {
    this.Z = value;
    this.N = value;
  }

  /** Restores the deterministic 2A03 power-on status byte. */
  powerOn(): void {
    this.flags = ProcessorStatus.POWER_ON_FLAGS;
  }

  /** The reset line preserves arithmetic flags and only masks IRQ. */
  reset(): void {
    this.I = true;
  }
}
