import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;

/**
 * iNES mapper 93: Sunsoft-2 on the Sunsoft-3R board.
 *
 * The board fixes CHR RAM instead of banking CHR ROM. D0 controls the RAM's
 * chip enable, while D6-D4 select the 16 KiB PRG window at $8000-$BFFF.
 */
export class Sunsoft3RMapper implements Mapper {
  private readonly prgBankCount: number;
  private register = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.register = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Sunsoft3R, register: this.register };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Sunsoft3R) {
      throw new Error(`Cannot restore ${state.kind} state into Sunsoft-3R`);
    }
    if (!isByte(state.register)) {
      throw new RangeError("Sunsoft-3R save state contains an invalid register");
    }
    this.register = state.register;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
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

  ppuReadDriveMask(address: number): number {
    return address < 0x2000 && !this.chrRamEnabled ? 0 : 0xff;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      if (this.chrRamEnabled) this.cartridge.writeChr(address, value);
      return;
    }
    if (address >= 0x8000) this.register = value & this.read(address);
  }

  private get chrRamEnabled(): boolean {
    return (this.register & 0x01) !== 0;
  }
}
