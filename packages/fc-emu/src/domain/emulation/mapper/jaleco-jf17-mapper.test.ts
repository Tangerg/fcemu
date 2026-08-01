import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";
import { JalecoJf17Mapper } from "./jaleco-jf17-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("JalecoJf17Mapper", () => {
  it("maps one switchable and one fixed 16 KiB PRG window", () => {
    const cartridge = createJf17Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);

    mapper.write(0x9000, 0x85);

    expect(mapper.read(0x8000)).toBe(5);
    expect(mapper.read(0xc000)).toBe(7);
  });

  it("loads PRG only on a conflict-masked D7 rising edge", () => {
    const cartridge = createJf17Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);

    mapper.write(0x9000, 0x82);
    mapper.write(0x9000, 0x83);
    expect(mapper.read(0x8000)).toBe(2);

    mapper.write(0x9000, 0x03);
    mapper.write(0x9000, 0x83);
    expect(mapper.read(0x8000)).toBe(3);
  });

  it("loads CHR only on a conflict-masked D6 rising edge", () => {
    const cartridge = createJf17Cartridge();
    fillBanks(cartridge.chrRom, 0x2000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);

    mapper.write(0x9000, 0x44);
    mapper.write(0x9000, 0x45);
    expect(mapper.read(0x0000)).toBe(4);

    mapper.write(0x9000, 0x05);
    mapper.write(0x9000, 0x45);
    expect(mapper.read(0x0000)).toBe(5);
  });

  it("can clock both bank latches from the same effective write", () => {
    const cartridge = createJf17Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x2000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);

    mapper.write(0x9000, 0xc6);

    expect(mapper.read(0x8000)).toBe(6);
    expect(mapper.read(0x0000)).toBe(6);
  });

  it("applies ROM bus conflicts before edge detection and bank data", () => {
    const cartridge = createJf17Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x2000);
    cartridge.prgRom[0x1000] = 0x42;
    const mapper = new JalecoJf17Mapper(cartridge);

    mapper.write(0x9000, 0xc7);

    expect(mapper.read(0x8000)).toBe(0);
    expect(mapper.read(0x0000)).toBe(2);
    expect(mapper.captureState()).toMatchObject({
      prgClockHigh: false,
      chrClockHigh: true,
    });
  });

  it("power-on clears both banks and both edge-history latches", () => {
    const cartridge = createJf17Cartridge();
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);
    mapper.write(0x9000, 0xc7);

    mapper.powerOn();

    expect(mapper.captureState()).toEqual({
      kind: "jaleco-jf17",
      prgBank: 0,
      chrBank: 0,
      prgClockHigh: false,
      chrClockHigh: false,
    });
  });

  it("round-trips state and rejects invalid banks or clock types", () => {
    const cartridge = createJf17Cartridge();
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge);
    mapper.write(0x9000, 0xc5);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, prgBank: 8 } as MapperState)).toThrow(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, chrClockHigh: 1 } as unknown as MapperState),
    ).toThrow(RangeError);
  });

  it("keeps the absent PRG-RAM range electrically open", () => {
    const mapper = new JalecoJf17Mapper(createJf17Cartridge());

    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
  });

  it("accepts only JF-17's documented ROM geometry", () => {
    expect(() => createMapper(createJf17Cartridge(), interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 72, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 16 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 72, prgBanks: 4, chrBanks: 16 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 72, prgBanks: 8, chrBanks: 8 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 72, prgBanks: 8 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 72,
          nes2: true,
          prgBanks: 8,
          chrBanks: 16,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 72, prgBanks: 8, chrBanks: 16, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });

  it("models JF-19's fixed-lower and switchable-upper 16 KiB PRG windows", () => {
    const cartridge = createJf19Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge, "jf-19");

    expect(mapper.read(0x8000)).toBe(0);
    expect(mapper.read(0xc000)).toBe(15);

    mapper.write(0x9000, 0x8d);

    expect(mapper.read(0x8000)).toBe(0);
    expect(mapper.read(0xc000)).toBe(13);
  });

  it("gives JF-19 the shared CHR latch and independent edge history", () => {
    const cartridge = createJf19Cartridge();
    fillBanks(cartridge.chrRom, 0x2000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge, "jf-19");

    mapper.write(0x9000, 0x4f);
    mapper.write(0x9000, 0x4e);
    expect(mapper.read(0x0000)).toBe(15);

    mapper.write(0x9000, 0x0e);
    mapper.write(0x9000, 0x4e);
    expect(mapper.read(0x0000)).toBe(14);
  });

  it("applies fixed-bank ROM conflicts before JF-19's four-bit PRG latch", () => {
    const cartridge = createJf19Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    cartridge.prgRom[0x1000] = 0x8b;
    const mapper = new JalecoJf17Mapper(cartridge, "jf-19");

    mapper.write(0x9000, 0x8f);

    expect(mapper.captureState()).toMatchObject({ prgBank: 11, prgClockHigh: true });
    expect(mapper.read(0xc000)).toBe(11);
  });

  it("resets JF-19 to its boot windows and round-trips latch state", () => {
    const cartridge = createJf19Cartridge();
    fillBanks(cartridge.prgRom, 0x4000);
    allowWritesAt(cartridge, 0x9000);
    const mapper = new JalecoJf17Mapper(cartridge, "jf-19");

    expect(mapper.captureState()).toEqual({
      kind: "jaleco-jf17",
      prgBank: 15,
      chrBank: 0,
      prgClockHigh: false,
      chrClockHigh: false,
    });

    mapper.write(0x9000, 0xcd);
    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(mapper.read(0xc000)).toBe(13);
  });

  it("accepts only JF-19's exact mapper-92 geometry", () => {
    expect(() => createMapper(createJf19Cartridge(), interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 92, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 16 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 92, prgBanks: 8, chrBanks: 16 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 92, prgBanks: 16, chrBanks: 8 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 92, prgBanks: 16 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 92,
          nes2: true,
          prgBanks: 16,
          chrBanks: 16,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 92, prgBanks: 16, chrBanks: 16, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function createJf17Cartridge() {
  return createTestCartridge({ mapper: 72, prgBanks: 8, chrBanks: 16 });
}

function createJf19Cartridge() {
  return createTestCartridge({ mapper: 92, prgBanks: 16, chrBanks: 16 });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function allowWritesAt(cartridge: ReturnType<typeof createJf17Cartridge>, address: number): void {
  const offset = address - 0x8000;
  for (let bank = 0; bank < cartridge.prgRom.byteLength / 0x4000; bank++) {
    cartridge.prgRom[bank * 0x4000 + (offset & 0x3fff)] = 0xff;
  }
}
