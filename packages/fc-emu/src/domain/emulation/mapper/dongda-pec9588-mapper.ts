import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isBit, isByte, isIntegerInRange } from "../numeric-range.js";
import { Eeprom93c66 } from "./eeprom93c66.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;

/** iNES mapper 164: Dongda PEC-9588/cy2000-3 with 1bpp CHR wiring and 93C66 EEPROM. */
export class DongdaPec9588Mapper implements Mapper {
  private readonly eeprom: Eeprom93c66;
  private readonly prgBankCount: number;
  private prgBankLow = 0;
  private prgBankHigh = 0;
  private mirroringControl = 0;
  private latchedChrA3 = 0;
  private latchedChrA12 = 0;
  private lastPpuAddress = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.eeprom = new Eeprom93c66(cartridge);
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.eeprom.powerOn();
    this.resetBoardRegisters();
  }

  reset(): void {
    this.eeprom.write(0, 0, 0);
    this.resetBoardRegisters();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.DongdaPec9588164,
      prgBankLow: this.prgBankLow,
      prgBankHigh: this.prgBankHigh,
      mirroringControl: this.mirroringControl,
      latchedChrA3: this.latchedChrA3,
      latchedChrA12: this.latchedChrA12,
      lastPpuAddress: this.lastPpuAddress,
      eeprom: this.eeprom.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.DongdaPec9588164) {
      throw new Error(`Cannot restore ${state.kind} state into Dongda PEC-9588 mapper 164`);
    }
    if (
      !isByte(state.prgBankLow) ||
      !isIntegerInRange(state.prgBankHigh, 0, 3) ||
      !isBit(state.mirroringControl) ||
      !isBit(state.latchedChrA3) ||
      !isBit(state.latchedChrA12) ||
      !isIntegerInRange(state.lastPpuAddress, 0, 0x3fff) ||
      typeof state.eeprom !== "object" ||
      state.eeprom === null
    ) {
      throw new RangeError("Dongda PEC-9588 mapper 164 save state contains invalid latch state");
    }
    this.eeprom.validateState(state.eeprom);

    this.prgBankLow = state.prgBankLow;
    this.prgBankHigh = state.prgBankHigh;
    this.mirroringControl = state.mirroringControl;
    this.latchedChrA3 = state.latchedChrA3;
    this.latchedChrA12 = state.latchedChrA12;
    this.lastPpuAddress = state.lastPpuAddress;
    this.eeprom.restoreState(state.eeprom);
    this.updateMirroring();
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x6000 && address < 0x8000) {
      return this.cartridge.prgRamBytes > 0 ? this.cartridge.readPrgRam(address & 0x07ff) : 0;
    }
    if (address >= 0x8000) {
      const bank = this.selectedPrgBank(address);
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x3fff)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && this.cartridge.prgRamBytes > 0 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
    } else if (address >= 0x6000 && address < 0x8000 && this.cartridge.prgRamBytes > 0) {
      this.cartridge.writePrgRam(address & 0x07ff, value);
    }
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if ((address & 0xff00) !== 0x5500) return undefined;
    return { value: this.eeprom.readOutput() === 0 ? 0x04 : 0, drivenMask: 0x04 };
  }

  writeCpuExpansion(address: number, value: number): void {
    switch (address & 0xff00) {
      case 0x5000:
        this.prgBankLow = value & 0xff;
        this.updateMirroring();
        break;
      case 0x5100:
        this.prgBankHigh = value & 3;
        break;
      case 0x5200:
        this.eeprom.write((value >>> 4) & 1, (value >>> 1) & 1, value & 1);
        break;
      case 0x5300:
        this.mirroringControl = (value >>> 7) & 1;
        this.updateMirroring();
        break;
    }
  }

  observePpuAddress(address: number): void {
    address &= 0x3fff;
    const ppuA13Rose = (this.lastPpuAddress & 0x2000) === 0 && (address & 0x2000) !== 0;
    if (ppuA13Rose) {
      this.latchedChrA3 = address & 1;
      this.latchedChrA12 = (address >>> 9) & 1;
    }
    this.lastPpuAddress = address;
  }

  private resetBoardRegisters(): void {
    this.prgBankLow = 0;
    this.prgBankHigh = 0;
    this.mirroringControl = 0;
    this.latchedChrA3 = 0;
    this.latchedChrA12 = 0;
    this.lastPpuAddress = 0;
    this.updateMirroring();
  }

  private selectedPrgBank(address: number): number {
    const outerBank = this.prgBankHigh << 5;
    let innerBank: number;
    if ((this.prgBankLow & 0x10) !== 0) {
      innerBank = ((this.prgBankLow & 0x0f) << 1) | ((address >>> 14) & 1);
    } else if (address < 0xc000) {
      innerBank = ((this.prgBankLow & 0x20) >>> 1) | (this.prgBankLow & 0x0f);
    } else if ((this.prgBankLow & 0x40) !== 0) {
      innerBank = 0x1c | ((this.prgBankLow & 1) << 1);
    } else {
      innerBank = 0x1f;
    }
    return (outerBank | innerBank) % this.prgBankCount;
  }

  private chrOffset(address: number): number {
    address &= 0x1fff;
    if ((this.prgBankLow & 0x80) === 0) return address;
    return (address & ~0x1008) | (this.latchedChrA3 << 3) | (this.latchedChrA12 << 12);
  }

  private updateMirroring(): void {
    this.cartridge.mirroringMode =
      (this.prgBankLow & 0x10) === 0 || this.mirroringControl !== 0
        ? NametableMirroring.Vertical
        : NametableMirroring.Horizontal;
  }
}
