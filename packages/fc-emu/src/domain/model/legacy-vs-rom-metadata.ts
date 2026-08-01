import { CartridgeConsoleType, type CartridgeHeader } from "./cartridge-header.js";
import { calculateCrc32 } from "./rom-identity.js";

interface LegacyVsRomMetadata {
  readonly mapperNumber: number;
  readonly prgRomBytes: number;
  readonly chrRomBytes: number;
  readonly prgCrc32: number;
  readonly chrCrc32: number;
  readonly vsPpuType: number;
  readonly vsHardwareType: number;
  readonly defaultExpansionDevice: number;
}

const LEGACY_VS_ROM_METADATA: readonly LegacyVsRomMetadata[] = Object.freeze([
  Object.freeze({
    // Vs. Soccer, set SC4-3: RP2C04-0003 and P1 on the $4017 stick.
    mapperNumber: 99,
    prgRomBytes: 0x8000,
    chrRomBytes: 0x4000,
    prgCrc32: 0x46914e3e,
    chrCrc32: 0xfebb5370,
    vsPpuType: 4,
    vsHardwareType: 0,
    defaultExpansionDevice: 5,
  }),
]);

/**
 * Completes VS hardware facts that legacy iNES cannot encode.
 *
 * The lookup is deliberately content-addressed and exact: mapper, region
 * lengths and independent PRG/CHR CRCs must all match. NES 2.0 declarations
 * always remain authoritative.
 */
export function enrichLegacyVsRomMetadata(
  header: CartridgeHeader,
  prgRom: Uint8Array,
  chrRom: Uint8Array,
): CartridgeHeader {
  if (header.format !== "ines" || header.consoleType !== CartridgeConsoleType.VsSystem) {
    return header;
  }

  const metadata = findLegacyVsRomMetadata(
    header.mapperNumber,
    prgRom.byteLength,
    chrRom.byteLength,
    calculateCrc32(prgRom),
    calculateCrc32(chrRom),
  );
  if (!metadata) return header;

  return Object.freeze({
    ...header,
    vsPpuType: metadata.vsPpuType,
    vsHardwareType: metadata.vsHardwareType,
    defaultExpansionDevice: metadata.defaultExpansionDevice,
  });
}

export function findLegacyVsRomMetadata(
  mapperNumber: number,
  prgRomBytes: number,
  chrRomBytes: number,
  prgCrc32: number,
  chrCrc32: number,
): LegacyVsRomMetadata | undefined {
  return LEGACY_VS_ROM_METADATA.find(
    (metadata) =>
      metadata.mapperNumber === mapperNumber &&
      metadata.prgRomBytes === prgRomBytes &&
      metadata.chrRomBytes === chrRomBytes &&
      metadata.prgCrc32 === prgCrc32 &&
      metadata.chrCrc32 === chrCrc32,
  );
}
