import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;

/**
 * iNES mapper 7: generic AxROM-compatible 32 KiB PRG banking with switchable
 * single-screen nametable memory.
 *
 * Legacy mapper 7 defaults to no bus conflicts because ANROM games rely on
 * conflict-prevention circuitry. Exact AMROM/AOROM behavior needs a NES 2.0
 * submapper, which is rejected explicitly by the cartridge parser.
 */
export class AxromMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly prgBankCount: number;
  private readonly bankRegisterMask: number;
  private selectedPrgBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasBusConflicts = false,
  ) {
    this.prgBankCount = Math.max(1, Math.ceil(cartridge.prgRom.length / PRG_BANK_SIZE));
    this.bankRegisterMask = this.prgBankCount <= 8 ? 0x07 : 0x0f;
    this.cartridge.mirroringMode = NametableMirroring.SingleScreenLower;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.cartridge.mirroringMode = NametableMirroring.SingleScreenLower;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Axrom,
      selectedPrgBank: this.selectedPrgBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Axrom)
      throw new Error(`Cannot restore ${state.kind} state into AxROM`);
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount
    ) {
      throw new RangeError("AxROM save state contains an invalid PRG bank");
    }
    if (
      state.mirroring !== NametableMirroring.SingleScreenLower &&
      state.mirroring !== NametableMirroring.SingleScreenUpper
    ) {
      throw new RangeError("AxROM save state contains invalid mirroring");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address % this.cartridge.chrMemoryBytes);
    if (address >= 0x8000) {
      const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
      return this.cartridge.prgRom[offset % this.cartridge.prgRom.length] ?? 0;
    }
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address < 0x8000) return;

    const effectiveValue = this.hasBusConflicts ? value & this.read(address) : value;
    this.selectedPrgBank = (effectiveValue & this.bankRegisterMask) % this.prgBankCount;
    this.cartridge.mirroringMode =
      (effectiveValue & 0x10) === 0
        ? NametableMirroring.SingleScreenLower
        : NametableMirroring.SingleScreenUpper;
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}
}
