import type Cartridge from "../../model/cartridge.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_SMALL_BANK_SIZE = 0x0400;
const CHR_LARGE_BANK_SIZE = 0x0800;

export interface TaitoTc0x90BankState {
  readonly prgBanks: readonly number[];
  readonly chrBanks: readonly number[];
}

/**
 * Shared banking silicon used by Taito's TC0190 and TC0690.
 *
 * The IRQ and mirroring pins differ between the two ASICs, but their two
 * switchable PRG windows and mixed 2/1 KiB CHR windows are the same circuit.
 */
export class TaitoTc0x90Banking {
  private readonly prgBankCount: number;
  private readonly chrSmallBankCount: number;
  private readonly chrLargeBankCount: number;
  private readonly prgBanks = [0, 1];
  private readonly chrBanks = [0, 1, 4, 5, 6, 7];

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrSmallBankCount = cartridge.chrMemoryBytes / CHR_SMALL_BANK_SIZE;
    this.chrLargeBankCount = cartridge.chrMemoryBytes / CHR_LARGE_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBanks[0] = 0;
    this.prgBanks[1] = 1 % this.prgBankCount;
    this.chrBanks[0] = 0;
    this.chrBanks[1] = 1 % this.chrLargeBankCount;
    for (let slot = 2; slot < this.chrBanks.length; slot++) {
      this.chrBanks[slot] = (slot + 2) % Math.min(this.chrSmallBankCount, 0x100);
    }
  }

  captureState(): TaitoTc0x90BankState {
    return {
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
    };
  }

  restoreState(state: TaitoTc0x90BankState, board: string): void {
    this.validateState(state, board);
    this.prgBanks.splice(0, this.prgBanks.length, ...state.prgBanks);
    this.chrBanks.splice(0, this.chrBanks.length, ...state.chrBanks);
  }

  validateState(state: TaitoTc0x90BankState, board: string): void {
    if (
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank >= this.prgBankCount)
    ) {
      throw new RangeError(`${board} save state contains an invalid PRG bank`);
    }
    if (
      !isFixedByteArray(state.chrBanks, 6) ||
      state.chrBanks[0] >= this.chrLargeBankCount ||
      state.chrBanks[1] >= this.chrLargeBankCount ||
      state.chrBanks.slice(2).some((bank) => bank >= Math.min(this.chrSmallBankCount, 0x100))
    ) {
      throw new RangeError(`${board} save state contains an invalid CHR bank`);
    }
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address < 0x8000) return 0;
    const slot = (address - 0x8000) >>> 13;
    const bank = slot < 2 ? (this.prgBanks[slot] ?? 0) : this.prgBankCount - (slot === 2 ? 2 : 1);
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  selectPrg(slot: 0 | 1, value: number): void {
    this.prgBanks[slot] = (value & 0x3f) % this.prgBankCount;
  }

  selectLargeChr(slot: 0 | 1, value: number): void {
    this.chrBanks[slot] = value % this.chrLargeBankCount;
  }

  selectSmallChr(slot: 0 | 1 | 2 | 3, value: number): void {
    this.chrBanks[slot + 2] = value % Math.min(this.chrSmallBankCount, 0x100);
  }

  private chrOffset(address: number): number {
    if (address < 0x1000) {
      const slot = address >>> 11;
      return (this.chrBanks[slot] ?? 0) * CHR_LARGE_BANK_SIZE + (address & 0x07ff);
    }
    const slot = 2 + ((address - 0x1000) >>> 10);
    return (this.chrBanks[slot] ?? 0) * CHR_SMALL_BANK_SIZE + (address & 0x03ff);
  }
}
