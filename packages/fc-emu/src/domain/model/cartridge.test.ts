import { describe, expect, it } from "vitest";
import { createTestRom } from "../../../test-support/rom.js";
import Cartridge, {
  CartridgeFormatError,
  CartridgeTimingMode,
  NametableMirroring,
} from "./cartridge.js";
import { parseCartridgeHeader } from "./cartridge-header.js";

describe("Cartridge", () => {
  it("parses header metadata as immutable data", () => {
    const header = parseCartridgeHeader(createTestRom({ mapper: 2 }), "header.nes");

    expect(header).toMatchObject({ format: "ines", mapperNumber: 2, prgRomSize: 16_384 });
    expect(Object.isFrozen(header)).toBe(true);
  });

  it("parses a minimal iNES image without browser APIs", () => {
    const bytes = new Uint8Array(16 + 16_384);
    bytes.set([0x4e, 0x45, 0x53, 0x1a, 1, 0]);
    const cartridge = Cartridge.fromArrayBuffer(bytes.buffer, "fixture.nes");
    expect(cartridge.mapperNumber).toBe(0);
    expect(cartridge.format).toBe("ines");
    expect(cartridge.submapperNumber).toBe(0);
    expect(cartridge.prgRom).toHaveLength(16_384);
    expect(cartridge.chrRom).toHaveLength(0);
    expect(cartridge.chrMemoryBytes).toBe(8192);
    expect(cartridge.prgRamBytes).toBe(8192);
    expect(cartridge.prgNvRamBytes).toBe(0);
    expect(cartridge.hasWritableChrMemory).toBe(true);
  });

  it("returns a domain-specific format error", () => {
    let caught: unknown;
    try {
      Cartridge.fromArrayBuffer(new ArrayBuffer(4), "broken.nes");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CartridgeFormatError);
    expect(caught).toMatchObject({ code: "FILE_TOO_SMALL", sourceName: "broken.nes" });
  });

  it("decodes NES 2.0 mapper, submapper and explicit RAM fields", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({
        nes2: true,
        mapper: 0x203,
        submapper: 2,
        chrBanks: 1,
        prgNvRamShift: 7,
        battery: true,
      }),
      "nes2.nes",
    );

    expect(cartridge).toMatchObject({
      format: "nes2",
      mapperNumber: 0x203,
      submapperNumber: 2,
      timingMode: CartridgeTimingMode.Ntsc,
      prgRamBytes: 0,
      prgNvRamBytes: 8192,
      chrRamBytes: 0,
      hasBatteryBackup: true,
    });
  });

  it("decodes NES 2.0 exponent-multiplier ROM sizes", () => {
    const prgSize = 24_576;
    const chrSize = 8192;
    const bytes = new Uint8Array(16 + prgSize + chrSize);
    bytes.set([0x4e, 0x45, 0x53, 0x1a, (13 << 2) | 1, 1, 0, 0x08, 0, 0x0f]);

    const cartridge = Cartridge.fromArrayBuffer(bytes.buffer, "exponent.nes");

    expect(cartridge.prgRom).toHaveLength(prgSize);
    expect(cartridge.chrRom).toHaveLength(chrSize);
  });

  it("requires NES 2.0 CHR RAM to be explicit when CHR ROM is absent", () => {
    expect(() =>
      Cartridge.fromArrayBuffer(createTestRom({ nes2: true, chrRamShift: 0 }), "missing-chr.nes"),
    ).toThrow(expect.objectContaining({ code: "MISSING_CHR_MEMORY" }));
  });

  it.each([
    CartridgeTimingMode.Ntsc,
    CartridgeTimingMode.Pal,
    CartridgeTimingMode.MultiRegion,
    CartridgeTimingMode.Dendy,
  ])("preserves supported NES 2.0 timing mode %i", (timingMode) => {
    const cartridge = Cartridge.fromArrayBuffer(createTestRom({ nes2: true, timingMode }));
    expect(cartridge.timingMode).toBe(timingMode);
  });

  it("loads a trainer into the $7000 PRG-RAM window", () => {
    const trainer = new Uint8Array(512);
    trainer[0] = 0x42;
    trainer[511] = 0x99;
    const cartridge = Cartridge.fromArrayBuffer(createTestRom({ trainer: [...trainer] }));

    expect(cartridge.readPrgRam(0x1000)).toBe(0x42);
    expect(cartridge.readPrgRam(0x11ff)).toBe(0x99);
  });

  it.each([
    ["console", { consoleType: 2 }, "UNSUPPORTED_CONSOLE_TYPE"],
    ["miscellaneous ROM", { miscellaneousRomCount: 1 }, "UNSUPPORTED_MISC_ROM"],
    ["expansion device", { defaultExpansionDevice: 2 }, "UNSUPPORTED_EXPANSION_DEVICE"],
  ] as const)("rejects unsupported NES 2.0 %s metadata", (_name, options, code) => {
    expect(() => Cartridge.fromArrayBuffer(createTestRom({ nes2: true, ...options }))).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("projects Vs. System PPU/hardware identity and forces four-screen nametable RAM", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({
        mapper: 99,
        nes2: true,
        consoleType: 1,
        vsPpuType: 5,
        vsHardwareType: 4,
        defaultExpansionDevice: 5,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x2000,
        prgRamShift: 5,
        chrRamShift: 0,
      }),
    );

    expect(cartridge).toMatchObject({
      consoleType: 1,
      vsPpuType: 5,
      vsHardwareType: 4,
      defaultExpansionDevice: 5,
      mirroringMode: NametableMirroring.FourScreen,
      prgRamBytes: 0x0800,
    });
  });

  it.each([
    ["reserved PPU", { vsPpuType: 1 }, "Vs. PPU type"],
    ["DualSystem", { vsHardwareType: 5 }, "DualSystem"],
    ["PAL timing", { timingMode: 1 }, "NTSC"],
    ["non-Vs input", { defaultExpansionDevice: 1 }, "expansion device"],
  ] as const)("rejects unsupported Vs. System %s metadata", (_name, options, message) => {
    expect(() =>
      Cartridge.fromArrayBuffer(
        createTestRom({
          mapper: 99,
          nes2: true,
          consoleType: 1,
          prgRomBytes: 0x8000,
          chrRomBytes: 0x2000,
          prgRamShift: 5,
          chrRamShift: 0,
          ...options,
        }),
      ),
    ).toThrow(message);
  });

  it("normalizes legacy mapper 99 shared RAM to its physical 2 KiB capacity", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({ mapper: 99, chrBanks: 1, fourScreen: true }),
    );

    expect(cartridge.prgRamBytes).toBe(0x0800);
    expect(cartridge.prgNvRamBytes).toBe(0);
  });

  it("normalizes legacy mapper 96 CHR RAM to its physical 32 KiB capacity", () => {
    const cartridge = Cartridge.fromArrayBuffer(createTestRom({ mapper: 96, prgBanks: 8 }));

    expect(cartridge.chrRom).toHaveLength(0);
    expect(cartridge.chrRamBytes).toBe(0x8000);
    expect(cartridge.chrNvRamBytes).toBe(0);
  });

  it("represents mixed PRG RAM/NVRAM for mapper-owned bank selection", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({
        nes2: true,
        mapper: 1,
        chrBanks: 2,
        battery: true,
        prgRamShift: 7,
        prgNvRamShift: 7,
      }),
    );

    expect(cartridge).toMatchObject({
      prgRamBytes: 8192,
      prgNvRamBytes: 8192,
      prgWritableBytes: 16_384,
    });
    cartridge.writePrgRam(0, 0x11);
    cartridge.writePrgRam(0x2000, 0x22);
    expect(cartridge.captureBatterySave()).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ 0: 0x22 }),
    });
  });

  it("owns CHR NVRAM as writable and persistable cartridge memory", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({
        nes2: true,
        battery: true,
        prgNvRamShift: 0,
        chrRamShift: 0,
        chrNvRamShift: 7,
      }),
    );

    expect(cartridge).toMatchObject({
      chrRom: expect.objectContaining({ length: 0 }),
      chrRamBytes: 0,
      chrNvRamBytes: 8192,
      chrMemoryBytes: 8192,
      hasBatteryBackup: true,
    });
    cartridge.writeChr(0x10, 0x42);
    expect(cartridge.readChr(0x10)).toBe(0x42);
    expect(cartridge.captureBatterySave()?.data[0x10]).toBe(0x42);
  });

  it.each([
    { name: "legacy iNES", options: { mapper: 119, prgBanks: 8, chrBanks: 2 } },
    {
      name: "NES 2.0",
      options: {
        mapper: 119,
        nes2: true,
        prgBanks: 8,
        chrBanks: 2,
        chrRamShift: 7,
      },
    },
  ])("represents TQROM's simultaneous CHR ROM and RAM from $name metadata", ({ options }) => {
    const cartridge = Cartridge.fromArrayBuffer(createTestRom(options));
    cartridge.chrRom[0x10] = 0x31;
    cartridge.writeWritableChr(0x10, 0x42);

    expect(cartridge).toMatchObject({
      chrRom: expect.objectContaining({ length: 16_384 }),
      chrRamBytes: 8192,
      chrWritableBytes: 8192,
      hasWritableChrMemory: true,
    });
    expect(cartridge.readChr(0x10)).toBe(0x31);
    expect(cartridge.readWritableChr(0x10)).toBe(0x42);
  });

  it("adds LROG017's board-implied 8 KiB CHR RAM to legacy CHR ROM", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({ mapper: 77, prgBanks: 8, chrBanks: 4, fourScreen: true }),
    );
    cartridge.chrRom[0x10] = 0x31;
    cartridge.writeWritableChr(0x10, 0x42);

    expect(cartridge).toMatchObject({
      chrRom: expect.objectContaining({ length: 0x8000 }),
      chrRamBytes: 0x2000,
      chrWritableBytes: 0x2000,
      hasWritableChrMemory: true,
    });
    expect(cartridge.readChr(0x10)).toBe(0x31);
    expect(cartridge.readWritableChr(0x10)).toBe(0x42);
  });

  it("adds Waixing Type A's board-implied 2 KiB CHR RAM to legacy CHR ROM", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({ mapper: 74, prgBanks: 8, chrBanks: 32 }),
    );
    cartridge.chrRom[0x10] = 0x31;
    cartridge.writeWritableChr(0x10, 0x42);

    expect(cartridge).toMatchObject({
      chrRom: expect.objectContaining({ length: 0x40_000 }),
      chrRamBytes: 0x0800,
      chrWritableBytes: 0x0800,
      hasWritableChrMemory: true,
    });
    expect(cartridge.readChr(0x10)).toBe(0x31);
    expect(cartridge.readWritableChr(0x10)).toBe(0x42);
  });

  it.each([
    { mapper: 16, battery: true, prgRamBytes: 0, prgNvRamBytes: 0x100 },
    { mapper: 80, battery: false, prgRamBytes: 0x80, prgNvRamBytes: 0 },
    { mapper: 80, battery: true, prgRamBytes: 0, prgNvRamBytes: 0x80 },
    { mapper: 82, battery: true, prgRamBytes: 0, prgNvRamBytes: 0x1400 },
  ])(
    "normalizes Mapper $mapper ASIC-internal RAM independently of iNES 8 KiB units",
    ({ mapper, battery, prgRamBytes, prgNvRamBytes }) => {
      const cartridge = Cartridge.fromArrayBuffer(
        createTestRom({ mapper, battery, prgBanks: 8, chrBanks: 4 }),
      );

      expect(cartridge).toMatchObject({
        prgRamBytes,
        prgNvRamBytes,
        prgWritableBytes: prgRamBytes + prgNvRamBytes,
        hasBatteryBackup: battery,
      });
    },
  );

  it("owns Namco 163 chip RAM independently from optional external WRAM", () => {
    const volatile = Cartridge.fromArrayBuffer(
      createTestRom({
        mapper: 19,
        nes2: true,
        prgBanks: 2,
        chrBanks: 1,
        submapper: 3,
      }),
    );
    expect(volatile).toMatchObject({
      prgRamBytes: 0,
      prgNvRamBytes: 0,
      mapperRamBytes: 128,
      mapperNvRamBytes: 0,
      hasBatteryBackup: false,
    });
    volatile.writeMapperRam(3, 0x41);
    volatile.powerOn();
    expect(volatile.readMapperRam(3)).toBe(0);

    const persistent = Cartridge.fromArrayBuffer(
      createTestRom({
        mapper: 19,
        nes2: true,
        prgBanks: 2,
        chrBanks: 1,
        submapper: 3,
        battery: true,
        prgNvRamShift: 0,
      }),
    );
    expect(persistent).toMatchObject({
      prgRamBytes: 0,
      prgNvRamBytes: 0,
      mapperRamBytes: 0,
      mapperNvRamBytes: 128,
      hasBatteryBackup: true,
    });
    persistent.writeMapperRam(3, 0x52);
    expect(persistent.captureBatterySave()).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ length: 128, 3: 0x52 }),
    });
    persistent.powerOn();
    expect(persistent.readMapperRam(3)).toBe(0x52);
  });

  it("models Mapper 164's volatile work RAM and erased 93C66 EEPROM separately", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({ mapper: 164, battery: true, prgBanks: 64 }),
    );

    expect(cartridge).toMatchObject({
      prgRamBytes: 0x0800,
      prgNvRamBytes: 0,
      mapperRamBytes: 0,
      mapperNvRamBytes: 0x0200,
      chrRamBytes: 0x2000,
      hasBatteryBackup: true,
    });
    expect(cartridge.readMapperRam(0)).toBe(0xff);
    expect(cartridge.readMapperRam(0x01ff)).toBe(0xff);
    cartridge.writePrgRam(0, 0x41);
    cartridge.writeMapperRam(3, 0x52);
    expect(cartridge.captureBatterySave()).toMatchObject({
      revision: 1,
      data: expect.objectContaining({ length: 0x0200, 3: 0x52 }),
    });

    cartridge.powerOn();
    expect(cartridge.readPrgRam(0)).toBe(0);
    expect(cartridge.readMapperRam(3)).toBe(0x52);
  });

  it("owns MMC5 ExRAM as volatile mapper memory even on a battery board", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({ mapper: 5, battery: true, prgBanks: 2, chrBanks: 1 }),
    );

    expect(cartridge).toMatchObject({
      mapperRamBytes: 1024,
      mapperNvRamBytes: 0,
      prgNvRamBytes: 8192,
    });
    cartridge.writeMapperRam(0x12, 0x5a);
    expect(cartridge.captureBatterySave()?.data).toHaveLength(8192);
    cartridge.powerOn();
    expect(cartridge.readMapperRam(0x12)).toBe(0);
  });

  it("keeps mixed CHR ROM/RAM fail-closed outside modeled board families", () => {
    expect(() =>
      Cartridge.fromArrayBuffer(
        createTestRom({ mapper: 4, nes2: true, chrBanks: 1, chrRamShift: 7 }),
        "mixed-chr.nes",
      ),
    ).toThrow(/simultaneous CHR ROM and writable CHR memory/);
  });

  it("represents Namco 163 mixed CHR ROM/RAM as separate physical memories", () => {
    const cartridge = Cartridge.fromArrayBuffer(
      createTestRom({
        mapper: 19,
        nes2: true,
        prgBanks: 2,
        chrBanks: 2,
        chrRamShift: 7,
      }),
    );
    expect(cartridge).toMatchObject({
      chrRom: expect.objectContaining({ length: 16_384 }),
      chrRamBytes: 8192,
      chrWritableBytes: 8192,
    });
  });

  it("separates volatile PRG RAM from persistable PRG NVRAM", () => {
    const volatile = Cartridge.fromArrayBuffer(createTestRom({ nes2: true, prgRamShift: 7 }));
    volatile.writePrgRam(0, 0x11);
    expect(volatile.readPrgRam(0)).toBe(0x11);
    expect(volatile.captureBatterySave()).toBeUndefined();

    const nonvolatile = Cartridge.fromArrayBuffer(
      createTestRom({ nes2: true, battery: true, prgNvRamShift: 7 }),
    );
    nonvolatile.writePrgRam(0, 0x22);
    expect(nonvolatile.captureBatterySave()).toMatchObject({ revision: 1 });
    expect(nonvolatile.captureBatterySave()?.data).toHaveLength(8192);
  });

  it("rejects an empty PRG image before a mapper can divide by its size", () => {
    expect(() => Cartridge.fromArrayBuffer(createTestRom({ prgBanks: 0 }), "empty.nes")).toThrow(
      expect.objectContaining({ code: "MISSING_PRG_ROM", sourceName: "empty.nes" }),
    );
  });

  it("represents four-screen nametable memory as a distinct domain value", () => {
    const cartridge = Cartridge.fromArrayBuffer(createTestRom({ fourScreen: true }));
    expect(cartridge.mirroringMode).toBe(NametableMirroring.FourScreen);
  });
});
