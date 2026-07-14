import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

/** iNES mapper 4: Nintendo MMC3 with revision-B IRQ counter behavior. */
export class Mmc3Mapper implements Mapper {
  private static readonly A12_LOW_FILTER_PPU_CYCLES = 10;
  readonly observesPpuAddress = true;

  private register = 0;
  private registers: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgMode = 0;
  private chrMode = 0;
  private prgOffsets: number[] = [0, 0, 0, 0];
  private chrOffsets: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
  private reload = 0;
  private counter = 0;
  private reloadPending = false;
  private irqEnable = false;
  private prgRamEnabled = true;
  private prgRamWritable = true;
  private ppuClock = 0;
  private a12High = false;
  private a12LowSince = 0;
  private readonly powerOnMirroring: NametableMirroring;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.register = 0;
    this.registers.fill(0);
    this.prgMode = 0;
    this.chrMode = 0;
    this.prgOffsets[0] = this.prgBankOffset(0);
    this.prgOffsets[1] = this.prgBankOffset(1);
    this.prgOffsets[2] = this.prgBankOffset(-2);
    this.prgOffsets[3] = this.prgBankOffset(-1);
    this.chrOffsets.fill(0);
    this.reload = 0;
    this.counter = 0;
    this.reloadPending = false;
    this.irqEnable = false;
    this.prgRamEnabled = true;
    this.prgRamWritable = true;
    this.ppuClock = 0;
    this.a12High = false;
    this.a12LowSince = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Mmc3,
      register: this.register,
      registers: [...this.registers],
      prgMode: this.prgMode,
      chrMode: this.chrMode,
      reload: this.reload,
      counter: this.counter,
      reloadPending: this.reloadPending,
      irqEnable: this.irqEnable,
      prgRamEnabled: this.prgRamEnabled,
      prgRamWritable: this.prgRamWritable,
      ppuClock: this.ppuClock,
      a12High: this.a12High,
      a12LowSince: this.a12LowSince,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Mmc3)
      throw new Error(`Cannot restore ${state.kind} state into MMC3`);
    if (state.registers.length !== 8 || state.registers.some((value) => !isByte(value))) {
      throw new RangeError("MMC3 save state contains invalid bank registers");
    }
    if (
      !Number.isInteger(state.register) ||
      state.register < 0 ||
      state.register > 7 ||
      !isBit(state.prgMode) ||
      !isBit(state.chrMode) ||
      !isByte(state.reload) ||
      !isByte(state.counter) ||
      !Number.isSafeInteger(state.ppuClock) ||
      state.ppuClock < 0 ||
      !Number.isSafeInteger(state.a12LowSince) ||
      state.a12LowSince < 0 ||
      state.a12LowSince > state.ppuClock
    ) {
      throw new RangeError("MMC3 save state contains invalid timing or register state");
    }
    if (!Object.values(NametableMirroring).includes(state.mirroring as NametableMirroring)) {
      throw new RangeError("MMC3 save state contains invalid mirroring");
    }
    this.register = state.register;
    this.registers = [...state.registers];
    this.prgMode = state.prgMode;
    this.chrMode = state.chrMode;
    this.reload = state.reload;
    this.counter = state.counter;
    this.reloadPending = state.reloadPending;
    this.irqEnable = state.irqEnable;
    this.prgRamEnabled = state.prgRamEnabled;
    this.prgRamWritable = state.prgRamWritable;
    this.ppuClock = state.ppuClock;
    this.a12High = state.a12High;
    this.a12LowSince = state.a12LowSince;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.updateOffsets();
  }

  tickPpu(): void {
    this.ppuClock++;
  }

  observePpuAddress(address: number): void {
    const a12High = (address & 0x1000) !== 0;
    if (!a12High) {
      if (this.a12High) this.a12LowSince = this.ppuClock;
      this.a12High = false;
      return;
    }
    if (this.a12High) return;

    this.a12High = true;
    if (this.ppuClock - this.a12LowSince < Mmc3Mapper.A12_LOW_FILTER_PPU_CYCLES) return;
    this.clockIRQCounter();
  }

  private clockIRQCounter(): void {
    if (this.counter === 0 || this.reloadPending) {
      this.counter = this.reload;
    } else {
      this.counter--;
    }
    this.reloadPending = false;
    if (this.counter === 0 && this.irqEnable) this.interruptPort.setMapperIrq(true);
  }

  read(address: number): number {
    if (address < 0x2000) {
      const bank = Math.floor(address / 0x0400);
      const offset = address % 0x0400;
      return this.cartridge.readChr(this.chrOffsets[bank] + offset);
    } else if (address >= 0x8000) {
      address = address - 0x8000;
      const bank = Math.floor(address / 0x2000);
      const offset = address % 0x2000;
      return this.cartridge.prgRom[this.prgOffsets[bank] + offset];
    } else if (address >= 0x6000) {
      return this.prgRamEnabled ? this.cartridge.readPrgRam(address - 0x6000) : 0;
    } else {
      return 0;
    }
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      const bank = Math.floor(address / 0x0400);
      const offset = address % 0x0400;
      this.cartridge.writeChr(this.chrOffsets[bank] + offset, value);
    } else if (address >= 0x8000) {
      this.writeRegister(address, value);
    } else if (address >= 0x6000 && this.prgRamEnabled && this.prgRamWritable) {
      this.cartridge.writePrgRam(address - 0x6000, value);
    }
  }

  private writeRegister(address: number, value: number): void {
    if (address <= 0x9fff && address % 2 === 0) {
      this.writeBankSelect(value);
    } else if (address <= 0x9fff && address % 2 === 1) {
      this.writeBankData(value);
    } else if (address <= 0xbfff && address % 2 === 0) {
      this.writeMirror(value);
    } else if (address <= 0xbfff && address % 2 === 1) {
      this.writeProtect(value);
    } else if (address <= 0xdfff && address % 2 === 0) {
      this.writeIRQLatch(value);
    } else if (address <= 0xdfff && address % 2 === 1) {
      this.writeIRQReload(value);
    } else if (address <= 0xffff && address % 2 === 0) {
      this.writeIRQDisable(value);
    } else if (address <= 0xffff && address % 2 === 1) {
      this.writeIRQEnable(value);
    }
  }

  private writeBankSelect(value: number): void {
    this.prgMode = (value >> 6) & 1;
    this.chrMode = (value >> 7) & 1;
    this.register = value & 7;
    this.updateOffsets();
  }

  private writeBankData(value: number): void {
    this.registers[this.register] = value;
    this.updateOffsets();
  }

  private writeMirror(value: number): void {
    if (this.cartridge.mirroringMode === NametableMirroring.FourScreen) return;
    switch (value & 1) {
      case 0:
        this.cartridge.mirroringMode = NametableMirroring.Vertical;
        break;
      case 1:
        this.cartridge.mirroringMode = NametableMirroring.Horizontal;
        break;
    }
  }

  private writeProtect(value: number): void {
    this.prgRamEnabled = (value & 0x80) !== 0;
    this.prgRamWritable = (value & 0x40) === 0;
  }

  private writeIRQLatch(value: number): void {
    this.reload = value;
  }

  private writeIRQReload(_: number): void {
    this.reloadPending = true;
  }

  private writeIRQDisable(_: number): void {
    this.irqEnable = false;
    this.interruptPort.setMapperIrq(false);
  }

  private writeIRQEnable(_: number): void {
    this.irqEnable = true;
  }

  private prgBankOffset(index: number): number {
    if (index >= 0x80) {
      index -= 0x100;
    }
    index %= Math.floor(this.cartridge.prgRom.length / 0x2000);
    let offset = index * 0x2000;
    if (offset < 0) {
      offset += this.cartridge.prgRom.length;
    }
    return offset;
  }

  private chrBankOffset(index: number): number {
    if (index >= 0x80) {
      index -= 0x100;
    }
    index %= Math.floor(this.cartridge.chrMemoryBytes / 0x0400);
    let offset = index * 0x0400;
    if (offset < 0) {
      offset += this.cartridge.chrMemoryBytes;
    }
    return offset;
  }

  private updateOffsets(): void {
    switch (this.prgMode) {
      case 0:
        this.prgOffsets[0] = this.prgBankOffset(this.registers[6]);
        this.prgOffsets[1] = this.prgBankOffset(this.registers[7]);
        this.prgOffsets[2] = this.prgBankOffset(-2);
        this.prgOffsets[3] = this.prgBankOffset(-1);
        break;
      case 1:
        this.prgOffsets[0] = this.prgBankOffset(-2);
        this.prgOffsets[1] = this.prgBankOffset(this.registers[7]);
        this.prgOffsets[2] = this.prgBankOffset(this.registers[6]);
        this.prgOffsets[3] = this.prgBankOffset(-1);
        break;
    }

    switch (this.chrMode) {
      case 0:
        this.chrOffsets[0] = this.chrBankOffset(this.registers[0] & 0xfe);
        this.chrOffsets[1] = this.chrBankOffset(this.registers[0] | 0x01);
        this.chrOffsets[2] = this.chrBankOffset(this.registers[1] & 0xfe);
        this.chrOffsets[3] = this.chrBankOffset(this.registers[1] | 0x01);
        this.chrOffsets[4] = this.chrBankOffset(this.registers[2]);
        this.chrOffsets[5] = this.chrBankOffset(this.registers[3]);
        this.chrOffsets[6] = this.chrBankOffset(this.registers[4]);
        this.chrOffsets[7] = this.chrBankOffset(this.registers[5]);
        break;
      case 1:
        this.chrOffsets[0] = this.chrBankOffset(this.registers[2]);
        this.chrOffsets[1] = this.chrBankOffset(this.registers[3]);
        this.chrOffsets[2] = this.chrBankOffset(this.registers[4]);
        this.chrOffsets[3] = this.chrBankOffset(this.registers[5]);
        this.chrOffsets[4] = this.chrBankOffset(this.registers[0] & 0xfe);
        this.chrOffsets[5] = this.chrBankOffset(this.registers[0] | 0x01);
        this.chrOffsets[6] = this.chrBankOffset(this.registers[1] & 0xfe);
        this.chrOffsets[7] = this.chrBankOffset(this.registers[1] | 0x01);
        break;
    }
  }
}
