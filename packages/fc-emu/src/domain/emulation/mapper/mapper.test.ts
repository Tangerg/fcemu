import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import { Mmc1Mapper } from "./mmc1-mapper.js";
import type { Mapper, MapperState } from "./mapper.js";
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

  it("round-trips an asserted MMC3 IRQ output", () => {
    let irqAsserted = false;
    const mapper = createMapper(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq: (asserted) => (irqAsserted = asserted),
    });
    mapper.write(0xc000, 0);
    mapper.write(0xc001, 0);
    mapper.write(0xe001, 0);
    clockMmc3A12(mapper, 10);
    const snapshot = mapper.captureState();

    expect(snapshot).toMatchObject({ kind: "mmc3", irqEnable: true, irqPending: true });
    expect(irqAsserted).toBe(true);

    mapper.write(0xe000, 0);
    expect(irqAsserted).toBe(false);
    mapper.restoreState(snapshot);

    expect(irqAsserted).toBe(true);
    expect(mapper.captureState()).toEqual(snapshot);
  });

  it.each([
    "reloadPending",
    "irqEnable",
    "irqPending",
    "prgRamEnabled",
    "prgRamWritable",
    "a12High",
  ] as const)("rejects a non-boolean MMC3 %s save-state field", (field) => {
    const mapper = createMapper(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq() {},
    });
    const corrupted = { ...mapper.captureState(), [field]: 1 } as unknown as MapperState;

    expect(() => mapper.restoreState(corrupted)).toThrow(/invalid timing or register state/i);
  });

  it("rejects an asserted MMC3 IRQ whose generator is disabled", () => {
    const mapper = createMapper(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }), {
      setMapperIrq() {},
    });
    const corrupted = {
      ...mapper.captureState(),
      irqPending: true,
    } as MapperState;

    expect(() => mapper.restoreState(corrupted)).toThrow(/invalid timing or register state/i);
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

  it("round-trips representative mapper latch and timing states", () => {
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
    const gxromCartridge = createTestCartridge({ mapper: 66, prgBanks: 4, chrBanks: 2 });
    gxromCartridge.prgRom[0] = 0xff;
    const gxrom = createMapper(gxromCartridge, interruptPort);
    gxrom.write(0x8000, 0x11);
    const colorDreamsCartridge = createTestCartridge({ mapper: 11, prgBanks: 4, chrBanks: 4 });
    colorDreamsCartridge.prgRom[0] = 0xff;
    const colorDreams = createMapper(colorDreamsCartridge, interruptPort);
    colorDreams.write(0x8000, 0x21);
    const cpromCartridge = createTestCartridge({
      mapper: 13,
      nes2: true,
      prgBanks: 2,
      chrBanks: 0,
      chrRamShift: 8,
    });
    cpromCartridge.prgRom[0] = 0xff;
    const cprom = createMapper(cpromCartridge, interruptPort);
    cprom.write(0x8000, 0x02);
    const codemasters = createMapper(
      createTestCartridge({ nes2: true, mapper: 71, submapper: 1, prgBanks: 4 }),
      interruptPort,
    );
    codemasters.write(0xc000, 0x02);
    codemasters.write(0x9000, 0x10);
    const mmc2 = createMapper(
      createTestCartridge({ mapper: 9, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    mmc2.write(0xa000, 5);
    mmc2.write(0xb000, 1);
    mmc2.observePpuRead?.(0x0fe8);
    mmc2.write(0xf000, 1);
    const mmc4 = createMapper(
      createTestCartridge({ mapper: 10, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    mmc4.write(0xa000, 3);
    mmc4.write(0xc000, 2);
    mmc4.observePpuRead?.(0x0fe8);
    mmc4.write(0xf000, 1);
    const bandai70 = createMapper(
      createTestCartridge({ mapper: 70, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    bandai70.write(0x8000, 0x35);
    const bandai152 = createMapper(
      createTestCartridge({ mapper: 152, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    bandai152.write(0x8000, 0xb5);
    const jaleco = createMapper(
      createTestCartridge({ mapper: 87, prgBanks: 2, chrBanks: 4 }),
      interruptPort,
    );
    jaleco.write(0x6000, 0x03);
    const namco118 = createMapper(
      createTestCartridge({ mapper: 206, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    namco118.write(0x8000, 0);
    namco118.write(0x8001, 4);
    namco118.write(0x8000, 6);
    namco118.write(0x8001, 3);
    const fme7 = createMapper(
      createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    fme7.write(0x8000, 0x09);
    fme7.write(0xa000, 4);
    fme7.write(0x8000, 0x0c);
    fme7.write(0xa000, 2);
    fme7.write(0x8000, 0x0e);
    fme7.write(0xa000, 0x34);
    fme7.write(0x8000, 0x0d);
    fme7.write(0xa000, 0x81);
    const taito33 = createMapper(
      createTestCartridge({ mapper: 33, prgBanks: 8, chrBanks: 8 }),
      interruptPort,
    );
    taito33.write(0x8000, 0x45);
    taito33.write(0x8001, 3);
    taito33.write(0x8002, 4);
    taito33.write(0xa003, 7);
    const irem78Cartridge = createTestCartridge({
      nes2: true,
      mapper: 78,
      submapper: 3,
      prgBanks: 8,
      chrBanks: 16,
    });
    irem78Cartridge.prgRom[0] = 0xff;
    const irem78 = createMapper(irem78Cartridge, interruptPort);
    irem78.write(0x8000, 0x29);
    const un1romCartridge = createTestCartridge({ mapper: 94, prgBanks: 8 });
    un1romCartridge.prgRom[0] = 0xff;
    const un1rom = createMapper(un1romCartridge, interruptPort);
    un1rom.write(0x8000, 0x14);
    const invertedUxromCartridge = createTestCartridge({ mapper: 180, prgBanks: 8 });
    invertedUxromCartridge.prgRom[0] = 0xff;
    const invertedUxrom = createMapper(invertedUxromCartridge, interruptPort);
    invertedUxrom.write(0x8000, 5);

    for (const mapper of [
      nrom,
      uxrom,
      cnrom,
      axrom,
      bnrom,
      nina001,
      mmc1,
      mmc3,
      gxrom,
      colorDreams,
      cprom,
      codemasters,
      mmc2,
      mmc4,
      bandai70,
      bandai152,
      jaleco,
      namco118,
      fme7,
      taito33,
      irem78,
      un1rom,
      invertedUxrom,
    ]) {
      const state = mapper.captureState();
      mapper.powerOn();
      mapper.restoreState(state);
      expect(mapper.captureState()).toEqual(state);
    }
  });

  it("rejects unknown iNES mapper numbers at the mapper factory boundary", () => {
    const cartridge = createTestCartridge({ mapper: 100 });

    expect(() => createMapper(cartridge, { setMapperIrq() {} })).toThrowError(
      new UnsupportedMapperError(100),
    );
  });

  it("uses the legacy CNROM compatibility policy and NES 2.0 conflict variants", () => {
    const legacy = createTestCartridge({
      mapper: 3,
      prgBanks: 2,
      chrBanks: 4,
    });
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
    for (const cartridge of [legacy, withoutConflicts, withConflicts]) {
      cartridge.prgRom[0] = 0x02;
      for (let bank = 0; bank < 4; bank++) {
        cartridge.chrRom.fill(0x20 + bank, bank * 0x2000, (bank + 1) * 0x2000);
      }
    }

    const legacyMapper = createMapper(legacy, { setMapperIrq() {} });
    legacyMapper.write(0x8000, 3);
    const noConflictMapper = createMapper(withoutConflicts, { setMapperIrq() {} });
    noConflictMapper.write(0x8000, 3);
    const conflictMapper = createMapper(withConflicts, { setMapperIrq() {} });
    conflictMapper.write(0x8000, 3);

    expect(legacyMapper.read(0)).toBe(0x23);
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

  it.each([
    ["Bandai mapper 70", { mapper: 70, prgBanks: 8, chrBanks: 8, fourScreen: true }],
    ["Codemasters BF9093", { nes2: true, mapper: 71, submapper: 0, prgBanks: 8, fourScreen: true }],
  ] as const)("preserves external four-screen memory on hardwired %s boards", (_name, options) => {
    const cartridge = createTestCartridge(options);
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.powerOn();
    mapper.write(0x9000, 0xff);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.FourScreen);
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
    ["MMC2 with PRG RAM", { nes2: true, mapper: 9, prgBanks: 8, chrBanks: 8, prgRamShift: 7 }],
    ["MMC2 with four-screen nametables", { mapper: 9, prgBanks: 8, chrBanks: 8, fourScreen: true }],
    ["MMC1 with four-screen nametables", { mapper: 1, prgBanks: 2, fourScreen: true }],
    ["AxROM with four-screen nametables", { mapper: 7, prgBanks: 2, fourScreen: true }],
    [
      "MMC4 with four-screen nametables",
      { mapper: 10, prgBanks: 8, chrBanks: 8, fourScreen: true },
    ],
    [
      "Color Dreams with PRG RAM",
      { nes2: true, mapper: 11, prgBanks: 4, chrBanks: 4, prgRamShift: 7 },
    ],
    [
      "CPROM with PRG RAM",
      {
        nes2: true,
        mapper: 13,
        prgBanks: 2,
        chrBanks: 0,
        chrRamShift: 8,
        prgRamShift: 7,
      },
    ],
    ["GxROM with PRG RAM", { nes2: true, mapper: 66, prgBanks: 2, chrBanks: 4, prgRamShift: 7 }],
    [
      "Bandai 70 with PRG RAM",
      { nes2: true, mapper: 70, prgBanks: 8, chrBanks: 8, prgRamShift: 7 },
    ],
    ["Codemasters with PRG RAM", { nes2: true, mapper: 71, prgBanks: 4, prgRamShift: 7 }],
    [
      "Jaleco 87 with PRG RAM",
      { nes2: true, mapper: 87, prgBanks: 2, chrBanks: 4, prgRamShift: 7 },
    ],
    [
      "Bandai 152 with PRG RAM",
      { nes2: true, mapper: 152, prgBanks: 8, chrBanks: 8, prgRamShift: 7 },
    ],
    [
      "Bandai mapper 152 with four-screen nametables",
      { mapper: 152, prgBanks: 8, chrBanks: 8, fourScreen: true },
    ],
    [
      "Namco 118 with PRG RAM",
      { nes2: true, mapper: 206, prgBanks: 8, chrBanks: 8, prgRamShift: 7 },
    ],
    ["Taito TC0190 with CHR RAM", { nes2: true, mapper: 33, prgBanks: 2, chrRamShift: 7 }],
    [
      "Taito TC0190 with PRG RAM",
      { nes2: true, mapper: 33, prgBanks: 2, chrBanks: 1, prgRamShift: 7 },
    ],
    [
      "mapper 78 with CHR RAM",
      { nes2: true, mapper: 78, submapper: 1, prgBanks: 2, chrRamShift: 7 },
    ],
    [
      "mapper 78 with an ambiguous NES 2.0 submapper",
      { nes2: true, mapper: 78, submapper: 0, prgBanks: 2, chrBanks: 1 },
    ],
    ["UN1ROM with CHR ROM", { nes2: true, mapper: 94, prgBanks: 8, chrBanks: 1 }],
    [
      "inverted UxROM with CHR ROM",
      { nes2: true, mapper: 180, submapper: 1, prgBanks: 2, chrBanks: 1 },
    ],
    [
      "inverted UxROM with PRG RAM",
      { nes2: true, mapper: 180, submapper: 1, prgBanks: 2, prgRamShift: 7 },
    ],
    [
      "Taito TC0190 with an unmodeled submapper",
      { nes2: true, mapper: 33, submapper: 1, prgBanks: 2, chrBanks: 1 },
    ],
    ["UN1ROM with an unmodeled submapper", { nes2: true, mapper: 94, submapper: 1, prgBanks: 8 }],
    [
      "inverted UxROM with an unmodeled submapper",
      { nes2: true, mapper: 180, submapper: 3, prgBanks: 2 },
    ],
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
    ["GxROM beyond its 32 KiB CHR capacity", { mapper: 66, prgBanks: 2, chrBanks: 8 }],
    ["CPROM without its implied 16 KiB CHR RAM", { mapper: 13, prgBanks: 2, chrBanks: 0 }],
    [
      "Codemasters with an unmodeled submapper",
      { nes2: true, mapper: 71, submapper: 2, prgBanks: 4 },
    ],
    [
      "Codemasters BF9097 with four-screen nametables",
      { nes2: true, mapper: 71, submapper: 1, prgBanks: 4, fourScreen: true },
    ],
    ["FME-7 beyond its 512 KiB PRG capacity", { mapper: 69, prgBanks: 33, chrBanks: 1 }],
    [
      "FME-7 with four-screen nametables",
      { mapper: 69, prgBanks: 8, chrBanks: 8, fourScreen: true },
    ],
    ["Jaleco 87 with a non-NROM PRG size", { mapper: 87, prgBanks: 4, chrBanks: 1 }],
    ["Namco 118 beyond its 64 KiB CHR capacity", { mapper: 206, prgBanks: 8, chrBanks: 9 }],
    ["Taito TC0190 beyond its 512 KiB PRG capacity", { mapper: 33, prgBanks: 33, chrBanks: 1 }],
    [
      "Taito TC0190 with four-screen nametables",
      { mapper: 33, prgBanks: 8, chrBanks: 8, fourScreen: true },
    ],
    ["mapper 78 beyond its 128 KiB CHR capacity", { mapper: 78, prgBanks: 2, chrBanks: 17 }],
    [
      "NES 2.0 mapper 78 with four-screen nametables",
      { nes2: true, mapper: 78, submapper: 1, prgBanks: 2, chrBanks: 1, fourScreen: true },
    ],
    [
      "Sunsoft-2 with four-screen nametables",
      { mapper: 89, prgBanks: 8, chrBanks: 8, fourScreen: true },
    ],
    ["UN1ROM with the wrong PRG geometry", { mapper: 94, prgBanks: 4 }],
    ["inverted UxROM beyond its 128 KiB PRG capacity", { mapper: 180, prgBanks: 9 }],
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
  mapper.observePpuAddress?.(0x0000);
  for (let cycle = 0; cycle < lowCycles; cycle++) mapper.tickPpu?.();
  mapper.observePpuAddress?.(0x1000);
}
