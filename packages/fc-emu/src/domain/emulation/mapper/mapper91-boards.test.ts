import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { Ej0061Mapper } from "./ej-006-1-mapper.js";
import { Jy830623cMapper } from "./jy-830623c-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("mapper 91 boards", () => {
  it("maps JY830623C inner and address-selected outer PRG/CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 91, prgBanks: 32, chrBanks: 128 });
    fillBanks(cartridge.prgRom, 0x2000);
    cartridge.chrRom[5 * 0x0800] = 0x15;
    cartridge.chrRom[261 * 0x0800] = 0xa5;
    const mapper = new Jy830623cMapper(noopInterrupt, cartridge);

    mapper.write(0x6aa0, 5);
    mapper.write(0x7aa0, 3);
    mapper.write(0x7aa1, 4);
    mapper.write(0x8005, 0xff);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([35, 36, 46, 47]);
    expect(mapper.read(0x0000)).toBe(0xa5);

    mapper.write(0x8000, 0);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 4, 14, 15]);
    expect(mapper.read(0x0000)).toBe(0x15);
  });

  it("keeps JY830623C mirroring hardwired while $6004 mirrors a CHR register", () => {
    const cartridge = createTestCartridge({ mapper: 91, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge.chrRom, 0x0800);
    const mapper = new Jy830623cMapper(noopInterrupt, cartridge);

    mapper.write(0x6004, 7);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    expect(mapper.read(0x0000)).toBe(7);
  });

  it("asserts JY830623C IRQ after exactly 64 unfiltered A12 rises", () => {
    const assertions: boolean[] = [];
    const mapper = new Jy830623cMapper(
      {
        setMapperIrq(asserted) {
          assertions.push(asserted);
        },
      },
      createTestCartridge({ mapper: 91, prgBanks: 8, chrBanks: 8 }),
    );
    mapper.write(0x7007, 0);

    for (let rise = 0; rise < 63; rise++) clockA12Rise(mapper);
    expect(assertions.at(-1)).toBe(false);
    mapper.observePpuAddress(0x1000);
    expect(assertions.at(-1)).toBe(false);
    mapper.observePpuAddress(0x0000);
    mapper.observePpuAddress(0x1000);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({ irqRiseCounter: 64, irqPending: true });

    mapper.write(0x7006, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqRiseCounter: 0, irqEnabled: false });
  });

  it("maps EJ-006-1 banks without an outer latch and controls mirroring", () => {
    const cartridge = createEjCartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0800);
    const mapper = new Ej0061Mapper(noopInterrupt, cartridge);

    for (let slot = 0; slot < 4; slot++) mapper.write(0x6000 + slot, 9 + slot);
    mapper.write(0x7000, 3);
    mapper.write(0x7001, 4);
    mapper.write(0x8005, 0xff);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([3, 4, 14, 15]);
    expect(readAt(mapper, [0x0000, 0x0800, 0x1000, 0x1800])).toEqual([9, 10, 11, 12]);
    mapper.write(0x6005, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0x6004, 0xff);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("clocks EJ-006-1 by five every fourth M2 cycle and asserts on borrow", () => {
    const assertions: boolean[] = [];
    const mapper = new Ej0061Mapper(
      {
        setMapperIrq(asserted) {
          assertions.push(asserted);
        },
      },
      createEjCartridge(),
    );
    mapper.write(0x6006, 10);
    mapper.write(0x6007, 0);
    mapper.write(0x7007, 0);

    clockCpu(mapper, 3);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 10, irqDivider: 3 });
    clockCpu(mapper, 1);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 5, irqDivider: 0 });
    clockCpu(mapper, 4);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0 });
    clockCpu(mapper, 4);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0xfffb, irqPending: true });

    mapper.write(0x7006, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqDivider: 0, irqEnabled: false });
  });

  it("round-trips each board's distinct state and rejects cross-board invariants", () => {
    const jy = new Jy830623cMapper(
      noopInterrupt,
      createTestCartridge({ mapper: 91, prgBanks: 32, chrBanks: 128 }),
    );
    jy.write(0x6000, 9);
    jy.write(0x7000, 5);
    jy.write(0x8007, 0);
    jy.write(0x7007, 0);
    for (let rise = 0; rise < 64; rise++) clockA12Rise(jy);
    const jyState = jy.captureState();
    jy.powerOn();
    jy.restoreState(jyState);
    expect(jy.captureState()).toEqual(jyState);
    expect(() => jy.restoreState({ ...jyState, outerBank: 8 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      jy.restoreState({ ...jyState, irqEnabled: false, irqPending: true } as MapperState),
    ).toThrowError(RangeError);

    const ej = new Ej0061Mapper(noopInterrupt, createEjCartridge());
    ej.write(0x6000, 9);
    ej.write(0x6005, 0);
    ej.write(0x6006, 0x34);
    ej.write(0x6007, 0x12);
    ej.write(0x7007, 0);
    clockCpu(ej, 2);
    const ejState = ej.captureState();
    ej.powerOn();
    ej.restoreState(ejState);
    expect(ej.captureState()).toEqual(ejState);
    expect(() => ej.restoreState({ ...ejState, outerBank: 1 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => ej.restoreState({ ...ejState, irqDivider: 4 } as MapperState)).toThrowError(
      RangeError,
    );
  });
});

function createEjCartridge() {
  return createTestCartridge({
    mapper: 91,
    nes2: true,
    submapper: 1,
    prgBanks: 8,
    chrBanks: 64,
  });
}

function clockA12Rise(mapper: Jy830623cMapper): void {
  mapper.observePpuAddress(0x0000);
  mapper.observePpuAddress(0x1000);
}

function clockCpu(mapper: Ej0061Mapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle(false);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
