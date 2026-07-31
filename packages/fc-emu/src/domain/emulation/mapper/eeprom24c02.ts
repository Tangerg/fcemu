import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte } from "../numeric-range.js";

const Mode = {
  Idle: 0,
  Address: 1,
  Read: 2,
  Write: 3,
  SendAck: 4,
  WaitAck: 5,
  ChipAddress: 6,
} as const;

export interface Eeprom24c02State {
  readonly mode: number;
  readonly nextMode: number;
  readonly chipAddress: number;
  readonly address: number;
  readonly data: number;
  readonly bitCounter: number;
  readonly output: number;
  readonly previousScl: number;
  readonly previousSda: number;
}

/** Xicor-compatible 24C02 serial protocol backed by Cartridge's 256-byte NVRAM. */
export class Eeprom24c02 {
  private mode: number = Mode.Idle;
  private nextMode: number = Mode.Idle;
  private chipAddress = 0;
  private address = 0;
  private data = 0;
  private bitCounter = 0;
  private output = 1;
  private previousScl = 0;
  private previousSda = 0;

  constructor(private readonly cartridge: Cartridge) {
    if (cartridge.prgRamBytes !== 0 || cartridge.prgNvRamBytes !== 0x100) {
      throw new RangeError("24C02 requires exactly 256 bytes of PRG NVRAM backing");
    }
  }

  powerOn(): void {
    this.mode = Mode.Idle;
    this.nextMode = Mode.Idle;
    this.chipAddress = 0;
    this.address = 0;
    this.data = 0;
    this.bitCounter = 0;
    this.output = 1;
    this.previousScl = 0;
    this.previousSda = 0;
  }

  captureState(): Eeprom24c02State {
    return {
      mode: this.mode,
      nextMode: this.nextMode,
      chipAddress: this.chipAddress,
      address: this.address,
      data: this.data,
      bitCounter: this.bitCounter,
      output: this.output,
      previousScl: this.previousScl,
      previousSda: this.previousSda,
    };
  }

  validateState(state: Eeprom24c02State): void {
    if (
      !this.isMode(state.mode) ||
      !this.isMode(state.nextMode) ||
      !isByte(state.chipAddress) ||
      !isByte(state.address) ||
      !isByte(state.data) ||
      !Number.isInteger(state.bitCounter) ||
      state.bitCounter < 0 ||
      state.bitCounter > 8 ||
      !isBit(state.output) ||
      !isBit(state.previousScl) ||
      !isBit(state.previousSda)
    ) {
      throw new RangeError("24C02 save state contains invalid serial protocol state");
    }
  }

  restoreState(state: Eeprom24c02State): void {
    this.validateState(state);
    this.mode = state.mode;
    this.nextMode = state.nextMode;
    this.chipAddress = state.chipAddress;
    this.address = state.address;
    this.data = state.data;
    this.bitCounter = state.bitCounter;
    this.output = state.output;
    this.previousScl = state.previousScl;
    this.previousSda = state.previousSda;
  }

  readOutput(): number {
    return this.output;
  }

  write(scl: number, sda: number): void {
    scl &= 1;
    sda &= 1;
    if (this.previousScl === 1 && scl === 1 && sda < this.previousSda) {
      this.mode = Mode.ChipAddress;
      this.chipAddress = 0;
      this.bitCounter = 0;
      this.output = 1;
    } else if (this.previousScl === 1 && scl === 1 && sda > this.previousSda) {
      this.mode = Mode.Idle;
      this.nextMode = Mode.Idle;
      this.output = 1;
    } else if (scl > this.previousScl) {
      this.clockRise(sda);
    } else if (scl < this.previousScl) {
      this.clockFall();
    }
    this.previousScl = scl;
    this.previousSda = sda;
  }

  private clockRise(sda: number): void {
    switch (this.mode) {
      case Mode.ChipAddress:
        this.writeBit("chipAddress", sda);
        break;
      case Mode.Address:
        this.writeBit("address", sda);
        break;
      case Mode.Read:
        if (this.bitCounter < 8) {
          this.output = (this.data >>> (7 - this.bitCounter)) & 1;
          this.bitCounter++;
        }
        break;
      case Mode.Write:
        this.writeBit("data", sda);
        break;
      case Mode.SendAck:
        this.output = 0;
        break;
      case Mode.WaitAck:
        if (sda === 0) {
          this.nextMode = Mode.Read;
          this.data = this.cartridge.readPrgRam(this.address);
        } else {
          this.nextMode = Mode.Idle;
        }
        break;
    }
  }

  private clockFall(): void {
    switch (this.mode) {
      case Mode.ChipAddress:
        if (this.bitCounter !== 8) break;
        if ((this.chipAddress & 0xa0) !== 0xa0) {
          this.mode = Mode.Idle;
          this.bitCounter = 0;
          this.output = 1;
          break;
        }
        this.mode = Mode.SendAck;
        this.bitCounter = 0;
        this.output = 1;
        if ((this.chipAddress & 1) !== 0) {
          this.nextMode = Mode.Read;
          this.data = this.cartridge.readPrgRam(this.address);
        } else {
          this.nextMode = Mode.Address;
        }
        break;
      case Mode.Address:
        if (this.bitCounter === 8) {
          this.bitCounter = 0;
          this.mode = Mode.SendAck;
          this.nextMode = Mode.Write;
          this.output = 1;
        }
        break;
      case Mode.Read:
        if (this.bitCounter === 8) {
          this.mode = Mode.WaitAck;
          this.address = (this.address + 1) & 0xff;
        }
        break;
      case Mode.Write:
        if (this.bitCounter === 8) {
          this.bitCounter = 0;
          this.mode = Mode.SendAck;
          this.nextMode = Mode.Write;
          this.cartridge.writePrgRam(this.address, this.data);
          this.address = (this.address + 1) & 0xff;
        }
        break;
      case Mode.SendAck:
      case Mode.WaitAck:
        this.mode = this.nextMode;
        this.bitCounter = 0;
        this.output = 1;
        break;
    }
  }

  private writeBit(target: "chipAddress" | "address" | "data", value: number): void {
    if (this.bitCounter >= 8) return;
    const bit = 7 - this.bitCounter;
    this[target] = (this[target] & ~(1 << bit)) | (value << bit);
    this.bitCounter++;
  }

  private isMode(value: number): boolean {
    return Number.isInteger(value) && value >= Mode.Idle && value <= Mode.ChipAddress;
  }
}
