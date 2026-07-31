import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const CHR_BANK_SIZE = 0x1000;

/**
 * iNES mapper 184: Sunsoft-1.
 *
 * PRG ROM is fixed at $8000-$FFFF. A write-only register at $6000-$7FFF selects
 * the lower 4 KiB CHR bank from D2-D0 and the upper bank from D5-D4, with the
 * upper CHR A14 line hard-wired high.
 */
export class Sunsoft1Mapper implements Mapper {
  private readonly chrBankCount: number;
  private selectedChrBank0 = 0;
  private selectedChrBank1 = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.selectedChrBank0 = 0;
    this.selectedChrBank1 = 4 % this.chrBankCount;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Sunsoft1,
      selectedChrBank0: this.selectedChrBank0,
      selectedChrBank1: this.selectedChrBank1,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Sunsoft1) {
      throw new Error(`Cannot restore ${state.kind} state into Sunsoft-1`);
    }
    requireBank(state.selectedChrBank0, this.chrBankCount, "lower CHR");
    requireBank(state.selectedChrBank1, this.chrBankCount, "upper CHR");
    if (this.chrBankCount > 4 && state.selectedChrBank1 < 4) {
      throw new RangeError("Sunsoft-1 save state contains an unreachable upper CHR bank");
    }
    this.selectedChrBank0 = state.selectedChrBank0;
    this.selectedChrBank1 = state.selectedChrBank1;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = address < 0x1000 ? this.selectedChrBank0 : this.selectedChrBank1;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x0fff));
    }
    if (address >= 0x8000) return this.cartridge.prgRom[address - 0x8000] ?? 0;
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x6000 || address >= 0x8000) return;
    this.selectedChrBank0 = (value & 0x07) % this.chrBankCount;
    this.selectedChrBank1 = (4 | ((value >>> 4) & 0x03)) % this.chrBankCount;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`Sunsoft-1 save state contains an invalid ${name} bank`);
  }
}
