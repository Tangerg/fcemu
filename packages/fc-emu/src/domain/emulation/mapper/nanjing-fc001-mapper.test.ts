import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";
import { NanjingFc001Mapper } from "./nanjing-fc001-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("NanjingFc001Mapper", () => {
  it("boots in PRG bank 3 and combines the low and high bank registers", () => {
    const cartridge = createMapper163Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new NanjingFc001Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.read(0xffff)).toBe(3);

    mapper.writeCpuExpansion(0x53ff, 0x04);
    mapper.writeCpuExpansion(0x50ab, 0x09);
    mapper.writeCpuExpansion(0x52fe, 0x02);
    expect(mapper.read(0x8000)).toBe(41);
  });

  it("swaps D0/D1 before all $5000-$5200 register inputs", () => {
    const cartridge = createMapper163Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new NanjingFc001Mapper(cartridge);

    mapper.writeCpuExpansion(0x5300, 0x05);
    mapper.writeCpuExpansion(0x5000, 0x01);
    mapper.writeCpuExpansion(0x5200, 0x01);
    expect(mapper.read(0x8000)).toBe(34);

    mapper.writeCpuExpansion(0x5300, 0x01);
    expect(mapper.read(0x8000)).toBe(35);
  });

  it("models the shared A19/A20 input used by 1 MiB cartridges", () => {
    const cartridge = createMapper163Cartridge(64);
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new NanjingFc001Mapper(cartridge);
    mapper.writeCpuExpansion(0x5300, 0x04);

    mapper.writeCpuExpansion(0x5200, 0x01);
    expect(mapper.read(0x8000)).toBe(16);
    mapper.writeCpuExpansion(0x5200, 0x02);
    expect(mapper.read(0x8000)).toBe(16);

    mapper.writeCpuExpansion(0x5300, 0x05);
    mapper.writeCpuExpansion(0x5200, 0x01);
    expect(mapper.read(0x8000)).toBe(16);
  });

  it("latches, flips and exposes only the inverted feedback data line", () => {
    const mapper = new NanjingFc001Mapper(createMapper163Cartridge());

    for (const address of [0x5100, 0x5501, 0x59fe, 0x5dff]) {
      expect(mapper.readCpuExpansion(address)).toEqual({ value: 0x04, drivenMask: 0x04 });
    }
    expect(mapper.readCpuExpansion(0x5400)).toBeUndefined();

    mapper.writeCpuExpansion(0x51fe, 0x05);
    expect(mapper.readCpuExpansion(0x5500)).toEqual({ value: 0, drivenMask: 0x04 });
    mapper.writeCpuExpansion(0x51ff, 0xff);
    expect(mapper.readCpuExpansion(0x5500)).toEqual({ value: 0x04, drivenMask: 0x04 });

    mapper.writeCpuExpansion(0x5300, 0x01);
    mapper.writeCpuExpansion(0x5100, 0x02);
    mapper.writeCpuExpansion(0x5101, 0);
    expect(mapper.readCpuExpansion(0x5500)).toEqual({ value: 0, drivenMask: 0x04 });
  });

  it("replaces CHR A12 with A9 captured on the most recent PPU A13 rise", () => {
    const mapper = new NanjingFc001Mapper(createMapper163Cartridge());
    mapper.write(0x0042, 0x11);
    mapper.write(0x1042, 0x22);

    mapper.writeCpuExpansion(0x5000, 0x80);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2000);
    expect(mapper.read(0x0042)).toBe(0x11);
    expect(mapper.read(0x1042)).toBe(0x11);

    mapper.observePpuAddress(0x2200);
    expect(mapper.read(0x1042)).toBe(0x11);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2200);
    expect(mapper.read(0x0042)).toBe(0x22);
    expect(mapper.read(0x1042)).toBe(0x22);

    mapper.write(0x0042, 0x33);
    mapper.writeCpuExpansion(0x5000, 0);
    expect(mapper.read(0x0042)).toBe(0x11);
    expect(mapper.read(0x1042)).toBe(0x33);
  });

  it("maps one unbanked battery-backed 8 KiB PRG-RAM window", () => {
    const mapper = new NanjingFc001Mapper(createMapper163Cartridge());

    mapper.write(0x6000, 0x51);
    mapper.write(0x7fff, 0x7a);
    expect(mapper.read(0x6000)).toBe(0x51);
    expect(mapper.read(0x7fff)).toBe(0x7a);
    expect(mapper.cpuReadDriveMask(0x5fff)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0xffff)).toBe(0xff);
  });

  it("round-trips live state and rejects malformed state atomically", () => {
    const mapper = new NanjingFc001Mapper(createMapper163Cartridge());
    mapper.writeCpuExpansion(0x5300, 0x05);
    mapper.writeCpuExpansion(0x5000, 0x81);
    mapper.writeCpuExpansion(0x5200, 0x01);
    mapper.writeCpuExpansion(0x5100, 0x06);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x2200);
    const state = mapper.captureState();

    const restored = new NanjingFc001Mapper(createMapper163Cartridge());
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgBankLow: 0x10 },
      { ...state, prgBankHigh: 4 },
      { ...state, mode: 2 },
      { ...state, feedbackBit: 1 },
      { ...state, automaticChrHalf: 2 },
      { ...state, lastPpuAddress: 0x4000 },
    ]) {
      expect(() => restored.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(restored.captureState()).toEqual(state);
    }

    restored.powerOn();
    expect(restored.captureState()).toEqual({
      kind: "nanjing-fc001-163",
      prgBankLow: 0,
      prgBankHigh: 0,
      mode: 0,
      feedbackEnabled: false,
      feedbackBit: false,
      automaticChrHalf: 0,
      lastPpuAddress: 0,
    });
  });

  it("accepts only FC-001 memory geometry and the non-audio submapper", () => {
    for (const prgBanks of [64, 128]) {
      expect(() => createMapper(createMapper163Cartridge(prgBanks), noopInterrupt)).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 163,
          nes2: true,
          submapper: 1,
          prgBanks: 128,
          battery: true,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 163, prgBanks: 32, battery: true }),
      createTestCartridge({ mapper: 163, prgBanks: 128, chrBanks: 1, battery: true }),
      createTestCartridge({ mapper: 163, prgBanks: 128 }),
      createTestCartridge({
        mapper: 163,
        nes2: true,
        prgBanks: 128,
        battery: true,
        chrRamShift: 8,
      }),
      createTestCartridge({ mapper: 163, prgBanks: 128, battery: true, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, noopInterrupt)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper163Cartridge(prgBanks = 128) {
  return createTestCartridge({ mapper: 163, prgBanks, battery: true });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
