import type Cartridge from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans } from "./state-validation.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 73: Konami VRC3 banking and 16/8-bit CPU-cycle IRQ counter. */
export class Vrc3Mapper implements Mapper {
  private readonly prgBankCount: number;
  private selectedPrgBank = 0;
  private irqLatch = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqEnableAfterAcknowledge = false;
  private irqEightBitMode = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.irqLatch = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqEnableAfterAcknowledge = false;
    this.irqEightBitMode = false;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Vrc3,
      selectedPrgBank: this.selectedPrgBank,
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqEnableAfterAcknowledge: this.irqEnableAfterAcknowledge,
      irqEightBitMode: this.irqEightBitMode,
      irqPending: this.irqPending,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Vrc3) {
      throw new Error(`Cannot restore ${state.kind} state into VRC3`);
    }
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank > 7 ||
      !isWord(state.irqLatch) ||
      !isWord(state.irqCounter) ||
      !areBooleans(
        state.irqEnabled,
        state.irqEnableAfterAcknowledge,
        state.irqEightBitMode,
        state.irqPending,
      ) ||
      (state.irqPending && !state.irqEnabled)
    ) {
      throw new RangeError("VRC3 save state contains invalid register or IRQ state");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    this.irqLatch = state.irqLatch;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqEnableAfterAcknowledge = state.irqEnableAfterAcknowledge;
    this.irqEightBitMode = state.irqEightBitMode;
    this.irqPending = state.irqPending;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_write: boolean): void {
    if (!this.irqEnabled) return;
    if (this.irqEightBitMode) {
      if ((this.irqCounter & 0xff) === 0xff) {
        this.irqCounter = (this.irqCounter & 0xff00) | (this.irqLatch & 0xff);
        this.assertIrq();
      } else {
        this.irqCounter = (this.irqCounter & 0xff00) | ((this.irqCounter + 1) & 0xff);
      }
      return;
    }
    if (this.irqCounter === 0xffff) {
      this.irqCounter = this.irqLatch;
      this.assertIrq();
    } else {
      this.irqCounter++;
    }
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address % CHR_BANK_SIZE);
    if (address >= 0xc000) {
      return this.readPrg(this.prgBankCount - 1, address - 0xc000);
    }
    if (address >= 0x8000) {
      return this.readPrg(this.selectedPrgBank % this.prgBankCount, address - 0x8000);
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
      this.cartridge.writeChr(address % CHR_BANK_SIZE, value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.cartridge.prgWritableBytes > 0) {
        this.cartridge.writePrgRam((address - 0x6000) % this.cartridge.prgWritableBytes, value);
      }
      return;
    }
    if (address < 0x8000) return;

    const register = address & 0xf000;
    if (register >= 0x8000 && register <= 0xb000) {
      const shift = ((register - 0x8000) >>> 12) * 4;
      this.irqLatch = (this.irqLatch & ~(0x0f << shift)) | ((value & 0x0f) << shift);
      return;
    }
    switch (register) {
      case 0xc000:
        this.acknowledgeIrq();
        this.irqEnableAfterAcknowledge = (value & 0x01) !== 0;
        this.irqEnabled = (value & 0x02) !== 0;
        this.irqEightBitMode = (value & 0x04) !== 0;
        if (this.irqEnabled) this.irqCounter = this.irqLatch;
        break;
      case 0xd000:
        this.acknowledgeIrq();
        this.irqEnabled = this.irqEnableAfterAcknowledge;
        break;
      case 0xf000:
        this.selectedPrgBank = value & 0x07;
        break;
    }
  }

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }

  private assertIrq(): void {
    this.irqPending = true;
    this.interruptPort.setMapperIrq(true);
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
