import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { BandaiFcgMapper, type BandaiFcgBoard } from "./bandai-fcg-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("BandaiFcgMapper", () => {
  it("maps FCG-1/2 banks and four mirroring modes only through the low register range", () => {
    const cartridge = createBandaiCartridge(4);
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new BandaiFcgMapper(noopInterrupt, cartridge, "fcg-1-2");

    for (let slot = 0; slot < 8; slot++) mapper.write(0x7ff0 + slot, 8 + slot);
    mapper.write(0x7ff8, 5);
    mapper.write(0x8008, 9);
    mapper.write(0x7ff9, 3);

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([5, 15]);
    expect(readChrSlots(mapper)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    mapper.write(0x7ff9, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0x7ff9, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.write(0x7ff9, 2);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("models FCG-1/2's directly writable live IRQ counter", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper("fcg-1-2", 4, assertions);
    mapper.write(0x600b, 2);
    mapper.write(0x600c, 0);
    mapper.write(0x600a, 1);

    clockCpu(mapper, 2);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqReload: 0 });
    clockCpu(mapper, 1);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0x600a, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xffff, irqEnabled: false });
  });

  it("models LZ93D50's high-only registers and latched IRQ reload", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper("lz93d50", 5, assertions);
    mapper.write(0x6008, 7);
    expect(mapper.captureState()).toMatchObject({ prgBank: 0 });

    mapper.write(0x8008, 7);
    mapper.write(0x800b, 2);
    mapper.write(0x800c, 0);
    expect(mapper.captureState()).toMatchObject({ prgBank: 7, irqReload: 2, irqCounter: 0 });
    mapper.write(0x800a, 1);
    expect(mapper.captureState()).toMatchObject({ irqReload: 2, irqCounter: 2 });

    clockCpu(mapper, 2);
    expect(assertions.at(-1)).toBe(false);
    clockCpu(mapper, 1);
    expect(assertions.at(-1)).toBe(true);
    mapper.write(0x800a, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 2, irqEnabled: false });
  });

  it("uses each address range's IRQ semantics for unspecified submapper 0", () => {
    const mapper = new BandaiFcgMapper(
      noopInterrupt,
      createTestCartridge({ mapper: 16, prgBanks: 16, chrBanks: 32 }),
      "auto",
    );
    mapper.write(0x600b, 0x34);
    mapper.write(0x600c, 0x12);
    mapper.write(0x800b, 0x78);
    mapper.write(0x800c, 0x56);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0x1234, irqReload: 0x5678 });

    mapper.write(0x800a, 1);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0x5678 });
    clockCpu(mapper, 1);
    mapper.write(0x600a, 1);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0x5677 });
  });

  it("persists and reads a byte through the LZ93D50 24C02 serial lines", () => {
    const cartridge = createBandaiCartridge(5, true);
    const mapper = new BandaiFcgMapper(noopInterrupt, cartridge, "lz93d50");

    writeEepromByte(mapper, 0x34, 0xa5);

    const save = cartridge.captureBatterySave();
    expect(save?.data).toHaveLength(0x100);
    expect(save?.data[0x34]).toBe(0xa5);
    expect(save?.revision).toBeGreaterThan(0);
    expect(readEepromByte(mapper, 0x34)).toBe(0xa5);
  });

  it("drives only EEPROM D4 and preserves the rest of the CPU open bus", () => {
    const cartridge = createBandaiCartridge(5, true);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0, 0xa5);

    expect(memory.read(0x6000)).toBe(0xb5);
    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0x10);
  });

  it("round-trips ASIC and in-flight EEPROM state and rejects cross-board snapshots", () => {
    const mapper = createMapper("lz93d50", 5, [], true);
    mapper.write(0x8008, 9);
    mapper.write(0x8009, 3);
    mapper.write(0x800b, 0x34);
    mapper.write(0x800c, 0x12);
    writeLines(mapper, 1, 1);
    writeLines(mapper, 1, 0);
    for (const bit of [1, 0, 1]) clockSerialBit(mapper, bit);
    const state = mapper.captureState();
    if (state.kind !== "bandai-fcg" || state.eeprom === null) {
      throw new Error("unexpected Bandai FCG state");
    }

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, board: "fcg-1-2" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({
        ...state,
        eeprom: { ...state.eeprom, bitCounter: 9 },
      } as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, irqEnabled: false, irqPending: true } as MapperState),
    ).toThrowError(RangeError);
  });
});

function createBandaiCartridge(submapper: number, eeprom = false) {
  return createTestCartridge({
    mapper: 16,
    nes2: true,
    submapper,
    prgBanks: 16,
    chrBanks: 32,
    battery: eeprom,
    prgNvRamShift: eeprom ? 2 : 0,
  });
}

function createMapper(
  board: BandaiFcgBoard,
  submapper: number,
  assertions: boolean[] = [],
  eeprom = false,
): BandaiFcgMapper {
  return new BandaiFcgMapper(
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
    createBandaiCartridge(submapper, eeprom),
    board,
  );
}

function writeEepromByte(mapper: BandaiFcgMapper, address: number, value: number): void {
  startSerial(mapper);
  expect(sendSerialByte(mapper, 0xa0)).toBe(0);
  expect(sendSerialByte(mapper, address)).toBe(0);
  expect(sendSerialByte(mapper, value)).toBe(0);
  stopSerial(mapper);
}

function readEepromByte(mapper: BandaiFcgMapper, address: number): number {
  startSerial(mapper);
  expect(sendSerialByte(mapper, 0xa0)).toBe(0);
  expect(sendSerialByte(mapper, address)).toBe(0);
  startSerial(mapper);
  expect(sendSerialByte(mapper, 0xa1)).toBe(0);

  let value = 0;
  for (let bit = 0; bit < 8; bit++) {
    writeLines(mapper, 0, 1);
    writeLines(mapper, 1, 1);
    value = (value << 1) | ((mapper.read(0x6000) >>> 4) & 1);
    writeLines(mapper, 0, 1);
  }
  writeLines(mapper, 1, 1);
  writeLines(mapper, 0, 1);
  stopSerial(mapper);
  return value;
}

function startSerial(mapper: BandaiFcgMapper): void {
  writeLines(mapper, 1, 1);
  writeLines(mapper, 1, 0);
}

function stopSerial(mapper: BandaiFcgMapper): void {
  writeLines(mapper, 0, 0);
  writeLines(mapper, 1, 0);
  writeLines(mapper, 1, 1);
}

function sendSerialByte(mapper: BandaiFcgMapper, value: number): number {
  for (let bit = 7; bit >= 0; bit--) clockSerialBit(mapper, (value >>> bit) & 1);
  writeLines(mapper, 0, 1);
  writeLines(mapper, 1, 1);
  const acknowledge = (mapper.read(0x6000) >>> 4) & 1;
  writeLines(mapper, 0, 1);
  return acknowledge;
}

function clockSerialBit(mapper: BandaiFcgMapper, value: number): void {
  writeLines(mapper, 0, value);
  writeLines(mapper, 1, value);
  writeLines(mapper, 0, value);
}

function writeLines(mapper: BandaiFcgMapper, scl: number, sda: number): void {
  mapper.write(0x800d, (scl << 5) | (sda << 6));
}

function clockCpu(mapper: BandaiFcgMapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle(false);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readChrSlots(mapper: BandaiFcgMapper): number[] {
  return readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]);
}

function readAt(mapper: BandaiFcgMapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
