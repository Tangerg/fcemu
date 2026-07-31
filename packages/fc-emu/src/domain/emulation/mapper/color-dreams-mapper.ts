import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mapper 11: Color Dreams / Wisdom Tree discrete-logic board.
 *
 * A single 74LS377 latch at $8000-$FFFF selects a 32 KiB PRG bank (bits 1-0)
 * and an 8 KiB CHR bank (bits 7-4). The documented board exhibits AND-type bus
 * conflicts; the no-conflict prototype variant is out of scope.
 */
export class ColorDreamsMapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.ColorDreams,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.ColorDreams)
      throw new Error(`Cannot restore ${state.kind} state into Color Dreams`);
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank, this.chrBankCount, "CHR");
    this.selectedPrgBank = state.selectedPrgBank;
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
    this.selectedPrgBank = (effectiveValue & 0x03) % this.prgBankCount;
    this.selectedChrBank = ((effectiveValue >> 4) & 0x0f) % this.chrBankCount;
  }

  private chrOffset(address: number): number {
    return this.selectedChrBank * CHR_BANK_SIZE + address;
  }

  private readPrg(address: number): number {
    const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
    return this.cartridge.prgRom[offset] ?? 0;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`Color Dreams save state contains an invalid ${name} bank`);
  }
}
