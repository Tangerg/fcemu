import { describe, expect, it } from "vitest";
import { findConyYokoBoard } from "./cony-yoko-board.js";

describe("Cony/Yoko mapper 83 board resolution", () => {
  it("keeps legacy iNES on the standard board and names every allocated NES 2.0 PCB", () => {
    expect(findConyYokoBoard(83, "ines", 0)?.id).toBe("cony-83-0");
    expect(findConyYokoBoard(83, "nes2", 0)?.id).toBe("cony-83-0");
    expect(findConyYokoBoard(83, "nes2", 1)?.id).toBe("cony-83-1");
    expect(findConyYokoBoard(83, "nes2", 2)?.id).toBe("cony-83-2");
    expect(findConyYokoBoard(83, "nes2", 3)?.id).toBe("cony-83-3");
    expect(findConyYokoBoard(83, "nes2", 4)).toBeUndefined();
    expect(findConyYokoBoard(264, "nes2", 0)).toBeUndefined();
  });

  it("expresses the different address-line and writable-memory wiring", () => {
    expect(findConyYokoBoard(83, "nes2", 0)).toMatchObject({
      chrBankBytes: 0x0400,
      innerPrgBytes: 0x40_000,
      prgAddressMask: 0xff,
      chrOuterShift: null,
      maximumChrBytes: 0x40_000,
      maps32KiBPrgNvRam: false,
    });
    expect(findConyYokoBoard(83, "nes2", 1)).toMatchObject({
      chrBankBytes: 0x0800,
      maximumChrBytes: 0x80_000,
    });
    expect(findConyYokoBoard(83, "nes2", 2)).toMatchObject({
      innerPrgBytes: 0x40_000,
      prgAddressMask: 0x3f,
      chrOuterShift: 4,
      maps32KiBPrgNvRam: true,
    });
    expect(findConyYokoBoard(83, "nes2", 3)).toMatchObject({
      innerPrgBytes: 0x20_000,
      prgAddressMask: 0x3f,
      chrOuterShift: 6,
      maps32KiBPrgNvRam: false,
    });
  });
});
