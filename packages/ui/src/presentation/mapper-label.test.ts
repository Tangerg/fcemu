import { describe, expect, it } from "vitest";
import type { RomDetails } from "../domain/emulation-session.js";
import { formatMapperLabel } from "./mapper-label.js";

const baseRom = {
  name: "test.nes",
  mapperNumber: 7,
  submapperNumber: 0,
  consoleRegion: "ntsc",
  prgRomBytes: 32_768,
  chrRomBytes: 0,
} satisfies Omit<RomDetails, "format">;

describe("formatMapperLabel", () => {
  it("keeps legacy iNES labels concise", () => {
    expect(formatMapperLabel({ ...baseRom, format: "ines" })).toBe("#7");
  });

  it("makes the NES 2.0 submapper explicit", () => {
    expect(
      formatMapperLabel({ ...baseRom, format: "nes2", mapperNumber: 3, submapperNumber: 2 }),
    ).toBe("#3.2");
  });
});
