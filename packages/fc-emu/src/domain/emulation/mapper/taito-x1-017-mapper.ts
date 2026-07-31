import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";
import { TaitoX1Banking } from "./taito-x1-banking.js";

const MAXIMUM_IRQ_COUNTER = (0xff + 2) * 16;
const RAM_ENABLE_VALUES = [0xca, 0x69, 0x84] as const;

/** iNES mapper 82: historical bank-order representation of Taito's X1-017 ASIC. */
export class TaitoX1017Mapper implements Mapper {
  private readonly banking: TaitoX1Banking;
  private readonly powerOnMirroring: NametableMirroring;
  private chrRegisters = [0, 0, 0, 0, 0, 0];
  private chrMode = 0;
  private ramPermissions = [0, 0, 0];
  private irqLatch = 0;
  private irqCounter = 17;
  private irqCounting = false;
  private irqOutputEnabled = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.banking = new TaitoX1Banking(cartridge);
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.banking.powerOn();
    this.chrRegisters.fill(0);
    this.chrMode = 0;
    this.ramPermissions.fill(0);
    this.irqLatch = 0;
    this.irqCounter = 17;
    this.irqCounting = false;
    this.irqOutputEnabled = false;
    this.irqPending = false;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.TaitoX1017,
      prgBanks: this.banking.capturePrgBanks(),
      chrRegisters: [...this.chrRegisters],
      chrMode: this.chrMode,
      ramPermissions: [...this.ramPermissions],
      irqLatch: this.irqLatch,
      irqCounter: this.irqCounter,
      irqCounting: this.irqCounting,
      irqOutputEnabled: this.irqOutputEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TaitoX1017) {
      throw new Error(`Cannot restore ${state.kind} state into Taito X1-017`);
    }
    this.banking.validatePrgBanks(state.prgBanks, "Taito X1-017");
    if (
      !isFixedByteArray(state.chrRegisters, 6) ||
      !isBit(state.chrMode) ||
      !isFixedByteArray(state.ramPermissions, 3) ||
      !isByte(state.irqLatch) ||
      !Number.isInteger(state.irqCounter) ||
      state.irqCounter < 0 ||
      state.irqCounter > MAXIMUM_IRQ_COUNTER ||
      !areBooleans(state.irqCounting, state.irqOutputEnabled, state.irqPending) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("Taito X1-017 save state contains invalid register or IRQ state");
    }
    this.banking.powerOn();
    this.banking.restorePrgBanks(state.prgBanks, "Taito X1-017");
    this.chrRegisters = [...state.chrRegisters];
    this.chrMode = state.chrMode;
    this.updateChrBanks();
    this.ramPermissions = [...state.ramPermissions];
    this.irqLatch = state.irqLatch;
    this.irqCounter = state.irqCounter;
    this.irqCounting = state.irqCounting;
    this.irqOutputEnabled = state.irqOutputEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring;
    this.updateIrqLine();
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqCounting || this.irqCounter === 0) return;
    this.irqCounter--;
    if (this.irqCounter === 0) {
      this.irqPending = true;
      this.updateIrqLine();
    }
  }

  readCpuRegisterOpenBus(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    return address >= 0x4000 && address <= 0x4014 ? { value: 0, drivenMask: 0xff } : undefined;
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    return address >= 0x4018 && address < 0x6000 ? { value: 0, drivenMask: 0xff } : undefined;
  }

  read(address: number): number {
    const ramRegion = this.ramRegion(address);
    if (ramRegion !== undefined) {
      return this.ramEnabled(ramRegion) ? this.cartridge.readPrgRam(address - 0x6000) : 0;
    }
    return this.banking.read(address);
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x6000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    const ramRegion = this.ramRegion(address);
    if (ramRegion !== undefined) {
      if (this.ramEnabled(ramRegion)) this.cartridge.writePrgRam(address - 0x6000, value);
      return;
    }
    if (address < 0x7ef0 || address > 0x7eff) return;
    if (address <= 0x7ef5) {
      this.chrRegisters[address - 0x7ef0] = value;
      this.updateChrBanks();
      return;
    }
    switch (address) {
      case 0x7ef6:
        this.cartridge.mirroringMode =
          (value & 1) === 0 ? NametableMirroring.Horizontal : NametableMirroring.Vertical;
        this.chrMode = (value >>> 1) & 1;
        this.updateChrBanks();
        break;
      case 0x7ef7:
      case 0x7ef8:
      case 0x7ef9:
        this.ramPermissions[address - 0x7ef7] = value;
        break;
      case 0x7efa:
      case 0x7efb:
      case 0x7efc:
        this.banking.selectPrg((address - 0x7efa) as 0 | 1 | 2, value >>> 2);
        break;
      case 0x7efd:
        this.irqLatch = value;
        break;
      case 0x7efe:
        this.irqCounting = (value & 0x05) === 0x01;
        this.irqOutputEnabled = (value & 0x02) !== 0;
        if (!this.irqCounting) this.irqCounter = this.controlReloadValue();
        this.updateIrqLine();
        break;
      case 0x7eff:
        this.irqPending = false;
        this.irqCounter = this.acknowledgeReloadValue();
        this.updateIrqLine();
        break;
    }
  }

  private updateChrBanks(): void {
    const pairBase = this.chrMode === 0 ? 0 : 4;
    const smallBase = this.chrMode === 0 ? 4 : 0;
    this.banking.selectChrPair(pairBase as 0 | 4, this.chrRegisters[0] ?? 0, true);
    this.banking.selectChrPair((pairBase + 2) as 2 | 6, this.chrRegisters[1] ?? 0, true);
    for (let register = 2; register < 6; register++) {
      this.banking.selectChr(
        (smallBase + register - 2) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        this.chrRegisters[register] ?? 0,
      );
    }
  }

  private ramRegion(address: number): 0 | 1 | 2 | undefined {
    if (address >= 0x6000 && address <= 0x67ff) return 0;
    if (address >= 0x6800 && address <= 0x6fff) return 1;
    if (address >= 0x7000 && address <= 0x73ff) return 2;
    return undefined;
  }

  private ramEnabled(region: 0 | 1 | 2): boolean {
    return this.ramPermissions[region] === RAM_ENABLE_VALUES[region];
  }

  private controlReloadValue(): number {
    return this.irqLatch === 0 ? 17 : (this.irqLatch + 2) * 16;
  }

  private acknowledgeReloadValue(): number {
    return this.irqLatch === 0 ? 1 : (this.irqLatch + 1) * 16;
  }

  private updateIrqLine(): void {
    this.interruptPort.setMapperIrq(this.irqPending && this.irqOutputEnabled);
  }
}
