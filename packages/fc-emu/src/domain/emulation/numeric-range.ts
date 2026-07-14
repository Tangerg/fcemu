/** Shared range guards for validating untrusted save-state numbers. */

export function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}

export function isWord(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xffff;
}

export function isBit(value: number): boolean {
  return value === 0 || value === 1;
}
