import type Cartridge from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const PRG_BANK_SIZE = 0x2000;
const PRG_REGION_BANKS = 0x40;

/** iNES mapper 245: Waixing F003 wiring around an MMC3-compatible register core. */
export class WaixingF003Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private readonly prgBankCount: number;

  /** PPU A12 is grounded at the MMC3; only A10/A11 reach its CHR bank decoder. */
  private ppuBankAddress = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge);
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }

  powerOn(): void {
    this.ppuBankAddress = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.WaixingF003,
      ppuBankAddress: this.ppuBankAddress,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.WaixingF003) {
      throw new Error(`Cannot restore ${state.kind} state into Waixing F003`);
    }
    if (!isWord(state.ppuBankAddress) || state.ppuBankAddress > 0x0fff) {
      throw new RangeError("Waixing F003 save state contains an invalid PPU bank address");
    }
    if (
      typeof state.mmc3 !== "object" ||
      state.mmc3 === null ||
      state.mmc3.ppuClock !== 0 ||
      state.mmc3.a12High ||
      state.mmc3.a12LowSince !== 0 ||
      state.mmc3.irqPending
    ) {
      throw new RangeError("Waixing F003 save state contains impossible disconnected A12 state");
    }
    this.mmc3.restoreState(state.mmc3);
    this.ppuBankAddress = state.ppuBankAddress;
  }

  observePpuAddress(address: number): void {
    this.ppuBankAddress = address & 0x0fff;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0x8000) {
      const innerBank = this.mmc3.selectedPrgBank(address) & (PRG_REGION_BANKS - 1);
      const outerBank = (this.mmc3.selectedChrBank(this.ppuBankAddress) & 0x02) << 5;
      const bank = (outerBank | innerBank) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    return this.mmc3.read(address);
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : this.mmc3.cpuReadDriveMask(address);
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    this.mmc3.write(address, value);
  }
}
