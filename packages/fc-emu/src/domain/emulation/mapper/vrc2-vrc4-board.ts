type Vrc24Chip = "vrc2" | "vrc4";

type Vrc24BoardId =
  | "vrc4-21-auto"
  | "vrc4a"
  | "vrc4c"
  | "vrc2a"
  | "vrc4-23-auto"
  | "vrc4f"
  | "vrc4e"
  | "vrc2b"
  | "vrc4-25-auto"
  | "vrc4b"
  | "vrc4d"
  | "vrc2c";

interface Vrc24PinPair {
  /** CPU address bit connected to the ASIC's register-select A0 input. */
  readonly portA0: number;
  /** CPU address bit connected to the ASIC's register-select A1 input. */
  readonly portA1: number;
}

export interface Vrc24Board {
  readonly id: Vrc24BoardId;
  readonly chip: Vrc24Chip;
  /**
   * Submapper 0 preserves the historical iNES compatibility decode by ORing
   * the two non-overlapping board wirings. Exact NES 2.0 variants have one pair.
   */
  readonly registerPins: readonly Vrc24PinPair[];
  readonly chrBankShift: 0 | 1;
  readonly maximumChrBytes: number;
}

const BOARDS = {
  "vrc4-21-auto": board("vrc4-21-auto", "vrc4", [
    [1, 2],
    [6, 7],
  ]),
  vrc4a: board("vrc4a", "vrc4", [[1, 2]]),
  vrc4c: board("vrc4c", "vrc4", [[6, 7]]),
  vrc2a: board("vrc2a", "vrc2", [[1, 0]], 1, 0x20_000),
  "vrc4-23-auto": board("vrc4-23-auto", "vrc4", [
    [0, 1],
    [2, 3],
  ]),
  vrc4f: board("vrc4f", "vrc4", [[0, 1]]),
  vrc4e: board("vrc4e", "vrc4", [[2, 3]]),
  vrc2b: board("vrc2b", "vrc2", [[0, 1]], 0, 0x40_000),
  "vrc4-25-auto": board("vrc4-25-auto", "vrc4", [
    [1, 0],
    [3, 2],
  ]),
  vrc4b: board("vrc4b", "vrc4", [[1, 0]]),
  vrc4d: board("vrc4d", "vrc4", [[3, 2]]),
  vrc2c: board("vrc2c", "vrc2", [[1, 0]], 0, 0x40_000),
} as const satisfies Record<Vrc24BoardId, Vrc24Board>;

/** Resolves only allocated VRC2/VRC4 variants; unknown submappers stay fail-closed. */
export function findVrc24Board(
  mapperNumber: number,
  submapperNumber: number,
): Vrc24Board | undefined {
  switch (mapperNumber) {
    case 21:
      switch (submapperNumber) {
        case 0:
          return BOARDS["vrc4-21-auto"];
        case 1:
          return BOARDS.vrc4a;
        case 2:
          return BOARDS.vrc4c;
      }
      return undefined;
    case 22:
      return submapperNumber === 0 ? BOARDS.vrc2a : undefined;
    case 23:
      switch (submapperNumber) {
        case 0:
          return BOARDS["vrc4-23-auto"];
        case 1:
          return BOARDS.vrc4f;
        case 2:
          return BOARDS.vrc4e;
        case 3:
          return BOARDS.vrc2b;
      }
      return undefined;
    case 25:
      switch (submapperNumber) {
        case 0:
          return BOARDS["vrc4-25-auto"];
        case 1:
          return BOARDS.vrc4b;
        case 2:
          return BOARDS.vrc4d;
        case 3:
          return BOARDS.vrc2c;
      }
      return undefined;
    default:
      return undefined;
  }
}

/** Projects the PCB's selected CPU address lines onto the ASIC's two-bit port input. */
export function translateVrc24Port(board: Vrc24Board, address: number): number {
  let portA0 = 0;
  let portA1 = 0;
  for (const pins of board.registerPins) {
    portA0 |= (address >>> pins.portA0) & 1;
    portA1 |= (address >>> pins.portA1) & 1;
  }
  return portA0 | (portA1 << 1);
}

function board(
  id: Vrc24BoardId,
  chip: Vrc24Chip,
  registerPins: readonly (readonly [number, number])[],
  chrBankShift: 0 | 1 = 0,
  maximumChrBytes = 0x80_000,
): Vrc24Board {
  return Object.freeze({
    id,
    chip,
    registerPins: Object.freeze(
      registerPins.map(([portA0, portA1]) => Object.freeze({ portA0, portA1 })),
    ),
    chrBankShift,
    maximumChrBytes,
  });
}
