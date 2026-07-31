import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";
import { Vrc6Audio } from "./vrc6-audio.js";
import { VrcIrq } from "./vrc-irq.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const NAMETABLE_BANK_SIZE = 0x0400;

export type Vrc6Board = "vrc6a" | "vrc6b";

/** Konami VRC6a/VRC6b banking, nametable routing, IRQ and expansion audio. */
export class Vrc6Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnPpuMode: number;
  private readonly irq: VrcIrq;
  private readonly audio = new Vrc6Audio();
  private prgBank16 = 0;
  private prgBank8 = 0;
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private ppuMode = 0x20;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: Vrc6Board,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOnPpuMode = cartridge.mirroringMode === NametableMirroring.Horizontal ? 0x24 : 0x20;
    this.irq = new VrcIrq(interruptPort);
    this.powerOn();
  }

  powerOn(): void {
    this.prgBank16 = 0;
    this.prgBank8 = 0;
    this.chrBanks.fill(0);
    this.ppuMode = this.powerOnPpuMode;
    this.audio.powerOn();
    this.irq.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Vrc6,
      board: this.board,
      prgBank16: this.prgBank16,
      prgBank8: this.prgBank8,
      chrBanks: [...this.chrBanks],
      ppuMode: this.ppuMode,
      audio: this.audio.captureState(),
      irq: this.irq.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Vrc6) {
      throw new Error(`Cannot restore ${state.kind} state into VRC6`);
    }
    if (
      state.board !== this.board ||
      !Number.isInteger(state.prgBank16) ||
      state.prgBank16 < 0 ||
      state.prgBank16 > 0x0f ||
      !Number.isInteger(state.prgBank8) ||
      state.prgBank8 < 0 ||
      state.prgBank8 > 0x1f ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !isByte(state.ppuMode)
    ) {
      throw new RangeError("VRC6 save state contains invalid board or banking state");
    }
    this.audio.restoreState(state.audio);
    this.irq.restoreState(state.irq);
    this.prgBank16 = state.prgBank16;
    this.prgBank8 = state.prgBank8;
    this.chrBanks = [...state.chrBanks];
    this.ppuMode = state.ppuMode;
  }

  observeCpuBusCycle(_: boolean): void {
    this.audio.tick();
    this.irq.tick();
  }

  expansionAudioSample(): number {
    return this.audio.output();
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = this.selectedChrBank(address);
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) return this.readPrg(address);
    if (address >= 0x6000 && (this.ppuMode & 0x80) !== 0) {
      return this.cartridge.readPrgRam(address & 0x1fff);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && (this.ppuMode & 0x80) !== 0 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) return;
    if (address >= 0x6000 && address < 0x8000) {
      if ((this.ppuMode & 0x80) !== 0) {
        this.cartridge.writePrgRam(address & 0x1fff, value);
      }
      return;
    }
    if (address < 0x8000) return;

    const port = this.translatePort(address);
    const page = port & 0xf000;
    const register = port & 3;
    if (page === 0x8000) {
      this.prgBank16 = value & 0x0f;
    } else if (page === 0x9000 || page === 0xa000 || (page === 0xb000 && register < 3)) {
      this.audio.writeRegister(port, value);
    } else if (page === 0xb000 && register === 3) {
      this.ppuMode = value;
    } else if (page === 0xc000) {
      this.prgBank8 = value & 0x1f;
    } else if (page === 0xd000 || page === 0xe000) {
      this.chrBanks[((page - 0xd000) >>> 10) + register] = value;
    } else if (page === 0xf000) {
      this.writeIrq(register, value);
    }
  }

  mapNametableAddress(address: number): number | undefined {
    if ((this.ppuMode & 0x10) !== 0) return undefined;
    const offset = (address - 0x2000) & 0x0fff;
    const bank = this.selectedNametableBank(offset >>> 10);
    return (bank & 1) * NAMETABLE_BANK_SIZE + (offset & 0x03ff);
  }

  readNametable(address: number): number | undefined {
    if ((this.ppuMode & 0x10) === 0) return undefined;
    const offset = (address - 0x2000) & 0x0fff;
    const bank = this.selectedNametableBank(offset >>> 10) % this.chrBankCount;
    return this.cartridge.readChr(bank * NAMETABLE_BANK_SIZE + (offset & 0x03ff));
  }

  writeNametable(_address: number, _value: number): boolean {
    return (this.ppuMode & 0x10) !== 0;
  }

  private readPrg(address: number): number {
    let bank: number;
    if (address < 0xc000) {
      bank = this.prgBank16 * 2 + ((address >>> 13) & 1);
    } else if (address < 0xe000) {
      bank = this.prgBank8;
    } else {
      bank = this.prgBankCount - 1;
    }
    bank %= this.prgBankCount;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  private selectedChrBank(address: number): number {
    const slot = address >>> 10;
    const mode = this.ppuMode & 3;
    const register =
      mode === 0 ? slot : mode === 1 ? slot >>> 1 : slot < 4 ? slot : 4 + ((slot - 4) >>> 1);
    let bank = this.chrBanks[register] ?? 0;
    if ((this.ppuMode & 0x20) !== 0) bank = (bank & 0xfe) | (slot & 1);
    return bank % this.chrBankCount;
  }

  private selectedNametableBank(slot: number): number {
    const mode = this.ppuMode & 3;
    const mirroring = (this.ppuMode >>> 2) & 3;
    if ((this.ppuMode & 0x20) === 0) {
      const lowMode = this.ppuMode & 7;
      const register =
        lowMode === 0 || lowMode >= 6
          ? slot < 2
            ? 6
            : 7
          : lowMode === 1 || lowMode === 5
            ? 4 + slot
            : 6 + (slot & 1);
      return this.chrBanks[register] ?? 0;
    }

    if (mode === 1) return this.chrBanks[4 + slot] ?? 0;
    if (mode === 2) {
      const horizontal = (mirroring & 1) !== 0;
      const register = horizontal ? 6 + (slot >>> 1) : 6 + (slot & 1);
      return this.chrBanks[register] ?? 0;
    }

    let register: number;
    let lowBit: number;
    if (mode === 0) {
      if (mirroring === 0) {
        register = slot < 2 ? 6 : 7;
        lowBit = slot & 1;
      } else if (mirroring === 1) {
        register = 6 + (slot & 1);
        lowBit = slot >>> 1;
      } else {
        register = mirroring === 2 ? (slot < 2 ? 6 : 7) : 6 + (slot & 1);
        lowBit = mirroring & 1;
      }
    } else if (mirroring === 0) {
      register = 6 + (slot & 1);
      lowBit = slot >>> 1;
    } else if (mirroring === 1) {
      register = 6 + (slot >>> 1);
      lowBit = slot & 1;
    } else {
      register = mirroring === 2 ? 6 + (slot & 1) : 6 + (slot >>> 1);
      lowBit = mirroring === 2 ? 1 : 0;
    }
    return ((this.chrBanks[register] ?? 0) & 0xfe) | lowBit;
  }

  private translatePort(address: number): number {
    const masked = address & 0xf003;
    if (this.board === "vrc6a") return masked;
    return (masked & 0xfffc) | ((masked & 1) << 1) | ((masked & 2) >>> 1);
  }

  private writeIrq(register: number, value: number): void {
    if (register === 0) this.irq.writeLatch(value);
    else if (register === 1) this.irq.writeControl(value);
    else if (register === 2) this.irq.acknowledge();
  }
}
