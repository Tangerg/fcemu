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

  it("identifies the exact Wai Wai World 2 VRC4a board", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 21,
        prgRomBytes: 0x40_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xb201b522,
        chrCrc32: 0x75754679,
      })?.overrides,
    ).toEqual({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 });
  });

  it.each([
    {
      title: "Ganbare Goemon 2 350926",
      prgCrc32: 0x112140a4,
      chrCrc32: 0xb0c3ce2d,
    },
    {
      title: "Getsufuu Maden 350636",
      prgCrc32: 0xc8859038,
      chrCrc32: 0xdcfa8063,
    },
  ])("identifies the exact $title VRC2b board", ({ prgCrc32, chrCrc32 }) => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 23,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32,
        chrCrc32,
      })?.overrides,
    ).toEqual({ submapperNumber: 3, prgRamSize: 0, prgNvRamSize: 0 });
  });

  it("identifies the exact Crisis Force 352396 VRC4e board", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 23,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x99580334,
        chrCrc32: 0xa709bcb8,
      })?.overrides,
    ).toEqual({ submapperNumber: 2, prgRamSize: 0x0800, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 23,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xdaeb93ed,
        chrCrc32: 0xa709bcb8,
      }),
    ).toBeUndefined();
  });

  it.each([
    {
      title: "Gradius II 351406 VRC4b",
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xc71d4ce7,
      chrCrc32: 0x537b6f6a,
      overrides: { submapperNumber: 1, prgRamSize: 0x0800, prgNvRamSize: 0 },
    },
    {
      title: "Racer Mini Yonku 351406 VRC4b",
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xa2e68da8,
      chrCrc32: 0xb2d960cc,
      overrides: { submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 },
    },
    {
      title: "Bio Miracle Bokutte Upa 351406 VRC4b",
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x0bbd85ff,
      chrCrc32: 0xb8168efa,
      overrides: { submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 },
    },
    {
      title: "Teenage Mutant Ninja Turtles 2 352400 VRC4d",
      prgRomBytes: 0x40_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0x5f82cb7d,
      chrCrc32: 0x4aa9b12a,
      overrides: { submapperNumber: 2, prgRamSize: 0, prgNvRamSize: 0 },
    },
    {
      title: "Ganbare Goemon Gaiden 351948 VRC2c",
      prgRomBytes: 0x40_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0x8360fa88,
      chrCrc32: 0x99a563fe,
      overrides: { submapperNumber: 3, prgRamSize: 0, prgNvRamSize: 0x2000 },
    },
  ])(
    "identifies the exact $title board",
    ({ prgRomBytes, chrRomBytes, prgCrc32, chrCrc32, overrides }) => {
      expect(
        findLegacyRomMetadata({
          consoleType: 0,
          mapperNumber: 25,
          prgRomBytes,
          chrRomBytes,
          prgCrc32,
          chrCrc32,
        })?.overrides,
      ).toEqual(overrides);
    },
  );

  it("does not identify a near-match Mapper 25 payload", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 25,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xa2e68da8,
        chrCrc32: 0xb2d960cd,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Golf Ko Open TC0190FMC memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 33,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x40_000,
        prgCrc32: 0x837c1342,
        chrCrc32: 0xdc467cf8,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 33,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x40_000,
        prgCrc32: 0x837c1342,
        chrCrc32: 0xdc467cf9,
      }),
    ).toBeUndefined();
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

  it("identifies the exact Kamen Rider Club BA-KAMEN board facts", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 70,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xa59ca2ef,
        chrCrc32: 0xcc0ffd0e,
      })?.overrides,
    ).toEqual({ mirroringMode: 1, prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 70,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xa59ca2ef,
        chrCrc32: 0xcc0ffd0f,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Fire Hawk BIC-62 board facts", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 71,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0,
        prgCrc32: 0x1bc686a8,
        chrCrc32: 0,
      })?.overrides,
    ).toEqual({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 71,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0,
        prgCrc32: 0x1bc686a9,
        chrCrc32: 0,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Ganbare Goemon 302114A memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 75,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x565a57e5,
        chrCrc32: 0xd9842835,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 75,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x565a57e5,
        chrCrc32: 0xd9842834,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Uchuusen JF-16 board", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 78,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x42392440,
        chrCrc32: 0xcffee642,
      })?.overrides,
    ).toEqual({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 78,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x42392440,
        chrCrc32: 0xcffee643,
      }),
    ).toBeUndefined();

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 78,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0xcece4cfc,
        chrCrc32: 0xcffee642,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Double Strike NINA-06 memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 79,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x8000,
        prgCrc32: 0x127436fc,
        chrCrc32: 0x39536d86,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 79,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x8000,
        prgCrc32: 0x127436fc,
        chrCrc32: 0x39536d87,
      }),
    ).toBeUndefined();
  });

  it("identifies Mirai Shinwa Jarvas' battery-backed X1-005 RAM", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 80,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x95aaed34,
        chrCrc32: 0x599cd55d,
      })?.overrides,
    ).toEqual({ hasBatteryFlag: true, prgRamSize: 0, prgNvRamSize: 0x80 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 80,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x20_000,
        prgCrc32: 0x95aaed34,
        chrCrc32: 0x599cd55c,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Tekken 2 J.Y. Company memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 90,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x80_000,
        prgCrc32: 0xcddb21da,
        chrCrc32: 0x93fdfbb2,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 90,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x80_000,
        prgCrc32: 0xcddb21da,
        chrCrc32: 0x93fdfbb3,
      }),
    ).toBeUndefined();
  });

  it("identifies the exact Street Fighter 3 JY830623C memory layout", () => {
    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 91,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x80_000,
        prgCrc32: 0xf754da71,
        chrCrc32: 0x2c40e304,
      })?.overrides,
    ).toEqual({ prgRamSize: 0, prgNvRamSize: 0 });

    expect(
      findLegacyRomMetadata({
        consoleType: 0,
        mapperNumber: 91,
        prgRomBytes: 0x20_000,
        chrRomBytes: 0x80_000,
        prgCrc32: 0xf754da71,
        chrCrc32: 0x2c40e305,
      }),
    ).toBeUndefined();
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
