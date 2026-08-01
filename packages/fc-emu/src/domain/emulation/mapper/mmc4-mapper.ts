import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { ChrLatchBanks } from "./chr-latch-banks.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x1000;

/**
 * iNES mapper 10: Nintendo MMC4 (FxROM), used by Fire Emblem and Famicom Wars.
 *
 * $8000-$BFFF is a switchable 16 KiB PRG bank with $C000-$FFFF fixed to the final
 * bank, plus an 8 KiB PRG-RAM window at $6000-$7FFF. CHR uses the shared PPU-latch
 * banks. Unlike MMC2, MMC4 flips both latches across the full $xFD8-$xFDF and
 * $xFE8-$xFEF ranges.
 */
export class Mmc4Mapper implements Mapper {
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
      kind: MapperKind.Mmc4,
      prgBank: this.prgBank,
      ...this.chr.capture(),
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Mmc4)
      throw new Error(`Cannot restore ${state.kind} state into MMC4`);
    if (
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank >= this.prgBankCount
    ) {
      throw new RangeError("MMC4 save state contains an invalid PRG bank");
    }
    if (!Object.values(NametableMirroring).includes(state.mirroring as NametableMirroring)) {
      throw new RangeError("MMC4 save state contains invalid mirroring");
    }
    this.chr.validateState(state);
    this.prgBank = state.prgBank;
    this.chr.restore(state);
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  observePpuRead(address: number): void {
    if (address >= 0x0fd8 && address <= 0x0fdf) this.chr.setLatch0(false);
    else if (address >= 0x0fe8 && address <= 0x0fef) this.chr.setLatch0(true);
    else if (address >= 0x1fd8 && address <= 0x1fdf) this.chr.setLatch1(false);
    else if (address >= 0x1fe8 && address <= 0x1fef) this.chr.setLatch1(true);
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chr.offset(address));
    if (address >= 0x8000) return this.readPrg(address);
    if (address >= 0x6000) return this.readPrgRam(address);
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 || (address >= 0x6000 && this.cartridge.prgWritableBytes > 0)
      ? 0xff
      : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chr.offset(address), value);
      return;
    }
    if (address >= 0x8000) {
      this.writeRegister(address, value);
      return;
    }
    if (address >= 0x6000) this.writePrgRam(address, value);
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
    const bank = address < 0xc000 ? this.prgBank : this.prgBankCount - 1;
    const offset = address < 0xc000 ? address - 0x8000 : address - 0xc000;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }

  private readPrgRam(address: number): number {
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
