import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x0800;
const NAMETABLE_BANK_SIZE = 0x0400;

/** iNES mapper 68: Sunsoft-4, including optional CHR-ROM-backed nametables. */
export class Sunsoft4Mapper implements Mapper {
  private readonly initialMirroring: NametableMirroring;
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly nametableBankCount: number;
  private readonly chrBanks = [0, 0, 0, 0];
  private readonly nametableBanks = [0, 0];
  private useChrNametables = false;
  private prgBank = 0;
  private prgRamEnabled = false;

  constructor(private readonly cartridge: Cartridge) {
    this.initialMirroring = cartridge.mirroringMode;
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.nametableBankCount = cartridge.chrMemoryBytes / NAMETABLE_BANK_SIZE;
  }

  powerOn(): void {
    this.chrBanks.fill(0);
    this.nametableBanks.fill(0);
    this.useChrNametables = false;
    this.prgBank = 0;
    this.prgRamEnabled = false;
    this.cartridge.mirroringMode = this.initialMirroring;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Sunsoft4,
      chrBanks: [...this.chrBanks],
      nametableBanks: [...this.nametableBanks],
      useChrNametables: this.useChrNametables,
      prgBank: this.prgBank,
      prgRamEnabled: this.prgRamEnabled,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Sunsoft4) {
      throw new Error(`Cannot restore ${state.kind} state into Sunsoft-4`);
    }
    if (
      !isFixedByteArray(state.chrBanks, 4) ||
      state.chrBanks.some((bank) => bank >= this.chrBankCount)
    ) {
      throw new RangeError("Sunsoft-4 save state contains an invalid CHR bank");
    }
    if (
      !isFixedByteArray(state.nametableBanks, 2) ||
      state.nametableBanks.some((bank) => bank > 0x7f)
    ) {
      throw new RangeError("Sunsoft-4 save state contains an invalid nametable bank");
    }
    if (
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank >= this.prgBankCount
    ) {
      throw new RangeError("Sunsoft-4 save state contains an invalid PRG bank");
    }
    if (!areBooleans(state.useChrNametables, state.prgRamEnabled)) {
      throw new RangeError("Sunsoft-4 save state contains an invalid enable flag");
    }
    if (!Sunsoft4Mapper.isControlledMirroring(state.mirroring)) {
      throw new RangeError("Sunsoft-4 save state contains invalid mirroring");
    }
    this.chrBanks.splice(0, this.chrBanks.length, ...state.chrBanks);
    this.nametableBanks.splice(0, this.nametableBanks.length, ...state.nametableBanks);
    this.useChrNametables = state.useChrNametables;
    this.prgBank = state.prgBank;
    this.prgRamEnabled = state.prgRamEnabled;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 11;
      return this.cartridge.readChr(
        (this.chrBanks[slot] ?? 0) * CHR_BANK_SIZE + (address & 0x07ff),
      );
    }
    if (address >= 0xc000) {
      const offset = (this.prgBankCount - 1) * PRG_BANK_SIZE + (address - 0xc000);
      return this.cartridge.prgRom[offset] ?? 0;
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.prgBank * PRG_BANK_SIZE + (address - 0x8000)] ?? 0;
    }
    if (address >= 0x6000 && this.prgRamEnabled && this.cartridge.prgWritableBytes > 0) {
      return this.cartridge.readPrgRam(address - 0x6000);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && this.prgRamEnabled && this.cartridge.prgWritableBytes > 0
      ? 0xff
      : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    if (address >= 0x6000 && address < 0x8000) {
      if (this.prgRamEnabled && this.cartridge.prgWritableBytes > 0) {
        this.cartridge.writePrgRam(address - 0x6000, value);
      }
      return;
    }
    if (address < 0x8000) return;
    switch (address & 0xf000) {
      case 0x8000:
      case 0x9000:
      case 0xa000:
      case 0xb000:
        this.chrBanks[(address >>> 12) - 8] = value % this.chrBankCount;
        break;
      case 0xc000:
      case 0xd000:
        this.nametableBanks[(address >>> 12) - 12] = value & 0x7f;
        break;
      case 0xe000:
        this.useChrNametables = (value & 0x10) !== 0;
        this.cartridge.mirroringMode = [
          NametableMirroring.Vertical,
          NametableMirroring.Horizontal,
          NametableMirroring.SingleScreenLower,
          NametableMirroring.SingleScreenUpper,
        ][value & 0x03] as NametableMirroring;
        break;
      case 0xf000:
        this.prgBank = (value & 0x0f) % this.prgBankCount;
        this.prgRamEnabled = (value & 0x10) !== 0;
        break;
    }
  }

  mapNametableAddress(address: number): number | undefined {
    if (this.useChrNametables) return undefined;
    const offset = (address - 0x2000) & 0x0fff;
    return this.selectedNametablePage(offset >>> 10) * NAMETABLE_BANK_SIZE + (offset & 0x03ff);
  }

  readNametable(address: number): number | undefined {
    if (!this.useChrNametables) return undefined;
    const offset = (address - 0x2000) & 0x0fff;
    const register = this.selectedNametablePage(offset >>> 10);
    const bank = (0x80 | (this.nametableBanks[register] ?? 0)) % this.nametableBankCount;
    return this.cartridge.readChr(bank * NAMETABLE_BANK_SIZE + (offset & 0x03ff));
  }

  writeNametable(_address: number, _value: number): boolean {
    return this.useChrNametables;
  }

  private selectedNametablePage(slot: number): number {
    switch (this.cartridge.mirroringMode) {
      case NametableMirroring.Vertical:
        return slot & 1;
      case NametableMirroring.Horizontal:
        return (slot >>> 1) & 1;
      case NametableMirroring.SingleScreenLower:
        return 0;
      case NametableMirroring.SingleScreenUpper:
        return 1;
      default:
        return 0;
    }
  }

  private static isControlledMirroring(value: number): boolean {
    return (
      value === NametableMirroring.Vertical ||
      value === NametableMirroring.Horizontal ||
      value === NametableMirroring.SingleScreenLower ||
      value === NametableMirroring.SingleScreenUpper
    );
  }
}
