import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const INNER_PRG_BYTES = 0x80_000;
const MIRRORING = [
  NametableMirroring.Vertical,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/**
 * iNES mapper 90: J.Y. Company's ASIC with advanced nametable outputs inhibited
 * by its PCB jumper.
 *
 * The ASIC still owns its complete PRG/CHR mode registers, serial multiplier,
 * accumulator, MMC4-like CHR latches and four-source IRQ unit. Mapper 209 and
 * related PCBs expose different pins and remain separate mapper identities.
 */
export class JyCompanyMapper implements Mapper {
  private prgBanks = [0, 0, 0, 0];
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private nametableBanks = [0, 0, 0, 0];
  private mode = 0;
  private mirroringRegister = 0;
  private ppuConfig = 0;
  private outerBank = 0;
  private chrLatchLow = false;
  private chrLatchHigh = false;
  private irqMode = 0;
  private irqPrescaler = 0;
  private irqCounter = 0;
  private irqXor = 0;
  private irqUnknownMode = 0;
  private irqEnabled = false;
  private irqPending = false;
  private a12High = false;
  private multiplyOperand1 = 0;
  private multiplyOperand2 = 0;
  private multiplyLatchedOperand1 = 0;
  private multiplyLatchedOperand2 = 0;
  private multiplyStep = 8;
  private accumulator = 0;
  private testRegister = 0;
  private readonly jumper: number;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    jumper = 0,
  ) {
    this.jumper = jumper & 0xc0;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.nametableBanks.fill(0);
    this.mode = 0;
    this.mirroringRegister = 0;
    this.ppuConfig = 0;
    this.outerBank = 0;
    this.chrLatchLow = false;
    this.chrLatchHigh = false;
    this.irqMode = 0;
    this.irqPrescaler = 0;
    this.irqCounter = 0;
    this.irqXor = 0;
    this.irqUnknownMode = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.a12High = false;
    this.multiplyOperand1 = 0;
    this.multiplyOperand2 = 0;
    this.multiplyLatchedOperand1 = 0;
    this.multiplyLatchedOperand2 = 0;
    this.multiplyStep = 8;
    this.accumulator = 0;
    this.testRegister = 0;
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
    this.interruptPort.setMapperIrq(false);
  }

  reset(): void {
    this.chrLatchLow = false;
    this.chrLatchHigh = false;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.JyCompany,
      board: "mapper-90",
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      nametableBanks: [...this.nametableBanks],
      mode: this.mode,
      mirroringRegister: this.mirroringRegister,
      ppuConfig: this.ppuConfig,
      outerBank: this.outerBank,
      chrLatchLow: this.chrLatchLow,
      chrLatchHigh: this.chrLatchHigh,
      irqMode: this.irqMode,
      irqPrescaler: this.irqPrescaler,
      irqCounter: this.irqCounter,
      irqXor: this.irqXor,
      irqUnknownMode: this.irqUnknownMode,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      a12High: this.a12High,
      multiplyOperand1: this.multiplyOperand1,
      multiplyOperand2: this.multiplyOperand2,
      multiplyLatchedOperand1: this.multiplyLatchedOperand1,
      multiplyLatchedOperand2: this.multiplyLatchedOperand2,
      multiplyStep: this.multiplyStep,
      accumulator: this.accumulator,
      testRegister: this.testRegister,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.JyCompany) {
      throw new Error(`Cannot restore ${state.kind} state into J.Y. Company mapper`);
    }
    if (
      state.board !== "mapper-90" ||
      !isFixedByteArray(state.prgBanks, 4) ||
      state.prgBanks.some((bank) => bank > 0x7f) ||
      !isFixedWordArray(state.chrBanks, 8) ||
      !isFixedWordArray(state.nametableBanks, 4) ||
      !isByte(state.mode) ||
      !isByte(state.mirroringRegister) ||
      !isByte(state.ppuConfig) ||
      !isByte(state.outerBank) ||
      !isByte(state.irqMode) ||
      !isByte(state.irqPrescaler) ||
      !isByte(state.irqCounter) ||
      !isByte(state.irqXor) ||
      !isByte(state.irqUnknownMode) ||
      !isByte(state.multiplyOperand1) ||
      !isByte(state.multiplyOperand2) ||
      !isByte(state.multiplyLatchedOperand1) ||
      !isByte(state.multiplyLatchedOperand2) ||
      !Number.isInteger(state.multiplyStep) ||
      state.multiplyStep < 0 ||
      state.multiplyStep > 8 ||
      !isByte(state.accumulator) ||
      !isByte(state.testRegister) ||
      !areBooleans(
        state.chrLatchLow,
        state.chrLatchHigh,
        state.irqEnabled,
        state.irqPending,
        state.a12High,
      ) ||
      (state.irqPending && !state.irqEnabled) ||
      !MIRRORING.some((mirroring) => mirroring === state.mirroring) ||
      state.mirroring !== MIRRORING[state.mirroringRegister & 3]
    ) {
      throw new RangeError("J.Y. Company save state contains invalid register or timing state");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.nametableBanks = [...state.nametableBanks];
    this.mode = state.mode;
    this.mirroringRegister = state.mirroringRegister;
    this.ppuConfig = state.ppuConfig;
    this.outerBank = state.outerBank;
    this.chrLatchLow = state.chrLatchLow;
    this.chrLatchHigh = state.chrLatchHigh;
    this.irqMode = state.irqMode;
    this.irqPrescaler = state.irqPrescaler;
    this.irqCounter = state.irqCounter;
    this.irqXor = state.irqXor;
    this.irqUnknownMode = state.irqUnknownMode;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.a12High = state.a12High;
    this.multiplyOperand1 = state.multiplyOperand1;
    this.multiplyOperand2 = state.multiplyOperand2;
    this.multiplyLatchedOperand1 = state.multiplyLatchedOperand1;
    this.multiplyLatchedOperand2 = state.multiplyLatchedOperand2;
    this.multiplyStep = state.multiplyStep;
    this.accumulator = state.accumulator;
    this.testRegister = state.testRegister;
    this.cartridge.mirroringMode = state.mirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(write: boolean): void {
    this.advanceMultiplier();
    const source = this.irqMode & 3;
    if (source === 0 || (source === 3 && write)) this.clockIrq();
  }

  observePpuAddress(address: number): void {
    const nextA12High = (address & 0x1000) !== 0;
    const rising = nextA12High && !this.a12High;
    this.a12High = nextA12High;
    if (rising && (this.irqMode & 3) === 1) this.clockIrq();
  }

  observePpuRead(address: number): void {
    if (address < 0x3f00 && (this.irqMode & 3) === 2) this.clockIrq();
    if ((this.outerBank & 0x80) === 0) return;

    switch (address & 0x3ff8) {
      case 0x0fd8:
        this.chrLatchLow = false;
        break;
      case 0x0fe8:
        this.chrLatchLow = true;
        break;
      case 0x1fd8:
        this.chrLatchHigh = false;
        break;
      case 0x1fe8:
        this.chrLatchHigh = true;
        break;
    }
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.chrOffset(address));
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.prgOffset(address)] ?? 0;
    }
    if (address < 0x6000) return 0;

    if ((this.mode & 0x80) !== 0) {
      return this.cartridge.prgRom[this.prgRom6000Offset(address)] ?? 0;
    }
    return this.cartridge.prgWritableBytes > 0 ? this.cartridge.readPrgRam(address & 0x1fff) : 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    if (address < 0x6000) return 0;
    return (this.mode & 0x80) !== 0 || this.cartridge.prgWritableBytes > 0 ? 0xff : 0;
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (address === 0x5000 || address === 0x5400 || address === 0x5c00) {
      return { value: this.jumper, drivenMask: 0xc0 };
    }
    switch (address & 0xf803) {
      case 0x5800:
        return { value: this.multiplyResult() & 0xff, drivenMask: 0xff };
      case 0x5801:
        return { value: this.multiplyResult() >>> 8, drivenMask: 0xff };
      case 0x5802:
        return { value: this.accumulator, drivenMask: 0xff };
      case 0x5803:
        return { value: this.testRegister, drivenMask: 0xff };
      default:
        return undefined;
    }
  }

  writeCpuExpansion(address: number, value: number): void {
    value &= 0xff;
    switch (address & 0xf803) {
      case 0x5800:
        this.multiplyOperand1 = value;
        break;
      case 0x5801:
        this.multiplyOperand2 = value;
        this.multiplyLatchedOperand1 = this.multiplyOperand1;
        this.multiplyLatchedOperand2 = value;
        this.multiplyStep = 0;
        break;
      case 0x5802:
        this.accumulator = (this.accumulator + value) & 0xff;
        break;
      case 0x5803:
        this.accumulator = 0;
        this.testRegister = value;
        break;
    }
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) {
      if ((this.ppuConfig & 0x40) !== 0) {
        this.cartridge.writeChr(this.chrOffset(address), value);
      }
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if ((this.mode & 0x80) === 0 && this.cartridge.prgWritableBytes > 0) {
        this.cartridge.writePrgRam(address & 0x1fff, value);
      }
      return;
    }
    if (address < 0x8000) return;

    const maskedPrgAddress = address & 0xf803;
    if (maskedPrgAddress >= 0x8000 && maskedPrgAddress <= 0x8003) {
      this.prgBanks[address & 3] = value & 0x7f;
      return;
    }
    const maskedPpuBankAddress = address & 0xf807;
    if (maskedPpuBankAddress >= 0x9000 && maskedPpuBankAddress <= 0x9007) {
      const index = address & 7;
      this.chrBanks[index] = (this.chrBanks[index] & 0xff00) | value;
      return;
    }
    if (maskedPpuBankAddress >= 0xa000 && maskedPpuBankAddress <= 0xa007) {
      const index = address & 7;
      this.chrBanks[index] = (this.chrBanks[index] & 0x00ff) | (value << 8);
      return;
    }
    if (maskedPpuBankAddress >= 0xb000 && maskedPpuBankAddress <= 0xb007) {
      const index = address & 3;
      if ((address & 4) === 0) {
        this.nametableBanks[index] = (this.nametableBanks[index] & 0xff00) | value;
      } else {
        this.nametableBanks[index] = (this.nametableBanks[index] & 0x00ff) | (value << 8);
      }
      return;
    }

    const irqAddress = address & 0xf007;
    if (irqAddress >= 0xc000 && irqAddress <= 0xc007) {
      this.writeIrq(irqAddress & 7, value);
      return;
    }
    if (maskedPrgAddress >= 0xd000 && maskedPrgAddress <= 0xd003) {
      this.writeMode(maskedPrgAddress & 3, value);
    }
  }

  private writeIrq(register: number, value: number): void {
    switch (register) {
      case 0:
        if ((value & 1) !== 0) this.irqEnabled = true;
        else this.disableIrq();
        break;
      case 1:
        this.irqMode = value;
        break;
      case 2:
        this.disableIrq();
        break;
      case 3:
        this.irqEnabled = true;
        break;
      case 4:
        this.irqPrescaler = value ^ this.irqXor;
        break;
      case 5:
        this.irqCounter = value ^ this.irqXor;
        break;
      case 6:
        this.irqXor = value;
        break;
      case 7:
        this.irqUnknownMode = value;
        break;
    }
  }

  private writeMode(register: number, value: number): void {
    switch (register) {
      case 0:
        this.mode = value;
        break;
      case 1:
        this.mirroringRegister = value;
        this.cartridge.mirroringMode = MIRRORING[value & 3];
        break;
      case 2:
        this.ppuConfig = value;
        break;
      case 3:
        this.outerBank = value;
        break;
    }
  }

  private prgOffset(address: number): number {
    const mode = this.mode & 3;
    const outerBase = ((this.outerBank >>> 1) & 3) * (INNER_PRG_BYTES / PRG_BANK_SIZE);
    const slot = (address - 0x8000) >>> 13;
    let innerBank: number;

    if (mode === 0) {
      const bank32 = (this.mode & 4) !== 0 ? (this.prgBanks[3] ?? 0) & 0x0f : 0x0f;
      innerBank = bank32 * 4 + slot;
    } else if (mode === 1) {
      const upperBank = (this.mode & 4) !== 0 ? (this.prgBanks[3] ?? 0) & 0x1f : 0x1f;
      const bank16 = slot < 2 ? (this.prgBanks[1] ?? 0) & 0x1f : upperBank;
      innerBank = bank16 * 2 + (slot & 1);
    } else {
      const register = slot === 3 && (this.mode & 4) === 0 ? 0x7f : (this.prgBanks[slot] ?? 0);
      innerBank = mode === 3 ? reverseSevenBits(register) & 0x3f : register & 0x3f;
    }

    const bank = (outerBase + innerBank) % (this.cartridge.prgRom.byteLength / PRG_BANK_SIZE);
    return bank * PRG_BANK_SIZE + (address & 0x1fff);
  }

  private prgRom6000Offset(address: number): number {
    const mode = this.mode & 3;
    const outerBase = ((this.outerBank >>> 1) & 3) * (INNER_PRG_BYTES / PRG_BANK_SIZE);
    const register = this.prgBanks[3] ?? 0;
    const innerBank =
      mode === 0
        ? ((register & 0x0f) << 2) | 3
        : mode === 1
          ? ((register & 0x1f) << 1) | 1
          : mode === 3
            ? reverseSevenBits(register) & 0x3f
            : register & 0x3f;
    const bank = (outerBase + innerBank) % (this.cartridge.prgRom.byteLength / PRG_BANK_SIZE);
    return bank * PRG_BANK_SIZE + (address & 0x1fff);
  }

  private chrOffset(address: number): number {
    const mode = (this.mode >>> 3) & 3;
    const bankBytes = 0x2000 >>> mode;
    let register: number;
    if (mode === 0) {
      register = 0;
    } else if (mode === 1) {
      register = address < 0x1000 ? (this.chrLatchLow ? 2 : 0) : this.chrLatchHigh ? 6 : 4;
    } else if (mode === 2) {
      register = (address >>> 11) * 2;
    } else {
      register = address >>> 10;
    }

    const innerBytes = (this.outerBank & 0x20) !== 0 ? 0x80_000 : 0x40_000;
    const outerIndex =
      (this.outerBank & 0x20) !== 0
        ? (this.outerBank >>> 3) & 3
        : (((this.outerBank >>> 3) & 3) << 1) | (this.outerBank & 1);
    const innerBankMask = innerBytes / bankBytes - 1;
    const bank =
      (outerIndex * (innerBytes / bankBytes) + ((this.chrBanks[register] ?? 0) & innerBankMask)) %
      (this.cartridge.chrMemoryBytes / bankBytes);
    return bank * bankBytes + (address & (bankBytes - 1));
  }

  private clockIrq(): void {
    if (!this.irqEnabled) return;
    const direction = this.irqMode >>> 6;
    if (direction !== 1 && direction !== 2) return;

    const mask = (this.irqMode & 4) !== 0 ? 0x07 : 0xff;
    const nextPrescaler =
      direction === 1
        ? ((this.irqPrescaler & mask) + 1) & mask
        : ((this.irqPrescaler & mask) - 1) & mask;
    this.irqPrescaler = (this.irqPrescaler & ~mask) | nextPrescaler;
    const wrapped = direction === 1 ? nextPrescaler === 0 : nextPrescaler === mask;
    if (!wrapped) return;

    this.irqCounter = direction === 1 ? (this.irqCounter + 1) & 0xff : (this.irqCounter - 1) & 0xff;
    if (
      (direction === 1 && this.irqCounter === 0) ||
      (direction === 2 && this.irqCounter === 0xff)
    ) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  private disableIrq(): void {
    this.irqEnabled = false;
    this.irqPrescaler = 0;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }

  private advanceMultiplier(): void {
    if (this.multiplyStep < 8) this.multiplyStep++;
  }

  private multiplyResult(): number {
    let result = 0;
    for (let bit = 0; bit < this.multiplyStep; bit++) {
      if ((this.multiplyLatchedOperand2 & (1 << bit)) !== 0) {
        result = (result + (this.multiplyLatchedOperand1 << bit)) & 0xffff;
      }
    }
    return result;
  }
}

function reverseSevenBits(value: number): number {
  let reversed = 0;
  for (let bit = 0; bit < 7; bit++) {
    reversed |= ((value >>> bit) & 1) << (6 - bit);
  }
  return reversed;
}

function isFixedWordArray(value: unknown, length: number): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every(isWord);
}
