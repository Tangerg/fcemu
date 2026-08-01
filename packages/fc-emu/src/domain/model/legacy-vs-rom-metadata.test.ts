import { describe, expect, it } from "vitest";
import { createTestRom } from "../../../test-support/rom.js";
import { parseCartridgeHeader } from "./cartridge-header.js";
import { enrichLegacyVsRomMetadata, findLegacyVsRomMetadata } from "./legacy-vs-rom-metadata.js";

describe("legacy VS ROM metadata", () => {
  it("identifies the exact Vs. Soccer SC4-3 PRG and CHR payload", () => {
    expect(findLegacyVsRomMetadata(99, 0x8000, 0x4000, 0x46914e3e, 0xfebb5370)).toMatchObject({
      vsPpuType: 4,
      vsHardwareType: 0,
      defaultExpansionDevice: 5,
    });
  });

  it("does not guess metadata from mapper or ROM geometry alone", () => {
    expect(findLegacyVsRomMetadata(99, 0x8000, 0x4000, 0x46914e3f, 0xfebb5370)).toBeUndefined();
  });

  it("leaves unknown legacy VS and explicit NES 2.0 metadata untouched", () => {
    const legacy = parseCartridgeHeader(
      createTestRom({ mapper: 99, consoleType: 1, prgRomBytes: 0x8000, chrRomBytes: 0x4000 }),
      "unknown-vs.nes",
    );
    expect(enrichLegacyVsRomMetadata(legacy, new Uint8Array(0x8000), new Uint8Array(0x4000))).toBe(
      legacy,
    );

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
    expect(enrichLegacyVsRomMetadata(nes2, new Uint8Array(0x8000), new Uint8Array(0x4000))).toBe(
      nes2,
    );
  });
});
