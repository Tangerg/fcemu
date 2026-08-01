import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x1000;

/** iNES mapper 96: Bandai Oeka Kids address-latched CHR-RAM board. */
export class OekaKidsMapper implements Mapper {
  private register = 0;
  private innerChrBank = 0;
  private lastPpuAddress = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.powerOn();
  }

  powerOn(): void {
    this.register = 0;
    this.innerChrBank = 0;
    this.lastPpuAddress = 0;
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.OekaKids,
      register: this.register,
      innerChrBank: this.innerChrBank,
      lastPpuAddress: this.lastPpuAddress,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.OekaKids) {
      throw new Error(`Cannot restore ${state.kind} state into Oeka Kids mapper 96`);
    }
    if (
      !isIntegerInRange(state.register, 0, 7) ||
      !isIntegerInRange(state.innerChrBank, 0, 3) ||
      !isIntegerInRange(state.lastPpuAddress, 0, 0x3fff)
    ) {
      throw new RangeError("Oeka Kids save state contains invalid latch state");
    }
    this.register = state.register;
    this.innerChrBank = state.innerChrBank;
    this.lastPpuAddress = state.lastPpuAddress;
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x8000) return this.readPrg(address);
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address < 0x8000) return;
    this.register = value & this.readPrg(address) & 0x07;
  }

  observePpuAddress(address: number): void {
    address &= 0x3fff;
    if ((this.lastPpuAddress & 0x3000) !== 0x2000 && (address & 0x3000) === 0x2000) {
      this.innerChrBank = (address >>> 8) & 0x03;
    }
    this.lastPpuAddress = address;
  }

  private chrOffset(address: number): number {
    const outerBank = this.register & 0x04;
    const bank = address < 0x1000 ? outerBank | this.innerChrBank : outerBank | 0x03;
    return bank * CHR_BANK_SIZE + (address & 0x0fff);
  }

  private readPrg(address: number): number {
    const bank = this.register & 0x03;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + address - 0x8000] ?? 0;
  }
}
