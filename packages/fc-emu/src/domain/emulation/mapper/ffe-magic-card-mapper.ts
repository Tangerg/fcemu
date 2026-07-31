import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";
import type { FfeMagicCardBoard } from "./ffe-magic-card-board.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const WRAM_BANK_SIZE = 0x2000;
const SCRATCH_RAM_SIZE = 0x1000;
const FDS_IRQ_MASTER_CYCLES = 1792;
const MASTER_CYCLES_PER_CPU = 12;
const BANKING_MODES = ["latch", "2m", "4m"] as const;

type BankingMode = (typeof BANKING_MODES)[number];

/**
 * Front Fareast Magic Card / Super Magic Card play-mode RAM cartridge.
 *
 * iNES 6/8/17 images are preloaded RAM-card disk extractions. PRG and CHR data
 * therefore initialize mutable board memory instead of pretending to be ROM.
 */
export class FfeMagicCardMapper implements Mapper {
  private readonly prgMemory: Uint8Array;
  private readonly chrMemory: Uint8Array;
  private readonly scratchRam: Uint8Array;
  private readonly maximumPrgBank: number;
  private readonly initialPrgBankCount: number;
  private prgBanks = [0, 1, 2, 3];
  private chrRegisters = [0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0];
  private latchMode = 0;
  private latchValue = 0;
  private prgWriteProtected = true;
  private twoScreenMirroring = true;
  private mirroringSetting = false;
  private bankingMode: BankingMode = "latch";
  private bankingModeAddressBits = 3;
  private chr8kBank = 0;
  private superMode = 0;
  private latch0Fe = false;
  private latch1Fe = false;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqPending = false;
  private a12High = false;
  private fdsIrqDivider = 0;
  private fdsIrqEnabled = false;
  private fdsIrqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: FfeMagicCardBoard,
  ) {
    this.prgMemory = new Uint8Array(board.prgMemoryBytes);
    this.chrMemory = new Uint8Array(board.chrMemoryBytes);
    this.scratchRam = new Uint8Array(board.hasSuperMagicCardFeatures ? SCRATCH_RAM_SIZE : 0);
    this.maximumPrgBank = this.prgMemory.byteLength / PRG_BANK_SIZE - 1;
    this.initialPrgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgMemory.fill(0);
    this.prgMemory.set(this.cartridge.prgRom);
    this.chrMemory.fill(0);
    this.chrMemory.set(this.cartridge.chrRom.subarray(0, this.chrMemory.byteLength));
    this.scratchRam.fill(0);
    this.prgBanks = this.board.hasSuperMagicCardFeatures
      ? [
          this.initialPrgBankCount - 4,
          this.initialPrgBankCount - 3,
          this.initialPrgBankCount - 2,
          this.initialPrgBankCount - 1,
        ]
      : [0, 1, 2, 3];
    this.chrRegisters = [0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0];
    this.latchMode = this.board.initialLatchMode;
    this.latchValue = 0;
    this.prgWriteProtected = true;
    this.twoScreenMirroring = true;
    this.mirroringSetting = this.cartridge.mirroringMode === NametableMirroring.Horizontal;
    this.bankingMode = this.board.hasSuperMagicCardFeatures ? "4m" : "latch";
    this.bankingModeAddressBits = this.board.hasSuperMagicCardFeatures ? 0 : 3;
    this.chr8kBank = 0;
    this.superMode = this.board.hasSuperMagicCardFeatures ? 0x47 : 0;
    this.latch0Fe = false;
    this.latch1Fe = false;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.a12High = false;
    this.fdsIrqDivider = 0;
    this.fdsIrqEnabled = false;
    this.fdsIrqPending = false;
    this.applyMirroring();
    this.loadTrainer();
    this.interruptPort.setMapperIrq(false);
  }

  powerOnCpuEntry():
    { readonly address: number; readonly returnsToResetVector: boolean } | undefined {
    if (this.cartridge.trainerByteLength === 0) return undefined;
    return {
      address: this.board.trainerReturnsToResetVector
        ? this.board.trainerLoadAddress + 3
        : this.board.trainerLoadAddress,
      returnsToResetVector: this.board.trainerReturnsToResetVector,
    };
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.FfeMagicCard,
      board: this.board.id,
      prgBanks: [...this.prgBanks],
      chrRegisters: [...this.chrRegisters],
      latchMode: this.latchMode,
      latchValue: this.latchValue,
      prgWriteProtected: this.prgWriteProtected,
      twoScreenMirroring: this.twoScreenMirroring,
      mirroringSetting: this.mirroringSetting,
      bankingMode: this.bankingMode,
      bankingModeAddressBits: this.bankingModeAddressBits,
      chr8kBank: this.chr8kBank,
      superMode: this.superMode,
      latch0Fe: this.latch0Fe,
      latch1Fe: this.latch1Fe,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      a12High: this.a12High,
      fdsIrqDivider: this.fdsIrqDivider,
      fdsIrqEnabled: this.fdsIrqEnabled,
      fdsIrqPending: this.fdsIrqPending,
      mirroring: this.cartridge.mirroringMode,
      scratchRam: this.scratchRam.slice(),
      prgMemory: this.prgMemory.slice(),
      chrMemory: this.chrMemory.slice(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.FfeMagicCard) {
      throw new Error(`Cannot restore ${state.kind} state into FFE Magic Card`);
    }
    if (
      state.board !== this.board.id ||
      !isFixedByteArray(state.prgBanks, 4) ||
      state.prgBanks.some((bank) => bank > this.maximumPrgBank) ||
      !isFixedByteArray(state.chrRegisters, 12) ||
      !Number.isInteger(state.latchMode) ||
      state.latchMode < 0 ||
      state.latchMode > 7 ||
      !isByte(state.latchValue) ||
      !areBooleans(
        state.prgWriteProtected,
        state.twoScreenMirroring,
        state.mirroringSetting,
        state.latch0Fe,
        state.latch1Fe,
        state.irqEnabled,
        state.irqPending,
        state.a12High,
        state.fdsIrqEnabled,
        state.fdsIrqPending,
      ) ||
      !BANKING_MODES.some((mode) => mode === state.bankingMode) ||
      !Number.isInteger(state.bankingModeAddressBits) ||
      state.bankingModeAddressBits < 0 ||
      state.bankingModeAddressBits > 3 ||
      !Number.isInteger(state.chr8kBank) ||
      state.chr8kBank < 0 ||
      state.chr8kBank > 3 ||
      !isByte(state.superMode) ||
      !isWord(state.irqCounter) ||
      !Number.isInteger(state.fdsIrqDivider) ||
      state.fdsIrqDivider < 0 ||
      state.fdsIrqDivider >= FDS_IRQ_MASTER_CYCLES ||
      !this.acceptsMirroring(state.mirroring) ||
      !(state.scratchRam instanceof Uint8Array) ||
      state.scratchRam.byteLength !== this.scratchRam.byteLength ||
      !(state.prgMemory instanceof Uint8Array) ||
      state.prgMemory.byteLength !== this.prgMemory.byteLength ||
      !(state.chrMemory instanceof Uint8Array) ||
      state.chrMemory.byteLength !== this.chrMemory.byteLength ||
      (!this.board.hasSuperMagicCardFeatures &&
        (state.superMode !== 0 ||
          state.irqEnabled ||
          state.irqPending ||
          state.a12High ||
          state.bankingMode === "4m")) ||
      (this.board.hasSuperMagicCardFeatures &&
        (state.fdsIrqDivider !== 0 || state.fdsIrqEnabled || state.fdsIrqPending))
    ) {
      throw new RangeError("FFE Magic Card save state contains invalid memory or register state");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrRegisters = [...state.chrRegisters];
    this.latchMode = state.latchMode;
    this.latchValue = state.latchValue;
    this.prgWriteProtected = state.prgWriteProtected;
    this.twoScreenMirroring = state.twoScreenMirroring;
    this.mirroringSetting = state.mirroringSetting;
    this.bankingMode = state.bankingMode;
    this.bankingModeAddressBits = state.bankingModeAddressBits;
    this.chr8kBank = state.chr8kBank;
    this.superMode = state.superMode;
    this.latch0Fe = state.latch0Fe;
    this.latch1Fe = state.latch1Fe;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.a12High = state.a12High;
    this.fdsIrqDivider = state.fdsIrqDivider;
    this.fdsIrqEnabled = state.fdsIrqEnabled;
    this.fdsIrqPending = state.fdsIrqPending;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.scratchRam.set(state.scratchRam);
    this.prgMemory.set(state.prgMemory);
    this.chrMemory.set(state.chrMemory);
    this.updateIrqLine();
  }

  observeCpuBusCycle(_: boolean): void {
    if (this.board.hasSuperMagicCardFeatures) {
      if (this.irqEnabled && !this.irqUsesPpuA12()) this.clockSuperIrq();
      return;
    }
    if (!this.fdsIrqEnabled) return;
    this.fdsIrqDivider += MASTER_CYCLES_PER_CPU;
    if (this.fdsIrqDivider >= FDS_IRQ_MASTER_CYCLES) {
      this.fdsIrqDivider -= FDS_IRQ_MASTER_CYCLES;
      this.fdsIrqPending = true;
      this.updateIrqLine();
    }
  }

  observePpuAddress(address: number): void {
    if (!this.board.hasSuperMagicCardFeatures) return;
    const a12 = (address & 0x1000) !== 0;
    if (this.irqEnabled && this.irqUsesPpuA12() && !this.a12High && a12) {
      this.clockSuperIrq();
    }
    this.a12High = a12;
  }

  observePpuRead(address: number): void {
    if (!this.mmc4ModeEnabled()) return;
    if (address >= 0x0fd8 && address <= 0x0fdf) this.latch0Fe = false;
    else if (address >= 0x0fe8 && address <= 0x0fef) this.latch0Fe = true;
    else if (address >= 0x1fd8 && address <= 0x1fdf) this.latch1Fe = false;
    else if (address >= 0x1fe8 && address <= 0x1fef) this.latch1Fe = true;
  }

  read(address: number): number {
    if (address < 0x2000) return this.chrMemory[this.chrOffset(address)] ?? 0;
    if (address >= 0x8000) return this.prgMemory[this.prgOffset(address)] ?? 0;
    if (address >= 0x6000) return this.readWorkWindow(address);
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x6000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      if (this.chrMemoryWritable()) this.chrMemory[this.chrOffset(address)] = value;
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      this.writeWorkWindow(address, value);
      return;
    }
    if (address < 0x8000) return;

    const slot = (address - 0x8000) >>> 13;
    this.prgBanks[slot] = (value >>> 2) & this.maximumPrgBank;
    this.chr8kBank = value & 0x03;
    if (!this.prgWriteProtected) {
      this.prgMemory[this.prgOffset(address)] = value;
    } else if (this.bankingMode === "latch") {
      this.latchValue = value;
    }
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (!this.board.hasSuperMagicCardFeatures) return undefined;
    if (address === 0x4500) return { value: this.readStateRegister1(), drivenMask: 0xff };
    if (address === 0x4501) return { value: this.readStateRegister2(), drivenMask: 0xff };
    if (address >= 0x5000 && address < 0x6000) {
      return { value: this.scratchRam[address - 0x5000] ?? 0, drivenMask: 0xff };
    }
    return undefined;
  }

  writeCpuExpansion(address: number, value: number): void {
    if (!this.board.hasSuperMagicCardFeatures && address === 0x4024) {
      this.fdsIrqPending = false;
      this.updateIrqLine();
      return;
    }
    if (!this.board.hasSuperMagicCardFeatures && address === 0x4025) {
      this.fdsIrqEnabled = (value & 0x80) !== 0;
      if (!this.fdsIrqEnabled) {
        this.fdsIrqPending = false;
        this.fdsIrqDivider = 0;
        this.updateIrqLine();
      }
      return;
    }
    if (address >= 0x42fc && address <= 0x42ff) {
      this.writeOneMegabitMode(address, value);
      return;
    }
    if (address >= 0x43fc && address <= 0x43ff) {
      this.writePrgBankingMode(address, value);
      return;
    }
    if (!this.board.hasSuperMagicCardFeatures) return;
    if (address >= 0x5000 && address < 0x6000) {
      this.scratchRam[address - 0x5000] = value;
      return;
    }
    if (address < 0x4500 || address > 0x451b) return;
    this.cacheSuperRegister(address, value);
    if (address === 0x4500) {
      this.superMode = value;
    } else if (address === 0x4501) {
      this.irqEnabled = false;
      this.irqPending = false;
      this.updateIrqLine();
    } else if (address === 0x4502) {
      this.irqCounter = (this.irqCounter & 0xff00) | value;
      this.irqPending = false;
      this.updateIrqLine();
    } else if (address === 0x4503) {
      this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
      this.irqEnabled = true;
      this.irqPending = false;
      this.updateIrqLine();
    } else if (address >= 0x4504 && address <= 0x4507) {
      this.prgBanks[address - 0x4504] = value & this.maximumPrgBank;
    } else if (address >= 0x4510) {
      this.chrRegisters[address - 0x4510] = value;
    }
  }

  readNametable(address: number): number | undefined {
    if (!this.usesChrNametables()) return undefined;
    return this.chrMemory[this.nametableOffset(address)] ?? 0;
  }

  writeNametable(address: number, value: number): boolean {
    if (!this.usesChrNametables()) return false;
    if (this.chrMemoryWritable()) this.chrMemory[this.nametableOffset(address)] = value;
    return true;
  }

  private writeOneMegabitMode(address: number, value: number): void {
    this.twoScreenMirroring = (address & 1) !== 0;
    this.prgWriteProtected = (address & 2) !== 0;
    this.mirroringSetting = (value & 0x10) !== 0;
    this.latchMode = (value >>> 5) & 0x07;
    this.applyMirroring();
  }

  private writePrgBankingMode(address: number, value: number): void {
    this.bankingModeAddressBits = address & 3;
    this.bankingMode =
      (address & 1) !== 0
        ? "latch"
        : (address & 2) !== 0 || !this.board.hasSuperMagicCardFeatures
          ? "2m"
          : "4m";
    this.chr8kBank = value & 0x03;
  }

  private readStateRegister1(): number {
    return (
      (this.twoScreenMirroring ? 1 : 0) |
      (this.prgWriteProtected ? 2 : 0) |
      (this.mirroringSetting ? 4 : 0) |
      (this.latchMode << 3)
    );
  }

  private readStateRegister2(): number {
    return this.bankingModeAddressBits | ((this.latchValue & 0x3f) << 2);
  }

  private applyMirroring(): void {
    this.cartridge.mirroringMode = this.twoScreenMirroring
      ? this.mirroringSetting
        ? NametableMirroring.Horizontal
        : NametableMirroring.Vertical
      : this.mirroringSetting
        ? NametableMirroring.SingleScreenUpper
        : NametableMirroring.SingleScreenLower;
  }

  private readWorkWindow(address: number): number {
    if (this.guiPrgWindowSelected()) {
      const bank = this.prgBanks[3] ?? 0;
      return this.prgMemory[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    return this.cartridge.readPrgRam(this.workRamOffset(address));
  }

  private writeWorkWindow(address: number, value: number): void {
    if (this.guiPrgWindowSelected()) {
      const bank = this.prgBanks[3] ?? 0;
      this.prgMemory[bank * PRG_BANK_SIZE + (address & 0x1fff)] = value;
    } else {
      this.cartridge.writePrgRam(this.workRamOffset(address), value);
    }
  }

  private guiPrgWindowSelected(): boolean {
    return (
      this.board.hasSuperMagicCardFeatures &&
      (this.superMode & 0x40) === 0 &&
      !this.prgWriteProtected
    );
  }

  private workRamOffset(address: number): number {
    const bank = this.board.hasSuperMagicCardFeatures ? (this.superMode >>> 4) & 3 : 0;
    return bank * WRAM_BANK_SIZE + (address - 0x6000);
  }

  private prgOffset(address: number): number {
    if (this.bankingMode !== "latch") {
      const slot = (address - 0x8000) >>> 13;
      return (this.prgBanks[slot] ?? 0) * PRG_BANK_SIZE + (address & 0x1fff);
    }
    const half = address < 0xc000 ? 0 : 1;
    switch (this.latchMode) {
      case 0:
        return (half === 0 ? this.latchValue & 0x07 : 7) * 0x4000 + (address & 0x3fff);
      case 1:
        return (half === 0 ? (this.latchValue >>> 2) & 0x0f : 7) * 0x4000 + (address & 0x3fff);
      case 2:
        return (half === 0 ? this.latchValue & 0x0f : 15) * 0x4000 + (address & 0x3fff);
      case 3:
        return (half === 0 ? 15 : this.latchValue & 0x0f) * 0x4000 + (address & 0x3fff);
      case 4:
        return ((this.latchValue >>> 4) & 3) * 0x8000 + (address & 0x7fff);
      default:
        return 3 * 0x8000 + (address & 0x7fff);
    }
  }

  private chrOffset(address: number): number {
    if (!this.oneKiBChrModeEnabled()) {
      return this.activeChr8kBank() * 0x2000 + (address & 0x1fff);
    }
    if (!this.mmc4ModeEnabled()) {
      const bank = this.chrRegisters[address >>> 10] ?? 0;
      return bank * CHR_BANK_SIZE + (address & 0x03ff);
    }
    const half = address >>> 12;
    const latchFe = half === 0 ? this.latch0Fe : this.latch1Fe;
    const register = half * 4 + (latchFe ? 2 : 0) + ((address >>> 10) & 1);
    const bank = ((this.chrRegisters[register] ?? 0) & 0xfc) | ((address >>> 10) & 3);
    return bank * CHR_BANK_SIZE + (address & 0x03ff);
  }

  private activeChr8kBank(): number {
    if (this.bankingMode !== "latch") return this.chr8kBank;
    switch (this.latchMode) {
      case 1:
      case 4:
      case 5:
        return this.latchValue & 3;
      case 3:
        return (this.latchValue >>> 4) & 3;
      case 6:
        return this.latchValue & 1;
      default:
        return 0;
    }
  }

  private oneKiBChrModeEnabled(): boolean {
    return this.board.hasSuperMagicCardFeatures && (this.superMode & 1) !== 0;
  }

  private mmc4ModeEnabled(): boolean {
    return this.oneKiBChrModeEnabled() && (this.superMode & 0x04) === 0;
  }

  private usesChrNametables(): boolean {
    return this.board.hasSuperMagicCardFeatures && (this.superMode & 0x02) === 0;
  }

  private chrMemoryWritable(): boolean {
    return this.latchMode < 4;
  }

  private nametableOffset(address: number): number {
    const slot = ((address - 0x2000) & 0x0fff) >>> 10;
    const bank = this.chrRegisters[8 + slot] ?? 0;
    return bank * CHR_BANK_SIZE + (address & 0x03ff);
  }

  private irqUsesPpuA12(): boolean {
    return (this.superMode & 0x08) !== 0;
  }

  private clockSuperIrq(): void {
    this.irqCounter = (this.irqCounter + 1) & 0xffff;
    if (this.irqCounter === 0) {
      this.irqPending = true;
      this.updateIrqLine();
    }
  }

  private updateIrqLine(): void {
    this.interruptPort.setMapperIrq(this.irqPending || this.fdsIrqPending);
  }

  private cacheSuperRegister(address: number, value: number): void {
    const index = 0x500 + (address - 0x4500);
    if (index < this.scratchRam.byteLength) this.scratchRam[index] = value;
  }

  private loadTrainer(): void {
    if (this.cartridge.trainerByteLength === 0) return;
    if (this.board.trainerLoadAddress >= 0x6000) {
      const offset = this.board.trainerLoadAddress - 0x6000;
      for (let index = 0; index < this.cartridge.trainerByteLength; index++) {
        this.cartridge.writePrgRam(offset + index, this.cartridge.readTrainer(index));
      }
      return;
    }
    const offset = this.board.trainerLoadAddress - 0x5000;
    for (let index = 0; index < this.cartridge.trainerByteLength; index++) {
      this.scratchRam[offset + index] = this.cartridge.readTrainer(index);
    }
  }

  private acceptsMirroring(value: number): boolean {
    return (
      value === NametableMirroring.Vertical ||
      value === NametableMirroring.Horizontal ||
      value === NametableMirroring.SingleScreenLower ||
      value === NametableMirroring.SingleScreenUpper
    );
  }
}
