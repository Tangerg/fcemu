import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { areBooleans } from "./state-validation.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 72: Jaleco JF-17 dual edge-triggered bank latch. */
export class JalecoJf17Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgBank = 0;
  private chrBank = 0;
  private prgClockHigh = false;
  private chrClockHigh = false;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBank = 0;
    this.chrBank = 0;
    this.prgClockHigh = false;
    this.chrClockHigh = false;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.JalecoJf17,
      prgBank: this.prgBank,
      chrBank: this.chrBank,
      prgClockHigh: this.prgClockHigh,
      chrClockHigh: this.chrClockHigh,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.JalecoJf17) {
      throw new Error(`Cannot restore ${state.kind} state into Jaleco JF-17 mapper 72`);
    }
    if (
      !isBank(state.prgBank, this.prgBankCount) ||
      !isBank(state.chrBank, this.chrBankCount) ||
      !areBooleans(state.prgClockHigh, state.chrClockHigh)
    ) {
      throw new RangeError("Jaleco JF-17 save state contains invalid bank or clock state");
    }
    this.prgBank = state.prgBank;
    this.chrBank = state.chrBank;
    this.prgClockHigh = state.prgClockHigh;
    this.chrClockHigh = state.chrClockHigh;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.chrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      const bank = address < 0xc000 ? this.prgBank : this.prgBankCount - 1;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x3fff)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    const effectiveValue = value & this.read(address);
    const nextPrgClockHigh = (effectiveValue & 0x80) !== 0;
    const nextChrClockHigh = (effectiveValue & 0x40) !== 0;

    if (!this.prgClockHigh && nextPrgClockHigh) {
      this.prgBank = (effectiveValue & 0x07) % this.prgBankCount;
    }
    if (!this.chrClockHigh && nextChrClockHigh) {
      this.chrBank = (effectiveValue & 0x0f) % this.chrBankCount;
    }

    this.prgClockHigh = nextPrgClockHigh;
    this.chrClockHigh = nextChrClockHigh;
  }
}

function isBank(bank: number, count: number): boolean {
  return Number.isInteger(bank) && bank >= 0 && bank < count;
}
