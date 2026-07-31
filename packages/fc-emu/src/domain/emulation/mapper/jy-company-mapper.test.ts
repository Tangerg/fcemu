import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { createMapper } from "./create-mapper.js";
import { JyCompanyMapper } from "./jy-company-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("JyCompanyMapper", () => {
  it("maps all PRG modes inside the selected 512 KiB outer bank", () => {
    const cartridge = createTestCartridge({
      mapper: 90,
      nes2: true,
      prgBanks: 128,
      chrBanks: 1,
      prgRamShift: 7,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    expect(readAt(mapper, [0x8000, 0xe000])).toEqual([60, 63]);

    mapper.write(0xd003, 4);
    mapper.write(0x8000, 3);
    mapper.write(0x8001, 4);
    mapper.write(0x8002, 5);
    mapper.write(0x8003, 6);
    mapper.write(0xd000, 2);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([131, 132, 133, 191]);

    mapper.write(0xd000, 6);
    expect(mapper.read(0xe000)).toBe(134);

    mapper.write(0xd000, 4);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([152, 153, 154, 155]);

    mapper.write(0xd000, 0x80);
    expect(mapper.read(0x6000)).toBe(155);
    mapper.write(0xd000, 0);
    mapper.write(0x6000, 0x5a);
    expect(mapper.read(0x6000)).toBe(0x5a);
  });

  it("reverses all seven PRG register bits only in mode 3", () => {
    const cartridge = createTestCartridge({ mapper: 90, prgBanks: 128, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8000, 1);
    mapper.write(0x8001, 2);
    mapper.write(0x8002, 4);
    mapper.write(0x8003, 0x40);
    mapper.write(0xd000, 7);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([0, 32, 16, 1]);
  });

  it("ignores A11 on bank/mode ports only when the physical decode mask allows it", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 1 }),
      noopInterrupt,
    );
    const before = mapper.captureState();

    mapper.write(0x8800, 0x7f);
    mapper.write(0x9800, 0x7f);
    mapper.write(0xa800, 0x7f);
    mapper.write(0xb800, 0x7f);
    mapper.write(0xd800, 0xff);

    expect(mapper.captureState()).toMatchObject({
      prgBanks: before.kind === "jy-company" ? before.prgBanks : [],
      chrBanks: before.kind === "jy-company" ? before.chrBanks : [],
      nametableBanks: before.kind === "jy-company" ? before.nametableBanks : [],
      mode: 0,
    });

    mapper.write(0xc801, 0x40);
    expect(mapper.captureState()).toMatchObject({ irqMode: 0x40 });
  });

  it("maps 8, 4, 2 and 1 KiB CHR banks with both outer-bank sizes", () => {
    const cartridge = createTestCartridge({
      mapper: 90,
      nes2: true,
      prgBanks: 32,
      chrBanks: 256,
    });
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xd003, 0x11);
    mapper.write(0x9000, 5);
    const oneKiB = 5 * 256 + 5;
    cartridge.chrRom[oneKiB * 0x0400] = 0x15;
    mapper.write(0xd000, 0x18);
    expect(mapper.read(0x0000)).toBe(0x15);

    mapper.write(0x9002, 7);
    const twoKiB = 5 * 128 + 7;
    cartridge.chrRom[twoKiB * 0x0800] = 0x27;
    mapper.write(0xd000, 0x10);
    expect(mapper.read(0x0800)).toBe(0x27);

    mapper.write(0xd003, 0x38);
    mapper.write(0x9000, 0x23);
    const eightKiB = 3 * 64 + 0x23;
    cartridge.chrRom[eightKiB * 0x2000] = 0x83;
    mapper.write(0xd000, 0);
    expect(mapper.read(0x0000)).toBe(0x83);

    const fourKiB = 3 * 128 + 0x23;
    cartridge.chrRom[fourKiB * 0x1000] = 0x43;
    mapper.write(0xd000, 0x08);
    expect(mapper.read(0x0000)).toBe(0x43);
  });

  it("applies MMC4-like latches after the triggering CHR byte is read", () => {
    const cartridge = createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 8 });
    const mapper = createMapper(cartridge, noopInterrupt);
    for (const [register, bank] of [
      [0, 1],
      [2, 2],
      [4, 3],
      [6, 4],
    ] as const) {
      mapper.write(0x9000 + register, bank);
      cartridge.chrRom[bank * 0x1000] = 0x40 + bank;
    }
    mapper.write(0xd000, 0x08);
    mapper.write(0xd003, 0x80);

    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0x41, 0x43]);
    expect(mapper.read(0x0fe8)).toBe(cartridge.chrRom[0x1000 + 0x0fe8]);
    mapper.observePpuRead?.(0x0fe8);
    mapper.observePpuRead?.(0x1fe8);
    expect(readAt(mapper, [0x0000, 0x1000])).toEqual([0x42, 0x44]);

    mapper.observePpuRead?.(0x2fd8);
    expect(mapper.read(0x0000)).toBe(0x42);
    mapper.observePpuRead?.(0x0fd8);
    expect(mapper.read(0x0000)).toBe(0x41);
  });

  it("write-protects CHR RAM until the ASIC write-enable line is asserted", () => {
    const mapper = createMapper(
      createTestCartridge({
        mapper: 90,
        nes2: true,
        prgBanks: 32,
        chrRamShift: 7,
      }),
      noopInterrupt,
    );

    mapper.write(0x0012, 0x11);
    expect(mapper.read(0x0012)).toBe(0);
    mapper.write(0xd002, 0x40);
    mapper.write(0x0012, 0x5a);
    expect(mapper.read(0x0012)).toBe(0x5a);
    mapper.write(0xd002, 0);
    mapper.write(0x0012, 0xa5);
    expect(mapper.read(0x0012)).toBe(0x5a);
  });

  it("physically inhibits ROM nametables and extended mirroring on mapper 90", () => {
    const cartridge = createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 1 });
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0xb000, 0x81);
    mapper.write(0xb004, 2);
    mapper.write(0xd000, 0x60);
    mapper.write(0xd001, 0x0b);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(mapper.mapNametableAddress?.(0x2000)).toBeUndefined();
    expect(mapper.readNametable?.(0x2000)).toBeUndefined();
    expect(mapper.captureState()).toMatchObject({ nametableBanks: [0x281, 0, 0, 0] });
  });

  it("runs the multiplier over eight M2 rises and preserves in-flight operands", () => {
    const mapper = new JyCompanyMapper(
      noopInterrupt,
      createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 1 }),
      0xc0,
    );
    mapper.writeCpuExpansion(0x5800, 3);
    mapper.writeCpuExpansion(0x5801, 5);
    expect(readMultiplier(mapper)).toBe(0);

    mapper.observeCpuBusCycle(false);
    expect(readMultiplier(mapper)).toBe(3);
    mapper.writeCpuExpansion(0x5800, 9);
    mapper.observeCpuBusCycle(false);
    expect(readMultiplier(mapper)).toBe(3);
    mapper.observeCpuBusCycle(false);
    expect(readMultiplier(mapper)).toBe(15);
    for (let cycle = 3; cycle < 8; cycle++) mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ multiplyStep: 8 });

    mapper.writeCpuExpansion(0x5801, 2);
    mapper.observeCpuBusCycle(false);
    expect(readMultiplier(mapper)).toBe(0);
    mapper.observeCpuBusCycle(false);
    expect(readMultiplier(mapper)).toBe(18);
  });

  it("implements the accumulator, test register and exact jumper reads", () => {
    const mapper = new JyCompanyMapper(
      noopInterrupt,
      createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 1 }),
      0x80,
    );
    mapper.writeCpuExpansion(0x5802, 250);
    mapper.writeCpuExpansion(0x5802, 10);
    expect(mapper.readCpuExpansion(0x5802)).toEqual({ value: 4, drivenMask: 0xff });
    mapper.writeCpuExpansion(0x5803, 0xa5);
    expect(mapper.readCpuExpansion(0x5802)).toEqual({ value: 0, drivenMask: 0xff });
    expect(mapper.readCpuExpansion(0x5803)).toEqual({ value: 0xa5, drivenMask: 0xff });

    for (const address of [0x5000, 0x5400, 0x5c00]) {
      expect(mapper.readCpuExpansion(address)).toEqual({ value: 0x80, drivenMask: 0xc0 });
    }
    expect(mapper.readCpuExpansion(0x5001)).toBeUndefined();
  });

  it("increments and decrements through the selectable IRQ prescaler", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);

    mapper.write(0xc006, 0xaa);
    mapper.write(0xc004, 0x55);
    mapper.write(0xc005, 0x55);
    mapper.write(0xc001, 0x40);
    mapper.write(0xc003, 0);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({
      irqPrescaler: 0,
      irqCounter: 0,
      irqPending: true,
    });

    mapper.write(0xc802, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqPrescaler: 0, irqEnabled: false });

    mapper.write(0xc006, 0);
    mapper.write(0xc004, 0);
    mapper.write(0xc005, 0);
    mapper.write(0xc001, 0x84);
    mapper.write(0xc003, 0);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({ irqPrescaler: 7, irqCounter: 0xff });
  });

  it("clocks IRQs from PPU A12 rises, PPU reads or CPU writes without conflating them", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);

    armOneClockDecrementIrq(mapper, 1);
    mapper.observeCpuBusCycle?.(false);
    mapper.observePpuAddress?.(0x0000);
    mapper.observePpuAddress?.(0x1000);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xc002, 0);
    armOneClockDecrementIrq(mapper, 2);
    mapper.observePpuAddress?.(0x0000);
    mapper.observePpuAddress?.(0x1000);
    expect(assertions.at(-1)).toBe(false);
    mapper.observePpuRead?.(0x3f00);
    expect(assertions.at(-1)).toBe(false);
    mapper.observePpuRead?.(0x0000);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xc002, 0);
    armOneClockDecrementIrq(mapper, 3);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle?.(true);
    expect(assertions.at(-1)).toBe(true);
  });

  it("resets the external IRQ pin and CHR latches without erasing ASIC registers", () => {
    const assertions: boolean[] = [];
    const mapper = createIrqMapper(assertions);
    mapper.write(0xd000, 0x08);
    mapper.write(0xd003, 0x80);
    mapper.observePpuRead?.(0x0fe8);
    mapper.observePpuRead?.(0x1fe8);
    armOneClockDecrementIrq(mapper, 0);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);

    mapper.reset?.();

    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({
      mode: 0x08,
      outerBank: 0x80,
      chrLatchLow: false,
      chrLatchHigh: false,
      irqEnabled: true,
      irqPending: false,
    });
  });

  it("round-trips every ASIC latch and rejects impossible snapshots", () => {
    const mapper = createMapper(
      createTestCartridge({
        mapper: 90,
        nes2: true,
        prgBanks: 32,
        chrBanks: 8,
        prgRamShift: 7,
      }),
      noopInterrupt,
    );
    mapper.write(0x8000, 0x41);
    mapper.write(0x9001, 0x23);
    mapper.write(0xa001, 1);
    mapper.write(0xb002, 0x81);
    mapper.write(0xb006, 2);
    mapper.write(0xd000, 0x9b);
    mapper.write(0xd001, 3);
    mapper.write(0xd002, 0xc0);
    mapper.write(0xd003, 0xa9);
    mapper.write(0xc001, 0x85);
    mapper.write(0xc004, 3);
    mapper.write(0xc005, 4);
    mapper.write(0xc006, 5);
    mapper.write(0xc007, 6);
    mapper.write(0xc003, 0);
    mapper.writeCpuExpansion?.(0x5800, 7);
    mapper.writeCpuExpansion?.(0x5801, 9);
    mapper.writeCpuExpansion?.(0x5802, 11);
    mapper.writeCpuExpansion?.(0x5803, 13);
    mapper.observeCpuBusCycle?.(false);
    mapper.observePpuAddress?.(0x1000);
    mapper.observePpuRead?.(0x0fe8);
    const state = mapper.captureState();
    expect(state.kind).toBe("jy-company");
    if (state.kind !== "jy-company") throw new Error("expected J.Y. Company state");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() =>
      mapper.restoreState({ ...state, board: "mapper-209" } as unknown as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, chrBanks: [0, 0, 0, 0, 0, 0, 0, 0x1_0000] } as MapperState),
    ).toThrowError(RangeError);
    expect(() => mapper.restoreState({ ...state, multiplyStep: 9 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({ ...state, irqEnabled: false, irqPending: true } as MapperState),
    ).toThrowError(RangeError);
  });

  it("accepts only mapper-90's reachable ROM, RAM and nametable geometry", () => {
    const valid = [
      { mapper: 90, prgBanks: 2, chrBanks: 1 },
      { mapper: 90, nes2: true, prgBanks: 32, chrBanks: 1 },
      { mapper: 90, nes2: true, prgBanks: 32, chrBanks: 1, prgRamShift: 7 },
      { mapper: 90, nes2: true, prgBanks: 32, chrRamShift: 7 },
    ] as const;
    for (const options of valid) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 90,
          nes2: true,
          submapper: 1,
          prgBanks: 32,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    for (const options of [
      { mapper: 90, nes2: true, prgBanks: 1, chrBanks: 1 },
      { mapper: 90, nes2: true, prgBanks: 129, chrBanks: 1 },
      { mapper: 90, nes2: true, prgBanks: 32, chrBanks: 257 },
      { mapper: 90, nes2: true, prgBanks: 32, chrBanks: 1, prgRamShift: 8 },
      { mapper: 90, nes2: true, prgBanks: 32, chrBanks: 1, fourScreen: true },
    ] as const) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).toThrowError(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createIrqMapper(assertions: boolean[]): Mapper {
  return createMapper(createTestCartridge({ mapper: 90, prgBanks: 32, chrBanks: 1 }), {
    setMapperIrq(asserted) {
      assertions.push(asserted);
    },
  });
}

function armOneClockDecrementIrq(mapper: Mapper, source: number): void {
  mapper.write(0xc006, 0);
  mapper.write(0xc004, 0);
  mapper.write(0xc005, 0);
  mapper.write(0xc001, 0x80 | source);
  mapper.write(0xc003, 0);
}

function readMultiplier(mapper: JyCompanyMapper): number {
  const low = mapper.readCpuExpansion(0x5800)?.value ?? 0;
  const high = mapper.readCpuExpansion(0x5801)?.value ?? 0;
  return low | (high << 8);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank & 0xff, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Pick<Mapper, "read">, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
