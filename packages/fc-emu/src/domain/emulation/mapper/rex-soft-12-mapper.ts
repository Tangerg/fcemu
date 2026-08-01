import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const CHR_BANK_SIZE = 0x0400;
const OUTER_REGISTER_MASK = 0xe100;
const OUTER_REGISTER_VALUE = 0x4100;
const CONNECTED_OUTER_BITS = 0x11;

/** iNES mapper 12.0: Rex Soft/Gouder SL-5020B with an MMC3A-compatible Huang-1 ASIC. */
export class RexSoft12Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private chrOuterBits = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge, "standard", "a");
  }

  powerOn(): void {
    this.chrOuterBits = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.RexSoft12,
      chrOuterBits: this.chrOuterBits,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.RexSoft12) {
      throw new Error(`Cannot restore ${state.kind} state into Rex Soft mapper 12`);
    }
    if (
      !Number.isInteger(state.chrOuterBits) ||
      state.chrOuterBits < 0 ||
      (state.chrOuterBits & ~CONNECTED_OUTER_BITS) !== 0
    ) {
      throw new RangeError("Rex Soft mapper 12 state contains invalid outer CHR bits");
    }
    if (typeof state.mmc3 !== "object" || state.mmc3 === null) {
      throw new TypeError("Rex Soft mapper 12 state contains malformed MMC3 state");
    }
    this.mmc3.restoreState(state.mmc3);
    this.chrOuterBits = state.chrOuterBits;
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
      const outerBank = address < 0x1000 ? this.chrOuterBits & 1 : (this.chrOuterBits >>> 4) & 1;
      const bank = (outerBank << 8) | innerBank;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    return address >= 0x6000 ? this.mmc3.read(address) : 0;
  }

  cpuReadDriveMask(address: number): number {
    return this.mmc3.cpuReadDriveMask(address);
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    return this.decodesOuterRegister(address) ? { value: 1, drivenMask: 1 } : undefined;
  }

  write(address: number, value: number): void {
    if (address < 0x2000 || address >= 0x6000) this.mmc3.write(address, value);
  }

  writeCpuExpansion(address: number, value: number): void {
    if (this.decodesOuterRegister(address)) this.chrOuterBits = value & CONNECTED_OUTER_BITS;
  }

  private decodesOuterRegister(address: number): boolean {
    return (address & OUTER_REGISTER_MASK) === OUTER_REGISTER_VALUE;
  }
}
