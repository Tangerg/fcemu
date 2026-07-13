import { describe, expect, it } from "vitest";
import { parseRegionPreference, REGION_PREFERENCES } from "./execution-region.js";

describe("execution-region preference", () => {
  it("owns the complete Workbench preference set", () => {
    expect(REGION_PREFERENCES).toEqual(["auto", "ntsc", "pal", "dendy"]);
  });

  it("rejects values outside the domain", () => {
    expect(parseRegionPreference("pal")).toBe("pal");
    expect(() => parseRegionPreference("secam")).toThrow(/Unsupported/);
  });
});
