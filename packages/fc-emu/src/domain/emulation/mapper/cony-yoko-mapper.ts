import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte, isWord } from "../numeric-range.js";
import type { ConyYokoBoard } from "./cony-yoko-board.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_8K = 0x2000;
const PRG_16K = 0x4000;
const MIRRORING = [
  NametableMirroring.Vertical,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/**
 * iNES mapper 83: the Cony/Yoko ASIC on its four allocated NES 2.0 PCBs.
 *
 * Board wiring owns CHR granularity, inner PRG capacity, outer-bank lines and
 * the submapper-2 NVRAM window. The ASIC owns its register mirrors, scratch
 * RAM, four PRG modes and one-shot dual-source IRQ counter.
 */
export class ConyYokoMapper implements Mapper {
  private readonly innerPrg16Mask: number;
  private readonly innerPrg8Mask: number;
  private readonly solderPad: number;
  private prgBase = 0;
  private mode = 0;
  private prgBanks = [0, 0, 0, 0];
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private irqCounter = 0;
  private irqEnabled = false;
  private irqPending = false;
  private irqSourceA12 = false;
  private a12High = false;
  private readonly scratchRam = new Uint8Array(4);

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: ConyYokoBoard,
    solderPad = 0,
  ) {
    this.innerPrg16Mask = board.innerPrgBytes / PRG_16K - 1;
    this.innerPrg8Mask = board.innerPrgBytes / PRG_8K - 1;
    this.solderPad = solderPad & 3;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBase = 0;
    this.mode = 0;
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.irqSourceA12 = false;
    this.a12High = false;
    this.scratchRam.fill(0);
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.ConyYoko,
      board: this.board.id,
      prgBase: this.prgBase,
      mode: this.mode,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      irqSourceA12: this.irqSourceA12,
      a12High: this.a12High,
      scratchRam: this.scratchRam.slice(),
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.ConyYoko) {
      throw new Error(`Cannot restore ${state.kind} state into Cony/Yoko`);
    }
    if (
      state.board !== this.board.id ||
      !isByte(state.prgBase) ||
      !isByte(state.mode) ||
      !isFixedByteArray(state.prgBanks, 4) ||
      state.prgBanks.some((bank) => bank > this.innerPrg8Mask) ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqEnabled, state.irqPending, state.irqSourceA12, state.a12High) ||
      !(state.scratchRam instanceof Uint8Array) ||
      state.scratchRam.byteLength !== 4 ||
      !MIRRORING.some((mirroring) => mirroring === state.mirroring) ||
      state.mirroring !== MIRRORING[state.mode & 3]
    ) {
      throw new RangeError("Cony/Yoko save state contains invalid board, register or IRQ state");
    }
    this.prgBase = state.prgBase;
    this.mode = state.mode;
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.irqSourceA12 = state.irqSourceA12;
    this.a12High = state.a12High;
    this.scratchRam.set(state.scratchRam);
    this.cartridge.mirroringMode = state.mirroring;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqSourceA12) this.clockIrqCounter();
  }

  observePpuAddress(address: number): void {
    const nextA12High = (address & 0x1000) !== 0;
    const rising = nextA12High && !this.a12High;
    this.a12High = nextA12High;
    if (rising && this.irqSourceA12) this.clockIrqCounter();
  }

  read(address: number): number {
    if (address < 0x2000) return this.readChr(address);
    if (address >= 0x8000) return this.readPrg(address);
    if (address < 0x6000) return 0;

    if (this.board.maps32KiBPrgNvRam) {
      return this.cartridge.readPrgRam(this.prgRamBankOffset(address));
    }
    if ((this.mode & 0x20) !== 0) {
      return this.cartridge.prgRom[this.prgRom6000Offset(address)] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    if (address < 0x6000) return 0;
    return this.board.maps32KiBPrgNvRam || (this.mode & 0x20) !== 0 ? 0xff : 0;
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if ((address & 0xf30c) === 0x5100) {
      return { value: this.scratchRam[address & 3] ?? 0, drivenMask: 0xff };
    }
    if ((address & 0xf100) === 0x5000) {
      return { value: this.solderPad, drivenMask: 0x03 };
    }
    return undefined;
  }

  writeCpuExpansion(address: number, value: number): void {
    if ((address & 0xf30c) === 0x5100) this.scratchRam[address & 3] = value;
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) {
      // Every allocated mapper-83 board uses CHR ROM.
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.board.maps32KiBPrgNvRam) {
        this.cartridge.writePrgRam(this.prgRamBankOffset(address), value);
      }
      return;
    }
    if (address < 0x8000) return;

    if ((address & 0x8300) === 0x8000) {
      this.prgBase = value;
      return;
    }
    if ((address & 0x8300) === 0x8100) {
      this.mode = value;
      this.cartridge.mirroringMode = MIRRORING[value & 3];
      return;
    }
    if ((address & 0x8301) === 0x8200) {
      this.irqCounter = (this.irqCounter & 0xff00) | value;
      this.acknowledgeIrq();
      return;
    }
    if ((address & 0x8301) === 0x8201) {
      this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
      this.irqEnabled = (this.mode & 0x80) !== 0;
      return;
    }
    if ((address & 0x8310) === 0x8300) {
      this.prgBanks[address & 3] = value & this.innerPrg8Mask;
      return;
    }
    if ((address & 0x8318) === 0x8310) {
      this.chrBanks[address & 7] = value;
      return;
    }
    if ((address & 0x8318) === 0x8318) {
      // Hardware research identifies the all-zero and all-one values; the
      // decisive individual ASIC data pin remains unknown.
      if (value === 0) this.irqSourceA12 = false;
      if (value === 0xff) this.irqSourceA12 = true;
    }
  }

  private readChr(address: number): number {
    if (this.board.chrBankBytes === 0x0800) {
      const register = [0, 1, 6, 7][address >>> 11] ?? 0;
      const bank = (this.chrBanks[register] ?? 0) % (this.cartridge.chrMemoryBytes / 0x0800);
      return this.cartridge.readChr(bank * 0x0800 + (address & 0x07ff));
    }

    const outer =
      this.board.chrOuterShift === null
        ? 0
        : ((this.prgBase >>> this.board.chrOuterShift) & 3) << 8;
    const bank =
      (outer | (this.chrBanks[address >>> 10] ?? 0)) % (this.cartridge.chrMemoryBytes / 0x0400);
    return this.cartridge.readChr(bank * 0x0400 + (address & 0x03ff));
  }

  private readPrg(address: number): number {
    const mode = (this.mode >>> 3) & 3;
    if (mode < 2) {
      const base = this.prgBase & this.board.prgAddressMask;
      const bank =
        mode === 0 && address >= 0xc000
          ? (base & ~this.innerPrg16Mask) | this.innerPrg16Mask
          : base;
      const normalized = bank % (this.cartridge.prgRom.byteLength / PRG_16K);
      return this.cartridge.prgRom[normalized * PRG_16K + (address & 0x3fff)] ?? 0;
    }

    const slot = (address - 0x8000) >>> 13;
    const outer = (this.prgBase & this.board.prgAddressMask & ~this.innerPrg16Mask) << 1;
    const inner = slot === 3 ? this.innerPrg8Mask : (this.prgBanks[slot] ?? 0) & this.innerPrg8Mask;
    const bank = (outer | inner) % (this.cartridge.prgRom.byteLength / PRG_8K);
    return this.cartridge.prgRom[bank * PRG_8K + (address & 0x1fff)] ?? 0;
  }

  private prgRom6000Offset(address: number): number {
    const outer = (this.prgBase & this.board.prgAddressMask & ~this.innerPrg16Mask) << 1;
    const bank =
      (outer | ((this.prgBanks[3] ?? 0) & this.innerPrg8Mask)) %
      (this.cartridge.prgRom.byteLength / PRG_8K);
    return bank * PRG_8K + (address & 0x1fff);
  }

  private prgRamBankOffset(address: number): number {
    return ((this.prgBase >>> 6) & 3) * PRG_8K + (address & 0x1fff);
  }

  private clockIrqCounter(): void {
    if (!this.irqEnabled || this.irqCounter === 0) return;
    this.irqCounter =
      (this.mode & 0x40) === 0 ? (this.irqCounter + 1) & 0xffff : (this.irqCounter - 1) & 0xffff;
    if (this.irqCounter !== 0) return;
    this.irqEnabled = false;
    this.irqPending = true;
    this.interruptPort.setMapperIrq(true);
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
