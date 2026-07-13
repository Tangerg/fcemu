/** Addressing modes and bus behavior owned by the NMOS 6502 instruction set. */
export enum AddressingMode {
  // Absolute addressing: Uses full 16-bit address to identify target location
  Absolute = 1,
  // Absolute X-indexed: Full 16-bit address plus X register offset
  AbsoluteX = 2,
  // Absolute Y-indexed: Full 16-bit address plus Y register offset
  AbsoluteY = 3,
  // Accumulator addressing: Operation works on accumulator (A register)
  Accumulator = 4,
  // Immediate addressing: Uses constant value as operand
  Immediate = 5,
  // Implied addressing: Instruction contains all needed information
  Implied = 6,
  // X-indexed Indirect: Address table is offset by X register
  IndexedIndirect = 7,
  // Indirect addressing: Looks up 16-bit address stored at specified location
  Indirect = 8,
  // Indirect Y-indexed: Gets address from zero page and adds Y register
  IndirectIndexed = 9,
  // Relative addressing: Branch instructions use signed 8-bit offset
  Relative = 10,
  // Zero Page: Uses only low byte of address (high byte is assumed 0)
  ZeroPage = 11,
  // Zero Page X-indexed: Zero page address plus X register offset
  ZeroPageX = 12,
  // Zero Page Y-indexed: Zero page address plus Y register offset
  ZeroPageY = 13,
}

export enum InstructionMemoryOperation {
  Read,
  Write,
  ReadModifyWrite,
}

const MEMORY_WRITE_OPCODES = new Set([
  0x81, 0x83, 0x84, 0x85, 0x86, 0x87, 0x8c, 0x8d, 0x8e, 0x8f, 0x91, 0x93, 0x94, 0x95, 0x96, 0x97,
  0x99, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f,
]);

const MEMORY_RMW_OPCODES = new Set([
  0x03, 0x06, 0x07, 0x0e, 0x0f, 0x13, 0x16, 0x17, 0x1b, 0x1e, 0x1f, 0x23, 0x26, 0x27, 0x2e, 0x2f,
  0x33, 0x36, 0x37, 0x3b, 0x3e, 0x3f, 0x43, 0x46, 0x47, 0x4e, 0x4f, 0x53, 0x56, 0x57, 0x5b, 0x5e,
  0x5f, 0x63, 0x66, 0x67, 0x6e, 0x6f, 0x73, 0x76, 0x77, 0x7b, 0x7e, 0x7f, 0xc3, 0xc6, 0xc7, 0xce,
  0xcf, 0xd3, 0xd6, 0xd7, 0xdb, 0xde, 0xdf, 0xe3, 0xe6, 0xe7, 0xee, 0xef, 0xf3, 0xf6, 0xf7, 0xfb,
  0xfe, 0xff,
]);

/** Immutable NMOS 6502 opcode definition. */
export interface Instruction {
  readonly operationCode: number;
  readonly addressingMode: AddressingMode;
  readonly byteLength: number;
  readonly baseCycles: number;
  readonly pageBoundaryCycles: number;
  readonly memoryOperation: InstructionMemoryOperation;
}

const MIN_OPCODE = 0x00;
const MAX_OPCODE = 0xff;

// Lookup table mapping opcodes to their addressing modes.
const OPCODE_ADDRESSING_MODE_MAP: readonly AddressingMode[] = [
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Accumulator,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.Absolute,
  AddressingMode.IndexedIndirect,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Accumulator,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Accumulator,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.Implied,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Accumulator,
  AddressingMode.Immediate,
  AddressingMode.Indirect,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageY,
  AddressingMode.ZeroPageY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteY,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageY,
  AddressingMode.ZeroPageY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteY,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.Immediate,
  AddressingMode.IndexedIndirect,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.ZeroPage,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Implied,
  AddressingMode.Immediate,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Absolute,
  AddressingMode.Relative,
  AddressingMode.IndirectIndexed,
  AddressingMode.Implied,
  AddressingMode.IndirectIndexed,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.ZeroPageX,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.Implied,
  AddressingMode.AbsoluteY,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
  AddressingMode.AbsoluteX,
];

const INSTRUCTION_BYTE_LENGTHS = OPCODE_ADDRESSING_MODE_MAP.map((mode, opcode) => {
  if (opcode === 0x00) return 2; // BRK consumes its padding byte.
  if (mode === AddressingMode.Implied || mode === AddressingMode.Accumulator) return 1;
  if (
    mode === AddressingMode.Absolute ||
    mode === AddressingMode.AbsoluteX ||
    mode === AddressingMode.AbsoluteY ||
    mode === AddressingMode.Indirect
  ) {
    return 3;
  }
  return 2;
});

const BASE_EXECUTION_CYCLES: readonly number[] = [
  7, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, 6,
  6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, 6, 6,
  2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, 6, 6, 2,
  8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, 2, 6, 2, 6,
  3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, 2, 6, 2, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5, 2, 6, 2, 6, 3,
  3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, 2, 5, 2, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, 2, 6, 2, 8, 3, 3,
  5, 5, 2, 2, 2, 2, 4, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, 2, 6, 2, 8, 3, 3, 5,
  5, 2, 2, 2, 2, 4, 4, 6, 6, 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
];

const PAGE_BOUNDARY_PENALTY_CYCLES: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
];

const INSTRUCTIONS: readonly Instruction[] = Object.freeze(
  OPCODE_ADDRESSING_MODE_MAP.map((addressingMode, operationCode) =>
    Object.freeze({
      operationCode,
      addressingMode,
      byteLength: INSTRUCTION_BYTE_LENGTHS[operationCode],
      baseCycles: BASE_EXECUTION_CYCLES[operationCode],
      pageBoundaryCycles: PAGE_BOUNDARY_PENALTY_CYCLES[operationCode],
      memoryOperation: MEMORY_RMW_OPCODES.has(operationCode)
        ? InstructionMemoryOperation.ReadModifyWrite
        : MEMORY_WRITE_OPCODES.has(operationCode)
          ? InstructionMemoryOperation.Write
          : InstructionMemoryOperation.Read,
    }),
  ),
);

/** Returns the stable definition for one byte-sized NMOS 6502 opcode. */
export function getInstruction(opCode: number): Instruction {
  if (!Number.isInteger(opCode) || opCode < MIN_OPCODE || opCode > MAX_OPCODE) {
    throw new RangeError(`Invalid opCode: ${opCode}. Must be an integer from 0 to 255`);
  }
  return INSTRUCTIONS[opCode] as Instruction;
}
