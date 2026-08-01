import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x0400;
const SUBMAPPER_0_INDEX = [0, 3, 1, 5, 6, 7, 2, 4] as const;
const SUBMAPPER_1_INDEX = [0, 2, 5, 3, 6, 1, 7, 4] as const;

export type SuperGame114Variant = 0 | 1;

/** iNES mapper 114: SuperGame protection wiring around an MMC3A-compatible core. */
export class SuperGame114Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgOverride = 0;
  private chrOuterBank = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly variant: SuperGame114Variant,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge, "standard", "a");
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgOverride = 0;
    this.chrOuterBank = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.SuperGame114,
      variant: this.variant,
      prgOverride: this.prgOverride,
      chrOuterBank: this.chrOuterBank,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.SuperGame114) {
      throw new Error(`Cannot restore ${state.kind} state into SuperGame mapper 114`);
    }
    if (
      state.variant !== this.variant ||
      !isByte(state.prgOverride) ||
      !isBit(state.chrOuterBank)
    ) {
      throw new RangeError("SuperGame mapper 114 save state contains invalid board registers");
    }
    this.mmc3.restoreState(state.mmc3);
    this.prgOverride = state.prgOverride;
    this.chrOuterBank = state.chrOuterBank;
  }

  tickPpu(): void {
    this.mmc3.tickPpu();
  }

  observePpuAddress(address: number): void {
    this.mmc3.observePpuAddress(address);
  }

  read(address: number): number {
    if (address < 0x2000) {
      const innerBank = this.mmc3.selectedChrBank(address) & 0xff;
      const bank = ((this.chrOuterBank << 8) | innerBank) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address < 0x8000) return 0;
    if ((this.prgOverride & 0x80) === 0) return this.mmc3.read(address);

    const addressBankBit = (address >>> 14) & 1;
    const lowBankBit = (this.prgOverride & 0x20) !== 0 ? addressBankBit : this.prgOverride & 1;
    const bank = ((this.prgOverride & 0x0e) | lowBankBit) % this.prgBankCount;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x3fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    if (address < 0x6000) return;
    if (address < 0x8000) {
      if ((address & 1) === 0) this.prgOverride = value;
      else this.chrOuterBank = value & 1;
      return;
    }

    const decodedAddress = address & 0xe001;
    if (this.variant === 0) this.writeSubmapper0(decodedAddress, value);
    else this.writeSubmapper1(decodedAddress, value);
  }

  private writeSubmapper0(address: number, value: number): void {
    switch (address) {
      case 0x8000:
        this.mmc3.write(0xa001, value);
        return;
      case 0x8001:
        this.mmc3.write(0xa000, value);
        return;
      case 0xa000:
        this.mmc3.write(0x8000, this.permuteIndex(value, SUBMAPPER_0_INDEX));
        return;
      case 0xa001:
        this.mmc3.write(0xc000, value);
        return;
      case 0xc000:
        this.mmc3.write(0x8001, value);
        return;
      case 0xc001:
        this.mmc3.write(0xc001, value);
        return;
      case 0xe000:
      case 0xe001:
        this.mmc3.write(address, value);
    }
  }

  private writeSubmapper1(address: number, value: number): void {
    switch (address) {
      case 0x8000:
        this.mmc3.write(0xa001, value);
        return;
      case 0x8001:
        this.mmc3.write(0x8001, value);
        return;
      case 0xa000:
        this.mmc3.write(0x8000, this.permuteIndex(value, SUBMAPPER_1_INDEX));
        return;
      case 0xa001:
        this.mmc3.write(0xc001, value);
        return;
      case 0xc000:
        this.mmc3.write(0xa000, value);
        return;
      case 0xc001:
        this.mmc3.write(0xc000, value);
        return;
      case 0xe000:
      case 0xe001:
        this.mmc3.write(address, value);
    }
  }

  private permuteIndex(value: number, permutation: readonly number[]): number {
    return (value & 0xc0) | permutation[value & 7];
  }
}
