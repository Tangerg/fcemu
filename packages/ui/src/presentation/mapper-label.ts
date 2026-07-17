import type { RomDetails } from "../domain/emulation-session.js";

type MapperLabelDetails = Pick<RomDetails, "format" | "mapperNumber" | "submapperNumber">;

export function formatMapperLabel(rom: MapperLabelDetails): string {
  return rom.format === "nes2"
    ? `#${rom.mapperNumber}.${rom.submapperNumber}`
    : `#${rom.mapperNumber}`;
}
