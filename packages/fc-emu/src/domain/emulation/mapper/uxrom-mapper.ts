import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;

export interface UxromBoard {
  readonly name: string;
  readonly switchableWindow: "lower" | "upper";
  readonly bankSelectShift: number;
  readonly bankSelectMask: number;
  readonly hasBusConflicts: boolean;
  readonly mapsPrgRam: boolean;
}

export const GENERIC_UXROM_BOARD: UxromBoard = Object.freeze({
  name: "UxROM",
  switchableWindow: "lower",
  bankSelectShift: 0,
  bankSelectMask: 0xff,
  hasBusConflicts: false,
  mapsPrgRam: true,
});

export const UN1ROM_BOARD: UxromBoard = Object.freeze({
  name: "UN1ROM",
  switchableWindow: "lower",
  bankSelectShift: 2,
  bankSelectMask: 0x07,
  hasBusConflicts: true,
  mapsPrgRam: false,
});

export function createInvertedUxromBoard(hasBusConflicts: boolean): UxromBoard {
  return Object.freeze({
    name: "inverted UxROM",
    switchableWindow: "upper",
    bankSelectShift: 0,
    bankSelectMask: 0x07,
    hasBusConflicts,
    mapsPrgRam: false,
  });
}

/**
 * UxROM-family mapping shared by iNES mappers 2, 94 and 180.
 *
 * Board configuration keeps three physically different wirings explicit: generic mapper 2 switches
 * the lower window from a full-byte latch, UN1ROM takes bits 4-2, and mapper 180 fixes the first bank
 * below a switchable upper window.
 */
export class UxromMapper implements Mapper {
  private readonly prgBanks: number;
  private selectedPrgBank = 0;
  private readonly fixedPrgBank: number;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly board: UxromBoard = GENERIC_UXROM_BOARD,
  ) {
    this.prgBanks = cartridge.prgRom.length / PRG_BANK_SIZE;
    this.fixedPrgBank = board.switchableWindow === "lower" ? this.prgBanks - 1 : 0;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Uxrom, selectedPrgBank: this.selectedPrgBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Uxrom)
      throw new Error(`Cannot restore ${state.kind} state into ${this.board.name}`);
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBanks
    ) {
      throw new RangeError(`${this.board.name} save state contains an invalid PRG bank`);
    }
    this.selectedPrgBank = state.selectedPrgBank;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0x8000) {
      const upperWindow = address >= 0xc000;
      const selectedWindow = this.board.switchableWindow === "lower" ? !upperWindow : upperWindow;
      const bank = selectedWindow ? this.selectedPrgBank : this.fixedPrgBank;
      const index = bank * PRG_BANK_SIZE + (address & (PRG_BANK_SIZE - 1));
      return this.cartridge.prgRom[index] ?? 0;
    }
    if (address >= 0x6000 && this.board.mapsPrgRam) return this.readPrgRam(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address >= 0x8000) {
      const effectiveValue = this.board.hasBusConflicts ? value & this.read(address) : value;
      const selected = (effectiveValue >>> this.board.bankSelectShift) & this.board.bankSelectMask;
      this.selectedPrgBank = selected % this.prgBanks;
      return;
    }
    if (address >= 0x6000 && this.board.mapsPrgRam) {
      this.writePrgRam(address, value);
    }
  }

  private readPrgRam(address: number): number {
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
