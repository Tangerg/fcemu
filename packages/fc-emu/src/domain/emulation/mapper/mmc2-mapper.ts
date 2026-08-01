import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { ChrLatchBanks } from "./chr-latch-banks.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x1000;

/**
 * iNES mapper 9: Nintendo MMC2 (PxROM), used by Punch-Out!!.
 *
 * $8000-$9FFF is a switchable 8 KiB PRG bank; $A000-$FFFF fixes the final three
 * 8 KiB banks. CHR uses the shared PPU-latch banks. MMC2 flips its left latch on
 * the exact PPU fetches $0FD8/$0FE8 and its right latch across the $1FD8-$1FDF and
 * $1FE8-$1FEF ranges.
 */
export class Mmc2Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chr: ChrLatchBanks;
  private prgBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chr = new ChrLatchBanks(Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE));
  }

  powerOn(): void {
    this.prgBank = 0;
    this.chr.reset();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Mmc2,
      prgBank: this.prgBank,
      ...this.chr.capture(),
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Mmc2)
      throw new Error(`Cannot restore ${state.kind} state into MMC2`);
    if (
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank >= this.prgBankCount
    ) {
      throw new RangeError("MMC2 save state contains an invalid PRG bank");
    }
    if (
      state.mirroring !== NametableMirroring.Horizontal &&
      state.mirroring !== NametableMirroring.Vertical
    ) {
      throw new RangeError("MMC2 save state contains invalid mirroring");
    }
    this.chr.validateState(state);
    this.prgBank = state.prgBank;
    this.chr.restore(state);
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  observePpuRead(address: number): void {
    if (address === 0x0fd8) this.chr.setLatch0(false);
    else if (address === 0x0fe8) this.chr.setLatch0(true);
    else if (address >= 0x1fd8 && address <= 0x1fdf) this.chr.setLatch1(false);
    else if (address >= 0x1fe8 && address <= 0x1fef) this.chr.setLatch1(true);
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chr.offset(address));
    if (address >= 0x8000) return this.readPrg(address);
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chr.offset(address), value);
      return;
    }
    if (address >= 0x8000) {
      this.writeRegister(address, value);
    }
  }

  private writeRegister(address: number, value: number): void {
    switch (address & 0xf000) {
      case 0xa000:
        this.prgBank = (value & 0x0f) % this.prgBankCount;
        break;
      case 0xb000:
        this.chr.writeRegister(0, value);
        break;
      case 0xc000:
        this.chr.writeRegister(1, value);
        break;
      case 0xd000:
        this.chr.writeRegister(2, value);
        break;
      case 0xe000:
        this.chr.writeRegister(3, value);
        break;
      case 0xf000:
        this.cartridge.mirroringMode =
          (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
    }
  }

  private readPrg(address: number): number {
    const slot = (address - 0x8000) >> 13;
    const bank = slot === 0 ? this.prgBank : this.prgBankCount - (4 - slot);
    const offset = address - 0x8000 - slot * PRG_BANK_SIZE;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }
}
