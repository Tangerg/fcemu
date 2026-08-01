import { CartridgeFormatError } from "./cartridge-format-error.js";
import {
  CARTRIDGE_HEADER_SIZE,
  CARTRIDGE_TRAINER_SIZE,
  parseCartridgeHeader,
  type CartridgeHeader,
  type CartridgeFormat,
  type CartridgeTimingMode,
  type CartridgeConsoleType,
  type NametableMirroring,
} from "./cartridge-header.js";
import {
  CartridgeMemory,
  type CartridgeMemoryState,
  type CartridgeSaveSnapshot,
} from "./cartridge-memory.js";
import { enrichLegacyVsRomMetadata } from "./legacy-vs-rom-metadata.js";

export { CartridgeFormatError } from "./cartridge-format-error.js";
export type { CartridgeFormatErrorCode } from "./cartridge-format-error.js";
export { CartridgeTimingMode, NametableMirroring } from "./cartridge-header.js";
export { CartridgeConsoleType } from "./cartridge-header.js";
export type { CartridgeFormat } from "./cartridge-header.js";

const MAX_SUPPORTED_PRG_RAM_SIZE = 0x8000;
const MMC5_EXRAM_SIZE = 0x0400;
const NAMCO_163_INTERNAL_RAM_SIZE = 0x80;
const DONGDA_93C66_NVRAM_SIZE = 0x0200;
const TRAINER_RAM_OFFSET = 0x1000;

/** Cartridge ROM, writable memory and board-identifying metadata. */
class Cartridge {
  readonly prgRom: Uint8Array;
  readonly chrRom: Uint8Array;
  private readonly memory: CartridgeMemory;
  private readonly trainer: Uint8Array;

  readonly format: CartridgeFormat;
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly timingMode: CartridgeTimingMode;
  readonly consoleType: CartridgeConsoleType;
  readonly vsPpuType: number;
  readonly vsHardwareType: number;
  readonly defaultExpansionDevice: number;
  mirroringMode: NametableMirroring;
  readonly hasBatteryBackup: boolean;
  readonly hasWritableChrMemory: boolean;
  readonly prgRamBytes: number;
  readonly prgNvRamBytes: number;
  readonly chrRamBytes: number;
  readonly chrNvRamBytes: number;
  readonly mapperRamBytes: number;
  readonly mapperNvRamBytes: number;

  static fromArrayBuffer(arrayBuffer: ArrayBuffer, sourceName = "ROM"): Cartridge {
    const parsedHeader = parseCartridgeHeader(arrayBuffer, sourceName);
    Cartridge.validateSupportedHeader(parsedHeader, sourceName);

    let offset = CARTRIDGE_HEADER_SIZE;
    let trainer: Uint8Array | undefined;
    if (parsedHeader.hasTrainer) {
      if (offset + CARTRIDGE_TRAINER_SIZE > arrayBuffer.byteLength) {
        throw new CartridgeFormatError("INCOMPLETE_TRAINER", sourceName, "incomplete trainer data");
      }
      trainer = new Uint8Array(arrayBuffer.slice(offset, offset + CARTRIDGE_TRAINER_SIZE));
      offset += CARTRIDGE_TRAINER_SIZE;
    }

    if (offset + parsedHeader.prgRomSize > arrayBuffer.byteLength) {
      throw new CartridgeFormatError("INCOMPLETE_PRG_ROM", sourceName, "incomplete PRG ROM data");
    }
    const prgRom = new Uint8Array(arrayBuffer.slice(offset, offset + parsedHeader.prgRomSize));
    offset += parsedHeader.prgRomSize;

    let chrRom = new Uint8Array(0);
    if (parsedHeader.chrRomSize > 0) {
      if (offset + parsedHeader.chrRomSize > arrayBuffer.byteLength) {
        throw new CartridgeFormatError("INCOMPLETE_CHR_ROM", sourceName, "incomplete CHR ROM data");
      }
      chrRom = new Uint8Array(arrayBuffer.slice(offset, offset + parsedHeader.chrRomSize));
    }

    const header = enrichLegacyVsRomMetadata(parsedHeader, prgRom, chrRom);
    if (header !== parsedHeader) Cartridge.validateSupportedHeader(header, sourceName);
    return new Cartridge(header, prgRom, chrRom, trainer);
  }

  private constructor(
    header: CartridgeHeader,
    prgRom: Uint8Array,
    chrRom: Uint8Array,
    trainer: Uint8Array | undefined,
  ) {
    this.prgRom = prgRom;
    this.chrRom = chrRom;
    this.trainer = trainer?.slice() ?? new Uint8Array(0);
    this.prgRamBytes = header.prgRamSize;
    this.prgNvRamBytes = header.prgNvRamSize;
    this.chrRamBytes = header.chrRamSize;
    this.chrNvRamBytes = header.chrNvRamSize;
    const mapperMemoryBytes =
      header.mapperNumber === 5
        ? MMC5_EXRAM_SIZE
        : header.mapperNumber === 19
          ? NAMCO_163_INTERNAL_RAM_SIZE
          : header.mapperNumber === 164
            ? DONGDA_93C66_NVRAM_SIZE
            : 0;
    const mapperMemoryIsPersistent =
      (header.mapperNumber === 19 || header.mapperNumber === 164) && header.hasBatteryFlag;
    this.mapperRamBytes = mapperMemoryIsPersistent ? 0 : mapperMemoryBytes;
    this.mapperNvRamBytes = mapperMemoryIsPersistent ? mapperMemoryBytes : 0;
    this.memory = new CartridgeMemory({
      prgRamBytes: this.prgRamBytes,
      prgNvRamBytes: this.prgNvRamBytes,
      chrRamBytes: this.chrRamBytes,
      chrNvRamBytes: this.chrNvRamBytes,
      mapperRamBytes: this.mapperRamBytes,
      mapperNvRamBytes: this.mapperNvRamBytes,
    });
    if (header.mapperNumber === 164) {
      const erasedEeprom = new Uint8Array(DONGDA_93C66_NVRAM_SIZE);
      erasedEeprom.fill(0xff);
      this.memory.initializeMapper(0, erasedEeprom);
    }
    const mapperLoadsTrainer =
      [6, 8, 17].includes(header.mapperNumber) ||
      (header.mapperNumber === 12 && header.format === "nes2" && header.submapperNumber === 1);
    if (trainer && !mapperLoadsTrainer) {
      this.memory.initializePrg(TRAINER_RAM_OFFSET, trainer);
    }

    this.format = header.format;
    this.mapperNumber = header.mapperNumber;
    this.submapperNumber = header.submapperNumber;
    this.timingMode = header.timingMode;
    this.consoleType = header.consoleType;
    this.vsPpuType = header.vsPpuType;
    this.vsHardwareType = header.vsHardwareType;
    this.defaultExpansionDevice = header.defaultExpansionDevice;
    this.mirroringMode = header.mirroringMode;
    this.hasBatteryBackup = this.memory.hasBatteryBackup;
    this.hasWritableChrMemory = this.memory.chrAddressSpaceBytes > 0;
  }

  get prgWritableBytes(): number {
    return this.memory.prgAddressSpaceBytes;
  }

  get chrMemoryBytes(): number {
    return this.chrRom.byteLength || this.memory.chrAddressSpaceBytes;
  }

  get chrWritableBytes(): number {
    return this.memory.chrAddressSpaceBytes;
  }

  get trainerByteLength(): number {
    return this.trainer.byteLength;
  }

  readTrainer(index: number): number {
    return this.trainer[index] ?? 0;
  }

  readPrgRam(index: number): number {
    return this.memory.readPrg(index);
  }

  writePrgRam(index: number, value: number): void {
    this.memory.writePrg(index, value);
  }

  readChr(index: number): number {
    return this.chrRom.byteLength > 0 ? (this.chrRom[index] ?? 0) : this.memory.readChr(index);
  }

  writeChr(index: number, value: number): void {
    if (this.chrRom.byteLength === 0) this.memory.writeChr(index, value);
  }

  readWritableChr(index: number): number {
    return this.memory.readChr(index);
  }

  writeWritableChr(index: number, value: number): void {
    this.memory.writeChr(index, value);
  }

  readMapperRam(index: number): number {
    return this.memory.readMapper(index);
  }

  writeMapperRam(index: number, value: number): void {
    this.memory.writeMapper(index, value);
  }

  powerOn(): void {
    this.memory.powerOn();
  }

  captureBatterySave(): CartridgeSaveSnapshot | undefined {
    return this.memory.captureSave();
  }

  restoreBatterySave(data: Uint8Array): void {
    this.memory.restoreSave(data);
  }

  captureMemoryState(): CartridgeMemoryState {
    return this.memory.captureState();
  }

  restoreMemoryState(state: CartridgeMemoryState): void {
    this.memory.restoreState(state);
  }

  private static validateSupportedHeader(header: CartridgeHeader, sourceName: string): void {
    if (header.prgRomSize === 0) {
      throw new CartridgeFormatError("MISSING_PRG_ROM", sourceName, "PRG ROM is missing");
    }
    if (header.consoleType !== 0 && header.consoleType !== 1) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_CONSOLE_TYPE",
        sourceName,
        `console type ${header.consoleType} is not supported`,
      );
    }
    if (header.consoleType === 1) {
      if (header.timingMode !== 0) {
        throw new CartridgeFormatError(
          "UNSUPPORTED_TIMING_MODE",
          sourceName,
          "Vs. System hardware requires NTSC CPU/PPU timing",
        );
      }
      if (![0, 2, 3, 4, 5, 8, 9, 10, 11].includes(header.vsPpuType)) {
        throw new CartridgeFormatError(
          "UNSUPPORTED_CONSOLE_TYPE",
          sourceName,
          `Vs. PPU type ${header.vsPpuType} is reserved or unsupported`,
        );
      }
      if (header.vsHardwareType > 4) {
        throw new CartridgeFormatError(
          "UNSUPPORTED_CONSOLE_TYPE",
          sourceName,
          `Vs. hardware type ${header.vsHardwareType} requires an unsupported DualSystem`,
        );
      }
    }
    if (header.miscellaneousRomCount !== 0) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_MISC_ROM",
        sourceName,
        "miscellaneous ROM data is not supported",
      );
    }
    const supportedExpansionDevices = header.consoleType === 1 ? [0, 4, 5] : [0, 1];
    if (!supportedExpansionDevices.includes(header.defaultExpansionDevice)) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_EXPANSION_DEVICE",
        sourceName,
        `default expansion device ${header.defaultExpansionDevice} is not supported`,
      );
    }
    if (header.prgRamSize + header.prgNvRamSize > MAX_SUPPORTED_PRG_RAM_SIZE) {
      throw Cartridge.unsupportedRamLayout(sourceName, "more than 32 KiB of combined PRG RAM");
    }
    if ((header.prgNvRamSize > 0 || header.chrNvRamSize > 0) && !header.hasBatteryFlag) {
      throw new CartridgeFormatError(
        "INVALID_NES2_RAM_FLAGS",
        sourceName,
        "NVRAM requires the battery flag",
      );
    }
    if (
      header.hasBatteryFlag &&
      header.prgNvRamSize === 0 &&
      header.chrNvRamSize === 0 &&
      ![19, 164].includes(header.mapperNumber)
    ) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_BATTERY_MEMORY",
        sourceName,
        "battery-backed mapper-internal memory is not supported",
      );
    }
    if (header.chrRomSize === 0) {
      if (header.chrRamSize + header.chrNvRamSize === 0) {
        throw new CartridgeFormatError(
          "MISSING_CHR_MEMORY",
          sourceName,
          "NES 2.0 image has neither CHR ROM nor explicitly-sized CHR RAM",
        );
      }
      if (header.chrRamSize > 0 && header.chrNvRamSize > 0) {
        throw Cartridge.unsupportedRamLayout(sourceName, "simultaneous CHR RAM and CHR NVRAM");
      }
    } else if (
      header.chrRamSize + header.chrNvRamSize > 0 &&
      !(
        [19, 74, 77, 119].includes(header.mapperNumber) &&
        header.chrRamSize > 0 &&
        header.chrNvRamSize === 0
      )
    ) {
      throw Cartridge.unsupportedRamLayout(
        sourceName,
        "simultaneous CHR ROM and writable CHR memory",
      );
    }
    if (header.hasTrainer && header.prgRamSize + header.prgNvRamSize < 0x2000) {
      throw Cartridge.unsupportedRamLayout(sourceName, "trainer without an 8 KiB PRG RAM window");
    }
  }

  private static unsupportedRamLayout(sourceName: string, detail: string): CartridgeFormatError {
    return new CartridgeFormatError(
      "UNSUPPORTED_RAM_LAYOUT",
      sourceName,
      `${detail} is not supported yet`,
    );
  }
}

export default Cartridge;
