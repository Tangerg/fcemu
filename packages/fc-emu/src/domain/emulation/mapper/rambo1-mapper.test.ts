import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import type { MapperState } from "./mapper.js";
import { Rambo1Mapper } from "./rambo1-mapper.js";

describe("Rambo1Mapper", () => {
  it("maps all three switchable PRG windows and exchanges R6 with RF", () => {
    const mapper = createMapper();
    fillBanks(mapper.cartridge.prgRom, 0x2000);

    writeBank(mapper.mapper, 6, 3);
    writeBank(mapper.mapper, 7, 4);
    writeBank(mapper.mapper, 15, 5);
    mapper.mapper.write(0x9ffe, 0);

    expect(readAt(mapper.mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 4, 5, 31]);

    mapper.mapper.write(0x9ffe, 0x40);
    expect(readAt(mapper.mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 4, 3, 31]);
  });

  it("maps 2 KiB, full 1 KiB and A12-inverted CHR configurations", () => {
    const { cartridge, mapper } = createMapper();
    fillBanks(cartridge.chrRom, 0x0400);
    for (const [register, value] of [
      [0, 5],
      [1, 7],
      [2, 8],
      [3, 9],
      [4, 10],
      [5, 11],
      [8, 12],
      [9, 13],
    ] as const) {
      writeBank(mapper, register, value);
    }

    mapper.write(0x8000, 0);
    expect(readChrSlots(mapper)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);

    mapper.write(0x8000, 0x20);
    expect(readChrSlots(mapper)).toEqual([5, 12, 7, 13, 8, 9, 10, 11]);

    mapper.write(0x8000, 0xa0);
    expect(readChrSlots(mapper)).toEqual([8, 9, 10, 11, 5, 12, 7, 13]);
  });

  it("switches two-screen mirroring and leaves the PRG-RAM window open bus", () => {
    const { mapper, cartridge } = createMapper();

    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    mapper.write(0x6000, 0xa5);
    expect(mapper.read(0x6000)).toBe(0);

    mapper.write(0xbffe, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0xa000, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("filters scanline A12 rises, applies reload bias and delays IRQ output", () => {
    const assertions: boolean[] = [];
    const { mapper } = createMapper(assertions);
    mapper.write(0xc000, 2);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);

    clockA12Rise(mapper, 9);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqReloadPending: true });

    clockA12Rise(mapper, 10);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 3, irqReloadPending: false });
    clockA12Rise(mapper, 10);
    clockA12Rise(mapper, 10);
    clockA12Rise(mapper, 10);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqDelay: 4 });

    clockCpu(mapper, 3);
    expect(assertions.at(-1)).toBe(false);
    clockCpu(mapper, 1);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xe000, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({
      irqEnabled: false,
      irqDelay: 0,
      irqPending: false,
    });
  });

  it("clocks cycle-mode IRQ every fourth M2 cycle", () => {
    const assertions: boolean[] = [];
    const { mapper } = createMapper(assertions);
    mapper.write(0xc000, 1);
    mapper.write(0xc001, 1);
    mapper.write(0xe001, 0);

    clockCpu(mapper, 3);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0,
      irqDivider: 3,
      irqReloadPending: true,
    });
    clockCpu(mapper, 1);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqDivider: 0 });
    clockCpu(mapper, 4);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqDelay: 4 });
    clockCpu(mapper, 3);
    expect(assertions.at(-1)).toBe(false);
    clockCpu(mapper, 1);
    expect(assertions.at(-1)).toBe(true);
  });

  it("finishes an in-flight CPU prescaler period when switching to scanline mode", () => {
    const { mapper } = createMapper();
    mapper.write(0xc000, 4);
    mapper.write(0xc001, 1);
    clockCpu(mapper, 2);

    mapper.write(0xc001, 0);
    expect(mapper.captureState()).toMatchObject({
      irqCycleMode: false,
      irqDivider: 2,
      forceCycleClock: true,
    });
    clockCpu(mapper, 1);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqDivider: 3 });
    clockCpu(mapper, 1);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 5,
      irqDivider: 0,
      forceCycleClock: false,
    });
  });

  it("round-trips complete timing state and rejects impossible snapshots", () => {
    const { mapper } = createMapper();
    writeBank(mapper, 6, 9);
    mapper.write(0x8000, 0xe6);
    mapper.write(0xa000, 1);
    mapper.write(0xc000, 0);
    mapper.write(0xc001, 1);
    mapper.write(0xe001, 0);
    clockCpu(mapper, 5);
    const state = mapper.captureState();
    if (state.kind !== "rambo-1") throw new Error("unexpected mapper state");

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() =>
      mapper.restoreState({ ...state, registers: state.registers.slice(1) } as MapperState),
    ).toThrowError(RangeError);
    const invalidRegisters = [...state.registers];
    invalidRegisters[10] = 1;
    expect(() =>
      mapper.restoreState({ ...state, registers: invalidRegisters } as MapperState),
    ).toThrowError(RangeError);
    expect(() => mapper.restoreState({ ...state, irqDivider: 4 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({
        ...state,
        irqCycleMode: true,
        forceCycleClock: true,
      } as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, irqEnabled: false, irqDelay: 3 } as MapperState),
    ).toThrowError(RangeError);
  });
});

function createMapper(assertions: boolean[] = []) {
  const cartridge = createTestCartridge({ mapper: 64, prgBanks: 16, chrBanks: 32 });
  const mapper = new Rambo1Mapper(
    {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    },
    cartridge,
  );
  return { cartridge, mapper };
}

function writeBank(mapper: Rambo1Mapper, register: number, value: number): void {
  mapper.write(0x8000, register);
  mapper.write(0x8001, value);
}

function clockA12Rise(mapper: Rambo1Mapper, lowCycles: number): void {
  mapper.observePpuAddress(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu();
  mapper.observePpuAddress(0x1000);
}

function clockCpu(mapper: Rambo1Mapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle(false);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readChrSlots(mapper: Rambo1Mapper): number[] {
  return readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]);
}

function readAt(mapper: Rambo1Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
