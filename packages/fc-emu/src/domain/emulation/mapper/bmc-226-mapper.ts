import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 226: BMC 42/63/76-in-1 two-register discrete multicart. */
export class Bmc226Mapper implements Mapper {
  private readonly prgBankCount: number;
  private register0 = 0;
  private register1 = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.clearRegisters();
  }

  reset(): void {
    this.clearRegisters();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Bmc226,
      register0: this.register0,
      register1: this.register1,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Bmc226) {
      throw new Error(`Cannot restore ${state.kind} state into BMC mapper 226`);
    }
    if (!isByte(state.register0) || !isByte(state.register1)) {
      throw new RangeError("BMC mapper 226 save state contains invalid registers");
    }
    this.register0 = state.register0;
    this.register1 = state.register1;
    this.updateMirroring();
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) return this.cartridge.readChr(address);
    if (address < 0x8000) return 0;
    const bank = this.prgBankAt(address);
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x3fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < CHR_BANK_SIZE) {
      if ((this.register1 & 0x02) === 0) this.cartridge.writeChr(address, value);
      return;
    }
    if (address < 0x8000) return;
    if ((address & 1) === 0) this.register0 = value;
    else this.register1 = value;
    this.updateMirroring();
  }

  private clearRegisters(): void {
    this.register0 = 0;
    this.register1 = 0;
    this.updateMirroring();
  }

  private prgBankAt(address: number): number {
    const bank = this.selectedPrgBank();
    if ((this.register0 & 0x20) !== 0) return bank;
    return (bank & 0xfe) | ((address >>> 14) & 1);
  }

  private selectedPrgBank(): number {
    const innerBank = this.register0 & 0x1f;
    let outerBank = ((this.register0 >>> 7) & 1) | ((this.register1 & 1) << 1);
    if (this.prgBankCount === 96 && outerBank > 0) outerBank--;
    return (innerBank | (outerBank << 5)) % this.prgBankCount;
  }

  private updateMirroring(): void {
    this.cartridge.mirroringMode =
      (this.register0 & 0x40) === 0 ? NametableMirroring.Horizontal : NametableMirroring.Vertical;
  }
}
