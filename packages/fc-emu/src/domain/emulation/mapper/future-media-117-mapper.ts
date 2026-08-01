import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const A12_LOW_FILTER_PPU_CYCLES = 10;

/** iNES mapper 117: Future Media banking and one-shot filtered-A12 IRQ. */
export class FutureMedia117Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnMirroring: NametableMirroring;
  private prgBanks = [0xfc, 0xfd, 0xfe, 0xff];
  private chrBanks = [0, 1, 2, 3, 4, 5, 6, 7];
  private irqLatch = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqArmed = false;
  private irqPending = false;
  private ppuClock = 0;
  private a12High = false;
  private a12LowSince = 0;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks = [0xfc, 0xfd, 0xfe, 0xff];
    this.chrBanks = [0, 1, 2, 3, 4, 5, 6, 7];
    this.irqLatch = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqArmed = false;
    this.irqPending = false;
    this.ppuClock = 0;
    this.a12High = false;
    this.a12LowSince = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.FutureMedia117,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqArmed: this.irqArmed,
      irqPending: this.irqPending,
      ppuClock: this.ppuClock,
      a12High: this.a12High,
      a12LowSince: this.a12LowSince,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.FutureMedia117) {
      throw new Error(`Cannot restore ${state.kind} state into Future Media mapper 117`);
    }
    if (
      !isFixedByteArray(state.prgBanks, 4) ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !isByte(state.irqLatch) ||
      !isByte(state.irqCounter) ||
      !Number.isSafeInteger(state.ppuClock) ||
      state.ppuClock < 0 ||
      !Number.isSafeInteger(state.a12LowSince) ||
      state.a12LowSince < 0 ||
      state.a12LowSince > state.ppuClock ||
      !areBooleans(state.irqEnabled, state.irqArmed, state.irqPending, state.a12High) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("Future Media mapper 117 state contains invalid registers or IRQ state");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.irqLatch = state.irqLatch;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqArmed = state.irqArmed;
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
    if (this.ppuClock - this.a12LowSince < A12_LOW_FILTER_PPU_CYCLES) return;
    this.clockIrqCounter();
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const bank = (this.prgBanks[slot] ?? 0) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x8000 && address <= 0x8003) {
      this.prgBanks[address & 0x03] = value;
      return;
    }
    if (address >= 0xa000 && address <= 0xa007) {
      this.chrBanks[address & 0x07] = value;
      return;
    }
    switch (address) {
      case 0xc001:
        this.irqLatch = value;
        break;
      case 0xc002:
        this.acknowledgeIrq();
        break;
      case 0xc003:
        this.irqCounter = this.irqLatch;
        this.irqArmed = true;
        break;
      case 0xd000:
        this.cartridge.mirroringMode =
          (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
      case 0xe000:
        this.irqEnabled = (value & 1) !== 0;
        this.acknowledgeIrq();
        break;
    }
  }

  private clockIrqCounter(): void {
    if (!this.irqEnabled || !this.irqArmed || this.irqCounter === 0) return;
    this.irqCounter--;
    if (this.irqCounter !== 0) return;
    this.irqArmed = false;
    this.irqPending = true;
    this.interruptPort.setMapperIrq(true);
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
