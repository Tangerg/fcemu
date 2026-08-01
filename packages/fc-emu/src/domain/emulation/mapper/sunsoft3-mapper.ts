import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x0800;
const MIRRORING = [
  NametableMirroring.Vertical,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/** iNES mapper 67: Sunsoft-3 banking, mirroring and one-shot CPU-cycle IRQ. */
export class Sunsoft3Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnMirroring: NametableMirroring;
  private selectedPrgBank = 0;
  private chrBanks = [0, 0, 0, 0];
  private irqCounter = 0;
  private irqHighByteNext = true;
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
    this.selectedPrgBank = 0;
    this.chrBanks.fill(0);
    this.irqCounter = 0;
    this.irqHighByteNext = true;
    this.irqEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Sunsoft3,
      selectedPrgBank: this.selectedPrgBank,
      chrBanks: [...this.chrBanks],
      irqCounter: this.irqCounter,
      irqHighByteNext: this.irqHighByteNext,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Sunsoft3) {
      throw new Error(`Cannot restore ${state.kind} state into Sunsoft-3`);
    }
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount ||
      !isFixedByteArray(state.chrBanks, 4) ||
      state.chrBanks.some((bank) => bank >= this.chrBankCount) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqHighByteNext, state.irqEnabled, state.irqPending) ||
      !MIRRORING.some((mirroring) => mirroring === state.mirroring)
    ) {
      throw new RangeError("Sunsoft-3 save state contains invalid register or IRQ state");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.chrBanks = [...state.chrBanks];
    this.irqCounter = state.irqCounter;
    this.irqHighByteNext = state.irqHighByteNext;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_write: boolean): void {
    if (!this.irqEnabled) return;
    if (this.irqCounter === 0) {
      this.irqCounter = 0xffff;
      this.irqEnabled = false;
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
      return;
    }
    this.irqCounter--;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 11;
      const bank = this.chrBanks[slot] ?? 0;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x07ff));
    }
    if (address >= 0xc000) {
      return this.readPrg(this.prgBankCount - 1, address - 0xc000);
    }
    if (address >= 0x8000) {
      return this.readPrg(this.selectedPrgBank, address - 0x8000);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;

    if ((address & 0x0800) === 0) {
      this.irqPending = false;
      this.interruptPort.setMapperIrq(false);
      return;
    }

    switch (address & 0xf800) {
      case 0x8800:
      case 0x9800:
      case 0xa800:
      case 0xb800:
        this.chrBanks[(address >>> 12) - 8] = (value & 0x3f) % this.chrBankCount;
        break;
      case 0xc800:
        if (this.irqHighByteNext) {
          this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
        } else {
          this.irqCounter = (this.irqCounter & 0xff00) | value;
        }
        this.irqHighByteNext = !this.irqHighByteNext;
        break;
      case 0xd800:
        this.irqEnabled = (value & 0x10) !== 0;
        this.irqHighByteNext = true;
        break;
      case 0xe800:
        this.cartridge.mirroringMode = MIRRORING[value & 0x03];
        break;
      case 0xf800:
        this.selectedPrgBank = (value & 0x0f) % this.prgBankCount;
        break;
    }
  }

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }
}
