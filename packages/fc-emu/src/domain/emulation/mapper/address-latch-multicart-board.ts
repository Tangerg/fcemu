import type { CartridgeFormat } from "../../model/cartridge.js";

type AddressLatchMulticartBoardId =
  | "mapper-15-legacy"
  | "k-1029"
  | "et-4310"
  | "mapper-227-rpg"
  | "mapper-227-multicart"
  | "mapper-227-outer-reset"
  | "active-enterprises"
  | "mapper-242";

export interface AddressLatchMulticartBoard {
  readonly id: AddressLatchMulticartBoardId;
  readonly mapperNumber: 15 | 225 | 227 | 228 | 242;
  readonly chrWriteProtection: "none" | "mapper-15" | "mapper-227" | "mapper-242";
  readonly hasNibbleRam: boolean;
  readonly hasSolderPadReadMode: boolean;
  readonly resetsOuterBankForInnerZero: boolean;
  readonly prgRamWindow: "none" | "declared" | "battery";
}

/**
 * Resolves allocated boards plus the header-driven mapper-15 compatibility path.
 * Legacy iNES cannot distinguish physical K-1029 multicarts from mapper hacks;
 * NES 2.0 retains the exact zero-WRAM/protected-CHR board contract. No ROM hash
 * or title guess participates.
 */
export function findAddressLatchMulticartBoard(
  mapperNumber: number,
  format: CartridgeFormat,
  submapperNumber: number,
): AddressLatchMulticartBoard | undefined {
  switch (mapperNumber) {
    case 15:
      if (submapperNumber !== 0) return undefined;
      return format === "ines"
        ? board("mapper-15-legacy", 15, "none", false, false, false, "declared")
        : board("k-1029", 15, "mapper-15", false, false, false, "none");
    case 225:
      return submapperNumber === 0
        ? board("et-4310", 225, "none", true, false, false, "none")
        : undefined;
    case 227:
      if (submapperNumber === 0) {
        return board("mapper-227-rpg", 227, "none", false, false, false, "battery");
      }
      if (submapperNumber === 1) {
        return board("mapper-227-multicart", 227, "mapper-227", false, true, false, "none");
      }
      if (submapperNumber === 2) {
        return board("mapper-227-outer-reset", 227, "mapper-227", false, false, true, "none");
      }
      return undefined;
    case 228:
      return submapperNumber === 0
        ? board("active-enterprises", 228, "none", false, false, false, "none")
        : undefined;
    case 242:
      return submapperNumber === 0
        ? board("mapper-242", 242, "mapper-242", false, true, false, "battery")
        : undefined;
    default:
      return undefined;
  }
}

function board(
  id: AddressLatchMulticartBoardId,
  mapperNumber: AddressLatchMulticartBoard["mapperNumber"],
  chrWriteProtection: AddressLatchMulticartBoard["chrWriteProtection"],
  hasNibbleRam: boolean,
  hasSolderPadReadMode: boolean,
  resetsOuterBankForInnerZero: boolean,
  prgRamWindow: AddressLatchMulticartBoard["prgRamWindow"],
): AddressLatchMulticartBoard {
  return Object.freeze({
    id,
    mapperNumber,
    chrWriteProtection,
    hasNibbleRam,
    hasSolderPadReadMode,
    resetsOuterBankForInnerZero,
    prgRamWindow,
  });
}
