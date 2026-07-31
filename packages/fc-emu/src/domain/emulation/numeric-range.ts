/** Shared range guards for validating untrusted save-state numbers. */

export function isIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function isByte(value: number): boolean {
  return isIntegerInRange(value, 0, 0xff);
}

export function isWord(value: number): boolean {
  return isIntegerInRange(value, 0, 0xffff);
}

export function isBit(value: number): boolean {
  return value === 0 || value === 1;
}
