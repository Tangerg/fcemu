import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mapper 3: Nintendo CNROM and compatible discrete-logic boards.
 *
 * Legacy iNES does not identify the bus-conflict submapper, so this defaults to
 * the original board's AND-type conflict. The mapper factory supplies the
 * explicit NES 2.0 submapper behavior when that metadata is available.
 */
export class CnromMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly chrBankCount: number;
  private readonly bankRegisterMask: number;
  private selectedChrBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasBusConflicts = true,
  ) {
    this.chrBankCount = Math.max(1, Math.ceil(cartridge.chrMemoryBytes / CHR_BANK_SIZE));
    this.bankRegisterMask = this.chrBankCount <= 4 ? 0x03 : 0x0f;
  }

  powerOn(): void {
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Cnrom, selectedChrBank: this.selectedChrBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Cnrom)
      throw new Error(`Cannot restore ${state.kind} state into CNROM`);
    if (
      !Number.isInteger(state.selectedChrBank) ||
      state.selectedChrBank < 0 ||
      state.selectedChrBank >= this.chrBankCount
    ) {
      throw new RangeError("CNROM save state contains an invalid CHR bank");
    }
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const offset = this.selectedChrBank * CHR_BANK_SIZE + address;
      return this.cartridge.readChr(offset % this.cartridge.chrMemoryBytes);
    }
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
      if (this.cartridge.hasWritableChrMemory) return;
      const effectiveValue = this.hasBusConflicts ? value & this.readPrg(address) : value;
      this.selectedChrBank = (effectiveValue & this.bankRegisterMask) % this.chrBankCount;
      return;
    }
    if (address >= 0x6000) {
      this.writePrgRam(address, value);
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private readPrg(address: number): number {
    const offset = (address - 0x8000) % this.cartridge.prgRom.length;
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
