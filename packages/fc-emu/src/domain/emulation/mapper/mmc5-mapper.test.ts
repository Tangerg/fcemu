import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { PPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperState, PpuFetchContext } from "./mapper.js";

const noopInterrupt = { setMapperIrq() {} };
const backgroundName: PpuFetchContext = {
  kind: "background",
  phase: "nametable",
  tile: 0,
  visible: true,
};
const backgroundAttribute: PpuFetchContext = {
  ...backgroundName,
  phase: "attribute",
};
const backgroundPattern: PpuFetchContext = {
  ...backgroundName,
  phase: "pattern",
};
const spritePattern: PpuFetchContext = {
  kind: "sprite",
  phase: "pattern",
  slot: 0,
  visible: true,
};

describe("Mmc5Mapper", () => {
  it("implements all four PRG modes with a forced-ROM final register", () => {
    const cartridge = createTestCartridge({ mapper: 5, prgBanks: 16, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    writeExpansion(mapper, 0x5100, 3);
    for (const [address, value] of [
      [0x5114, 0x83],
      [0x5115, 0x85],
      [0x5116, 0x87],
      [0x5117, 0x89],
    ] as const) {
      writeExpansion(mapper, address, value);
    }
    expect(readAt(mapper)).toEqual([3, 5, 7, 9]);

    writeExpansion(mapper, 0x5100, 2);
    expect(readAt(mapper)).toEqual([4, 5, 7, 9]);

    writeExpansion(mapper, 0x5100, 1);
    expect(readAt(mapper)).toEqual([4, 5, 8, 9]);

    writeExpansion(mapper, 0x5100, 0);
    expect(readAt(mapper)).toEqual([8, 9, 10, 11]);
  });

  it("protects PRG RAM and follows ETROM's battery/volatile chip-select wiring", () => {
    const cartridge = createTestCartridge({
      mapper: 5,
      nes2: true,
      prgBanks: 2,
      chrBanks: 1,
      battery: true,
      prgRamShift: 7,
      prgNvRamShift: 7,
    });
    const mapper = createMapper(cartridge, noopInterrupt);

    writeExpansion(mapper, 0x5113, 0);
    mapper.write(0x6000, 0x11);
    expect(mapper.read(0x6000)).toBe(0);

    writeExpansion(mapper, 0x5102, 2);
    writeExpansion(mapper, 0x5103, 1);
    mapper.write(0x6000, 0x22);
    writeExpansion(mapper, 0x5113, 4);
    mapper.write(0x6000, 0x33);
    expect(mapper.read(0x6000)).toBe(0x33);

    writeExpansion(mapper, 0x5113, 0);
    expect(mapper.read(0x6000)).toBe(0x22);
    expect(cartridge.captureBatterySave()?.data[0]).toBe(0x22);
  });

  it("selects A/B CHR sets by fetch ownership and honors large-bank modes", () => {
    const cartridge = createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 64 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    writeExpansion(mapper, 0x5101, 3);
    writeExpansion(mapper, 0x5120, 3);
    writeExpansion(mapper, 0x5128, 5);
    mapper.observeCpuWrite?.(0x2000, 0x20);
    mapper.observeCpuWrite?.(0x2001, 0x18);
    expect(mapper.read(0, spritePattern)).toBe(3);
    expect(mapper.read(0, backgroundPattern)).toBe(5);
    expect(mapper.read(0)).toBe(5);

    mapper.observeCpuWrite?.(0x2000, 0);
    expect(mapper.read(0, backgroundPattern)).toBe(3);

    writeExpansion(mapper, 0x5101, 1);
    writeExpansion(mapper, 0x5123, 2);
    writeExpansion(mapper, 0x5127, 3);
    expect(mapper.read(0x0000, spritePattern)).toBe(8);
    expect(mapper.read(0x0c00, spritePattern)).toBe(11);
    expect(mapper.read(0x1000, spritePattern)).toBe(12);
  });

  it("routes each nametable to CIRAM, ExRAM or fill mode without header mirroring", () => {
    const bus = new Bus(createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }));
    const memory = new PPUMemory(bus);
    writeExpansion(bus.Mapper, 0x5105, 0xe4);

    memory.write(0x2012, 0x11);
    memory.write(0x2412, 0x22);
    expect(bus.PPU.nameTableData[0x0012]).toBe(0x11);
    expect(bus.PPU.nameTableData[0x0412]).toBe(0x22);

    writeExpansion(bus.Mapper, 0x5104, 2);
    writeExpansion(bus.Mapper, 0x5c12, 0x33);
    expect(memory.read(0x2812)).toBe(0);
    writeExpansion(bus.Mapper, 0x5104, 0);
    expect(memory.read(0x2812)).toBe(0x33);
    memory.write(0x2812, 0x34);
    expect(memory.read(0x2812)).toBe(0x34);

    writeExpansion(bus.Mapper, 0x5106, 0x44);
    writeExpansion(bus.Mapper, 0x5107, 2);
    expect(memory.read(0x2c12)).toBe(0x44);
    expect(memory.read(0x2fc0)).toBe(0xaa);
  });

  it("uses ExRAM extended attributes for per-tile palettes and 4 KiB CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 128 });
    const mapper = createMapper(cartridge, noopInterrupt);
    writeExpansion(mapper, 0x5104, 2);
    writeExpansion(mapper, 0x5c12, 0x83);
    writeExpansion(mapper, 0x5104, 1);
    writeExpansion(mapper, 0x5130, 1);
    mapper.observeCpuWrite?.(0x2001, 0x18);
    cartridge.chrRom[67 * 0x1000 + 0x25] = 0x5a;

    mapper.readNametable?.(0x2012, backgroundName);
    expect(mapper.readNametable?.(0x23c0, backgroundAttribute)).toBe(0xaa);
    expect(mapper.read(0x0025, backgroundPattern)).toBe(0x5a);
  });

  it("aligns vertical-split ExRAM columns and applies its independent vertical scroll", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }),
      noopInterrupt,
    );
    writeExpansion(mapper, 0x5104, 2);
    writeExpansion(mapper, 0x5c20, 0x42);
    writeExpansion(mapper, 0x5104, 0);
    writeExpansion(mapper, 0x5200, 0x88);
    writeExpansion(mapper, 0x5201, 8);
    mapper.observeCpuWrite?.(0x2001, 0x18);

    expect(mapper.readNametable?.(0x2000, backgroundName)).toBe(0x42);
    const state = mapper.captureState();
    expect(state.kind === "mmc5" && state.splitFineY).toBe(0);
    expect(state.kind === "mmc5" && state.splitY).toBe(8);

    writeExpansion(mapper, 0x5104, 2);
    writeExpansion(mapper, 0x5fc0, 0x66);
    writeExpansion(mapper, 0x5104, 0);
    writeExpansion(mapper, 0x5201, 240);
    expect(mapper.readNametable?.(0x2000, backgroundName)).toBe(0x66);
    const wrappedState = mapper.captureState();
    expect(wrappedState.kind === "mmc5" && wrappedState.splitY).toBe(240);
  });

  it("generates scanline, hardware-timer and PCM IRQs independently", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper(createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq: (asserted) => assertions.push(asserted),
    });

    writeExpansion(mapper, 0x5203, 1);
    writeExpansion(mapper, 0x5204, 0x80);
    mapper.observePpuRead?.(0x23c0, backgroundAttribute);
    mapper.observePpuRead?.(0x23c0, backgroundAttribute);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.readCpuExpansion?.(0x5204)).toEqual({ value: 0xc0, drivenMask: 0xc0 });
    expect(assertions.at(-1)).toBe(false);

    writeExpansion(mapper, 0x520a, 0);
    writeExpansion(mapper, 0x5209, 2);
    clockCpu(mapper, 2);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.readCpuExpansion?.(0x5209)).toEqual({ value: 0x80, drivenMask: 0x80 });

    writeExpansion(mapper, 0x5010, 0x80);
    writeExpansion(mapper, 0x5011, 0);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.readCpuExpansion?.(0x5010)).toEqual({ value: 0x81, drivenMask: 0x81 });
    expect(assertions.at(-1)).toBe(false);
  });

  it("provides immediate multiplication and audible pulse/PCM output", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }),
      noopInterrupt,
    );
    writeExpansion(mapper, 0x5205, 13);
    writeExpansion(mapper, 0x5206, 17);
    expect(mapper.readCpuExpansion?.(0x5205)?.value).toBe(221);
    expect(mapper.readCpuExpansion?.(0x5206)?.value).toBe(0);

    writeExpansion(mapper, 0x5015, 1);
    writeExpansion(mapper, 0x5000, 0xdf);
    writeExpansion(mapper, 0x5003, 0);
    expect(mapper.expansionAudioSample?.()).toBeLessThan(0);
    const pulseOnly = mapper.expansionAudioSample?.() ?? 0;
    writeExpansion(mapper, 0x5011, 0x40);
    expect(mapper.expansionAudioSample?.()).toBeLessThan(pulseOnly);
  });

  it("clocks pulse envelopes and the MMC5 length table at M2 divided by 7424", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }),
      noopInterrupt,
    );
    writeExpansion(mapper, 0x5015, 1);
    writeExpansion(mapper, 0x5003, 0);
    clockCpu(mapper, 7423);
    expect(pulseLength(mapper)).toBe(10);
    clockCpu(mapper, 1);
    expect(pulseLength(mapper)).toBe(9);

    writeExpansion(mapper, 0x5003, 0x1c << 3);
    expect(pulseLength(mapper)).toBe(0x10);
  });

  it("round-trips every volatile board device and rejects malformed state", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1 }),
      noopInterrupt,
    );
    writeExpansion(mapper, 0x5100, 1);
    writeExpansion(mapper, 0x5120, 3);
    writeExpansion(mapper, 0x5104, 2);
    writeExpansion(mapper, 0x5c00, 0x55);
    writeExpansion(mapper, 0x5015, 1);
    writeExpansion(mapper, 0x5000, 0xdf);
    writeExpansion(mapper, 0x5003, 0);
    const state = mapper.captureState();

    mapper.reset?.();
    const resetState = mapper.captureState();
    if (state.kind !== "mmc5" || resetState.kind !== "mmc5") throw new Error("expected MMC5 state");
    expect(resetState).toMatchObject({
      prgMode: 3,
      prgRamProtect1: 1,
      prgRamProtect2: 2,
      exRamMode: 3,
      chrBanksA: state.chrBanksA,
      audio: { pulses: state.audio.pulses },
    });

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, prgMode: 4 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({
        ...state,
        audio: { ...state.audio, enabledMask: 4 },
      }),
    ).toThrowError(RangeError);
  });

  it("accepts physical MMC5 board geometries and rejects unreachable variants", () => {
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 5, nes2: true, prgBanks: 2, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 5,
          nes2: true,
          prgBanks: 2,
          chrBanks: 1,
          prgRamShift: 8,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 5,
          nes2: true,
          submapper: 1,
          prgBanks: 2,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 5, prgBanks: 2, chrBanks: 1, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function writeExpansion(mapper: Mapper, address: number, value: number): void {
  mapper.writeCpuExpansion?.(address, value);
}

function readAt(mapper: Mapper): number[] {
  return [0x8000, 0xa000, 0xc000, 0xe000].map((address) => mapper.read(address));
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let offset = 0; offset < memory.byteLength; offset++) {
    memory[offset] = Math.floor(offset / bankSize) & 0xff;
  }
}

function clockCpu(mapper: Mapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle?.(false);
}

function pulseLength(mapper: Mapper): number {
  const state = mapper.captureState();
  if (state.kind !== "mmc5") throw new Error("expected MMC5 state");
  return state.audio.pulses[0]?.length ?? -1;
}
