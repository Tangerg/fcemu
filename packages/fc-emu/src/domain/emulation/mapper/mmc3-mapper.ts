import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState, Mmc3State } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

export type Mmc3Board = "standard" | "txsrom" | "tqrom" | "waixing-type-a";
export type Mmc3IrqRevision = "a" | "b";

/** Nintendo MMC3 register core with explicit chip revision and board wiring. */
export class Mmc3Mapper implements Mapper {
  private static readonly A12_LOW_FILTER_PPU_CYCLES = 10;

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
  private irqPending = false;
  private prgRamEnabled = true;
  private prgRamWritable = true;
  private ppuClock = 0;
  private a12High = false;
  private a12LowSince = 0;
  private readonly powerOnMirroring: NametableMirroring;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: Mmc3Board = "standard",
    private readonly irqRevision: Mmc3IrqRevision = "b",
  ) {
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.register = 0;
    this.registers.fill(0);
    this.registers[7] = 1;
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
    this.irqPending = false;
    this.prgRamEnabled = true;
    this.prgRamWritable = true;
    this.ppuClock = 0;
    this.a12High = false;
    this.a12LowSince = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): Mmc3State {
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
      irqPending: this.irqPending,
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
    if (!isFixedByteArray(state.registers, 8)) {
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
      state.a12LowSince > state.ppuClock ||
      !areBooleans(
        state.reloadPending,
        state.irqEnable,
        state.irqPending,
        state.prgRamEnabled,
        state.prgRamWritable,
        state.a12High,
      ) ||
      (state.irqPending && !state.irqEnable)
    ) {
      throw new RangeError("MMC3 save state contains invalid timing or register state");
    }
    if (!this.acceptsMirroring(state.mirroring)) {
      throw new RangeError("MMC3 save state contains invalid mirroring for this board");
    }
    this.register = state.register;
    this.registers = [...state.registers];
    this.prgMode = state.prgMode;
    this.chrMode = state.chrMode;
    this.reload = state.reload;
    this.counter = state.counter;
    this.reloadPending = state.reloadPending;
    this.irqEnable = state.irqEnable;
    this.irqPending = state.irqPending;
    this.prgRamEnabled = state.prgRamEnabled;
    this.prgRamWritable = state.prgRamWritable;
    this.ppuClock = state.ppuClock;
    this.a12High = state.a12High;
    this.a12LowSince = state.a12LowSince;
    this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    this.updateOffsets();
    this.interruptPort.setMapperIrq(this.irqPending);
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
    const decremented = this.counter !== 0 && !this.reloadPending;
    if (this.counter === 0 || this.reloadPending) {
      this.counter = this.reload;
    } else {
      this.counter--;
    }
    this.reloadPending = false;
    if (this.counter === 0 && this.irqEnable && (this.irqRevision === "b" || decremented)) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  read(address: number): number {
    if (address < 0x2000) {
      if (this.board === "tqrom") return this.readTqromChr(address);
      if (this.board === "waixing-type-a") return this.readWaixingTypeAChr(address);
      const bank = Math.floor(address / 0x0400);
      const offset = address % 0x0400;
      return this.cartridge.readChr(this.chrOffsets[bank] + offset);
    } else if (address >= 0x8000) {
      address = address - 0x8000;
      const bank = Math.floor(address / 0x2000);
      const offset = address % 0x2000;
      return this.cartridge.prgRom[this.prgOffsets[bank] + offset];
    } else if (address >= 0x6000) {
      return this.mapsPrgRam && this.prgRamEnabled
        ? this.cartridge.readPrgRam(address - 0x6000)
        : 0;
    } else {
      return 0;
    }
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ||
      (address >= 0x6000 &&
        this.mapsPrgRam &&
        this.prgRamEnabled &&
        this.cartridge.prgWritableBytes > 0)
      ? 0xff
      : 0;
  }

  mapNametableAddress(address: number): number | undefined {
    if (this.board !== "txsrom") return undefined;
    const nametableOffset = (address - 0x2000) & 0x0fff;
    const chrBank = this.chrBankValue(nametableOffset);
    return ((chrBank >>> 7) & 1) * 0x0400 + (nametableOffset & 0x03ff);
  }

  /**
   * Reports the MMC3 PRG bank output selected for one CPU window before any
   * board-specific outer address wiring is applied.
   */
  selectedPrgBank(address: number): number {
    if (address < 0x8000 || address > 0xffff) {
      throw new RangeError("MMC3 PRG bank selection requires a CPU ROM address");
    }
    return this.prgOffsets[(address - 0x8000) >>> 13] >>> 13;
  }

  /**
   * Reports the MMC3 CHR bank output for one PPU address. Clone boards can
   * route these output pins to memories other than CHR without duplicating the
   * register decoder.
   */
  selectedChrBank(address: number): number {
    return this.chrBankValue(address & 0x1fff);
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      if (this.board === "tqrom") {
        this.writeTqromChr(address, value);
        return;
      }
      if (this.board === "waixing-type-a") {
        this.writeWaixingTypeAChr(address, value);
        return;
      }
      const bank = Math.floor(address / 0x0400);
      const offset = address % 0x0400;
      this.cartridge.writeChr(this.chrOffsets[bank] + offset, value);
    } else if (address >= 0x8000) {
      this.writeRegister(address, value);
    } else if (address >= 0x6000 && this.mapsPrgRam && this.prgRamEnabled && this.prgRamWritable) {
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
    if (this.board === "txsrom") return;
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

  private acceptsMirroring(value: number): boolean {
    if (this.board === "txsrom" || this.powerOnMirroring === NametableMirroring.FourScreen) {
      return value === this.powerOnMirroring;
    }
    return value === NametableMirroring.Horizontal || value === NametableMirroring.Vertical;
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
    this.irqPending = false;
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

  private chrBankValue(address: number): number {
    const slot = (address >> 10) & 0x07;
    if (this.chrMode === 0) {
      if (slot === 0) return this.registers[0] & 0xfe;
      if (slot === 1) return this.registers[0] | 0x01;
      if (slot === 2) return this.registers[1] & 0xfe;
      if (slot === 3) return this.registers[1] | 0x01;
      return this.registers[slot - 2];
    }
    if (slot < 4) return this.registers[slot + 2];
    if (slot === 4) return this.registers[0] & 0xfe;
    if (slot === 5) return this.registers[0] | 0x01;
    if (slot === 6) return this.registers[1] & 0xfe;
    return this.registers[1] | 0x01;
  }

  private readTqromChr(address: number): number {
    const bank = this.chrBankValue(address);
    const ramSelected = (bank & 0x40) !== 0;
    const selectedBank = bank & (ramSelected ? 0x07 : 0x3f);
    const offset = selectedBank * 0x0400 + (address & 0x03ff);
    return ramSelected ? this.cartridge.readWritableChr(offset) : this.cartridge.readChr(offset);
  }

  private writeTqromChr(address: number, value: number): void {
    const bank = this.chrBankValue(address);
    if ((bank & 0x40) === 0) return;
    const offset = (bank & 0x07) * 0x0400 + (address & 0x03ff);
    this.cartridge.writeWritableChr(offset, value);
  }

  private readWaixingTypeAChr(address: number): number {
    const bank = this.chrBankValue(address);
    if (bank === 0x08 || bank === 0x09) {
      return this.cartridge.readWritableChr((bank - 0x08) * 0x0400 + (address & 0x03ff));
    }
    return this.cartridge.readChr(this.chrBankOffset(bank) + (address & 0x03ff));
  }

  private writeWaixingTypeAChr(address: number, value: number): void {
    const bank = this.chrBankValue(address);
    if (bank !== 0x08 && bank !== 0x09) return;
    this.cartridge.writeWritableChr((bank - 0x08) * 0x0400 + (address & 0x03ff), value);
  }

  private get mapsPrgRam(): boolean {
    return this.board !== "tqrom";
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

    for (let slot = 0; slot < this.chrOffsets.length; slot++) {
      this.chrOffsets[slot] = this.chrBankOffset(this.chrBankValue(slot * 0x0400));
    }
  }
}
