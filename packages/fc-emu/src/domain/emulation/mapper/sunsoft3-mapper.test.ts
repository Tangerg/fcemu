import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { createMapper } from "./create-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import { Sunsoft3Mapper } from "./sunsoft3-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Sunsoft3Mapper", () => {
  it("maps one switchable PRG bank, the fixed tail and four 2 KiB CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 67, prgBanks: 16, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x0800);
    const mapper = new Sunsoft3Mapper(noopInterrupt, cartridge);

    mapper.write(0xfabc, 9);
    mapper.write(0x8abc, 5);
    mapper.write(0x9abc, 14);
    mapper.write(0xaabc, 31);
    mapper.write(0xbabc, 63);

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([9, 15]);
    expect(readAt(mapper, [0x0000, 0x0800, 0x1000, 0x1800])).toEqual([5, 14, 31, 63]);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("uses the exact high-half register decode and acknowledges every low-half mirror", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);

    mapper.write(0xc800, 0);
    mapper.write(0xc800, 0);
    mapper.write(0xd800, 0x10);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0x97ff, 0xff);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xffff, irqPending: false });
  });

  it("loads the IRQ counter high-byte first and lets the enable port restart that sequence", () => {
    const mapper = createIrqMapper([]);

    mapper.write(0xc800, 0x12);
    mapper.write(0xc800, 0x34);
    mapper.write(0xc800, 0x56);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0x5634,
      irqHighByteNext: false,
    });

    mapper.write(0xd800, 0);
    mapper.write(0xc800, 0xab);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0xab34,
      irqHighByteNext: false,
    });
  });

  it("fires only when the down counter wraps and disables the one-shot counter", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0xc800, 0);
    mapper.write(0xc800, 1);
    mapper.write(0xd800, 0x10);

    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0,
      irqEnabled: true,
      irqPending: false,
    });
    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0xffff,
      irqEnabled: false,
      irqPending: true,
    });
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xd800, 0x10);
    expect(assertions.at(-1)).toBe(true);
    mapper.write(0x8000, 0);
    expect(assertions.at(-1)).toBe(false);
  });

  it("selects vertical, horizontal and both single-screen mirroring modes", () => {
    const cartridge = createTestCartridge({ mapper: 67, prgBanks: 8, chrBanks: 8 });
    const mapper = new Sunsoft3Mapper(noopInterrupt, cartridge);
    const modes = [
      NametableMirroring.Vertical,
      NametableMirroring.Horizontal,
      NametableMirroring.SingleScreenLower,
      NametableMirroring.SingleScreenUpper,
    ];

    for (const [value, mode] of modes.entries()) {
      mapper.write(0xe800, value);
      expect(cartridge.mirroringMode).toBe(mode);
    }
  });

  it("round-trips live state and rejects invalid state before mutating the mapper", () => {
    const assertions: boolean[] = [];
    const cartridge = createTestCartridge({ mapper: 67, prgBanks: 8, chrBanks: 8 });
    const mapper = new Sunsoft3Mapper(
      {
        setMapperIrq(asserted) {
          assertions.push(asserted);
        },
      },
      cartridge,
    );
    mapper.write(0xf800, 6);
    mapper.write(0x8800, 7);
    mapper.write(0xc800, 0);
    mapper.write(0xc800, 0);
    mapper.write(0xd800, 0x10);
    mapper.write(0xe800, 3);
    mapper.observeCpuBusCycle(false);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(assertions.at(-1)).toBe(true);
    expect(() => mapper.restoreState({ ...state, chrBanks: [0, 0, 0, 64] } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
  });

  it("accepts Sunsoft-3 geometry and rejects unsupported variants and memory", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 67, prgBanks: 16, chrBanks: 16 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 67, nes2: true, submapper: 1, prgBanks: 2, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 67, prgBanks: 17, chrBanks: 1 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 67, prgBanks: 2, chrBanks: 17 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 67, prgBanks: 2 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 67,
          nes2: true,
          prgBanks: 2,
          chrBanks: 1,
          prgRamShift: 7,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 67, prgBanks: 2, chrBanks: 1, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function createIrqMapper(assertions: boolean[]): Sunsoft3Mapper {
  return new Sunsoft3Mapper(
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
    createTestCartridge({ mapper: 67, prgBanks: 8, chrBanks: 8 }),
  );
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
