import { describe, expect, it } from "vitest";
import { AddressingMode, getInstruction, InstructionMemoryOperation } from "./instruction-set.js";

describe("6502 instruction set", () => {
  it("provides one stable definition for every opcode", () => {
    const definitions = Array.from({ length: 0x100 }, (_, opcode) => getInstruction(opcode));

    expect(definitions).toHaveLength(0x100);
    expect(new Set(definitions).size).toBe(0x100);
    expect(getInstruction(0xa9)).toBe(definitions[0xa9]);
    for (const [opcode, definition] of definitions.entries()) {
      expect(definition).toMatchObject({ operationCode: opcode });
      expect(definition.byteLength).toBeGreaterThanOrEqual(1);
      expect(definition.byteLength).toBeLessThanOrEqual(3);
      expect(definition.baseCycles).toBeGreaterThan(0);
      expect([0, 1]).toContain(definition.pageBoundaryCycles);
      expect(Object.isFrozen(definition)).toBe(true);
    }
  });

  it.each([
    [0x00, AddressingMode.Implied, 2, 7],
    [0xa9, AddressingMode.Immediate, 2, 2],
    [0x8d, AddressingMode.Absolute, 3, 4],
    [0x6c, AddressingMode.Indirect, 3, 5],
  ] as const)(
    "decodes opcode $%s into its addressing and timing definition",
    (opcode, addressingMode, byteLength, baseCycles) => {
      expect(getInstruction(opcode)).toMatchObject({
        operationCode: opcode,
        addressingMode,
        byteLength,
        baseCycles,
      });
    },
  );

  it("classifies read, write and read-modify-write bus behavior", () => {
    expect(getInstruction(0xad).memoryOperation).toBe(InstructionMemoryOperation.Read);
    expect(getInstruction(0x8d).memoryOperation).toBe(InstructionMemoryOperation.Write);
    expect(getInstruction(0x0e).memoryOperation).toBe(InstructionMemoryOperation.ReadModifyWrite);
  });

  it("rejects values outside the one-byte opcode domain", () => {
    expect(() => getInstruction(-1)).toThrow(RangeError);
    expect(() => getInstruction(0x100)).toThrow(RangeError);
    expect(() => getInstruction(0.5)).toThrow(RangeError);
    expect(() => getInstruction(Number.NaN)).toThrow(RangeError);
  });
});
