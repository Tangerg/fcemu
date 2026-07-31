import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const IRQ_COUNTER_BITS = [4, 8, 12, 16] as const;
const MIRRORING = [
  NametableMirroring.Horizontal,
  NametableMirroring.Vertical,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/**
 * iNES mapper 18: Jaleco SS8806.
 *
 * CPU A2-A11 and data bits D4-D7 are absent from the register port, so every
 * bank and IRQ latch is assembled from mirrored four-bit writes. Its IRQ
 * counter can inhibit borrow at bit 4, 8 or 12 and preserve the upper bits.
 */
export class JalecoSs8806Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnMirroring: NametableMirroring;
  private prgRegisters = [0, 0, 0];
  private chrRegisters = [0, 0, 0, 0, 0, 0, 0, 0];
  private ramProtection = 0;
  private irqReload = 0;
  private irqCounter = 0;
  private irqCounterBits: (typeof IRQ_COUNTER_BITS)[number] = 16;
  private irqEnabled = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.prgRegisters.fill(0);
    this.chrRegisters.fill(0);
    this.ramProtection = 0;
    this.irqReload = 0;
    this.irqCounter = 0;
    this.irqCounterBits = 16;
    this.irqEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.JalecoSs8806,
      prgRegisters: [...this.prgRegisters],
      chrRegisters: [...this.chrRegisters],
      ramProtection: this.ramProtection,
      irqReload: this.irqReload,
      irqCounter: this.irqCounter,
      irqCounterBits: this.irqCounterBits,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.JalecoSs8806) {
      throw new Error(`Cannot restore ${state.kind} state into Jaleco SS8806`);
    }
    if (
      !isFixedByteArray(state.prgRegisters, 3) ||
      state.prgRegisters.some((register) => register > 0x3f) ||
      !isFixedByteArray(state.chrRegisters, 8) ||
      !isByte(state.ramProtection) ||
      state.ramProtection > 3 ||
      !isWord(state.irqReload) ||
      !isWord(state.irqCounter) ||
      !isIrqCounterBits(state.irqCounterBits) ||
      !areBooleans(state.irqEnabled, state.irqPending) ||
      (state.irqPending && !state.irqEnabled) ||
      !MIRRORING.some((mirroring) => mirroring === state.mirroring)
    ) {
      throw new RangeError("Jaleco SS8806 save state contains invalid register or IRQ state");
    }
    this.prgRegisters = [...state.prgRegisters];
    this.chrRegisters = [...state.chrRegisters];
    this.ramProtection = state.ramProtection;
    this.irqReload = state.irqReload;
    this.irqCounter = state.irqCounter;
    this.irqCounterBits = state.irqCounterBits;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqEnabled) return;
    const mask = this.irqMask();
    const lowCounter = this.irqCounter & mask;
    this.irqCounter = (this.irqCounter & ~mask) | ((lowCounter - 1) & mask);
    if (lowCounter === 0) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = (this.chrRegisters[slot] ?? 0) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const bank =
        slot < 3 ? (this.prgRegisters[slot] ?? 0) % this.prgBankCount : this.prgBankCount - 1;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    if (address >= 0x6000 && this.ramReadable()) {
      return this.cartridge.readPrgRam(address - 0x6000);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && this.ramReadable() ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = (this.chrRegisters[slot] ?? 0) % this.chrBankCount;
      this.cartridge.writeChr(bank * CHR_BANK_SIZE + (address & 0x03ff), value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.ramWritable()) this.cartridge.writePrgRam(address - 0x6000, value);
      return;
    }
    if (address < 0x8000) return;

    const register = address & 0xf003;
    if (register >= 0x8000 && register <= 0x8003) {
      const slot = register < 0x8002 ? 0 : 1;
      this.writePrgNibble(slot, register & 1, value);
      return;
    }
    if (register === 0x9000 || register === 0x9001) {
      this.writePrgNibble(2, register & 1, value);
      return;
    }
    if (register === 0x9002) {
      this.ramProtection = value & 3;
      return;
    }
    if (register >= 0xa000 && register <= 0xd003) {
      const slot = ((register - 0xa000) >>> 12) * 2 + ((register >>> 1) & 1);
      this.writeChrNibble(slot, register & 1, value);
      return;
    }
    if (register >= 0xe000 && register <= 0xe003) {
      const shift = (register & 3) * 4;
      this.irqReload = (this.irqReload & ~(0x0f << shift)) | ((value & 0x0f) << shift);
      return;
    }
    switch (register) {
      case 0xf000:
        this.irqCounter = this.irqReload;
        this.acknowledgeIrq();
        break;
      case 0xf001:
        this.irqEnabled = (value & 1) !== 0;
        this.irqCounterBits =
          (value & 8) !== 0 ? 4 : (value & 4) !== 0 ? 8 : (value & 2) !== 0 ? 12 : 16;
        this.acknowledgeIrq();
        break;
      case 0xf002:
        this.cartridge.mirroringMode = MIRRORING[value & 3];
        break;
      case 0xf003:
        // Optional boards route this port to a separate uPD7755/7756 sample player.
        break;
    }
  }

  private writePrgNibble(slot: number, upper: number, value: number): void {
    const current = this.prgRegisters[slot] ?? 0;
    this.prgRegisters[slot] =
      upper === 0 ? (current & 0x30) | (value & 0x0f) : (current & 0x0f) | ((value & 3) << 4);
  }

  private writeChrNibble(slot: number, upper: number, value: number): void {
    const current = this.chrRegisters[slot] ?? 0;
    this.chrRegisters[slot] =
      upper === 0 ? (current & 0xf0) | (value & 0x0f) : (current & 0x0f) | ((value & 0x0f) << 4);
  }

  private ramReadable(): boolean {
    return (this.ramProtection & 1) !== 0 && this.cartridge.prgWritableBytes > 0;
  }

  private ramWritable(): boolean {
    return (this.ramProtection & 3) === 3 && this.cartridge.prgWritableBytes > 0;
  }

  private irqMask(): number {
    return this.irqCounterBits === 16 ? 0xffff : (1 << this.irqCounterBits) - 1;
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}

function isIrqCounterBits(value: number): value is (typeof IRQ_COUNTER_BITS)[number] {
  return IRQ_COUNTER_BITS.some((bits) => bits === value);
}
