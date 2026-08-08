import {
  CartridgeConsoleType,
  NametableMirroring,
  type CartridgeHeader,
} from "./cartridge-header.js";
import { calculateCrc32 } from "./rom-identity.js";

export interface LegacyRomIdentity {
  readonly consoleType: CartridgeHeader["consoleType"];
  readonly mapperNumber: number;
  readonly prgRomBytes: number;
  readonly chrRomBytes: number;
  readonly prgCrc32: number;
  readonly chrCrc32: number;
}

type LegacyHeaderOverrides = Readonly<
  Partial<
    Pick<
      CartridgeHeader,
      | "hasBatteryFlag"
      | "mirroringMode"
      | "submapperNumber"
      | "prgRamSize"
      | "prgNvRamSize"
      | "vsPpuType"
      | "vsHardwareType"
      | "defaultExpansionDevice"
    >
  >
>;

interface LegacyRomMetadata {
  readonly identity: LegacyRomIdentity;
  readonly overrides: LegacyHeaderOverrides;
}

const LEGACY_ROM_METADATA: readonly LegacyRomMetadata[] = Object.freeze([
  Object.freeze({
    identity: Object.freeze({
      // Vs. Soccer, set SC4-3: RP2C04-0003 and P1 on the $4017 stick.
      consoleType: CartridgeConsoleType.VsSystem,
      mapperNumber: 99,
      prgRomBytes: 0x8000,
      chrRomBytes: 0x4000,
      prgCrc32: 0x46914e3e,
      chrCrc32: 0xfebb5370,
    }),
    overrides: Object.freeze({
      vsPpuType: 4,
      vsHardwareType: 0,
      defaultExpansionDevice: 5,
    }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Uchuu Keibitai SDF, HVC-ELROM-01: no external PRG RAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 5,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xd979c8b7,
      chrCrc32: 0x8734d65d,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Battletoads, NES-AOROM-03: 8 KiB CHR RAM and no external PRG RAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 7,
      prgRomBytes: 0x40_000,
      chrRomBytes: 0,
      prgCrc32: 0x279710dc,
      chrCrc32: 0,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Bible Adventures 1.3, BC6: COLORDREAMS-74*377 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 11,
      prgRomBytes: 0x10_000,
      chrRomBytes: 0x10_000,
      prgCrc32: 0x9b8e02c0,
      chrCrc32: 0xb0a8c32a,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Dragon Power, NES-GN-ROM-03: vertical GNROM without WRAM. The
      // circulating iNES image identified below incorrectly declares H.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 66,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x8000,
      prgCrc32: 0xece525dd,
      chrCrc32: 0x59f0fbaa,
    }),
    overrides: Object.freeze({
      mirroringMode: NametableMirroring.Vertical,
      prgRamSize: 0,
      prgNvRamSize: 0,
    }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // After Burner (USA), TGN-011-AB/800042-01 REV B: Sunsoft-4 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 68,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0xb938b7e9,
      chrCrc32: 0x725a53dc,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Crayon Shin-chan: Ora to Poi Poi, DRAGON BALL Z-B: LZ93D50 without EEPROM/WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 16,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xb515e7d4,
      chrCrc32: 0xa4b121a9,
    }),
    overrides: Object.freeze({ submapperNumber: 5, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Wai Wai World 2, KON-RC850/352398: VRC4a without external WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 21,
      prgRomBytes: 0x40_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xb201b522,
      chrCrc32: 0x75754679,
    }),
    overrides: Object.freeze({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Ganbare Goemon 2, KON-RC833/350926: VRC2b with its one-bit latch and no WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 23,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x112140a4,
      chrCrc32: 0xb0c3ce2d,
    }),
    overrides: Object.freeze({ submapperNumber: 3, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Getsufuu Maden, KON-RC819/350636: VRC2b without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 23,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xc8859038,
      chrCrc32: 0xdcfa8063,
    }),
    overrides: Object.freeze({ submapperNumber: 3, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Crisis Force, KON-RC856/352396: VRC4e with 2 KiB WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 23,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x99580334,
      chrCrc32: 0xa709bcb8,
    }),
    overrides: Object.freeze({ submapperNumber: 2, prgRamSize: 0x0800, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Gradius II, KON-RC832/351406: VRC4b with 2 KiB WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 25,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xc71d4ce7,
      chrCrc32: 0x537b6f6a,
    }),
    overrides: Object.freeze({ submapperNumber: 1, prgRamSize: 0x0800, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Racer Mini Yonku: Japan Cup, KON-RC842/351406: VRC4b without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 25,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xa2e68da8,
      chrCrc32: 0xb2d960cc,
    }),
    overrides: Object.freeze({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Bio Miracle Bokutte Upa, KON-RV102/351406: VRC4b without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 25,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x0bbd85ff,
      chrCrc32: 0xb8168efa,
    }),
    overrides: Object.freeze({ submapperNumber: 1, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Teenage Mutant Ninja Turtles 2, KON-RC863/352400: VRC4d without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 25,
      prgRomBytes: 0x40_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0x5f82cb7d,
      chrCrc32: 0x4aa9b12a,
    }),
    overrides: Object.freeze({ submapperNumber: 2, prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Ganbare Goemon Gaiden, KON-RC840/351948: VRC2c with 8 KiB battery NVRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 25,
      prgRomBytes: 0x40_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0x8360fa88,
      chrCrc32: 0x99a563fe,
    }),
    overrides: Object.freeze({ submapperNumber: 3, prgRamSize: 0, prgNvRamSize: 0x2000 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Golf Ko Open, TFC-GO-5900-26/TC0190FMC: no external WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 33,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x40_000,
      prgCrc32: 0x837c1342,
      chrCrc32: 0xdc467cf8,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // The Lord of King, JF-25: the production board has no external WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 18,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xefb1df9e,
      chrCrc32: 0x7a2dcf20,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Kaiketsu Yanchamaru 3, IF-28/FC-00-017B: H3001 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 65,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xe30b7f64,
      chrCrc32: 0xaf5fd6b5,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Kamen Rider Club, BA-KAMEN: vertical BANDAI-74*161/161/32 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 70,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0xa59ca2ef,
      chrCrc32: 0xcc0ffd0e,
    }),
    overrides: Object.freeze({
      mirroringMode: NametableMirroring.Vertical,
      prgRamSize: 0,
      prgNvRamSize: 0,
    }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Fire Hawk, BIC-62: CAMERICA-BF9097 with controlled single-screen mirroring and no WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 71,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0,
      prgCrc32: 0x1bc686a8,
      chrCrc32: 0,
    }),
    overrides: Object.freeze({
      submapperNumber: 1,
      prgRamSize: 0,
      prgNvRamSize: 0,
    }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Ganbare Goemon! Karakuri Douchuu, 302114A: KONAMI-VRC-1 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 75,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x565a57e5,
      chrCrc32: 0xd9842835,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Double Strike v1.1, NINA-06: vertical AVE board without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 79,
      prgRomBytes: 0x8000,
      chrRomBytes: 0x8000,
      prgCrc32: 0x127436fc,
      chrCrc32: 0x39536d86,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Mirai Shinwa Jarvas, TFC-MJ-5500-11/P3-034A: battery-backed X1-005 RAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 80,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x95aaed34,
      chrCrc32: 0x599cd55d,
    }),
    overrides: Object.freeze({
      hasBatteryFlag: true,
      prgRamSize: 0,
      prgNvRamSize: 0x80,
    }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Skull & Crossbones, TGN-020-SK/800032 REV A: RAMBO-1 without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 64,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x10_000,
      prgCrc32: 0x0857df48,
      chrCrc32: 0xd0bf8c50,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // Batman (Japan), BAT-E301: Sunsoft-5A without WRAM.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 69,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x094afab5,
      chrCrc32: 0xf3b41c18,
    }),
    overrides: Object.freeze({ prgRamSize: 0, prgNvRamSize: 0 }),
  }),
  Object.freeze({
    identity: Object.freeze({
      // King of Kings, NAM-KK-5900: N163 mix measured in the submapper-5 range.
      consoleType: CartridgeConsoleType.Standard,
      mapperNumber: 19,
      prgRomBytes: 0x20_000,
      chrRomBytes: 0x20_000,
      prgCrc32: 0x1dd6619b,
      chrCrc32: 0xd3f4b947,
    }),
    overrides: Object.freeze({ submapperNumber: 5 }),
  }),
]);

/**
 * Completes or corrects hardware facts that legacy iNES cannot encode reliably.
 *
 * The lookup is deliberately content-addressed and exact: console type,
 * mapper, independent region lengths and independent PRG/CHR CRCs must all
 * match. Explicit NES 2.0 declarations always remain authoritative.
 */
export function enrichLegacyRomMetadata(
  header: CartridgeHeader,
  prgRom: Uint8Array,
  chrRom: Uint8Array,
): CartridgeHeader {
  if (header.format !== "ines") return header;

  const metadata = findLegacyRomMetadata({
    consoleType: header.consoleType,
    mapperNumber: header.mapperNumber,
    prgRomBytes: prgRom.byteLength,
    chrRomBytes: chrRom.byteLength,
    prgCrc32: calculateCrc32(prgRom),
    chrCrc32: calculateCrc32(chrRom),
  });
  if (!metadata) return header;

  return Object.freeze({ ...header, ...metadata.overrides });
}

export function findLegacyRomMetadata(identity: LegacyRomIdentity): LegacyRomMetadata | undefined {
  return LEGACY_ROM_METADATA.find(
    (metadata) =>
      metadata.identity.consoleType === identity.consoleType &&
      metadata.identity.mapperNumber === identity.mapperNumber &&
      metadata.identity.prgRomBytes === identity.prgRomBytes &&
      metadata.identity.chrRomBytes === identity.chrRomBytes &&
      metadata.identity.prgCrc32 === identity.prgCrc32 &&
      metadata.identity.chrCrc32 === identity.chrCrc32,
  );
}
