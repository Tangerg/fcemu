import type Cartridge from "../../model/cartridge.js";
import { isByte, isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const SECURITY_VALUES = [0x83, 0x83, 0x42, 0x00] as const;

/** iNES mapper 187: unlicensed SF3/KOF96 MMC3 board with protection and PRG override. */
export class Unl187Mapper implements Mapper {
  private readonly mmc3: Mmc3Mapper;
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private prgControl = 0;
  private securityIndex = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.mmc3 = new Mmc3Mapper(interruptPort, cartridge);
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgControl = 0;
    this.securityIndex = 0;
    this.mmc3.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Unl187,
      prgControl: this.prgControl,
      securityIndex: this.securityIndex,
      mmc3: this.mmc3.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Unl187) {
      throw new Error(`Cannot restore ${state.kind} state into UNL mapper 187`);
    }
    if (!isByte(state.prgControl) || !isIntegerInRange(state.securityIndex, 0, 1)) {
      throw new RangeError("UNL mapper 187 save state contains invalid board registers");
    }
    if (typeof state.mmc3 !== "object" || state.mmc3 === null) {
      throw new TypeError("UNL mapper 187 save state contains malformed MMC3 state");
    }

    this.mmc3.restoreState(state.mmc3);
    this.prgControl = state.prgControl;
    this.securityIndex = state.securityIndex;
  }

  tickPpu(): void {
    this.mmc3.tickPpu();
  }

  observePpuAddress(address: number): void {
    this.mmc3.observePpuAddress(address);
  }

  read(address: number): number {
    if (address < 0x2000) {
      let bank = this.mmc3.selectedChrBank(address);
      if (this.mmc3.selectedChrBankUsesTwoKilobyteRegister(address)) bank |= 0x100;
      bank %= this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address < 0x8000) return 0;

    const bank = this.selectedPrgBank(address);
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    if (address === 0x6000) {
      this.setPrgControl(value);
      return;
    }
    if (address < 0x8000) return;

    if (address === 0x8000) {
      this.securityIndex = 1;
      this.mmc3.write(address, value);
    } else if (address !== 0x8001 || this.securityIndex === 1) {
      this.mmc3.write(address, value);
    }
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (address < 0x5000 || address >= 0x6000) return undefined;
    return { value: SECURITY_VALUES[this.securityIndex] ?? 0, drivenMask: 0xff };
  }

  writeCpuExpansion(address: number, value: number): void {
    if (address === 0x5000) this.setPrgControl(value);
  }

  private setPrgControl(value: number): void {
    this.prgControl = value & 0xff;
  }

  private selectedPrgBank(address: number): number {
    if ((this.prgControl & 0x80) === 0) {
      return (this.mmc3.selectedPrgBank(address) & 0x3f) % this.prgBankCount;
    }

    const slot = (address - 0x8000) >>> 13;
    const page = this.prgControl & 0x1f;
    let bank: number;
    if ((this.prgControl & 0x20) === 0) {
      bank = (page << 1) | (slot & 1);
    } else if ((this.prgControl & 0x40) !== 0) {
      bank = (page & 0xfc) | slot;
    } else {
      bank = ((page & 0xfe) << 1) | slot;
    }
    return bank % this.prgBankCount;
  }
}
