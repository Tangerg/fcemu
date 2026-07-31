type AddressLatchMulticartBoardId =
  | "k-1029"
  | "et-4310"
  | "mapper-227-rpg"
  | "mapper-227-multicart"
  | "mapper-227-outer-reset"
  | "active-enterprises";

export interface AddressLatchMulticartBoard {
  readonly id: AddressLatchMulticartBoardId;
  readonly mapperNumber: 15 | 225 | 227 | 228;
  readonly chrWriteProtection: "none" | "mapper-15" | "mapper-227";
  readonly hasNibbleRam: boolean;
  readonly hasSolderPadReadMode: boolean;
  readonly resetsOuterBankForInnerZero: boolean;
  readonly exposesBatteryWram: boolean;
}

/** Resolves only allocated board variants; no ROM hashes or title guesses participate. */
export function findAddressLatchMulticartBoard(
  mapperNumber: number,
  submapperNumber: number,
): AddressLatchMulticartBoard | undefined {
  switch (mapperNumber) {
    case 15:
      return submapperNumber === 0
        ? board("k-1029", 15, "mapper-15", false, false, false, false)
        : undefined;
    case 225:
      return submapperNumber === 0
        ? board("et-4310", 225, "none", true, false, false, false)
        : undefined;
    case 227:
      if (submapperNumber === 0) {
        return board("mapper-227-rpg", 227, "none", false, false, false, true);
      }
      if (submapperNumber === 1) {
        return board("mapper-227-multicart", 227, "mapper-227", false, true, false, false);
      }
      if (submapperNumber === 2) {
        return board("mapper-227-outer-reset", 227, "mapper-227", false, false, true, false);
      }
      return undefined;
    case 228:
      return submapperNumber === 0
        ? board("active-enterprises", 228, "none", false, false, false, false)
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
  exposesBatteryWram: boolean,
): AddressLatchMulticartBoard {
  return Object.freeze({
    id,
    mapperNumber,
    chrWriteProtection,
    hasNibbleRam,
    hasSolderPadReadMode,
    resetsOuterBankForInnerZero,
    exposesBatteryWram,
  });
}
