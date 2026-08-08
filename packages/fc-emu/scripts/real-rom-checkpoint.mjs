import crypto from "node:crypto";

/**
 * Keeps mapper checkpoints reviewable without weakening binary-state coverage.
 * Typed-array views are represented by their exact view type, byte length and
 * SHA-256; ordinary save-state structure remains visible field by field.
 */
export function summarizeRealRomCheckpoint(value) {
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return {
      type: Object.prototype.toString.call(value).slice(8, -1),
      byteLength: value.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
  }
  if (Array.isArray(value)) return value.map(summarizeRealRomCheckpoint);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, summarizeRealRomCheckpoint(child)]),
    );
  }
  return value;
}
