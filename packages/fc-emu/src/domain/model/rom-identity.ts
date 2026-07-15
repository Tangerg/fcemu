const CRC32_TABLE = new Uint32Array(256);
for (let byte = 0; byte < CRC32_TABLE.length; byte++) {
  let value = byte;
  for (let bit = 0; bit < 8; bit++)
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC32_TABLE[byte] = value >>> 0;
}

/** Stable, non-security identity used to reject save states from another ROM image. */
export function createRomIdentity(image: ArrayBuffer): string {
  const bytes = new Uint8Array(image);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
  const checksum = ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
  return `crc32:${checksum}:${bytes.byteLength}`;
}
