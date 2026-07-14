import { CartridgeFormatError } from "./cartridge-format-error.js";
import {
  CARTRIDGE_HEADER_SIZE,
  CARTRIDGE_TRAINER_SIZE,
  parseCartridgeHeader,
  type CartridgeHeader,
  type CartridgeFormat,
  type CartridgeTimingMode,
  type NametableMirroring,
} from "./cartridge-header.js";
import {
  CartridgeMemory,
  type CartridgeMemoryState,
  type CartridgeSaveSnapshot,
} from "./cartridge-memory.js";

export { CartridgeFormatError } from "./cartridge-format-error.js";
export type { CartridgeFormatErrorCode } from "./cartridge-format-error.js";
export { CartridgeTimingMode, NametableMirroring } from "./cartridge-header.js";
export type { CartridgeFormat } from "./cartridge-header.js";

const MAX_SUPPORTED_PRG_RAM_SIZE = 0x8000;
const TRAINER_RAM_OFFSET = 0x1000;

/** Cartridge ROM, writable memory and board-identifying metadata. */
class Cartridge {
  readonly prgRom: Uint8Array;
  readonly chrRom: Uint8Array;
  private readonly memory: CartridgeMemory;

  readonly format: CartridgeFormat;
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly timingMode: CartridgeTimingMode;
  mirroringMode: NametableMirroring;
  readonly hasBatteryBackup: boolean;
  readonly hasWritableChrMemory: boolean;
  readonly prgRamBytes: number;
  readonly prgNvRamBytes: number;
  readonly chrRamBytes: number;
  readonly chrNvRamBytes: number;

  static fromArrayBuffer(arrayBuffer: ArrayBuffer, sourceName = "ROM"): Cartridge {
    const header = parseCartridgeHeader(arrayBuffer, sourceName);
    Cartridge.validateSupportedHeader(header, sourceName);

    let offset = CARTRIDGE_HEADER_SIZE;
    let trainer: Uint8Array | undefined;
    if (header.hasTrainer) {
      if (offset + CARTRIDGE_TRAINER_SIZE > arrayBuffer.byteLength) {
        throw new CartridgeFormatError("INCOMPLETE_TRAINER", sourceName, "incomplete trainer data");
      }
      trainer = new Uint8Array(arrayBuffer.slice(offset, offset + CARTRIDGE_TRAINER_SIZE));
      offset += CARTRIDGE_TRAINER_SIZE;
    }

    if (offset + header.prgRomSize > arrayBuffer.byteLength) {
      throw new CartridgeFormatError("INCOMPLETE_PRG_ROM", sourceName, "incomplete PRG ROM data");
    }
    const prgRom = new Uint8Array(arrayBuffer.slice(offset, offset + header.prgRomSize));
    offset += header.prgRomSize;

    let chrRom = new Uint8Array(0);
    if (header.chrRomSize > 0) {
      if (offset + header.chrRomSize > arrayBuffer.byteLength) {
        throw new CartridgeFormatError("INCOMPLETE_CHR_ROM", sourceName, "incomplete CHR ROM data");
      }
      chrRom = new Uint8Array(arrayBuffer.slice(offset, offset + header.chrRomSize));
    }

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
    this.prgRamBytes = header.prgRamSize;
    this.prgNvRamBytes = header.prgNvRamSize;
    this.chrRamBytes = header.chrRamSize;
    this.chrNvRamBytes = header.chrNvRamSize;
    this.memory = new CartridgeMemory({
      prgRamBytes: this.prgRamBytes,
      prgNvRamBytes: this.prgNvRamBytes,
      chrRamBytes: this.chrRamBytes,
      chrNvRamBytes: this.chrNvRamBytes,
    });
    if (trainer) this.memory.initializePrg(TRAINER_RAM_OFFSET, trainer);

    this.format = header.format;
    this.mapperNumber = header.mapperNumber;
    this.submapperNumber = header.submapperNumber;
    this.timingMode = header.timingMode;
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
    if (header.consoleType !== 0) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_CONSOLE_TYPE",
        sourceName,
        `console type ${header.consoleType} is not supported`,
      );
    }
    if (header.miscellaneousRomCount !== 0) {
      throw new CartridgeFormatError(
        "UNSUPPORTED_MISC_ROM",
        sourceName,
        "miscellaneous ROM data is not supported",
      );
    }
    if (header.defaultExpansionDevice > 1) {
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
    if (header.hasBatteryFlag && header.prgNvRamSize === 0 && header.chrNvRamSize === 0) {
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
    } else if (header.chrRamSize + header.chrNvRamSize > 0) {
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
