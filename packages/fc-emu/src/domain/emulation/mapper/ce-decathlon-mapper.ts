import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

const PRG_PERMUTATIONS = [
  [0, 1, 2, 3],
  [3, 2, 1, 0],
  [0, 2, 1, 3],
  [3, 1, 2, 0],
] as const;

const CHR_PERMUTATIONS = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [0, 2, 1, 3, 4, 6, 5, 7],
  [0, 1, 4, 5, 2, 3, 6, 7],
  [0, 4, 1, 5, 2, 6, 3, 7],
  [0, 4, 2, 6, 1, 5, 3, 7],
  [0, 2, 4, 6, 1, 3, 5, 7],
  [7, 6, 5, 4, 3, 2, 1, 0],
  [7, 6, 5, 4, 3, 2, 1, 0],
] as const;

/** iNES mapper 244: C&E Decathlon PRG/CHR permutation network. */
export class CeDecathlonMapper implements Mapper {
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {}

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.CeDecathlon244,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.CeDecathlon244) {
      throw new Error(`Cannot restore ${state.kind} state into C&E Decathlon mapper 244`);
    }
    if (!isBank(state.selectedPrgBank, 4) || !isBank(state.selectedChrBank, 8)) {
      throw new RangeError("C&E Decathlon mapper 244 save state contains an invalid bank");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address < 0x8000) return 0;
    return this.cartridge.prgRom[this.selectedPrgBank * PRG_BANK_SIZE + address - 0x8000] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    if ((value & 0x08) !== 0) {
      this.selectedChrBank = CHR_PERMUTATIONS[(value >>> 4) & 7]?.[value & 7] ?? 0;
    } else {
      this.selectedPrgBank = PRG_PERMUTATIONS[(value >>> 4) & 3]?.[value & 3] ?? 0;
    }
  }
}

function isBank(value: number, count: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < count;
}
