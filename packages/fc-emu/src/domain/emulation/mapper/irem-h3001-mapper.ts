import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isBit, isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const MIRRORING = [
  NametableMirroring.Vertical,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
] as const;

/**
 * iNES mapper 65: Irem H3001.
 *
 * Two PRG registers feed an MMC3/VRC-like swappable first/third-window layout;
 * the apparent $C000 register in older emulator documents is not connected on
 * hardware. A 16-bit CPU-cycle down counter provides one-shot IRQs.
 */
export class IremH3001Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnMirroring: NametableMirroring;
  private prgBanks = [0, 1];
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgMode = 0;
  private irqReload = 0;
  private irqCounter = 0;
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
    this.prgBanks = [0, 1 % this.prgBankCount];
    this.chrBanks.fill(0);
    this.prgMode = 0;
    this.irqReload = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.IremH3001,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      prgMode: this.prgMode,
      irqReload: this.irqReload,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.IremH3001) {
      throw new Error(`Cannot restore ${state.kind} state into Irem H3001`);
    }
    if (
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank >= this.prgBankCount) ||
      !isFixedByteArray(state.chrBanks, 8) ||
      state.chrBanks.some((bank) => bank >= this.chrBankCount) ||
      !isBit(state.prgMode) ||
      !isWord(state.irqReload) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqEnabled, state.irqPending) ||
      !MIRRORING.some((mirroring) => mirroring === state.mirroring)
    ) {
      throw new RangeError("Irem H3001 save state contains invalid register or counter state");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.prgMode = state.prgMode;
    this.irqReload = state.irqReload;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqEnabled) return;
    this.irqCounter = (this.irqCounter - 1) & 0xffff;
    if (this.irqCounter === 0) {
      this.irqEnabled = false;
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = this.chrBanks[slot] ?? 0;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const selectedSlot = this.prgMode === 0 ? 0 : 2;
      const bank =
        slot === selectedSlot
          ? (this.prgBanks[0] ?? 0)
          : slot === 1
            ? (this.prgBanks[1] ?? 0)
            : this.prgBankCount - (slot === 2 - selectedSlot ? 2 : 1);
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    if (address >= 0x6000 && this.cartridge.prgWritableBytes > 0) {
      return this.cartridge.readPrgRam((address - 0x6000) % this.cartridge.prgWritableBytes);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 || (address >= 0x6000 && this.cartridge.prgWritableBytes > 0)
      ? 0xff
      : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = this.chrBanks[slot] ?? 0;
      this.cartridge.writeChr(bank * CHR_BANK_SIZE + (address & 0x03ff), value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.cartridge.prgWritableBytes > 0) {
        this.cartridge.writePrgRam((address - 0x6000) % this.cartridge.prgWritableBytes, value);
      }
      return;
    }
    if (address >= 0x8000 && address <= 0x8007) {
      this.prgBanks[0] = value % this.prgBankCount;
      return;
    }
    if (address >= 0xa000 && address <= 0xa007) {
      this.prgBanks[1] = value % this.prgBankCount;
      return;
    }
    if (address >= 0xb000 && address <= 0xb007) {
      this.chrBanks[address & 0x07] = value % this.chrBankCount;
      return;
    }
    switch (address) {
      case 0x9000:
        this.prgMode = value >>> 7;
        break;
      case 0x9001:
        this.cartridge.mirroringMode = MIRRORING[value >>> 6];
        break;
      case 0x9003:
        this.acknowledgeIrq();
        this.irqEnabled = (value & 0x80) !== 0;
        break;
      case 0x9004:
        this.acknowledgeIrq();
        this.irqCounter = this.irqReload;
        break;
      case 0x9005:
        this.irqReload = (this.irqReload & 0x00ff) | (value << 8);
        break;
      case 0x9006:
        this.irqReload = (this.irqReload & 0xff00) | value;
        break;
    }
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
