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
