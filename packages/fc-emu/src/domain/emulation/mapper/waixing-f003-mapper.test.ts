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
import { WaixingF003Mapper } from "./waixing-f003-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("WaixingF003Mapper", () => {
  it("routes the active MMC3 CHR output bit to the 1 MiB PRG outer bank", () => {
    const cartridge = createTestCartridge({ mapper: 245, prgBanks: 64, battery: true });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new WaixingF003Mapper(noopInterrupt, cartridge);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([0, 1, 62, 63]);

    bank(mapper, 0, 0x02);
    bank(mapper, 1, 0x00);
    bank(mapper, 6, 0x45);
    bank(mapper, 7, 0x46);
    mapper.observePpuAddress(0x0000);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([69, 70, 126, 127]);

    mapper.observePpuAddress(0x0800);
    expect(mapper.read(0x8000)).toBe(5);
    mapper.observePpuAddress(0x1000);
    expect(mapper.read(0x8000)).toBe(69);

    bank(mapper, 2, 0x02, 0x80);
    bank(mapper, 3, 0x00, 0x80);
    mapper.observePpuAddress(0x0000);
    expect(mapper.read(0x8000)).toBe(69);
    mapper.observePpuAddress(0x0400);
    expect(mapper.read(0x8000)).toBe(5);

    bank(mapper, 6, 0x45, 0xc0);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([62, 6, 5, 63]);
  });

  it("wraps the outer address line away on smaller TNROM-like images", () => {
    const cartridge = createTestCartridge({ mapper: 245, prgBanks: 32, battery: true });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new WaixingF003Mapper(noopInterrupt, cartridge);

    bank(mapper, 0, 0x02);
    mapper.observePpuAddress(0x0000);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([0, 1, 62, 63]);
  });

  it("keeps CHR RAM directly wired while retaining mirroring and protected NVRAM", () => {
    const cartridge = createTestCartridge({ mapper: 245, prgBanks: 32, battery: true });
    const mapper = new WaixingF003Mapper(noopInterrupt, cartridge);

    mapper.write(0x0410, 0x5a);
    bank(mapper, 0, 0x06);
    expect(mapper.read(0x0410)).toBe(0x5a);
    expect(mapper.read(0x0010)).toBe(0);

    mapper.write(0xa000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(0x6001, 0x31);
    mapper.write(0xa001, 0xc0);
    mapper.write(0x6001, 0x42);
    expect(mapper.read(0x6001)).toBe(0x31);
    mapper.write(0xa001, 0x80);
    mapper.write(0x6001, 0x42);
    expect(mapper.read(0x6001)).toBe(0x42);
  });

  it("does not clock the MMC3 scanline IRQ because PPU A12 is disconnected", () => {
    const bus = new Bus(createTestCartridge({ mapper: 245, prgBanks: 32, battery: true }));
    bus.Mapper.write(0xc000, 1);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    for (let edge = 0; edge < 10; edge++) {
      bus.Mapper.observePpuAddress?.(0x0000);
      bus.Mapper.observePpuAddress?.(0x1000);
    }

    expect(bus.Mapper.tickPpu).toBeUndefined();
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    const state = bus.Mapper.captureState();
    if (state.kind !== "waixing-f003-245") throw new Error("unexpected mapper state");
    expect(state.mmc3.ppuClock).toBe(0);
    expect(state.mmc3.irqPending).toBe(false);
  });

  it("round-trips both board layers and rejects impossible state atomically", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 245, prgBanks: 64, battery: true }),
      noopInterrupt,
    );
    bank(mapper, 0, 0x02);
    mapper.observePpuAddress?.(0x2abc);
    mapper.write(0xc000, 4);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, ppuBankAddress: 0x1000 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
    if (state.kind !== "waixing-f003-245") throw new Error("unexpected mapper state");
    expect(() =>
      mapper.restoreState({ ...state, mmc3: { ...state.mmc3, ppuClock: 1 } } as MapperState),
    ).toThrow(/disconnected A12/i);
    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({ ...state, mmc3: { ...state.mmc3, counter: 0x100 } } as MapperState),
    ).toThrow(RangeError);
    expect(mapper.captureState()).toEqual(state);
  });

  it("accepts F003 geometry and rejects unsupported variants and memory", () => {
    for (const prgBanks of [8, 16, 32, 64]) {
      expect(() =>
        createMapper(createTestCartridge({ mapper: 245, prgBanks, battery: true }), noopInterrupt),
      ).not.toThrow();
    }
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 245, nes2: true, submapper: 1, prgBanks: 32, battery: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 245, prgRomBytes: 0x30_000, battery: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 245, prgBanks: 32, chrBanks: 1, battery: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 245, nes2: true, prgBanks: 32, prgRamShift: 7 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 245,
          nes2: true,
          prgBanks: 32,
          battery: true,
          prgNvRamShift: 6,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 245, prgBanks: 32, battery: true, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function bank(mapper: Mapper, register: number, value: number, mode = 0): void {
  mapper.write(0x8000, mode | register);
  mapper.write(0x8001, value);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bankIndex = 0; bankIndex < bytes.byteLength / bankSize; bankIndex++) {
    bytes.fill(bankIndex, bankIndex * bankSize, (bankIndex + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
