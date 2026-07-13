import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../test-support/rom.js";
import { FrameBuffer } from "../model/frame-buffer.js";
import { CartridgeTimingMode } from "../model/cartridge.js";
import Bus from "./bus.js";
import PPU from "./ppu.js";

describe("PPU", () => {
  it("stores the system palette in canvas RGBA byte order", () => {
    expect(FrameBuffer.extractRGBA(PPU.PALETTE[0] ?? 0)).toEqual({
      r: 0x66,
      g: 0x66,
      b: 0x66,
      a: 0xff,
    });
  });

  it("keeps all four nametables distinct in four-screen mode", () => {
    const bus = new Bus(createTestCartridge({ fourScreen: true }));
    const addresses = [0x2000, 0x2400, 0x2800, 0x2c00];
    addresses.forEach((address, index) => bus.PPU.write(address, index + 1));
    expect(addresses.map((address) => bus.PPU.read(address))).toEqual([1, 2, 3, 4]);
  });

  it("uses only the low fourteen bits of every PPU bus address", () => {
    const ppu = new Bus(createTestCartridge()).PPU;

    ppu.write(-0x2000, 0x42);
    expect(ppu.read(0x2000)).toBe(0x42);
    ppu.write(0x7f1f, 0x2a);
    expect(ppu.read(0x3f1f)).toBe(0x2a);
  });

  it("projects PPUADDR A12 transitions to an MMC3 cartridge", () => {
    const bus = new Bus(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }));
    bus.Mapper.write(0xc000, 0);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    bus.PPU.writeRegister(0x2006, 0x00);
    bus.PPU.writeRegister(0x2006, 0x00);
    for (let cycle = 0; cycle < 10; cycle++) bus.Mapper.tickPpu();
    bus.PPU.writeRegister(0x2006, 0x10);
    bus.PPU.writeRegister(0x2006, 0x00);

    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it.each([
    [CartridgeTimingMode.Pal, 106_392],
    [CartridgeTimingMode.Dendy, 106_392],
  ])("runs timing mode %i for a full 312-scanline frame", (timingMode, expectedDots) => {
    const bus = new Bus(createTestCartridge({ nes2: true, timingMode }));
    advanceToFrameStart(bus.PPU);
    expect(countFrameDots(bus.PPU)).toBe(expectedDots);
  });

  it("skips one PPU dot only on rendered odd NTSC frames", () => {
    const bus = new Bus(createTestCartridge());
    bus.PPU.writeRegister(0x2001, 0x08);
    advanceToFrameStart(bus.PPU);

    expect(countFrameDots(bus.PPU)).toBe(89_341);
    expect(countFrameDots(bus.PPU)).toBe(89_342);
  });

  it("starts Dendy vblank after its additional post-render scanlines", () => {
    const bus = new Bus(createTestCartridge({ nes2: true, timingMode: CartridgeTimingMode.Dendy }));
    advanceToFrameStart(bus.PPU);
    advanceTo(bus.PPU, 241, 1);
    expect(bus.PPU.readRegister(0x2002) & 0x80).toBe(0);
    advanceTo(bus.PPU, 291, 1);
    expect(bus.PPU.readRegister(0x2002) & 0x80).toBe(0x80);
  });

  it("retains PPU memory and OAM across reset but clears them on power-on", () => {
    const bus = new Bus(createTestCartridge());
    bus.PPU.write(0x2000, 0x61);
    bus.PPU.write(0x3f00, 0x62);
    bus.PPU.writeRegister(0x2003, 7);
    bus.PPU.writeRegister(0x2004, 0x63);
    bus.PPU.writeRegister(0x2003, 7);

    bus.reset();

    expect(bus.PPU.read(0x2000)).toBe(0x61);
    expect(bus.PPU.read(0x3f00)).toBe(0x22);
    expect(bus.PPU.readRegister(0x2004)).toBe(0x63);

    bus.powerOn();
    expect(bus.PPU.read(0x2000)).toBe(0);
    expect(bus.PPU.read(0x3f00)).toBe(0);
    expect(bus.PPU.readRegister(0x2004)).toBe(0);
  });

  it("returns the PPU I/O latch from write-only ports and preserves its low status bits", () => {
    const ppu = new Bus(createTestCartridge()).PPU;

    ppu.writeRegister(0x2002, 0x5b);
    expect(ppu.readRegister(0x2000)).toBe(0x5b);

    expect(ppu.readRegister(0x2002)).toBe(0x1b);
    expect(ppu.readRegister(0x2001)).toBe(0x1b);
  });

  it("suppresses vblank when PPUSTATUS is read one dot before it would be set", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    advanceTo(ppu, 241, 0);

    expect(ppu.readRegister(0x2002) & 0x80).toBe(0);
    ppu.update();
    expect(ppu.readRegister(0x2002) & 0x80).toBe(0);
  });

  it("owns the one-dot sprite-zero pipeline inside the PPU snapshot", () => {
    const bus = new Bus(createTestCartridge());
    const state = bus.captureState();
    bus.restoreState({
      ...state,
      ppu: { ...state.ppu, spriteZeroHit: { pending: true, latched: false } },
    });

    expect(bus.PPU.readRegister(0x2002) & 0x40).toBe(0);
    bus.PPU.update();
    expect(bus.PPU.readRegister(0x2002) & 0x40).toBe(0x40);
    expect(() =>
      bus.restoreState({
        ...state,
        ppu: { ...state.ppu, spriteZeroHit: { pending: true, latched: true } },
      }),
    ).toThrow(/sprite-zero/);
  });

  it("loads OAM and non-palette PPUDATA reads onto the PPU I/O latch", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 2);
    ppu.writeRegister(0x2004, 0xff);
    ppu.writeRegister(0x2003, 2);

    expect(ppu.readRegister(0x2004)).toBe(0xe3);
    expect(ppu.readRegister(0x2000)).toBe(0xe3);

    ppu.write(0x2000, 0x6a);
    ppu.writeRegister(0x2006, 0x20);
    ppu.writeRegister(0x2006, 0x00);
    ppu.readRegister(0x2007);
    expect(ppu.readRegister(0x2007)).toBe(0x6a);
    expect(ppu.readRegister(0x2005)).toBe(0x6a);
  });

  it("combines palette data with open-bus high bits and applies grayscale on reads", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.write(0x3f00, 0x2a);
    ppu.writeRegister(0x2001, 0x01);
    ppu.writeRegister(0x2006, 0x3f);
    ppu.writeRegister(0x2006, 0x00);
    ppu.writeRegister(0x2002, 0xc0);

    expect(ppu.readRegister(0x2007)).toBe(0xe0);
    expect(ppu.readRegister(0x2000)).toBe(0xe0);
  });

  it("treats OAMDMA as CPU-owned while its destination writes still drive the PPU latch", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2002, 0x55);

    ppu.writeRegister(0x4014, 0xaa);
    expect(ppu.readRegister(0x2000)).toBe(0x55);

    ppu.writeOamDma(0x73);
    expect(ppu.readRegister(0x2001)).toBe(0x73);
  });

  it("exposes secondary-OAM initialization and primary-OAM evaluation through $2004", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 0);
    for (const value of [0, 0x34, 0x20, 0x56]) ppu.writeRegister(0x2004, value);
    ppu.writeRegister(0x2003, 0x40);
    ppu.writeRegister(0x2004, 0x99);
    ppu.writeRegister(0x2001, 0x18);

    advanceTo(ppu, 0, 64);
    expect(ppu.readRegister(0x2004)).toBe(0xff);
    advanceTo(ppu, 0, 65);
    expect(ppu.readRegister(0x2004)).toBe(0);
    advanceTo(ppu, 0, 67);
    expect(ppu.readRegister(0x2004)).toBe(0x34);
  });

  it("keeps the internal OAM bus selected on rendering dot zero", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 0);
    ppu.writeRegister(0x2004, 0x31);
    ppu.writeRegister(0x2001, 0x18);

    advanceTo(ppu, 0, 0);

    expect(ppu.readRegister(0x2004)).toBe(0xff);
  });

  it("exposes secondary-OAM fetch bytes and resets OAMADDR during sprite loading", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 0);
    for (const value of [0, 0x34, 0x20, 0x56]) ppu.writeRegister(0x2004, value);
    ppu.writeRegister(0x2001, 0x18);

    advanceTo(ppu, 0, 257);
    expect(ppu.readRegister(0x2004)).toBe(0);
    advanceTo(ppu, 0, 258);
    expect(ppu.readRegister(0x2004)).toBe(0x34);

    ppu.writeRegister(0x2001, 0);
    ppu.update();
    ppu.update();
    expect(ppu.readRegister(0x2004)).toBe(0);
  });

  it("ignores OAMDATA writes while rendering owns the OAM bus", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 0);
    ppu.writeRegister(0x2004, 0x31);
    ppu.writeRegister(0x2001, 0x18);
    advanceTo(ppu, 0, 100);

    ppu.writeRegister(0x2003, 0);
    ppu.writeRegister(0x2004, 0xaa);
    ppu.writeRegister(0x2001, 0);
    ppu.update();
    ppu.update();
    ppu.writeRegister(0x2003, 0);

    expect(ppu.readRegister(0x2004)).toBe(0x31);
  });

  it("wraps OAMDATA writes from $FF back to $00", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    ppu.writeRegister(0x2003, 0xff);
    ppu.writeRegister(0x2004, 0x12);
    ppu.writeRegister(0x2004, 0x34);

    ppu.writeRegister(0x2003, 0xff);
    expect(ppu.readRegister(0x2004)).toBe(0x12);
    ppu.writeRegister(0x2003, 0);
    expect(ppu.readRegister(0x2004)).toBe(0x34);
  });
});

function advanceToFrameStart(ppu: PPU): void {
  const frame = ppu.frame;
  while (ppu.frame === frame) ppu.update();
}

function countFrameDots(ppu: PPU): number {
  const frame = ppu.frame;
  let dots = 0;
  while (ppu.frame === frame) {
    ppu.update();
    dots++;
  }
  return dots;
}

function advanceTo(ppu: PPU, scanLine: number, cycle: number): void {
  while (ppu.scanLine !== scanLine || ppu.cycle !== cycle) ppu.update();
}
