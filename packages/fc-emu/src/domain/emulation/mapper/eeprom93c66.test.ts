import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import type Cartridge from "../../model/cartridge.js";
import { Eeprom93c66, type Eeprom93c66State } from "./eeprom93c66.js";

describe("Eeprom93c66", () => {
  it("requires EWEN, writes one byte and reads sequential bytes after the dummy bit", () => {
    const cartridge = createEepromCartridge();
    const eeprom = new Eeprom93c66(cartridge);

    writeByte(eeprom, 5, 0xa5);
    expect(cartridge.readMapperRam(5)).toBe(0xff);

    control(eeprom, 3);
    writeByte(eeprom, 5, 0xa5);
    writeByte(eeprom, 6, 0x3c);
    expect(cartridge.readMapperRam(5)).toBe(0xa5);
    expect(cartridge.readMapperRam(6)).toBe(0x3c);

    select(eeprom);
    sendCommand(eeprom, 2, 5);
    expect(eeprom.readOutput()).toBe(0);
    expect(readByte(eeprom)).toBe(0xa5);
    expect(readByte(eeprom)).toBe(0x3c);
    deselect(eeprom);
  });

  it("implements byte/all erase, write-all and write-disable control commands", () => {
    const cartridge = createEepromCartridge();
    const eeprom = new Eeprom93c66(cartridge);
    control(eeprom, 3);

    control(eeprom, 1, 0x66);
    expect(cartridge.readMapperRam(0)).toBe(0x66);
    expect(cartridge.readMapperRam(0x01ff)).toBe(0x66);

    eraseByte(eeprom, 0x101);
    expect(cartridge.readMapperRam(0x101)).toBe(0xff);
    expect(cartridge.readMapperRam(0x100)).toBe(0x66);

    control(eeprom, 2);
    expect(cartridge.readMapperRam(0)).toBe(0xff);
    expect(cartridge.readMapperRam(0x01ff)).toBe(0xff);

    writeByte(eeprom, 7, 0x71);
    control(eeprom, 0);
    writeByte(eeprom, 8, 0x82);
    expect(cartridge.readMapperRam(7)).toBe(0x71);
    expect(cartridge.readMapperRam(8)).toBe(0xff);
  });

  it("round-trips an in-flight command and rejects inconsistent state", () => {
    const eeprom = new Eeprom93c66(createEepromCartridge());
    select(eeprom);
    sendBits(eeprom, bits(0x0a5, 12).slice(0, 7));
    const state = eeprom.captureState();

    const restored = new Eeprom93c66(createEepromCartridge());
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, command: 0x1000 },
      { ...state, commandBits: 12 },
      { ...state, output: 2 },
      { ...state, selected: false },
    ]) {
      expect(() => restored.restoreState(invalid as Eeprom93c66State)).toThrow(/93C66 save state/);
      expect(restored.captureState()).toEqual(state);
    }
  });
});

function createEepromCartridge(): Cartridge {
  return createTestCartridge({ mapper: 164, prgBanks: 64, battery: true });
}

function select(eeprom: Eeprom93c66): void {
  eeprom.write(1, 0, 0);
}

function deselect(eeprom: Eeprom93c66): void {
  eeprom.write(0, 0, 0);
}

function sendCommand(eeprom: Eeprom93c66, opcode: number, address: number): void {
  sendBits(eeprom, bits((1 << 11) | ((opcode & 3) << 9) | (address & 0x01ff), 12));
}

function sendBits(eeprom: Eeprom93c66, values: readonly number[]): void {
  for (const value of values) {
    eeprom.write(1, 1, value);
    eeprom.write(1, 0, value);
  }
}

function readByte(eeprom: Eeprom93c66): number {
  let value = 0;
  for (let bit = 0; bit < 8; bit++) {
    eeprom.write(1, 1, 0);
    value = (value << 1) | eeprom.readOutput();
    eeprom.write(1, 0, 0);
  }
  return value;
}

function writeByte(eeprom: Eeprom93c66, address: number, value: number): void {
  select(eeprom);
  sendCommand(eeprom, 1, address);
  sendBits(eeprom, bits(value, 8));
  deselect(eeprom);
}

function eraseByte(eeprom: Eeprom93c66, address: number): void {
  select(eeprom);
  sendCommand(eeprom, 3, address);
  deselect(eeprom);
}

function control(eeprom: Eeprom93c66, operation: number, value?: number): void {
  select(eeprom);
  sendCommand(eeprom, 0, (operation & 3) << 7);
  if (value !== undefined) sendBits(eeprom, bits(value, 8));
  deselect(eeprom);
}

function bits(value: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (value >>> (count - index - 1)) & 1);
}
