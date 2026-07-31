import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

export type Irem78Mirroring = "single-screen" | "horizontal-vertical";

/**
 * iNES mapper 78: combined UNROM/CNROM discrete board.
 *
 * Cosmo Carrier wires bit 3 directly to CIRAM A10 for one-screen selection. Holy Diver instead
 * uses that bit to select horizontal or vertical mirroring. Both boards have AND bus conflicts.
 */
export class Irem78Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly fixedPrgBank: number;
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly mirroringWiring: Irem78Mirroring,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.fixedPrgBank = this.prgBankCount - 1;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
    this.applyMirroring(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Irem78,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Irem78) {
      throw new Error(`Cannot restore ${state.kind} state into iNES mapper 78`);
    }
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount
    ) {
      throw new RangeError("Mapper 78 save state contains an invalid PRG bank");
    }
    if (
      !Number.isInteger(state.selectedChrBank) ||
      state.selectedChrBank < 0 ||
      state.selectedChrBank >= this.chrBankCount
    ) {
      throw new RangeError("Mapper 78 save state contains an invalid CHR bank");
    }
    if (!this.acceptsMirroring(state.mirroring)) {
      throw new RangeError("Mapper 78 save state contains invalid mirroring for this board");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0xc000) {
      return this.readPrg(this.fixedPrgBank, address - 0xc000);
    }
    if (address >= 0x8000) {
      return this.readPrg(this.selectedPrgBank, address - 0x8000);
    }
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    const effectiveValue = value & this.read(address);
    this.selectedPrgBank = (effectiveValue & 0x07) % this.prgBankCount;
    this.selectedChrBank = ((effectiveValue >>> 4) & 0x0f) % this.chrBankCount;
    this.applyMirroring((effectiveValue & 0x08) !== 0);
  }

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }

  private applyMirroring(high: boolean): void {
    this.cartridge.mirroringMode =
      this.mirroringWiring === "single-screen"
        ? high
          ? NametableMirroring.SingleScreenUpper
          : NametableMirroring.SingleScreenLower
        : high
          ? NametableMirroring.Vertical
          : NametableMirroring.Horizontal;
  }

  private acceptsMirroring(value: number): boolean {
    return this.mirroringWiring === "single-screen"
      ? value === NametableMirroring.SingleScreenLower ||
          value === NametableMirroring.SingleScreenUpper
      : value === NametableMirroring.Horizontal || value === NametableMirroring.Vertical;
  }
}
