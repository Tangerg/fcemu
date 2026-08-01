import { describe, expect, it } from "vitest";
import { mapperIrqAsserted } from "./mapper-irq-output.js";
import type { MapperState } from "./mapper.js";

const mapperState = (state: object): MapperState => state as MapperState;

describe("mapper IRQ output", () => {
  it.each([
    ["a board without an IRQ generator", mapperState({ kind: "nrom" }), false],
    ["a direct pending latch", mapperState({ kind: "fme7", irqPending: true }), true],
    [
      "the FFE FDS timer",
      mapperState({ kind: "ffe-magic-card", irqPending: false, fdsIrqPending: true }),
      true,
    ],
    ["a VRC2 board without an IRQ unit", mapperState({ kind: "vrc2-vrc4", irq: null }), false],
    ["a VRC4 IRQ unit", mapperState({ kind: "vrc2-vrc4", irq: { pending: true } }), true],
    ["a VRC6 IRQ unit", mapperState({ kind: "vrc6", irq: { pending: true } }), true],
    ["a VRC7 IRQ unit", mapperState({ kind: "vrc7", irq: { pending: true } }), true],
    [
      "a gated Taito X1-017 latch",
      mapperState({ kind: "taito-x1-017", irqPending: true, irqOutputEnabled: false }),
      false,
    ],
    [
      "an enabled Taito X1-017 latch",
      mapperState({ kind: "taito-x1-017", irqPending: true, irqOutputEnabled: true }),
      true,
    ],
  ])("derives %s", (_name, state, expected) => {
    expect(mapperIrqAsserted(state)).toBe(expected);
  });

  it.each([
    [true, false, false, 0, true],
    [false, true, false, 0, true],
    [false, false, true, 0x80, true],
    [false, false, true, 0, false],
    [false, false, false, 0x80, false],
  ])(
    "combines MMC5 scanline=%s timer=%s PCM=%s control=%s",
    (scanline, timer, pcm, pcmControl, expected) => {
      const state = mapperState({
        kind: "mmc5",
        irqEnabled: scanline,
        irqPending: scanline,
        timerPending: timer,
        audio: { pcmPending: pcm, pcmControl },
      });

      expect(mapperIrqAsserted(state)).toBe(expected);
    },
  );
});
