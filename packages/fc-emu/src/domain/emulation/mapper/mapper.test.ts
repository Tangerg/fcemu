import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import { Mmc1Mapper } from "./mmc1-mapper.js";
import type { Mapper } from "./mapper.js";
import { NromMapper } from "./nrom-mapper.js";
import { UnsupportedMapperError, UnsupportedMapperVariantError } from "./mapper-errors.js";
import { UxromMapper } from "./uxrom-mapper.js";

describe("cartridge mappers", () => {
  it("keeps NROM PRG and CHR ROM read-only", () => {
    const cartridge = createTestCartridge({ chrBanks: 1 });
    cartridge.prgRom[0] = 0x11;
    cartridge.chrRom[0] = 0x22;
    const mapper = new NromMapper(cartridge);

    mapper.write(0x8000, 0xaa);
    mapper.write(0x0000, 0xbb);

    expect(mapper.read(0x8000)).toBe(0x11);
    expect(mapper.read(0x0000)).toBe(0x22);
  });

  it("allows pattern writes only when an NROM cartridge owns CHR RAM", () => {
    const mapper = new NromMapper(createTestCartridge({ chrBanks: 0 }));
    mapper.write(0x0010, 0x7a);
    expect(mapper.read(0x0010)).toBe(0x7a);
  });

  it("tracks changed save-RAM writes without exposing mutable storage", () => {
    const cartridge = createTestCartridge({ battery: true });
    const mapper = new NromMapper(cartridge);
    mapper.write(0x6000, 0);
    expect(cartridge.captureBatterySave()?.revision).toBe(0);

    mapper.write(0x6000, 0x7a);
    const snapshot = cartridge.captureBatterySave();
    expect(snapshot).toMatchObject({ revision: 1 });
    if (!snapshot) throw new Error("Expected battery save");
    snapshot.data[0] = 0;
    expect(mapper.read(0x6000)).toBe(0x7a);
  });

  it("uses generic no-conflict UxROM switching while keeping the last bank fixed", () => {
    const cartridge = createTestCartridge({ mapper: 2, prgBanks: 2 });
    cartridge.prgRom.fill(0x11, 0, 16_384);
    cartridge.prgRom.fill(0x22, 16_384);
    const mapper = new UxromMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x11);
    expect(mapper.read(0xc000)).toBe(0x22);
    cartridge.prgRom[1] = 0;
    mapper.write(0x8001, 1);
    expect(mapper.read(0x8000)).toBe(0x22);
    expect(mapper.read(0xc000)).toBe(0x22);
  });

  it("switches MMC1 PRG banks through its serial register", () => {
    const cartridge = createTestCartridge({ mapper: 1, prgBanks: 4 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.prgRom.fill(0x10 + bank, bank * 0x4000, (bank + 1) * 0x4000);
    }
    const mapper = new Mmc1Mapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0x10);
    expect(mapper.read(0xc000)).toBe(0x13);
    writeMmc1Register(mapper, 0xe000, 2);
    expect(mapper.read(0x8000)).toBe(0x12);
    expect(mapper.read(0xc000)).toBe(0x13);
  });

  it("uses the MMC1 CHR output as SUROM's 256 KiB outer PRG bank", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper: 1,
      prgBanks: 32,
      battery: true,
      prgNvRamShift: 7,
    });
    cartridge.prgRom.fill(0x10, 0, 0x4000);
    cartridge.prgRom.fill(0x1f, 15 * 0x4000, 16 * 0x4000);
    cartridge.prgRom.fill(0x20, 16 * 0x4000, 17 * 0x4000);
    cartridge.prgRom.fill(0x2f, 31 * 0x4000, 32 * 0x4000);
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    expect(mapper.read(0x8000)).toBe(0x10);
    expect(mapper.read(0xc000)).toBe(0x1f);
    writeMmc1Register(mapper, 0xa000, 0x10);
    expect(mapper.read(0x8000)).toBe(0x20);
    expect(mapper.read(0xc000)).toBe(0x2f);

    mapper.powerOn();
    expect(mapper.read(0x8000)).toBe(0x10);
    expect(mapper.read(0xc000)).toBe(0x1f);
  });

  it("banks SZROM volatile and battery PRG memory without persisting volatile bytes", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      prgBanks: 8,
      chrBanks: 2,
      battery: true,
      prgRamShift: 7,
      prgNvRamShift: 7,
    });
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x6000, 0x11);
    writeMmc1Register(mapper, 0xa000, 0x10);
    mapper.write(0x6000, 0x22);

    expect(mapper.read(0x6000)).toBe(0x22);
    expect(cartridge.captureBatterySave()).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ 0: 0x22 }),
    });
    writeMmc1Register(mapper, 0xa000, 0);
    expect(mapper.read(0x6000)).toBe(0x11);
  });

  it("uses MMC1 CHR A15 to select SOROM's two 8 KiB PRG-RAM banks", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper: 2,
      prgBanks: 8,
      battery: true,
      prgRamShift: 7,
      prgNvRamShift: 7,
    });
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x6001, 0x31);
    writeMmc1Register(mapper, 0xa000, 0x08);
    mapper.write(0x6001, 0x32);

    expect(mapper.read(0x6001)).toBe(0x32);
    writeMmc1Register(mapper, 0xa000, 0);
    expect(mapper.read(0x6001)).toBe(0x31);
  });

  it("uses two MMC1 CHR output bits to select all four SXROM PRG-RAM banks", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper: 4,
      prgBanks: 8,
      prgRamShift: 9,
    });
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    for (let bank = 0; bank < 4; bank++) {
      writeMmc1Register(mapper, 0xa000, bank << 2);
      mapper.write(0x6002, 0x40 + bank);
    }
    for (let bank = 0; bank < 4; bank++) {
      writeMmc1Register(mapper, 0xa000, bank << 2);
      expect(mapper.read(0x6002)).toBe(0x40 + bank);
    }
  });

  it("honors SNROM's redundant CHR-bank WRAM disable", () => {
    const mapper = createMapper(
      createTestCartridge({
        nes2: true,
        mapper: 1,
        prgBanks: 8,
        prgRamShift: 7,
      }),
      { setMapperIrq() {} },
    );
    mapper.write(0x6000, 0x31);

    writeMmc1Register(mapper, 0xa000, 0x10);
    mapper.write(0x6000, 0x42);
    expect(mapper.read(0x6000)).toBe(0);

    writeMmc1Register(mapper, 0xa000, 0);
    expect(mapper.read(0x6000)).toBe(0x31);
  });

  it("ignores PRG banking writes on SEROM/SHROM/SH1ROM submapper 5", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 1,
      submapper: 5,
      prgBanks: 2,
      chrBanks: 1,
    });
    cartridge.prgRom.fill(0x11, 0, 0x4000);
    cartridge.prgRom.fill(0x22, 0x4000, 0x8000);
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    writeMmc1Register(mapper, 0x8000, 0x08);
    writeMmc1Register(mapper, 0xe000, 1);

    expect(mapper.read(0x8000)).toBe(0x11);
    expect(mapper.read(0xc000)).toBe(0x22);
  });

  it("maps CHR NVRAM through mapper reads and writes", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      battery: true,
      prgNvRamShift: 0,
      chrRamShift: 0,
      chrNvRamShift: 7,
    });
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x0010, 0x55);

    expect(mapper.read(0x0010)).toBe(0x55);
    expect(cartridge.captureBatterySave()?.data[0x10]).toBe(0x55);
  });

  it("applies MMC1 mirroring and separate four-kibibyte CHR banks", () => {
    const cartridge = createTestCartridge({ mapper: 1, chrBanks: 2 });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.chrRom.fill(0x20 + bank, bank * 0x1000, (bank + 1) * 0x1000);
    }
    const mapper = new Mmc1Mapper(cartridge);

    writeMmc1Register(mapper, 0x8000, 0x1d);
    writeMmc1Register(mapper, 0xa000, 1);
    writeMmc1Register(mapper, 0xc000, 3);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(mapper.read(0x0000)).toBe(0x21);
    expect(mapper.read(0x1000)).toBe(0x23);
  });

  it("clocks MMC3 IRQs only after a filtered PPU A12 rising edge", () => {
    const bus = new Bus(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }));
    const mapper = bus.Mapper;
    mapper.write(0xc000, 1);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);

    clockMmc3A12(mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(false);

    clockMmc3A12(mapper, 9);
    expect(bus.CPU.hasPendingIRQ).toBe(false);

    clockMmc3A12(mapper, 10);
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    mapper.write(0xe000, 0);
    expect(bus.CPU.isIRQLineAsserted).toBe(false);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("honors MMC3 PRG-RAM enable and write-protect bits", () => {
    const mapper = createMapper(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq() {},
    });
    mapper.write(0x6000, 0x11);

    mapper.write(0xa001, 0xc0);
    mapper.write(0x6000, 0x22);
    expect(mapper.read(0x6000)).toBe(0x11);

    mapper.write(0xa001, 0);
    expect(mapper.read(0x6000)).toBe(0);

    mapper.write(0xa001, 0x80);
    mapper.write(0x6000, 0x33);
    expect(mapper.read(0x6000)).toBe(0x33);

    mapper.write(0xa001, 0xc0);
    mapper.powerOn();
    mapper.write(0x6000, 0x44);
    expect(mapper.read(0x6000)).toBe(0x44);
  });

  it("keeps independently asserted IRQ sources isolated", () => {
    const bus = new Bus(createTestCartridge());
    bus.setIRQSource("apu-frame", true);
    bus.setIRQSource("mapper", true);
    bus.setIRQSource("mapper", false);
    expect(bus.CPU.isIRQLineAsserted).toBe(true);

    bus.setIRQSource("apu-frame", false);
    expect(bus.CPU.isIRQLineAsserted).toBe(false);
  });

  it("round-trips every supported mapper's complete latch and timing state", () => {
    const interruptPort = { setMapperIrq() {} };
    const nrom = createMapper(createTestCartridge(), interruptPort);
    const uxrom = createMapper(createTestCartridge({ mapper: 2, prgBanks: 2 }), interruptPort);
    uxrom.write(0x8000, 1);
    const cnrom = createMapper(
      createTestCartridge({ nes2: true, mapper: 3, submapper: 1, chrBanks: 2 }),
      interruptPort,
    );
    cnrom.write(0x8000, 1);
    const axrom = createMapper(createTestCartridge({ mapper: 7, prgBanks: 2 }), interruptPort);
    axrom.write(0x8000, 0x10);
    const bnromCartridge = createTestCartridge({ mapper: 34, prgBanks: 8 });
    bnromCartridge.prgRom[0] = 3;
    const bnrom = createMapper(bnromCartridge, interruptPort);
    bnrom.write(0x8000, 3);
    const nina001 = createMapper(
      createTestCartridge({ mapper: 34, prgBanks: 4, chrBanks: 2 }),
      interruptPort,
    );
    nina001.write(0x7ffd, 1);
    nina001.write(0x7ffe, 1);
    const mmc1 = createMapper(createTestCartridge({ mapper: 1, prgBanks: 4 }), interruptPort);
    mmc1.write(0xe000, 1);
    mmc1.write(0xe000, 0);
    const mmc3 = createMapper(
      createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }),
      interruptPort,
    );
    mmc3.write(0x8000, 0xc6);
    mmc3.write(0x8001, 1);
    mmc3.write(0xa001, 0xc0);
    mmc3.write(0xc000, 3);
    mmc3.write(0xc001, 0);
    mmc3.write(0xe001, 0);
    clockMmc3A12(mmc3, 10);

    for (const mapper of [nrom, uxrom, cnrom, axrom, bnrom, nina001, mmc1, mmc3]) {
      const state = mapper.captureState();
      mapper.powerOn();
      mapper.restoreState(state);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("rejects unknown iNES mapper numbers at the mapper factory boundary", () => {
    const cartridge = createTestCartridge({ mapper: 99 });

    expect(() => createMapper(cartridge, { setMapperIrq() {} })).toThrowError(
      new UnsupportedMapperError(99),
    );
  });

  it("uses NES 2.0 CNROM submappers to select bus-conflict behavior", () => {
    const withoutConflicts = createTestCartridge({
      nes2: true,
      mapper: 3,
      submapper: 1,
      prgBanks: 2,
      chrBanks: 4,
    });
    const withConflicts = createTestCartridge({
      nes2: true,
      mapper: 3,
      submapper: 2,
      prgBanks: 2,
      chrBanks: 4,
    });
    for (const cartridge of [withoutConflicts, withConflicts]) {
      cartridge.prgRom[0] = 0x02;
      for (let bank = 0; bank < 4; bank++) {
        cartridge.chrRom.fill(0x20 + bank, bank * 0x2000, (bank + 1) * 0x2000);
      }
    }

    const noConflictMapper = createMapper(withoutConflicts, { setMapperIrq() {} });
    noConflictMapper.write(0x8000, 3);
    const conflictMapper = createMapper(withConflicts, { setMapperIrq() {} });
    conflictMapper.write(0x8000, 3);

    expect(noConflictMapper.read(0)).toBe(0x23);
    expect(conflictMapper.read(0)).toBe(0x22);
  });

  it("mirrors CNROM's explicitly declared 2 KiB PRG RAM through its 8 KiB window", () => {
    const mapper = createMapper(
      createTestCartridge({
        nes2: true,
        mapper: 3,
        submapper: 1,
        chrBanks: 1,
        prgRamShift: 5,
      }),
      { setMapperIrq() {} },
    );

    mapper.write(0x6000, 0x61);
    expect(mapper.read(0x6800)).toBe(0x61);
    mapper.write(0x7fff, 0x7f);
    expect(mapper.read(0x67ff)).toBe(0x7f);
  });

  it("applies explicit AND conflicts to NES 2.0 AxROM submapper 2", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 7,
      submapper: 2,
      prgBanks: 4,
    });
    cartridge.prgRom.fill(0x11, 0, 0x8000);
    cartridge.prgRom.fill(0x22, 0x8000);
    cartridge.prgRom[1] = 0;
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x8001, 1);

    expect(mapper.read(0x8000)).toBe(0x11);
  });

  it("rejects mapper subvariants whose hardware behavior is not modeled", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 3,
      submapper: 3,
      chrBanks: 1,
    });

    expect(() => createMapper(cartridge, { setMapperIrq() {} })).toThrowError(
      new UnsupportedMapperVariantError(3, 3),
    );
  });

  it.each([
    [
      "UxROM with unreachable 16 KiB CHR RAM",
      { nes2: true, mapper: 2, submapper: 1, prgBanks: 2, chrRamShift: 8 },
    ],
    ["AxROM with PRG RAM", { nes2: true, mapper: 7, submapper: 1, prgBanks: 2, prgRamShift: 7 }],
    [
      "MMC3 with a partial direct PRG-RAM window",
      { nes2: true, mapper: 4, prgBanks: 2, chrBanks: 1, prgRamShift: 5 },
    ],
    [
      "AxROM beyond its sixteen 32 KiB bank extension",
      { nes2: true, mapper: 7, submapper: 1, prgBanks: 34 },
    ],
    [
      "AxROM with CHR ROM instead of its fixed CHR RAM",
      { nes2: true, mapper: 7, submapper: 1, prgBanks: 2, chrBanks: 1 },
    ],
    ["MMC3 beyond its 512 KiB PRG capacity", { nes2: true, mapper: 4, prgBanks: 33, chrBanks: 1 }],
    ["MMC3 beyond its 256 KiB CHR capacity", { nes2: true, mapper: 4, prgBanks: 2, chrBanks: 33 }],
  ] as const)("rejects %s instead of exposing unreachable memory", (_name, options) => {
    const cartridge = createTestCartridge(options);
    expect(() => createMapper(cartridge, { setMapperIrq() {} })).toThrow(
      expect.objectContaining({ mapperNumber: options.mapper }),
    );
  });
});

function writeMmc1Register(mapper: Mapper, address: number, value: number): void {
  for (let bit = 0; bit < 5; bit++) mapper.write(address, value >> bit);
}

function clockMmc3A12(mapper: Mapper, lowCycles: number): void {
  mapper.observePpuAddress(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu();
  mapper.observePpuAddress(0x1000);
}
