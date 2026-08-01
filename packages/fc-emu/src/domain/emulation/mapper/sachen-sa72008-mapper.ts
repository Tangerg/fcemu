import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 133: Sachen 72008 expansion-area PRG/CHR latch. */
export class SachenSa72008Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private register = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.register = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.SachenSa72008, register: this.register };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.SachenSa72008) {
      throw new Error(`Cannot restore ${state.kind} state into Sachen SA-72008 mapper 133`);
    }
    if (!isByte(state.register)) {
      throw new RangeError("Sachen SA-72008 mapper 133 save state contains an invalid register");
    }
    this.register = state.register;
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) {
      return this.cartridge.readChr(this.selectedChrBank() * CHR_BANK_SIZE + address);
    }
    if (address < 0x8000) return 0;
    return this.cartridge.prgRom[this.selectedPrgBank() * PRG_BANK_SIZE + address - 0x8000] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(_address: number, _value: number): void {}

  writeCpuExpansion(address: number, value: number): void {
    if ((address & 0xe100) === 0x4100) this.register = value & 0xff;
  }

  private selectedPrgBank(): number {
    return ((this.register >>> 2) & 1) % this.prgBankCount;
  }

  private selectedChrBank(): number {
    return (this.register & 3) % this.chrBankCount;
  }
}
