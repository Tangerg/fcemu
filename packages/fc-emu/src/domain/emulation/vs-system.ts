import { isByte } from "./numeric-range.js";

export interface VsSystemState {
  readonly dipSwitches: number;
  readonly serviceButton: boolean;
  readonly coin1CyclesRemaining: number;
  readonly coin2CyclesRemaining: number;
  readonly coinCounterLine: boolean;
  readonly coinCounterPulses: number;
  readonly protectionIndex: number;
}

export interface VsExpansionRead {
  readonly value: number;
  readonly drivenMask: number;
}

const TKO_PROTECTION_DATA: readonly number[] = [
  0xff, 0xbf, 0xb7, 0x97, 0x97, 0x17, 0x57, 0x4f, 0x6f, 0x6b, 0xeb, 0xa9, 0xb1, 0x90, 0x94, 0x14,
  0x56, 0x4e, 0x6f, 0x6b, 0xeb, 0xa9, 0xb1, 0x90, 0xd4, 0x5c, 0x3e, 0x26, 0x87, 0x83, 0x13, 0x00,
];

const RBI_PROTECTION_DATA: readonly number[] = [
  0xff, 0xfd, 0xf5, 0xf4, 0xb4, 0xb4, 0xa6, 0x2e, 0x2f, 0x6f, 0x6f, 0x7d, 0xd5, 0xd4, 0x94, 0x94,
  0x86, 0x2e, 0x2f, 0x6f, 0x6b, 0x79, 0xd1, 0xd0, 0x92, 0x92, 0x8d, 0x65, 0x64, 0x34, 0xb0, 0xa2,
];

/**
 * Vs. UniSystem cabinet I/O and non-PPU protection.
 *
 * Cartridge banking remains mapper-owned. This device owns the cabinet-side
 * DIP/coin/service wiring, the mirrored electromechanical counter output and
 * the security devices identified by NES 2.0 header byte 13.
 */
export class VsSystem {
  private dipSwitches = 0;
  private serviceButton = false;
  private coin1CyclesRemaining = 0;
  private coin2CyclesRemaining = 0;
  private coinCounterLine = false;
  private coinCounterPulses = 0;
  private protectionIndex = 0;
  private readonly coinPulseCycles: number;

  constructor(
    readonly hardwareType: number,
    cpuFrequencyHz: number,
  ) {
    this.coinPulseCycles = Math.max(1, Math.round(cpuFrequencyHz * 0.05));
  }

  get forcesStartButton(): boolean {
    return this.hardwareType === 4;
  }

  powerOn(): void {
    this.dipSwitches = 0;
    this.serviceButton = false;
    this.coin1CyclesRemaining = 0;
    this.coin2CyclesRemaining = 0;
    this.coinCounterPulses = 0;
    this.reset();
  }

  reset(): void {
    this.coinCounterLine = false;
    this.protectionIndex = 0;
  }

  tickCpuCycles(cycles: number): void {
    this.coin1CyclesRemaining = Math.max(0, this.coin1CyclesRemaining - cycles);
    this.coin2CyclesRemaining = Math.max(0, this.coin2CyclesRemaining - cycles);
  }

  insertCoin(slot: 1 | 2): void {
    if (slot === 1) this.coin1CyclesRemaining = this.coinPulseCycles;
    else this.coin2CyclesRemaining = this.coinPulseCycles;
  }

  setServiceButton(pressed: boolean): void {
    this.serviceButton = pressed;
  }

  setDipSwitch(index: number, enabled: boolean): void {
    if (!Number.isInteger(index) || index < 1 || index > 8) {
      throw new RangeError("Vs. DIP switch index must be between 1 and 8");
    }
    const mask = 1 << (index - 1);
    this.dipSwitches = enabled ? this.dipSwitches | mask : this.dipSwitches & ~mask;
  }

  readController(port: 1 | 2, serialButton: number): number {
    if (port === 1) {
      return (
        (serialButton & 1) |
        (Number(this.serviceButton) << 2) |
        ((this.dipSwitches & 0x01) << 3) |
        ((this.dipSwitches & 0x02) << 3) |
        (Number(this.coin1CyclesRemaining > 0) << 5) |
        (Number(this.coin2CyclesRemaining > 0) << 6)
      );
    }
    return (serialButton & 1) | (this.dipSwitches & 0xfc);
  }

  readExpansion(address: number, openBus: number): VsExpansionRead | undefined {
    if (VsSystem.isCoinCounterAddress(address)) this.driveCoinCounter(openBus & 1);

    switch (this.hardwareType) {
      case 1:
        return this.readStreamProtection(address, RBI_PROTECTION_DATA, true);
      case 2:
        return this.readStreamProtection(address, TKO_PROTECTION_DATA, false);
      case 3:
        return this.readSuperXeviousProtection(address);
      default:
        return undefined;
    }
  }

  writeExpansion(address: number, value: number): void {
    if (VsSystem.isCoinCounterAddress(address)) this.driveCoinCounter(value & 1);
  }

  captureState(): VsSystemState {
    return {
      dipSwitches: this.dipSwitches,
      serviceButton: this.serviceButton,
      coin1CyclesRemaining: this.coin1CyclesRemaining,
      coin2CyclesRemaining: this.coin2CyclesRemaining,
      coinCounterLine: this.coinCounterLine,
      coinCounterPulses: this.coinCounterPulses,
      protectionIndex: this.protectionIndex,
    };
  }

  restoreState(state: VsSystemState): void {
    if (
      !isByte(state.dipSwitches) ||
      typeof state.serviceButton !== "boolean" ||
      !VsSystem.isCycleCount(state.coin1CyclesRemaining, this.coinPulseCycles) ||
      !VsSystem.isCycleCount(state.coin2CyclesRemaining, this.coinPulseCycles) ||
      typeof state.coinCounterLine !== "boolean" ||
      !Number.isSafeInteger(state.coinCounterPulses) ||
      state.coinCounterPulses < 0 ||
      !Number.isInteger(state.protectionIndex) ||
      state.protectionIndex < 0 ||
      state.protectionIndex > 31
    ) {
      throw new RangeError("Vs. System save state contains invalid cabinet I/O");
    }
    this.dipSwitches = state.dipSwitches;
    this.serviceButton = state.serviceButton;
    this.coin1CyclesRemaining = state.coin1CyclesRemaining;
    this.coin2CyclesRemaining = state.coin2CyclesRemaining;
    this.coinCounterLine = state.coinCounterLine;
    this.coinCounterPulses = state.coinCounterPulses;
    this.protectionIndex = state.protectionIndex;
  }

  private readStreamProtection(
    address: number,
    data: readonly number[],
    mirrorsA11: boolean,
  ): VsExpansionRead | undefined {
    const decoded =
      address === 0x5e00 ||
      address === 0x5e01 ||
      (mirrorsA11 && (address === 0x5600 || address === 0x5601));
    if (!decoded) return undefined;
    if ((address & 1) === 0) {
      this.protectionIndex = 0;
      return { value: 0, drivenMask: 0xff };
    }
    const value = data[this.protectionIndex] ?? 0;
    this.protectionIndex = (this.protectionIndex + 1) & 0x1f;
    return { value, drivenMask: 0xff };
  }

  private readSuperXeviousProtection(address: number): VsExpansionRead | undefined {
    let value: number;
    switch (address) {
      case 0x54ff:
        this.protectionIndex ^= 1;
        value = 0x05;
        break;
      case 0x5678:
        value = this.protectionIndex === 0 ? 0x00 : 0x01;
        break;
      case 0x578f:
        value = this.protectionIndex === 0 ? 0xd1 : 0x89;
        break;
      case 0x5567:
        value = this.protectionIndex === 0 ? 0x3e : 0x37;
        break;
      default:
        return undefined;
    }
    return { value, drivenMask: 0xff };
  }

  private driveCoinCounter(value: number): void {
    const next = value !== 0;
    if (next && !this.coinCounterLine) this.coinCounterPulses++;
    this.coinCounterLine = next;
  }

  private static isCoinCounterAddress(address: number): boolean {
    return (address & 0xe020) === 0x4020;
  }

  private static isCycleCount(value: number, maximum: number): boolean {
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
  }
}
