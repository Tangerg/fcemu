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
    ["console", { consoleType: 1 }, "UNSUPPORTED_CONSOLE_TYPE"],
    ["miscellaneous ROM", { miscellaneousRomCount: 1 }, "UNSUPPORTED_MISC_ROM"],
    ["expansion device", { defaultExpansionDevice: 2 }, "UNSUPPORTED_EXPANSION_DEVICE"],
  ] as const)("rejects unsupported NES 2.0 %s metadata", (_name, options, code) => {
    expect(() => Cartridge.fromArrayBuffer(createTestRom({ nes2: true, ...options }))).toThrow(
      expect.objectContaining({ code }),
    );
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
