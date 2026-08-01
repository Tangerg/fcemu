import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;
const PRG_RAM_START = 0x6000;
const PRG_ROM_START = 0x8000;

/** iNES mapper 240: C&E/Supertone 32 KiB PRG and 8 KiB CHR data latch. */
export class CeSupertoneMapper implements Mapper {
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
      kind: MapperKind.CeSupertone240,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.CeSupertone240) {
      throw new Error(`Cannot restore ${state.kind} state into C&E/Supertone mapper 240`);
    }
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank, this.chrBankCount, "CHR");
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address < PRG_ROM_START) {
      return address >= PRG_RAM_START ? this.cartridge.readPrgRam(address - PRG_RAM_START) : 0;
    }
    return (
      this.cartridge.prgRom[this.selectedPrgBank * PRG_BANK_SIZE + address - PRG_ROM_START] ?? 0
    );
  }

  cpuReadDriveMask(address: number): number {
    return address >= PRG_RAM_START ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= PRG_RAM_START && address < PRG_ROM_START) {
      this.cartridge.writePrgRam(address - PRG_RAM_START, value);
    }
  }

  writeCpuExpansion(address: number, value: number): void {
    if (address < 0x4020 || address > 0x5fff) return;
    this.selectedPrgBank = ((value >>> 4) & 0x0f) % this.prgBankCount;
    this.selectedChrBank = (value & 0x0f) % this.chrBankCount;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`C&E/Supertone mapper 240 save state contains an invalid ${name} bank`);
  }
}
