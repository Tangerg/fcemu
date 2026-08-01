import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_ROM_BANK_SIZE = 0x0800;

/** iNES mapper 77: Irem LROG017 mixed CHR-ROM/CHR-RAM board. */
export class IremLrog017Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrRomBankCount: number;
  private prgBank = 0;
  private chrRomBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrRomBankCount = cartridge.chrRom.byteLength / CHR_ROM_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBank = 0;
    this.chrRomBank = 0;
    this.cartridge.mirroringMode = NametableMirroring.FourScreen;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.IremLrog017,
      prgBank: this.prgBank,
      chrRomBank: this.chrRomBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.IremLrog017) {
      throw new Error(`Cannot restore ${state.kind} state into Irem LROG017 mapper 77`);
    }
    if (
      !isBank(state.prgBank, this.prgBankCount) ||
      !isBank(state.chrRomBank, this.chrRomBankCount)
    ) {
      throw new RangeError("Irem LROG017 save state contains an invalid PRG or CHR bank");
    }
    this.prgBank = state.prgBank;
    this.chrRomBank = state.chrRomBank;
    this.cartridge.mirroringMode = NametableMirroring.FourScreen;
  }

  read(address: number): number {
    if (address < 0x0800) {
      return this.cartridge.chrRom[this.chrRomBank * CHR_ROM_BANK_SIZE + address] ?? 0;
    }
    if (address < 0x2000) return this.cartridge.readWritableChr(address);
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.prgBank * PRG_BANK_SIZE + address - 0x8000] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x0800 && address < 0x2000) {
      this.cartridge.writeWritableChr(address, value);
      return;
    }
    if (address < 0x8000) return;
    const effectiveValue = value & this.read(address);
    this.prgBank = (effectiveValue & 0x0f) % this.prgBankCount;
    this.chrRomBank = ((effectiveValue >>> 4) & 0x0f) % this.chrRomBankCount;
  }

  readNametableBus(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    address &= 0x3fff;
    if (address >= 0x3000) return { value: 0, drivenMask: 0 };
    if (address < 0x2800) {
      return {
        value: this.cartridge.readWritableChr(address - 0x2000),
        drivenMask: 0xff,
      };
    }
    return undefined;
  }

  writeNametable(address: number, value: number): boolean {
    address &= 0x3fff;
    if (address >= 0x3000) return true;
    if (address < 0x2800) {
      this.cartridge.writeWritableChr(address - 0x2000, value);
      return true;
    }
    return false;
  }

  mapNametableAddress(address: number): number | undefined {
    address &= 0x3fff;
    return address >= 0x2800 && address < 0x3000 ? address - 0x2800 : undefined;
  }
}

function isBank(bank: number, count: number): boolean {
  return Number.isInteger(bank) && bank >= 0 && bank < count;
}
