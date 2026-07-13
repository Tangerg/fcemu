const ENDIAN_PROBE = new Uint32Array([0x01020304]);
const IS_LITTLE_ENDIAN = new Uint8Array(ENDIAN_PROBE.buffer)[0] === 0x04;

/** Packed RGBA frame owned by the emulation domain. */
export class FrameBuffer {
  private readonly pixels: Uint32Array;

  constructor(
    private readonly width: number,
    private readonly height: number,
    fillColor = 0,
  ) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error("Width and height must be positive integers");
    }
    this.pixels = new Uint32Array(width * height);
    if (fillColor !== 0) this.pixels.fill(fillColor);
  }

  setRGBA(x: number, y: number, rgba: number): void {
    this.pixels[this.offsetOf(x, y)] = rgba;
  }

  getRGBA(x: number, y: number): number {
    return this.pixels[this.offsetOf(x, y)] ?? 0;
  }

  static createRGBA(r: number, g: number, b: number, a = 255): number {
    return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
  }

  /** Converts conventional 0xRRGGBBAA constants to this frame's packed representation. */
  static fromRgbaHex(rgba: number): number {
    return FrameBuffer.createRGBA(rgba >>> 24, rgba >>> 16, rgba >>> 8, rgba);
  }

  static extractRGBA(rgba: number): { r: number; g: number; b: number; a: number } {
    return {
      r: rgba & 0xff,
      g: (rgba >>> 8) & 0xff,
      b: (rgba >>> 16) & 0xff,
      a: (rgba >>> 24) & 0xff,
    };
  }

  fill(rgba: number): void {
    this.pixels.fill(rgba);
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }

  clone(): FrameBuffer {
    const clone = new FrameBuffer(this.width, this.height);
    clone.pixels.set(this.pixels);
    return clone;
  }

  captureState(): Uint32Array {
    return this.pixels.slice();
  }

  restoreState(pixels: Uint32Array): void {
    if (!(pixels instanceof Uint32Array) || pixels.length !== this.pixels.length) {
      throw new RangeError("Frame-buffer save state has the wrong dimensions");
    }
    this.pixels.set(pixels);
  }

  /** Returns an RGBA byte view. Callers must treat it as read-only. */
  toCanvasImageData(): Uint8ClampedArray<ArrayBuffer> {
    if (IS_LITTLE_ENDIAN) {
      return new Uint8ClampedArray(this.pixels.buffer as ArrayBuffer);
    }

    const data = new Uint8ClampedArray(this.pixels.length * 4);
    for (let index = 0; index < this.pixels.length; index += 1) {
      const rgba = this.pixels[index] ?? 0;
      const offset = index * 4;
      data[offset] = rgba & 0xff;
      data[offset + 1] = (rgba >>> 8) & 0xff;
      data[offset + 2] = (rgba >>> 16) & 0xff;
      data[offset + 3] = (rgba >>> 24) & 0xff;
    }
    return data;
  }

  private offsetOf(x: number, y: number): number {
    if (!Number.isInteger(x) || x < 0 || x >= this.width) {
      throw new RangeError(`X coordinate must be between 0 and ${this.width - 1}`);
    }
    if (!Number.isInteger(y) || y < 0 || y >= this.height) {
      throw new RangeError(`Y coordinate must be between 0 and ${this.height - 1}`);
    }
    return y * this.width + x;
  }
}
