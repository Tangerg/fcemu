import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("MMC3 mapper 250 address/data wiring", () => {
  it("takes the MMC3 port from CPU A10 and register data from CPU A7-A0", () => {
    const cartridge = createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8006, 0xff); // $8000 <- $06: select PRG register R6.
    mapper.write(0x8403, 0x00); // $8001 <- $03: map PRG bank 3.
    mapper.write(0x8002, 0xaa); // $8000 <- $02: select CHR register R2.
    mapper.write(0x8405, 0x55); // $8001 <- $05: map CHR bank 5.

    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.read(0x1000)).toBe(5);
  });

  it("ignores the byte driven on CPU D7-D0", () => {
    const first = createMapper(
      createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 }),
      interruptPort,
    );
    const second = createMapper(
      createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 }),
      interruptPort,
    );

    first.write(0x8006, 0x00);
    first.write(0x8403, 0x00);
    second.write(0x8006, 0xff);
    second.write(0x8403, 0xff);

    expect(second.captureState()).toEqual(first.captureState());
  });

  it("routes mirroring and PRG-RAM protection through the remapped A10 port", () => {
    const cartridge = createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 });
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0xa001, 0x00); // $A000 <- $01 despite CPU A0 being high.
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.write(0xa000, 0xff); // $A000 <- $00.
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    mapper.write(0x6000, 0x11);
    mapper.write(0xa4c0, 0x00); // $A001 <- $C0: enabled, write-protected.
    mapper.write(0x6000, 0x22);
    expect(mapper.read(0x6000)).toBe(0x11);
    mapper.write(0xa480, 0xff); // $A001 <- $80: enabled, writable.
    mapper.write(0x6000, 0x33);
    expect(mapper.read(0x6000)).toBe(0x33);
  });

  it("keeps the filtered MMC3 A12 IRQ counter behind the remapped C/E ports", () => {
    const bus = new Bus(createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 }));

    bus.Mapper.write(0xc002, 0xff); // $C000 <- $02.
    bus.Mapper.write(0xc400, 0xff); // $C001 <- $00.
    bus.Mapper.write(0xe400, 0xff); // $E001 <- $00.
    clockMmc3A12(bus.Mapper, 10);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    bus.Mapper.write(0xe000, 0xff); // $E000 <- $00.
    expect(bus.CPU.isIRQLineAsserted).toBe(false);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips all mutable state and restores the derived bank map", () => {
    const cartridge = createTestCartridge({ mapper: 250, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x80c6, 0x00); // $8000 <- $C6: inverted PRG/CHR modes, select R6.
    mapper.write(0x8404, 0xff); // $8001 <- $04.
    mapper.write(0xa001, 0x00);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(mapper.read(0xc000)).toBe(4);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it.each([
    {
      name: "minimum ROMs without writable memory",
      options: { mapper: 250, nes2: true, prgBanks: 2, chrBanks: 1 },
    },
    {
      name: "maximum ROMs with battery-backed 8 KiB PRG NVRAM",
      options: {
        mapper: 250,
        nes2: true,
        prgBanks: 32,
        chrBanks: 32,
        prgNvRamShift: 7,
        battery: true,
      },
    },
  ])("accepts $name", ({ options }) => {
    expect(() => createMapper(createTestCartridge(options), interruptPort)).not.toThrow();
  });

  it.each([
    {
      name: "unknown submapper",
      options: { mapper: 250, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 16 },
      error: UnsupportedMapperVariantError,
    },
    {
      name: "undersized PRG ROM",
      options: { mapper: 250, prgBanks: 1, chrBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "CHR RAM in place of CHR ROM",
      options: { mapper: 250, prgBanks: 8 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "oversized PRG ROM",
      options: { mapper: 250, nes2: true, prgBanks: 33, chrBanks: 16 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "oversized CHR ROM",
      options: { mapper: 250, nes2: true, prgBanks: 8, chrBanks: 33 },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "four-screen nametables",
      options: { mapper: 250, prgBanks: 8, chrBanks: 16, fourScreen: true },
      error: UnsupportedMapperConfigurationError,
    },
    {
      name: "non-8 KiB PRG RAM",
      options: {
        mapper: 250,
        nes2: true,
        prgBanks: 8,
        chrBanks: 16,
        prgRamShift: 5,
      },
      error: UnsupportedMapperConfigurationError,
    },
  ])("rejects $name", ({ options, error }) => {
    expect(() => createMapper(createTestCartridge(options), interruptPort)).toThrowError(error);
  });
});

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bankIndex = 0; bankIndex < bytes.byteLength / bankSize; bankIndex++) {
    bytes.fill(bankIndex, bankIndex * bankSize, (bankIndex + 1) * bankSize);
  }
}
