import { FrameBuffer } from "../model/frame-buffer.js";
import { PPUMemory } from "./memory.js";
import type Bus from "./bus.js";
import type { ConsoleTiming } from "./console-timing.js";
import { PpuIoBusLatch, type PpuIoBusState } from "./ppu/ppu-io-bus-latch.js";
import { SpriteEvaluator, type SpriteEvaluationState } from "./ppu/sprite-evaluator.js";
import { resolveSpritePatternAddress } from "./ppu/sprite-pattern-address.js";

const BACKGROUND_MAPPER_OBSERVATION_DELAY_DOTS = 4;

interface SpriteZeroHitState {
  readonly pending: boolean;
  readonly latched: boolean;
}

export interface PpuSnapshot {
  readonly cycle: number;
  readonly scanLine: number;
  readonly frame: number;
  readonly paletteData: Uint8Array;
  readonly nameTableData: Uint8Array;
  readonly oamData: Uint8Array;
  readonly front: Uint32Array;
  readonly back: Uint32Array;
  readonly v: number;
  readonly t: number;
  readonly x: number;
  readonly w: number;
  readonly f: number;
  readonly ioBus: PpuIoBusState;
  readonly nmiOccurred: boolean;
  readonly nmiOutput: boolean;
  readonly nmiLineAsserted: boolean;
  readonly suppressVblank: boolean;
  readonly nameTableByte: number;
  readonly attributeTableByte: number;
  readonly lowTileByte: number;
  readonly highTileByte: number;
  readonly tileDataLow: number;
  readonly tileDataHigh: number;
  readonly spriteCount: number;
  readonly spritePatterns: Uint32Array;
  readonly spritePositions: Uint8Array;
  readonly spritePriorities: Uint8Array;
  readonly spriteIndexes: Uint8Array;
  readonly spritePatternTables: Uint8Array;
  readonly spriteEvaluation: SpriteEvaluationState;
  readonly flagNameTable: number;
  readonly flagIncrement: number;
  readonly flagSpriteTable: number;
  readonly flagBackgroundTable: number;
  readonly flagSpriteSize: number;
  readonly flagMasterSlave: number;
  readonly flagGrayscale: number;
  readonly flagShowLeftBackground: number;
  readonly flagShowLeftSprites: number;
  readonly flagShowBackground: number;
  readonly flagShowSprites: number;
  readonly effectiveRenderingMask: number;
  readonly pendingRenderingMask: number;
  readonly renderingMaskDelay: number;
  readonly flagRedTint: number;
  readonly flagGreenTint: number;
  readonly flagBlueTint: number;
  readonly spriteZeroHit: SpriteZeroHitState;
  readonly flagSpriteOverflow: number;
  readonly oamAddress: number;
  readonly bufferedData: number;
  readonly pendingBackgroundMapperAddresses: readonly {
    readonly address: number;
    readonly remainingDots: number;
  }[];
}

class PPU {
  // Sprite pixels are evaluated in a batch, so their cartridge bus addresses
  // still need an explicit dot-aligned observation path.
  private static readonly SPRITE_A12_START_DOT = 265;
  private static readonly LATER_SPRITE_FETCH_DOT = 267;
  private static readonly IO_BUS_DECAY_SECONDS = 0.6;
  private readonly memory: PPUMemory;
  private readonly bus: Bus;
  private readonly timing: ConsoleTiming;
  private readonly ioBus: PpuIoBusLatch;

  public cycle: number = 0;
  public scanLine: number = 0;
  public frame: number = 0;

  private readonly paletteData: Uint8Array = new Uint8Array(32);
  public readonly nameTableData: Uint8Array = new Uint8Array(4096);
  private readonly oamData: Uint8Array = new Uint8Array(256);

  public front: FrameBuffer = new FrameBuffer(256, 240);
  private back: FrameBuffer = new FrameBuffer(256, 240);

  private v: number = 0;
  private t: number = 0;
  private x: number = 0;
  private w: number = 0;
  private f: number = 0;

  private nmiOccurred: boolean = false;
  private nmiOutput: boolean = false;
  private nmiLineAsserted: boolean = false;
  private suppressVblank: boolean = false;

  private nameTableByte: number = 0;
  private attributeTableByte: number = 0;
  private lowTileByte: number = 0;
  private highTileByte: number = 0;

  // 将 tileData 拆分为高低两个 32 位整数
  private tileDataLow: number = 0;
  private tileDataHigh: number = 0;

  private spriteCount: number = 0;
  private readonly spritePatterns: Uint32Array = new Uint32Array(8);
  private readonly spritePositions: Uint8Array = new Uint8Array(8);
  private readonly spritePriorities: Uint8Array = new Uint8Array(8);
  private readonly spriteIndexes: Uint8Array = new Uint8Array(8);
  private readonly spritePatternTables: Uint8Array = new Uint8Array(8);
  private readonly spriteEvaluator = new SpriteEvaluator();
  private spriteZeroHitPending = false;
  private spriteZeroHitLatched = false;

  public flagNameTable: number = 0;
  private flagIncrement: number = 0;
  private flagSpriteTable: number = 0;
  private flagBackgroundTable: number = 0;
  private flagSpriteSize: number = 0;
  public flagMasterSlave: number = 0;

  public flagGrayscale: number = 0;
  private flagShowLeftBackground: number = 0;
  private flagShowLeftSprites: number = 0;
  public flagShowBackground: number = 0;
  public flagShowSprites: number = 0;
  private effectiveRenderingMask: number = 0;
  private pendingRenderingMask: number = 0;
  private renderingMaskDelay: number = 0;
  public flagRedTint: number = 0;
  public flagGreenTint: number = 0;
  public flagBlueTint: number = 0;

  private flagSpriteOverflow: number = 0;

  private oamAddress: number = 0;
  private bufferedData: number = 0;
  private readonly pendingBackgroundMapperAddresses: Array<{
    address: number;
    remainingDots: number;
  }> = [];

  static readonly PALETTE: readonly number[] = [
    0x666666ff, 0x002a88ff, 0x1412a7ff, 0x3b00a4ff, 0x5c007eff, 0x6e0040ff, 0x6c0600ff, 0x561d00ff,
    0x333500ff, 0x0b4800ff, 0x005200ff, 0x004f08ff, 0x00404dff, 0x000000ff, 0x000000ff, 0x000000ff,
    0xadadadff, 0x155fd9ff, 0x4240ffff, 0x7527feff, 0xa01accff, 0xb71e7bff, 0xb53120ff, 0x994e00ff,
    0x6b6d00ff, 0x388700ff, 0x0c9300ff, 0x008f32ff, 0x007c8dff, 0x000000ff, 0x000000ff, 0x000000ff,
    0xfffeffff, 0x64b0ffff, 0x9290ffff, 0xc676ffff, 0xf36affff, 0xfe6eccff, 0xfe8170ff, 0xea9e22ff,
    0xbcbe00ff, 0x88d800ff, 0x5ce430ff, 0x45e082ff, 0x48cddeff, 0x4f4f4fff, 0x000000ff, 0x000000ff,
    0xfffeffff, 0xc0dfffff, 0xd3d2ffff, 0xe8c8ffff, 0xfbc2ffff, 0xfec4eaff, 0xfeccc5ff, 0xf7d8a5ff,
    0xe4e594ff, 0xcfef96ff, 0xbdf4abff, 0xb3f3ccff, 0xb5ebf2ff, 0xb8b8b8ff, 0x000000ff, 0x000000ff,
  ].map((color) => FrameBuffer.fromRgbaHex(color));

  constructor(bus: Bus, timing: ConsoleTiming) {
    this.bus = bus;
    this.timing = timing;
    this.memory = new PPUMemory(bus);
    this.ioBus = new PpuIoBusLatch(Math.ceil(timing.ppuFrequencyHz * PPU.IO_BUS_DECAY_SECONDS));
  }

  public read(address: number): number {
    return this.memory.read(address);
  }

  public write(address: number, value: number): void {
    this.memory.write(address, value);
  }

  captureState(): PpuSnapshot {
    return {
      cycle: this.cycle,
      scanLine: this.scanLine,
      frame: this.frame,
      paletteData: this.paletteData.slice(),
      nameTableData: this.nameTableData.slice(),
      oamData: this.oamData.slice(),
      front: this.front.captureState(),
      back: this.back.captureState(),
      v: this.v,
      t: this.t,
      x: this.x,
      w: this.w,
      f: this.f,
      ioBus: this.ioBus.captureState(),
      nmiOccurred: this.nmiOccurred,
      nmiOutput: this.nmiOutput,
      nmiLineAsserted: this.nmiLineAsserted,
      suppressVblank: this.suppressVblank,
      nameTableByte: this.nameTableByte,
      attributeTableByte: this.attributeTableByte,
      lowTileByte: this.lowTileByte,
      highTileByte: this.highTileByte,
      tileDataLow: this.tileDataLow,
      tileDataHigh: this.tileDataHigh,
      spriteCount: this.spriteCount,
      spritePatterns: this.spritePatterns.slice(),
      spritePositions: this.spritePositions.slice(),
      spritePriorities: this.spritePriorities.slice(),
      spriteIndexes: this.spriteIndexes.slice(),
      spritePatternTables: this.spritePatternTables.slice(),
      spriteEvaluation: this.spriteEvaluator.captureState(),
      flagNameTable: this.flagNameTable,
      flagIncrement: this.flagIncrement,
      flagSpriteTable: this.flagSpriteTable,
      flagBackgroundTable: this.flagBackgroundTable,
      flagSpriteSize: this.flagSpriteSize,
      flagMasterSlave: this.flagMasterSlave,
      flagGrayscale: this.flagGrayscale,
      flagShowLeftBackground: this.flagShowLeftBackground,
      flagShowLeftSprites: this.flagShowLeftSprites,
      flagShowBackground: this.flagShowBackground,
      flagShowSprites: this.flagShowSprites,
      effectiveRenderingMask: this.effectiveRenderingMask,
      pendingRenderingMask: this.pendingRenderingMask,
      renderingMaskDelay: this.renderingMaskDelay,
      flagRedTint: this.flagRedTint,
      flagGreenTint: this.flagGreenTint,
      flagBlueTint: this.flagBlueTint,
      spriteZeroHit: {
        pending: this.spriteZeroHitPending,
        latched: this.spriteZeroHitLatched,
      },
      flagSpriteOverflow: this.flagSpriteOverflow,
      oamAddress: this.oamAddress,
      bufferedData: this.bufferedData,
      pendingBackgroundMapperAddresses: this.pendingBackgroundMapperAddresses.map((item) => ({
        ...item,
      })),
    };
  }

  restoreState(state: PpuSnapshot): void {
    validatePpuSnapshot(state, this.timing);
    this.paletteData.set(state.paletteData);
    this.nameTableData.set(state.nameTableData);
    this.oamData.set(state.oamData);
    this.front.restoreState(state.front);
    this.back.restoreState(state.back);
    this.spritePatterns.set(state.spritePatterns);
    this.spritePositions.set(state.spritePositions);
    this.spritePriorities.set(state.spritePriorities);
    this.spriteIndexes.set(state.spriteIndexes);
    this.spritePatternTables.set(state.spritePatternTables);
    this.spriteEvaluator.restoreState(state.spriteEvaluation);
    this.spriteZeroHitPending = state.spriteZeroHit.pending;
    this.spriteZeroHitLatched = state.spriteZeroHit.latched;
    this.pendingBackgroundMapperAddresses.splice(
      0,
      this.pendingBackgroundMapperAddresses.length,
      ...state.pendingBackgroundMapperAddresses.map((item) => ({ ...item })),
    );
    this.ioBus.restoreState(state.ioBus);
    Object.assign(this, {
      cycle: state.cycle,
      scanLine: state.scanLine,
      frame: state.frame,
      v: state.v,
      t: state.t,
      x: state.x,
      w: state.w,
      f: state.f,
      nmiOccurred: state.nmiOccurred,
      nmiOutput: state.nmiOutput,
      nmiLineAsserted: state.nmiLineAsserted,
      suppressVblank: state.suppressVblank,
      nameTableByte: state.nameTableByte,
      attributeTableByte: state.attributeTableByte,
      lowTileByte: state.lowTileByte,
      highTileByte: state.highTileByte,
      tileDataLow: state.tileDataLow,
      tileDataHigh: state.tileDataHigh,
      spriteCount: state.spriteCount,
      flagNameTable: state.flagNameTable,
      flagIncrement: state.flagIncrement,
      flagSpriteTable: state.flagSpriteTable,
      flagBackgroundTable: state.flagBackgroundTable,
      flagSpriteSize: state.flagSpriteSize,
      flagMasterSlave: state.flagMasterSlave,
      flagGrayscale: state.flagGrayscale,
      flagShowLeftBackground: state.flagShowLeftBackground,
      flagShowLeftSprites: state.flagShowLeftSprites,
      flagShowBackground: state.flagShowBackground,
      flagShowSprites: state.flagShowSprites,
      effectiveRenderingMask: state.effectiveRenderingMask,
      pendingRenderingMask: state.pendingRenderingMask,
      renderingMaskDelay: state.renderingMaskDelay,
      flagRedTint: state.flagRedTint,
      flagGreenTint: state.flagGreenTint,
      flagBlueTint: state.flagBlueTint,
      flagSpriteOverflow: state.flagSpriteOverflow,
      oamAddress: state.oamAddress,
      bufferedData: state.bufferedData,
    });
  }

  /** Applies this emulator's deterministic cold-start policy to volatile PPU state. */
  public powerOn(): void {
    this.paletteData.fill(0);
    this.nameTableData.fill(0);
    this.oamData.fill(0);
    this.front.fill(0);
    this.back.fill(0);
    this.v = 0;
    this.oamAddress = 0;
    this.ioBus.powerOn();
    this.nmiOccurred = false;
    this.clearSpriteZeroHit();
    this.flagSpriteOverflow = 0;
    this.reset();
  }

  /** Applies the front-loader PPU reset line while retaining VRAM, palette and OAM. */
  public reset(): void {
    this.cycle = 340;
    this.scanLine = 240;
    this.frame = 0;
    this.writeControl(0);
    this.writeMask(0);
    this.effectiveRenderingMask = 0;
    this.pendingRenderingMask = 0;
    this.renderingMaskDelay = 0;
    this.t = 0;
    this.x = 0;
    this.w = 0;
    this.f = 0;
    this.bufferedData = 0;
    this.nmiLineAsserted = false;
    this.suppressVblank = false;
    this.bus.setPpuNmiLine(false);
    this.nameTableByte = 0;
    this.attributeTableByte = 0;
    this.lowTileByte = 0;
    this.highTileByte = 0;
    this.tileDataLow = 0;
    this.tileDataHigh = 0;
    this.spriteCount = 0;
    this.spritePatterns.fill(0);
    this.spritePositions.fill(0);
    this.spritePriorities.fill(0);
    this.spriteIndexes.fill(0);
    this.spritePatternTables.fill(0);
    this.spriteEvaluator.powerOn();
    this.pendingBackgroundMapperAddresses.length = 0;
  }

  public readPalette(address: number): number {
    if (address >= 16 && address % 4 == 0) {
      address -= 16;
    }
    const value = this.paletteData[address] ?? 0;
    return value & (this.flagGrayscale === 0 ? 0x3f : 0x30);
  }

  public writePalette(address: number, value: number) {
    if (address >= 16 && address % 4 == 0) {
      address -= 16;
    }
    this.paletteData[address] = value & 0x3f;
  }

  public readRegister(address: number): number {
    switch (address) {
      case 0x2002:
        return this.readStatus();
      case 0x2004:
        return this.readOAMData();
      case 0x2007:
        return this.readData();
    }
    return this.ioBus.sample();
  }

  public writeRegister(address: number, value: number) {
    if (address !== 0x4014) this.ioBus.drive(value);
    switch (address) {
      case 0x2000:
        this.writeControl(value);
        break;
      case 0x2001:
        this.writeMask(value);
        break;
      case 0x2003:
        this.writeOAMAddress(value);
        break;
      case 0x2004:
        this.writeOAMData(value);
        break;
      case 0x2005:
        this.writeScroll(value);
        break;
      case 0x2006:
        this.writeAddress(value);
        break;
      case 0x2007:
        this.writeData(value);
        break;
      case 0x4014:
        this.writeDMA(value);
        break;
    }
  }

  public writeOamDma(value: number): void {
    this.ioBus.drive(value);
    this.writeOAMData(value);
  }

  private writeControl(value: number) {
    this.flagNameTable = (value >> 0) & 3;
    this.flagIncrement = (value >> 2) & 1;
    this.flagSpriteTable = (value >> 3) & 1;
    this.flagBackgroundTable = (value >> 4) & 1;
    this.flagSpriteSize = (value >> 5) & 1;
    this.flagMasterSlave = (value >> 6) & 1;
    this.nmiOutput = ((value >> 7) & 1) == 1;
    this.nmiChange();
    this.t = (this.t & 0xf3ff) | ((value & 0x03) << 10);
  }

  private nmiChange() {
    const asserted = this.nmiOutput && this.nmiOccurred;
    if (asserted === this.nmiLineAsserted) return;
    this.nmiLineAsserted = asserted;
    this.bus.setPpuNmiLine(asserted);
  }

  private writeMask(value: number) {
    this.flagGrayscale = (value >> 0) & 1;
    this.flagShowLeftBackground = (value >> 1) & 1;
    this.flagShowLeftSprites = (value >> 2) & 1;
    this.flagShowBackground = (value >> 3) & 1;
    this.flagShowSprites = (value >> 4) & 1;
    const renderingMask = value & 0x18;
    if (renderingMask !== this.pendingRenderingMask) {
      this.pendingRenderingMask = renderingMask;
      this.renderingMaskDelay = 2;
    }
    this.flagRedTint = (value >> 5) & 1;
    this.flagGreenTint = (value >> 6) & 1;
    this.flagBlueTint = (value >> 7) & 1;
  }

  private writeOAMAddress(value: number) {
    this.oamAddress = value;
  }

  private readStatus() {
    let status = this.flagSpriteOverflow << 5;
    status |= Number(this.spriteZeroHitLatched) << 6;
    if (this.nmiOccurred) {
      status |= 1 << 7;
    }
    const result = this.ioBus.drive(status, 0xe0);
    if (this.scanLine === this.timing.vblankStartScanline && this.cycle === 0) {
      this.suppressVblank = true;
    }
    this.nmiOccurred = false;
    this.nmiChange();
    this.w = 0;
    return result;
  }

  private readOAMData() {
    if (this.isOamRenderingActive()) {
      return this.ioBus.drive(this.spriteEvaluator.readDataBus(this.cycle));
    }
    let data = this.oamData[this.oamAddress] ?? 0;
    if ((this.oamAddress & 0x03) === 0x02) data &= 0xe3;
    return this.ioBus.drive(data);
  }

  private readData() {
    const address = this.v % 0x4000;
    let value = this.read(address);
    // emulate buffered reads
    if (address < 0x3f00) {
      const buffered = this.bufferedData;
      this.bufferedData = value;
      value = buffered;
    } else {
      this.bufferedData = this.read(this.v - 0x1000);
    }
    value = this.ioBus.drive(value, address < 0x3f00 ? 0xff : 0x3f);
    // increment address
    if (this.flagIncrement === 0) {
      this.v += 1;
    } else {
      this.v += 32;
    }
    this.observeCartridgeAddress(this.v);
    return value;
  }

  private writeOAMData(value: number) {
    // During rendering the PPU owns the OAM bus. Real hardware performs a
    // revision-dependent address glitch; ignoring the write is the stable,
    // recommended emulation behavior until that corruption is modeled.
    if (this.isOamRenderingActive()) return;
    this.oamData[this.oamAddress] = (this.oamAddress & 0x03) === 0x02 ? value & 0xe3 : value;
    this.oamAddress = (this.oamAddress + 1) & 0xff;
  }

  private isOamRenderingActive(): boolean {
    const renderLine = this.scanLine < 240 || this.scanLine === this.timing.preRenderScanline;
    return this.renderingEnabled && renderLine;
  }

  private writeScroll(value: number) {
    if (this.w === 0) {
      // t: ........ ...HGFED = d: HGFED...
      // x:               CBA = d: .....CBA
      // w:                   = 1
      this.t = (this.t & 0xffe0) | (value >> 3);
      this.x = value & 0x07;
      this.w = 1;
    } else {
      // t: .CBA..HG FED..... = d: HGFEDCBA
      // w:                   = 0
      this.t = (this.t & 0x8fff) | ((value & 0x07) << 12);
      this.t = (this.t & 0xfc1f) | ((value & 0xf8) << 2);
      this.w = 0;
    }
  }

  private writeAddress(value: number) {
    if (this.w === 0) {
      this.t = (this.t & 0x80ff) | ((value & 0x3f) << 8);
      this.w = 1;
    } else {
      this.t = (this.t & 0xff00) | value;
      this.v = this.t;
      this.w = 0;
      this.observeCartridgeAddress(this.v);
    }
  }

  private writeData(value: number) {
    this.write(this.v, value);
    if (this.flagIncrement === 0) {
      this.v += 1;
    } else {
      this.v += 32;
    }
    this.observeCartridgeAddress(this.v);
  }

  private writeDMA(value: number) {
    this.bus.requestSpriteDma(value);
  }

  private incrementX() {
    if ((this.v & 0x001f) === 31) {
      this.v &= 0xffe0;
      this.v ^= 0x0400;
    } else {
      this.v++;
    }
  }

  private incrementY() {
    if ((this.v & 0x7000) !== 0x7000) {
      this.v += 0x1000;
    } else {
      this.v &= 0x8fff;
      let y = (this.v & 0x03e0) >> 5;
      if (y === 29) {
        y = 0;
        this.v ^= 0x0800;
      } else if (y === 31) {
        y = 0;
      } else {
        y++;
      }
      this.v = (this.v & 0xfc1f) | (y << 5);
    }
  }

  private copyX() {
    this.v = (this.v & 0xfbe0) | (this.t & 0x041f);
  }

  private copyY() {
    this.v = (this.v & 0x841f) | (this.t & 0x7be0);
  }

  private setVerticalBlank() {
    const tmp = this.front;
    this.front = this.back;
    this.back = tmp;
    if (this.suppressVblank) {
      this.suppressVblank = false;
      return;
    }
    this.nmiOccurred = true;
    this.nmiChange();
  }

  private clearVerticalBlank() {
    this.suppressVblank = false;
    this.nmiOccurred = false;
    this.nmiChange();
  }

  private fetchNameTableByte() {
    const address = 0x2000 | (this.v & 0x0fff);
    this.nameTableByte = this.readBackgroundByte(address);
  }

  private fetchAttributeTableByte() {
    const v = this.v;
    const address = 0x23c0 | (v & 0x0c00) | ((v >> 4) & 0x38) | ((v >> 2) & 0x07);
    const shift = ((v >> 4) & 4) | (v & 2);
    this.attributeTableByte = ((this.readBackgroundByte(address) >> shift) & 3) << 2;
  }

  private fetchLowTileByte() {
    const fineY = (this.v >> 12) & 7;
    const table = this.flagBackgroundTable;
    const tile = this.nameTableByte;
    const address = 0x1000 * table + tile * 16 + fineY;
    this.lowTileByte = this.readBackgroundByte(address);
  }

  private fetchHighTileByte() {
    const fineY = (this.v >> 12) & 7;
    const table = this.flagBackgroundTable;
    const tile = this.nameTableByte;
    const address = 0x1000 * table + tile * 16 + fineY;
    this.highTileByte = this.readBackgroundByte(address + 8);
  }

  private storeTileData() {
    let data = 0;
    for (let i = 0; i < 8; i++) {
      const a = this.attributeTableByte;
      const p1 = (this.lowTileByte & 0x80) >> 7;
      const p2 = (this.highTileByte & 0x80) >> 6;
      this.lowTileByte <<= 1;
      this.highTileByte <<= 1;
      data <<= 4;
      data |= a | p1 | p2;
    }

    // 修复精度问题：将data存储到tileDataLow，tileDataHigh没有变化
    this.tileDataLow = data >>> 0;
  }

  private fetchTileData(): number {
    // 修复精度问题：直接返回高32位
    return this.tileDataHigh;
  }

  private backgroundPixel(): number {
    if ((this.effectiveRenderingMask & 0x08) === 0) {
      return 0;
    }
    const data = this.fetchTileData() >> ((7 - this.x) * 4);
    return data & 0x0f;
  }

  private spritePixel(): {
    index: number;
    color: number;
  } {
    if ((this.effectiveRenderingMask & 0x10) === 0) {
      return {
        index: 0,
        color: 0,
      };
    }
    for (let i = 0; i < this.spriteCount; i++) {
      let offset = this.cycle - 1 - this.spritePositions[i];
      if (offset < 0 || offset > 7) {
        continue;
      }
      offset = 7 - offset;
      const color = (this.spritePatterns[i] >> (offset * 4)) & 0x0f;
      if (color % 4 === 0) {
        continue;
      }
      return {
        index: i,
        color: color,
      };
    }
    return {
      index: 0,
      color: 0,
    };
  }

  private renderPixel() {
    let x = this.cycle - 1;
    let y = this.scanLine;
    let background = this.backgroundPixel();
    const pixel = this.spritePixel();
    if (x < 8 && this.flagShowLeftBackground === 0) {
      background = 0;
    }
    if (x < 8 && this.flagShowLeftSprites == 0) {
      pixel.color = 0;
    }
    let b = background % 4 != 0;
    let s = pixel.color % 4 !== 0;
    let color: number = 0;
    if (!b && !s) {
      color = 0;
    } else if (!b && s) {
      color = pixel.color | 0x10;
    } else if (b && !s) {
      color = background;
    } else {
      if (this.spriteIndexes[pixel.index] === 0 && x < 255) {
        if (!this.spriteZeroHitLatched) this.spriteZeroHitPending = true;
      }
      if (this.spritePriorities[pixel.index] == 0) {
        color = pixel.color | 0x10;
      } else {
        color = background;
      }
    }
    const c = PPU.PALETTE[this.readPalette(color) % 64];
    this.back.setRGBA(x, y, c);
  }

  private fetchSpritePattern(tile: number, attributes: number, row: number): number {
    const lowPlaneAddress = resolveSpritePatternAddress({
      tileIndex: tile,
      row,
      height: this.flagSpriteSize === 0 ? 8 : 16,
      patternTable: this.flagSpriteTable === 0 ? 0 : 1,
      verticallyFlipped: (attributes & 0x80) !== 0,
    });

    let a = (attributes & 3) << 2;
    // Sprite pixels are evaluated in a batch, but their cartridge bus addresses
    // are emitted later at the hardware fetch dots by observeSpriteFetchAddress().
    let lowTileByte = this.memory.read(lowPlaneAddress, false);
    let highTileByte = this.memory.read(lowPlaneAddress + 8, false);
    let data: number = 0;

    for (let i = 0; i < 8; i++) {
      let p1: number, p2: number;

      if ((attributes & 0x40) === 0x40) {
        // 水平翻转
        p1 = (lowTileByte & 1) << 0;
        p2 = (highTileByte & 1) << 1;
        lowTileByte >>= 1;
        highTileByte >>= 1;
      } else {
        p1 = (lowTileByte & 0x80) >> 7;
        p2 = (highTileByte & 0x80) >> 6;
        lowTileByte <<= 1;
        highTileByte <<= 1;
      }
      data <<= 4;
      data |= a | p1 | p2;
    }
    return data;
  }

  private loadEvaluatedSprites(): void {
    this.spriteCount = this.spriteEvaluator.count;
    for (let slot = 0; slot < this.spriteCount; slot++) {
      const y = this.spriteEvaluator.readSelectedByte(slot, 0);
      const tile = this.spriteEvaluator.readSelectedByte(slot, 1);
      const attributes = this.spriteEvaluator.readSelectedByte(slot, 2);
      const x = this.spriteEvaluator.readSelectedByte(slot, 3);
      this.spritePatterns[slot] = this.fetchSpritePattern(tile, attributes, this.scanLine - y);
      this.spritePositions[slot] = x;
      this.spritePriorities[slot] = (attributes >> 5) & 1;
      this.spriteIndexes[slot] = this.spriteEvaluator.originalIndex(slot);
      this.spritePatternTables[slot] = this.flagSpriteSize === 0 ? this.flagSpriteTable : tile & 1;
    }
  }

  private prepareSpriteFetchSlots(): void {
    // All eight fetch slots run, including on the pre-render scanline. Empty
    // 8x8 slots use PPUCTRL; empty 8x16 slots contain $FF and use table 1.
    this.spritePatternTables.fill(this.flagSpriteSize === 0 ? this.flagSpriteTable : 1);
  }

  private tick() {
    this.ioBus.advanceDots(1);
    if (this.renderingEnabled) {
      if (
        this.timing.skipsOddFrameDot &&
        this.f === 1 &&
        this.scanLine === this.timing.preRenderScanline &&
        this.cycle === 339
      ) {
        this.advanceRenderingMask();
        this.cycle = 0;
        this.scanLine = 0;
        this.frame++;
        this.f ^= 1;
        return;
      }
    }
    this.advanceRenderingMask();
    this.cycle++;
    if (this.cycle > 340) {
      this.cycle = 0;
      this.scanLine++;
      if (this.scanLine >= this.timing.scanlinesPerFrame) {
        this.scanLine = 0;
        this.frame++;
        this.f ^= 1;
      }
    }
  }

  public update() {
    if (this.spriteZeroHitPending) {
      this.spriteZeroHitPending = false;
      this.spriteZeroHitLatched = true;
    }
    this.tick();
    this.clockBackgroundMapperObservations();

    let renderingEnabled = this.renderingEnabled;
    let preLine = this.scanLine === this.timing.preRenderScanline;
    let visibleLine = this.scanLine < 240;
    // postLine := ppu.ScanLine == 240
    let renderLine = preLine || visibleLine;
    let preFetchCycle = this.cycle >= 321 && this.cycle <= 336;
    let visibleCycle = this.cycle >= 1 && this.cycle <= 256;
    let fetchCycle = preFetchCycle || visibleCycle;

    // background logic
    if (renderingEnabled) {
      if (visibleLine && visibleCycle) {
        this.renderPixel();
      }
      if (renderLine && fetchCycle) {
        this.tileDataHigh = ((this.tileDataHigh << 4) | ((this.tileDataLow >>> 28) & 0xf)) >>> 0;
        this.tileDataLow = (this.tileDataLow << 4) >>> 0;

        switch (this.cycle % 8) {
          case 1:
            this.fetchNameTableByte();
            break;
          case 3:
            this.fetchAttributeTableByte();
            break;
          case 5:
            this.fetchLowTileByte();
            break;
          case 7:
            this.fetchHighTileByte();
            break;
          case 0:
            this.storeTileData();
            break;
        }
      }
      if (renderLine && (this.cycle === 337 || this.cycle === 339)) {
        this.observeBackgroundAddress(0x2000);
      }
      if (renderLine && this.cycle >= 257 && this.cycle <= 320) {
        this.oamAddress = 0;
        this.observeSpriteFetchAddress();
      }
      if (preLine && this.cycle >= 280 && this.cycle <= 304) {
        this.copyY();
      }
      if (renderLine) {
        if (fetchCycle && this.cycle % 8 === 0) {
          this.incrementX();
        }
        if (this.cycle === 256) {
          this.incrementY();
        }
        if (this.cycle === 257) {
          this.copyX();
        }
      }
    }

    // sprite evaluation prepares secondary OAM for the following scanline.
    if (visibleLine && this.cycle === 1) {
      this.spriteEvaluator.begin(this.scanLine, this.flagSpriteSize === 0 ? 8 : 16);
    }
    if (visibleLine && renderingEnabled && this.spriteEvaluator.clock(this.cycle, this.oamData)) {
      this.flagSpriteOverflow = 1;
    }
    if (this.cycle === 257) {
      this.prepareSpriteFetchSlots();
      if (visibleLine && renderingEnabled) this.loadEvaluatedSprites();
      else this.spriteCount = 0;
    }

    // vblank logic
    if (this.scanLine === this.timing.vblankStartScanline && this.cycle === 1) {
      this.setVerticalBlank();
    }
    if (preLine && this.cycle == 1) {
      this.clearVerticalBlank();
      this.clearSpriteZeroHit();
      this.flagSpriteOverflow = 0;
    }
  }

  private get renderingEnabled(): boolean {
    return this.effectiveRenderingMask !== 0;
  }

  private advanceRenderingMask(): void {
    if (this.renderingMaskDelay > 0 && --this.renderingMaskDelay === 0) {
      this.effectiveRenderingMask = this.pendingRenderingMask;
    }
  }

  private observeSpriteFetchAddress(): void {
    const phase = this.cycle % 8;
    if (this.cycle === PPU.SPRITE_A12_START_DOT) {
      this.observeCartridgeAddress(this.spritePatternTableForSlot(1) << 12);
      return;
    }
    if (phase === 0 || phase === 2) {
      this.observeCartridgeAddress(0x2000);
      return;
    }
    if ((phase !== 4 && phase !== 6) || this.cycle < PPU.LATER_SPRITE_FETCH_DOT) {
      return;
    }

    const slot = Math.floor((this.cycle - 257) / 8);
    this.observeCartridgeAddress(this.spritePatternTableForSlot(slot) << 12);
  }

  private spritePatternTableForSlot(slot: number): number {
    return this.spritePatternTables[slot] ?? this.flagSpriteTable;
  }

  private observeCartridgeAddress(address: number): void {
    const mapper = this.bus.Mapper;
    if (mapper.observesPpuAddress) mapper.observePpuAddress(address & 0x3fff);
  }

  private readBackgroundByte(address: number): number {
    const value = this.memory.read(address, false);
    this.observeBackgroundAddress(address);
    return value;
  }

  private observeBackgroundAddress(address: number): void {
    this.pendingBackgroundMapperAddresses.push({
      address: address & 0x3fff,
      remainingDots: BACKGROUND_MAPPER_OBSERVATION_DELAY_DOTS,
    });
  }

  private clockBackgroundMapperObservations(): void {
    for (const pending of this.pendingBackgroundMapperAddresses) pending.remainingDots--;
    while ((this.pendingBackgroundMapperAddresses[0]?.remainingDots ?? 1) <= 0) {
      const pending = this.pendingBackgroundMapperAddresses.shift();
      if (pending) this.observeCartridgeAddress(pending.address);
    }
  }

  private clearSpriteZeroHit(): void {
    this.spriteZeroHitPending = false;
    this.spriteZeroHitLatched = false;
  }
}

function validatePpuSnapshot(state: PpuSnapshot, timing: ConsoleTiming): void {
  PpuIoBusLatch.validateState(state.ioBus);
  if (!Number.isInteger(state.cycle) || state.cycle < 0 || state.cycle > 340) {
    throw new RangeError("PPU save state contains an invalid dot");
  }
  if (
    !Number.isInteger(state.scanLine) ||
    state.scanLine < 0 ||
    state.scanLine >= timing.scanlinesPerFrame
  ) {
    throw new RangeError("PPU save state contains an invalid scanline");
  }
  if (
    !Number.isInteger(state.effectiveRenderingMask) ||
    state.effectiveRenderingMask < 0 ||
    state.effectiveRenderingMask > 0x18 ||
    (state.effectiveRenderingMask & ~0x18) !== 0 ||
    !Number.isInteger(state.pendingRenderingMask) ||
    state.pendingRenderingMask < 0 ||
    state.pendingRenderingMask > 0x18 ||
    (state.pendingRenderingMask & ~0x18) !== 0 ||
    !Number.isInteger(state.renderingMaskDelay) ||
    state.renderingMaskDelay < 0 ||
    state.renderingMaskDelay > 2
  ) {
    throw new RangeError("PPU save state contains an invalid rendering-enable pipeline");
  }
  if (!Number.isSafeInteger(state.frame) || state.frame < 0) {
    throw new RangeError("PPU save state contains an invalid frame number");
  }
  const arrays = [
    [state.paletteData, Uint8Array, 32],
    [state.nameTableData, Uint8Array, 4096],
    [state.oamData, Uint8Array, 256],
    [state.front, Uint32Array, 256 * 240],
    [state.back, Uint32Array, 256 * 240],
    [state.spritePatterns, Uint32Array, 8],
    [state.spritePositions, Uint8Array, 8],
    [state.spritePriorities, Uint8Array, 8],
    [state.spriteIndexes, Uint8Array, 8],
    [state.spritePatternTables, Uint8Array, 8],
  ] as const;
  for (const [value, constructor, length] of arrays) {
    if (!(value instanceof constructor) || value.length !== length) {
      throw new RangeError("PPU save state contains an invalid memory region");
    }
  }
  if (state.paletteData.some((value) => value > 0x3f)) {
    throw new RangeError("PPU save state contains non-six-bit palette data");
  }
  SpriteEvaluator.validateState(state.spriteEvaluation);
  validateSpriteZeroHitState(state.spriteZeroHit);
  if (
    state.pendingBackgroundMapperAddresses.some(
      (item) =>
        !Number.isInteger(item.address) ||
        item.address < 0 ||
        item.address > 0x3fff ||
        !Number.isInteger(item.remainingDots) ||
        item.remainingDots < 0 ||
        item.remainingDots > BACKGROUND_MAPPER_OBSERVATION_DELAY_DOTS,
    )
  ) {
    throw new RangeError("PPU save state contains an invalid mapper-address observation");
  }
}

function validateSpriteZeroHitState(state: SpriteZeroHitState): void {
  if (typeof state.pending !== "boolean" || typeof state.latched !== "boolean") {
    throw new RangeError("PPU save state contains invalid sprite-zero hit state");
  }
  if (state.pending && state.latched) {
    throw new RangeError("PPU save state cannot have pending and latched sprite-zero hit together");
  }
}

export default PPU;
