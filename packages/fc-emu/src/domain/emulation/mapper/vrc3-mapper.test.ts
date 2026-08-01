import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Vrc3Mapper } from "./vrc3-mapper.js";
import { createMapper } from "./create-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("Vrc3Mapper", () => {
  it("maps a switchable 16 KiB PRG bank, fixed final bank and writable CHR RAM", () => {
    const cartridge = createTestCartridge({ mapper: 73, prgBanks: 8 });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = new Vrc3Mapper(noopInterrupt, cartridge);

    mapper.write(0xfabc, 5);
    mapper.write(0x0123, 0x6a);

    expect(mapper.read(0x8000)).toBe(5);
    expect(mapper.read(0xc000)).toBe(7);
    expect(mapper.read(0x0123)).toBe(0x6a);
  });

  it("maps optional fixed PRG RAM and leaves it open bus when absent", () => {
    const withRam = new Vrc3Mapper(
      noopInterrupt,
      createTestCartridge({ mapper: 73, nes2: true, prgBanks: 2, prgRamShift: 7 }),
    );
    withRam.write(0x6000, 0x5a);
    expect(withRam.read(0x6000)).toBe(0x5a);
    expect(withRam.cpuReadDriveMask(0x6000)).toBe(0xff);

    const withoutRam = new Vrc3Mapper(
      noopInterrupt,
      createTestCartridge({ mapper: 73, nes2: true, prgBanks: 2 }),
    );
    expect(withoutRam.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("assembles the 16-bit latch and reloads it on counter overflow", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeLatch(mapper, 0xfffe);
    mapper.write(0xc000, 0x02);

    mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xffff, irqPending: false });
    mapper.observeCpuBusCycle(false);

    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xfffe, irqPending: true });
    expect(assertions.at(-1)).toBe(true);
  });

  it("keeps the upper counter byte unchanged in 8-bit mode", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeLatch(mapper, 0x12fe);
    mapper.write(0xc000, 0x06);

    mapper.observeCpuBusCycle(false);
    mapper.observeCpuBusCycle(false);

    expect(mapper.captureState()).toMatchObject({ irqCounter: 0x12fe, irqPending: true });
    expect(assertions.at(-1)).toBe(true);
  });

  it("acknowledges pending IRQs and copies A into the enable flag", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeLatch(mapper, 0xffff);
    mapper.write(0xc000, 0x03);
    mapper.observeCpuBusCycle(false);
    mapper.write(0xd555, 0xff);

    expect(mapper.captureState()).toMatchObject({ irqEnabled: true, irqPending: false });
    expect(assertions.at(-1)).toBe(false);

    mapper.write(0xc000, 0x02);
    mapper.observeCpuBusCycle(false);
    mapper.write(0xd000, 0);
    expect(mapper.captureState()).toMatchObject({ irqEnabled: false, irqPending: false });
  });

  it("control writes acknowledge without reloading when E is clear", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    writeLatch(mapper, 0xfffe);
    mapper.write(0xc000, 0x02);
    mapper.observeCpuBusCycle(false);
    mapper.write(0xc000, 0x00);

    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xffff, irqPending: false });
    expect(assertions.at(-1)).toBe(false);
  });

  it("round-trips live IRQ state and reasserts the interrupt line", () => {
    const firstAssertions: boolean[] = [];
    const mapper = createIrqMapper(firstAssertions);
    writeLatch(mapper, 0xffff);
    mapper.write(0xf000, 6);
    mapper.write(0xc000, 0x07);
    mapper.observeCpuBusCycle(false);
    const state = mapper.captureState();

    const restoredAssertions: boolean[] = [];
    const restored = createIrqMapper(restoredAssertions);
    restored.restoreState(state);

    expect(restored.captureState()).toEqual(state);
    expect(restoredAssertions.at(-1)).toBe(true);
    expect(() => restored.restoreState({ ...state, irqCounter: 0x1_0000 } as MapperState)).toThrow(
      RangeError,
    );
    expect(() => restored.restoreState({ ...state, irqEnabled: false } as MapperState)).toThrow(
      RangeError,
    );
  });

  it("accepts VRC3 geometry and rejects unsupported variants and memory", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 73, prgBanks: 8 }), noopInterrupt),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 73, nes2: true, submapper: 1, prgBanks: 2 }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 73, prgBanks: 10 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 73, prgBanks: 2, chrBanks: 1 }), noopInterrupt),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 73,
          nes2: true,
          prgBanks: 2,
          chrRamShift: 8,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 73,
          nes2: true,
          prgBanks: 2,
          prgRamShift: 5,
        }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 73, prgBanks: 2, fourScreen: true }),
        noopInterrupt,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function createIrqMapper(assertions: boolean[]): Vrc3Mapper {
  return new Vrc3Mapper(
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
    createTestCartridge({ mapper: 73, prgBanks: 8 }),
  );
}

function writeLatch(mapper: Vrc3Mapper, value: number): void {
  for (let nibble = 0; nibble < 4; nibble++) {
    mapper.write(0x8000 + nibble * 0x1000, (value >>> (nibble * 4)) & 0x0f);
  }
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
