export interface SpritePatternAddressInput {
  readonly tileIndex: number;
  readonly row: number;
  readonly height: 8 | 16;
  readonly patternTable: 0 | 1;
  readonly verticallyFlipped: boolean;
}

/** Resolves the low bit-plane address selected by one sprite row. */
export function resolveSpritePatternAddress(input: SpritePatternAddressInput): number {
  validateInput(input);
  // The pattern-address register receives only the live size-dependent low
  // row bits. Evaluation may have selected the sprite under a different
  // PPUCTRL size, so a full scanline delta is not a domain error here.
  const wiredRow = input.row & (input.height - 1);
  const row = input.verticallyFlipped ? input.height - 1 - wiredRow : wiredRow;
  if (input.height === 8) {
    return input.patternTable * 0x1000 + input.tileIndex * 16 + row;
  }

  const patternTable = input.tileIndex & 1;
  const tileIndex = (input.tileIndex & 0xfe) + (row >>> 3);
  return patternTable * 0x1000 + tileIndex * 16 + (row & 0x07);
}

function validateInput(input: SpritePatternAddressInput): void {
  if (!isByte(input.tileIndex)) throw new RangeError("Sprite tile index must be a byte");
  if (!Number.isSafeInteger(input.row)) {
    throw new RangeError("Sprite pattern row must be an integer scanline delta");
  }
  if (input.patternTable !== 0 && input.patternTable !== 1) {
    throw new RangeError("Sprite pattern table must be zero or one");
  }
}

function isByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
