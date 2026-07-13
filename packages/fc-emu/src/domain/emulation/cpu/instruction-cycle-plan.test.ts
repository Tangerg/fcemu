import { describe, expect, it } from "vitest";
import { getInstruction, InstructionMemoryOperation } from "./instruction-set.js";
import { createInstructionCyclePlan } from "./instruction-cycle-plan.js";

describe("CPU instruction cycle plans", () => {
  it("assigns every opcode to a cycle family", () => {
    const plans = Array.from({ length: 0x100 }, (_, opcode) =>
      createInstructionCyclePlan(getInstruction(opcode)),
    );

    expect(plans).toHaveLength(0x100);
    expect(plans.every((plan) => plan.kind.length > 0)).toBe(true);
  });

  it.each([
    [0x00, { kind: "brk" }],
    [0xea, { kind: "implied" }],
    [0xd0, { kind: "branch" }],
    [0x48, { kind: "stack", operation: "pha" }],
    [0x6c, { kind: "control-flow", operation: "jmp-indirect" }],
    [0xa9, { kind: "memory", cycle: "immediate", operation: InstructionMemoryOperation.Read }],
    [
      0x9d,
      {
        kind: "memory",
        cycle: "absolute-indexed-write",
        operation: InstructionMemoryOperation.Write,
        index: "x",
      },
    ],
    [
      0x1e,
      {
        kind: "memory",
        cycle: "absolute-indexed-write",
        operation: InstructionMemoryOperation.ReadModifyWrite,
        index: "x",
      },
    ],
    [
      0x11,
      {
        kind: "memory",
        cycle: "indirect-indexed-read",
        operation: InstructionMemoryOperation.Read,
        index: "y",
      },
    ],
  ] as const)("plans opcode $%s", (opcode, expected) => {
    expect(createInstructionCyclePlan(getInstruction(opcode))).toEqual(expected);
  });
});
