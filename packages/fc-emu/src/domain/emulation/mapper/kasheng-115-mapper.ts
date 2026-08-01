import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const PRG_8K_BANK_SIZE = 0x2000;
const PRG_16K_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x0400;

/** Kasheng SFC-02B/-03/-004 board used by duplicate iNES mapper IDs 115 and 248. */
export class Kasheng115Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private readonly prg8kBankCount: number;
  private readonly prg16kBankCount: number;
  private readonly chrBankCount: number;
  private prgModeRegister = 0;
  private chrOuterBank = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge);
    this.prg8kBankCount = cartridge.prgRom.byteLength / PRG_8K_BANK_SIZE;
    this.prg16kBankCount = cartridge.prgRom.byteLength / PRG_16K_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgModeRegister = 0;
    this.chrOuterBank = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Kasheng115,
      prgModeRegister: this.prgModeRegister,
      chrOuterBank: this.chrOuterBank,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Kasheng115) {
      throw new Error(`Cannot restore ${state.kind} state into Kasheng mapper 115`);
    }
    if (!isByte(state.prgModeRegister) || !isBit(state.chrOuterBank)) {
      throw new RangeError("Kasheng mapper 115 save state contains invalid outer registers");
    }
    this.mmc3.restoreState(state.mmc3);
    this.prgModeRegister = state.prgModeRegister;
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

    if ((this.prgModeRegister & 0x80) !== 0) {
      const addressBankBit = (address >>> 14) & 1;
      const lowBankBit =
        (this.prgModeRegister & 0x20) !== 0 ? addressBankBit : this.prgModeRegister & 1;
      const bank =
        (((this.prgModeRegister & 0x40) >>> 2) | (this.prgModeRegister & 0x0e) | lowBankBit) %
        this.prg16kBankCount;
      return this.cartridge.prgRom[bank * PRG_16K_BANK_SIZE + (address & 0x3fff)] ?? 0;
    }

    const innerBank = this.mmc3.selectedPrgBank(address) & 0x1f;
    const bank = (((this.prgModeRegister & 0x40) >>> 1) | innerBank) % this.prg8kBankCount;
    return this.cartridge.prgRom[bank * PRG_8K_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && (address & 0xe003) === 0x6002 ? 0x07 : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    if (address < 0x6000) return;
    if (address < 0x8000) {
      switch (address & 0xe003) {
        case 0x6000:
          this.prgModeRegister = value;
          return;
        case 0x6001:
          this.chrOuterBank = value & 1;
          return;
        default:
          return;
      }
    }
    this.mmc3.write(address, value);
  }
}
