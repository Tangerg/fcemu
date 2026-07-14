import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x1000;

/** NINA-001/NINA-002 board with three registers overlaid on unbanked PRG RAM. */
export class Nina001Mapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private selectedPrgBank = 0;
  private selectedChrBank0 = 0;
  private selectedChrBank1 = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank0 = 0;
    this.selectedChrBank1 = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Nina001,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank0: this.selectedChrBank0,
      selectedChrBank1: this.selectedChrBank1,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Nina001) {
      throw new Error(`Cannot restore ${state.kind} state into NINA-001`);
    }
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank0, this.chrBankCount, "lower CHR");
    requireBank(state.selectedChrBank1, this.chrBankCount, "upper CHR");
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank0 = state.selectedChrBank0;
    this.selectedChrBank1 = state.selectedChrBank1;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = address < 0x1000 ? this.selectedChrBank0 : this.selectedChrBank1;
      const offset = bank * CHR_BANK_SIZE + (address & 0x0fff);
      return this.cartridge.readChr(offset);
    }
    if (address >= 0x8000) {
      const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
      return this.cartridge.prgRom[offset] ?? 0;
    }
    if (address >= 0x6000) return this.cartridge.readPrgRam(address - 0x6000);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x6000 || address >= 0x8000) return;

    // The register decoder does not inhibit RAM: these writes affect both devices.
    this.cartridge.writePrgRam(address - 0x6000, value);
    if (address === 0x7ffd) this.selectedPrgBank = (value & 0x03) % this.prgBankCount;
    else if (address === 0x7ffe) this.selectedChrBank0 = (value & 0x0f) % this.chrBankCount;
    else if (address === 0x7fff) this.selectedChrBank1 = (value & 0x0f) % this.chrBankCount;
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`NINA-001 save state contains an invalid ${name} bank`);
  }
}
