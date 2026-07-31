import type Cartridge from "../../model/cartridge.js";
import { isIntegerInRange } from "../numeric-range.js";

const INTERNAL_RAM_SIZE = 0x80;
const CHANNEL_REGISTER_SIZE = 8;
const CHANNEL_CLOCK_DIVIDER = 15;

export interface Namco163AudioState {
  readonly address: number;
  readonly autoIncrement: boolean;
  readonly divider: number;
  readonly nextChannel: number;
  readonly output: number;
}

/**
 * Namco 163's shared 128-byte RAM data port and time-division wavetable unit.
 *
 * One enabled channel advances every 15 CPU cycles. Keeping the most recently
 * generated channel voltage, rather than averaging all channels, preserves the
 * chip's characteristic channel-switching output.
 */
export class Namco163Audio {
  private address = 0;
  private autoIncrement = false;
  private divider = 0;
  private nextChannel = 7;
  private currentOutput = 0;

  constructor(private readonly cartridge: Cartridge) {}

  powerOn(): void {
    this.address = 0;
    this.autoIncrement = false;
    this.divider = 0;
    this.nextChannel = 7;
    this.currentOutput = 0;
  }

  captureState(): Namco163AudioState {
    return {
      address: this.address,
      autoIncrement: this.autoIncrement,
      divider: this.divider,
      nextChannel: this.nextChannel,
      output: this.currentOutput,
    };
  }

  restoreState(state: Namco163AudioState): void {
    if (
      !isIntegerInRange(state.address, 0, INTERNAL_RAM_SIZE - 1) ||
      typeof state.autoIncrement !== "boolean" ||
      !isIntegerInRange(state.divider, 0, CHANNEL_CLOCK_DIVIDER - 1) ||
      !isIntegerInRange(state.nextChannel, 0, 7) ||
      !isIntegerInRange(state.output, -120, 105)
    ) {
      throw new RangeError("Namco 163 audio save state is invalid");
    }
    this.address = state.address;
    this.autoIncrement = state.autoIncrement;
    this.divider = state.divider;
    this.nextChannel = state.nextChannel;
    this.currentOutput = state.output;
  }

  writeAddress(value: number): void {
    this.address = value & 0x7f;
    this.autoIncrement = (value & 0x80) !== 0;
  }

  readData(): number {
    const value = this.cartridge.readMapperRam(this.address);
    this.incrementAddress();
    return value;
  }

  writeData(value: number): void {
    this.cartridge.writeMapperRam(this.address, value);
    this.incrementAddress();
  }

  tick(disabled: boolean): void {
    if (disabled) return;
    this.divider++;
    if (this.divider < CHANNEL_CLOCK_DIVIDER) return;
    this.divider = 0;

    const channelCount = ((this.cartridge.readMapperRam(0x7f) >>> 4) & 7) + 1;
    const lowestChannel = 8 - channelCount;
    if (this.nextChannel < lowestChannel) this.nextChannel = 7;
    this.clockChannel(this.nextChannel);
    this.nextChannel = this.nextChannel === lowestChannel ? 7 : this.nextChannel - 1;
  }

  output(disabled: boolean, gain: number): number {
    return disabled || this.currentOutput === 0 || gain === 0
      ? 0
      : (-this.currentOutput / 225) * gain;
  }

  private clockChannel(channel: number): void {
    const base = 0x40 + channel * CHANNEL_REGISTER_SIZE;
    const frequency =
      this.cartridge.readMapperRam(base) |
      (this.cartridge.readMapperRam(base + 2) << 8) |
      ((this.cartridge.readMapperRam(base + 4) & 3) << 16);
    const length = 256 - (this.cartridge.readMapperRam(base + 4) & 0xfc);
    let phase =
      this.cartridge.readMapperRam(base + 1) |
      (this.cartridge.readMapperRam(base + 3) << 8) |
      (this.cartridge.readMapperRam(base + 5) << 16);
    phase = (phase + frequency) % (length << 16);
    this.cartridge.writeMapperRam(base + 1, phase);
    this.cartridge.writeMapperRam(base + 3, phase >>> 8);
    this.cartridge.writeMapperRam(base + 5, phase >>> 16);

    const waveAddress = ((phase >>> 16) + this.cartridge.readMapperRam(base + 6)) & 0xff;
    const packedSamples = this.cartridge.readMapperRam(waveAddress >>> 1);
    const sample = (packedSamples >>> ((waveAddress & 1) * 4)) & 0x0f;
    const volume = this.cartridge.readMapperRam(base + 7) & 0x0f;
    this.currentOutput = (sample - 8) * volume;
  }

  private incrementAddress(): void {
    if (this.autoIncrement && this.address < INTERNAL_RAM_SIZE - 1) this.address++;
  }
}
