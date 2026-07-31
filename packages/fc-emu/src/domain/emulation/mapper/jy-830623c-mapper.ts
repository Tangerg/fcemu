import type Cartridge from "../../model/cartridge.js";
import type { NametableMirroring } from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mapper91Banking } from "./mapper91-banking.js";
import { areBooleans } from "./state-validation.js";

const IRQ_RISE_COUNT = 64;

/** Mapper 91 submapper 0: JY830623C/YY840238C with an unfiltered PPU-A12 IRQ. */
export class Jy830623cMapper implements Mapper {
  private readonly banking: Mapper91Banking;
  private readonly powerOnMirroring: NametableMirroring;
  private irqRiseCounter = 0;
  private irqEnabled = false;
  private irqPending = false;
  private a12High = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.banking = new Mapper91Banking(cartridge, true);
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.banking.powerOn();
    this.irqRiseCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.a12High = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Jy830623c,
      ...this.banking.captureState(),
      irqRiseCounter: this.irqRiseCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      a12High: this.a12High,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Jy830623c) {
      throw new Error(`Cannot restore ${state.kind} state into JY830623C`);
    }
    this.banking.validateState(state, "JY830623C");
    if (
      !Number.isInteger(state.irqRiseCounter) ||
      state.irqRiseCounter < 0 ||
      state.irqRiseCounter > IRQ_RISE_COUNT ||
      !areBooleans(state.irqEnabled, state.irqPending, state.a12High) ||
      (state.irqPending && !state.irqEnabled)
    ) {
      throw new RangeError("JY830623C save state contains invalid IRQ state");
    }
    this.banking.restoreState(state, "JY830623C");
    this.irqRiseCounter = state.irqRiseCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.a12High = state.a12High;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observePpuAddress(address: number): void {
    const nextA12High = (address & 0x1000) !== 0;
    if (!nextA12High) {
      this.a12High = false;
      return;
    }
    if (this.a12High) return;
    this.a12High = true;
    if (!this.irqEnabled || this.irqRiseCounter === IRQ_RISE_COUNT) return;
    this.irqRiseCounter++;
    if (this.irqRiseCounter === IRQ_RISE_COUNT) {
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
    if (address >= 0x8000 && address <= 0x9fff) {
      this.banking.selectOuter(address);
      return;
    }
    if (address < 0x6000 || address >= 0x8000) return;
    switch (address & 0xf003) {
      case 0x6000:
      case 0x6001:
      case 0x6002:
      case 0x6003:
        this.banking.selectChr((address & 3) as 0 | 1 | 2 | 3, value);
        break;
      case 0x7000:
      case 0x7001:
        this.banking.selectPrg((address & 1) as 0 | 1, value);
        break;
      case 0x7002:
        this.stopIrq();
        break;
      case 0x7003:
        this.irqRiseCounter = 0;
        this.irqEnabled = true;
        break;
    }
  }

  private stopIrq(): void {
    this.irqRiseCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
