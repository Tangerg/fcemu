import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const A12_LOW_FILTER_PPU_CYCLES = 10;
const CPU_IRQ_DIVIDER = 4;
const IRQ_PROPAGATION_CYCLES = 4;

/**
 * iNES mapper 64: Tengen 800032 with the RAMBO-1 ASIC.
 *
 * RAMBO-1 resembles MMC3 at the register boundary, but its extra PRG/CHR
 * registers and dual-clock IRQ circuit are distinct hardware and remain a
 * separate mapper rather than configuration flags on the MMC3 implementation.
 */
export class Rambo1Mapper implements Mapper {
  private registers = Array.from({ length: 16 }, () => 0);
  private bankSelect = 0;
  private irqReload = 0;
  private irqCounter = 0;
  private irqReloadPending = false;
  private irqCycleMode = false;
  private irqEnabled = false;
  private irqDivider = 0;
  private forceCycleClock = false;
  private irqDelay = 0;
  private irqPending = false;
  private ppuClock = 0;
  private a12High = false;
  private a12LowSince = 0;
  private readonly powerOnMirroring: NametableMirroring;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.registers.fill(0);
    this.bankSelect = 0;
    this.irqReload = 0;
    this.irqCounter = 0;
    this.irqReloadPending = false;
    this.irqCycleMode = false;
    this.irqEnabled = false;
    this.irqDivider = 0;
    this.forceCycleClock = false;
    this.irqDelay = 0;
    this.irqPending = false;
    this.ppuClock = 0;
    this.a12High = false;
    this.a12LowSince = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Rambo1,
      registers: [...this.registers],
      bankSelect: this.bankSelect,
      irqReload: this.irqReload,
      irqCounter: this.irqCounter,
      irqReloadPending: this.irqReloadPending,
      irqCycleMode: this.irqCycleMode,
      irqEnabled: this.irqEnabled,
      irqDivider: this.irqDivider,
      forceCycleClock: this.forceCycleClock,
      irqDelay: this.irqDelay,
      irqPending: this.irqPending,
      ppuClock: this.ppuClock,
      a12High: this.a12High,
      a12LowSince: this.a12LowSince,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Rambo1) {
      throw new Error(`Cannot restore ${state.kind} state into RAMBO-1`);
    }
    if (
      !isFixedByteArray(state.registers, 16) ||
      state.registers.slice(10, 15).some((value) => value !== 0) ||
      !isByte(state.bankSelect) ||
      !isByte(state.irqReload) ||
      !isByte(state.irqCounter) ||
      !Number.isInteger(state.irqDivider) ||
      state.irqDivider < 0 ||
      state.irqDivider >= CPU_IRQ_DIVIDER ||
      !Number.isInteger(state.irqDelay) ||
      state.irqDelay < 0 ||
      state.irqDelay > IRQ_PROPAGATION_CYCLES ||
      !Number.isSafeInteger(state.ppuClock) ||
      state.ppuClock < 0 ||
      !Number.isSafeInteger(state.a12LowSince) ||
      state.a12LowSince < 0 ||
      state.a12LowSince > state.ppuClock ||
      !areBooleans(
        state.irqReloadPending,
        state.irqCycleMode,
        state.irqEnabled,
        state.forceCycleClock,
        state.irqPending,
        state.a12High,
      ) ||
      (state.forceCycleClock && state.irqCycleMode) ||
      (!state.irqCycleMode && !state.forceCycleClock && state.irqDivider !== 0) ||
      (state.irqPending && state.irqDelay !== 0) ||
      ((state.irqPending || state.irqDelay > 0) && !state.irqEnabled) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("RAMBO-1 save state contains invalid register or timing state");
    }
    this.registers = [...state.registers];
    this.bankSelect = state.bankSelect;
    this.irqReload = state.irqReload;
    this.irqCounter = state.irqCounter;
    this.irqReloadPending = state.irqReloadPending;
    this.irqCycleMode = state.irqCycleMode;
    this.irqEnabled = state.irqEnabled;
    this.irqDivider = state.irqDivider;
    this.forceCycleClock = state.forceCycleClock;
    this.irqDelay = state.irqDelay;
    this.irqPending = state.irqPending;
    this.ppuClock = state.ppuClock;
    this.a12High = state.a12High;
    this.a12LowSince = state.a12LowSince;
    this.cartridge.mirroringMode = state.mirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  tickPpu(): void {
    this.ppuClock++;
  }

  observePpuAddress(address: number): void {
    const nextA12High = (address & 0x1000) !== 0;
    if (!nextA12High) {
      if (this.a12High) this.a12LowSince = this.ppuClock;
      this.a12High = false;
      return;
    }
    if (this.a12High) return;
    this.a12High = true;
    if (this.irqCycleMode || this.ppuClock - this.a12LowSince < A12_LOW_FILTER_PPU_CYCLES) {
      return;
    }
    this.clockIrqCounter();
  }

  observeCpuBusCycle(_: boolean): void {
    this.advanceIrqOutput();

    if (!this.irqCycleMode && !this.forceCycleClock) return;
    this.irqDivider++;
    if (this.irqDivider < CPU_IRQ_DIVIDER) return;
    this.irqDivider = 0;
    this.clockIrqCounter();
    this.forceCycleClock = false;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = this.chrBank(address) % (this.cartridge.chrMemoryBytes / CHR_BANK_SIZE);
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const bank = this.prgBank(address) % (this.cartridge.prgRom.byteLength / PRG_BANK_SIZE);
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
        this.bankSelect = value;
        break;
      case 0x8001:
        this.writeBankData(value);
        break;
      case 0xa000:
        this.cartridge.mirroringMode =
          (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
      case 0xa001:
        break;
      case 0xc000:
        this.irqReload = value;
        break;
      case 0xc001:
        this.selectIrqMode(value);
        break;
      case 0xe000:
        this.disableIrq();
        break;
      case 0xe001:
        this.irqEnabled = true;
        break;
    }
  }

  private writeBankData(value: number): void {
    const register = this.bankSelect & 0x0f;
    if (register <= 9 || register === 15) this.registers[register] = value;
  }

  private prgBank(address: number): number {
    const slot = (address - 0x8000) >>> 13;
    if (slot === 3) return this.cartridge.prgRom.byteLength / PRG_BANK_SIZE - 1;
    if ((this.bankSelect & 0x40) === 0) {
      if (slot === 0) return this.registers[6] ?? 0;
      if (slot === 1) return this.registers[7] ?? 0;
      return this.registers[15] ?? 0;
    }
    if (slot === 0) return this.registers[15] ?? 0;
    if (slot === 1) return this.registers[7] ?? 0;
    return this.registers[6] ?? 0;
  }

  private chrBank(address: number): number {
    const slot = (address >>> 10) ^ ((this.bankSelect & 0x80) === 0 ? 0 : 4);
    if (slot >= 4) return this.registers[slot - 2] ?? 0;
    if ((this.bankSelect & 0x20) !== 0) {
      return this.registers[[0, 8, 1, 9][slot] ?? 0] ?? 0;
    }
    const register = slot >>> 1;
    return ((this.registers[register] ?? 0) & 0xfe) | (slot & 1);
  }

  private selectIrqMode(value: number): void {
    const nextCycleMode = (value & 1) !== 0;
    this.forceCycleClock = this.irqCycleMode && !nextCycleMode;
    this.irqCycleMode = nextCycleMode;
    if (nextCycleMode) this.irqDivider = 0;
    this.irqReloadPending = true;
  }

  private clockIrqCounter(): void {
    if (this.irqReloadPending) {
      this.irqCounter = this.irqReload === 0 ? 0 : this.irqReload | 1;
    } else if (this.irqCounter === 0) {
      this.irqCounter = this.irqReload;
    } else {
      this.irqCounter--;
    }
    this.irqReloadPending = false;
    if (this.irqCounter === 0 && this.irqEnabled && !this.irqPending && this.irqDelay === 0) {
      this.irqDelay = IRQ_PROPAGATION_CYCLES;
    }
  }

  private advanceIrqOutput(): void {
    if (this.irqDelay === 0) return;
    this.irqDelay--;
    if (this.irqDelay === 0) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  private disableIrq(): void {
    this.irqEnabled = false;
    this.irqDelay = 0;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
