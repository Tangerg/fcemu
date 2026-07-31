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
  Gxrom: "gxrom",
  ColorDreams: "color-dreams",
  Cprom: "cprom",
  Codemasters: "codemasters",
  Bandai74: "bandai-74",
  Jaleco87: "jaleco-87",
  JalecoJf: "jaleco-jf",
  Namco118: "namco-118",
  Sunsoft1: "sunsoft-1",
  Sunsoft2: "sunsoft-2",
  TaitoTc0190: "taito-tc0190",
  Irem78: "irem-78",
  Vrc1: "vrc1",
  Mmc1: "mmc1",
  Mmc2: "mmc2",
  Mmc3: "mmc3",
  Mmc4: "mmc4",
  Fme7: "fme7",
} as const;

export type MapperKind = (typeof MapperKind)[keyof typeof MapperKind];
