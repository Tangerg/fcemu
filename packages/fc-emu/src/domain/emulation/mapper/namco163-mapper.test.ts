import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { PPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Namco163Mapper", () => {
  it("maps three switchable PRG windows, a fixed tail and twelve 1 KiB CHR selectors", () => {
    const cartridge = createTestCartridge({
      mapper: 19,
      prgBanks: 32,
      chrBanks: 32,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xe000, 3);
    mapper.write(0xe800, 5);
    mapper.write(0xf000, 7);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 5, 7, 63]);

    for (let slot = 0; slot < 8; slot++) mapper.write(0x8000 + slot * 0x0800, 8 + slot);
    expect(readAt(mapper, patternSlots())).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("routes pattern and nametable pages independently between CHR and CIRAM", () => {
    const bus = new Bus(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 3,
        prgBanks: 2,
        chrBanks: 2,
        chrRamShift: 7,
      }),
    );
    fillBanks(bus.Cartridge.chrRom, 0x0400);
    const memory = new PPUMemory(bus);

    bus.Mapper.write(0x8000, 0xe1);
    memory.write(0x0012, 0x44);
    expect(bus.PPU.nameTableData[0x0412]).toBe(0x44);
    expect(memory.read(0x0012)).toBe(0x44);

    bus.Mapper.write(0xe800, 0x40);
    memory.write(0x0012, 0x55);
    expect(bus.Cartridge.readWritableChr(0x0412)).toBe(0x55);
    expect(memory.read(0x0012)).toBe(0x55);

    bus.Mapper.write(0xc000, 3);
    expect(memory.read(0x2012)).toBe(3);
    memory.write(0x2012, 0xaa);
    expect(memory.read(0x2012)).toBe(3);

    bus.Mapper.write(0xc000, 0xe0);
    memory.write(0x2012, 0x66);
    expect(bus.PPU.nameTableData[0x0012]).toBe(0x66);
    expect(memory.read(0x2012)).toBe(0x66);
  });

  it("uses a saturating shared-RAM data port and persists chip RAM without external WRAM", () => {
    const cartridge = createTestCartridge({
      mapper: 19,
      nes2: true,
      submapper: 3,
      prgBanks: 2,
      chrBanks: 1,
      battery: true,
      prgNvRamShift: 0,
    });
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xf800, 0xfe);
    mapper.writeCpuExpansion?.(0x4800, 0x11);
    mapper.writeCpuExpansion?.(0x4fff, 0x22);
    mapper.writeCpuExpansion?.(0x4800, 0x33);
    expect(cartridge.readMapperRam(0x7e)).toBe(0x11);
    expect(cartridge.readMapperRam(0x7f)).toBe(0x33);

    mapper.write(0xf800, 0xfe);
    expect(mapper.readCpuExpansion?.(0x4800)).toEqual({ value: 0x11, drivenMask: 0xff });
    expect(mapper.readCpuExpansion?.(0x4800)).toEqual({ value: 0x33, drivenMask: 0xff });
    expect(mapper.readCpuExpansion?.(0x4800)).toEqual({ value: 0x33, drivenMask: 0xff });
    expect(cartridge.captureBatterySave()?.data).toHaveLength(128);
  });

  it("protects each external 2 KiB WRAM window while keeping reads available", () => {
    const mapper = createMapper(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 3,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );

    mapper.write(0xf800, 0x40);
    for (let slot = 0; slot < 4; slot++) mapper.write(0x6000 + slot * 0x0800, 0x10 + slot);
    expect(readAt(mapper, [0x6000, 0x6800, 0x7000, 0x7800])).toEqual([0x10, 0x11, 0x12, 0x13]);

    mapper.write(0xf800, 0x45);
    for (let slot = 0; slot < 4; slot++) mapper.write(0x6000 + slot * 0x0800, 0x20 + slot);
    expect(readAt(mapper, [0x6000, 0x6800, 0x7000, 0x7800])).toEqual([0x10, 0x21, 0x12, 0x23]);
  });

  it("counts a 15-bit CPU-cycle IRQ upward, saturates and acknowledges either byte", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper(createTestCartridge({ mapper: 19, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq: (asserted) => assertions.push(asserted),
    });

    mapper.writeCpuExpansion?.(0x5000, 0xfd);
    mapper.writeCpuExpansion?.(0x5800, 0xff);
    mapper.observeCpuBusCycle?.(false);
    expect(mapper.readCpuExpansion?.(0x5000)?.value).toBe(0xfe);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.readCpuExpansion?.(0x5000)?.value).toBe(0xff);
    expect(mapper.readCpuExpansion?.(0x5800)?.value).toBe(0xff);
    mapper.observeCpuBusCycle?.(false);
    expect(mapper.readCpuExpansion?.(0x5000)?.value).toBe(0xff);
    mapper.writeCpuExpansion?.(0x5000, 0);
    expect(assertions.at(-1)).toBe(false);
  });

  it("clocks one wavetable channel every 15 cycles and honors audio routing variants", () => {
    const audible = createMapper(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 3,
        prgBanks: 2,
        chrBanks: 1,
      }),
      noopInterrupt,
    );
    configureChannelEight(audible);
    for (let cycle = 0; cycle < 14; cycle++) audible.observeCpuBusCycle?.(false);
    expect(audible.expansionAudioSample?.()).toBe(0);
    audible.observeCpuBusCycle?.(false);
    expect(audible.expansionAudioSample?.()).toBeLessThan(0);

    audible.write(0xe000, 0x40);
    expect(audible.expansionAudioSample?.()).toBe(0);

    const muted = createMapper(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 2,
        prgBanks: 2,
        chrBanks: 1,
      }),
      noopInterrupt,
    );
    configureChannelEight(muted);
    for (let cycle = 0; cycle < 15; cycle++) muted.observeCpuBusCycle?.(false);
    expect(muted.expansionAudioSample?.()).toBe(0);
  });

  it("holds each multiplexed channel voltage until the next descending channel slot", () => {
    const mapper = createMapper(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 3,
        prgBanks: 2,
        chrBanks: 1,
      }),
      noopInterrupt,
    );
    configureChannelEight(mapper);
    writeInternal(mapper, 0x76, 1);
    writeInternal(mapper, 0x77, 0x0f);
    writeInternal(mapper, 0x7f, 0x1f);

    clockCpu(mapper, 15);
    const channelEight = mapper.expansionAudioSample?.() ?? 0;
    expect(channelEight).toBeLessThan(0);
    clockCpu(mapper, 14);
    expect(mapper.expansionAudioSample?.()).toBe(channelEight);
    clockCpu(mapper, 1);
    expect(mapper.expansionAudioSample?.()).toBeGreaterThan(0);
    clockCpu(mapper, 15);
    expect(mapper.expansionAudioSample?.()).toBe(channelEight);
  });

  it("round-trips banking, data-port, audio and IRQ state transactionally", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper(
      createTestCartridge({
        mapper: 19,
        nes2: true,
        submapper: 4,
        prgBanks: 2,
        chrBanks: 1,
        prgRamShift: 7,
      }),
      { setMapperIrq: (asserted) => assertions.push(asserted) },
    );
    mapper.write(0x8000, 0xe1);
    mapper.write(0xe000, 0x43);
    mapper.write(0xe800, 0xc5);
    mapper.write(0xf000, 0xc7);
    mapper.write(0xf800, 0x42);
    mapper.writeCpuExpansion?.(0x5000, 0xf0);
    mapper.writeCpuExpansion?.(0x5800, 0xfe);
    for (let cycle = 0; cycle < 20; cycle++) mapper.observeCpuBusCycle?.(false);
    const state = mapper.captureState();
    expect(state.kind).toBe("namco-163");
    if (state.kind !== "namco-163") throw new Error("expected Namco 163 state");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, audioLevel: "12db" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, irqCounter: 0x8000 })).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({
        ...state,
        audio: { ...state.audio, autoIncrement: true },
      }),
    ).toThrowError(RangeError);
  });

  it("accepts allocated audio profiles and rejects unreachable memory geometry", () => {
    for (const submapper of [0, 1, 2, 3, 4, 5]) {
      expect(() =>
        createMapper(
          createTestCartridge({
            mapper: 19,
            nes2: true,
            submapper,
            prgBanks: 2,
            chrBanks: 1,
            battery: submapper === 1,
            prgNvRamShift: 0,
          }),
          noopInterrupt,
        ),
      ).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 19,
          nes2: true,
          submapper: 6,
          prgBanks: 2,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 19,
          nes2: true,
          submapper: 3,
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
          mapper: 19,
          nes2: true,
          submapper: 3,
          prgBanks: 2,
          chrBanks: 1,
          chrRamShift: 10,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 19,
          nes2: true,
          submapper: 3,
          prgBanks: 2,
          chrBanks: 1,
          fourScreen: true,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function configureChannelEight(mapper: Mapper): void {
  writeInternal(mapper, 0x00, 0x0f);
  writeInternal(mapper, 0x78, 1);
  writeInternal(mapper, 0x7a, 0);
  writeInternal(mapper, 0x7c, 0);
  writeInternal(mapper, 0x7e, 0);
  writeInternal(mapper, 0x7f, 0x0f);
}

function writeInternal(mapper: Mapper, address: number, value: number): void {
  mapper.write(0xf800, address);
  mapper.writeCpuExpansion?.(0x4800, value);
}

function clockCpu(mapper: Mapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle?.(false);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let offset = 0; offset < memory.byteLength; offset++) {
    memory[offset] = Math.floor(offset / bankSize) & 0xff;
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function patternSlots(): number[] {
  return Array.from({ length: 8 }, (_, slot) => slot * 0x0400);
}
