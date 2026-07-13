import { describe, expect, it } from "vitest";
import { SpriteEvaluator } from "./sprite-evaluator.js";

describe("sprite evaluator", () => {
  it("selects the first eight in-range sprites and asserts overflow on dot 130", () => {
    const oam = createOam();
    for (let sprite = 0; sprite < 9; sprite++) oam[sprite * 4] = 0;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    const overflowDots = clockEvaluation(evaluator, oam);

    expect(evaluator.count).toBe(8);
    expect(Array.from({ length: 8 }, (_, slot) => evaluator.originalIndex(slot))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(overflowDots[0]).toBe(130);
  });

  it("reproduces the diagonal overflow search after an out-of-range ninth sprite", () => {
    const oam = createOam();
    for (let sprite = 0; sprite < 8; sprite++) oam[sprite * 4] = 0;
    oam[8 * 4] = 0xff;
    oam[9 * 4 + 1] = 0;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    const overflowDots = clockEvaluation(evaluator, oam);

    expect(overflowDots[0]).toBe(132);
  });

  it("does not wrap the diagonal search beyond sprite 63", () => {
    const oam = createOam();
    for (let sprite = 0; sprite < 8; sprite++) oam[sprite * 4] = 0;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    expect(clockEvaluation(evaluator, oam)).toEqual([]);
  });

  it("copies selected bytes into secondary OAM and round-trips mid-evaluation", () => {
    const oam = createOam();
    oam.set([4, 0x21, 0x42, 0x63], 12);
    const source = new SpriteEvaluator();
    source.begin(4, 16);
    for (let dot = 65; dot <= 90; dot++) source.clock(dot, oam);
    const restored = new SpriteEvaluator();
    restored.restoreState(source.captureState());

    for (let dot = 91; dot <= 256; dot++) restored.clock(dot, oam);

    expect(restored.count).toBe(1);
    expect(restored.originalIndex(0)).toBe(3);
    expect(Array.from({ length: 4 }, (_, byte) => restored.readSelectedByte(0, byte))).toEqual([
      4, 0x21, 0x42, 0x63,
    ]);
  });

  it("projects secondary-OAM clear, evaluation and fetch phases onto the data bus", () => {
    const oam = createOam();
    oam.set([0, 0x21, 0x42, 0x63], 0);
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    expect(evaluator.readDataBus(64)).toBe(0xff);
    evaluator.clock(65, oam);
    expect(evaluator.readDataBus(65)).toBe(0);
    evaluator.clock(66, oam);
    evaluator.clock(67, oam);
    expect(evaluator.readDataBus(67)).toBe(0x21);
    for (let dot = 68; dot <= 256; dot++) evaluator.clock(dot, oam);

    expect([257, 258, 259, 260, 261].map((dot) => evaluator.readDataBus(dot))).toEqual([
      0, 0x21, 0x42, 0x63, 0x63,
    ]);
  });

  it("leaves sprite 63's Y in the first empty fetch slot", () => {
    const oam = createOam();
    oam[63 * 4] = 0xaa;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    clockEvaluation(evaluator, oam);

    expect(evaluator.count).toBe(0);
    expect([257, 258, 259, 260].map((dot) => evaluator.readDataBus(dot))).toEqual([
      0xaa, 0xff, 0xff, 0xff,
    ]);
  });

  it("continues failed Y-byte copies after primary OAM wraps", () => {
    const oam = createOam();
    oam[0] = 0xa0;
    oam[4] = 0xb0;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    for (let dot = 65; dot <= 192; dot++) evaluator.clock(dot, oam);
    evaluator.clock(193, oam);
    expect(evaluator.readDataBus(193)).toBe(0xa0);
    evaluator.clock(194, oam);
    evaluator.clock(195, oam);
    expect(evaluator.readDataBus(195)).toBe(0xb0);
  });

  it("switches even-dot reads to secondary OAM after the fill dot completes", () => {
    const oam = createOam();
    for (let sprite = 1; sprite <= 8; sprite++) oam[sprite * 4] = 0;
    oam[8 * 4 + 3] = 0x44;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    for (let dot = 65; dot <= 129; dot++) evaluator.clock(dot, oam);
    expect(evaluator.readDataBus(129)).toBe(0x44);
    evaluator.clock(130, oam);
    expect(evaluator.readDataBus(130)).toBe(0x44);
    evaluator.clock(131, oam);
    evaluator.clock(132, oam);
    expect(evaluator.readDataBus(132)).toBe(0);
  });

  it("realigns to Y-byte reads after completing the overflowing sprite", () => {
    const oam = createOam();
    for (let sprite = 0; sprite < 9; sprite++) oam[sprite * 4] = 0;
    oam[9 * 4] = 0x91;
    oam[9 * 4 + 1] = 0x92;
    oam[10 * 4] = 0xa1;
    const evaluator = new SpriteEvaluator();
    evaluator.begin(0, 8);

    for (let dot = 65; dot <= 138; dot++) evaluator.clock(dot, oam);
    evaluator.clock(139, oam);

    expect(evaluator.readDataBus(139)).toBe(0xa1);
  });
});

function createOam(): Uint8Array {
  const oam = new Uint8Array(256);
  oam.fill(0xff);
  return oam;
}

function clockEvaluation(evaluator: SpriteEvaluator, oam: Uint8Array): number[] {
  const overflowDots: number[] = [];
  for (let dot = 65; dot <= 256; dot++) {
    if (evaluator.clock(dot, oam)) overflowDots.push(dot);
  }
  return overflowDots;
}
