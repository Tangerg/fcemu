import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import { TxcMmc3189Mapper } from "./txc-mmc3-189-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("TxcMmc3189Mapper", () => {
  it("maps one externally selected 32 KiB PRG bank and ignores MMC3 PRG registers", () => {
    const cartridge = createTestCartridge({ mapper: 189, prgBanks: 16, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new TxcMmc3189Mapper(noopInterrupt, cartridge);

    mapper.writeCpuExpansion(0x4020, 0x21);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([12, 13, 14, 15]);

    mapper.write(0x8000, 0x46);
    mapper.write(0x8001, 0x1f);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([12, 13, 14, 15]);
  });

  it("combines the data nibbles across the generalized expansion and WRAM decodes", () => {
    const cartridge = createTestCartridge({ mapper: 189, prgBanks: 16, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x8000);
    const mapper = new TxcMmc3189Mapper(noopInterrupt, cartridge);

    mapper.writeCpuExpansion(0x401f, 0x07);
    expect(mapper.read(0x8000)).toBe(0);
    mapper.writeCpuExpansion(0x5000, 0x41);
    expect(mapper.read(0x8000)).toBe(5);
    mapper.write(0x7000, 0x62);
    expect(mapper.read(0x8000)).toBe(6);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("retains standard MMC3 CHR banking and mapper-controlled mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 189, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new TxcMmc3189Mapper(noopInterrupt, cartridge);

    mapper.write(0x8000, 0x02);
    mapper.write(0x8001, 0x15);
    mapper.write(0xa000, 1);

    expect(mapper.read(0x1000)).toBe(0x15);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("retains the filtered MMC3 A12 IRQ counter", () => {
    const bus = new Bus(createTestCartridge({ mapper: 189, prgBanks: 8, chrBanks: 16 }));
    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockMmc3A12(bus.Mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("round-trips both board layers and rejects either invalid layer atomically", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 189, prgBanks: 16, chrBanks: 16 }),
      noopInterrupt,
    );
    mapper.writeCpuExpansion?.(0x5000, 0x21);
    mapper.write(0x8000, 0x02);
    mapper.write(0x8001, 0x15);
    mapper.write(0xc000, 4);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);
    clockMmc3A12(mapper, 10);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, selectedPrgBank: 8 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
    if (state.kind !== "txc-mmc3-189") throw new Error("unexpected mapper state");
    expect(() =>
      mapper.restoreState({ ...state, mmc3: { ...state.mmc3, counter: 0x100 } } as MapperState),
    ).toThrow(RangeError);
    expect(mapper.captureState()).toEqual(state);
  });

  it("accepts TXC board geometry and rejects unsupported variants and memory", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 8, chrBanks: 1 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 16, chrBanks: 32 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 189, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 4, chrBanks: 1 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 18, chrBanks: 1 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 8, chrBanks: 33 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 189, prgBanks: 8 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 189,
          nes2: true,
          prgBanks: 8,
          chrBanks: 1,
          prgRamShift: 7,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 189, prgBanks: 8, chrBanks: 1, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress?.(0x0000);
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
