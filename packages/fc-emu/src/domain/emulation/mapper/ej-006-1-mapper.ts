import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mapper91Banking } from "./mapper91-banking.js";
import { areBooleans } from "./state-validation.js";

/** Mapper 91 submapper 1: EJ-006-1 with selectable mirroring and an M2 IRQ. */
export class Ej0061Mapper implements Mapper {
  private readonly banking: Mapper91Banking;
  private readonly powerOnMirroring: NametableMirroring;
  private irqCounter = 0;
  private irqDivider = 0;
  private irqEnabled = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.banking = new Mapper91Banking(cartridge, false);
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.banking.powerOn();
    this.irqCounter = 0;
    this.irqDivider = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Ej0061,
      ...this.banking.captureState(),
      irqCounter: this.irqCounter,
      irqDivider: this.irqDivider,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Ej0061) {
      throw new Error(`Cannot restore ${state.kind} state into EJ-006-1`);
    }
    this.banking.validateState(state, "EJ-006-1");
    if (
      !isWord(state.irqCounter) ||
      !Number.isInteger(state.irqDivider) ||
      state.irqDivider < 0 ||
      state.irqDivider > 3 ||
      !areBooleans(state.irqEnabled, state.irqPending) ||
      (state.irqPending && !state.irqEnabled) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("EJ-006-1 save state contains invalid IRQ or mirroring state");
    }
    this.banking.restoreState(state, "EJ-006-1");
    this.irqCounter = state.irqCounter;
    this.irqDivider = state.irqDivider;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqEnabled) return;
    this.irqDivider++;
    if (this.irqDivider < 4) return;
    this.irqDivider = 0;
    const previous = this.irqCounter;
    this.irqCounter = (this.irqCounter - 5) & 0xffff;
    if (previous < 5) {
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
    if (address < 0x2000) {
      this.banking.writeChr(address, value);
      return;
    }
    if (address < 0x6000 || address >= 0x8000) return;
    switch (address & 0xf007) {
      case 0x6000:
      case 0x6001:
      case 0x6002:
      case 0x6003:
        this.banking.selectChr((address & 3) as 0 | 1 | 2 | 3, value);
        break;
      case 0x6004:
        this.cartridge.mirroringMode = NametableMirroring.Horizontal;
        break;
      case 0x6005:
        this.cartridge.mirroringMode = NametableMirroring.Vertical;
        break;
      case 0x6006:
        this.irqCounter = (this.irqCounter & 0xff00) | value;
        break;
      case 0x6007:
        this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
        break;
      case 0x7000:
      case 0x7001:
        this.banking.selectPrg((address & 1) as 0 | 1, value);
        break;
      case 0x7006:
        this.stopIrq();
        break;
      case 0x7007:
        this.irqDivider = 0;
        this.irqEnabled = true;
        break;
    }
  }

  private stopIrq(): void {
    this.irqDivider = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
