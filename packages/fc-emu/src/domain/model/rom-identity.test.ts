import { describe, expect, it } from "vitest";
import { createRomIdentity } from "./rom-identity.js";

describe("ROM identity", () => {
  it("uses the standard CRC-32 check value and includes the byte length", () => {
    const bytes = new TextEncoder().encode("123456789");
    expect(createRomIdentity(bytes.buffer)).toBe("crc32:cbf43926:9");
  });
});
