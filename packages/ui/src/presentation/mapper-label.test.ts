import { describe, expect, it } from "vitest";
import { formatMapperLabel } from "./mapper-label.js";

const baseRom = {
  mapperNumber: 7,
  submapperNumber: 0,
};

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
