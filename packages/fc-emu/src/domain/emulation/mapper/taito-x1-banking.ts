import type Cartridge from "../../model/cartridge.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

/** Shared three-window PRG and eight-window CHR datapath in Taito's X1 ASIC family. */
export class TaitoX1Banking {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly prgBanks = [0, 0, 0];
  private readonly chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
  }

  capturePrgBanks(): readonly number[] {
    return [...this.prgBanks];
  }

  validatePrgBanks(banks: readonly number[], board: string): void {
    if (!isFixedByteArray(banks, 3) || banks.some((bank) => bank >= this.prgBankCount)) {
      throw new RangeError(`${board} save state contains an invalid PRG bank`);
    }
  }

  restorePrgBanks(banks: readonly number[], board: string): void {
    this.validatePrgBanks(banks, board);
    this.prgBanks.splice(0, this.prgBanks.length, ...banks);
  }

  selectPrg(slot: 0 | 1 | 2, value: number): void {
    this.prgBanks[slot] = value % this.prgBankCount;
  }

  selectChr(slot: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, value: number): void {
    this.chrBanks[slot] = value % this.chrBankCount;
  }

  selectChrPair(firstSlot: 0 | 2 | 4 | 6, value: number, alignEven: boolean): void {
    const firstBank = alignEven ? value & 0xfe : value;
    this.selectChr(firstSlot, firstBank);
    this.selectChr((firstSlot + 1) as 1 | 3 | 5 | 7, firstBank + 1);
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = this.chrBanks[slot] ?? 0;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address < 0x8000) return 0;
    const slot = (address - 0x8000) >>> 13;
    const bank = slot < 3 ? (this.prgBanks[slot] ?? 0) : this.prgBankCount - 1;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }
}
