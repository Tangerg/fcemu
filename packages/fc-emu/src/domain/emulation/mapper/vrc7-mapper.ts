import type Cartridge from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";
import { Vrc7Audio } from "./vrc7-audio.js";
import { VrcIrq } from "./vrc-irq.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

export type Vrc7Board = "vrc7-auto" | "vrc7b" | "vrc7a";

/**
 * Konami VRC7 banking, board-specific A3/A4 routing, IRQ and optional FM audio.
 *
 * Submapper 0 accepts either historical register-select line. Submappers 1 and
 * 2 model the actual VRC7b and VRC7a PCBs, including the VRC7b board's absent
 * resonator and audio mixing path.
 */
export class Vrc7Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly irq: VrcIrq;
  private readonly audio: Vrc7Audio | undefined;
  private prgBanks = [0, 0, 0];
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private control = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: Vrc7Board,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.irq = new VrcIrq(interruptPort);
    this.audio = board === "vrc7b" ? undefined : new Vrc7Audio();
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.control = 0;
    this.irq.powerOn();
    this.audio?.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Vrc7,
      board: this.board,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      control: this.control,
      audio: this.audio?.captureState() ?? null,
      irq: this.irq.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Vrc7) {
      throw new Error(`Cannot restore ${state.kind} state into VRC7`);
    }
    if (
      state.board !== this.board ||
      !isFixedByteArray(state.prgBanks, 3) ||
      state.prgBanks.some((bank) => bank > 0x3f) ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !isByte(state.control) ||
      (this.audio === undefined) !== (state.audio === null) ||
      (state.audio !== null && state.audio.reset !== ((state.control & 0x40) !== 0))
    ) {
      throw new RangeError("VRC7 save state contains invalid board or banking state");
    }
    if (this.audio && state.audio) this.audio.validateState(state.audio);
    this.irq.validateState(state.irq);
    if (this.audio && state.audio) this.audio.restoreState(state.audio);
    this.irq.restoreState(state.irq);
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.control = state.control;
  }

  observeCpuBusCycle(_: boolean): void {
    this.irq.tick();
    this.audio?.tick();
  }

  expansionAudioSample(): number {
    return this.audio?.output() ?? 0;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = (this.chrBanks[address >>> 10] ?? 0) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const bank =
        slot === 3 ? this.prgBankCount - 1 : (this.prgBanks[slot] ?? 0) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    if (address >= 0x6000 && (this.control & 0x80) !== 0) {
      return this.cartridge.readPrgRam(address & 0x1fff);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && (this.control & 0x80) !== 0 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) {
      const bank = (this.chrBanks[address >>> 10] ?? 0) % this.chrBankCount;
      this.cartridge.writeChr(bank * CHR_BANK_SIZE + (address & 0x03ff), value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if ((this.control & 0x80) !== 0) this.cartridge.writePrgRam(address & 0x1fff, value);
      return;
    }
    if (address < 0x8000) return;

    const soundPort = address & 0xf030;
    if (soundPort === 0x9010) {
      this.audio?.writeAddress(value);
      return;
    }
    if (soundPort === 0x9030) {
      this.audio?.writeData(value);
      return;
    }

    const decoded = this.decodeMapperPort(address);
    if (!decoded) return;
    const { page, secondary } = decoded;
    if (page === 0x8000) {
      this.prgBanks[secondary ? 1 : 0] = value & 0x3f;
    } else if (page === 0x9000 && !secondary) {
      this.prgBanks[2] = value & 0x3f;
    } else if (page >= 0xa000 && page <= 0xd000) {
      const slot = ((page - 0xa000) >>> 11) + (secondary ? 1 : 0);
      this.chrBanks[slot] = value;
    } else if (page === 0xe000) {
      if (secondary) {
        this.irq.writeLatch(value);
      } else {
        this.control = value;
        this.audio?.setReset((value & 0x40) !== 0);
      }
    } else if (page === 0xf000) {
      if (secondary) this.irq.acknowledge();
      else this.irq.writeControl(value);
    }
  }

  mapNametableAddress(address: number): number {
    const slot = ((address - 0x2000) >>> 10) & 3;
    switch (this.control & 3) {
      case 0:
        return (slot & 1) * 0x0400 + (address & 0x03ff);
      case 1:
        return (slot >>> 1) * 0x0400 + (address & 0x03ff);
      case 2:
        return address & 0x03ff;
      default:
        return 0x0400 + (address & 0x03ff);
    }
  }

  private decodeMapperPort(
    address: number,
  ): { readonly page: number; readonly secondary: boolean } | undefined {
    const masked = address & 0xf038;
    if ((masked & 0x20) !== 0) return undefined;
    const selectBits = masked & 0x18;
    let secondary: boolean;
    if (this.board === "vrc7a") {
      secondary = (selectBits & 0x10) !== 0;
    } else if (this.board === "vrc7b") {
      secondary = (selectBits & 0x08) !== 0;
    } else {
      secondary = selectBits !== 0;
    }
    return { page: masked & 0xf000, secondary };
  }
}
