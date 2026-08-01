import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Kasheng mappers 115 and 248", () => {
  it("combines the outer PRG line with standard MMC3 banking and mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 115, prgBanks: 32, chrBanks: 32 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x6000, 0x40);
    bank(mapper, 6, 3);
    bank(mapper, 7, 4);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([35, 36, 62, 63]);

    mapper.write(0x6000, 0);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 4, 30, 31]);

    mapper.write(0xa000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("implements both NROM-128 and NROM-256 override modes including PRG A18", () => {
    const cartridge = createTestCartridge({ mapper: 115, prgBanks: 32, chrBanks: 32 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x6000, 0xc3);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([38, 39, 38, 39]);

    mapper.write(0x6000, 0xe6);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([44, 45, 46, 47]);
  });

  it("resolves duplicate ID 248 to the same physical board state machine", () => {
    const snapshots = [115, 248].map((mapperNumber) => {
      const cartridge = createTestCartridge({ mapper: mapperNumber, prgBanks: 16, chrBanks: 32 });
      fillBanks(cartridge.prgRom, 0x2000);
      const mapper = createMapper(cartridge, noopInterrupt);

      mapper.write(0x6000, 0xe6);
      bank(mapper, 2, 4);
      return {
        mapperNumber: cartridge.mapperNumber,
        reads: readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000]),
        state: mapper.captureState(),
      };
    });

    expect(snapshots.map(({ mapperNumber }) => mapperNumber)).toEqual([115, 248]);
    expect(snapshots[1]?.reads).toEqual(snapshots[0]?.reads);
    expect(snapshots[1]?.state).toEqual(snapshots[0]?.state);
  });

  it("routes CHR A18 and exposes only the three solder-pad data lines", () => {
    const cartridge = createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 64 });
    cartridge.chrRom[4 * 0x0400] = 0x44;
    cartridge.chrRom[0x104 * 0x0400] = 0xa4;
    const mapper = createMapper(cartridge, noopInterrupt);

    bank(mapper, 2, 4);
    expect(mapper.read(0x1000)).toBe(0x44);
    mapper.write(0x7001, 1);
    expect(mapper.read(0x1000)).toBe(0xa4);

    expect(mapper.read(0x6002)).toBe(0);
    expect(mapper.cpuReadDriveMask?.(0x6002)).toBe(0x07);
    expect(mapper.cpuReadDriveMask?.(0x7ffe)).toBe(0x07);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
  });

  it("uses revision-B zero-latch IRQ behavior and restores an asserted output", () => {
    const bus = new Bus(createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 32 }));
    bus.Mapper.write(0xc000, 0);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    const state = bus.captureState();
    bus.Mapper.powerOn();
    bus.restoreState(state);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips both outer registers and nested MMC3 state transactionally", () => {
    const cartridge = createTestCartridge({ mapper: 115, prgBanks: 32, chrBanks: 64 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);
    mapper.write(0x6000, 0xe6);
    mapper.write(0x6001, 1);
    bank(mapper, 2, 4);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([44, 46]);

    const ownState = state as Extract<MapperState, { kind: "kasheng-115" }>;
    expect(() => mapper.restoreState({ ...ownState, chrOuterBank: 2 })).toThrow(RangeError);
    expect(mapper.captureState()).toEqual(state);
  });

  it("fails closed on variants, writable memory and unreachable geometry", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 1 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 32, chrBanks: 64 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 115, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 248, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 7, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 33, chrBanks: 32 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 65 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 115, prgBanks: 8 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 32, battery: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 115, prgBanks: 8, chrBanks: 32, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function bank(mapper: Mapper, register: number, value: number): void {
  mapper.write(0x8000, register);
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
