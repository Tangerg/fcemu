export interface SpriteEvaluationState {
  readonly targetScanline: number;
  readonly spriteHeight: 8 | 16;
  readonly primaryIndex: number;
  readonly byteIndex: number;
  readonly selectedCount: number;
  readonly selectedIndexes: Uint8Array;
  readonly secondaryOam: Uint8Array;
  readonly readValue: number;
  readonly overflowSearch: boolean;
  readonly overflowFound: boolean;
  readonly overflowBytesRemaining: number;
  readonly secondaryOamJustFilled: boolean;
  readonly done: boolean;
}

/** Dot-clocked primary-to-secondary OAM evaluator for one upcoming scanline. */
export class SpriteEvaluator {
  private targetScanline = 0;
  private spriteHeight: 8 | 16 = 8;
  private primaryIndex = 0;
  private byteIndex = 0;
  private selectedCount = 0;
  private readonly selectedIndexes = new Uint8Array(8);
  private readonly secondaryOam = new Uint8Array(32);
  private readValue = 0xff;
  private overflowSearch = false;
  private overflowFound = false;
  private overflowBytesRemaining = 0;
  private secondaryOamJustFilled = false;
  private done = true;

  begin(targetScanline: number, spriteHeight: 8 | 16): void {
    if (!Number.isInteger(targetScanline) || targetScanline < 0 || targetScanline > 239) {
      throw new RangeError("Sprite evaluation scanline must be visible");
    }
    this.targetScanline = targetScanline;
    this.spriteHeight = spriteHeight;
    this.primaryIndex = 0;
    this.byteIndex = 0;
    this.selectedCount = 0;
    this.selectedIndexes.fill(0xff);
    this.secondaryOam.fill(0xff);
    this.readValue = 0xff;
    this.overflowSearch = false;
    this.overflowFound = false;
    this.overflowBytesRemaining = 0;
    this.secondaryOamJustFilled = false;
    this.done = false;
  }

  /** Returns true on the dot that the overflow flag must be asserted. */
  clock(dot: number, primaryOam: Uint8Array): boolean {
    if (dot < 65 || dot > 256) return false;
    this.secondaryOamJustFilled = false;
    if (this.done) {
      if ((dot & 1) !== 0) {
        this.readValue = primaryOam[this.primaryIndex * 4] ?? 0xff;
      } else {
        this.primaryIndex = (this.primaryIndex + 1) & 0x3f;
      }
      return false;
    }
    if ((dot & 1) !== 0) {
      this.readValue = primaryOam[this.primaryIndex * 4 + this.byteIndex] ?? 0xff;
      return false;
    }
    return this.overflowSearch ? this.processOverflowSearch() : this.processSelection();
  }

  get count(): number {
    return this.selectedCount;
  }

  readSelectedByte(slot: number, byte: number): number {
    if (slot < 0 || slot >= this.selectedCount || byte < 0 || byte > 3) return 0xff;
    return this.secondaryOam[slot * 4 + byte] ?? 0xff;
  }

  /** Projects the PPU's internal OAM data bus during rendering. */
  readDataBus(dot: number): number {
    if (dot >= 1 && dot <= 64) return 0xff;
    if (dot >= 65 && dot <= 256) {
      if ((dot & 1) === 0 && this.overflowSearch && !this.secondaryOamJustFilled) {
        return this.secondaryOam[0] ?? 0xff;
      }
      return this.readValue;
    }
    if (dot >= 257 && dot <= 320) {
      const fetchDot = dot - 257;
      const slot = fetchDot >> 3;
      const phase = fetchDot & 0x07;
      const byte = phase < 4 ? phase : 3;
      return this.secondaryOam[slot * 4 + byte] ?? 0xff;
    }
    return this.secondaryOam[0] ?? 0xff;
  }

  originalIndex(slot: number): number {
    return slot < 0 || slot >= this.selectedCount ? 0xff : (this.selectedIndexes[slot] ?? 0xff);
  }

  captureState(): SpriteEvaluationState {
    return {
      targetScanline: this.targetScanline,
      spriteHeight: this.spriteHeight,
      primaryIndex: this.primaryIndex,
      byteIndex: this.byteIndex,
      selectedCount: this.selectedCount,
      selectedIndexes: this.selectedIndexes.slice(),
      secondaryOam: this.secondaryOam.slice(),
      readValue: this.readValue,
      overflowSearch: this.overflowSearch,
      overflowFound: this.overflowFound,
      overflowBytesRemaining: this.overflowBytesRemaining,
      secondaryOamJustFilled: this.secondaryOamJustFilled,
      done: this.done,
    };
  }

  restoreState(state: SpriteEvaluationState): void {
    SpriteEvaluator.validateState(state);
    this.targetScanline = state.targetScanline;
    this.spriteHeight = state.spriteHeight;
    this.primaryIndex = state.primaryIndex;
    this.byteIndex = state.byteIndex;
    this.selectedCount = state.selectedCount;
    this.selectedIndexes.set(state.selectedIndexes);
    this.secondaryOam.set(state.secondaryOam);
    this.readValue = state.readValue;
    this.overflowSearch = state.overflowSearch;
    this.overflowFound = state.overflowFound;
    this.overflowBytesRemaining = state.overflowBytesRemaining;
    this.secondaryOamJustFilled = state.secondaryOamJustFilled;
    this.done = state.done;
  }

  powerOn(): void {
    this.targetScanline = 0;
    this.spriteHeight = 8;
    this.primaryIndex = 0;
    this.byteIndex = 0;
    this.selectedCount = 0;
    this.selectedIndexes.fill(0xff);
    this.secondaryOam.fill(0xff);
    this.readValue = 0xff;
    this.overflowSearch = false;
    this.overflowFound = false;
    this.overflowBytesRemaining = 0;
    this.secondaryOamJustFilled = false;
    this.done = true;
  }

  static validateState(state: SpriteEvaluationState): void {
    if (
      !Number.isInteger(state.targetScanline) ||
      state.targetScanline < 0 ||
      state.targetScanline > 239 ||
      (state.spriteHeight !== 8 && state.spriteHeight !== 16) ||
      !isIntegerInRange(state.primaryIndex, 0, 63) ||
      !isIntegerInRange(state.byteIndex, 0, 3) ||
      !isIntegerInRange(state.selectedCount, 0, 8) ||
      !isByte(state.readValue) ||
      typeof state.overflowSearch !== "boolean" ||
      typeof state.overflowFound !== "boolean" ||
      !isIntegerInRange(state.overflowBytesRemaining, 0, 3) ||
      typeof state.secondaryOamJustFilled !== "boolean" ||
      typeof state.done !== "boolean"
    ) {
      throw new RangeError("PPU save state contains invalid sprite-evaluation counters");
    }
    if (
      !(state.selectedIndexes instanceof Uint8Array) ||
      state.selectedIndexes.length !== 8 ||
      !(state.secondaryOam instanceof Uint8Array) ||
      state.secondaryOam.length !== 32
    ) {
      throw new RangeError("PPU save state contains invalid secondary OAM");
    }
    if (state.overflowSearch && state.selectedCount !== 8) {
      throw new RangeError("PPU save state enters overflow search before secondary OAM is full");
    }
    if (state.overflowFound && !state.overflowSearch) {
      throw new RangeError("PPU save state finds overflow before entering its search");
    }
    if (
      (!state.overflowFound && state.overflowBytesRemaining !== 0) ||
      (state.overflowFound && !state.done && state.overflowBytesRemaining === 0) ||
      (state.done && state.overflowBytesRemaining !== 0)
    ) {
      throw new RangeError("PPU save state contains an invalid overflow continuation");
    }
    if (
      state.secondaryOamJustFilled &&
      (!state.overflowSearch || state.overflowFound || state.done)
    ) {
      throw new RangeError("PPU save state marks secondary OAM full outside its fill dot");
    }
  }

  private processSelection(): boolean {
    if (this.byteIndex === 0) {
      // The Y byte is written before its range comparison. Each rejected
      // sprite overwrites the same slot, leaving sprite 63's Y in the first
      // empty fetch slot once evaluation reaches the end of primary OAM.
      this.secondaryOam[this.selectedCount * 4] = this.readValue;
      if (!this.isInRange(this.readValue)) {
        this.advancePrimary();
        return false;
      }
      this.selectedIndexes[this.selectedCount] = this.primaryIndex;
      this.secondaryOam[this.selectedCount * 4] = this.readValue;
      this.byteIndex = 1;
      return false;
    }

    this.secondaryOam[this.selectedCount * 4 + this.byteIndex] = this.readValue;
    if (this.byteIndex < 3) {
      this.byteIndex++;
      return false;
    }

    this.byteIndex = 0;
    this.selectedCount++;
    this.advancePrimary();
    this.overflowSearch = this.selectedCount === 8 && !this.done;
    this.secondaryOamJustFilled = this.overflowSearch;
    return false;
  }

  private processOverflowSearch(): boolean {
    if (this.overflowFound) {
      this.advanceOverflowAddress();
      this.overflowBytesRemaining--;
      if (this.overflowBytesRemaining === 0) {
        this.byteIndex = 0;
        this.done = true;
      }
      return false;
    }
    const inRange = this.isInRange(this.readValue);
    if (inRange) {
      this.overflowFound = true;
      this.overflowBytesRemaining = 3;
      this.advanceOverflowAddress();
      return true;
    }

    // Hardware increments both counters without carrying m into n, producing
    // the well-known diagonal tile/attribute/X-as-Y overflow search.
    this.byteIndex = (this.byteIndex + 1) & 0x03;
    this.advancePrimary();
    return false;
  }

  private isInRange(y: number): boolean {
    const row = this.targetScanline - y;
    return row >= 0 && row < this.spriteHeight;
  }

  private advanceOverflowAddress(): void {
    this.byteIndex++;
    if (this.byteIndex <= 3) return;
    this.byteIndex = 0;
    this.primaryIndex = (this.primaryIndex + 1) & 0x3f;
  }

  private advancePrimary(): void {
    if (this.primaryIndex === 63) {
      this.primaryIndex = 0;
      this.done = true;
      return;
    }
    this.primaryIndex++;
  }
}

function isIntegerInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isByte(value: number): boolean {
  return isIntegerInRange(value, 0, 0xff);
}
