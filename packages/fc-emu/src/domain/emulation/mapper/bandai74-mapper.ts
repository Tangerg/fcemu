import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mappers 70 and 152: Bandai 74*161/161/32 discrete boards.
 *
 * One latch at $8000-$FFFF selects a 16 KiB PRG bank at $8000-$BFFF (with
 * $C000-$FFFF fixed to the last bank) and an 8 KiB CHR bank, applying AND-type
 * bus conflicts. Mapper 152 spends bit 7 on single-screen mirroring control,
 * leaving a 3-bit PRG field; mapper 70 keeps mirroring hardwired and uses all
 * four upper bits for PRG.
 */
export class Bandai74Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly fixedPrgBank: number;
  private readonly prgBankMask: number;
  private selectedPrgBank = 0;
  private selectedChrBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasMirroringControl: boolean,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
    this.fixedPrgBank = this.prgBankCount - 1;
    this.prgBankMask = hasMirroringControl ? 0x07 : 0x0f;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.selectedChrBank = 0;
    if (this.hasMirroringControl) {
      this.cartridge.mirroringMode = NametableMirroring.SingleScreenLower;
    }
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Bandai74,
      selectedPrgBank: this.selectedPrgBank,
      selectedChrBank: this.selectedChrBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Bandai74)
      throw new Error(`Cannot restore ${state.kind} state into Bandai 74xx`);
    requireBank(state.selectedPrgBank, this.prgBankCount, "PRG");
    requireBank(state.selectedChrBank, this.chrBankCount, "CHR");
    if (!Object.values(NametableMirroring).includes(state.mirroring as NametableMirroring)) {
      throw new RangeError("Bandai 74xx save state contains invalid mirroring");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.selectedChrBank = state.selectedChrBank;
    if (this.hasMirroringControl) {
      this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    }
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0xc000) return this.readPrg(this.fixedPrgBank, address - 0xc000);
    if (address >= 0x8000) return this.readPrg(this.selectedPrgBank, address - 0x8000);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.selectedChrBank * CHR_BANK_SIZE + address, value);
      return;
    }
    if (address < 0x8000) return;
    const effectiveValue = value & this.read(address);
    if (this.hasMirroringControl) {
      this.cartridge.mirroringMode =
        (effectiveValue & 0x80) === 0
          ? NametableMirroring.SingleScreenLower
          : NametableMirroring.SingleScreenUpper;
    }
    this.selectedPrgBank = ((effectiveValue >> 4) & this.prgBankMask) % this.prgBankCount;
    this.selectedChrBank = (effectiveValue & 0x0f) % this.chrBankCount;
  }

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }
}

function requireBank(bank: number, count: number, name: string): void {
  if (!Number.isInteger(bank) || bank < 0 || bank >= count) {
    throw new RangeError(`Bandai 74xx save state contains an invalid ${name} bank`);
  }
}
