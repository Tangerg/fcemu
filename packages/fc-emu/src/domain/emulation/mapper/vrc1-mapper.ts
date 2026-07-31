import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x1000;

/**
 * iNES mapper 75: Konami VRC1.
 *
 * Three independently selected 8 KiB PRG windows precede a fixed final bank.
 * Two 4 KiB CHR registers combine their low nibbles with separate high bits
 * from the mirroring register.
 */
export class Vrc1Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly fourScreenMirroring: boolean;
  private readonly prgBanks = [0, 0, 0];
  private readonly chrBanks = [0, 0];

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.fourScreenMirroring = cartridge.mirroringMode === NametableMirroring.FourScreen;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.cartridge.mirroringMode = this.fourScreenMirroring
      ? NametableMirroring.FourScreen
      : NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Vrc1,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Vrc1) {
      throw new Error(`Cannot restore ${state.kind} state into VRC1`);
    }
    if (!isFixedByteArray(state.prgBanks, 3) || state.prgBanks.some((bank) => bank > 0x0f)) {
      throw new RangeError("VRC1 save state contains an invalid PRG register");
    }
    if (!isFixedByteArray(state.chrBanks, 2) || state.chrBanks.some((bank) => bank > 0x1f)) {
      throw new RangeError("VRC1 save state contains an invalid CHR register");
    }
    if (!this.acceptsMirroring(state.mirroring)) {
      throw new RangeError("VRC1 save state contains invalid mirroring for this board");
    }
    this.prgBanks.splice(0, this.prgBanks.length, ...state.prgBanks);
    this.chrBanks.splice(0, this.chrBanks.length, ...state.chrBanks);
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = (this.chrBanks[address >>> 12] ?? 0) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x0fff));
    }
    if (address < 0x8000) return 0;
    const slot = (address - 0x8000) >>> 13;
    const bank =
      slot === 3 ? this.prgBankCount - 1 : (this.prgBanks[slot] ?? 0) % this.prgBankCount;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    switch (address & 0xf000) {
      case 0x8000:
        this.prgBanks[0] = value & 0x0f;
        break;
      case 0x9000:
        this.writeControl(value);
        break;
      case 0xa000:
        this.prgBanks[1] = value & 0x0f;
        break;
      case 0xc000:
        this.prgBanks[2] = value & 0x0f;
        break;
      case 0xe000:
        this.chrBanks[0] = (this.chrBanks[0] & 0x10) | (value & 0x0f);
        break;
      case 0xf000:
        this.chrBanks[1] = (this.chrBanks[1] & 0x10) | (value & 0x0f);
        break;
    }
  }

  private writeControl(value: number): void {
    this.chrBanks[0] = (this.chrBanks[0] & 0x0f) | ((value & 0x02) << 3);
    this.chrBanks[1] = (this.chrBanks[1] & 0x0f) | ((value & 0x04) << 2);
    if (!this.fourScreenMirroring) {
      this.cartridge.mirroringMode =
        (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
    }
  }

  private acceptsMirroring(value: number): boolean {
    return this.fourScreenMirroring
      ? value === NametableMirroring.FourScreen
      : value === NametableMirroring.Horizontal || value === NametableMirroring.Vertical;
  }
}
