import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

/** iNES mapper 112: NTDEC/Asder two-stage bank register board. */
export class NtdecAsderMapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private currentRegister = 0;
  private registers = [0, 0, 0, 0, 0, 0, 0, 0];
  private outerChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.currentRegister = 0;
    this.registers.fill(0);
    this.outerChrBank = 0;
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.NtdecAsder,
      currentRegister: this.currentRegister,
      registers: [...this.registers],
      outerChrBank: this.outerChrBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.NtdecAsder) {
      throw new Error(`Cannot restore ${state.kind} state into NTDEC/Asder mapper 112`);
    }
    if (
      !Number.isInteger(state.currentRegister) ||
      state.currentRegister < 0 ||
      state.currentRegister > 7 ||
      !isFixedByteArray(state.registers, 8) ||
      !isByte(state.outerChrBank) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("NTDEC/Asder save state contains invalid register or mirroring state");
    }
    this.currentRegister = state.currentRegister;
    this.registers = [...state.registers];
    this.outerChrBank = state.outerChrBank;
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = this.resolveChrBank(address >>> 10) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const bank =
        slot < 2 ? (this.registers[slot] ?? 0) % this.prgBankCount : this.prgBankCount - (4 - slot);
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    switch (address & 0xe001) {
      case 0x8000:
        this.currentRegister = value & 0x07;
        break;
      case 0xa000:
        this.registers[this.currentRegister] = value;
        break;
      case 0xc000:
        this.outerChrBank = value;
        break;
      case 0xe000:
        this.cartridge.mirroringMode =
          (value & 0x01) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
    }
  }

  private resolveChrBank(slot: number): number {
    if (slot < 4) {
      const register = this.registers[2 + (slot >>> 1)] ?? 0;
      return (register & 0xfe) | (slot & 0x01);
    }
    const register = this.registers[slot] ?? 0;
    return register | (((this.outerChrBank >>> slot) & 0x01) << 8);
  }
}
