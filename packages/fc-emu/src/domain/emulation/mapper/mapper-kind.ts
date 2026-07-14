/**
 * Discriminants tagging each board's save-state shape. Capture and restore refer
 * to the same named kind instead of repeating bare string literals; the
 * `MapperState` union in mapper.ts remains the canonical type definition.
 */
export const MapperKind = {
  Nrom: "nrom",
  Uxrom: "uxrom",
  Cnrom: "cnrom",
  Bnrom: "bnrom",
  Nina001: "nina-001",
  Axrom: "axrom",
  Mmc1: "mmc1",
  Mmc3: "mmc3",
} as const;

export type MapperKind = (typeof MapperKind)[keyof typeof MapperKind];
