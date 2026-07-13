export type CartridgeFormatErrorCode =
  | "FILE_TOO_SMALL"
  | "INVALID_SIGNATURE"
  | "MISSING_PRG_ROM"
  | "MISSING_CHR_MEMORY"
  | "INCOMPLETE_TRAINER"
  | "INCOMPLETE_PRG_ROM"
  | "INCOMPLETE_CHR_ROM"
  | "ROM_SIZE_OUT_OF_RANGE"
  | "UNSUPPORTED_CONSOLE_TYPE"
  | "UNSUPPORTED_MISC_ROM"
  | "UNSUPPORTED_EXPANSION_DEVICE"
  | "UNSUPPORTED_RAM_LAYOUT"
  | "UNSUPPORTED_BATTERY_MEMORY"
  | "INVALID_NES2_RAM_FLAGS";

export class CartridgeFormatError extends Error {
  constructor(
    readonly code: CartridgeFormatErrorCode,
    readonly sourceName: string,
    reason: string,
  ) {
    super(`"${sourceName}" is not a valid NES ROM: ${reason}`);
    this.name = "CartridgeFormatError";
  }
}
