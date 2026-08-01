import { describe, expect, it } from "vitest";
import { createTestCartridge, type TestRomOptions } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperState } from "./mapper.js";

describe("FFE Magic Card RAM cartridges", () => {
  it("runs mapper 6 legacy images in latch mode 1 with mutable CHR memory", () => {
    const cartridge = createTestCartridge({ mapper: 6, prgBanks: 8, chrBanks: 4 });
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x8000, (5 << 2) | 2);
    expect(readAt(mapper, [0x8000, 0xc000, 0x0000])).toEqual([5, 7, 2]);

    mapper.write(0x0010, 0xa5);
    expect(mapper.read(0x0010)).toBe(0xa5);
  });

  it("models mapper 8 as protected GNROM mode 4 rather than a separate guessed ASIC", () => {
    const cartridge = createTestCartridge({ mapper: 8, prgBanks: 8, chrBanks: 4 });
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x8000, (2 << 4) | 3);
    expect(readAt(mapper, [0x8000, 0xe000, 0x0000])).toEqual([2, 2, 3]);
    mapper.write(0x0000, 0xff);
    expect(mapper.read(0x0000)).toBe(3);
  });

  it("applies Magic Card write protection and address/data-driven mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 6, prgBanks: 8, chrBanks: 4 });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.writeCpuExpansion?.(0x42fe, 0x10);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    mapper.write(0x8000, 3);
    expect(mapper.read(0x8000)).toBe(3);

    mapper.writeCpuExpansion?.(0x42fc, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
    mapper.write(0x8000, 0xa5);
    expect(mapper.read(0x8000)).toBe(0xa5);
  });

  it("initializes mapper 17's four 8 KiB PRG windows and eight 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({
      mapper: 17,
      nes2: true,
      prgBanks: 8,
      chrBanks: 32,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = createMapper(cartridge, silentInterruptPort);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([12, 13, 14, 15]);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    mapper.writeCpuExpansion?.(0x4504, 3);
    mapper.writeCpuExpansion?.(0x4510, 9);
    expect(readAt(mapper, [0x8000, 0x0000])).toEqual([3, 9]);
  });

  it("initializes mapper 12.1 as a protected 4M card with CHR payload in PRG memory", () => {
    const cartridge = createTestCartridge({
      mapper: 12,
      nes2: true,
      submapper: 1,
      prgBanks: 16,
      chrBanks: 4,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    cartridge.chrRom.fill(0xa5);
    const mapper = createMapper(cartridge, silentInterruptPort);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([28, 29, 30, 31]);
    expect(mapper.read(0x0000)).toBe(0);
    expect(mapper.captureState()).toMatchObject({
      board: "super-magic-card-4m",
      superMode: 0x42,
      bankingMode: "4m",
      prgWriteProtected: true,
    });

    mapper.writeCpuExpansion?.(0x4504, 32);
    expect(mapper.read(0x8000)).toBe(0xa5);
    mapper.write(0x0000, 0x5a);
    expect(mapper.read(0x0000)).toBe(0x5a);
  });

  it("banks all four Super Magic Card WRAM windows independently", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 17, nes2: true, prgBanks: 2, chrBanks: 1 }),
      silentInterruptPort,
    );

    mapper.write(0x6000, 0x11);
    mapper.writeCpuExpansion?.(0x4500, 0x57);
    mapper.write(0x6000, 0x22);
    mapper.writeCpuExpansion?.(0x4500, 0x67);
    mapper.write(0x6000, 0x33);

    mapper.writeCpuExpansion?.(0x4500, 0x47);
    expect(mapper.read(0x6000)).toBe(0x11);
    mapper.writeCpuExpansion?.(0x4500, 0x57);
    expect(mapper.read(0x6000)).toBe(0x22);
    mapper.writeCpuExpansion?.(0x4500, 0x67);
    expect(mapper.read(0x6000)).toBe(0x33);
  });

  it("switches the 2M PRG registers and common 8 KiB CHR bank", () => {
    const cartridge = createTestCartridge({
      mapper: 17,
      nes2: true,
      prgBanks: 16,
      chrBanks: 4,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.writeCpuExpansion?.(0x4500, 0x46);
    mapper.writeCpuExpansion?.(0x43fe, 0);
    for (let slot = 0; slot < 4; slot++) mapper.write(0x8000 + slot * 0x2000, (5 + slot) << 2);
    mapper.write(0x8000, (5 << 2) | 3);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000, 0x0000])).toEqual([5, 6, 7, 8, 3]);
  });

  it("routes Super Magic Card CHR nametables through independent 1 KiB RAM banks", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 17, nes2: true, prgBanks: 2, chrBanks: 1 }),
      silentInterruptPort,
    );
    mapper.writeCpuExpansion?.(0x4500, 0x45);
    for (let slot = 0; slot < 4; slot++) mapper.writeCpuExpansion?.(0x4518 + slot, 0x20 + slot);

    for (let slot = 0; slot < 4; slot++) {
      expect(mapper.writeNametable?.(0x2000 + slot * 0x400 + 0x12, 0x40 + slot)).toBe(true);
    }
    expect(
      [0, 1, 2, 3].map((slot) => mapper.readNametable?.(0x2000 + slot * 0x400 + 0x12)),
    ).toEqual([0x40, 0x41, 0x42, 0x43]);

    mapper.writeCpuExpansion?.(0x4500, 0x47);
    expect(mapper.readNametable?.(0x2012)).toBeUndefined();
  });

  it("implements the optional MMC4 read-triggered CHR latches", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 17, nes2: true, prgBanks: 2, chrBanks: 1 }),
      silentInterruptPort,
    );
    mapper.writeCpuExpansion?.(0x4500, 0x43);
    mapper.writeCpuExpansion?.(0x4510, 0x10);
    mapper.writeCpuExpansion?.(0x4511, 0x10);
    mapper.writeCpuExpansion?.(0x4512, 0x20);
    mapper.writeCpuExpansion?.(0x4513, 0x20);

    mapper.write(0x0000, 0xa1);
    mapper.observePpuRead?.(0x0fe8);
    mapper.write(0x0000, 0xb2);
    expect(mapper.read(0x0000)).toBe(0xb2);
    mapper.observePpuRead?.(0x0fd8);
    expect(mapper.read(0x0000)).toBe(0xa1);
  });

  it("counts Super Magic Card IRQs from M2 or unfiltered PPU A12 rises", () => {
    let irqLine = false;
    const mapper = createMapper(
      createTestCartridge({ mapper: 17, nes2: true, prgBanks: 2, chrBanks: 1 }),
      { setMapperIrq: (asserted) => (irqLine = asserted) },
    );

    mapper.writeCpuExpansion?.(0x4502, 0xfe);
    mapper.writeCpuExpansion?.(0x4503, 0xff);
    tick(mapper, 1);
    expect(irqLine).toBe(false);
    tick(mapper, 1);
    expect(irqLine).toBe(true);
    mapper.writeCpuExpansion?.(0x4501, 0);
    expect(irqLine).toBe(false);

    mapper.writeCpuExpansion?.(0x4500, 0x4f);
    mapper.writeCpuExpansion?.(0x4502, 0xff);
    mapper.writeCpuExpansion?.(0x4503, 0xff);
    tick(mapper, 4);
    expect(irqLine).toBe(false);
    mapper.observePpuAddress?.(0x0000);
    mapper.observePpuAddress?.(0x1000);
    expect(irqLine).toBe(true);
  });

  it("provides the predecessor cards' 149⅓-cycle FDS data IRQ compatibility source", () => {
    let irqLine = false;
    const mapper = createMapper(createTestCartridge({ mapper: 6, prgBanks: 8, chrBanks: 4 }), {
      setMapperIrq: (asserted) => (irqLine = asserted),
    });

    mapper.writeCpuExpansion?.(0x4025, 0x80);
    tick(mapper, 149);
    expect(irqLine).toBe(false);
    tick(mapper, 1);
    expect(irqLine).toBe(true);
    mapper.writeCpuExpansion?.(0x4024, 0);
    expect(irqLine).toBe(false);
    tick(mapper, 149);
    expect(irqLine).toBe(true);
  });

  it("loads mapper 17 trainers at the submapper address and cold-boots there only once", () => {
    const trainer = [0xea, 0x4c, 0x00, 0x5d];
    const bus = new Bus(
      createTestCartridge({
        mapper: 17,
        nes2: true,
        submapper: 1,
        prgBanks: 2,
        chrBanks: 1,
        trainer,
      }),
    );
    const memory = new CPUMemory(bus);

    expect(bus.captureState().cpu.registers.PC).toBe(0x5d00);
    expect([0, 1, 2, 3].map((offset) => memory.read(0x5d00 + offset))).toEqual(trainer);
    bus.reset();
    expect(bus.captureState().cpu.registers.PC).toBe(0x8000);
  });

  it("calls mapper 6's trainer init at $7003 and returns to the normal reset vector", () => {
    const trainer = [0, 0, 0, 0x60];
    const bus = new Bus(
      createTestCartridge({
        mapper: 6,
        prgBanks: 8,
        chrBanks: 4,
        trainer,
        resetVector: 0x8000,
      }),
    );

    expect(bus.captureState().cpu.registers).toMatchObject({ PC: 0x7003, SP: 0xfb });
    bus.CPU.update();
    expect(bus.captureState().cpu.registers).toMatchObject({ PC: 0x8000, SP: 0xfd });
  });

  it("calls mapper 12.1's trainer at $7003 and returns to its reset vector", () => {
    const trainer = [0, 0, 0, 0x60];
    const bus = new Bus(
      createTestCartridge({
        mapper: 12,
        nes2: true,
        submapper: 1,
        prgBanks: 16,
        chrBanks: 1,
        trainer,
        resetVector: 0x8000,
      }),
    );

    expect(bus.captureState().cpu.registers).toMatchObject({ PC: 0x7003, SP: 0xfb });
    bus.CPU.update();
    expect(bus.captureState().cpu.registers).toMatchObject({ PC: 0x8000, SP: 0xfd });
  });

  it("round-trips mutable PRG/CHR/scratch memory and all active IRQ state", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 17, nes2: true, prgBanks: 4, chrBanks: 2 }),
      silentInterruptPort,
    );
    mapper.writeCpuExpansion?.(0x4504, 3);
    mapper.writeCpuExpansion?.(0x4510, 7);
    mapper.writeCpuExpansion?.(0x5000, 0x51);
    mapper.write(0x0010, 0x61);
    mapper.writeCpuExpansion?.(0x4502, 0xf0);
    mapper.writeCpuExpansion?.(0x4503, 0xff);
    tick(mapper, 4);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() =>
      mapper.restoreState({ ...state, prgMemory: new Uint8Array(1) } as MapperState),
    ).toThrowError(RangeError);
  });

  it.each([
    { mapper: 6, nes2: true, submapper: 0, prgBanks: 8, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 2, prgBanks: 16, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 3, prgBanks: 16, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 4, prgBanks: 8, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 5, prgBanks: 8, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 6, prgBanks: 8, chrBanks: 1 },
    { mapper: 6, nes2: true, submapper: 7, prgBanks: 8, chrBanks: 1 },
    { mapper: 8, prgBanks: 8, chrBanks: 4 },
    { mapper: 17, nes2: true, submapper: 0, prgBanks: 2, chrBanks: 1 },
    { mapper: 17, nes2: true, submapper: 1, prgBanks: 2, chrBanks: 1 },
    { mapper: 17, nes2: true, submapper: 2, prgBanks: 2, chrBanks: 1 },
    { mapper: 17, nes2: true, submapper: 3, prgBanks: 2, chrBanks: 1 },
    { mapper: 12, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 1 },
  ])("constructs $mapper/$submapper allocated RAM-card shapes", (options) => {
    expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).not.toThrow();
  });

  it.each([
    { mapper: 6, nes2: true, submapper: 8, prgBanks: 8, chrBanks: 1 },
    { mapper: 8, nes2: true, submapper: 1, prgBanks: 8, chrBanks: 1 },
    { mapper: 17, nes2: true, submapper: 4, prgBanks: 2, chrBanks: 1 },
    { mapper: 12, nes2: true, submapper: 2, prgBanks: 16, chrBanks: 1 },
  ])("rejects mapper $mapper unallocated submapper $submapper", (options) => {
    expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).toThrowError(
      UnsupportedMapperVariantError,
    );
  });

  it.each([
    {
      name: "mode-2 image below 256 KiB",
      options: { mapper: 6, nes2: true, submapper: 2, prgBanks: 8, chrBanks: 1 },
    },
    {
      name: "Magic Card CHR image over 32 KiB",
      options: { mapper: 6, nes2: true, submapper: 0, prgBanks: 8, chrBanks: 5 },
    },
    {
      name: "Super Magic Card PRG image over 512 KiB",
      options: { mapper: 17, nes2: true, prgBanks: 33, chrBanks: 1 },
    },
    {
      name: "Super Magic Card CHR image over 256 KiB",
      options: { mapper: 17, nes2: true, prgBanks: 2, chrBanks: 33 },
    },
    {
      name: "four-screen header",
      options: { mapper: 17, nes2: true, prgBanks: 2, chrBanks: 1, fourScreen: true },
    },
    {
      name: "mapper 12.1 PRG image crossing the packed CHR boundary",
      options: { mapper: 12, nes2: true, submapper: 1, prgBanks: 17, chrBanks: 1 },
    },
    {
      name: "mapper 12.1 CHR payload over 256 KiB",
      options: { mapper: 12, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 33 },
    },
    {
      name: "mapper 12.1 without a CHR payload",
      options: { mapper: 12, nes2: true, submapper: 1, prgBanks: 16 },
    },
  ] satisfies readonly { readonly name: string; readonly options: TestRomOptions }[])(
    "rejects $name",
    ({ options }) => {
      expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).toThrowError(
        UnsupportedMapperConfigurationError,
      );
    },
  );

  it.each([6, 8, 17])("normalizes mapper %i to 32 KiB volatile WRAM", (mapperNumber) => {
    const cartridge = createTestCartridge({
      mapper: mapperNumber,
      prgBanks: mapperNumber === 17 ? 2 : 8,
      chrBanks: mapperNumber === 17 ? 1 : 4,
    });
    expect(cartridge).toMatchObject({
      prgRamBytes: 0x8000,
      prgNvRamBytes: 0,
      hasBatteryBackup: false,
    });
  });

  it("normalizes NES 2.0 mapper 12.1 to 32 KiB volatile WRAM", () => {
    expect(
      createTestCartridge({ mapper: 12, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 1 }),
    ).toMatchObject({
      prgRamBytes: 0x8000,
      prgNvRamBytes: 0,
      hasBatteryBackup: false,
    });
  });

  it("rejects battery persistence that the physical RAM cards did not provide", () => {
    expect(() =>
      createTestCartridge({ mapper: 6, prgBanks: 8, chrBanks: 4, battery: true }),
    ).toThrow(/battery/i);
    expect(() =>
      createTestCartridge({
        mapper: 12,
        nes2: true,
        submapper: 1,
        prgBanks: 16,
        chrBanks: 1,
        battery: true,
      }),
    ).toThrow(/battery/i);
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
