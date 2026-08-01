import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import { KaiserKs202Mapper } from "./kaiser-ks202-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("KaiserKs202Mapper", () => {
  it("maps four independently selected 8 KiB PRG windows and a fixed final bank", () => {
    const cartridge = createMapper142Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new KaiserKs202Mapper(noopInterrupt, cartridge);

    for (const [register, bank] of [
      [1, 5],
      [2, 6],
      [3, 7],
      [4, 8],
    ]) {
      writeBank(mapper, register, bank);
    }

    expect(mapper.read(0x6000)).toBe(8);
    expect(mapper.read(0x7fff)).toBe(8);
    expect(mapper.read(0x8000)).toBe(5);
    expect(mapper.read(0xa000)).toBe(6);
    expect(mapper.read(0xc000)).toBe(7);
    expect(mapper.read(0xe000)).toBe(15);
    expect(mapper.read(0xffff)).toBe(15);
  });

  it("ignores undefined bank-register selectors and decodes each complete 4 KiB page", () => {
    const cartridge = createMapper142Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new KaiserKs202Mapper(noopInterrupt, cartridge);

    mapper.write(0xefff, 1);
    mapper.write(0xffff, 0xfa);
    expect(mapper.read(0x8000)).toBe(10);

    for (const selector of [0, 5, 6, 7]) {
      writeBank(mapper, selector, selector + 1);
    }
    expect(mapper.read(0x8000)).toBe(10);
    expect(mapper.read(0x6000)).toBe(0);

    mapper.write(0x6000, 0xff);
    expect(mapper.read(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0x5fff)).toBe(0);
  });

  it("provides one unbanked 8 KiB CHR-RAM window", () => {
    const mapper = new KaiserKs202Mapper(noopInterrupt, createMapper142Cartridge());

    mapper.write(0x0000, 0x51);
    mapper.write(0x1fff, 0x7a);

    expect(mapper.read(0x0000)).toBe(0x51);
    expect(mapper.read(0x1fff)).toBe(0x7a);
  });

  it("assembles the four-nibble reload and raises a one-shot IRQ on 16-bit overflow", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeIrqReload(mapper, 0xfffe);
    mapper.write(0xcabc, 0x02);

    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xffff, irqPending: false });
    mapper.observeCpuBusCycle(false);

    expect(mapper.captureState()).toMatchObject({
      irqReload: 0xfffe,
      irqCounter: 0xfffe,
      irqEnabled: false,
      irqPending: true,
    });
    expect(assertions.at(-1)).toBe(true);

    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xfffe, irqPending: true });
  });

  it("acknowledges without VRC3-style re-enable and treats control $05 as disabled", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeIrqReload(mapper, 0xffff);
    mapper.write(0xc000, 0x02);
    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ irqEnabled: false, irqPending: true });

    mapper.write(0xdfff, 0xff);
    expect(mapper.captureState()).toMatchObject({ irqEnabled: false, irqPending: false });
    expect(assertions.at(-1)).toBe(false);

    mapper.write(0xc000, 0x02);
    mapper.observeCpuBusCycle(false);
    mapper.write(0xc000, 0x05);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0xffff,
      irqEnabled: false,
      irqPending: false,
    });
  });

  it("clears state only on cold power and preserves it across console reset", () => {
    const cartridge = createMapper142Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const bus = new Bus(cartridge);

    writeBank(bus.Mapper as KaiserKs202Mapper, 1, 9);
    writeIrqReload(bus.Mapper as KaiserKs202Mapper, 0x1234);
    bus.reset();
    expect(bus.Mapper.read(0x8000)).toBe(9);
    expect(bus.Mapper.captureState()).toMatchObject({ irqReload: 0x1234 });

    bus.powerOn();
    expect(bus.Mapper.read(0x8000)).toBe(0);
    expect(bus.Mapper.captureState()).toEqual({
      kind: "kaiser-ks202-142",
      selectedRegister: 0,
      prgBanks: [0, 0, 0, 0],
      irqReload: 0,
      irqCounter: 0,
      irqEnabled: false,
      irqPending: false,
    });
  });

  it("round-trips live state, reasserts IRQ and rejects malformed state atomically", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    for (let register = 1; register <= 4; register++) writeBank(mapper, register, register + 4);
    writeIrqReload(mapper, 0xffff);
    mapper.write(0xc000, 0x02);
    mapper.observeCpuBusCycle(false);
    const state = mapper.captureState();

    const restoredAssertions: boolean[] = [];
    const restored = createIrqMapper(restoredAssertions);
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);
    expect(restoredAssertions.at(-1)).toBe(true);

    for (const invalid of [
      { ...state, selectedRegister: 8 },
      { ...state, prgBanks: [0, 1, 2] },
      { ...state, prgBanks: [0, 1, 2, 16] },
      { ...state, irqCounter: 0x1_0000 },
      { ...state, irqEnabled: true },
    ]) {
      expect(() => restored.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(restored.captureState()).toEqual(state);
    }
  });

  it("accepts only the known KS7032 geometry and base submapper", () => {
    expect(() => createMapper(createMapper142Cartridge(), noopInterrupt)).not.toThrow();

    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 142, nes2: true, submapper: 1, prgBanks: 8 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 142, prgBanks: 4 }),
      createTestCartridge({ mapper: 142, prgBanks: 16 }),
      createTestCartridge({ mapper: 142, prgBanks: 8, chrBanks: 1 }),
      createTestCartridge({
        mapper: 142,
        nes2: true,
        prgBanks: 8,
        chrRamShift: 8,
      }),
      createTestCartridge({
        mapper: 142,
        nes2: true,
        prgBanks: 8,
        prgRamShift: 7,
      }),
      createTestCartridge({ mapper: 142, prgBanks: 8, fourScreen: true }),
    ]) {
      expect(() => createMapper(cartridge, noopInterrupt)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper142Cartridge() {
  return createTestCartridge({ mapper: 142, prgBanks: 8 });
}

function createIrqMapper(assertions: boolean[]): KaiserKs202Mapper {
  return new KaiserKs202Mapper(
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
    createMapper142Cartridge(),
  );
}

function writeBank(mapper: KaiserKs202Mapper, register: number, bank: number): void {
  mapper.write(0xe000, register);
  mapper.write(0xf000, bank);
}

function writeIrqReload(mapper: KaiserKs202Mapper, value: number): void {
  for (let nibble = 0; nibble < 4; nibble++) {
    mapper.write(0x8000 + nibble * 0x1000, (value >>> (nibble * 4)) & 0x0f);
  }
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
