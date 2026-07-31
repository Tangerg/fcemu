import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 79: AVE NINA-03/NINA-06 expansion-area bank latch. */
export class Nina0306Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgBank = 0;
  private chrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBank = 0;
    this.chrBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Nina0306, prgBank: this.prgBank, chrBank: this.chrBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Nina0306) {
      throw new Error(`Cannot restore ${state.kind} state into NINA-03/NINA-06`);
    }
    if (
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank >= this.prgBankCount
    ) {
      throw new RangeError("NINA-03/NINA-06 save state contains an invalid PRG bank");
    }
    if (
      !Number.isInteger(state.chrBank) ||
      state.chrBank < 0 ||
      state.chrBank >= this.chrBankCount
    ) {
      throw new RangeError("NINA-03/NINA-06 save state contains an invalid CHR bank");
    }
    this.prgBank = state.prgBank;
    this.chrBank = state.chrBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.chrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.prgBank * PRG_BANK_SIZE + (address - 0x8000)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(_address: number, _value: number): void {}

  writeCpuExpansion(address: number, value: number): void {
    if ((address & 0xe100) !== 0x4100) return;
    this.prgBank = ((value >>> 3) & 1) % this.prgBankCount;
    this.chrBank = (value & 7) % this.chrBankCount;
  }
}
