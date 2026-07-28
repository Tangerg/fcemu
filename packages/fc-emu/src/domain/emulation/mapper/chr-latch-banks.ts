const CHR_BANK_SIZE = 0x1000;
const CHR_BANK_MASK = 0x3f;

/** Serialized state of the four PPU-latched CHR banks shared by MMC2 and MMC4. */
export interface ChrLatchState {
  readonly chrBank0Fd: number;
  readonly chrBank0Fe: number;
  readonly chrBank1Fd: number;
  readonly chrBank1Fe: number;
  readonly latch0Fe: boolean;
  readonly latch1Fe: boolean;
}

/**
 * The four 4 KiB CHR banks and two PPU latches common to the PxROM (MMC2) and
 * FxROM (MMC4) boards. Each 4 KiB PPU half selects between two banks depending on
 * whether its latch last observed an $FD or $FE tile fetch; the owning mapper
 * decides which PPU addresses flip the latches.
 */
export class ChrLatchBanks {
  private chrBank0Fd = 0;
  private chrBank0Fe = 0;
  private chrBank1Fd = 0;
  private chrBank1Fe = 0;
  private latch0Fe = false;
  private latch1Fe = false;

  constructor(private readonly chrBankCount: number) {}

  reset(): void {
    this.chrBank0Fd = 0;
    this.chrBank0Fe = 0;
    this.chrBank1Fd = 0;
    this.chrBank1Fe = 0;
    this.latch0Fe = false;
    this.latch1Fe = false;
  }

  setLatch0(sawFe: boolean): void {
    this.latch0Fe = sawFe;
  }

  setLatch1(sawFe: boolean): void {
    this.latch1Fe = sawFe;
  }

  /** Commits a 6-bit bank register: region 0-3 maps to the FD/FE banks of PPU halves 0/1. */
  writeRegister(region: 0 | 1 | 2 | 3, value: number): void {
    const bank = value & CHR_BANK_MASK;
    switch (region) {
      case 0:
        this.chrBank0Fd = bank;
        break;
      case 1:
        this.chrBank0Fe = bank;
        break;
      case 2:
        this.chrBank1Fd = bank;
        break;
      case 3:
        this.chrBank1Fe = bank;
        break;
    }
  }

  offset(address: number): number {
    if (address < CHR_BANK_SIZE) {
      const bank = (this.latch0Fe ? this.chrBank0Fe : this.chrBank0Fd) % this.chrBankCount;
      return bank * CHR_BANK_SIZE + address;
    }
    const bank = (this.latch1Fe ? this.chrBank1Fe : this.chrBank1Fd) % this.chrBankCount;
    return bank * CHR_BANK_SIZE + (address - CHR_BANK_SIZE);
  }

  capture(): ChrLatchState {
    return {
      chrBank0Fd: this.chrBank0Fd,
      chrBank0Fe: this.chrBank0Fe,
      chrBank1Fd: this.chrBank1Fd,
      chrBank1Fe: this.chrBank1Fe,
      latch0Fe: this.latch0Fe,
      latch1Fe: this.latch1Fe,
    };
  }

  restore(state: ChrLatchState): void {
    for (const value of [state.chrBank0Fd, state.chrBank0Fe, state.chrBank1Fd, state.chrBank1Fe]) {
      if (!Number.isInteger(value) || value < 0 || value > CHR_BANK_MASK) {
        throw new RangeError("CHR latch save state contains an invalid bank register");
      }
    }
    if (typeof state.latch0Fe !== "boolean" || typeof state.latch1Fe !== "boolean") {
      throw new TypeError("CHR latch save state contains an invalid latch");
    }
    this.chrBank0Fd = state.chrBank0Fd;
    this.chrBank0Fe = state.chrBank0Fe;
    this.chrBank1Fd = state.chrBank1Fd;
    this.chrBank1Fe = state.chrBank1Fe;
    this.latch0Fe = state.latch0Fe;
    this.latch1Fe = state.latch1Fe;
  }
}
