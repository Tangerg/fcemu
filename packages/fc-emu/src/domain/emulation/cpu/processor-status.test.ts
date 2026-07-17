import { describe, expect, it } from "vitest";
import { ProcessorStatus } from "./processor-status.js";

describe("6502 processor status", () => {
  it("restores the interrupt-disabled power-on byte", () => {
    const status = new ProcessorStatus();

    status.flags = 0xff;
    status.powerOn();

    expect(status.flags).toBe(0x24);
  });

  it("preserves arithmetic flags while masking IRQ on soft reset", () => {
    const status = new ProcessorStatus();
    status.flags = 0xc9;

    status.reset();

    expect(status.flags).toBe(0xed);
  });

  it("packs the six physical flags and normalizes the stack-only bits", () => {
    const status = new ProcessorStatus();

    status.flags = 0xdf;

    expect(status).toMatchObject({ C: true, I: true, D: true, V: true });
    expect(status.Z).toBe(true);
    expect(status.N).toBe(true);
    expect(status.flags).toBe(0xef);

    status.flags = 0x10;
    expect(status.flags).toBe(0x20);
  });

  it.each([
    [0x00, true, false],
    [0x80, false, true],
    [0x100, false, false],
    [-1, false, true],
  ] as const)("derives Z and N from result %s", (value, zero, negative) => {
    const status = new ProcessorStatus();

    status.ZN = value;

    expect(status.Z).toBe(zero);
    expect(status.N).toBe(negative);
  });
});
