import { describe, expect, it } from "vitest";
import { BrowserRomReader } from "./browser-rom-reader.js";

describe("BrowserRomReader", () => {
  it("uses a content digest rather than a filename as cartridge identity", async () => {
    const bytes = Uint8Array.of(1, 2, 3).buffer;
    const file = {
      name: "renamed.nes",
      arrayBuffer: async () => bytes,
    } as File;

    const rom = await new BrowserRomReader().read(file);

    expect(rom).toMatchObject({
      id: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
      name: "renamed.nes",
      bytes,
    });
  });
});
