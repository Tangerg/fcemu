import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;

/** BNROM board: 32 KiB PRG banking, fixed CHR and mandatory AND-type bus conflicts. */
export class BnromMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly prgBankCount: number;
  private selectedPrgBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Bnrom, selectedPrgBank: this.selectedPrgBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Bnrom)
      throw new Error(`Cannot restore ${state.kind} state into BNROM`);
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount
    ) {
      throw new RangeError("BNROM save state contains an invalid PRG bank");
    }
    this.selectedPrgBank = state.selectedPrgBank;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0x8000) return this.readPrg(address);
    if (address >= 0x6000) return this.readPrgRam(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address >= 0x8000) {
      const effectiveValue = value & this.readPrg(address);
      this.selectedPrgBank = (effectiveValue & 0x03) % this.prgBankCount;
      return;
    }
    if (address >= 0x6000) this.writePrgRam(address, value);
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private readPrg(address: number): number {
    const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
    return this.cartridge.prgRom[offset] ?? 0;
  }

  private readPrgRam(address: number): number {
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
