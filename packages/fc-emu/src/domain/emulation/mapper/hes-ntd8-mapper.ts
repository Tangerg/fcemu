import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 113: HES NTD-8 extended NINA-03/NINA-06 multicart board. */
export class HesNtd8Mapper implements Mapper {
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
    this.cartridge.mirroringMode = NametableMirroring.Horizontal;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.HesNtd8,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.HesNtd8) {
      throw new Error(`Cannot restore ${state.kind} state into HES NTD-8`);
    }
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank, this.chrBankCount, "CHR");
    if (
      state.mirroring !== NametableMirroring.Horizontal &&
      state.mirroring !== NametableMirroring.Vertical
    ) {
      throw new RangeError("HES NTD-8 save state contains invalid mirroring");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.selectedPrgBank * PRG_BANK_SIZE + address - 0x8000] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(_address: number, _value: number): void {}

  writeCpuExpansion(address: number, value: number): void {
    if ((address & 0xe100) !== 0x4100) return;
    this.selectedPrgBank = ((value >>> 3) & 0x07) % this.prgBankCount;
    this.selectedChrBank = ((value & 0x07) | ((value >>> 3) & 0x08)) % this.chrBankCount;
    this.cartridge.mirroringMode =
      (value & 0x80) === 0 ? NametableMirroring.Horizontal : NametableMirroring.Vertical;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`HES NTD-8 save state contains an invalid ${name} bank`);
  }
}
