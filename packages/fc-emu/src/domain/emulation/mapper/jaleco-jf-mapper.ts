import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mapper 140: Jaleco JF-11/JF-14.
 *
 * A write-only register at $6000-$7FFF selects one 32 KiB PRG bank from bits
 * 5-4 and one 8 KiB CHR bank from bits 3-0. Reads from the register window are
 * open bus because these boards do not map PRG RAM there.
 */
export class JalecoJfMapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.JalecoJf,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.JalecoJf) {
      throw new Error(`Cannot restore ${state.kind} state into Jaleco JF-11/JF-14`);
    }
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank, this.chrBankCount, "CHR");
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
      return this.cartridge.prgRom[offset] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x6000 || address >= 0x8000) return;
    this.selectedPrgBank = ((value >>> 4) & 0x03) % this.prgBankCount;
    this.selectedChrBank = (value & 0x0f) % this.chrBankCount;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`Jaleco JF save state contains an invalid ${name} bank`);
  }
}
