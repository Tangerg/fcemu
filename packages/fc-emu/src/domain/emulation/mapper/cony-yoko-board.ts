import type { CartridgeFormat } from "../../model/cartridge.js";

type ConyYokoBoardId = "cony-83-0" | "cony-83-1" | "cony-83-2" | "cony-83-3";

/**
 * Immutable PCB wiring around the shared Cony/Yoko ASIC.
 *
 * The submappers change physical address lines and writable-memory ownership;
 * they are board identities rather than runtime feature flags.
 */
export interface ConyYokoBoard {
  readonly id: ConyYokoBoardId;
  readonly chrBankBytes: 0x0400 | 0x0800;
  readonly innerPrgBytes: 0x20_000 | 0x40_000;
  readonly prgAddressMask: 0x3f | 0xff;
  readonly chrOuterShift: 4 | 6 | null;
  readonly maximumChrBytes: number;
  readonly maps32KiBPrgNvRam: boolean;
}

const BOARDS: Readonly<Record<number, ConyYokoBoard>> = {
  0: {
    id: "cony-83-0",
    chrBankBytes: 0x0400,
    innerPrgBytes: 0x40_000,
    prgAddressMask: 0xff,
    chrOuterShift: null,
    maximumChrBytes: 0x40_000,
    maps32KiBPrgNvRam: false,
  },
  1: {
    id: "cony-83-1",
    chrBankBytes: 0x0800,
    innerPrgBytes: 0x40_000,
    prgAddressMask: 0xff,
    chrOuterShift: null,
    maximumChrBytes: 0x80_000,
    maps32KiBPrgNvRam: false,
  },
  2: {
    id: "cony-83-2",
    chrBankBytes: 0x0400,
    innerPrgBytes: 0x40_000,
    prgAddressMask: 0x3f,
    chrOuterShift: 4,
    maximumChrBytes: 0x100_000,
    maps32KiBPrgNvRam: true,
  },
  3: {
    id: "cony-83-3",
    chrBankBytes: 0x0400,
    innerPrgBytes: 0x20_000,
    prgAddressMask: 0x3f,
    chrOuterShift: 6,
    maximumChrBytes: 0x100_000,
    maps32KiBPrgNvRam: false,
  },
};

/** Resolves mapper 83 without guessing a NES 2.0 board from title hashes. */
export function findConyYokoBoard(
  mapperNumber: number,
  format: CartridgeFormat,
  submapperNumber: number,
): ConyYokoBoard | undefined {
  if (mapperNumber !== 83) return undefined;
  if (format === "ines") return submapperNumber === 0 ? BOARDS[0] : undefined;
  return BOARDS[submapperNumber];
}
