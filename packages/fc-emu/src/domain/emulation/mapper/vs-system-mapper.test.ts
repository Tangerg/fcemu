import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";
import { VsSystemMapper } from "./vs-system-mapper.js";

describe("VsSystemMapper", () => {
  it("maps the optional fifth PRG socket and switches it with CHR through OUT2", () => {
    const cartridge = createVsCartridge(0xa000, 0x4000);
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new VsSystemMapper(cartridge);
    mapper.powerOn();

    expect([
      mapper.read(0x8000),
      mapper.read(0xa000),
      mapper.read(0xc000),
      mapper.read(0xe000),
    ]).toEqual([0, 1, 2, 3]);
    expect(mapper.read(0x0000)).toBe(0);

    mapper.writeControllerLatch(0x04);

    expect([
      mapper.read(0x8000),
      mapper.read(0xa000),
      mapper.read(0xc000),
      mapper.read(0xe000),
    ]).toEqual([4, 1, 2, 3]);
    expect(mapper.read(0x0000)).toBe(1);
  });

  it("switches only CHR on ordinary four-socket boards", () => {
    const cartridge = createVsCartridge(0x8000, 0x4000);
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new VsSystemMapper(cartridge);
    mapper.powerOn();

    mapper.writeControllerLatch(0x04);

    expect(mapper.read(0x8000)).toBe(0);
    expect(mapper.read(0x0000)).toBe(1);
  });

  it("tri-states unpopulated fixed PRG and selected CHR sockets", () => {
    const cartridge = createVsCartridge(0x6000, 0x2000);
    const mapper = new VsSystemMapper(cartridge);
    mapper.powerOn();

    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0xa000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0xc000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0xe000)).toBe(0);

    mapper.writeControllerLatch(0x04);

    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
    expect(mapper.ppuReadDriveMask(0x0000)).toBe(0);
  });

  it("mirrors 2 KiB shared RAM and validates bank state", () => {
    const cartridge = createVsCartridge(0x8000, 0x2000);
    const mapper = new VsSystemMapper(cartridge);
    mapper.powerOn();

    mapper.write(0x6005, 0x91);
    mapper.writeControllerLatch(0x04);
    expect(mapper.read(0x6805)).toBe(0x91);
    expect(mapper.captureState()).toEqual({ kind: "vs-system", selectedBank: 1 });

    mapper.reset();
    expect(mapper.captureState()).toEqual({ kind: "vs-system", selectedBank: 0 });
    expect(() => mapper.restoreState({ kind: "vs-system", selectedBank: 2 })).toThrow(RangeError);
  });

  it("accepts socket-granular layouts and rejects fabricated RAM/ROM geometries", () => {
    expect(() =>
      createMapper(createVsCartridge(0x2000, 0x2000), { setMapperIrq() {} }),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 99,
          nes2: true,
          consoleType: 1,
          prgRomBytes: 0x8000,
          chrRomBytes: 0x2000,
          prgRamShift: 7,
          chrRamShift: 0,
        }),
        { setMapperIrq() {} },
      ),
    ).toThrow(/2 KiB/);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 99,
          nes2: true,
          consoleType: 1,
          prgRomBytes: 0x8000,
          chrRomBytes: 0x6000,
          prgRamShift: 5,
          chrRamShift: 0,
        }),
        { setMapperIrq() {} },
      ),
    ).toThrow(/CHR ROM/);
  });
});

function createVsCartridge(prgRomBytes: number, chrRomBytes: number) {
  return createTestCartridge({
    mapper: 99,
    nes2: true,
    consoleType: 1,
    prgRomBytes,
    chrRomBytes,
    prgRamShift: 5,
    chrRamShift: 0,
  });
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let offset = 0; offset < memory.byteLength; offset++) {
    memory[offset] = Math.floor(offset / bankSize);
  }
}
