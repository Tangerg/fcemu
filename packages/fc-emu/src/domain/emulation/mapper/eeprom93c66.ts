import type Cartridge from "../../model/cartridge.js";
import { isBit, isByte, isIntegerInRange } from "../numeric-range.js";
import { areBooleans } from "./state-validation.js";

const Mode = {
  AwaitStart: 0,
  Command: 1,
  Read: 2,
  Write: 3,
  WriteAll: 4,
  Complete: 5,
} as const;

const COMMAND_BITS = 12;
const ADDRESS_MASK = 0x01ff;

export interface Eeprom93c66State {
  readonly mode: number;
  readonly command: number;
  readonly commandBits: number;
  readonly address: number;
  readonly data: number;
  readonly dataBits: number;
  readonly readBit: number;
  readonly output: number;
  readonly writeEnabled: boolean;
  readonly selected: boolean;
  readonly clock: number;
}

/** 93C66-compatible 512×8 Microwire EEPROM backed by mapper-owned NVRAM. */
export class Eeprom93c66 {
  private mode: number = Mode.AwaitStart;
  private command = 0;
  private commandBits = 0;
  private address = 0;
  private data = 0;
  private dataBits = 0;
  private readBit = 0;
  private output = 1;
  private writeEnabled = false;
  private selected = false;
  private clock = 0;

  constructor(private readonly cartridge: Cartridge) {
    if (cartridge.mapperRamBytes !== 0 || cartridge.mapperNvRamBytes !== 0x0200) {
      throw new RangeError("93C66 requires exactly 512 bytes of mapper NVRAM backing");
    }
  }

  powerOn(): void {
    this.writeEnabled = false;
    this.selected = false;
    this.clock = 0;
    this.resetTransaction();
  }

  captureState(): Eeprom93c66State {
    return {
      mode: this.mode,
      command: this.command,
      commandBits: this.commandBits,
      address: this.address,
      data: this.data,
      dataBits: this.dataBits,
      readBit: this.readBit,
      output: this.output,
      writeEnabled: this.writeEnabled,
      selected: this.selected,
      clock: this.clock,
    };
  }

  validateState(state: Eeprom93c66State): void {
    if (
      !isIntegerInRange(state.mode, Mode.AwaitStart, Mode.Complete) ||
      !isIntegerInRange(state.command, 0, 0x0fff) ||
      !isIntegerInRange(state.commandBits, 0, COMMAND_BITS) ||
      !isIntegerInRange(state.address, 0, ADDRESS_MASK) ||
      !isByte(state.data) ||
      !isIntegerInRange(state.dataBits, 0, 8) ||
      !isIntegerInRange(state.readBit, 0, 7) ||
      !isBit(state.output) ||
      !isBit(state.clock) ||
      !areBooleans(state.writeEnabled, state.selected) ||
      !this.isConsistentState(state)
    ) {
      throw new RangeError("93C66 save state contains invalid serial protocol state");
    }
  }

  restoreState(state: Eeprom93c66State): void {
    this.validateState(state);
    this.mode = state.mode;
    this.command = state.command;
    this.commandBits = state.commandBits;
    this.address = state.address;
    this.data = state.data;
    this.dataBits = state.dataBits;
    this.readBit = state.readBit;
    this.output = state.output;
    this.writeEnabled = state.writeEnabled;
    this.selected = state.selected;
    this.clock = state.clock;
  }

  readOutput(): number {
    return this.selected ? this.output : 1;
  }

  write(chipSelect: number, clock: number, dataInput: number): void {
    chipSelect &= 1;
    clock &= 1;
    dataInput &= 1;

    if (chipSelect === 0) {
      this.selected = false;
      this.clock = clock;
      this.resetTransaction();
      return;
    }
    if (!this.selected) {
      this.selected = true;
      this.clock = clock;
      this.resetTransaction();
      return;
    }
    if (this.clock === 0 && clock === 1) this.clockRise(dataInput);
    this.clock = clock;
  }

  private clockRise(dataInput: number): void {
    switch (this.mode) {
      case Mode.AwaitStart:
        if (dataInput !== 0) {
          this.mode = Mode.Command;
          this.command = 1;
          this.commandBits = 1;
        }
        break;
      case Mode.Command:
        this.command = (this.command << 1) | dataInput;
        this.commandBits++;
        if (this.commandBits === COMMAND_BITS) this.decodeCommand();
        break;
      case Mode.Read:
        this.output = (this.cartridge.readMapperRam(this.address) >>> (7 - this.readBit)) & 1;
        this.readBit++;
        if (this.readBit === 8) {
          this.readBit = 0;
          this.address = (this.address + 1) & ADDRESS_MASK;
        }
        break;
      case Mode.Write:
      case Mode.WriteAll:
        this.data = ((this.data << 1) | dataInput) & 0xff;
        this.dataBits++;
        if (this.dataBits === 8) this.commitData();
        break;
    }
  }

  private decodeCommand(): void {
    const opcode = (this.command >>> 9) & 3;
    this.address = this.command & ADDRESS_MASK;
    switch (opcode) {
      case 0:
        this.decodeControlCommand();
        break;
      case 1:
        this.mode = Mode.Write;
        this.data = 0;
        this.dataBits = 0;
        break;
      case 2:
        this.mode = Mode.Read;
        this.readBit = 0;
        this.output = 0;
        break;
      case 3:
        if (this.writeEnabled) this.cartridge.writeMapperRam(this.address, 0xff);
        this.completeCommand();
        break;
    }
  }

  private decodeControlCommand(): void {
    switch (this.address >>> 7) {
      case 0:
        this.writeEnabled = false;
        this.completeCommand();
        break;
      case 1:
        this.mode = Mode.WriteAll;
        this.data = 0;
        this.dataBits = 0;
        break;
      case 2:
        if (this.writeEnabled) this.fill(0xff);
        this.completeCommand();
        break;
      case 3:
        this.writeEnabled = true;
        this.completeCommand();
        break;
    }
  }

  private commitData(): void {
    if (this.writeEnabled) {
      if (this.mode === Mode.Write) this.cartridge.writeMapperRam(this.address, this.data);
      else this.fill(this.data);
    }
    this.completeCommand();
  }

  private fill(value: number): void {
    for (let address = 0; address <= ADDRESS_MASK; address++) {
      this.cartridge.writeMapperRam(address, value);
    }
  }

  private completeCommand(): void {
    this.mode = Mode.Complete;
    this.output = 1;
  }

  private resetTransaction(): void {
    this.mode = Mode.AwaitStart;
    this.command = 0;
    this.commandBits = 0;
    this.address = 0;
    this.data = 0;
    this.dataBits = 0;
    this.readBit = 0;
    this.output = 1;
  }

  private isConsistentState(state: Eeprom93c66State): boolean {
    if (!state.selected) {
      return (
        state.mode === Mode.AwaitStart &&
        state.commandBits === 0 &&
        state.dataBits === 0 &&
        state.output === 1
      );
    }
    switch (state.mode) {
      case Mode.AwaitStart:
        return state.commandBits === 0 && state.dataBits === 0 && state.output === 1;
      case Mode.Command:
        return state.commandBits >= 1 && state.commandBits < COMMAND_BITS && state.dataBits === 0;
      case Mode.Read:
        return state.commandBits === COMMAND_BITS && state.dataBits === 0;
      case Mode.Write:
      case Mode.WriteAll:
        return state.commandBits === COMMAND_BITS && state.dataBits < 8;
      case Mode.Complete:
        return state.commandBits === COMMAND_BITS && state.output === 1;
      default:
        return false;
    }
  }
}
