import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { PPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("MMC3 board variants", () => {
  it("routes TxSROM nametables through CHR A17 in both CHR banking modes", () => {
    const cartridge = createTestCartridge({ mapper: 118, prgBanks: 8, chrBanks: 16 });
    const bus = new Bus(cartridge);
    const ppuMemory = new PPUMemory(bus);

    bank(bus.Mapper, 0, 0x80);
    bank(bus.Mapper, 1, 0x00);
    ppuMemory.write(0x2000, 0xaa);
    ppuMemory.write(0x2800, 0xbb);

    expect(ppuMemory.read(0x2400)).toBe(0xaa);
    expect(ppuMemory.read(0x2c00)).toBe(0xbb);

    bank(bus.Mapper, 2, 0x80, 0x80);
    bank(bus.Mapper, 3, 0x00, 0x80);
    bank(bus.Mapper, 4, 0x80, 0x80);
    bank(bus.Mapper, 5, 0x00, 0x80);

    expect(bus.Mapper.mapNametableAddress?.(0x2000)).toBe(0x0400);
    expect(bus.Mapper.mapNametableAddress?.(0x2400)).toBe(0x0000);
    expect(bus.Mapper.mapNametableAddress?.(0x2800)).toBe(0x0400);
    expect(bus.Mapper.mapNametableAddress?.(0x2c00)).toBe(0x0000);

    bus.Mapper.write(0xa000, 1);
    expect(bus.Mapper.mapNametableAddress?.(0x2000)).toBe(0x0400);
  });

  it("preserves the MMC3 IRQ counter on TxSROM", () => {
    const bus = new Bus(createTestCartridge({ mapper: 118, prgBanks: 8, chrBanks: 16 }));
    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);

    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it.each([
    { name: "legacy iNES", nes2: false },
    { name: "NES 2.0", nes2: true },
  ])("selects TQROM CHR ROM and RAM per 1 KiB bank with $name", ({ nes2 }) => {
    const cartridge = createTestCartridge({
      mapper: 119,
      nes2,
      prgBanks: 8,
      chrBanks: 8,
      chrRamShift: 7,
    });
    cartridge.chrRom.fill(0x33, 3 * 0x0400, 4 * 0x0400);
    const mapper = createMapper(cartridge, interruptPort);

    bank(mapper, 2, 0x03);
    expect(mapper.read(0x1000)).toBe(0x33);
    mapper.write(0x1000, 0x55);
    expect(mapper.read(0x1000)).toBe(0x33);

    bank(mapper, 2, 0x44);
    mapper.write(0x1000, 0xaa);
    expect(mapper.read(0x1000)).toBe(0xaa);

    bank(mapper, 2, 0x03);
    expect(mapper.read(0x1000)).toBe(0x33);
  });

  it("selects both halves of a 2 KiB TQROM CHR-RAM bank and keeps PRG RAM absent", () => {
    const cartridge = createTestCartridge({
      mapper: 119,
      prgBanks: 8,
      chrBanks: 8,
    });
    const bus = new Bus(cartridge);
    const ppuMemory = new PPUMemory(bus);

    bank(bus.Mapper, 0, 0x42);
    ppuMemory.write(0x0000, 0x12);
    ppuMemory.write(0x0400, 0x34);

    expect(ppuMemory.read(0x0000)).toBe(0x12);
    expect(ppuMemory.read(0x0400)).toBe(0x34);

    bus.RAM[0] = 0x5a;
    bus.CPU.readByte(0);
    bus.Mapper.write(0x6000, 0x99);
    expect(bus.CPU.readByte(0x6000)).toBe(0x5a);
  });

  it("keeps TQROM's standard MMC3 mirroring register and IRQ behavior", () => {
    const bus = new Bus(createTestCartridge({ mapper: 119, prgBanks: 8, chrBanks: 8 }));
    bus.Mapper.write(0xa000, 1);
    expect(bus.Cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    clockMmc3A12(bus.Mapper, 10);

    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it.each([
    {
      mapper: 118,
      options: { mapper: 118, prgBanks: 8, chrBanks: 16 },
    },
    {
      mapper: 119,
      options: { mapper: 119, prgBanks: 8, chrBanks: 8 },
    },
  ])("round-trips Mapper $mapper's complete MMC3 state", ({ options }) => {
    const mapper = createMapper(createTestCartridge(options), interruptPort);
    mapper.write(0x8000, 0xc6);
    mapper.write(0x8001, 3);
    mapper.write(0xc000, 4);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);
    clockMmc3A12(mapper, 10);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
  });

  it("rejects TxSROM and TQROM memory absent from their physical boards", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 118, prgBanks: 8 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 118, prgBanks: 8, chrBanks: 16, fourScreen: true }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 119, prgBanks: 4, chrBanks: 8 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 119,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 8,
          chrRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 119, prgBanks: 8, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 119, prgBanks: 8, chrBanks: 16 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 119,
          nes2: true,
          prgBanks: 8,
          chrBanks: 8,
          chrRamShift: 6,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 119,
          nes2: true,
          prgBanks: 8,
          chrBanks: 8,
          chrRamShift: 7,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function bank(mapper: Mapper, register: number, value: number, mode = 0): void {
  mapper.write(0x8000, mode | register);
  mapper.write(0x8001, value);
}

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}
