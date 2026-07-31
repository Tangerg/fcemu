import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory, PPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("basic ASIC mappers", () => {
  it("maps Irem G-101 PRG modes and all eight 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 32, prgBanks: 8, chrBanks: 4 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, interruptPort);
    mapper.powerOn();

    mapper.write(0x8000, 2);
    mapper.write(0xa000, 3);
    for (let slot = 0; slot < 8; slot++) mapper.write(0xb000 + slot, 8 + slot);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([2, 3, 14, 15]);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);

    mapper.write(0x9000, 0x03);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([14, 3, 2, 15]);
  });

  it("models Mapper 32 submapper 1 as fixed-upper one-screen Major League wiring", () => {
    const cartridge = createTestCartridge({
      mapper: 32,
      nes2: true,
      submapper: 1,
      prgBanks: 4,
      chrBanks: 1,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, interruptPort);
    mapper.powerOn();

    mapper.write(0x8000, 2);
    mapper.write(0x9000, 0x03);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([2, 6]);
  });

  it("maps Sunsoft-4 pattern, PRG and gated PRG-RAM banks", () => {
    const cartridge = createTestCartridge({ mapper: 68, prgBanks: 16, chrBanks: 32 });
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x0800);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    for (let slot = 0; slot < 4; slot++) bus.Mapper.write(0x8000 + slot * 0x1000, 4 + slot);
    bus.Mapper.write(0xf000, 3);

    expect(readAt(bus.Mapper, [0x0000, 0x0800, 0x1000, 0x1800])).toEqual([4, 5, 6, 7]);
    expect(readAt(bus.Mapper, [0x8000, 0xc000])).toEqual([3, 15]);

    memory.write(0, 0x5a);
    expect(memory.read(0x6000)).toBe(0x5a);
    bus.Mapper.write(0xf000, 0x13);
    memory.write(0x6000, 0xa5);
    expect(memory.read(0x6000)).toBe(0xa5);
    bus.Mapper.write(0xf000, 3);
    expect(memory.read(0x6000)).toBe(0xa5);
  });

  it("routes Sunsoft-4 nametables through CIRAM or the final 128 KiB of CHR ROM", () => {
    const cartridge = createTestCartridge({ mapper: 68, prgBanks: 8, chrBanks: 32 });
    cartridge.chrRom[0x80 * 0x0400 + 0x12] = 0x41;
    cartridge.chrRom[0x81 * 0x0400 + 0x12] = 0x52;
    const bus = new Bus(cartridge);
    const memory = new PPUMemory(bus);

    bus.Mapper.write(0xe000, 0x00);
    memory.write(0x2012, 0x11);
    memory.write(0x2412, 0x22);
    expect(memory.read(0x2812)).toBe(0x11);
    expect(memory.read(0x2c12)).toBe(0x22);

    bus.Mapper.write(0xc000, 0);
    bus.Mapper.write(0xd000, 1);
    bus.Mapper.write(0xe000, 0x10);
    expect(readPpuAt(memory, [0x2012, 0x2412, 0x2812, 0x2c12])).toEqual([0x41, 0x52, 0x41, 0x52]);

    memory.write(0x2012, 0xff);
    expect(memory.read(0x2012)).toBe(0x41);
    bus.Mapper.write(0xe000, 0x13);
    expect(memory.read(0x2012)).toBe(0x52);
  });

  it("delivers Mapper 79 writes only through the decoded CPU expansion addresses", () => {
    const cartridge = createTestCartridge({ mapper: 79, prgBanks: 4, chrBanks: 8 });
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x4000, 0x0d);
    expect(readAt(bus.Mapper, [0x8000, 0x0000])).toEqual([0, 0]);
    memory.write(0x4100, 0x0d);
    expect(readAt(bus.Mapper, [0x8000, 0x0000])).toEqual([1, 5]);
    memory.write(0x4200, 0x02);
    expect(readAt(bus.Mapper, [0x8000, 0x0000])).toEqual([1, 5]);
  });

  it("maps TAM-S1's fixed-last lower window, switchable upper window and mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 97, prgBanks: 16 });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, interruptPort);
    mapper.powerOn();

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([15, 15]);
    mapper.write(0x8000, 0x83);

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([15, 3]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0x0010, 0x66);
    expect(mapper.read(0x0010)).toBe(0x66);
  });

  it.each([
    { mapperNumber: 32, options: { mapper: 32, prgBanks: 8, chrBanks: 2 } },
    { mapperNumber: 68, options: { mapper: 68, prgBanks: 8, chrBanks: 32 } },
    { mapperNumber: 79, options: { mapper: 79, prgBanks: 4, chrBanks: 8 } },
    { mapperNumber: 97, options: { mapper: 97, prgBanks: 16 } },
  ])("round-trips Mapper $mapperNumber state", ({ options }) => {
    const mapper = createMapper(createTestCartridge(options), interruptPort);
    mapper.powerOn();
    if (options.mapper === 79) mapper.writeCpuExpansion?.(0x4100, 0x0d);
    else {
      mapper.write(0x8000, 3);
      mapper.write(0x9000, 1);
    }
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
  });

  it("creates both known Mapper 48 IRQ revisions and rejects unknown submappers", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 48, prgBanks: 8, chrBanks: 8 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 48,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 8,
        }),
        interruptPort,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 48,
          nes2: true,
          submapper: 2,
          prgBanks: 8,
          chrBanks: 8,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
  });

  it("fails closed on Mapper 48/65 memory the physical boards cannot reach", () => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 48,
          nes2: true,
          prgBanks: 8,
          chrBanks: 8,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 4, fourScreen: true }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 65,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 4,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
  });

  it("creates Taito X1 boards only with their physical internal-memory layouts", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 80, prgBanks: 8, chrBanks: 4 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 82, battery: true, prgBanks: 8, chrBanks: 4 }),
        interruptPort,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 82, prgBanks: 8, chrBanks: 4 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 80,
          nes2: true,
          prgBanks: 8,
          chrBanks: 4,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });

  it("rejects invalid state that cannot exist on the selected boards", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 68, prgBanks: 8, chrBanks: 32 }),
      interruptPort,
    );
    mapper.powerOn();
    const state = mapper.captureState();
    if (state.kind !== "sunsoft-4") throw new Error("Expected Sunsoft-4 state");

    expect(() =>
      mapper.restoreState({ ...state, nametableBanks: [0x80, 0] } as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, useChrNametables: 1 } as unknown as MapperState),
    ).toThrowError(RangeError);

    const majorLeague = createMapper(
      createTestCartridge({
        mapper: 32,
        nes2: true,
        submapper: 1,
        prgBanks: 4,
        chrBanks: 1,
      }),
      interruptPort,
    );
    majorLeague.powerOn();
    const majorLeagueState = majorLeague.captureState();
    if (majorLeagueState.kind !== "irem-g101") throw new Error("Expected Irem G-101 state");
    expect(() => majorLeague.restoreState({ ...majorLeagueState, prgMode: 1 })).toThrowError(
      RangeError,
    );
  });

  it("fails closed on unsupported variants and unreachable memory geometry", () => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 32,
          nes2: true,
          submapper: 2,
          prgBanks: 8,
          chrBanks: 1,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 68, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 68, prgBanks: 8, chrBanks: 1, fourScreen: true }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 79, prgBanks: 6, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 97, prgBanks: 8 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 97, prgBanks: 16, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function readPpuAt(memory: PPUMemory, addresses: readonly number[]): number[] {
  return addresses.map((address) => memory.read(address));
}
