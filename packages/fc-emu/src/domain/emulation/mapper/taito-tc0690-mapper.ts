import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans } from "./state-validation.js";
import { TaitoTc0x90Banking } from "./taito-tc0x90-banking.js";

const A12_LOW_FILTER_PPU_CYCLES = 10;

export type TaitoTc0690IrqRevision = "original" | "late";

/**
 * iNES mapper 48: Taito TC0690.
 *
 * Banking is shared with TC0190, while a filtered PPU-A12 counter supplies
 * MMC3-shaped scanline IRQs. Known chip revisions differ in counter bias and
 * propagation delay, represented explicitly by NES 2.0 submapper.
 */
export class TaitoTc0690Mapper implements Mapper {
  private readonly banking: TaitoTc0x90Banking;
  private reload = 0;
  private counter = 0;
  private reloadPending = false;
  private irqEnabled = false;
  private irqDelay = 0;
  private irqPending = false;
  private ppuClock = 0;
  private a12High = false;
  private a12LowSince = 0;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly revision: TaitoTc0690IrqRevision,
  ) {
    this.banking = new TaitoTc0x90Banking(cartridge);
    this.powerOn();
  }

  powerOn(): void {
    this.banking.powerOn();
    this.reload = 0;
    this.counter = 0;
    this.reloadPending = false;
    this.irqEnabled = false;
    this.irqDelay = 0;
    this.irqPending = false;
    this.ppuClock = 0;
    this.a12High = false;
    this.a12LowSince = 0;
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.TaitoTc0690,
      ...this.banking.captureState(),
      reload: this.reload,
      counter: this.counter,
      reloadPending: this.reloadPending,
      irqEnabled: this.irqEnabled,
      irqDelay: this.irqDelay,
      irqPending: this.irqPending,
      ppuClock: this.ppuClock,
      a12High: this.a12High,
      a12LowSince: this.a12LowSince,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TaitoTc0690) {
      throw new Error(`Cannot restore ${state.kind} state into Taito TC0690`);
    }
    this.banking.validateState(state, "Taito TC0690");
    const maximumDelay = this.revision === "late" ? 6 : 22;
    if (
      !isByte(state.reload) ||
      !isByte(state.counter) ||
      !Number.isInteger(state.irqDelay) ||
      state.irqDelay < 0 ||
      state.irqDelay > maximumDelay ||
      !Number.isSafeInteger(state.ppuClock) ||
      state.ppuClock < 0 ||
      !Number.isSafeInteger(state.a12LowSince) ||
      state.a12LowSince < 0 ||
      state.a12LowSince > state.ppuClock ||
      !areBooleans(state.reloadPending, state.irqEnabled, state.irqPending, state.a12High) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("Taito TC0690 save state contains invalid IRQ or mirroring state");
    }
    this.banking.restoreState(state, "Taito TC0690");
    this.reload = state.reload;
    this.counter = state.counter;
    this.reloadPending = state.reloadPending;
    this.irqEnabled = state.irqEnabled;
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
    if (this.ppuClock - this.a12LowSince < A12_LOW_FILTER_PPU_CYCLES) return;
    this.clockIrqCounter();
  }

  observeCpuBusCycle(_: boolean): void {
    if (this.irqDelay === 0) return;
    this.irqDelay--;
    if (this.irqDelay === 0) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  read(address: number): number {
    return this.banking.read(address);
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    switch (address & 0xe003) {
      case 0x8000:
        this.banking.selectPrg(0, value);
        break;
      case 0x8001:
        this.banking.selectPrg(1, value);
        break;
      case 0x8002:
      case 0x8003:
        this.banking.selectLargeChr((address & 1) as 0 | 1, value);
        break;
      case 0xa000:
      case 0xa001:
      case 0xa002:
      case 0xa003:
        this.banking.selectSmallChr((address & 3) as 0 | 1 | 2 | 3, value);
        break;
      case 0xc000:
        this.acknowledgeIrq();
        this.reload = ((value ^ 0xff) + (this.revision === "late" ? 1 : 0)) & 0xff;
        break;
      case 0xc001:
        this.acknowledgeIrq();
        this.counter = 0;
        this.reloadPending = true;
        break;
      case 0xc002:
        this.irqEnabled = true;
        break;
      case 0xc003:
        this.irqEnabled = false;
        this.acknowledgeIrq();
        break;
      case 0xe000:
        this.cartridge.mirroringMode =
          (value & 0x40) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
    }
  }

  private clockIrqCounter(): void {
    if (this.counter === 0 || this.reloadPending) this.counter = this.reload;
    else this.counter--;
    this.reloadPending = false;
    if (this.counter === 0 && this.irqEnabled) {
      this.irqDelay = this.revision === "late" ? 6 : 22;
    }
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
