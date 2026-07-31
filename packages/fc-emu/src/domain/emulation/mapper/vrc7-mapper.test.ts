import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Vrc7Mapper", () => {
  it("maps three switchable PRG windows, a fixed tail and eight 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 85, prgBanks: 32, chrBanks: 32 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8000, 3);
    mapper.write(0x8010, 5);
    mapper.write(0x9000, 7);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 5, 7, 63]);

    for (let slot = 0; slot < 8; slot++) {
      const page = 0xa000 + (slot >>> 1) * 0x1000;
      mapper.write(page + (slot & 1 ? 0x10 : 0), 8 + slot);
    }
    expect(readAt(mapper, patternSlots())).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("uses A3 on VRC7b, A4 on VRC7a and either line for legacy images", () => {
    const legacy = createMapper(createTestCartridge({ mapper: 85, prgBanks: 4 }), noopInterrupt);
    const vrc7b = createMapper(
      createTestCartridge({
        mapper: 85,
        nes2: true,
        submapper: 1,
        prgBanks: 4,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );
    const vrc7a = createMapper(
      createTestCartridge({
        mapper: 85,
        nes2: true,
        submapper: 2,
        prgBanks: 4,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );

    legacy.write(0x8008, 1);
    legacy.write(0x8010, 2);
    vrc7b.write(0x8008, 3);
    vrc7a.write(0x8010, 4);
    expect(legacy.captureState()).toMatchObject({ prgBanks: [0, 2, 0] });
    expect(vrc7b.captureState()).toMatchObject({ board: "vrc7b", prgBanks: [0, 3, 0] });
    expect(vrc7a.captureState()).toMatchObject({ board: "vrc7a", prgBanks: [0, 4, 0] });

    vrc7b.write(0xa008, 0x21);
    vrc7a.write(0xa010, 0x32);
    expect(vrc7b.captureState()).toMatchObject({ chrBanks: [0, 0x21, 0, 0, 0, 0, 0, 0] });
    expect(vrc7a.captureState()).toMatchObject({ chrBanks: [0, 0x32, 0, 0, 0, 0, 0, 0] });
  });

  it("gates WRAM and implements all four CIRAM arrangements from E000", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 85, prgBanks: 2, chrBanks: 1 }),
      noopInterrupt,
    );
    mapper.write(0x6000, 0x11);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    mapper.write(0xe000, 0x80);
    mapper.write(0x6000, 0x5a);
    expect(mapper.read(0x6000)).toBe(0x5a);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0xff);

    for (const [mode, expected] of [
      [0, [0, 1, 0, 1]],
      [1, [0, 0, 1, 1]],
      [2, [0, 0, 0, 0]],
      [3, [1, 1, 1, 1]],
    ] as const) {
      mapper.write(0xe000, 0x80 | mode);
      expect(nametablePages(mapper)).toEqual(expected);
    }
  });

  it("banks writable CHR memory through the same byte-wide registers", () => {
    const cartridge = createTestCartridge({
      mapper: 85,
      nes2: true,
      prgBanks: 2,
      chrRamShift: 8,
      prgRamShift: 7,
    });
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xa010, 3);
    mapper.write(0x0400, 0x6c);
    mapper.write(0xa010, 0);
    expect(mapper.read(0x0400)).toBe(0);
    mapper.write(0xa010, 3);
    expect(mapper.read(0x0400)).toBe(0x6c);
  });

  it("shares the VRC IRQ with board-specific latch and acknowledge ports", () => {
    const assertionsA: boolean[] = [];
    const mapperA = createIrqMapper(2, assertionsA);
    mapperA.write(0xe010, 0xfe);
    mapperA.write(0xf000, 0x07);
    mapperA.observeCpuBusCycle?.(false);
    expect(assertionsA.at(-1)).toBe(false);
    mapperA.observeCpuBusCycle?.(false);
    expect(assertionsA.at(-1)).toBe(true);
    mapperA.write(0xf010, 0);
    expect(assertionsA.at(-1)).toBe(false);

    const assertionsB: boolean[] = [];
    const mapperB = createIrqMapper(1, assertionsB);
    mapperB.write(0xe008, 0xff);
    mapperB.write(0xf000, 0x06);
    mapperB.observeCpuBusCycle?.(false);
    expect(assertionsB.at(-1)).toBe(true);
    mapperB.write(0xf008, 0);
    expect(assertionsB.at(-1)).toBe(false);
  });

  it("mixes VRC7a FM before the APU filters while VRC7b remains physically silent", () => {
    const mapperA = createMapper(
      createTestCartridge({
        mapper: 85,
        nes2: true,
        submapper: 2,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );
    startTone(mapperA);
    for (let cycle = 0; cycle < 36 * 600; cycle++) mapperA.observeCpuBusCycle?.(false);
    expect(mapperA.expansionAudioSample?.()).not.toBe(0);

    const mapperB = createMapper(
      createTestCartridge({
        mapper: 85,
        nes2: true,
        submapper: 1,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );
    startTone(mapperB);
    for (let cycle = 0; cycle < 36 * 600; cycle++) mapperB.observeCpuBusCycle?.(false);
    expect(mapperB.expansionAudioSample?.()).toBe(0);

    const bus = new Bus(
      createTestCartridge({
        mapper: 85,
        nes2: true,
        submapper: 2,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
      }),
    );
    startTone(bus.Mapper);
    const samples: number[] = [];
    bus.APU.addListener((sample) => {
      samples.push(sample);
    });
    for (let cycle = 0; cycle < 36 * 700; cycle++) {
      bus.Mapper.observeCpuBusCycle?.(false);
      bus.APU.update();
    }
    expect(samples.some((sample) => sample !== 0)).toBe(true);
  });

  it("round-trips banking, FM and IRQ state while rejecting another PCB", () => {
    const mapper = createIrqMapper(2, []);
    mapper.write(0x8000, 3);
    mapper.write(0x8010, 4);
    mapper.write(0xa010, 7);
    mapper.write(0xe000, 0x81);
    mapper.write(0xe010, 0xfc);
    mapper.write(0xf000, 7);
    startTone(mapper);
    for (let cycle = 0; cycle < 77; cycle++) mapper.observeCpuBusCycle?.(false);
    const state = mapper.captureState();
    expect(state.kind).toBe("vrc7");
    if (state.kind !== "vrc7") throw new Error("expected VRC7 state");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, board: "vrc7b" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, prgBanks: [0, 0, 0x40] })).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, control: state.control | 0x40 })).toThrowError(
      RangeError,
    );
  });

  it("accepts only allocated variants and reachable ROM, RAM and nametable geometry", () => {
    for (const options of [
      { mapper: 85, prgBanks: 2, chrBanks: 1 },
      { mapper: 85, prgBanks: 32, chrBanks: 32 },
      {
        mapper: 85,
        nes2: true,
        submapper: 1,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 0,
      },
      {
        mapper: 85,
        nes2: true,
        submapper: 2,
        prgBanks: 2,
        chrRamShift: 7,
        prgRamShift: 7,
      },
    ] as const) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 85,
          nes2: true,
          submapper: 3,
          prgBanks: 2,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    for (const options of [
      { mapper: 85, nes2: true, prgBanks: 1, chrBanks: 1, prgRamShift: 7 },
      { mapper: 85, nes2: true, prgBanks: 33, chrBanks: 1, prgRamShift: 7 },
      { mapper: 85, nes2: true, prgBanks: 2, chrBanks: 33, prgRamShift: 7 },
      { mapper: 85, nes2: true, prgBanks: 2, chrBanks: 1, prgRamShift: 5 },
      {
        mapper: 85,
        nes2: true,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
        fourScreen: true,
      },
    ] as const) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function startTone(mapper: Mapper): void {
  mapper.write(0x9010, 0x10);
  mapper.write(0x9030, 0xff);
  mapper.write(0x9010, 0x20);
  mapper.write(0x9030, 0x19);
  mapper.write(0x9010, 0x30);
  mapper.write(0x9030, 0x10);
}

function createIrqMapper(submapper: 1 | 2, assertions: boolean[]): Mapper {
  return createMapper(
    createTestCartridge({
      mapper: 85,
      nes2: true,
      submapper,
      prgBanks: 2,
      chrBanks: 1,
      prgRamShift: 7,
    }),
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
  );
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let offset = 0; offset < memory.length; offset += bankSize) {
    memory.fill(offset / bankSize, offset, offset + bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function patternSlots(): number[] {
  return Array.from({ length: 8 }, (_, slot) => slot * 0x0400);
}

function nametablePages(mapper: Mapper): number[] {
  return [0x2000, 0x2400, 0x2800, 0x2c00].map(
    (address) => (mapper.mapNametableAddress?.(address) ?? 0) >>> 10,
  );
}
