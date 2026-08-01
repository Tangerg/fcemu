import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const PRG_BANK_SIZE = 0x8000;

/** iNES mapper 189: an MMC3 clone wrapped by TXC's 32 KiB PRG bank latch. */
export class TxcMmc3189Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private readonly prgBankCount: number;
  private selectedPrgBank = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge);
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.TxcMmc3189,
      selectedPrgBank: this.selectedPrgBank,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TxcMmc3189) {
      throw new Error(`Cannot restore ${state.kind} state into TXC mapper 189`);
    }
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount
    ) {
      throw new RangeError("TXC mapper 189 save state contains an invalid PRG bank");
    }
    if (typeof state.mmc3 !== "object" || state.mmc3 === null) {
      throw new TypeError("TXC mapper 189 save state contains malformed MMC3 state");
    }
    this.mmc3.restoreState(state.mmc3);
    this.selectedPrgBank = state.selectedPrgBank;
  }

  tickPpu(): void {
    this.mmc3.tickPpu();
  }

  observePpuAddress(address: number): void {
    this.mmc3.observePpuAddress(address);
  }

  read(address: number): number {
    if (address < 0x2000) return this.mmc3.read(address);
    if (address >= 0x8000) {
      const offset = this.selectedPrgBank * PRG_BANK_SIZE + (address - 0x8000);
      return this.cartridge.prgRom[offset] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000 || address >= 0x8000) {
      this.mmc3.write(address, value);
      return;
    }
    if (address >= 0x6000) this.selectPrgBank(value);
  }

  writeCpuExpansion(address: number, value: number): void {
    if (address >= 0x4020 && address < 0x6000) this.selectPrgBank(value);
  }

  private selectPrgBank(value: number): void {
    const combinedNibbles = (value | (value >>> 4)) & 0x07;
    this.selectedPrgBank = combinedNibbles % this.prgBankCount;
  }
}
