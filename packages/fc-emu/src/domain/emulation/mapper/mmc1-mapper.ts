import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { Mmc1Board } from "./mmc1-board.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

/**
 * Nintendo MMC1 plus the board wiring selected from the cartridge memory shape.
 *
 * The ASIC exposes generic CHR output lines. SxROM boards repurpose those lines
 * for outer PRG-ROM and PRG-RAM banking; this entity owns that wiring policy.
 */
export class Mmc1Mapper implements Mapper {
  readonly observesPpuAddress = false;

  private shiftRegister = 0x10;
  private control = 0x0c;
  private chrBank0 = 0;
  private chrBank1 = 0;
  private prgBank = 0;
  private activeChrRegister: 0 | 1 = 0;
  private previousCpuCycleWasWrite = false;
  private ignoreSerialDataWrite = false;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly board: Mmc1Board = Mmc1Board.standard(),
  ) {
    this.powerOn();
  }

  powerOn(): void {
    this.shiftRegister = 0x10;
    this.control = 0x0c;
    this.chrBank0 = 0;
    this.chrBank1 = 0;
    this.prgBank = 0;
    this.activeChrRegister = 0;
    this.previousCpuCycleWasWrite = false;
    this.ignoreSerialDataWrite = false;
    this.updateMirroring();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Mmc1,
      shiftRegister: this.shiftRegister,
      control: this.control,
      chrBank0: this.chrBank0,
      chrBank1: this.chrBank1,
      prgBank: this.prgBank,
      activeChrRegister: this.activeChrRegister,
      previousCpuCycleWasWrite: this.previousCpuCycleWasWrite,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Mmc1)
      throw new Error(`Cannot restore ${state.kind} state into MMC1`);
    for (const value of [
      state.shiftRegister,
      state.control,
      state.chrBank0,
      state.chrBank1,
      state.prgBank,
    ]) {
      if (!Number.isInteger(value) || value < 0 || value > 0x1f) {
        throw new RangeError("MMC1 save state contains an invalid register");
      }
    }
    if (state.activeChrRegister !== 0 && state.activeChrRegister !== 1) {
      throw new RangeError("MMC1 save state contains an invalid active CHR register");
    }
    if (typeof state.previousCpuCycleWasWrite !== "boolean") {
      throw new TypeError("MMC1 save state contains invalid CPU bus state");
    }
    this.shiftRegister = state.shiftRegister;
    this.control = state.control;
    this.chrBank0 = state.chrBank0;
    this.chrBank1 = state.chrBank1;
    this.prgBank = state.prgBank;
    this.activeChrRegister = state.activeChrRegister;
    this.previousCpuCycleWasWrite = state.previousCpuCycleWasWrite;
    this.ignoreSerialDataWrite = false;
    this.updateMirroring();
  }

  observeCpuBusCycle(write: boolean): void {
    this.ignoreSerialDataWrite = write && this.previousCpuCycleWasWrite;
    this.previousCpuCycleWasWrite = write;
  }

  read(address: number): number {
    if (address < 0x2000) {
      this.activeChrRegister = address < 0x1000 ? 0 : 1;
      return this.cartridge.readChr(this.chrOffset(address));
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[this.prgOffset(address)] ?? 0;
    }
    if (address >= 0x6000 && this.isPrgRamEnabled) {
      return this.cartridge.readPrgRam(this.prgRamOffset(address));
    }
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.activeChrRegister = address < 0x1000 ? 0 : 1;
      this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address >= 0x8000) {
      this.writeSerial(address, value);
      return;
    }
    if (address >= 0x6000 && this.isPrgRamEnabled) {
      this.cartridge.writePrgRam(this.prgRamOffset(address), value);
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private get isPrgRamEnabled(): boolean {
    return this.board.isPrgRamEnabled(this.prgBank, this.activeChrBank);
  }

  private get activeChrBank(): number {
    if ((this.control & 0x10) === 0 || this.activeChrRegister === 0) return this.chrBank0;
    return this.chrBank1;
  }

  private writeSerial(address: number, value: number): void {
    if ((value & 0x80) !== 0) {
      this.shiftRegister = 0x10;
      this.control |= 0x0c;
      this.updateMirroring();
      return;
    }
    if (this.ignoreSerialDataWrite) return;

    const completesWrite = (this.shiftRegister & 1) !== 0;
    this.shiftRegister = (this.shiftRegister >> 1) | ((value & 1) << 4);
    if (!completesWrite) return;

    this.commitRegister(address, this.shiftRegister);
    this.shiftRegister = 0x10;
  }

  private commitRegister(address: number, value: number): void {
    switch ((address >> 13) & 0x03) {
      case 0:
        this.control = value;
        this.updateMirroring();
        break;
      case 1:
        this.chrBank0 = value;
        break;
      case 2:
        this.chrBank1 = value;
        break;
      case 3:
        this.prgBank = value;
        break;
    }
  }

  private updateMirroring(): void {
    const modes = [
      NametableMirroring.SingleScreenLower,
      NametableMirroring.SingleScreenUpper,
      NametableMirroring.Vertical,
      NametableMirroring.Horizontal,
    ] as const;
    this.cartridge.mirroringMode = modes[this.control & 0x03];
  }

  private prgOffset(address: number): number {
    if (this.board.hasFixedPrgRom) return address - 0x8000;
    const totalBanks = this.cartridge.prgRom.length / 0x4000;
    const outerBank = this.board.prgOuterBank(this.activeChrBank);
    const banksInOuterWindow = Math.min(16, totalBanks - outerBank);
    const mode = (this.control >> 2) & 0x03;
    let bank: number;
    let offset: number;

    if (mode <= 1) {
      bank = (this.prgBank & 0x0e) % banksInOuterWindow;
      offset = address - 0x8000;
    } else if (mode === 2) {
      bank = address < 0xc000 ? 0 : (this.prgBank & 0x0f) % banksInOuterWindow;
      offset = address & 0x3fff;
    } else {
      bank = address < 0xc000 ? (this.prgBank & 0x0f) % banksInOuterWindow : banksInOuterWindow - 1;
      offset = address & 0x3fff;
    }

    return (outerBank + bank) * 0x4000 + offset;
  }

  private chrOffset(address: number): number {
    const bankCount = Math.max(1, this.cartridge.chrMemoryBytes / 0x1000);
    const usesFourKilobyteBanks = (this.control & 0x10) !== 0;
    let bank: number;
    let offset: number;

    if (usesFourKilobyteBanks) {
      bank = (address < 0x1000 ? this.chrBank0 : this.chrBank1) % bankCount;
      offset = address & 0x0fff;
    } else {
      bank = (this.chrBank0 & 0x1e) % bankCount;
      offset = address;
    }

    return (bank * 0x1000 + offset) % this.cartridge.chrMemoryBytes;
  }

  private prgRamOffset(address: number): number {
    const bank = this.board.prgRamBank(this.activeChrBank);
    return bank * 0x2000 + (address - 0x6000);
  }
}
