/** Mutable NMOS 6502 status-register value object with byte packing semantics. */
export class ProcessorStatus {
  // Carry Flag: Set if last operation resulted in a carry or if a borrow was not needed
  public C: boolean = false;
  // Zero Flag: Set if the result of last operation was zero
  private _Z: boolean = false;
  // Interrupt Disable Flag: When set, disables IRQ interrupts
  public I: boolean = false;
  // Decimal Mode Flag: Controls whether arithmetic operations use binary or BCD arithmetic
  public D: boolean = false;
  // Break Command Flag: Set when a BRK instruction is executed
  public B: boolean = false;
  // Unused Flag: Bit 5 is always set to 1
  public readonly U: boolean = true;
  // Overflow Flag: Set when signed arithmetic operation results in overflow
  public V: boolean = false;
  // Negative Flag: Set if bit 7 of the last operation result was 1
  private _N: boolean = false;
  // Power-on state: unused and interrupt-disable flags are set.
  private static readonly POWER_ON_FLAGS: number = 0b00100100;

  /**
   * Gets the processor status flags as a byte
   * Each bit represents a flag state
   * @returns 8-bit value representing all flags
   */
  get flags(): number {
    let flags = 0;
    flags |= (this.C ? 1 : 0) << 0; // Carry in bit 0
    flags |= (this._Z ? 1 : 0) << 1; // Zero in bit 1
    flags |= (this.I ? 1 : 0) << 2; // Interrupt in bit 2
    flags |= (this.D ? 1 : 0) << 3; // Decimal in bit 3
    flags |= (this.B ? 1 : 0) << 4; // Break in bit 4
    flags |= 1 << 5; // Unused bit always 1
    flags |= (this.V ? 1 : 0) << 6; // Overflow in bit 6
    flags |= (this._N ? 1 : 0) << 7; // Negative in bit 7
    return flags;
  }

  /**
   * Sets all processor status flags from a byte
   * @param flags - 8-bit value containing all flag states
   */
  set flags(flags: number) {
    this.C = Boolean((flags >> 0) & 1); // Extract Carry from bit 0
    this._Z = Boolean((flags >> 1) & 1); // Extract Zero from bit 1
    this.I = Boolean((flags >> 2) & 1); // Extract Interrupt from bit 2
    this.D = Boolean((flags >> 3) & 1); // Extract Decimal from bit 3
    this.B = Boolean((flags >> 4) & 1); // Extract Break from bit 4
    // Bit 5 (U) is always true
    this.V = Boolean((flags >> 6) & 1); // Extract Overflow from bit 6
    this._N = Boolean((flags >> 7) & 1); // Extract Negative from bit 7
  }

  /**
   * Sets the Zero flag based on whether the value is zero
   * @param value - Value to test for zero
   */
  set Z(value: number) {
    this._Z = value === 0;
  }

  get Z(): boolean {
    return this._Z;
  }

  /**
   * Sets the Negative flag based on bit 7 of the value
   * @param value - Value to test for negative (bit 7 set)
   */
  set N(value: number) {
    this._N = (value & 0x80) !== 0;
  }

  get N(): boolean {
    return this._N;
  }

  /**
   * Convenience method to set both Zero and Negative flags based on a value
   * @param value - Value to test for both zero and negative
   */
  set ZN(value: number) {
    this.Z = value;
    this.N = value;
  }

  /**
   * Returns a string representation of all processor status flags
   * @returns String showing the state of each flag
   */
  toString(): string {
    return `N=${this.N} V=${this.V} U=${this.U} B=${this.B} D=${this.D} I=${this.I} Z=${this.Z} C=${this.C}`;
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
