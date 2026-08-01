import type Cartridge from "../../model/cartridge.js";
import { isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 86: Jaleco JF-13 banking around the external µPD7756C speech device. */
export class JalecoJf13Mapper implements Mapper {
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {}

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.JalecoJf1386,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.JalecoJf1386) {
      throw new Error(`Cannot restore ${state.kind} state into Jaleco JF-13 mapper 86`);
    }
    if (
      !isIntegerInRange(state.selectedPrgBank, 0, 3) ||
      !isIntegerInRange(state.selectedChrBank, 0, 7)
    ) {
      throw new RangeError("Jaleco JF-13 mapper 86 save state contains an invalid bank");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    const registerPage = address & 0x7000;
    // $7xxx/$Fxxx control the external speech chip. Its recorded data is not in the .nes payload.
    if (registerPage !== 0x6000) return;

    this.selectedPrgBank = (value >>> 4) & 0x03;
    this.selectedChrBank = (value & 0x03) | ((value >>> 4) & 0x04);
  }
}
