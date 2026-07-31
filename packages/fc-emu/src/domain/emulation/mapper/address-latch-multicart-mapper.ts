import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import type { AddressLatchMulticartBoard } from "./address-latch-multicart-board.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x2000;
const ACTIVE_PRG_CHIP_SIZE = 0x80_000;
const NIBBLE_RAM_SIZE = 4;
const UNBRIDGED_SOLDER_PAD_VALUE = 0;

/**
 * Address-latch multicarts 15/225/227/228.
 *
 * The shared owner is intentionally narrow: one CPU-address latch, the write
 * data needed by 15/228, optional 74x670 nibble RAM, and board-specific pin
 * equations. The boards do not pretend to share a programmable ASIC.
 */
export class AddressLatchMulticartMapper implements Mapper {
  private addressLatch = 0x8000;
  private dataLatch = 0;
  private readonly nibbleRam = new Uint8Array(NIBBLE_RAM_SIZE);

  constructor(
    private readonly cartridge: Cartridge,
    private readonly board: AddressLatchMulticartBoard,
  ) {
    this.powerOn();
  }

  powerOn(): void {
    this.nibbleRam.fill(0);
    this.reset();
  }

  reset(): void {
    this.addressLatch = 0x8000;
    this.dataLatch = 0;
    this.applyMirroring();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.AddressLatchMulticart,
      board: this.board.id,
      addressLatch: this.addressLatch,
      dataLatch: this.dataLatch,
      nibbleRam: this.nibbleRam.slice(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.AddressLatchMulticart) {
      throw new Error(`Cannot restore ${state.kind} state into address-latch multicart`);
    }
    if (
      state.board !== this.board.id ||
      !isWord(state.addressLatch) ||
      state.addressLatch < 0x8000 ||
      !isByte(state.dataLatch) ||
      !(state.nibbleRam instanceof Uint8Array) ||
      state.nibbleRam.byteLength !== NIBBLE_RAM_SIZE ||
      state.nibbleRam.some((value) => value > 0x0f) ||
      this.latchedAddress(state.addressLatch) !== state.addressLatch ||
      (!this.hasDataLatch() && state.dataLatch !== 0) ||
      (!this.board.hasNibbleRam && state.nibbleRam.some((value) => value !== 0))
    ) {
      throw new RangeError("Address-latch multicart save state is invalid for this board");
    }
    this.addressLatch = state.addressLatch;
    this.dataLatch = state.dataLatch;
    this.nibbleRam.set(state.nibbleRam);
    this.applyMirroring();
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x8000) return this.readPrg(address);
    if (address >= 0x6000 && this.hasBatteryWram()) {
      return this.cartridge.readPrgRam(address - 0x6000);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return this.prgIsDriven() ? 0xff : 0;
    if (address >= 0x6000 && this.hasBatteryWram()) return 0xff;
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      if (this.chrIsWritable()) this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.hasBatteryWram()) this.cartridge.writePrgRam(address - 0x6000, value);
      return;
    }
    if (address < 0x8000) return;
    this.addressLatch = this.latchedAddress(address);
    this.dataLatch = this.hasDataLatch() ? value : 0;
    this.applyMirroring();
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (!this.board.hasNibbleRam || address < 0x5800 || address >= 0x6000) return undefined;
    return { value: this.nibbleRam[address & 3] ?? 0, drivenMask: 0x0f };
  }

  writeCpuExpansion(address: number, value: number): void {
    if (!this.board.hasNibbleRam || address < 0x5800 || address >= 0x6000) return;
    this.nibbleRam[address & 3] = value & 0x0f;
  }

  private readPrg(address: number): number {
    const offset = this.prgOffset(address);
    return offset === undefined ? 0 : (this.cartridge.prgRom[offset] ?? 0);
  }

  private prgOffset(address: number): number | undefined {
    switch (this.board.mapperNumber) {
      case 15:
        return this.mapper15PrgOffset(address);
      case 225:
        return (
          (this.mapper225PrgBank(address) % this.prgBankCount) * PRG_BANK_SIZE + (address & 0x3fff)
        );
      case 227: {
        const bank = this.mapper227PrgBank(address);
        const innerOffset =
          this.board.hasSolderPadReadMode && (this.addressLatch & 0x0400) !== 0
            ? (address & 0x3ff0) | UNBRIDGED_SOLDER_PAD_VALUE
            : address & 0x3fff;
        return bank * PRG_BANK_SIZE + innerOffset;
      }
      case 228: {
        const chip = (this.addressLatch >>> 11) & 3;
        if (chip === 2) return undefined;
        const physicalChip = chip === 3 ? 2 : chip;
        const offset =
          physicalChip * ACTIVE_PRG_CHIP_SIZE +
          this.mapper228InnerPrgBank(address) * PRG_BANK_SIZE +
          (address & 0x3fff);
        return offset < this.cartridge.prgRom.byteLength ? offset : undefined;
      }
    }
  }

  private mapper15PrgOffset(address: number): number {
    const selected = this.dataLatch & 0x3f;
    const cpuHalf = address < 0xc000 ? 0 : 1;
    switch (this.addressLatch & 3) {
      case 0:
        return ((selected & 0x3e) | cpuHalf) * PRG_BANK_SIZE + (address & 0x3fff);
      case 1:
        return (
          (address < 0xc000 ? selected : (selected & 0x38) | 7) * PRG_BANK_SIZE + (address & 0x3fff)
        );
      case 2: {
        const selected8KiBBank = (selected << 1) | (this.dataLatch >>> 7);
        return selected8KiBBank * 0x2000 + (address & 0x1fff);
      }
      default:
        return selected * PRG_BANK_SIZE + (address & 0x3fff);
    }
  }

  private mapper225PrgBank(address: number): number {
    const selected = ((this.addressLatch >>> 6) & 0x3f) | ((this.addressLatch >>> 8) & 0x40);
    const cpuHalf = address < 0xc000 ? 0 : 1;
    return (this.addressLatch & 0x1000) === 0 ? (selected & 0x7e) | cpuHalf : selected;
  }

  private mapper227PrgBank(address: number): number {
    let outer =
      ((this.addressLatch >>> 6) & 4) |
      ((this.addressLatch >>> 5) & 2) |
      ((this.addressLatch >>> 5) & 1);
    const selectedInner = (this.addressLatch >>> 2) & 7;
    const cpuHalf = address < 0xc000 ? 0 : 1;
    let inner: number;
    if (this.board.exposesBatteryWram || (this.addressLatch & 0x0080) !== 0) {
      inner = (this.addressLatch & 1) !== 0 ? (selectedInner & 6) | cpuHalf : selectedInner;
    } else if (cpuHalf === 0) {
      inner = (this.addressLatch & 1) !== 0 ? selectedInner & 6 : selectedInner;
    } else {
      inner = (this.addressLatch & 0x0200) !== 0 ? 7 : 0;
    }
    if (this.board.resetsOuterBankForInnerZero && inner === 0) outer &= 4;
    return outer * 8 + inner;
  }

  private mapper228InnerPrgBank(address: number): number {
    const selected = (this.addressLatch >>> 6) & 0x1f;
    const cpuHalf = address < 0xc000 ? 0 : 1;
    return (this.addressLatch & 0x0020) === 0 ? (selected & 0x1e) | cpuHalf : selected;
  }

  private chrOffset(address: number): number {
    switch (this.board.mapperNumber) {
      case 15:
      case 227:
        return address;
      case 225: {
        const selected = (this.addressLatch & 0x3f) | ((this.addressLatch >>> 8) & 0x40);
        const bankCount = this.cartridge.chrMemoryBytes / CHR_BANK_SIZE;
        return (selected % bankCount) * CHR_BANK_SIZE + address;
      }
      case 228: {
        const selected = ((this.addressLatch & 0x0f) << 2) | (this.dataLatch & 3);
        return selected * CHR_BANK_SIZE + address;
      }
    }
  }

  private chrIsWritable(): boolean {
    if (this.board.chrWriteProtection === "none") return this.cartridge.hasWritableChrMemory;
    if (this.board.chrWriteProtection === "mapper-15") {
      const mode = this.addressLatch & 3;
      return mode === 1 || mode === 2;
    }
    return (this.addressLatch & 0x0080) === 0;
  }

  private prgIsDriven(): boolean {
    return this.board.mapperNumber !== 228 || this.prgOffset(0x8000) !== undefined;
  }

  private hasBatteryWram(): boolean {
    return this.board.exposesBatteryWram && this.cartridge.hasBatteryBackup;
  }

  private hasDataLatch(): boolean {
    return this.board.mapperNumber === 15 || this.board.mapperNumber === 228;
  }

  private latchedAddress(address: number): number {
    switch (this.board.mapperNumber) {
      case 15:
        return 0x8000 | (address & 0x0003);
      case 225:
        return 0x8000 | (address & 0x7fff);
      case 227:
        return 0x8000 | (address & 0x07ff);
      case 228:
        return 0x8000 | (address & 0x3fef);
    }
  }

  private applyMirroring(): void {
    const horizontal = (() => {
      switch (this.board.mapperNumber) {
        case 15:
          return (this.dataLatch & 0x40) !== 0;
        case 227:
          return (this.addressLatch & 0x0002) !== 0;
        case 225:
        case 228:
          return (this.addressLatch & 0x2000) !== 0;
      }
    })();
    this.cartridge.mirroringMode = horizontal
      ? NametableMirroring.Horizontal
      : NametableMirroring.Vertical;
  }

  private get prgBankCount(): number {
    return this.cartridge.prgRom.byteLength / PRG_BANK_SIZE;
  }
}
