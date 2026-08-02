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

describe("Vrc6Mapper", () => {
  it("maps switchable 16/8 KiB PRG windows, the fixed tail and gated 8 KiB WRAM", () => {
    const cartridge = createTestCartridge({ mapper: 26, prgBanks: 16, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8003, 3);
    mapper.write(0xc002, 5);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([6, 7, 5, 31]);

    mapper.write(0x6000, 0x11);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    mapper.write(0xb003, 0xa0);
    mapper.write(0x6000, 0x5a);
    expect(mapper.read(0x6000)).toBe(0x5a);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0xff);
    mapper.write(0xb003, 0x20);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
  });

  it("keeps VRC6a's absent WRAM window open even when $B003 enables it", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 24, prgBanks: 16, chrBanks: 16 }),
      noopInterrupt,
    );

    mapper.write(0xb003, 0xa0);
    mapper.write(0x6000, 0x5a);

    expect(mapper.read(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask?.(0x7fff)).toBe(0);
  });

  it("swaps only A0/A1 on VRC6b and honors the common F003 mirror mask", () => {
    const mapper24 = createMapper(
      createTestCartridge({ mapper: 24, prgBanks: 2, chrBanks: 4 }),
      noopInterrupt,
    );
    const mapper26 = createMapper(
      createTestCartridge({ mapper: 26, prgBanks: 2, chrBanks: 4 }),
      noopInterrupt,
    );

    mapper24.write(0xde69, 0x11);
    mapper26.write(0xde6a, 0x22);
    expect(mapper24.captureState()).toMatchObject({ chrBanks: [0, 0x11, 0, 0, 0, 0, 0, 0] });
    expect(mapper26.captureState()).toMatchObject({ chrBanks: [0, 0x22, 0, 0, 0, 0, 0, 0] });

    mapper24.write(0x9001, 0x34);
    mapper24.write(0x9002, 0x82);
    mapper26.write(0x9002, 0x56);
    mapper26.write(0x9001, 0x83);
    expect(mapper24.captureState()).toMatchObject({
      audio: { pulse1: { period: 0x234, enabled: true } },
    });
    expect(mapper26.captureState()).toMatchObject({
      audio: { pulse1: { period: 0x356, enabled: true } },
    });
  });

  it("routes all documented 8/4/2 KiB pattern modes and the CHR A10 override", () => {
    const cartridge = createTestCartridge({ mapper: 24, prgBanks: 2, chrBanks: 32 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    for (let register = 0; register < 8; register++) {
      mapper.write(register < 4 ? 0xd000 + register : 0xe000 + (register - 4), 8 + register * 4);
    }
    mapper.write(0xb003, 0x20);
    expect(readAt(mapper, patternSlots())).toEqual([8, 12, 16, 20, 24, 28, 32, 36]);

    mapper.write(0xb003, 0x21);
    expect(readAt(mapper, patternSlots())).toEqual([8, 9, 12, 13, 16, 17, 20, 21]);

    mapper.write(0xb003, 0x22);
    expect(readAt(mapper, patternSlots())).toEqual([8, 12, 16, 20, 24, 25, 28, 29]);

    mapper.write(0xb003, 0x02);
    expect(readAt(mapper, patternSlots())).toEqual([8, 12, 16, 20, 24, 24, 28, 28]);
  });

  it("derives CIRAM routing from every conventional and direct-register nametable mode", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 24, prgBanks: 2, chrBanks: 4 }),
      noopInterrupt,
    );
    mapper.write(0xe002, 0);
    mapper.write(0xe003, 1);

    for (const [mode, expected] of [
      [0x20, [0, 1, 0, 1]],
      [0x24, [0, 0, 1, 1]],
      [0x28, [0, 0, 0, 0]],
      [0x2c, [1, 1, 1, 1]],
    ] as const) {
      mapper.write(0xb003, mode);
      expect(nametablePages(mapper)).toEqual(expected);
    }

    mapper.write(0xe000, 1);
    mapper.write(0xe001, 0);
    mapper.write(0xe002, 1);
    mapper.write(0xe003, 0);
    mapper.write(0xb003, 0x21);
    expect(nametablePages(mapper)).toEqual([1, 0, 1, 0]);

    mapper.write(0xb003, 0x01);
    expect(nametablePages(mapper)).toEqual([1, 0, 1, 0]);
  });

  it("uses selected CHR pages as read-only nametables when the board output is enabled", () => {
    const cartridge = createTestCartridge({ mapper: 24, prgBanks: 2, chrBanks: 4 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);
    for (let register = 0; register < 4; register++) mapper.write(0xe000 + register, 5 + register);
    mapper.write(0xb003, 0x31);

    expect(
      [0x2000, 0x2400, 0x2800, 0x2c00].map((address) => mapper.readNametable?.(address)),
    ).toEqual([5, 6, 7, 8]);
    expect(mapper.mapNametableAddress?.(0x2000)).toBeUndefined();
    expect(mapper.writeNametable?.(0x2000, 0xaa)).toBe(true);
  });

  it("shares the byte-wide VRC IRQ while preserving variant-specific control ports", () => {
    const assertions24: boolean[] = [];
    const mapper24 = createIrqMapper(24, assertions24);
    mapper24.write(0xf000, 0xfe);
    mapper24.write(0xf001, 0x07);
    mapper24.observeCpuBusCycle?.(false);
    expect(assertions24.at(-1)).toBe(false);
    mapper24.observeCpuBusCycle?.(false);
    expect(assertions24.at(-1)).toBe(true);
    mapper24.write(0xf002, 0);
    expect(assertions24.at(-1)).toBe(false);

    const assertions26: boolean[] = [];
    const mapper26 = createIrqMapper(26, assertions26);
    mapper26.write(0xf000, 0xff);
    mapper26.write(0xf002, 0x06);
    mapper26.observeCpuBusCycle?.(false);
    expect(assertions26.at(-1)).toBe(true);
    mapper26.write(0xf001, 0);
    expect(assertions26.at(-1)).toBe(false);
  });

  it("mixes the cartridge DAC into the APU sample path before the analog filters", () => {
    const bus = new Bus(createTestCartridge({ mapper: 24, prgBanks: 2, chrBanks: 1 }));
    const samples: number[] = [];
    bus.APU.addListener((sample) => {
      samples.push(sample);
    });
    bus.Mapper.write(0x9000, 0x8f);
    bus.Mapper.write(0x9002, 0x80);

    for (let cycle = 0; cycle < 100; cycle++) bus.APU.update();

    expect(samples.length).toBeGreaterThan(0);
    expect(samples.some((sample) => sample < -0.1)).toBe(true);
  });

  it("round-trips banking, audio phase and IRQ phase while rejecting other boards", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(24, assertions);
    mapper.write(0x8000, 3);
    mapper.write(0xc000, 5);
    mapper.write(0xd001, 7);
    mapper.write(0xb003, 0xa5);
    mapper.write(0x9000, 0x8f);
    mapper.write(0x9001, 3);
    mapper.write(0x9002, 0x80);
    mapper.write(0xf000, 0xfc);
    mapper.write(0xf001, 7);
    mapper.observeCpuBusCycle?.(false);
    const state = mapper.captureState();
    expect(state.kind).toBe("vrc6");
    if (state.kind !== "vrc6") throw new Error("expected VRC6 state");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, board: "vrc6b" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({ ...state, chrBanks: [0, 0, 0, 0, 0, 0, 0, 0x100] }),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({
        ...state,
        audio: { ...state.audio, frequencyControl: 8 },
      }),
    ).toThrowError(RangeError);
    const beforeInvalidRestore = mapper.captureState();
    expect(() =>
      mapper.restoreState({
        ...state,
        audio: { ...state.audio, frequencyControl: 1 },
        irq: { ...state.irq, prescaler: 0 },
      }),
    ).toThrowError(RangeError);
    expect(mapper.captureState()).toEqual(beforeInvalidRestore);
  });

  it("accepts only the VRC6's reachable ROM, RAM and nametable geometry", () => {
    for (const options of [
      { mapper: 24, prgBanks: 1, chrBanks: 1 },
      { mapper: 26, prgBanks: 16, chrBanks: 32 },
      { mapper: 24, nes2: true, prgBanks: 2, chrBanks: 1 },
      {
        mapper: 26,
        nes2: true,
        prgBanks: 2,
        chrBanks: 1,
        battery: true,
        prgNvRamShift: 7,
      },
    ] as const) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 24,
          nes2: true,
          submapper: 1,
          prgBanks: 2,
          chrBanks: 1,
          prgRamShift: 7,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    for (const options of [
      { mapper: 24, nes2: true, prgBanks: 17, chrBanks: 1 },
      { mapper: 24, nes2: true, prgBanks: 2, chrBanks: 33 },
      { mapper: 24, nes2: true, prgBanks: 2, chrBanks: 1, prgRamShift: 7 },
      { mapper: 26, nes2: true, prgBanks: 2, chrBanks: 1 },
      { mapper: 24, nes2: true, prgBanks: 2, chrRamShift: 7, prgRamShift: 7 },
      {
        mapper: 24,
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

function createIrqMapper(mapperNumber: 24 | 26, assertions: boolean[]): Mapper {
  return createMapper(createTestCartridge({ mapper: mapperNumber, prgBanks: 2, chrBanks: 1 }), {
    setMapperIrq(asserted) {
      assertions.push(asserted);
    },
  });
}

function patternSlots(): number[] {
  return [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00];
}

function nametablePages(mapper: Mapper): number[] {
  return [0x2000, 0x2400, 0x2800, 0x2c00].map(
    (address) => (mapper.mapNametableAddress?.(address) ?? 0) >>> 10,
  );
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank & 0xff, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Pick<Mapper, "read">, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
