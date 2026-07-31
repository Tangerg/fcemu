import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_SMALL_BANK_SIZE = 0x0400;
const CHR_LARGE_BANK_SIZE = 0x0800;

/**
 * iNES mapper 33: Taito TC0190/IRQ-unused TC0350 board.
 *
 * Two 8 KiB PRG registers precede two fixed tail banks. CHR is split into two 2 KiB and four
 * 1 KiB windows; unlike MMC3, the 2 KiB register value is already expressed in 2 KiB units.
 */
export class TaitoTc0190Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrSmallBankCount: number;
  private readonly chrLargeBankCount: number;
  private readonly prgBanks = [0, 1];
  private readonly chrBanks = [0, 1, 4, 5, 6, 7];

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrSmallBankCount = cartridge.chrMemoryBytes / CHR_SMALL_BANK_SIZE;
    this.chrLargeBankCount = cartridge.chrMemoryBytes / CHR_LARGE_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBanks[0] = 0;
    this.prgBanks[1] = 1 % this.prgBankCount;
    this.chrBanks[0] = 0;
    this.chrBanks[1] = 1 % this.chrLargeBankCount;
    for (let slot = 2; slot < this.chrBanks.length; slot++) {
      this.chrBanks[slot] = (slot + 2) % Math.min(this.chrSmallBankCount, 0x100);
    }
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.TaitoTc0190,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TaitoTc0190) {
      throw new Error(`Cannot restore ${state.kind} state into Taito TC0190`);
    }
    if (
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank >= this.prgBankCount)
    ) {
      throw new RangeError("Taito TC0190 save state contains an invalid PRG bank");
    }
    if (
      !isFixedByteArray(state.chrBanks, 6) ||
      state.chrBanks[0] >= this.chrLargeBankCount ||
      state.chrBanks[1] >= this.chrLargeBankCount ||
      state.chrBanks.slice(2).some((bank) => bank >= Math.min(this.chrSmallBankCount, 0x100))
    ) {
      throw new RangeError("Taito TC0190 save state contains an invalid CHR bank");
    }
    if (
      state.mirroring !== NametableMirroring.Horizontal &&
      state.mirroring !== NametableMirroring.Vertical
    ) {
      throw new RangeError("Taito TC0190 save state contains invalid mirroring");
    }
    this.prgBanks.splice(0, this.prgBanks.length, ...state.prgBanks);
    this.chrBanks.splice(0, this.chrBanks.length, ...state.chrBanks);
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address < 0x8000) return 0;
    const slot = (address - 0x8000) >>> 13;
    const bank = slot < 2 ? (this.prgBanks[slot] ?? 0) : this.prgBankCount - (slot === 2 ? 2 : 1);
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000 || address > 0xbfff) return;
    switch (address & 0xa003) {
      case 0x8000:
        this.prgBanks[0] = (value & 0x3f) % this.prgBankCount;
        this.cartridge.mirroringMode =
          (value & 0x40) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
      case 0x8001:
        this.prgBanks[1] = (value & 0x3f) % this.prgBankCount;
        break;
      case 0x8002:
      case 0x8003:
        this.chrBanks[address & 1] = value % this.chrLargeBankCount;
        break;
      case 0xa000:
      case 0xa001:
      case 0xa002:
      case 0xa003:
        this.chrBanks[2 + (address & 3)] = value % Math.min(this.chrSmallBankCount, 0x100);
        break;
    }
  }

  private chrOffset(address: number): number {
    if (address < 0x1000) {
      const slot = address >>> 11;
      return (this.chrBanks[slot] ?? 0) * CHR_LARGE_BANK_SIZE + (address & 0x07ff);
    }
    const slot = 2 + ((address - 0x1000) >>> 10);
    return (this.chrBanks[slot] ?? 0) * CHR_SMALL_BANK_SIZE + (address & 0x03ff);
  }
}
