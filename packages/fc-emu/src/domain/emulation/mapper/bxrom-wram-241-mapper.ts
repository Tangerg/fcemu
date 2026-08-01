import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const PRG_RAM_START = 0x6000;
const PRG_ROM_START = 0x8000;

/** iNES mapper 241: conflict-free BxROM banking with direct 8 KiB WRAM. */
export class BxromWram241Mapper implements Mapper {
  private readonly prgBankCount: number;
  private prgBankRegister = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBankRegister = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.BxromWram241, prgBankRegister: this.prgBankRegister };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.BxromWram241) {
      throw new Error(`Cannot restore ${state.kind} state into BxROM-with-WRAM mapper 241`);
    }
    if (!isByte(state.prgBankRegister)) {
      throw new RangeError("BxROM-with-WRAM mapper 241 state contains an invalid PRG latch");
    }
    this.prgBankRegister = state.prgBankRegister;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= PRG_ROM_START) {
      const bank = this.prgBankRegister % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + address - PRG_ROM_START] ?? 0;
    }
    if (address >= PRG_RAM_START) {
      return this.cartridge.readPrgRam(address - PRG_RAM_START);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= PRG_RAM_START ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address >= PRG_ROM_START) {
      this.prgBankRegister = value;
      return;
    }
    if (address >= PRG_RAM_START) {
      this.cartridge.writePrgRam(address - PRG_RAM_START, value);
    }
  }
}
