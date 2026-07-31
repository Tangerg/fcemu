import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isBit } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";
import { translateVrc24Port, type Vrc24Board } from "./vrc2-vrc4-board.js";
import { VrcIrq } from "./vrc-irq.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const VRC4_MIRRORING = [
  NametableMirroring.Vertical,
  NametableMirroring.Horizontal,
  NametableMirroring.SingleScreenLower,
  NametableMirroring.SingleScreenUpper,
] as const;

/**
 * Konami VRC2/VRC4 banking core used by iNES mappers 21, 22, 23 and 25.
 *
 * The immutable board value owns CPU-address pin routing and ASIC capabilities;
 * this class owns only the common registers, memory windows and optional VRC IRQ.
 */
export class Vrc2Vrc4Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly powerOnMirroring: NametableMirroring;
  private readonly irq: VrcIrq | undefined;
  private prgBanks = [0, 1];
  private chrRegisters = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgMode = 0;
  private wramEnabled = false;
  private microwireLatch = 0;

  constructor(
    interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: Vrc24Board,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrMemoryBytes / CHR_BANK_SIZE;
    this.powerOnMirroring = cartridge.mirroringMode;
    this.irq = board.chip === "vrc4" ? new VrcIrq(interruptPort) : undefined;
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks = [0, 1];
    this.chrRegisters.fill(0);
    this.prgMode = 0;
    this.wramEnabled = false;
    this.microwireLatch = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.irq?.powerOn();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Vrc2Vrc4,
      board: this.board.id,
      prgBanks: [...this.prgBanks],
      chrRegisters: [...this.chrRegisters],
      prgMode: this.prgMode,
      wramEnabled: this.wramEnabled,
      microwireLatch: this.microwireLatch,
      mirroring: this.cartridge.mirroringMode,
      irq: this.irq?.captureState() ?? null,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Vrc2Vrc4) {
      throw new Error(`Cannot restore ${state.kind} state into VRC2/VRC4`);
    }
    const maximumChrRegister = this.board.chip === "vrc4" ? 0x1ff : 0xff;
    if (
      state.board !== this.board.id ||
      !isFixedByteArray(state.prgBanks, 2) ||
      state.prgBanks.some((bank) => bank > 0x1f) ||
      !Array.isArray(state.chrRegisters) ||
      state.chrRegisters.length !== 8 ||
      state.chrRegisters.some(
        (bank) => !Number.isInteger(bank) || bank < 0 || bank > maximumChrRegister,
      ) ||
      !isBit(state.prgMode) ||
      !areBooleans(state.wramEnabled) ||
      !isBit(state.microwireLatch) ||
      !this.acceptsMirroring(state.mirroring) ||
      (this.board.chip === "vrc2" &&
        (state.prgMode !== 0 ||
          state.wramEnabled ||
          state.irq !== null ||
          (this.board.id !== "vrc2b" && state.microwireLatch !== 0))) ||
      (this.board.chip === "vrc4" && (state.microwireLatch !== 0 || state.irq === null))
    ) {
      throw new RangeError("VRC2/VRC4 save state contains invalid board or register state");
    }
    this.prgBanks = [...state.prgBanks];
    this.chrRegisters = [...state.chrRegisters];
    this.prgMode = state.prgMode;
    this.wramEnabled = state.wramEnabled;
    this.microwireLatch = state.microwireLatch;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    if (state.irq !== null) this.irq?.restoreState(state.irq);
  }

  observeCpuBusCycle(_: boolean): void {
    this.irq?.tick();
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const register = this.chrRegisters[slot] ?? 0;
      const bank = (register >>> this.board.chrBankShift) % this.chrBankCount;
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) return this.readPrg(address);
    const ramOffset = this.prgRamOffset(address);
    if (ramOffset !== undefined && this.prgRamIsEnabled()) {
      return this.cartridge.readPrgRam(ramOffset);
    }
    return this.isMicrowireAddress(address) ? this.microwireLatch : 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    const ramOffset = this.prgRamOffset(address);
    if (ramOffset !== undefined && this.prgRamIsEnabled()) return 0xff;
    return this.isMicrowireAddress(address) ? 0x01 : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x6000) return;
    if (address < 0x8000) {
      const ramOffset = this.prgRamOffset(address);
      if (ramOffset !== undefined && this.prgRamIsEnabled()) {
        this.cartridge.writePrgRam(ramOffset, value);
      } else if (this.isMicrowireAddress(address)) {
        this.microwireLatch = value & 1;
      }
      return;
    }

    const page = address & 0xf000;
    const port = translateVrc24Port(this.board, address);
    if (page === 0x8000) {
      this.prgBanks[0] = value & 0x1f;
    } else if (page === 0x9000) {
      this.writeControl(port, value);
    } else if (page === 0xa000) {
      this.prgBanks[1] = value & 0x1f;
    } else if (page >= 0xb000 && page <= 0xe000) {
      this.writeChrRegister(page, port, value);
    } else if (page === 0xf000) {
      this.writeIrqRegister(port, value);
    }
  }

  private readPrg(address: number): number {
    const slot = (address - 0x8000) >>> 13;
    const selectedSlot = this.board.chip === "vrc4" && this.prgMode === 1 ? 2 : 0;
    let bank: number;
    if (slot === selectedSlot) bank = this.prgBanks[0] ?? 0;
    else if (slot === 1) bank = this.prgBanks[1] ?? 0;
    else bank = this.prgBankCount - (slot === 3 ? 1 : 2);
    bank %= this.prgBankCount;
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
  }

  private writeControl(port: number, value: number): void {
    if (this.board.chip === "vrc2") {
      this.cartridge.mirroringMode =
        (value & 1) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
      return;
    }
    if (port <= 1) {
      this.cartridge.mirroringMode = VRC4_MIRRORING[value & 0x03];
    } else if (port === 2) {
      this.wramEnabled = (value & 0x01) !== 0;
      this.prgMode = (value >>> 1) & 1;
    }
  }

  private writeChrRegister(page: number, port: number, value: number): void {
    const registerIndex = ((page - 0xb000) >>> 11) + (port >>> 1);
    const previous = this.chrRegisters[registerIndex] ?? 0;
    if ((port & 1) === 0) {
      this.chrRegisters[registerIndex] = (previous & 0x1f0) | (value & 0x0f);
    } else {
      const highMask = this.board.chip === "vrc4" ? 0x1f : 0x0f;
      this.chrRegisters[registerIndex] = (previous & 0x0f) | ((value & highMask) << 4);
    }
  }

  private writeIrqRegister(port: number, value: number): void {
    if (!this.irq) return;
    if (port <= 1) this.irq.writeLatchNibble(value, port === 1);
    else if (port === 2) this.irq.writeControl(value);
    else this.irq.acknowledge();
  }

  private prgRamOffset(address: number): number | undefined {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes === 0x0800 && address >= 0x6000 && address < 0x7000) {
      return (address - 0x6000) & 0x07ff;
    }
    if (bytes === 0x2000 && address >= 0x6000 && address < 0x8000) {
      return address - 0x6000;
    }
    return undefined;
  }

  private prgRamIsEnabled(): boolean {
    return this.board.chip === "vrc2" || this.wramEnabled;
  }

  private isMicrowireAddress(address: number): boolean {
    return (
      this.board.id === "vrc2b" &&
      this.cartridge.prgWritableBytes === 0 &&
      address >= 0x6000 &&
      address < 0x7000
    );
  }

  private acceptsMirroring(value: number): boolean {
    return this.board.chip === "vrc4"
      ? VRC4_MIRRORING.some((mirroring) => mirroring === value)
      : value === NametableMirroring.Vertical || value === NametableMirroring.Horizontal;
  }
}
