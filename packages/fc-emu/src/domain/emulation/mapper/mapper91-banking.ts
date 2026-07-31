import type Cartridge from "../../model/cartridge.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0800;

interface Mapper91BankingState {
  readonly prgBanks: readonly number[];
  readonly chrBanks: readonly number[];
  readonly outerBank: number;
}

/** Bank data path shared by the two electrically distinct mapper-91 boards. */
export class Mapper91Banking {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgBanks = [0, 0];
  private chrBanks = [0, 0, 0, 0];
  private outerBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasOuterBank: boolean,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.outerBank = 0;
  }

  captureState(): Mapper91BankingState {
    return {
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      outerBank: this.outerBank,
    };
  }

  validateState(state: Mapper91BankingState, board: string): void {
    if (
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank > 0x0f) ||
      !isFixedByteArray(state.chrBanks, 4) ||
      !Number.isInteger(state.outerBank) ||
      state.outerBank < 0 ||
      state.outerBank > (this.hasOuterBank ? 7 : 0)
    ) {
      throw new RangeError(`${board} save state contains invalid bank registers`);
    }
  }

  restoreState(state: Mapper91BankingState, board: string): void {
    this.validateState(state, board);
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.outerBank = state.outerBank;
  }

  selectPrg(slot: 0 | 1, value: number): void {
    this.prgBanks[slot] = value & 0x0f;
  }

  selectChr(slot: 0 | 1 | 2 | 3, value: number): void {
    this.chrBanks[slot] = value;
  }

  selectOuter(address: number): void {
    if (this.hasOuterBank) this.outerBank = address & 7;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 11;
      const outer = this.hasOuterBank ? (this.outerBank & 1) << 8 : 0;
      const bank = (outer | (this.chrBanks[slot] ?? 0)) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x07ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const outer = this.hasOuterBank ? ((this.outerBank >>> 1) & 3) << 4 : 0;
      const inner = slot < 2 ? (this.prgBanks[slot] ?? 0) : 12 + slot;
      const bank = (outer | inner) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    return 0;
  }

  writeChr(address: number, value: number): void {
    if (address >= 0x2000) return;
    const slot = address >>> 11;
    const outer = this.hasOuterBank ? (this.outerBank & 1) << 8 : 0;
    const bank = (outer | (this.chrBanks[slot] ?? 0)) % this.chrBankCount;
    this.cartridge.writeChr(bank * CHR_BANK_SIZE + (address & 0x07ff), value);
  }
}
