import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

/**
 * NES 2.0 mapper 185: CNROM with CHR-ROM chip-select copy protection.
 *
 * Submappers 4-7 identify which two-bit latch value enables the sole 8 KiB
 * CHR-ROM chip. Every other value tri-states the cartridge's PPU data lines.
 */
export class CnromProtectionMapper implements Mapper {
  private selectedChip = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly enabledChip: number,
  ) {
    this.powerOn();
  }

  powerOn(): void {
    this.selectedChip = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.CnromProtection, selectedChip: this.selectedChip };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.CnromProtection) {
      throw new Error(`Cannot restore ${state.kind} state into CNROM protection`);
    }
    if (!Number.isInteger(state.selectedChip) || state.selectedChip < 0 || state.selectedChip > 3) {
      throw new RangeError("CNROM protection save state contains an invalid chip-select value");
    }
    this.selectedChip = state.selectedChip;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0x8000) {
      return this.cartridge.prgRom[(address - 0x8000) % this.cartridge.prgRom.byteLength] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  ppuReadDriveMask(address: number): number {
    return address < 0x2000 && this.selectedChip !== this.enabledChip ? 0 : 0xff;
  }

  write(address: number, value: number): void {
    if (address >= 0x8000) this.selectedChip = value & this.read(address) & 0x03;
  }
}
