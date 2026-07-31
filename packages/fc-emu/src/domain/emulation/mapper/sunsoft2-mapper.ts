import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mapper 89: Sunsoft-2 on the Sunsoft-3 board.
 *
 * One conflict-prone register selects a 16 KiB PRG bank, an 8 KiB CHR-ROM bank
 * whose high bit comes from D7, and one-screen nametable memory.
 */
export class Sunsoft2Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private register = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.register = 0;
    this.applyMirroring();
  }

  captureState(): MapperState {
    return { kind: MapperKind.Sunsoft2, register: this.register };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Sunsoft2) {
      throw new Error(`Cannot restore ${state.kind} state into Sunsoft-2`);
    }
    if (!isByte(state.register)) {
      throw new RangeError("Sunsoft-2 save state contains an invalid register");
    }
    this.register = state.register;
    this.applyMirroring();
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = ((this.register & 0x07) | ((this.register & 0x80) >>> 4)) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + address);
    }
    if (address >= 0xc000) {
      const offset = (this.prgBankCount - 1) * PRG_BANK_SIZE + (address - 0xc000);
      return this.cartridge.prgRom[offset] ?? 0;
    }
    if (address >= 0x8000) {
      const bank = ((this.register >>> 4) & 0x07) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address - 0x8000)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    this.register = value & this.read(address);
    this.applyMirroring();
  }

  private applyMirroring(): void {
    this.cartridge.mirroringMode =
      (this.register & 0x08) === 0
        ? NametableMirroring.SingleScreenLower
        : NametableMirroring.SingleScreenUpper;
  }
}
