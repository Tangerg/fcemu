import { CartridgeFormatError } from "./cartridge-format-error.js";

export type CartridgeFormat = "ines" | "nes2";

export enum CartridgeTimingMode {
  Ntsc = 0,
  Pal = 1,
  MultiRegion = 2,
  Dendy = 3,
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
  readonly consoleType: number;
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
  const common = {
    format: isNes2 ? ("nes2" as const) : ("ines" as const),
    mapperNumber: (flags6 >>> 4) | (flags7 & 0xf0) | (isNes2 ? ((bytes[8] ?? 0) & 0x0f) << 8 : 0),
    submapperNumber: isNes2 ? (bytes[8] ?? 0) >>> 4 : 0,
    mirroringMode:
      (flags6 & 0x08) !== 0
        ? NametableMirroring.FourScreen
        : (flags6 & 0x01) === 0
          ? NametableMirroring.Horizontal
          : NametableMirroring.Vertical,
    hasTrainer: (flags6 & 0x04) !== 0,
    hasBatteryFlag,
    consoleType: flags7 & 0x03,
  };

  if (isNes2) {
    const sizeMsb = bytes[9] ?? 0;
    const prgRam = bytes[10] ?? 0;
    const chrRam = bytes[11] ?? 0;
    return Object.freeze({
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
    });
  }

  const chrRomSize = (bytes[5] ?? 0) * CHR_ROM_UNIT;
  const legacyRamSize = ((bytes[8] ?? 0) || 1) * LEGACY_RAM_UNIT;
  return Object.freeze({
    ...common,
    prgRomSize: (bytes[4] ?? 0) * PRG_ROM_UNIT,
    chrRomSize,
    prgRamSize: hasBatteryFlag ? 0 : legacyRamSize,
    prgNvRamSize: hasBatteryFlag ? legacyRamSize : 0,
    chrRamSize: chrRomSize === 0 ? CHR_ROM_UNIT : 0,
    chrNvRamSize: 0,
    timingMode: (bytes[9] ?? 0) & 1,
    miscellaneousRomCount: 0,
    defaultExpansionDevice: 0,
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
