import { AddressingMode, type Instruction, InstructionMemoryOperation } from "./instruction-set.js";
import type { CpuControlFlowKind } from "./cpu-control-flow-cycle.js";
import type { CpuMemoryCycleKind } from "./cpu-memory-cycle.js";

type CpuIndexRegister = "x" | "y";
export type CpuStackOperation = "pha" | "php" | "pla" | "plp";

export type InstructionCyclePlan =
  | { readonly kind: "brk" }
  | { readonly kind: "implied" }
  | { readonly kind: "branch" }
  | { readonly kind: "stack"; readonly operation: CpuStackOperation }
  | { readonly kind: "control-flow"; readonly operation: CpuControlFlowKind }
  | {
      readonly kind: "memory";
      readonly cycle: CpuMemoryCycleKind;
      readonly operation: InstructionMemoryOperation;
      readonly index?: CpuIndexRegister;
    };

const STACK_OPERATIONS = new Map<number, CpuStackOperation>([
  [0x08, "php"],
  [0x28, "plp"],
  [0x48, "pha"],
  [0x68, "pla"],
]);

const CONTROL_FLOW_OPERATIONS = new Map<number, CpuControlFlowKind>([
  [0x20, "jsr"],
  [0x40, "rti"],
  [0x4c, "jmp-absolute"],
  [0x60, "rts"],
  [0x6c, "jmp-indirect"],
]);

/** Converts immutable opcode metadata into its ordinary instruction-cycle family. */
export function createInstructionCyclePlan(instruction: Instruction): InstructionCyclePlan {
  const opcode = instruction.operationCode;
  if (opcode === 0x00) return { kind: "brk" };

  const stackOperation = STACK_OPERATIONS.get(opcode);
  if (stackOperation) return { kind: "stack", operation: stackOperation };

  const controlFlowOperation = CONTROL_FLOW_OPERATIONS.get(opcode);
  if (controlFlowOperation) return { kind: "control-flow", operation: controlFlowOperation };

  const operation = instruction.memoryOperation;
  switch (instruction.addressingMode) {
    case AddressingMode.Implied:
    case AddressingMode.Accumulator:
      if (instruction.baseCycles === 2) return { kind: "implied" };
      break;
    case AddressingMode.Relative:
      return { kind: "branch" };
    case AddressingMode.Immediate:
      return { kind: "memory", cycle: "immediate", operation };
    case AddressingMode.ZeroPage:
      return { kind: "memory", cycle: "zero-page", operation };
    case AddressingMode.ZeroPageX:
      return { kind: "memory", cycle: "zero-page-indexed", operation, index: "x" };
    case AddressingMode.ZeroPageY:
      return { kind: "memory", cycle: "zero-page-indexed", operation, index: "y" };
    case AddressingMode.Absolute:
      return { kind: "memory", cycle: "absolute", operation };
    case AddressingMode.AbsoluteX:
      return {
        kind: "memory",
        cycle: indexedCycle("absolute", operation),
        operation,
        index: "x",
      };
    case AddressingMode.AbsoluteY:
      return {
        kind: "memory",
        cycle: indexedCycle("absolute", operation),
        operation,
        index: "y",
      };
    case AddressingMode.IndexedIndirect:
      return { kind: "memory", cycle: "indexed-indirect", operation, index: "x" };
    case AddressingMode.IndirectIndexed:
      return {
        kind: "memory",
        cycle: indexedCycle("indirect", operation),
        operation,
        index: "y",
      };
    case AddressingMode.Indirect:
      break;
  }

  throw new Error(`Opcode $${opcode.toString(16).padStart(2, "0")} has no cycle plan`);
}

function indexedCycle(
  base: "absolute" | "indirect",
  operation: InstructionMemoryOperation,
): CpuMemoryCycleKind {
  const suffix = operation === InstructionMemoryOperation.Read ? "read" : "write";
  return `${base}-indexed-${suffix}`;
}
