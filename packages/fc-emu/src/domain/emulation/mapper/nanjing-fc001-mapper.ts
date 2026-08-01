import type Cartridge from "../../model/cartridge.js";
import { isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { areBooleans } from "./state-validation.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_HALF_SIZE = 0x1000;

/** iNES mapper 163: Nanjing FC-001 ASIC, without the submapper-1 ADPCM board variant. */
export class NanjingFc001Mapper implements Mapper {
  private readonly prgBankCount: number;
  private prgBankLow = 0;
  private prgBankHigh = 0;
  private mode = 0;
  private feedbackEnabled = false;
  private feedbackBit = false;
  private automaticChrHalf = 0;
  private lastPpuAddress = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBankLow = 0;
    this.prgBankHigh = 0;
    this.mode = 0;
    this.feedbackEnabled = false;
    this.feedbackBit = false;
    this.automaticChrHalf = 0;
    this.lastPpuAddress = 0;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.NanjingFc001163,
      prgBankLow: this.prgBankLow,
      prgBankHigh: this.prgBankHigh,
      mode: this.mode,
      feedbackEnabled: this.feedbackEnabled,
      feedbackBit: this.feedbackBit,
      automaticChrHalf: this.automaticChrHalf,
      lastPpuAddress: this.lastPpuAddress,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.NanjingFc001163) {
      throw new Error(`Cannot restore ${state.kind} state into Nanjing FC-001 mapper 163`);
    }
    if (
      !isIntegerInRange(state.prgBankLow, 0, 0x8f) ||
      (state.prgBankLow & 0x70) !== 0 ||
      !isIntegerInRange(state.prgBankHigh, 0, 3) ||
      !isIntegerInRange(state.mode, 0, 5) ||
      (state.mode & 0x02) !== 0 ||
      !areBooleans(state.feedbackEnabled, state.feedbackBit) ||
      !isIntegerInRange(state.automaticChrHalf, 0, 1) ||
      !isIntegerInRange(state.lastPpuAddress, 0, 0x3fff)
    ) {
      throw new RangeError("Nanjing FC-001 mapper 163 save state contains invalid latch state");
    }

    this.prgBankLow = state.prgBankLow;
    this.prgBankHigh = state.prgBankHigh;
    this.mode = state.mode;
    this.feedbackEnabled = state.feedbackEnabled;
    this.feedbackBit = state.feedbackBit;
    this.automaticChrHalf = state.automaticChrHalf;
    this.lastPpuAddress = state.lastPpuAddress;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x6000 && address < 0x8000) {
      return this.cartridge.readPrgRam(address & 0x1fff);
    }
    if (address >= 0x8000) {
      return (
        this.cartridge.prgRom[this.selectedPrgBank() * PRG_BANK_SIZE + (address - 0x8000)] ?? 0
      );
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x6000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
    } else if (address >= 0x6000 && address < 0x8000) {
      this.cartridge.writePrgRam(address & 0x1fff, value);
    }
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if ((address & 0xf300) !== 0x5100) return undefined;
    return { value: this.feedbackBit ? 0 : 0x04, drivenMask: 0x04 };
  }

  writeCpuExpansion(address: number, value: number): void {
    if (address < 0x5000 || address >= 0x5400) return;

    switch (address & 0xff00) {
      case 0x5000:
        this.prgBankLow = this.swapLowDataBits(value) & 0x8f;
        break;
      case 0x5100:
        if ((address & 1) === 0) {
          const input = this.swapLowDataBits(value);
          this.feedbackEnabled = (input & 0x01) !== 0;
          this.feedbackBit = (input & 0x04) !== 0;
        } else if (this.feedbackEnabled) {
          this.feedbackBit = !this.feedbackBit;
        }
        break;
      case 0x5200:
        this.prgBankHigh = this.swapLowDataBits(value) & 0x03;
        break;
      case 0x5300:
        this.mode = value & 0x05;
        break;
    }
  }

  observePpuAddress(address: number): void {
    address &= 0x3fff;
    const ppuA13Rose = (this.lastPpuAddress & 0x2000) === 0 && (address & 0x2000) !== 0;
    if (ppuA13Rose) this.automaticChrHalf = (address >>> 9) & 1;
    this.lastPpuAddress = address;
  }

  private chrOffset(address: number): number {
    if ((this.prgBankLow & 0x80) === 0) return address & 0x1fff;
    return this.automaticChrHalf * CHR_HALF_SIZE + (address & 0x0fff);
  }

  private selectedPrgBank(): number {
    const low = (this.mode & 0x04) !== 0 ? this.prgBankLow & 0x0f : (this.prgBankLow & 0x0c) | 0x03;
    const high =
      this.prgBankCount === 32
        ? (this.prgBankHigh & 1) | ((this.prgBankHigh >>> 1) & 1)
        : this.prgBankHigh;
    return ((high << 4) | low) % this.prgBankCount;
  }

  private swapLowDataBits(value: number): number {
    value &= 0xff;
    if ((this.mode & 0x01) === 0) return value;
    return (value & 0xfc) | ((value & 0x01) << 1) | ((value & 0x02) >>> 1);
  }
}
