import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperState } from "./mapper.js";

describe("Konami VRC2/VRC4", () => {
  it("maps VRC4's two PRG registers, swap mode, 9-bit CHR registers and four mirroring modes", () => {
    const cartridge = createTestCartridge({
      mapper: 23,
      nes2: true,
      submapper: 1,
      prgBanks: 16,
      chrBanks: 64,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    cartridge.chrRom[0x1ff * 0x0400] = 0xa1;
    cartridge.chrRom[0x24 * 0x0400] = 0x24;
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x8000, 5);
    mapper.write(0xa000, 6);
    mapper.write(0xb000, 0x0f);
    mapper.write(0xb001, 0x1f);
    mapper.write(0xb002, 0x04);
    mapper.write(0xb003, 0x02);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 6, 30, 31]);
    expect(readAt(mapper, [0x0000, 0x0400])).toEqual([0xa1, 0x24]);

    mapper.write(0x9000, 3);
    mapper.write(0x9002, 2);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([30, 6, 5, 31]);
  });

  it("keeps exact VRC2b free of VRC4-only banking, mirroring and IRQ capabilities", () => {
    const irqLines: boolean[] = [];
    const cartridge = createTestCartridge({
      mapper: 23,
      nes2: true,
      submapper: 3,
      prgBanks: 16,
      chrBanks: 32,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    cartridge.chrRom[0xff * 0x0400] = 0xcc;
    const mapper = createMapper(cartridge, { setMapperIrq: (asserted) => irqLines.push(asserted) });

    mapper.write(0x8000, 5);
    mapper.write(0xa000, 6);
    mapper.write(0x9002, 3);
    mapper.write(0xb000, 0x0f);
    mapper.write(0xb001, 0x1f);
    mapper.write(0xf000, 0x0f);
    mapper.write(0xf001, 0x0f);
    mapper.write(0xf002, 0x07);
    tick(mapper, 4);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 6, 30, 31]);
    expect(mapper.read(0x0000)).toBe(0xcc);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    expect(irqLines).toEqual([]);
    expect(vrcState(mapper).irq).toBeNull();
  });

  it("models VRC2a's swapped register pins and ignored CHR A10 bank bit", () => {
    const cartridge = createTestCartridge({
      mapper: 22,
      nes2: true,
      prgBanks: 4,
      chrBanks: 16,
    });
    cartridge.chrRom[0x7f * 0x0400] = 0x7f;
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0xb000, 0x0e);
    mapper.write(0xb002, 0x0f);
    expect(mapper.read(0x0000)).toBe(0x7f);

    mapper.write(0xb000, 0x0f);
    expect(mapper.read(0x0000)).toBe(0x7f);
  });

  it("runs VRC IRQs in cycle mode and applies enable-after-acknowledge", () => {
    let irqLine = false;
    const mapper = createMapper(
      createTestCartridge({
        mapper: 23,
        nes2: true,
        submapper: 1,
        prgBanks: 4,
        chrBanks: 1,
      }),
      { setMapperIrq: (asserted) => (irqLine = asserted) },
    );

    mapper.write(0xf000, 0x0d);
    mapper.write(0xf001, 0x0f);
    mapper.write(0xf002, 0x06);
    tick(mapper, 2);
    expect(irqLine).toBe(false);
    tick(mapper, 1);
    expect(irqLine).toBe(true);
    expect(vrcState(mapper).irq).toMatchObject({ counter: 0xfd, pending: true });

    mapper.write(0xf003, 0);
    expect(irqLine).toBe(false);
    tick(mapper, 4);
    expect(vrcState(mapper).irq).toMatchObject({ counter: 0xfd, enabled: false });

    mapper.write(0xf002, 0x07);
    tick(mapper, 3);
    mapper.write(0xf003, 0);
    expect(vrcState(mapper).irq).toMatchObject({ counter: 0xfd, enabled: true, pending: false });
    tick(mapper, 1);
    expect(vrcState(mapper).irq).toMatchObject({ counter: 0xfe, enabled: true });
  });

  it("divides VRC scanline IRQ clocks into the 114, 114, 113 CPU-cycle sequence", () => {
    let irqLine = false;
    const mapper = createMapper(
      createTestCartridge({
        mapper: 21,
        nes2: true,
        submapper: 1,
        prgBanks: 4,
        chrBanks: 1,
      }),
      { setMapperIrq: (asserted) => (irqLine = asserted) },
    );

    mapper.write(0xf000, 0x0e);
    mapper.write(0xf002, 0x0f);
    mapper.write(0xf004, 0x02);
    tick(mapper, 227);
    expect(irqLine).toBe(false);
    tick(mapper, 1);
    expect(irqLine).toBe(true);
    expect(vrcState(mapper).irq).toMatchObject({ counter: 0xfe, prescaler: 339 });
  });

  it("gates and mirrors VRC4's internal 2 KiB RAM while leaving $7000 open bus", () => {
    const cartridge = createTestCartridge({
      mapper: 23,
      nes2: true,
      submapper: 1,
      prgBanks: 4,
      chrBanks: 1,
      prgRamShift: 5,
    });
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x6000, 0x11);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
    mapper.write(0x9002, 1);
    mapper.write(0x6000, 0x22);

    expect(mapper.read(0x6800)).toBe(0x22);
    expect(mapper.cpuReadDriveMask?.(0x6800)).toBe(0xff);
    expect(mapper.cpuReadDriveMask?.(0x7000)).toBe(0);
  });

  it("exposes VRC2b's physical one-bit latch without fabricating other data-bus bits", () => {
    const cartridge = createTestCartridge({
      mapper: 23,
      nes2: true,
      submapper: 3,
      prgBanks: 4,
      chrBanks: 1,
    });
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x6000, 1);
    memory.write(0x0000, 0xa4);
    expect(memory.read(0x6000)).toBe(0xa5);
    expect(memory.read(0x7000)).toBe(0xa5);

    memory.write(0x6000, 0);
    memory.write(0x0000, 0xa4);
    expect(memory.read(0x6000)).toBe(0xa4);
  });

  it("round-trips board, banking, RAM control and IRQ state and rejects foreign snapshots", () => {
    const mapper = createMapper(
      createTestCartridge({
        mapper: 25,
        nes2: true,
        submapper: 2,
        prgBanks: 8,
        chrBanks: 8,
        prgRamShift: 7,
      }),
      silentInterruptPort,
    );
    mapper.write(0x8000, 7);
    mapper.write(0xb008, 9);
    mapper.write(0x9004, 3);
    mapper.write(0xf000, 0x0a);
    mapper.write(0xf008, 0x0b);
    mapper.write(0xf004, 0x07);
    tick(mapper, 12);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, board: "vrc4b" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, irq: null } as MapperState)).toThrowError(
      RangeError,
    );
  });

  it.each([
    [21, 0],
    [21, 1],
    [21, 2],
    [22, 0],
    [23, 0],
    [23, 1],
    [23, 2],
    [23, 3],
    [25, 0],
    [25, 1],
    [25, 2],
    [25, 3],
  ])("constructs allocated mapper %i submapper %i variants", (mapperNumber, submapper) => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: mapperNumber,
          nes2: true,
          submapper,
          prgBanks: 4,
          chrBanks: 1,
        }),
        silentInterruptPort,
      ),
    ).not.toThrow();
  });

  it.each([
    [21, 3],
    [22, 1],
    [23, 4],
    [25, 4],
  ])("rejects unallocated mapper %i submapper %i variants", (mapperNumber, submapper) => {
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: mapperNumber,
          nes2: true,
          submapper,
          prgBanks: 4,
          chrBanks: 1,
        }),
        silentInterruptPort,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
  });

  it.each([
    { name: "VRC2a CHR over 128 KiB", options: { mapper: 22, nes2: true, chrBanks: 17 } },
    {
      name: "VRC2b CHR over 256 KiB",
      options: { mapper: 23, nes2: true, submapper: 3, chrBanks: 33 },
    },
    {
      name: "VRC4 CHR over 512 KiB",
      options: { mapper: 21, nes2: true, submapper: 1, chrBanks: 65 },
    },
    { name: "PRG over 256 KiB", options: { mapper: 21, nes2: true, prgBanks: 17, chrBanks: 1 } },
    { name: "CHR RAM", options: { mapper: 21, nes2: true, prgBanks: 4 } },
    {
      name: "VRC4 4 KiB RAM",
      options: { mapper: 21, nes2: true, prgBanks: 4, chrBanks: 1, prgRamShift: 6 },
    },
    {
      name: "VRC2 2 KiB RAM",
      options: { mapper: 23, nes2: true, submapper: 3, prgBanks: 4, chrBanks: 1, prgRamShift: 5 },
    },
    {
      name: "four-screen memory",
      options: { mapper: 21, nes2: true, prgBanks: 4, chrBanks: 1, fourScreen: true },
    },
  ])("rejects $name configurations", ({ options }) => {
    expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).toThrowError(
      UnsupportedMapperConfigurationError,
    );
  });

  it.each([21, 22, 23, 25])("keeps legacy mapper %i images loadable", (mapperNumber) => {
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: mapperNumber, prgBanks: 4, chrBanks: 1 }),
        silentInterruptPort,
      ),
    ).not.toThrow();
  });
});

const silentInterruptPort = { setMapperIrq() {} };

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank & 0xff, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}

function tick(mapper: Mapper, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) mapper.observeCpuBusCycle?.(false);
}

function vrcState(mapper: Mapper): Extract<MapperState, { readonly kind: "vrc2-vrc4" }> {
  const state = mapper.captureState();
  if (state.kind !== "vrc2-vrc4") throw new Error("Expected VRC2/VRC4 state");
  return state;
}
