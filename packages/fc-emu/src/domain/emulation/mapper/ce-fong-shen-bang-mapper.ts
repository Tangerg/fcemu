import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0800;
const WRAM_START = 0x6800;
const WRAM_END = 0x6fff;

/** iNES mapper 246: C&E's Fong Shen Bang discrete PRG/CHR register board. */
export class CeFongShenBangMapper implements Mapper {
  private prgBanks = [0xff, 0xff, 0xff, 0xff];
  private chrBanks = [0xff, 0xff, 0xff, 0xff];
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    // The board's 74LS670 register files reliably power up with every bit high.
    this.prgBanks.fill(0xff);
    this.chrBanks.fill(0xff);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.CeFongShenBang246,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.CeFongShenBang246) {
      throw new Error(`Cannot restore ${state.kind} state into C&E Fong Shen Bang mapper 246`);
    }
    if (!isFixedByteArray(state.prgBanks, 4) || !isFixedByteArray(state.chrBanks, 4)) {
      throw new RangeError("C&E Fong Shen Bang save state contains invalid bank registers");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 11;
      const bank = (this.chrBanks[slot] ?? 0) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x07ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      let bank = this.prgBanks[slot] ?? 0;
      if (isPrgA17Alias(address)) bank |= 0x10;
      bank %= this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    if (address >= WRAM_START && address <= WRAM_END) {
      return this.cartridge.readPrgRam(address - WRAM_START);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 || (address >= WRAM_START && address <= WRAM_END) ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x6000 && address <= 0x67ff) {
      const register = address & 0x03;
      if ((address & 0x04) === 0) this.prgBanks[register] = value;
      else this.chrBanks[register] = value;
      return;
    }
    if (address >= WRAM_START && address <= WRAM_END) {
      this.cartridge.writePrgRam(address - WRAM_START, value);
    }
  }
}

function isPrgA17Alias(address: number): boolean {
  return address > 0xff00 && (address & 0xffe4) === 0xffe4;
}
