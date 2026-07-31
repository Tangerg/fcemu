import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

export type IremG101Board = "standard" | "major-league";

/** iNES mapper 32: Irem G-101 with its explicitly identified Major League wiring. */
export class IremG101Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly prgBanks = [0, 0];
  private readonly chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgMode = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly board: IremG101Board,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.prgMode = 0;
    this.cartridge.mirroringMode =
      this.board === "major-league"
        ? NametableMirroring.SingleScreenUpper
        : NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.IremG101,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      prgMode: this.prgMode,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.IremG101) {
      throw new Error(`Cannot restore ${state.kind} state into Irem G-101`);
    }
    if (
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank >= this.prgBankCount)
    ) {
      throw new RangeError("Irem G-101 save state contains an invalid PRG bank");
    }
    if (
      !isFixedByteArray(state.chrBanks, 8) ||
      state.chrBanks.some((bank) => bank >= this.chrBankCount)
    ) {
      throw new RangeError("Irem G-101 save state contains an invalid CHR bank");
    }
    if (
      (state.prgMode !== 0 && state.prgMode !== 1) ||
      (this.board === "major-league" && state.prgMode !== 0)
    ) {
      throw new RangeError("Irem G-101 save state contains an invalid PRG mode");
    }
    if (!this.acceptsMirroring(state.mirroring)) {
      throw new RangeError("Irem G-101 save state contains invalid mirroring for this board");
    }
    this.prgBanks.splice(0, this.prgBanks.length, ...state.prgBanks);
    this.chrBanks.splice(0, this.chrBanks.length, ...state.chrBanks);
    this.prgMode = state.prgMode;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      return this.cartridge.readChr(
        (this.chrBanks[slot] ?? 0) * CHR_BANK_SIZE + (address & 0x03ff),
      );
    }
    if (address < 0x8000) return 0;
    const slot = (address - 0x8000) >>> 13;
    let bank: number;
    if (slot === 3) bank = this.prgBankCount - 1;
    else if (slot === 1) bank = this.prgBanks[1] ?? 0;
    else if (slot === (this.prgMode === 0 ? 0 : 2)) bank = this.prgBanks[0] ?? 0;
    else bank = this.prgBankCount - 2;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000) return;
    switch (address & 0xf000) {
      case 0x8000:
        this.prgBanks[0] = (value & 0x1f) % this.prgBankCount;
        break;
      case 0x9000:
        if (this.board === "major-league") return;
        this.prgMode = (value >>> 1) & 1;
        this.cartridge.mirroringMode =
          (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
      case 0xa000:
        this.prgBanks[1] = (value & 0x1f) % this.prgBankCount;
        break;
      case 0xb000:
        this.chrBanks[address & 7] = value % this.chrBankCount;
        break;
    }
  }

  private acceptsMirroring(value: number): boolean {
    return this.board === "major-league"
      ? value === NametableMirroring.SingleScreenUpper
      : value === NametableMirroring.Horizontal || value === NametableMirroring.Vertical;
  }
}
