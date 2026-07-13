import type { RomDetails } from "../domain/emulation-session.js";

export function formatMapperLabel(rom: RomDetails): string {
  return rom.format === "nes2"
    ? `#${rom.mapperNumber}.${rom.submapperNumber}`
    : `#${rom.mapperNumber}`;
}
