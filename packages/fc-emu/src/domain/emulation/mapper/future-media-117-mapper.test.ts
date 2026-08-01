import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { FutureMedia117Mapper } from "./future-media-117-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("FutureMedia117Mapper", () => {
  it("powers up on the final four PRG banks and the first eight CHR banks", () => {
    const cartridge = createMapper117Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new FutureMedia117Mapper(noopInterrupt, cartridge);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([28, 29, 30, 31]);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("maps four exact PRG registers and eight exact CHR registers", () => {
    const cartridge = createMapper117Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new FutureMedia117Mapper(noopInterrupt, cartridge);

    for (let slot = 0; slot < 4; slot++) mapper.write(0x8000 + slot, slot + 1);
    for (let slot = 0; slot < 8; slot++) mapper.write(0xa000 + slot, 0x20 + slot);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([1, 2, 3, 4]);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);

    const beforeAliases = mapper.captureState();
    for (const address of [0x8004, 0x8fff, 0x9000, 0xa008, 0xafff, 0xb000]) {
      mapper.write(address, 0x55);
    }
    expect(mapper.captureState()).toEqual(beforeAliases);

    mapper.write(0x0000, 0xaa);
    expect(mapper.read(0x0000)).toBe(32);
  });

  it("leaves the entire $6000-$7FFF range electrically open", () => {
    const bus = new Bus(createMapper117Cartridge());
    const memory = new CPUMemory(bus);

    expect(bus.Mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    expect(bus.Mapper.cpuReadDriveMask?.(0x7fff)).toBe(0);
    memory.write(0x0000, 0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
    memory.write(0x0000, 0x5a);
    expect(memory.read(0x7fff)).toBe(0x5a);
  });

  it("selects vertical or horizontal mirroring with $D000 D0", () => {
    const cartridge = createMapper117Cartridge();
    const mapper = new FutureMedia117Mapper(noopInterrupt, cartridge);

    mapper.write(0xd000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.write(0xd000, 0xfe);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    const state = mapper.captureState();
    mapper.write(0xd001, 1);
    expect(mapper.captureState()).toEqual(state);
  });

  it("counts qualified A12 rises and disarms after a one-shot IRQ", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0xc001, 2);
    mapper.write(0xc003, 0);
    mapper.write(0xe000, 1);

    clockQualifiedA12Edge(mapper);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqArmed: true });
    expect(assertions.at(-1)).toBe(false);

    clockQualifiedA12Edge(mapper);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0,
      irqArmed: false,
      irqPending: true,
    });
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xc002, 0xff);
    clockQualifiedA12Edge(mapper);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqPending: false });
    expect(assertions.at(-1)).toBe(false);

    mapper.write(0xc003, 0);
    clockQualifiedA12Edge(mapper);
    clockQualifiedA12Edge(mapper);
    expect(assertions.at(-1)).toBe(true);
  });

  it("requires ten low PPU cycles and both independent IRQ gates", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0xc001, 1);
    mapper.write(0xc003, 0);

    clockQualifiedA12Edge(mapper);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqArmed: true });

    mapper.write(0xe000, 1);
    clockA12Edge(mapper, 9);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqPending: false });
    clockQualifiedA12Edge(mapper);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqPending: true });
    expect(assertions.at(-1)).toBe(true);
  });

  it("acknowledges through $C002 or $E000 without changing the loaded counter", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0xc001, 1);
    mapper.write(0xc003, 0);
    mapper.write(0xe000, 1);
    clockQualifiedA12Edge(mapper);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xc002, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqEnabled: true, irqCounter: 0 });

    mapper.write(0xc003, 0);
    clockQualifiedA12Edge(mapper);
    mapper.write(0xe000, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqEnabled: false, irqCounter: 0 });
  });

  it("round-trips raw registers and edge timing while rejecting malformed state atomically", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0x8000, 0xfe);
    mapper.write(0xa007, 0xfd);
    mapper.write(0xd000, 1);
    mapper.write(0xc001, 2);
    mapper.write(0xc003, 0);
    mapper.write(0xe000, 1);
    clockQualifiedA12Edge(mapper);
    const state = mapper.captureState();
    if (state.kind !== "future-media-117") throw new Error("Unexpected mapper state kind");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    for (const invalid of [
      { ...state, prgBanks: [0, 1, 2] },
      { ...state, chrBanks: [0, 1, 2, 3, 4, 5, 6, 256] },
      { ...state, irqCounter: 256 },
      { ...state, a12LowSince: state.ppuClock + 1 },
      { ...state, mirroring: NametableMirroring.SingleScreenLower },
    ]) {
      expect(() => mapper.restoreState(invalid as MapperState)).toThrow(RangeError);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("preserves mapper registers across warm reset and restores them on cold power", () => {
    const bus = new Bus(createMapper117Cartridge());
    bus.Mapper.write(0x8000, 3);
    bus.Mapper.write(0xa000, 4);
    bus.Mapper.write(0xd000, 1);
    const warmState = bus.Mapper.captureState();

    bus.reset();
    expect(bus.Mapper.captureState()).toEqual(warmState);

    bus.powerOn();
    expect(bus.Mapper.captureState()).toMatchObject({
      kind: "future-media-117",
      prgBanks: [0xfc, 0xfd, 0xfe, 0xff],
      chrBanks: [0, 1, 2, 3, 4, 5, 6, 7],
      irqEnabled: false,
      irqArmed: false,
    });
  });

  it.each([
    { name: "Crayon Shin-chan geometry", prgBanks: 8 },
    { name: "San Guo Zhi IV geometry", prgBanks: 16 },
  ])("accepts the known $name", ({ prgBanks }) => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 117, prgBanks, chrBanks: 32 }), noopInterrupt),
    ).not.toThrow();
  });

  it.each([
    {
      name: "unknown submapper",
      options: { mapper: 117, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 32 },
      error: UnsupportedMapperVariantError,
    },
    {
      name: "64 KiB PRG ROM",
      options: { mapper: 117, prgBanks: 4, chrBanks: 32 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "512 KiB PRG ROM",
      options: { mapper: 117, prgBanks: 32, chrBanks: 32 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "128 KiB CHR ROM",
      options: { mapper: 117, prgBanks: 16, chrBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "CHR RAM",
      options: { mapper: 117, prgBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "NES 2.0 PRG RAM",
      options: {
        mapper: 117,
        nes2: true,
        prgBanks: 16,
        chrBanks: 32,
        prgRamShift: 7,
      },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 117, prgBanks: 16, chrBanks: 32, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(error);
  });
});

function createMapper117Cartridge() {
  return createTestCartridge({ mapper: 117, prgBanks: 16, chrBanks: 32 });
}

function createIrqMapper(assertions: boolean[]): FutureMedia117Mapper {
  const port: MapperInterruptPort = {
    setMapperIrq(asserted) {
      assertions.push(asserted);
    },
  };
  return new FutureMedia117Mapper(port, createMapper117Cartridge());
}

function clockQualifiedA12Edge(mapper: Mapper): void {
  clockA12Edge(mapper, 10);
}

function clockA12Edge(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0fff);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
