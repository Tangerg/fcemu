interface CartridgeMemoryLayout {
  readonly prgRamBytes: number;
  readonly prgNvRamBytes: number;
  readonly chrRamBytes: number;
  readonly chrNvRamBytes: number;
}

export interface CartridgeSaveSnapshot {
  readonly revision: number;
  readonly data: Uint8Array;
}

export interface CartridgeMemoryState {
  readonly prgRam: Uint8Array;
  readonly prgNvRam: Uint8Array;
  readonly chrRam: Uint8Array;
  readonly chrNvRam: Uint8Array;
  readonly saveRevision: number;
}

/**
 * Owns all writable cartridge memory without exposing mutable backing arrays.
 *
 * Volatile bytes precede non-volatile bytes in each logical address space. A
 * mapper selects banks in that logical space; persistence policy remains here.
 */
export class CartridgeMemory {
  readonly layout: Readonly<CartridgeMemoryLayout>;
  private readonly prgRam: Uint8Array;
  private readonly prgNvRam: Uint8Array;
  private readonly chrRam: Uint8Array;
  private readonly chrNvRam: Uint8Array;
  private saveRevision = 0;

  constructor(layout: CartridgeMemoryLayout) {
    const regions = [
      ["prgRamBytes", layout.prgRamBytes],
      ["prgNvRamBytes", layout.prgNvRamBytes],
      ["chrRamBytes", layout.chrRamBytes],
      ["chrNvRamBytes", layout.chrNvRamBytes],
    ] as const;
    for (const [region, bytes] of regions) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) {
        throw new RangeError(`${region} must be a non-negative safe integer`);
      }
    }
    this.layout = Object.freeze({ ...layout });
    this.prgRam = new Uint8Array(this.layout.prgRamBytes);
    this.prgNvRam = new Uint8Array(this.layout.prgNvRamBytes);
    this.chrRam = new Uint8Array(this.layout.chrRamBytes);
    this.chrNvRam = new Uint8Array(this.layout.chrNvRamBytes);
  }

  get prgAddressSpaceBytes(): number {
    return this.prgRam.byteLength + this.prgNvRam.byteLength;
  }

  get chrAddressSpaceBytes(): number {
    return this.chrRam.byteLength + this.chrNvRam.byteLength;
  }

  get hasBatteryBackup(): boolean {
    return this.saveBytes > 0;
  }

  readPrg(index: number): number {
    return this.read(this.prgRam, this.prgNvRam, index);
  }

  writePrg(index: number, value: number): void {
    this.write(this.prgRam, this.prgNvRam, index, value);
  }

  initializePrg(index: number, data: Uint8Array): void {
    for (let offset = 0; offset < data.byteLength; offset++) {
      this.initialize(this.prgRam, this.prgNvRam, index + offset, data[offset]);
    }
  }

  readChr(index: number): number {
    return this.read(this.chrRam, this.chrNvRam, index);
  }

  writeChr(index: number, value: number): void {
    this.write(this.chrRam, this.chrNvRam, index, value);
  }

  /** Clears power-lost memory while retaining battery-backed bytes and revision. */
  powerOn(): void {
    this.prgRam.fill(0);
    this.chrRam.fill(0);
  }

  captureSave(): CartridgeSaveSnapshot | undefined {
    if (!this.hasBatteryBackup) return undefined;
    const data = new Uint8Array(this.saveBytes);
    data.set(this.prgNvRam);
    data.set(this.chrNvRam, this.prgNvRam.byteLength);
    return { revision: this.saveRevision, data };
  }

  restoreSave(data: Uint8Array): void {
    if (!this.hasBatteryBackup) {
      throw new Error("Cannot restore cartridge memory without battery backup");
    }
    if (data.byteLength !== this.saveBytes) {
      throw new RangeError(
        `Cartridge save size mismatch: expected ${this.saveBytes}, received ${data.byteLength}`,
      );
    }
    this.prgNvRam.set(data.subarray(0, this.prgNvRam.byteLength));
    this.chrNvRam.set(data.subarray(this.prgNvRam.byteLength));
    this.saveRevision = 0;
  }

  captureState(): CartridgeMemoryState {
    return {
      prgRam: this.prgRam.slice(),
      prgNvRam: this.prgNvRam.slice(),
      chrRam: this.chrRam.slice(),
      chrNvRam: this.chrNvRam.slice(),
      saveRevision: this.saveRevision,
    };
  }

  restoreState(state: CartridgeMemoryState): void {
    const regions = [
      ["PRG RAM", state.prgRam, this.prgRam],
      ["PRG NVRAM", state.prgNvRam, this.prgNvRam],
      ["CHR RAM", state.chrRam, this.chrRam],
      ["CHR NVRAM", state.chrNvRam, this.chrNvRam],
    ] as const;
    for (const [name, source, destination] of regions) {
      if (!(source instanceof Uint8Array) || source.byteLength !== destination.byteLength) {
        throw new RangeError(`${name} save-state size mismatch`);
      }
    }
    if (!Number.isSafeInteger(state.saveRevision) || state.saveRevision < 0) {
      throw new RangeError("Cartridge save-state revision must be a non-negative safe integer");
    }
    for (const [, source, destination] of regions) destination.set(source);
    this.saveRevision = state.saveRevision;
  }

  private get saveBytes(): number {
    return this.prgNvRam.byteLength + this.chrNvRam.byteLength;
  }

  private read(volatile: Uint8Array, nonvolatile: Uint8Array, index: number): number {
    if (index < 0) return 0;
    if (index < volatile.byteLength) return volatile[index] ?? 0;
    return nonvolatile[index - volatile.byteLength] ?? 0;
  }

  private write(volatile: Uint8Array, nonvolatile: Uint8Array, index: number, value: number): void {
    if (index < 0) return;
    const byte = value & 0xff;
    if (index < volatile.byteLength) {
      volatile[index] = byte;
      return;
    }
    const nonvolatileIndex = index - volatile.byteLength;
    if (nonvolatileIndex >= nonvolatile.byteLength || nonvolatile[nonvolatileIndex] === byte)
      return;
    nonvolatile[nonvolatileIndex] = byte;
    this.saveRevision++;
  }

  private initialize(
    volatile: Uint8Array,
    nonvolatile: Uint8Array,
    index: number,
    value: number,
  ): void {
    if (index < 0) return;
    if (index < volatile.byteLength) {
      volatile[index] = value;
      return;
    }
    const nonvolatileIndex = index - volatile.byteLength;
    if (nonvolatileIndex < nonvolatile.byteLength) nonvolatile[nonvolatileIndex] = value;
  }
}
