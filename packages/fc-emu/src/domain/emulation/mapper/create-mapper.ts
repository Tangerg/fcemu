import type Cartridge from "../../model/cartridge.js";
import { AxromMapper } from "./axrom-mapper.js";
import { BnromMapper } from "./bnrom-mapper.js";
import { CnromMapper } from "./cnrom-mapper.js";
import { Mapper34Board } from "./mapper34-board.js";
import { Mmc1Board } from "./mmc1-board.js";
import { Mmc1Mapper } from "./mmc1-mapper.js";
import { Mmc3Mapper } from "./mmc3-mapper.js";
import type { Mapper, MapperInterruptPort } from "./mapper.js";
import { NromMapper } from "./nrom-mapper.js";
import { Nina001Mapper } from "./nina001-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import { UxromMapper } from "./uxrom-mapper.js";

/** Selects cartridge hardware from mapper/submapper identity and validates its bank layout. */
export function createMapper(cartridge: Cartridge, interruptPort: MapperInterruptPort): Mapper {
  switch (cartridge.mapperNumber) {
    case 0:
      requireBaseSubmapper(cartridge);
      requireRomLayout(cartridge, [0x4000, 0x8000], 0x2000);
      requireDirectPrgRam(cartridge);
      return new NromMapper(cartridge);
    case 1:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x1000, 0x2000);
      return new Mmc1Mapper(cartridge, Mmc1Board.resolve(cartridge));
    case 2:
      requireBankedLayout(cartridge, 0x4000, 0x8000, 0x2000, 0x2000);
      requireWritableChrSize(cartridge, 0x2000);
      requireDirectPrgRam(cartridge);
      return new UxromMapper(cartridge, resolveBusConflicts(cartridge, false));
    case 3:
      requireCnromLayout(cartridge);
      requireWritableChrSize(cartridge, 0x2000);
      requireDirectPrgRam(cartridge);
      return new CnromMapper(cartridge, resolveBusConflicts(cartridge, true));
    case 4:
      requireBaseSubmapper(cartridge);
      requireBankedLayout(cartridge, 0x2000, 0x8000, 0x0400, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0x40_000);
      requireWritableChrSize(cartridge, 0x2000);
      requireMmc3PrgRam(cartridge);
      return new Mmc3Mapper(interruptPort, cartridge);
    case 7:
      requireBankedLayout(cartridge, 0x8000, 0x8000, 0x2000, 0x2000);
      requireMaximumRomSize(cartridge, 0x80_000, 0);
      requireWritableChrSize(cartridge, 0x2000);
      if (!cartridge.hasWritableChrMemory) {
        throw configurationError(cartridge, "AxROM requires 8 KiB of writable CHR memory");
      }
      if (cartridge.format === "nes2" && cartridge.prgWritableBytes > 0) {
        throw configurationError(cartridge, "AxROM does not map PRG RAM");
      }
      return new AxromMapper(cartridge, resolveBusConflicts(cartridge, false));
    case 34: {
      const board = Mapper34Board.resolve(cartridge);
      return board.kind === "nina-001" ? new Nina001Mapper(cartridge) : new BnromMapper(cartridge);
    }
    default:
      throw new UnsupportedMapperError(cartridge.mapperNumber);
  }
}

function requireMaximumRomSize(
  cartridge: Cartridge,
  maximumPrgBytes: number,
  maximumChrBytes: number,
): void {
  if (cartridge.prgRom.byteLength > maximumPrgBytes) {
    throw configurationError(cartridge, `PRG ROM cannot exceed ${formatBytes(maximumPrgBytes)}`);
  }
  if (maximumChrBytes > 0 && cartridge.chrMemoryBytes > maximumChrBytes) {
    throw configurationError(cartridge, `CHR memory cannot exceed ${formatBytes(maximumChrBytes)}`);
  }
}

function requireWritableChrSize(cartridge: Cartridge, requiredBytes: number): void {
  if (cartridge.hasWritableChrMemory && cartridge.chrMemoryBytes !== requiredBytes) {
    throw configurationError(
      cartridge,
      `writable CHR memory must be ${formatBytes(requiredBytes)}`,
    );
  }
}

function requireMmc3PrgRam(cartridge: Cartridge): void {
  requireDirectPrgRam(cartridge);
  if (cartridge.prgWritableBytes !== 0 && cartridge.prgWritableBytes !== 0x2000) {
    throw configurationError(cartridge, "MMC3 PRG RAM must be 8 KiB when present");
  }
}

function requireDirectPrgRam(cartridge: Cartridge): void {
  if (cartridge.prgWritableBytes > 0x2000) {
    throw configurationError(cartridge, "PRG RAM must fit the direct 8 KiB window");
  }
  if (cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0) {
    throw configurationError(cartridge, "mixed PRG RAM/NVRAM requires mapper-controlled banking");
  }
}

function resolveBusConflicts(cartridge: Cartridge, legacyDefault: boolean): boolean {
  switch (cartridge.submapperNumber) {
    case 0:
      return legacyDefault;
    case 1:
      return false;
    case 2:
      return true;
    default:
      throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function requireBaseSubmapper(cartridge: Cartridge): void {
  if (cartridge.submapperNumber !== 0) {
    throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
  }
}

function requireRomLayout(
  cartridge: Cartridge,
  allowedPrgSizes: readonly number[],
  requiredChrSize: number,
): void {
  if (!allowedPrgSizes.includes(cartridge.prgRom.byteLength)) {
    throw configurationError(cartridge, `PRG ROM must be ${formatSizes(allowedPrgSizes)}`);
  }
  if (cartridge.chrMemoryBytes !== requiredChrSize) {
    throw configurationError(cartridge, `CHR memory must be ${formatBytes(requiredChrSize)}`);
  }
}

function requireBankedLayout(
  cartridge: Cartridge,
  prgBankSize: number,
  minimumPrgSize: number,
  chrBankSize: number,
  minimumChrSize: number,
): void {
  if (
    cartridge.prgRom.byteLength < minimumPrgSize ||
    cartridge.prgRom.byteLength % prgBankSize !== 0
  ) {
    throw configurationError(
      cartridge,
      `PRG ROM must be at least ${formatBytes(minimumPrgSize)} in ${formatBytes(prgBankSize)} banks`,
    );
  }
  if (cartridge.chrMemoryBytes < minimumChrSize || cartridge.chrMemoryBytes % chrBankSize !== 0) {
    throw configurationError(
      cartridge,
      `CHR memory must be at least ${formatBytes(minimumChrSize)} in ${formatBytes(chrBankSize)} banks`,
    );
  }
}

function requireCnromLayout(cartridge: Cartridge): void {
  if (cartridge.prgRom.byteLength !== 0x4000 && cartridge.prgRom.byteLength !== 0x8000) {
    throw configurationError(cartridge, "PRG ROM must be 16 KiB or 32 KiB");
  }
  if (
    cartridge.chrMemoryBytes < 0x2000 ||
    cartridge.chrMemoryBytes > 0x20_000 ||
    cartridge.chrMemoryBytes % 0x2000 !== 0
  ) {
    throw configurationError(cartridge, "CHR memory must contain one to sixteen 8 KiB banks");
  }
}

function configurationError(
  cartridge: Cartridge,
  reason: string,
): UnsupportedMapperConfigurationError {
  return new UnsupportedMapperConfigurationError(
    cartridge.mapperNumber,
    cartridge.submapperNumber,
    reason,
  );
}

function formatSizes(sizes: readonly number[]): string {
  return sizes.map(formatBytes).join(" or ");
}

function formatBytes(bytes: number): string {
  return `${bytes / 1024} KiB`;
}
