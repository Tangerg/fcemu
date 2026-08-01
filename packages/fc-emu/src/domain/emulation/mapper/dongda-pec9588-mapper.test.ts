import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { createMapper } from "./create-mapper.js";
import { DongdaPec9588Mapper } from "./dongda-pec9588-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("DongdaPec9588Mapper", () => {
  it("boots with switchable bank 0 and fixed bank $1F in UxROM mode", () => {
    const cartridge = createMapper164Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new DongdaPec9588Mapper(cartridge);

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([0, 31]);
    mapper.writeCpuExpansion(0x50ff, 0x05);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([5, 31]);
    mapper.writeCpuExpansion(0x5000, 0x25);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([21, 31]);

    mapper.writeCpuExpansion(0x5000, 0x40);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([0, 28]);
    mapper.writeCpuExpansion(0x5000, 0x41);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([1, 30]);
  });

  it("combines high banks and maps consecutive 32 KiB BxROM windows", () => {
    const cartridge = createMapper164Cartridge(128);
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new DongdaPec9588Mapper(cartridge);

    mapper.writeCpuExpansion(0x5100, 2);
    mapper.writeCpuExpansion(0x5000, 0x05);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([69, 95]);

    mapper.writeCpuExpansion(0x5000, 0x13);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([70, 71]);
  });

  it("forces vertical mirroring in UxROM mode and applies $5300 only in BxROM mode", () => {
    const cartridge = createMapper164Cartridge();
    const mapper = new DongdaPec9588Mapper(cartridge);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.writeCpuExpansion(0x5300, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    mapper.writeCpuExpansion(0x5000, 0x10);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.writeCpuExpansion(0x53ff, 0x80);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("replaces CHR A3/A12 with PPU A0/A9 captured on the latest A13 rise", () => {
    const mapper = new DongdaPec9588Mapper(createMapper164Cartridge());
    mapper.write(0x0000, 0x11);
    mapper.write(0x1008, 0x22);
    mapper.writeCpuExpansion(0x5000, 0x80);

    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2201);
    expect(mapper.read(0x0000)).toBe(0x22);
    expect(mapper.read(0x1008)).toBe(0x22);

    mapper.observePpuAddress(0x2000);
    expect(mapper.read(0x0000)).toBe(0x22);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2000);
    expect(mapper.read(0x0000)).toBe(0x11);

    mapper.writeCpuExpansion(0x5000, 0);
    expect(mapper.read(0x0000)).toBe(0x11);
    expect(mapper.read(0x1008)).toBe(0x22);
  });

  it("mirrors 2 KiB volatile PRG RAM and wires the inverted EEPROM output to D2", () => {
    const cartridge = createMapper164Cartridge();
    const mapper = new DongdaPec9588Mapper(cartridge);
    mapper.write(0x6000, 0x61);
    expect(mapper.read(0x6800)).toBe(0x61);
    mapper.write(0x7fff, 0x7f);
    expect(mapper.read(0x67ff)).toBe(0x7f);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);

    eepromSelect(mapper);
    eepromCommand(mapper, 2, 0);
    expect(mapper.readCpuExpansion(0x5500)).toEqual({ value: 0x04, drivenMask: 0x04 });
    eepromClock(mapper, 0, true);
    expect(mapper.readCpuExpansion(0x55ff)).toEqual({ value: 0, drivenMask: 0x04 });
    expect(mapper.readCpuExpansion(0x5400)).toBeUndefined();

    eepromDeselect(mapper);
    eepromSelect(mapper);
    eepromCommand(mapper, 0, 3 << 7);
    eepromDeselect(mapper);
    eepromSelect(mapper);
    eepromCommand(mapper, 1, 3);
    eepromBits(mapper, bits(0x5a, 8));
    eepromDeselect(mapper);
    expect(cartridge.captureBatterySave()).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ 3: 0x5a }),
    });
  });

  it("round-trips board and in-flight EEPROM state and preserves EWEN across warm reset", () => {
    const mapper = new DongdaPec9588Mapper(createMapper164Cartridge());
    mapper.writeCpuExpansion(0x5000, 0x93);
    mapper.writeCpuExpansion(0x5100, 2);
    mapper.writeCpuExpansion(0x5300, 0x80);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2201);
    eepromSelect(mapper);
    eepromCommand(mapper, 0, 3 << 7);
    eepromDeselect(mapper);
    eepromSelect(mapper);
    eepromBits(mapper, bits((1 << 11) | (1 << 9) | 7, 12).slice(0, 8));
    const state = mapper.captureState();
    if (state.kind !== "dongda-pec9588-164") throw new Error("unexpected mapper state");

    const restored = new DongdaPec9588Mapper(createMapper164Cartridge());
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgBankLow: 0x100 },
      { ...state, prgBankHigh: 4 },
      { ...state, latchedChrA3: 2 },
      { ...state, lastPpuAddress: 0x4000 },
      { ...state, eeprom: { ...state.eeprom, command: 0x1000 } },
    ]) {
      expect(() => restored.restoreState(invalid as MapperState)).toThrow(/save state/);
      expect(restored.captureState()).toEqual(state);
    }

    restored.reset();
    expect(restored.captureState()).toMatchObject({
      prgBankLow: 0,
      prgBankHigh: 0,
      mirroringControl: 0,
      eeprom: { writeEnabled: true, selected: false },
    });
    restored.powerOn();
    expect(restored.captureState()).toMatchObject({ eeprom: { writeEnabled: false } });
  });

  it("accepts documented memory options and rejects unsupported geometry", () => {
    for (const prgBanks of [32, 64, 128]) {
      expect(() => createMapper(createMapper164Cartridge(prgBanks), noopInterrupt)).not.toThrow();
      expect(() =>
        createMapper(
          createTestCartridge({
            mapper: 164,
            nes2: true,
            prgBanks,
            battery: true,
            prgNvRamShift: 0,
          }),
          noopInterrupt,
        ),
      ).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 164,
          nes2: true,
          submapper: 1,
          prgBanks: 64,
          battery: true,
          prgNvRamShift: 0,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 164, prgBanks: 16, battery: true }),
      createTestCartridge({ mapper: 164, prgBanks: 64 }),
      createTestCartridge({ mapper: 164, prgBanks: 64, chrBanks: 1, battery: true }),
      createTestCartridge({ mapper: 164, prgBanks: 64, battery: true, fourScreen: true }),
      createTestCartridge({
        mapper: 164,
        nes2: true,
        prgBanks: 64,
        battery: true,
        prgRamShift: 7,
        prgNvRamShift: 0,
      }),
      createTestCartridge({
        mapper: 164,
        nes2: true,
        prgBanks: 64,
        battery: true,
        prgNvRamShift: 7,
      }),
    ]) {
      expect(() => createMapper(cartridge, noopInterrupt)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper164Cartridge(prgBanks = 64) {
  return createTestCartridge({ mapper: 164, prgBanks, battery: true });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function eepromSelect(mapper: DongdaPec9588Mapper): void {
  mapper.writeCpuExpansion(0x5200, 0x10);
}

function eepromDeselect(mapper: DongdaPec9588Mapper): void {
  mapper.writeCpuExpansion(0x5200, 0);
}

function eepromCommand(mapper: DongdaPec9588Mapper, opcode: number, address: number): void {
  eepromBits(mapper, bits((1 << 11) | ((opcode & 3) << 9) | (address & 0x01ff), 12));
}

function eepromBits(mapper: DongdaPec9588Mapper, values: readonly number[]): void {
  for (const value of values) eepromClock(mapper, value, false);
}

function eepromClock(mapper: DongdaPec9588Mapper, data: number, leaveHigh: boolean): void {
  mapper.writeCpuExpansion(0x5200, 0x10 | (data & 1));
  mapper.writeCpuExpansion(0x5200, 0x12 | (data & 1));
  if (!leaveHigh) mapper.writeCpuExpansion(0x5200, 0x10 | (data & 1));
}

function bits(value: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (value >>> (count - index - 1)) & 1);
}
