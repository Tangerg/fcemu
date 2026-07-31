import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

const MIRRORING_MODES = [
  NametableMirroring.Vertical,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/**
 * iNES mapper 69: Sunsoft FME-7 (and the banking half of the 5A/5B).
 *
 * A command register at $8000-$9FFF selects one of sixteen internal registers
 * that a following $A000-$BFFF parameter write commits: eight 1 KiB CHR banks, a
 * RAM/ROM-selectable $6000-$7FFF window, three 8 KiB PRG banks with $E000 fixed,
 * nametable mirroring, and a 16-bit IRQ counter decremented every CPU cycle. The
 * optional 5B expansion audio at $C000-$FFFF is not emulated.
 */
export class Fme7Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private command = 0;
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgBank0 = 0;
  private prgBanks = [0, 0, 0];
  private irqCounter = 0;
  private irqCounterEnabled = false;
  private irqEnabled = false;
  private irqPending = false;
  private readonly powerOnMirroring: NametableMirroring;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.command = 0;
    this.chrBanks.fill(0);
    this.prgBank0 = 0;
    this.prgBanks.fill(0);
    this.irqCounter = 0;
    this.irqCounterEnabled = false;
    this.irqEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Fme7,
      command: this.command,
      chrBanks: [...this.chrBanks],
      prgBank0: this.prgBank0,
      prgBanks: [...this.prgBanks],
      mirroring: this.cartridge.mirroringMode,
      irqCounter: this.irqCounter,
      irqCounterEnabled: this.irqCounterEnabled,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Fme7)
      throw new Error(`Cannot restore ${state.kind} state into FME-7`);
    if (
      !Number.isInteger(state.command) ||
      state.command < 0 ||
      state.command > 0x0f ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !isFixedByteArray(state.prgBanks, 3) ||
      !isByte(state.prgBank0) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqCounterEnabled, state.irqEnabled, state.irqPending)
    ) {
      throw new RangeError("FME-7 save state contains invalid register or counter state");
    }
    if (!Object.values(NametableMirroring).includes(state.mirroring as NametableMirroring)) {
      throw new RangeError("FME-7 save state contains invalid mirroring");
    }
    this.command = state.command;
    this.chrBanks = [...state.chrBanks];
    this.prgBank0 = state.prgBank0;
    this.prgBanks = [...state.prgBanks];
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.irqCounter = state.irqCounter;
    this.irqCounterEnabled = state.irqCounterEnabled;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqCounterEnabled) return;
    this.irqCounter = (this.irqCounter - 1) & 0xffff;
    if (this.irqCounter === 0xffff && this.irqEnabled) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x8000) return this.readPrgBank(address);
    if (address >= 0x6000) return this.readPrgBank0(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      this.writePrgRam(address, value);
      return;
    }
    if (address >= 0x8000 && address <= 0x9fff) {
      this.command = value & 0x0f;
      return;
    }
    if (address >= 0xa000 && address <= 0xbfff) {
      this.writeParameter(value);
    }
  }

  private writeParameter(value: number): void {
    if (this.command <= 0x07) {
      this.chrBanks[this.command] = value;
    } else if (this.command === 0x08) {
      this.prgBank0 = value;
    } else if (this.command <= 0x0b) {
      this.prgBanks[this.command - 0x09] = value;
    } else if (this.command === 0x0c) {
      this.cartridge.mirroringMode = MIRRORING_MODES[value & 0x03];
    } else if (this.command === 0x0d) {
      this.irqPending = false;
      this.interruptPort.setMapperIrq(false);
      this.irqCounterEnabled = (value & 0x80) !== 0;
      this.irqEnabled = (value & 0x01) !== 0;
    } else if (this.command === 0x0e) {
      this.irqCounter = (this.irqCounter & 0xff00) | value;
    } else {
      this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
    }
  }

  private chrOffset(address: number): number {
    const bank = this.chrBanks[address >> 10] % this.chrBankCount;
    return bank * CHR_BANK_SIZE + (address & 0x03ff);
  }

  private readPrgBank(address: number): number {
    const slot = (address - 0x8000) >> 13; // 0..3
    const bank = slot < 3 ? this.prgBanks[slot] % this.prgBankCount : this.prgBankCount - 1;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  private readPrgBank0(address: number): number {
    if ((this.prgBank0 & 0x40) === 0) {
      const bank = (this.prgBank0 & 0x3f) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address - 0x6000)] ?? 0;
    }
    if ((this.prgBank0 & 0x80) === 0) return 0; // RAM window disabled -> open bus
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    if ((this.prgBank0 & 0xc0) !== 0xc0) return; // only enabled PRG RAM accepts writes
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
