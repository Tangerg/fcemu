import { CartridgeFormatError } from "./cartridge-format-error.js";

export type CartridgeFormat = "ines" | "nes2";

export enum CartridgeTimingMode {
  Ntsc = 0,
  Pal = 1,
  MultiRegion = 2,
  Dendy = 3,
}

export enum CartridgeConsoleType {
  Standard = 0,
  VsSystem = 1,
  PlayChoice10 = 2,
  Extended = 3,
}

export enum NametableMirroring {
  Horizontal = 0,
  Vertical = 1,
  SingleScreenLower = 2,
  SingleScreenUpper = 3,
  FourScreen = 4,
}

export const CARTRIDGE_HEADER_SIZE = 16;
export const CARTRIDGE_TRAINER_SIZE = 512;
const PRG_ROM_UNIT = 16_384;
const CHR_ROM_UNIT = 8192;
const LEGACY_RAM_UNIT = 8192;
const TAITO_X1_005_RAM_SIZE = 0x80;
const TAITO_X1_017_RAM_SIZE = 0x1400;
const BANDAI_24C02_NVRAM_SIZE = 0x100;
const FFE_MAGIC_CARD_WRAM_SIZE = 0x8000;
const OEKA_KIDS_CHR_RAM_SIZE = 0x8000;
const LROG017_CHR_RAM_SIZE = 0x2000;
const WAIXING_TYPE_A_CHR_RAM_SIZE = 0x0800;
const SIGNATURE = [0x4e, 0x45, 0x53, 0x1a] as const;

/** Immutable interpretation of an iNES or NES 2.0 header. */
export interface CartridgeHeader {
  readonly format: CartridgeFormat;
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly prgRomSize: number;
  readonly chrRomSize: number;
  readonly prgRamSize: number;
  readonly prgNvRamSize: number;
  readonly chrRamSize: number;
  readonly chrNvRamSize: number;
  readonly mirroringMode: NametableMirroring;
  readonly hasTrainer: boolean;
  readonly hasBatteryFlag: boolean;
  readonly consoleType: CartridgeConsoleType;
  readonly vsPpuType: number;
  readonly vsHardwareType: number;
  readonly timingMode: CartridgeTimingMode;
  readonly miscellaneousRomCount: number;
  readonly defaultExpansionDevice: number;
}

export function parseCartridgeHeader(buffer: ArrayBuffer, sourceName: string): CartridgeHeader {
  if (buffer.byteLength < CARTRIDGE_HEADER_SIZE) {
    throw new CartridgeFormatError("FILE_TOO_SMALL", sourceName, "file is too small");
  }

  const bytes = new Uint8Array(buffer, 0, CARTRIDGE_HEADER_SIZE);
  validateSignature(bytes, sourceName);
  const flags6 = bytes[6] ?? 0;
  const flags7 = bytes[7] ?? 0;
  const isNes2 = (flags7 & 0x0c) === 0x08;
  const hasBatteryFlag = (flags6 & 0x02) !== 0;
  const consoleType = (flags7 & 0x03) as CartridgeConsoleType;
  const common = {
    format: isNes2 ? ("nes2" as const) : ("ines" as const),
    mapperNumber: (flags6 >>> 4) | (flags7 & 0xf0) | (isNes2 ? ((bytes[8] ?? 0) & 0x0f) << 8 : 0),
    submapperNumber: isNes2 ? (bytes[8] ?? 0) >>> 4 : 0,
    mirroringMode:
      consoleType === CartridgeConsoleType.VsSystem || (flags6 & 0x08) !== 0
        ? NametableMirroring.FourScreen
        : (flags6 & 0x01) === 0
          ? NametableMirroring.Horizontal
          : NametableMirroring.Vertical,
    hasTrainer: (flags6 & 0x04) !== 0,
    hasBatteryFlag,
    consoleType,
  };

  if (isNes2) {
    const sizeMsb = bytes[9] ?? 0;
    const prgRam = bytes[10] ?? 0;
    const chrRam = bytes[11] ?? 0;
    return applyBoardMemoryPolicy({
      ...common,
      prgRomSize: decodeRomSize(bytes[4] ?? 0, sizeMsb & 0x0f, PRG_ROM_UNIT, sourceName),
      chrRomSize: decodeRomSize(bytes[5] ?? 0, sizeMsb >>> 4, CHR_ROM_UNIT, sourceName),
      prgRamSize: decodeRamSize(prgRam & 0x0f),
      prgNvRamSize: decodeRamSize(prgRam >>> 4),
      chrRamSize: decodeRamSize(chrRam & 0x0f),
      chrNvRamSize: decodeRamSize(chrRam >>> 4),
      timingMode: (bytes[12] ?? 0) & 0x03,
      miscellaneousRomCount: (bytes[14] ?? 0) & 0x03,
      defaultExpansionDevice: (bytes[15] ?? 0) & 0x3f,
      vsPpuType: consoleType === CartridgeConsoleType.VsSystem ? (bytes[13] ?? 0) & 0x0f : 0,
      vsHardwareType: consoleType === CartridgeConsoleType.VsSystem ? (bytes[13] ?? 0) >>> 4 : 0,
    });
  }

  const chrRomSize = (bytes[5] ?? 0) * CHR_ROM_UNIT;
  const legacyRamSize = ((bytes[8] ?? 0) || 1) * LEGACY_RAM_UNIT;
  return applyBoardMemoryPolicy({
    ...common,
    prgRomSize: (bytes[4] ?? 0) * PRG_ROM_UNIT,
    chrRomSize,
    prgRamSize: hasBatteryFlag ? 0 : legacyRamSize,
    prgNvRamSize: hasBatteryFlag ? legacyRamSize : 0,
    // Legacy iNES cannot declare TQROM's simultaneous CHR ROM and 8 KiB RAM.
    // Mapper 119 therefore carries the board-implied RAM size as format policy.
    chrRamSize: chrRomSize === 0 || common.mapperNumber === 119 ? CHR_ROM_UNIT : 0,
    chrNvRamSize: 0,
    timingMode: (bytes[9] ?? 0) & 1,
    miscellaneousRomCount: 0,
    defaultExpansionDevice: 0,
    vsPpuType: 0,
    vsHardwareType: 0,
  });
}

/**
 * Normalizes board-implied memory that the iNES/NES 2.0 RAM fields cannot
 * describe faithfully. The battery flag still owns volatility where the board
 * supports it; capacity comes from the selected physical memory chip.
 */
function applyBoardMemoryPolicy(header: CartridgeHeader): CartridgeHeader {
  if (header.mapperNumber === 74 && header.format === "ines" && header.chrRomSize > 0) {
    return Object.freeze({
      ...header,
      chrRamSize: WAIXING_TYPE_A_CHR_RAM_SIZE,
      chrNvRamSize: 0,
    });
  }
  if (header.mapperNumber === 77 && header.format === "ines" && header.chrRomSize > 0) {
    return Object.freeze({
      ...header,
      chrRamSize: LROG017_CHR_RAM_SIZE,
      chrNvRamSize: 0,
    });
  }
  if (header.mapperNumber === 96 && header.format === "ines" && header.chrRomSize === 0) {
    return Object.freeze({
      ...header,
      chrRamSize: OEKA_KIDS_CHR_RAM_SIZE,
      chrNvRamSize: 0,
    });
  }
  if (header.mapperNumber === 99 && header.format === "ines") {
    return Object.freeze({
      ...header,
      prgRamSize: header.hasBatteryFlag ? 0 : 0x0800,
      prgNvRamSize: header.hasBatteryFlag ? 0x0800 : 0,
    });
  }
  if (header.mapperNumber === 16 && header.format === "ines" && header.hasBatteryFlag) {
    return Object.freeze({
      ...header,
      prgRamSize: 0,
      prgNvRamSize: BANDAI_24C02_NVRAM_SIZE,
    });
  }
  if ([6, 8, 17].includes(header.mapperNumber)) {
    return Object.freeze({
      ...header,
      prgRamSize: FFE_MAGIC_CARD_WRAM_SIZE,
      prgNvRamSize: 0,
    });
  }
  let internalPrgBytes = 0;
  if (header.mapperNumber === 80 && header.format === "ines") {
    internalPrgBytes = TAITO_X1_005_RAM_SIZE;
  } else if (header.mapperNumber === 82) internalPrgBytes = TAITO_X1_017_RAM_SIZE;
  if (internalPrgBytes === 0) return Object.freeze(header);

  return Object.freeze({
    ...header,
    prgRamSize: header.hasBatteryFlag ? 0 : internalPrgBytes,
    prgNvRamSize: header.hasBatteryFlag ? internalPrgBytes : 0,
  });
}

function validateSignature(bytes: Uint8Array, sourceName: string): void {
  if (!SIGNATURE.every((expected, index) => bytes[index] === expected)) {
    throw new CartridgeFormatError("INVALID_SIGNATURE", sourceName, "invalid iNES signature");
  }
}

function decodeRomSize(lsb: number, msb: number, linearUnit: number, sourceName: string): number {
  const size =
    msb === 0x0f ? 2 ** (lsb >>> 2) * (((lsb & 0x03) << 1) + 1) : ((msb << 8) | lsb) * linearUnit;
  if (!Number.isSafeInteger(size)) {
    throw new CartridgeFormatError(
      "ROM_SIZE_OUT_OF_RANGE",
      sourceName,
      "encoded ROM size exceeds the supported integer range",
    );
  }
  return size;
}

function decodeRamSize(shift: number): number {
  return shift === 0 ? 0 : 64 << shift;
}
