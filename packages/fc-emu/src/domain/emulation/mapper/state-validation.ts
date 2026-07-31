import { isByte } from "../numeric-range.js";

/** Runtime guards shared by mapper save-state restorers. */
export function areBooleans(...values: readonly unknown[]): boolean {
  return values.every((value) => typeof value === "boolean");
}

export function isFixedByteArray(value: unknown, length: number): value is readonly number[] {
  return Array.isArray(value) && value.length === length && value.every(isByte);
}
