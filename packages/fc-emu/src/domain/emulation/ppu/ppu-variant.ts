type PpuEmphasisModel = "composite-attenuation" | "rgb-force-high";

export interface PpuVariant {
  readonly id:
    | "rp2c02"
    | "rp2c03"
    | "rp2c04-0001"
    | "rp2c04-0002"
    | "rp2c04-0003"
    | "rp2c04-0004"
    | "rc2c05-01"
    | "rc2c05-02"
    | "rc2c05-03"
    | "rc2c05-04";
  readonly masterPaletteRgba: readonly number[];
  readonly emphasisModel: PpuEmphasisModel;
  readonly swapsControlAndMask: boolean;
  readonly statusSignature: {
    readonly value: number;
    readonly drivenMask: number;
  };
  readonly skipsOddFrameDot: boolean;
}

const COMPOSITE_PALETTE_RGBA: readonly number[] = [
  0x666666ff, 0x002a88ff, 0x1412a7ff, 0x3b00a4ff, 0x5c007eff, 0x6e0040ff, 0x6c0600ff, 0x561d00ff,
  0x333500ff, 0x0b4800ff, 0x005200ff, 0x004f08ff, 0x00404dff, 0x000000ff, 0x000000ff, 0x000000ff,
  0xadadadff, 0x155fd9ff, 0x4240ffff, 0x7527feff, 0xa01accff, 0xb71e7bff, 0xb53120ff, 0x994e00ff,
  0x6b6d00ff, 0x388700ff, 0x0c9300ff, 0x008f32ff, 0x007c8dff, 0x000000ff, 0x000000ff, 0x000000ff,
  0xfffeffff, 0x64b0ffff, 0x9290ffff, 0xc676ffff, 0xf36affff, 0xfe6eccff, 0xfe8170ff, 0xea9e22ff,
  0xbcbe00ff, 0x88d800ff, 0x5ce430ff, 0x45e082ff, 0x48cddeff, 0x4f4f4fff, 0x000000ff, 0x000000ff,
  0xfffeffff, 0xc0dfffff, 0xd3d2ffff, 0xe8c8ffff, 0xfbc2ffff, 0xfec4eaff, 0xfeccc5ff, 0xf7d8a5ff,
  0xe4e594ff, 0xcfef96ff, 0xbdf4abff, 0xb3f3ccff, 0xb5ebf2ff, 0xb8b8b8ff, 0x000000ff, 0x000000ff,
];

const RGB_2C03 = `
333 014 006 326 403 503 510 420 320 120 031 040 022 000 000 000
555 036 027 407 507 704 700 630 430 140 040 053 044 000 000 000
777 357 447 637 707 737 740 750 660 360 070 276 077 000 000 000
777 567 657 757 747 755 764 772 773 572 473 276 467 000 000 000`;

const RGB_2C04_0001 = `
755 637 700 447 044 120 222 704 777 333 750 503 403 660 320 777
357 653 310 360 467 657 764 027 760 276 000 200 666 444 707 014
003 567 757 070 077 022 053 507 000 420 747 510 407 006 740 000
000 140 555 031 572 326 770 630 020 036 040 111 773 737 430 473`;

const RGB_2C04_0002 = `
000 750 430 572 473 737 044 567 700 407 773 747 777 637 467 040
020 357 510 666 053 360 200 447 222 707 003 276 657 320 000 326
403 764 740 757 036 310 555 006 507 760 333 120 027 000 660 777
653 111 070 630 022 014 704 140 000 077 420 770 755 503 031 444`;

const RGB_2C04_0003 = `
507 737 473 555 040 777 567 120 014 000 764 320 704 666 653 467
447 044 503 027 140 430 630 053 333 326 000 006 700 510 747 755
637 020 003 770 111 750 740 777 360 403 357 707 036 444 000 310
077 200 572 757 420 070 660 222 031 000 657 773 407 276 760 022`;

const RGB_2C04_0004 = `
430 326 044 660 000 755 014 630 555 310 070 003 764 770 040 572
737 200 027 747 000 222 510 740 653 053 447 140 403 000 473 357
503 031 420 006 407 507 333 704 022 666 036 020 111 773 444 707
757 777 320 700 760 276 777 467 000 750 637 567 360 657 077 120`;

const RGB_PALETTES = Object.freeze({
  0: decodeRgbDacPalette(RGB_2C03),
  2: decodeRgbDacPalette(RGB_2C04_0001),
  3: decodeRgbDacPalette(RGB_2C04_0002),
  4: decodeRgbDacPalette(RGB_2C04_0003),
  5: decodeRgbDacPalette(RGB_2C04_0004),
});

const STANDARD_PPU: PpuVariant = Object.freeze({
  id: "rp2c02",
  masterPaletteRgba: COMPOSITE_PALETTE_RGBA,
  emphasisModel: "composite-attenuation",
  swapsControlAndMask: false,
  statusSignature: Object.freeze({ value: 0, drivenMask: 0 }),
  skipsOddFrameDot: true,
});

/** Resolves immutable display-chip wiring from explicit cartridge console metadata. */
export function resolvePpuVariant(consoleType: number, vsPpuType: number): PpuVariant {
  if (consoleType !== 1) return STANDARD_PPU;

  const palette = RGB_PALETTES[vsPpuType as keyof typeof RGB_PALETTES] ?? RGB_PALETTES[0];
  const is2C05 = vsPpuType >= 8;
  const signatures: Readonly<
    Record<number, { readonly value: number; readonly drivenMask: number }>
  > = {
    9: { value: 0x3d, drivenMask: 0x3f },
    10: { value: 0x1c, drivenMask: 0x1f },
    11: { value: 0x1b, drivenMask: 0x1f },
  };
  const ids: Readonly<Record<number, PpuVariant["id"]>> = {
    0: "rp2c03",
    2: "rp2c04-0001",
    3: "rp2c04-0002",
    4: "rp2c04-0003",
    5: "rp2c04-0004",
    8: "rc2c05-01",
    9: "rc2c05-02",
    10: "rc2c05-03",
    11: "rc2c05-04",
  };
  return Object.freeze({
    id: ids[vsPpuType] ?? "rp2c03",
    masterPaletteRgba: palette,
    emphasisModel: "rgb-force-high",
    swapsControlAndMask: is2C05,
    statusSignature: Object.freeze(signatures[vsPpuType] ?? { value: 0, drivenMask: 0 }),
    skipsOddFrameDot: false,
  });
}

function decodeRgbDacPalette(source: string): readonly number[] {
  const colors = source
    .trim()
    .split(/\s+/u)
    .map((code) => {
      if (!/^[0-7]{3}$/u.test(code)) throw new Error(`Invalid RGB PPU DAC code ${code}`);
      const [r = "0", g = "0", b = "0"] = code;
      const expand = (digit: string): number => Math.round((Number(digit) * 255) / 7);
      return ((expand(r) << 24) | (expand(g) << 16) | (expand(b) << 8) | 0xff) >>> 0;
    });
  if (colors.length !== 64) throw new Error("RGB PPU palette must contain exactly 64 colours");
  return Object.freeze(colors);
}
