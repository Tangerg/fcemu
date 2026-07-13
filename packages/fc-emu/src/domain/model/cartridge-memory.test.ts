import { describe, expect, it } from "vitest";
import { CartridgeMemory } from "./cartridge-memory.js";

describe("CartridgeMemory", () => {
  it("presents volatile and non-volatile PRG regions as mapper-selected logical banks", () => {
    const memory = createMemory({ prgRamBytes: 0x2000, prgNvRamBytes: 0x2000 });

    memory.writePrg(0, 0x11);
    memory.writePrg(0x2000, 0x22);

    expect(memory.readPrg(0)).toBe(0x11);
    expect(memory.readPrg(0x2000)).toBe(0x22);
    expect(memory.captureSave()).toMatchObject({ revision: 1 });
    expect(memory.captureSave()?.data[0]).toBe(0x22);
  });

  it("combines PRG and CHR NVRAM into one immutable persistence snapshot", () => {
    const memory = createMemory({ prgNvRamBytes: 2, chrNvRamBytes: 2 });
    memory.writePrg(0, 0x10);
    memory.writeChr(1, 0x20);

    const snapshot = memory.captureSave();
    expect(snapshot).toMatchObject({ revision: 2, data: Uint8Array.of(0x10, 0, 0, 0x20) });
    if (!snapshot) throw new Error("Expected battery save");
    snapshot.data[0] = 0xff;
    expect(memory.readPrg(0)).toBe(0x10);

    memory.restoreSave(Uint8Array.of(1, 2, 3, 4));
    expect(memory.readPrg(1)).toBe(2);
    expect(memory.readChr(0)).toBe(3);
    expect(memory.captureSave()?.revision).toBe(0);
  });

  it("initializes trainer bytes without marking a battery save dirty", () => {
    const memory = createMemory({ prgNvRamBytes: 0x2000 });
    memory.initializePrg(0x1000, Uint8Array.of(0x42));

    expect(memory.readPrg(0x1000)).toBe(0x42);
    expect(memory.captureSave()?.revision).toBe(0);
  });

  it("rejects restore sizes that do not match all persistent regions", () => {
    const memory = createMemory({ chrNvRamBytes: 0x2000 });
    expect(() => memory.restoreSave(new Uint8Array(1))).toThrow(/expected 8192, received 1/);
  });

  it("owns an immutable validated copy of its memory layout", () => {
    const layout = { prgRamBytes: 1, prgNvRamBytes: 0, chrRamBytes: 0, chrNvRamBytes: 0 };
    const memory = new CartridgeMemory(layout);
    layout.prgRamBytes = 2;

    expect(memory.layout.prgRamBytes).toBe(1);
    expect(Object.isFrozen(memory.layout)).toBe(true);
    expect(() => createMemory({ chrRamBytes: -1 })).toThrow(/non-negative safe integer/);
  });

  it("clears volatile memory on power-on while retaining all NVRAM", () => {
    const memory = createMemory({
      prgRamBytes: 1,
      prgNvRamBytes: 1,
      chrRamBytes: 1,
      chrNvRamBytes: 1,
    });
    memory.writePrg(0, 0x11);
    memory.writePrg(1, 0x12);
    memory.writeChr(0, 0x21);
    memory.writeChr(1, 0x22);

    memory.powerOn();

    expect(memory.readPrg(0)).toBe(0);
    expect(memory.readPrg(1)).toBe(0x12);
    expect(memory.readChr(0)).toBe(0);
    expect(memory.readChr(1)).toBe(0x22);
    expect(memory.captureSave()).toMatchObject({ revision: 2 });
  });
});

function createMemory(
  overrides: Partial<{
    readonly prgRamBytes: number;
    readonly prgNvRamBytes: number;
    readonly chrRamBytes: number;
    readonly chrNvRamBytes: number;
  }>,
): CartridgeMemory {
  return new CartridgeMemory({
    prgRamBytes: 0,
    prgNvRamBytes: 0,
    chrRamBytes: 0,
    chrNvRamBytes: 0,
    ...overrides,
  });
}
