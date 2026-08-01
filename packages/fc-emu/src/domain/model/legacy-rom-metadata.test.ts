import { describe, expect, it } from "vitest";
import { createTestRom } from "../../../test-support/rom.js";
import { parseCartridgeHeader } from "./cartridge-header.js";
import { enrichLegacyRomMetadata, findLegacyRomMetadata } from "./legacy-rom-metadata.js";

describe("legacy ROM metadata", () => {
  it("identifies the exact Vs. Soccer SC4-3 payload", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 1,
        mapperNumber: 99,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x4000,
        prgCrc32: 0x46914e3e,
        chrCrc32: 0xfebb5370,
      })?.overrides,
    ).toEqual({ vsPpuType: 4, vsHardwareType: 0, defaultExpansionDevice: 5 });
  });

  it("identifies the exact Uchuu Keibitai SDF HVC-ELROM-01 payload", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 5,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xd979c8b7,
        chrCrc32: 0x8734d65d,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact King of Kings NAM-KK-5900 audio profile", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 19,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x1dd6619b,
        chrCrc32: 0xd3f4b947,
      })?.overrides,
    ).toEqual({ submapperNumber: 5 });
  });

  it("identifies the exact Crayon Shin-chan LZ93D50 board", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 16,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xb515e7d4,
        chrCrc32: 0xa4b121a9,
      })?.overrides,
    ).toEqual({ submapperNumber: 5, prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Battletoads NES-AOROM-03 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 7,
        prgRomBytes: 0x40_000,
        chrRomBytes: 0,
        prgCrc32: 0x279710dc,
        chrCrc32: 0,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Bible Adventures BC6 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 11,
        prgRomBytes: 0x10_000,
        chrRomBytes: 0x10_000,
        prgCrc32: 0x9b8e02c0,
        chrCrc32: 0xb0a8c32a,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Dragon Power NES-GN-ROM-03 board facts", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 66,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x8000,
        prgCrc32: 0xece525dd,
        chrCrc32: 0x59f0fbaa,
      })?.overrides,
    ).toEqual({ mirroringMode: 1, prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact After Burner 800042 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 68,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x40_000,
        prgCrc32: 0xb938b7e9,
        chrCrc32: 0x725a53dc,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact The Lord of King JF-25 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 18,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xefb1df9e,
        chrCrc32: 0x7a2dcf20,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Kaiketsu Yanchamaru 3 FC-00-017B memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 65,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xe30b7f64,
        chrCrc32: 0xaf5fd6b5,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Skull & Crossbones 800032 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 64,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x10_000,
        prgCrc32: 0x0857df48,
        chrCrc32: 0xd0bf8c50,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Batman BAT-E301 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 69,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x094afab5,
        chrCrc32: 0xf3b41c18,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("does not guess metadata from mapper geometry or a near CRC match", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 5,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xd979c8b6,
        chrCrc32: 0x8734d65d,
      }),
    ).toBeUndefined();
  });

  it("leaves unknown iNES and explicit NES 2.0 metadata untouched", () => {
    const legacy = parseCartridgeHeader(
      createTestRom({ mapper: 5, prgRomBytes: 0x20_000, chrRomBytes: 0x20_000 }),
      "unknown-mmc5.nes",
    );
    expect(
      enrichLegacyRomMetadata(legacy, new Uint8Array(0x20_000), new Uint8Array(0x20_000)),
    ).toBe(legacy);

    const nes2 = parseCartridgeHeader(
      createTestRom({
        mapper: 99,
        nes2: true,
        consoleType: 1,
        vsPpuType: 5,
        defaultExpansionDevice: 4,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x4000,
        prgRamShift: 5,
        chrRamShift: 0,
      }),
      "explicit-vs.nes",
    );
    expect(enrichLegacyRomMetadata(nes2, new Uint8Array(0x8000), new Uint8Array(0x4000))).toBe(
      nes2,
    );
  });
});
