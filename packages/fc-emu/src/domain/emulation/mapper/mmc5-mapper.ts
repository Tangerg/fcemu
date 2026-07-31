import type Cartridge from "../../model/cartridge.js";
import { isByte, isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState, PpuFetchContext } from "./mapper.js";
import { Mmc5Audio } from "./mmc5-audio.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;

interface PrgMapping {
  readonly kind: "rom" | "ram";
  readonly index: number;
}

/** Nintendo MMC5 banking, ExRAM/fill routing, scanline IRQ, timer and audio. */
export class Mmc5Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly audio = new Mmc5Audio();
  private prgMode = 3;
  private chrMode = 3;
  private prgBanks = [0, 0, 0, 0, 0xff];
  private chrBanksA = Array.from({ length: 8 }, () => 0);
  private chrBanksB = Array.from({ length: 4 }, () => 0);
  private chrUpperBits = 0;
  private lastChrSet: "a" | "b" = "a";
  private prgRamProtect1 = 0;
  private prgRamProtect2 = 0;
  private exRamMode = 3;
  private nametableMapping = 0;
  private fillTile = 0;
  private fillPalette = 0;
  private splitControl = 0;
  private splitScroll = 0;
  private splitBank = 0;
  private irqTarget = 0;
  private irqEnabled = false;
  private irqPending = false;
  private inFrame = false;
  private scanlineCounter = 0;
  private ppuIdleCpuCycles = 3;
  private spriteSize16 = false;
  private ppuSubstitutionsEnabled = false;
  private extendedAttribute = 0;
  private splitActive = false;
  private splitFineY = 0;
  private splitColumn = 0;
  private splitY = 0;
  private multiplierA = 0xff;
  private multiplierB = 0xff;
  private timerCounter = 0;
  private timerRunning = false;
  private timerPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.prgMode = 3;
    this.chrMode = 3;
    this.prgBanks = [0, 0, 0, 0, 0xff];
    this.chrBanksA.fill(0);
    this.chrBanksB.fill(0);
    this.chrUpperBits = 0;
    this.lastChrSet = "a";
    this.prgRamProtect1 = 1;
    this.prgRamProtect2 = 2;
    this.exRamMode = 3;
    this.nametableMapping = 0;
    this.fillTile = 0;
    this.fillPalette = 0;
    this.splitControl = 0;
    this.splitScroll = 0;
    this.splitBank = 0;
    this.irqTarget = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.inFrame = false;
    this.scanlineCounter = 0;
    this.ppuIdleCpuCycles = 3;
    this.spriteSize16 = false;
    this.ppuSubstitutionsEnabled = false;
    this.extendedAttribute = 0;
    this.splitActive = false;
    this.splitFineY = 0;
    this.splitColumn = 0;
    this.splitY = 0;
    this.multiplierA = 0xff;
    this.multiplierB = 0xff;
    this.timerCounter = 0;
    this.timerRunning = false;
    this.timerPending = false;
    this.audio.powerOn();
    this.refreshIrqLine();
  }

  reset(): void {
    this.prgMode = 3;
    this.prgRamProtect1 = 1;
    this.prgRamProtect2 = 2;
    this.exRamMode = 3;
    this.prgBanks[4] = 0xff;
    this.chrUpperBits = 0;
    this.splitControl = 0;
    this.splitScroll = 0;
    this.irqEnabled = false;
    this.timerCounter = 0;
    this.timerRunning = false;
    this.timerPending = false;
    this.audio.reset();
    this.endFrame();
    this.refreshIrqLine();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Mmc5,
      prgMode: this.prgMode,
      chrMode: this.chrMode,
      prgBanks: [...this.prgBanks],
      chrBanksA: [...this.chrBanksA],
      chrBanksB: [...this.chrBanksB],
      chrUpperBits: this.chrUpperBits,
      lastChrSet: this.lastChrSet,
      prgRamProtect1: this.prgRamProtect1,
      prgRamProtect2: this.prgRamProtect2,
      exRamMode: this.exRamMode,
      nametableMapping: this.nametableMapping,
      fillTile: this.fillTile,
      fillPalette: this.fillPalette,
      splitControl: this.splitControl,
      splitScroll: this.splitScroll,
      splitBank: this.splitBank,
      irqTarget: this.irqTarget,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      inFrame: this.inFrame,
      scanlineCounter: this.scanlineCounter,
      ppuIdleCpuCycles: this.ppuIdleCpuCycles,
      spriteSize16: this.spriteSize16,
      ppuSubstitutionsEnabled: this.ppuSubstitutionsEnabled,
      extendedAttribute: this.extendedAttribute,
      splitActive: this.splitActive,
      splitFineY: this.splitFineY,
      splitColumn: this.splitColumn,
      splitY: this.splitY,
      multiplierA: this.multiplierA,
      multiplierB: this.multiplierB,
      timerCounter: this.timerCounter,
      timerRunning: this.timerRunning,
      timerPending: this.timerPending,
      audio: this.audio.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Mmc5) {
      throw new Error(`Cannot restore ${state.kind} state into MMC5`);
    }
    if (
      !isIntegerInRange(state.prgMode, 0, 3) ||
      !isIntegerInRange(state.chrMode, 0, 3) ||
      !isFixedByteArray(state.prgBanks, 5) ||
      !Array.isArray(state.chrBanksA) ||
      state.chrBanksA.length !== 8 ||
      state.chrBanksA.some((bank) => !isIntegerInRange(bank, 0, 0x03ff)) ||
      !Array.isArray(state.chrBanksB) ||
      state.chrBanksB.length !== 4 ||
      state.chrBanksB.some((bank) => !isIntegerInRange(bank, 0, 0x03ff)) ||
      !isIntegerInRange(state.chrUpperBits, 0, 3) ||
      (state.lastChrSet !== "a" && state.lastChrSet !== "b") ||
      !isIntegerInRange(state.prgRamProtect1, 0, 3) ||
      !isIntegerInRange(state.prgRamProtect2, 0, 3) ||
      !isIntegerInRange(state.exRamMode, 0, 3) ||
      !isByte(state.nametableMapping) ||
      !isByte(state.fillTile) ||
      !isIntegerInRange(state.fillPalette, 0, 3) ||
      !isByte(state.splitControl) ||
      !isByte(state.splitScroll) ||
      !isByte(state.splitBank) ||
      !isByte(state.irqTarget) ||
      !isByte(state.scanlineCounter) ||
      !isIntegerInRange(state.ppuIdleCpuCycles, 0, 3) ||
      !isByte(state.extendedAttribute) ||
      !isIntegerInRange(state.splitFineY, 0, 7) ||
      !isIntegerInRange(state.splitColumn, 0, 31) ||
      !isByte(state.splitY) ||
      !isByte(state.multiplierA) ||
      !isByte(state.multiplierB) ||
      !isIntegerInRange(state.timerCounter, 0, 0xffff) ||
      !areBooleans(
        state.irqEnabled,
        state.irqPending,
        state.inFrame,
        state.spriteSize16,
        state.ppuSubstitutionsEnabled,
        state.splitActive,
        state.timerRunning,
        state.timerPending,
      )
    ) {
      throw new RangeError("MMC5 save state contains invalid banking or IRQ state");
    }
    this.audio.restoreState(state.audio);
    this.prgMode = state.prgMode;
    this.chrMode = state.chrMode;
    this.prgBanks = [...state.prgBanks];
    this.chrBanksA = [...state.chrBanksA];
    this.chrBanksB = [...state.chrBanksB];
    this.chrUpperBits = state.chrUpperBits;
    this.lastChrSet = state.lastChrSet;
    this.prgRamProtect1 = state.prgRamProtect1;
    this.prgRamProtect2 = state.prgRamProtect2;
    this.exRamMode = state.exRamMode;
    this.nametableMapping = state.nametableMapping;
    this.fillTile = state.fillTile;
    this.fillPalette = state.fillPalette;
    this.splitControl = state.splitControl;
    this.splitScroll = state.splitScroll;
    this.splitBank = state.splitBank;
    this.irqTarget = state.irqTarget;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.inFrame = state.inFrame;
    this.scanlineCounter = state.scanlineCounter;
    this.ppuIdleCpuCycles = state.ppuIdleCpuCycles;
    this.spriteSize16 = state.spriteSize16;
    this.ppuSubstitutionsEnabled = state.ppuSubstitutionsEnabled;
    this.extendedAttribute = state.extendedAttribute;
    this.splitActive = state.splitActive;
    this.splitFineY = state.splitFineY;
    this.splitColumn = state.splitColumn;
    this.splitY = state.splitY;
    this.multiplierA = state.multiplierA;
    this.multiplierB = state.multiplierB;
    this.timerCounter = state.timerCounter;
    this.timerRunning = state.timerRunning;
    this.timerPending = state.timerPending;
    this.refreshIrqLine();
  }

  read(address: number, context?: PpuFetchContext): number {
    if (address < 0x2000) return this.readPattern(address, context);
    const mapping = this.prgMapping(address);
    if (!mapping) return 0;
    if (mapping.kind === "rom") return this.cartridge.prgRom[mapping.index] ?? 0;
    return this.cartridge.readPrgRam(mapping.index);
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) return;
    const mapping = this.prgMapping(address);
    if (mapping?.kind === "ram" && this.prgRamProtect1 === 2 && this.prgRamProtect2 === 1) {
      this.cartridge.writePrgRam(mapping.index, value);
    }
  }

  cpuReadDriveMask(address: number): number {
    return this.prgMapping(address) ? 0xff : 0;
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    const audioResult = this.audio.readRegister(address);
    if (audioResult) {
      this.refreshIrqLine();
      return audioResult;
    }
    if (address === 0x5204) {
      const result = {
        value: (this.irqPending ? 0x80 : 0) | (this.inFrame ? 0x40 : 0),
        drivenMask: 0xc0,
      };
      this.irqPending = false;
      this.refreshIrqLine();
      return result;
    }
    const product = this.multiplierA * this.multiplierB;
    if (address === 0x5205) return { value: product & 0xff, drivenMask: 0xff };
    if (address === 0x5206) return { value: product >>> 8, drivenMask: 0xff };
    if (address === 0x5209) {
      const result = {
        value: !this.timerRunning && this.timerPending ? 0x80 : 0,
        drivenMask: 0x80,
      };
      this.timerPending = false;
      this.refreshIrqLine();
      return result;
    }
    if (address >= 0x5c00 && address <= 0x5fff) {
      if (this.exRamMode < 2) return undefined;
      return {
        value: this.cartridge.readMapperRam(address & 0x03ff),
        drivenMask: 0xff,
      };
    }
    return undefined;
  }

  writeCpuExpansion(address: number, value: number): void {
    value &= 0xff;
    if (this.audio.writeRegister(address, value)) {
      this.refreshIrqLine();
      return;
    }
    if (address >= 0x5100 && address <= 0x5130) {
      this.writeBankingRegister(address, value);
      return;
    }
    switch (address) {
      case 0x5200:
        this.splitControl = value;
        return;
      case 0x5201:
        this.splitScroll = value;
        return;
      case 0x5202:
        this.splitBank = value;
        return;
      case 0x5203:
        this.irqTarget = value;
        return;
      case 0x5204:
        this.irqEnabled = (value & 0x80) !== 0;
        this.refreshIrqLine();
        return;
      case 0x5205:
        this.multiplierA = value;
        return;
      case 0x5206:
        this.multiplierB = value;
        return;
      case 0x5209:
        this.timerCounter = (this.timerCounter & 0xff00) | value;
        this.timerRunning = this.timerCounter !== 0;
        this.refreshIrqLine();
        return;
      case 0x520a:
        this.timerCounter = (this.timerCounter & 0x00ff) | (value << 8);
        if (this.timerCounter === 0) this.timerRunning = false;
        return;
    }
    if (address >= 0x5c00 && address <= 0x5fff) {
      if (this.exRamMode === 2 || (this.exRamMode < 2 && this.inFrame)) {
        this.cartridge.writeMapperRam(address & 0x03ff, value);
      }
    }
  }

  mapNametableAddress(address: number): number | undefined {
    const selector = this.nametableSelector(address);
    if (selector > 1) return undefined;
    return selector * 0x0400 + (address & 0x03ff);
  }

  readNametable(address: number, context?: PpuFetchContext): number | undefined {
    if (context?.kind === "background") {
      if (context.phase === "nametable") this.prepareBackgroundTile(address, context);
      if (this.splitActive) return this.readSplitNametable(context.phase);
      if (this.ppuSubstitutionsEnabled && this.exRamMode === 1 && context.phase === "attribute") {
        return ((this.extendedAttribute >>> 6) & 3) * 0x55;
      }
    }

    const selector = this.nametableSelector(address);
    if (selector < 2) return undefined;
    if (selector === 2) {
      return this.exRamMode < 2 ? this.cartridge.readMapperRam(address & 0x03ff) : 0;
    }
    return (address & 0x03ff) >= 0x03c0 ? this.fillPalette * 0x55 : this.fillTile;
  }

  writeNametable(address: number, value: number): boolean {
    const selector = this.nametableSelector(address);
    if (selector < 2) return false;
    if (selector === 2 && this.exRamMode < 2) {
      this.cartridge.writeMapperRam(address & 0x03ff, value);
    }
    return true;
  }

  observeCpuBusCycle(_write: boolean): void {
    this.audio.tick();
    if (this.timerRunning && this.timerCounter > 0) {
      this.timerCounter--;
      if (this.timerCounter === 0) {
        this.timerRunning = false;
        this.timerPending = true;
      }
    }
    if (this.ppuIdleCpuCycles < 3) this.ppuIdleCpuCycles++;
    if (this.ppuIdleCpuCycles === 3) {
      this.inFrame = false;
      this.splitActive = false;
    }
    this.refreshIrqLine();
  }

  observeCpuRead(address: number, value: number): void {
    this.audio.observeCpuRead(address, value);
    if ((address === 0x2002 && (value & 0x80) !== 0) || address === 0xfffa || address === 0xfffb) {
      this.resetScanlineDetector();
    }
    this.refreshIrqLine();
  }

  observeCpuWrite(address: number, value: number): void {
    if (address === 0x2000) this.spriteSize16 = (value & 0x20) !== 0;
    if (address === 0x2001) {
      const enabled = (value & 0x18) !== 0;
      if (!enabled) this.endFrame();
      else if (!this.ppuSubstitutionsEnabled) this.resetScanlineDetector();
      this.ppuSubstitutionsEnabled = enabled;
    } else if (address === 0x4014) {
      this.resetScanlineDetector();
    }
  }

  observePpuRead(_address: number, context?: PpuFetchContext): void {
    this.ppuIdleCpuCycles = 0;
    if (
      context?.kind !== "background" ||
      context.phase !== "attribute" ||
      context.tile !== 0 ||
      !context.visible
    ) {
      return;
    }
    if (!this.inFrame) {
      this.inFrame = true;
      this.scanlineCounter = 0;
    } else {
      this.scanlineCounter = (this.scanlineCounter + 1) & 0xff;
      if (this.irqTarget !== 0 && this.scanlineCounter === this.irqTarget) {
        this.irqPending = true;
      }
    }
    this.refreshIrqLine();
  }

  expansionAudioSample(): number {
    return this.audio.output();
  }

  private writeBankingRegister(address: number, value: number): void {
    switch (address) {
      case 0x5100:
        this.prgMode = value & 3;
        break;
      case 0x5101:
        this.chrMode = value & 3;
        break;
      case 0x5102:
        this.prgRamProtect1 = value & 3;
        break;
      case 0x5103:
        this.prgRamProtect2 = value & 3;
        break;
      case 0x5104:
        this.exRamMode = value & 3;
        break;
      case 0x5105:
        this.nametableMapping = value;
        break;
      case 0x5106:
        this.fillTile = value;
        break;
      case 0x5107:
        this.fillPalette = value & 3;
        break;
      case 0x5113:
      case 0x5114:
      case 0x5115:
      case 0x5116:
      case 0x5117:
        this.prgBanks[address - 0x5113] = value;
        break;
      default:
        if (address >= 0x5120 && address <= 0x5127) {
          this.chrBanksA[address - 0x5120] = (this.chrUpperBits << 8) | value;
          this.lastChrSet = "a";
        } else if (address >= 0x5128 && address <= 0x512b) {
          this.chrBanksB[address - 0x5128] = (this.chrUpperBits << 8) | value;
          this.lastChrSet = "b";
        } else if (address === 0x5130) {
          this.chrUpperBits = value & 3;
        }
    }
  }

  private prgMapping(address: number): PrgMapping | undefined {
    if (address < 0x6000) return undefined;
    if (address < 0x8000) return this.ramMapping((this.prgBanks[0] ?? 0) & 7, address & 0x1fff);
    const slot = (address - 0x8000) >>> 13;
    let registerIndex: number;
    let withinBank = 0;
    switch (this.prgMode) {
      case 0:
        registerIndex = 4;
        withinBank = slot;
        break;
      case 1:
        registerIndex = slot < 2 ? 2 : 4;
        withinBank = slot & 1;
        break;
      case 2:
        registerIndex = slot < 2 ? 2 : slot + 1;
        withinBank = slot < 2 ? slot : 0;
        break;
      default:
        registerIndex = slot + 1;
    }
    const register = this.prgBanks[registerIndex] ?? 0;
    const forcedRom = registerIndex === 4;
    const groupSize =
      this.prgMode === 0 ? 4 : this.prgMode === 1 || (this.prgMode === 2 && slot < 2) ? 2 : 1;
    if (!forcedRom && (register & 0x80) === 0) {
      const ramBank = (register & 7 & ~(groupSize - 1)) + withinBank;
      return this.ramMapping(ramBank, address & 0x1fff);
    }
    const bank = ((register & 0x7f & ~(groupSize - 1)) + withinBank) % this.prgBankCount;
    return { kind: "rom", index: bank * PRG_BANK_SIZE + (address & 0x1fff) };
  }

  private ramMapping(bank: number, offset: number): PrgMapping | undefined {
    const bytes = this.cartridge.prgWritableBytes;
    let base: number;
    if (bytes === 0x2000) {
      if (bank >= 4) return undefined;
      base = 0;
    } else if (bytes === 0x4000) {
      base = bank < 4 ? this.cartridge.prgRamBytes : 0;
    } else if (bytes === 0x8000) {
      if (bank >= 4) return undefined;
      base = bank * PRG_BANK_SIZE;
    } else {
      return undefined;
    }
    return { kind: "ram", index: base + offset };
  }

  private readPattern(address: number, context?: PpuFetchContext): number {
    if (context?.kind === "background") {
      if (this.splitActive) {
        const tile = this.readSplitTile();
        const index =
          (this.splitBank * 0x1000 + tile * 16 + this.splitFineY + (address & 8)) %
          this.cartridge.chrRom.byteLength;
        return this.cartridge.chrRom[index] ?? 0;
      }
      if (this.ppuSubstitutionsEnabled && this.exRamMode === 1) {
        const bank4k = ((this.chrUpperBits << 6) | (this.extendedAttribute & 0x3f)) & 0xff;
        const index = (bank4k * 0x1000 + (address & 0x0fff)) % this.cartridge.chrRom.byteLength;
        return this.cartridge.chrRom[index] ?? 0;
      }
    }
    const useB =
      context?.kind === "background"
        ? this.spriteSize16 && this.ppuSubstitutionsEnabled
        : context?.kind === "sprite"
          ? false
          : this.lastChrSet === "b";
    const bank = this.patternBank(address, useB ? "b" : "a");
    return this.cartridge.chrRom[bank * CHR_BANK_SIZE + (address & 0x03ff)] ?? 0;
  }

  private patternBank(address: number, set: "a" | "b"): number {
    const slot = address >>> 10;
    const size = 1 << (3 - this.chrMode);
    let localSlot = slot;
    let register: number;
    if (set === "b" && this.chrMode > 0) localSlot &= 3;
    if (set === "a") {
      register =
        this.chrMode === 3
          ? localSlot
          : this.chrMode === 2
            ? localSlot | 1
            : this.chrMode === 1
              ? localSlot < 4
                ? 3
                : 7
              : 7;
    } else {
      register = this.chrMode === 3 ? localSlot : this.chrMode === 2 ? localSlot | 1 : 3;
    }
    const value = (set === "a" ? this.chrBanksA[register] : this.chrBanksB[register]) ?? 0;
    const bankNumberMask = this.chrMode === 3 ? 0x03ff : this.chrMode === 2 ? 0x01ff : 0x00ff;
    return ((value & bankNumberMask) * size + (localSlot & (size - 1))) % this.chrBankCount;
  }

  private prepareBackgroundTile(
    address: number,
    context: Extract<PpuFetchContext, { kind: "background" }>,
  ): void {
    const column = context.tile & 31;
    this.splitColumn = column;
    const threshold = this.splitControl & 0x1f;
    const rightSide = (this.splitControl & 0x40) !== 0;
    this.splitActive =
      context.visible &&
      this.ppuSubstitutionsEnabled &&
      (this.splitControl & 0x80) !== 0 &&
      this.exRamMode < 2 &&
      (rightSide ? column >= threshold : column < threshold);
    if (this.splitActive) {
      const nextScanline = context.tile === 0 && this.inFrame ? 1 : 0;
      this.splitY = splitYForScanline(this.splitScroll, this.scanlineCounter + nextScanline);
      this.splitFineY = this.splitY & 7;
      return;
    }
    this.extendedAttribute = this.cartridge.readMapperRam(address & 0x03ff);
  }

  private readSplitNametable(phase: "nametable" | "attribute" | "pattern"): number {
    if (phase === "nametable") return this.readSplitTile();
    if (phase === "attribute") {
      const { column, row } = this.splitCoordinates();
      const attribute = this.cartridge.readMapperRam(0x03c0 + ((row >>> 2) << 3) + (column >>> 2));
      const shift = ((row & 2) << 1) | (column & 2);
      return ((attribute >>> shift) & 3) * 0x55;
    }
    return 0;
  }

  private readSplitTile(): number {
    const { column, row } = this.splitCoordinates();
    return this.cartridge.readMapperRam(row * 32 + column);
  }

  private splitCoordinates(): { readonly column: number; readonly row: number } {
    const column = this.currentBackgroundColumn();
    const row = Math.floor(this.splitY / 8);
    return { column, row };
  }

  private currentBackgroundColumn(): number {
    return this.splitColumn;
  }

  private nametableSelector(address: number): number {
    const table = ((address - 0x2000) >>> 10) & 3;
    return (this.nametableMapping >>> (table * 2)) & 3;
  }

  private endFrame(): void {
    this.inFrame = false;
    this.ppuIdleCpuCycles = 3;
    this.splitActive = false;
  }

  private resetScanlineDetector(): void {
    this.endFrame();
    this.scanlineCounter = 0;
    this.irqPending = false;
    this.refreshIrqLine();
  }

  private refreshIrqLine(): void {
    this.interruptPort.setMapperIrq(
      (this.irqEnabled && this.irqPending) || this.timerPending || this.audio.irqPending,
    );
  }
}

function splitYForScanline(scroll: number, scanline: number): number {
  if (scroll < 240) return (scroll + scanline) % 240;
  const specialRows = 256 - scroll;
  return scanline < specialRows ? scroll + scanline : (scanline - specialRows) % 240;
}
