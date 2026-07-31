import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;

/** iNES mapper 97: Irem TAM-S1 with a fixed-last lower PRG window. */
export class IremTamS1Mapper implements Mapper {
  private readonly initialMirroring: NametableMirroring;
  private readonly prgBankCount: number;
  private prgBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.initialMirroring = cartridge.mirroringMode;
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBank = this.prgBankCount - 1;
    this.cartridge.mirroringMode = this.initialMirroring;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.IremTamS1,
      prgBank: this.prgBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.IremTamS1) {
      throw new Error(`Cannot restore ${state.kind} state into Irem TAM-S1`);
    }
    if (
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank >= this.prgBankCount
    ) {
      throw new RangeError("Irem TAM-S1 save state contains an invalid PRG bank");
    }
    if (
      state.mirroring !== NametableMirroring.SingleScreenLower &&
      state.mirroring !== NametableMirroring.Horizontal &&
      state.mirroring !== NametableMirroring.Vertical &&
      state.mirroring !== NametableMirroring.SingleScreenUpper
    ) {
      throw new RangeError("Irem TAM-S1 save state contains invalid mirroring");
    }
    this.prgBank = state.prgBank;
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0xc000) {
      return this.cartridge.prgRom[this.prgBank * PRG_BANK_SIZE + (address - 0xc000)] ?? 0;
    }
    if (address >= 0x8000) {
      const fixedBank = this.prgBankCount - 1;
      return this.cartridge.prgRom[fixedBank * PRG_BANK_SIZE + (address - 0x8000)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address < 0x8000) return;
    this.prgBank = (value & 0x0f) % this.prgBankCount;
    this.cartridge.mirroringMode = [
      NametableMirroring.SingleScreenLower,
      NametableMirroring.Horizontal,
      NametableMirroring.Vertical,
      NametableMirroring.SingleScreenUpper,
    ][value >>> 6] as NametableMirroring;
  }
}
