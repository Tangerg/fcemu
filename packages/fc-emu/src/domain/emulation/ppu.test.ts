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
    for (let cycle = 0; cycle < 10; cycle++) bus.Mapper.tickPpu?.();
    bus.PPU.writeRegister(0x2006, 0x10);
    bus.PPU.writeRegister(0x2006, 0x00);

    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("clocks MMC3 from the real sprite-pattern fetch at dot 260", () => {
    const bus = new Bus(createTestCartridge({ mapper: 4, prgBanks: 2, chrBanks: 1 }));
    advanceBusPpuTo(bus, 0, 0);
    bus.PPU.writeRegister(0x2000, 0x08); // background at $0000, 8x8 sprites at $1000
    bus.PPU.writeRegister(0x2001, 0x18);
    bus.Mapper.write(0xc000, 0);
    bus.Mapper.write(0xc001, 0);
    bus.Mapper.write(0xe001, 0);

    advanceBusPpuTo(bus, 0, 259);
    expect(bus.CPU.hasPendingIRQ).toBe(false);
    clockPpu(bus);

    expect(bus.PPU.cycle).toBe(260);
    expect(bus.CPU.hasPendingIRQ).toBe(true);
  });

  it("commits an MMC2 latch only after returning the triggering PPU byte", () => {
    const cartridge = createTestCartridge({ mapper: 9, prgBanks: 8, chrBanks: 8 });
    cartridge.chrRom[3 * 0x1000 + 0x0fe8] = 0x31;
    cartridge.chrRom[4 * 0x1000] = 0x42;
    const bus = new Bus(cartridge);
    bus.Mapper.write(0xd000, 3);
    bus.Mapper.write(0xe000, 4);

    expect(bus.PPU.read(0x1fe8)).toBe(0x31);
    expect(bus.PPU.read(0x1000)).toBe(0x42);
    expect(bus.Mapper.captureState()).toMatchObject({ kind: "mmc2", latch1Fe: true });
  });

  it("fetches sequential MMC2 sprites at their real PPU addresses and latch states", () => {
    const cartridge = createTestCartridge({ mapper: 9, prgBanks: 8, chrBanks: 8 });
    // The $FE sprite is fetched from the FD bank and flips the latch only after
    // its high plane. The following sprite must therefore come from the FE bank.
    cartridge.chrRom[3 * 0x1000 + 0x0fe0] = 0xff;
    cartridge.chrRom[3 * 0x1000 + 0x0fe8] = 0x00;
    cartridge.chrRom[4 * 0x1000 + 0x0000] = 0x00;
    cartridge.chrRom[4 * 0x1000 + 0x0008] = 0xff;
    const bus = new Bus(cartridge);
    bus.Mapper.write(0xd000, 3);
    bus.Mapper.write(0xe000, 4);
    bus.PPU.writeRegister(0x2003, 0);
    for (const value of [0, 0xfe, 0, 0, 0, 0x00, 0, 8]) {
      bus.PPU.writeRegister(0x2004, value);
    }
    bus.PPU.writeRegister(0x2000, 0x08);
    bus.PPU.writeRegister(0x2001, 0x10);

    advanceTo(bus.PPU, 0, 321);

    expect(bus.PPU.captureState().spritePatterns.slice(0, 2)).toEqual(
      new Uint32Array([0x11111111, 0x22222222]),
    );
    expect(bus.Mapper.captureState()).toMatchObject({ kind: "mmc2", latch1Fe: true });
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

  it("applies PPUMASK colour emphasis to rendered pixels", () => {
    const backdrop = 0x30; // white backdrop so every channel can be attenuated

    const plain = renderBackdropPixel(backdrop, 0x08);
    expect(plain).toEqual({ r: 0xff, g: 0xfe, b: 0xff, a: 0xff });

    // Blue emphasis (PPUMASK bit 7) dims red and green while leaving blue alone.
    const blueEmphasis = renderBackdropPixel(backdrop, 0x08 | 0x80);
    expect(blueEmphasis.b).toBe(0xff);
    expect(blueEmphasis.r).toBeLessThan(0xff);
    expect(blueEmphasis.g).toBeLessThan(0xfe);
    expect(blueEmphasis.r).toBe(Math.round(0xff * 0.746));

    // All three emphasis bits darken every channel of the picture.
    const dimmed = renderBackdropPixel(backdrop, 0x08 | 0xe0);
    expect(dimmed.r).toBeLessThan(0xff);
    expect(dimmed.g).toBeLessThan(0xfe);
    expect(dimmed.b).toBeLessThan(0xff);
  });

  it("applies Vs. RGB palettes, force-high emphasis and 2C05 register protection", () => {
    const rgbCartridge = createVsCartridge(2);
    const plain = renderBackdropPixelWithCartridge(rgbCartridge, 0x00, 0x08);
    expect(plain).toEqual({ r: 0xff, g: 0xb6, b: 0xb6, a: 0xff });
    const greenEmphasis = renderBackdropPixelWithCartridge(createVsCartridge(2), 0x00, 0x08 | 0x40);
    expect(greenEmphasis).toEqual({ r: 0xff, g: 0xff, b: 0xb6, a: 0xff });

    const ppu = new Bus(createVsCartridge(9)).PPU;
    ppu.writeRegister(0x2000, 0x80);
    expect(ppu.flagBlueTint).toBe(1);
    ppu.writeRegister(0x2001, 0x80);
    expect(ppu.captureState().nmiOutput).toBe(true);
    expect(ppu.readRegister(0x2002) & 0x3f).toBe(0x3d);
  });

  it("does not perform the composite PPU's missing odd-frame dot on Vs. RGB PPUs", () => {
    const standard = new Bus(createTestCartridge()).PPU;
    const vs = new Bus(createVsCartridge(0)).PPU;
    prepareOddFrameSkip(standard);
    prepareOddFrameSkip(vs);

    standard.update();
    vs.update();

    expect({ cycle: standard.cycle, scanLine: standard.scanLine, frame: standard.frame }).toEqual({
      cycle: 0,
      scanLine: 0,
      frame: 1,
    });
    expect({ cycle: vs.cycle, scanLine: vs.scanLine, frame: vs.frame }).toEqual({
      cycle: 340,
      scanLine: 261,
      frame: 0,
    });
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

  it("wraps PPUDATA increments within the 15-bit VRAM address register", () => {
    const ppu = new Bus(createTestCartridge()).PPU;
    const state = ppu.captureState();
    ppu.restoreState({ ...state, v: 0x7fff });

    ppu.readRegister(0x2007);

    expect(ppu.captureState().v).toBe(0);
  });

  it("rejects an invalid scalar before changing PPU memory or NMI state", () => {
    const bus = new Bus(createTestCartridge());
    const before = bus.PPU.captureState();
    const beforeInterrupts = bus.CPU.captureState().interrupts;
    const changedPalette = before.paletteData.slice();
    changedPalette[0] = 0x2a;

    expect(() =>
      bus.PPU.restoreState({
        ...before,
        paletteData: changedPalette,
        bufferedData: 0x100,
      }),
    ).toThrow(/register state/i);
    expect(bus.PPU.captureState()).toEqual(before);
    expect(bus.CPU.captureState().interrupts).toEqual(beforeInterrupts);
  });

  it("reconciles the CPU NMI input after direct PPU restoration", () => {
    const bus = new Bus(createTestCartridge());
    const before = bus.PPU.captureState();

    bus.PPU.restoreState({
      ...before,
      nmiOccurred: true,
      nmiOutput: true,
      nmiLineAsserted: true,
    });
    expect(bus.CPU.captureState().interrupts.nmiLineAsserted).toBe(true);

    bus.PPU.restoreState(before);
    expect(bus.CPU.captureState().interrupts.nmiLineAsserted).toBe(false);
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

function advanceBusPpuTo(bus: Bus, scanLine: number, cycle: number): void {
  while (bus.PPU.scanLine !== scanLine || bus.PPU.cycle !== cycle) clockPpu(bus);
}

function clockPpu(bus: Bus): void {
  bus.PPU.update();
  bus.Mapper.tickPpu?.();
}

/** Renders a full frame of the backdrop colour and returns one visible pixel. */
function renderBackdropPixel(
  paletteIndex: number,
  mask: number,
): { r: number; g: number; b: number; a: number } {
  const ppu = new Bus(createTestCartridge()).PPU;
  ppu.write(0x3f00, paletteIndex);
  ppu.writeRegister(0x2001, mask);
  advanceToFrameStart(ppu); // finish the partial power-on frame
  advanceToFrameStart(ppu); // render one full frame with the mask applied
  return FrameBuffer.extractRGBA(ppu.front.getRGBA(10, 10));
}

function renderBackdropPixelWithCartridge(
  cartridge: ReturnType<typeof createTestCartridge>,
  paletteIndex: number,
  mask: number,
): { r: number; g: number; b: number; a: number } {
  const ppu = new Bus(cartridge).PPU;
  ppu.write(0x3f00, paletteIndex);
  ppu.writeRegister(0x2001, mask);
  advanceToFrameStart(ppu);
  advanceToFrameStart(ppu);
  return FrameBuffer.extractRGBA(ppu.front.getRGBA(10, 10));
}

function createVsCartridge(vsPpuType: number) {
  return createTestCartridge({
    mapper: 99,
    nes2: true,
    consoleType: 1,
    vsPpuType,
    prgRomBytes: 0x8000,
    chrRomBytes: 0x2000,
    prgRamShift: 5,
    chrRamShift: 0,
  });
}

function prepareOddFrameSkip(ppu: Bus["PPU"]): void {
  const state = ppu.captureState();
  ppu.restoreState({
    ...state,
    cycle: 339,
    scanLine: 261,
    frame: 0,
    f: 1,
    flagShowBackground: 1,
    effectiveRenderingMask: 0x08,
    pendingRenderingMask: 0x08,
    renderingMaskDelay: 0,
  });
}
