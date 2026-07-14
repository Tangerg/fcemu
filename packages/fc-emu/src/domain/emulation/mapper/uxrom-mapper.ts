import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

/**
 * iNES mapper 2: generic UxROM-compatible mapping with one switchable 16 KiB PRG bank.
 *
 * Legacy iNES cannot distinguish original conflict-prone UNROM/UOROM boards from compatible
 * no-conflict boards. The generic mapper-2 convention uses a full-byte register without conflicts;
 * exact board behavior requires NES 2.0 submappers, which the cartridge parser rejects explicitly.
 */
export class UxromMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly prgBanks: number;
  private selectedPrgBank = 0;
  private readonly fixedPrgBank: number;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasBusConflicts = false,
  ) {
    this.prgBanks = cartridge.prgRom.length / 0x4000;
    this.fixedPrgBank = this.prgBanks - 1;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Uxrom, selectedPrgBank: this.selectedPrgBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Uxrom)
      throw new Error(`Cannot restore ${state.kind} state into UxROM`);
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBanks
    ) {
      throw new RangeError("UxROM save state contains an invalid PRG bank");
    }
    this.selectedPrgBank = state.selectedPrgBank;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0xc000) {
      const index = this.fixedPrgBank * 0x4000 + (address - 0xc000);
      return this.cartridge.prgRom[index] ?? 0;
    }
    if (address >= 0x8000) {
      const index = this.selectedPrgBank * 0x4000 + (address - 0x8000);
      return this.cartridge.prgRom[index] ?? 0;
    }
    if (address >= 0x6000) return this.readPrgRam(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address >= 0x8000) {
      const effectiveValue = this.hasBusConflicts ? value & this.read(address) : value;
      this.selectedPrgBank = effectiveValue % this.prgBanks;
      return;
    }
    if (address >= 0x6000) {
      this.writePrgRam(address, value);
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private readPrgRam(address: number): number {
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
