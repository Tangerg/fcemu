import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const CHR_BANK_SIZE = 0x1000;

/**
 * iNES mapper 13: Nintendo CPROM board (Videomation).
 *
 * PRG is a fixed 32 KiB NROM-style window. The 16 KiB CHR RAM is split into two
 * 4 KiB regions: PPU $0000-$0FFF is fixed to bank 0 while PPU $1000-$1FFF selects
 * one of four banks through bits 1-0 of the $8000-$FFFF register with AND-type
 * bus conflicts.
 */
export class CpromMapper implements Mapper {
  private readonly chrBankCount: number;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
  }

  powerOn(): void {
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Cprom, selectedChrBank: this.selectedChrBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Cprom)
      throw new Error(`Cannot restore ${state.kind} state into CPROM`);
    if (
      !Number.isInteger(state.selectedChrBank) ||
      state.selectedChrBank < 0 ||
      state.selectedChrBank >= this.chrBankCount
    ) {
      throw new RangeError("CPROM save state contains an invalid CHR bank");
    }
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x8000) return this.readPrg(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address < 0x8000) return;
    const effectiveValue = value & this.readPrg(address);
    this.selectedChrBank = (effectiveValue & 0x03) % this.chrBankCount;
  }

  private chrOffset(address: number): number {
    if (address < CHR_BANK_SIZE) return address;
    return this.selectedChrBank * CHR_BANK_SIZE + (address - CHR_BANK_SIZE);
  }

  private readPrg(address: number): number {
    return this.cartridge.prgRom[(address - 0x8000) % this.cartridge.prgRom.length] ?? 0;
  }
}
