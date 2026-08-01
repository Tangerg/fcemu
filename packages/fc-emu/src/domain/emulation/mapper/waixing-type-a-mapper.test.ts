import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Waixing Type A mapper 74", () => {
  it("redirects only CHR banks 8 and 9 to the two 1 KiB CHR-RAM pages", () => {
    const cartridge = createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 32 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, noopInterrupt);

    bank(mapper, 2, 0x08);
    mapper.write(0x1010, 0x58);
    expect(mapper.read(0x1010)).toBe(0x58);

    bank(mapper, 2, 0x09);
    mapper.write(0x1010, 0x69);
    expect(mapper.read(0x1010)).toBe(0x69);
    bank(mapper, 2, 0x08);
    expect(mapper.read(0x1010)).toBe(0x58);

    bank(mapper, 2, 0x0a);
    expect(mapper.read(0x1010)).toBe(0x0a);
    mapper.write(0x1010, 0xff);
    expect(mapper.read(0x1010)).toBe(0x0a);

    bank(mapper, 2, 0x88);
    expect(mapper.read(0x1010)).toBe(0x88);

    const smallCartridge = createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 1 });
    fillBanks(smallCartridge.chrRom, 0x0400);
    const smallMapper = createMapper(smallCartridge, noopInterrupt);
    bank(smallMapper, 2, 0x88);
    expect(smallMapper.read(0x1010)).toBe(0);
  });

  it("maps both halves of a 2 KiB MMC3 register across the two RAM pages", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 32 }),
      noopInterrupt,
    );

    bank(mapper, 0, 0x08);
    mapper.write(0x0010, 0x12);
    mapper.write(0x0410, 0x34);

    expect(mapper.read(0x0010)).toBe(0x12);
    expect(mapper.read(0x0410)).toBe(0x34);
  });

  it("retains MMC3 PRG, mirroring, NVRAM protection and filtered A12 IRQ", () => {
    const cartridge = createTestCartridge({
      mapper: 74,
      prgBanks: 32,
      chrBanks: 32,
      battery: true,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    const bus = new Bus(cartridge);

    bank(bus.Mapper, 6, 0x25);
    bank(bus.Mapper, 7, 0x26);
    expect(readAt(bus.Mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([37, 38, 62, 63]);

    bus.Mapper.write(0xa000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    bus.Mapper.write(0x6001, 0x31);
    bus.Mapper.write(0xa001, 0xc0);
    bus.Mapper.write(0x6001, 0x42);
    expect(bus.Mapper.read(0x6001)).toBe(0x31);

    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips MMC3 and mixed cartridge memory through the bus boundary", () => {
    const bus = new Bus(createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 32 }));
    bank(bus.Mapper, 2, 0x08);
    bus.Mapper.write(0x1010, 0x5a);
    bank(bus.Mapper, 6, 0x05);
    bus.Mapper.write(0xc000, 4);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);
    clockMmc3A12(bus.Mapper, 10);
    const state = bus.captureState();

    bus.Mapper.write(0x1010, 0xa5);
    bus.Mapper.powerOn();
    bus.restoreState(state);

    expect(bus.captureState()).toEqual(state);
    expect(bus.Mapper.read(0x1010)).toBe(0x5a);
  });

  it("normalizes legacy mixed memory and requires an explicit NES 2.0 CHR-RAM size", () => {
    const legacy = createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 32 });
    expect(legacy.chrRamBytes).toBe(0x0800);
    expect(legacy.chrNvRamBytes).toBe(0);
    expect(legacy.hasWritableChrMemory).toBe(true);

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 74,
          nes2: true,
          prgBanks: 8,
          chrBanks: 32,
          chrRamShift: 5,
          prgRamShift: 7,
        }),
        noopInterrupt,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 74, nes2: true, prgBanks: 8, chrBanks: 32 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 74,
          nes2: true,
          prgBanks: 8,
          chrBanks: 32,
          chrRamShift: 6,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });

  it("accepts only the documented board identity and reachable geometry", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 1 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 32, chrBanks: 32 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 74, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 32 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 4, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 33, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 33 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 74, prgBanks: 8 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 74, prgBanks: 8, chrBanks: 32, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
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

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bankIndex = 0; bankIndex < bytes.byteLength / bankSize; bankIndex++) {
    bytes.fill(bankIndex, bankIndex * bankSize, (bankIndex + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
