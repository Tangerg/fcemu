import type Cartridge from "../../model/cartridge.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";

type Mmc1BoardKind = "standard" | "snrom" | "surom" | "sorom" | "sxrom" | "szrom" | "serom";

interface Mmc1BoardDefinition {
  readonly kind: Mmc1BoardKind;
  readonly usesPrgOuterBank?: boolean;
  readonly disablesPrgRamWithChrBit4?: boolean;
  readonly prgRamBankShift?: 2 | 3 | 4;
  readonly prgRamBankMask?: number;
}

/** Immutable SxROM board wiring selected from header identity and memory geometry. */
export class Mmc1Board {
  private constructor(
    readonly kind: Mmc1BoardKind,
    private readonly usesPrgOuterBank: boolean,
    private readonly fixesPrgRom: boolean,
    private readonly disablesPrgRamWithChrBit4: boolean,
    private readonly prgRamBankShift?: 2 | 3 | 4,
    private readonly prgRamBankMask = 0,
  ) {
    Object.freeze(this);
  }

  static standard(): Mmc1Board {
    return new Mmc1Board("standard", false, false, false);
  }

  static resolve(cartridge: Cartridge): Mmc1Board {
    const definition = resolveGeometry(cartridge);
    const board = new Mmc1Board(
      definition.kind,
      definition.usesPrgOuterBank ?? false,
      false,
      definition.disablesPrgRamWithChrBit4 ?? false,
      definition.prgRamBankShift,
      definition.prgRamBankMask,
    );
    switch (cartridge.submapperNumber) {
      case 0:
        return board;
      case 1:
        return requireExplicitBoard(cartridge, board, "surom", 0x2000);
      case 2:
        return requireExplicitBoard(cartridge, board, "sorom", 0x4000);
      case 4:
        return requireExplicitBoard(cartridge, board, "sxrom", 0x8000);
      case 5:
        if (cartridge.prgRom.byteLength !== 0x8000 || cartridge.prgWritableBytes !== 0) {
          throw configurationError(
            cartridge,
            "MMC1 submapper 5 requires fixed 32 KiB PRG ROM without PRG RAM",
          );
        }
        return new Mmc1Board("serom", false, true, false);
      default:
        throw new UnsupportedMapperVariantError(cartridge.mapperNumber, cartridge.submapperNumber);
    }
  }

  get hasFixedPrgRom(): boolean {
    return this.fixesPrgRom;
  }

  prgOuterBank(activeChrBank: number): number {
    return this.usesPrgOuterBank && (activeChrBank & 0x10) !== 0 ? 16 : 0;
  }

  prgRamBank(activeChrBank: number): number {
    return this.prgRamBankShift === undefined
      ? 0
      : (activeChrBank >> this.prgRamBankShift) & this.prgRamBankMask;
  }

  isPrgRamEnabled(prgBank: number, activeChrBank: number): boolean {
    if ((prgBank & 0x10) !== 0) return false;
    return !this.disablesPrgRamWithChrBit4 || (activeChrBank & 0x10) === 0;
  }
}

function resolveGeometry(cartridge: Cartridge): Mmc1BoardDefinition {
  const prgRomBytes = cartridge.prgRom.byteLength;
  const prgRamBytes = cartridge.prgWritableBytes;
  const chrBytes = cartridge.chrMemoryBytes;
  const usesEightKiBChrRam = cartridge.hasWritableChrMemory && chrBytes === 0x2000;
  const usesMixedPrgRam = cartridge.prgRamBytes > 0 && cartridge.prgNvRamBytes > 0;

  if (cartridge.hasWritableChrMemory && chrBytes !== 0x2000) {
    throw configurationError(cartridge, "writable MMC1 CHR memory must be 8 KiB");
  }
  if (prgRomBytes > 0x80_000) {
    throw configurationError(cartridge, "MMC1 PRG ROM cannot exceed 512 KiB");
  }
  if (![0, 0x2000, 0x4000, 0x8000].includes(prgRamBytes)) {
    throw configurationError(cartridge, "MMC1 PRG RAM must be 0, 8, 16 or 32 KiB");
  }
  if (
    usesMixedPrgRam &&
    !(cartridge.prgRamBytes === 0x2000 && cartridge.prgNvRamBytes === 0x2000)
  ) {
    throw configurationError(
      cartridge,
      "mixed MMC1 PRG RAM/NVRAM must contain one 8 KiB region of each kind",
    );
  }

  if (prgRomBytes > 0x40_000) {
    if (prgRomBytes !== 0x80_000 || !usesEightKiBChrRam) {
      throw configurationError(cartridge, "512 KiB MMC1 PRG ROM requires an 8 KiB CHR-RAM board");
    }
    if (prgRamBytes === 0x4000) {
      throw configurationError(cartridge, "no 512 KiB MMC1 board maps 16 KiB of PRG RAM");
    }
    return prgRamBytes === 0x8000
      ? {
          kind: "sxrom",
          usesPrgOuterBank: true,
          prgRamBankShift: 2,
          prgRamBankMask: 0x03,
        }
      : { kind: "surom", usesPrgOuterBank: true };
  }

  if (prgRamBytes === 0x8000) {
    if (!usesEightKiBChrRam || usesMixedPrgRam) {
      throw configurationError(cartridge, "32 KiB MMC1 PRG RAM requires an SXROM CHR-RAM board");
    }
    return { kind: "sxrom", prgRamBankShift: 2, prgRamBankMask: 0x03 };
  }

  if (prgRamBytes === 0x4000) {
    if (usesEightKiBChrRam) {
      return { kind: "sorom", prgRamBankShift: 3, prgRamBankMask: 0x01 };
    }
    if (!cartridge.hasWritableChrMemory && chrBytes >= 0x4000 && chrBytes <= 0x10_000) {
      return { kind: "szrom", prgRamBankShift: 4, prgRamBankMask: 0x01 };
    }
    throw configurationError(
      cartridge,
      "16 KiB MMC1 PRG RAM requires an SOROM or SZROM memory layout",
    );
  }

  if (chrBytes > 0x20_000) {
    throw configurationError(cartridge, "MMC1 CHR memory cannot exceed 128 KiB");
  }
  if (usesEightKiBChrRam && prgRamBytes === 0x2000) {
    return { kind: "snrom", disablesPrgRamWithChrBit4: true };
  }
  return { kind: "standard" };
}

function requireExplicitBoard(
  cartridge: Cartridge,
  board: Mmc1Board,
  expectedKind: Mmc1BoardKind,
  expectedPrgRamBytes: number,
): Mmc1Board {
  if (board.kind !== expectedKind || cartridge.prgWritableBytes !== expectedPrgRamBytes) {
    throw configurationError(
      cartridge,
      `MMC1 submapper ${cartridge.submapperNumber} requires ${expectedKind.toUpperCase()} memory geometry`,
    );
  }
  return board;
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
