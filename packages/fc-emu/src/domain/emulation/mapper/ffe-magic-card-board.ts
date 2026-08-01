import type { CartridgeFormat } from "../../model/cartridge.js";

type FfeMagicCardBoardId =
  "magic-card-6" | "magic-card-8" | "super-magic-card" | "super-magic-card-4m";

export interface FfeMagicCardBoard {
  readonly id: FfeMagicCardBoardId;
  readonly initialLatchMode: number;
  readonly prgMemoryBytes: number;
  readonly chrMemoryBytes: number;
  readonly hasSuperMagicCardFeatures: boolean;
  readonly trainerLoadAddress: number;
  readonly trainerReturnsToResetVector: boolean;
  readonly initialSuperMode: number;
  readonly chrRomPrgOffset: number | null;
}

/**
 * Resolves the modern disk-extraction meaning of FFE mapper IDs.
 *
 * Legacy mapper 6 means mode 1; NES 2.0 uses submappers 0-7 as the exact
 * initial latch mode. Mapper 8 is mapper 6 mode 4. Mapper 12.1 is a fixed 4M
 * extraction layout, while mapper 17's submapper only relocates a trainer.
 */
export function findFfeMagicCardBoard(
  mapperNumber: number,
  format: CartridgeFormat,
  submapperNumber: number,
): FfeMagicCardBoard | undefined {
  if (mapperNumber === 6) {
    const mode = format === "ines" ? 1 : submapperNumber;
    return mode <= 7
      ? board("magic-card-6", mode, 0x40_000, 0x8000, false, 0x7000, true, 0, null)
      : undefined;
  }
  if (mapperNumber === 8) {
    return submapperNumber === 0
      ? board("magic-card-8", 4, 0x40_000, 0x8000, false, 0x7000, true, 0, null)
      : undefined;
  }
  if (mapperNumber === 12) {
    return format === "nes2" && submapperNumber === 1
      ? board("super-magic-card-4m", 1, 0x80_000, 0x8000, true, 0x7000, true, 0x42, 0x40_000)
      : undefined;
  }
  if (mapperNumber === 17) {
    const trainerLoadAddress = [0x7000, 0x5d00, 0x5e00, 0x5f00][submapperNumber];
    return trainerLoadAddress === undefined
      ? undefined
      : board(
          "super-magic-card",
          1,
          0x80_000,
          0x40_000,
          true,
          trainerLoadAddress,
          false,
          0x47,
          null,
        );
  }
  return undefined;
}

function board(
  id: FfeMagicCardBoardId,
  initialLatchMode: number,
  prgMemoryBytes: number,
  chrMemoryBytes: number,
  hasSuperMagicCardFeatures: boolean,
  trainerLoadAddress: number,
  trainerReturnsToResetVector: boolean,
  initialSuperMode: number,
  chrRomPrgOffset: number | null,
): FfeMagicCardBoard {
  return Object.freeze({
    id,
    initialLatchMode,
    prgMemoryBytes,
    chrMemoryBytes,
    hasSuperMagicCardFeatures,
    trainerLoadAddress,
    trainerReturnsToResetVector,
    initialSuperMode,
    chrRomPrgOffset,
  });
}
