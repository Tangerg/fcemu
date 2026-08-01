import { CartridgeConsoleType, type CartridgeHeader } from "./cartridge-header.js";
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
 * Completes hardware facts that legacy iNES cannot encode reliably.
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
