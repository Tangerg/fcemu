import Bus from "./bus.ts";
import {CPUMemory} from "./memory.ts";

type InstructionExecutionContext = {
    address: number
    pc: number
    addressingMode: AddressingMode
}

type InstructionExecutor = (ctx: InstructionExecutionContext) => void

type CPUState = {
    A: number
    X: number
    Y: number
    PC: number
    SP: number
    P: number
}

/**
 * emum 6502 CPU interrupt types
 */
enum InterruptType {
    // No interrupt is pending
    NONE = 1,
    // Non-Maskable Interrupt (NMI): High-priority interrupt that cannot be disabled
    // Typically used for critical events like power failure or hardware errors
    NMI = 2,
    // Interrupt Request (IRQ): Standard maskable interrupt that can be enabled/disabled
    // Used for regular peripheral device interrupts like timers, I/O devices
    IRQ = 3
}

/**
 * emum 6502 CPU addressing modes
 */
enum AddressingMode {
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


/**
 * Represents a 6502 CPU instruction with its properties and execution characteristics
 */
class Instruction {
    // The operation code (opcode) of the instruction
    public readonly operationCode: number;
    // The addressing mode used by this instruction
    public readonly addressingMode: AddressingMode
    // Number of bytes this instruction occupies in memory
    public readonly byteLength: number
    // Base number of CPU cycles needed to execute this instruction
    public readonly baseCycles: number
    // Additional cycles needed if a page boundary is crossed
    public readonly pageBoundaryCycles: number

    // Valid opcode range constants
    private static readonly MIN_OPCODE = 0x00;
    private static readonly MAX_OPCODE = 0xFF;

    // Lookup table mapping opcodes to their addressing modes
    private static readonly OPCODE_ADDRESSING_MODE_MAP: number[] = [
        AddressingMode.Implied, AddressingMode.IndexedIndirect, AddressingMode.Implied, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Accumulator, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
        AddressingMode.Absolute, AddressingMode.IndexedIndirect, AddressingMode.Implied, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Accumulator, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
        AddressingMode.Implied, AddressingMode.IndexedIndirect, AddressingMode.Implied, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Accumulator, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
        AddressingMode.Implied, AddressingMode.IndexedIndirect, AddressingMode.Implied, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Accumulator, AddressingMode.Immediate,
        AddressingMode.Indirect, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
        AddressingMode.Immediate, AddressingMode.IndexedIndirect, AddressingMode.Immediate, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Implied, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageY, AddressingMode.ZeroPageY,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteY, AddressingMode.AbsoluteY,
        AddressingMode.Immediate, AddressingMode.IndexedIndirect, AddressingMode.Immediate, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Implied, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageY, AddressingMode.ZeroPageY,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteY, AddressingMode.AbsoluteY,
        AddressingMode.Immediate, AddressingMode.IndexedIndirect, AddressingMode.Immediate, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Implied, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
        AddressingMode.Immediate, AddressingMode.IndexedIndirect, AddressingMode.Immediate, AddressingMode.IndexedIndirect,
        AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage, AddressingMode.ZeroPage,
        AddressingMode.Implied, AddressingMode.Immediate, AddressingMode.Implied, AddressingMode.Immediate,
        AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute, AddressingMode.Absolute,
        AddressingMode.Relative, AddressingMode.IndirectIndexed, AddressingMode.Implied, AddressingMode.IndirectIndexed,
        AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX, AddressingMode.ZeroPageX,
        AddressingMode.Implied, AddressingMode.AbsoluteY, AddressingMode.Implied, AddressingMode.AbsoluteY,
        AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX, AddressingMode.AbsoluteX,
    ];
    // Lookup table for instruction lengths in bytes
    private static readonly INSTRUCTION_BYTE_LENGTHS: number[] = [
        2, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        3, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        1, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        1, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 0, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 0, 3, 0, 0,
        2, 2, 2, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 2, 1, 0, 3, 3, 3, 0,
        2, 2, 0, 0, 2, 2, 2, 0, 1, 3, 1, 0, 3, 3, 3, 0,
    ]
    // Lookup table for base execution cycles
    private static readonly BASE_EXECUTION_CYCLES: number[] = [
        7, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
        6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
        6, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
        6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
        2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,
        2, 6, 2, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5,
        2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,
        2, 5, 2, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4,
        2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
        2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,
        2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    ]
    // Lookup table for additional cycles when crossing page boundaries
    private static readonly PAGE_BOUNDARY_PENALTY_CYCLES: number[] = [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0,
    ]
    // Cache of pre-instantiated instructions for all possible opcodes
    private static readonly INSTRUCTIONS_CACHE: Instruction[] = ((): Instruction[] => {
        const instructions: Instruction[] = []
        for (let opCode = Instruction.MIN_OPCODE; opCode <= Instruction.MAX_OPCODE; opCode++) {
            const instruction = new Instruction({
                operationCode: opCode,
                addressMode: Instruction.OPCODE_ADDRESSING_MODE_MAP[opCode],
                byteLength: Instruction.INSTRUCTION_BYTE_LENGTHS[opCode],
                baseCycles: Instruction.BASE_EXECUTION_CYCLES[opCode],
                pageBoundaryCycles: Instruction.PAGE_BOUNDARY_PENALTY_CYCLES[opCode],
            })
            instructions.push(instruction)
        }
        return instructions
    })()

    /**
     * Gets an instruction instance for the given opcode
     * @param opCode - The operation code to look up
     * @returns The corresponding Instruction instance
     * @throws Error if opcode is invalid
     */
    public static getInstruction(opCode: number): Instruction {
        if (opCode < Instruction.MIN_OPCODE || opCode > Instruction.MAX_OPCODE) {
            throw new Error(`Invalid opCode: ${opCode}. Must be between ${Instruction.MIN_OPCODE} and ${Instruction.MAX_OPCODE}`);
        }
        return Instruction.INSTRUCTIONS_CACHE[opCode]
    }

    private constructor(instructionConfig: {
        operationCode: number,
        addressMode: AddressingMode,
        byteLength: number,
        baseCycles: number,
        pageBoundaryCycles: number
    }) {
        this.operationCode = instructionConfig.operationCode
        this.addressingMode = instructionConfig.addressMode
        this.byteLength = instructionConfig.byteLength
        this.baseCycles = instructionConfig.baseCycles
        this.pageBoundaryCycles = instructionConfig.pageBoundaryCycles
    }

    public toString(): string {
        return `Instruction(operationCode=0x${this.operationCode.toString(16).padStart(2, '0')}, ` +
            `addressingMode=${AddressingMode[this.addressingMode]}, ` +
            `byteLength=${this.byteLength}, ` +
            `baseCycles=${this.baseCycles}, ` +
            `pageBoundaryCycles=${this.pageBoundaryCycles})`;
    }
}

/**
 * Represents the processor status register (P) of the 6502 CPU
 * Contains 8 status flags that control and reflect the CPU's state
 */
class ProcessorStatus {
    // Carry Flag: Set if last operation resulted in a carry or if a borrow was not needed
    public C: boolean = false;
    // Zero Flag: Set if the result of last operation was zero
    private _Z: boolean = false;
    // Interrupt Disable Flag: When set, disables IRQ interrupts
    public I: boolean = false;
    // Decimal Mode Flag: Controls whether arithmetic operations use binary or BCD arithmetic
    public D: boolean = false;
    // Break Command Flag: Set when a BRK instruction is executed
    public B: boolean = false;
    // Unused Flag: Bit 5 is always set to 1
    public readonly U: boolean = true;
    // Overflow Flag: Set when signed arithmetic operation results in overflow
    public V: boolean = false;
    // Negative Flag: Set if bit 7 of the last operation result was 1
    private _N: boolean = false;
    // Initial value of flags after reset (only bit 5 is set)
    private static readonly RESET_FLAGS: number = 0b00100000

    /**
     * Gets the processor status flags as a byte
     * Each bit represents a flag state
     * @returns 8-bit value representing all flags
     */
    get flags(): number {
        let flags = 0;
        flags |= (this.C ? 1 : 0) << 0;  // Carry in bit 0
        flags |= (this._Z ? 1 : 0) << 1; // Zero in bit 1
        flags |= (this.I ? 1 : 0) << 2;  // Interrupt in bit 2
        flags |= (this.D ? 1 : 0) << 3;  // Decimal in bit 3
        flags |= (this.B ? 1 : 0) << 4;  // Break in bit 4
        flags |= 1 << 5;                 // Unused bit always 1
        flags |= (this.V ? 1 : 0) << 6;  // Overflow in bit 6
        flags |= (this._N ? 1 : 0) << 7; // Negative in bit 7
        return flags;
    }

    /**
     * Sets all processor status flags from a byte
     * @param flags - 8-bit value containing all flag states
     */
    set flags(flags: number) {
        this.C = Boolean((flags >> 0) & 1);  // Extract Carry from bit 0
        this._Z = Boolean((flags >> 1) & 1);  // Extract Zero from bit 1
        this.I = Boolean((flags >> 2) & 1);  // Extract Interrupt from bit 2
        this.D = Boolean((flags >> 3) & 1);  // Extract Decimal from bit 3
        this.B = Boolean((flags >> 4) & 1);  // Extract Break from bit 4
        // Bit 5 (U) is always true
        this.V = Boolean((flags >> 6) & 1);  // Extract Overflow from bit 6
        this._N = Boolean((flags >> 7) & 1);  // Extract Negative from bit 7
    }

    /**
     * Sets the Zero flag based on whether the value is zero
     * @param value - Value to test for zero
     */
    set Z(value: number) {
        this._Z = value === 0;
    }

    get Z(): boolean {
        return this._Z;
    }

    /**
     * Sets the Negative flag based on bit 7 of the value
     * @param value - Value to test for negative (bit 7 set)
     */
    set N(value: number) {
        this._N = (value & 0x80) !== 0
    }

    get N(): boolean {
        return this._N;
    }

    /**
     * Convenience method to set both Zero and Negative flags based on a value
     * @param value - Value to test for both zero and negative
     */
    set ZN(value: number) {
        this.Z = value;
        this.N = value;
    }

    /**
     * Returns a string representation of all processor status flags
     * @returns String showing the state of each flag
     */
    toString(): string {
        return `N=${this.N} V=${this.V} U=${this.U} B=${this.B} D=${this.D} I=${this.I} Z=${this.Z} C=${this.C}`;
    }

    /**
     * Resets all flags to their power-on state
     * Only the unused flag (U) is set, all others are cleared
     */
    reset() {
        this.flags = ProcessorStatus.RESET_FLAGS
    }
}

/**
 * Represents the 6502 CPU with all its registers and functionality
 */
class CPU {
    private readonly memory: CPUMemory
    // Accumulator register
    private A: number = 0;
    // X index register
    private X: number = 0
    // Y index register
    private Y: number = 0
    // Program Counter - holds the address of the next instruction to execute
    private PC: number = 0x0000
    // Stack Pointer - points to the current top of the stack (0x0100-0x01FF)
    private SP: number = 0xFF
    // Processor Status register - contains various status flags
    private readonly P: ProcessorStatus = new ProcessorStatus()
    // Number of cycles to stall the CPU
    public stall: number = 0
    // Current type of interrupt being processed
    private currentInterrupt = InterruptType.NONE
    // Total number of CPU cycles executed
    private cpuCycles: number = 0
    // Array of instruction execution functions
    private readonly instructionExecutors: InstructionExecutor[] = []

    /**
     * Clock frequency of the 6502 CPU in Hz (NTSC)
     * 1.789773 MHz
     */
    public static readonly FREQUENCY: number = 1789773

    /**
     * Initializes a new CPU instance
     * Sets up the instruction execution table with all 6502 opcodes
     * Including both legal and illegal instructions
     */
    constructor(bus: Bus) {
        this.memory = new CPUMemory(bus)
        // Initialize instruction executor array
        // Each index corresponds to an opcode (0x00-0xFF)
        // Format: [Opcode Name, Implementation Function]
        this.instructionExecutors = [
            this.BRK, this.ORA, this.KIL, this.SLO, this.NOP, this.ORA, this.ASL, this.SLO,
            this.PHP, this.ORA, this.ASL, this.ANC, this.NOP, this.ORA, this.ASL, this.SLO,
            this.BPL, this.ORA, this.KIL, this.SLO, this.NOP, this.ORA, this.ASL, this.SLO,
            this.CLC, this.ORA, this.NOP, this.SLO, this.NOP, this.ORA, this.ASL, this.SLO,
            this.JSR, this.AND, this.KIL, this.RLA, this.BIT, this.AND, this.ROL, this.RLA,
            this.PLP, this.AND, this.ROL, this.ANC, this.BIT, this.AND, this.ROL, this.RLA,
            this.BMI, this.AND, this.KIL, this.RLA, this.NOP, this.AND, this.ROL, this.RLA,
            this.SEC, this.AND, this.NOP, this.RLA, this.NOP, this.AND, this.ROL, this.RLA,
            this.RTI, this.EOR, this.KIL, this.SRE, this.NOP, this.EOR, this.LSR, this.SRE,
            this.PHA, this.EOR, this.LSR, this.ALR, this.JMP, this.EOR, this.LSR, this.SRE,
            this.BVC, this.EOR, this.KIL, this.SRE, this.NOP, this.EOR, this.LSR, this.SRE,
            this.CLI, this.EOR, this.NOP, this.SRE, this.NOP, this.EOR, this.LSR, this.SRE,
            this.RTS, this.ADC, this.KIL, this.RRA, this.NOP, this.ADC, this.ROR, this.RRA,
            this.PLA, this.ADC, this.ROR, this.ARR, this.JMP, this.ADC, this.ROR, this.RRA,
            this.BVS, this.ADC, this.KIL, this.RRA, this.NOP, this.ADC, this.ROR, this.RRA,
            this.SEI, this.ADC, this.NOP, this.RRA, this.NOP, this.ADC, this.ROR, this.RRA,
            this.NOP, this.STA, this.NOP, this.SAX, this.STY, this.STA, this.STX, this.SAX,
            this.DEY, this.NOP, this.TXA, this.XAA, this.STY, this.STA, this.STX, this.SAX,
            this.BCC, this.STA, this.KIL, this.AHX, this.STY, this.STA, this.STX, this.SAX,
            this.TYA, this.STA, this.TXS, this.TAS, this.SHY, this.STA, this.SHX, this.AHX,
            this.LDY, this.LDA, this.LDX, this.LAX, this.LDY, this.LDA, this.LDX, this.LAX,
            this.TAY, this.LDA, this.TAX, this.LAX, this.LDY, this.LDA, this.LDX, this.LAX,
            this.BCS, this.LDA, this.KIL, this.LAX, this.LDY, this.LDA, this.LDX, this.LAX,
            this.CLV, this.LDA, this.TSX, this.LAS, this.LDY, this.LDA, this.LDX, this.LAX,
            this.CPY, this.CMP, this.NOP, this.DCP, this.CPY, this.CMP, this.DEC, this.DCP,
            this.INY, this.CMP, this.DEX, this.AXS, this.CPY, this.CMP, this.DEC, this.DCP,
            this.BNE, this.CMP, this.KIL, this.DCP, this.NOP, this.CMP, this.DEC, this.DCP,
            this.CLD, this.CMP, this.NOP, this.DCP, this.NOP, this.CMP, this.DEC, this.DCP,
            this.CPX, this.SBC, this.NOP, this.ISC, this.CPX, this.SBC, this.INC, this.ISC,
            this.INX, this.SBC, this.NOP, this.SBC, this.CPX, this.SBC, this.INC, this.ISC,
            this.BEQ, this.SBC, this.KIL, this.ISC, this.NOP, this.SBC, this.INC, this.ISC,
            this.SED, this.SBC, this.NOP, this.ISC, this.NOP, this.SBC, this.INC, this.ISC,
        ]
    }

    get state(): CPUState {
        return {
            A: this.A,
            X: this.X,
            Y: this.Y,
            PC: this.PC,
            SP: this.SP,
            P: this.P.flags,
        };
    }

    set state(state: CPUState) {
        this.A = state.A;
        this.X = state.X;
        this.Y = state.Y;
        this.PC = state.PC;
        this.SP = state.SP;
        this.P.flags = state.P;
    }

    /**
     * Writes a byte to memory at the specified address
     * @param address - Memory address (will be masked to 16-bit)
     * @param value - Value to write (will be masked to 8-bit)
     */
    private writeByte(address: number, value: number): void {
        this.memory.write(address, value);
    }

    /**
     * Reads a byte from memory at the specified address
     * @param address - Memory address (will be masked to 16-bit)
     * @returns 8-bit value from memory
     */
    public readByte(address: number): number {
        return this.memory.read(address);
    }

    /**
     * Reads a 16-bit word from memory (little-endian)
     * @param address - Memory address of the low byte
     * @returns 16-bit value composed of two consecutive bytes
     */
    private readWord(address: number): number {
        const low = this.readByte(address)
        const high = this.readByte(address + 1)
        return low | high << 8
    }

    /**
     * Reads a 16-bit word from memory, simulating the 6502 JMP indirect bug
     * When reading across page boundaries, the high byte is read from the wrong address
     * @param address - Memory address of the low byte
     * @returns 16-bit value with potential page boundary bug
     */
    private readWordWithBug(address: number): number {
        const low = this.readByte(address)
        const high = this.readByte((address & 0xFF00) | (address + 1))
        return low | high << 8
    }

    /**
     * Pushes a byte onto the stack (0x0100-0x01FF)
     * Stack Pointer decrements after push
     * @param value - 8-bit value to push
     */
    private pushByteToStack(value: number): void {
        this.writeByte(0x100 | this.SP, value)
        this.SP--
    }

    /**
     * Pushes a 16-bit word onto the stack (high byte first)
     * @param value - 16-bit value to push
     */
    private pushWordToStack(value: number): void {
        this.pushByteToStack(value >> 8)
        this.pushByteToStack(value & 0xFF)
    }

    /**
     * Pulls (pops) a byte from the stack
     * Stack Pointer increments before pull
     * @returns 8-bit value pulled from stack
     */
    private pullByteFromStack(): number {
        this.SP++
        return this.readByte(0x100 | this.SP)
    }

    /**
     * Pulls (pops) a 16-bit word from the stack (low byte first)
     * @returns 16-bit value composed of two bytes from stack
     */
    private pullWordFromStack(): number {
        const low = this.pullByteFromStack()
        const high = this.pullByteFromStack()
        return low | high << 8
    }

    /**
     * Resolves the effective address for the given addressing mode
     * @param mode - The addressing mode of the instruction
     * @returns The resolved memory address for the instruction
     *//**/
    private resolveInstructionAddress(mode: AddressingMode) {
        switch (mode) {
            case AddressingMode.Absolute:
                return this.readWord(this.PC + 1)  // Use full 16-bit address
            case AddressingMode.AbsoluteX:
                return this.readWord(this.PC + 1) + this.X  // Add X register to address
            case AddressingMode.AbsoluteY:
                return this.readWord(this.PC + 1) + this.Y  // Add Y register to address
            case AddressingMode.Accumulator:
                return 0x0000  // Operation on accumulator, no address needed
            case AddressingMode.Immediate:
                return this.PC + 1  // Use next byte as operand
            case AddressingMode.Implied:
                return 0x0000  // No operand needed
            case AddressingMode.IndexedIndirect:
                return this.readWordWithBug((this.readByte(this.PC + 1) + this.X) & 0xFF)  // Indexed indirect
            case AddressingMode.Indirect:
                return this.readWordWithBug(this.readWord(this.PC + 1))  // JMP indirect
            case AddressingMode.IndirectIndexed:
                return this.readWordWithBug(this.readByte(this.PC + 1)) + this.Y  // Indirect indexed
            case AddressingMode.Relative: {
                const offset = this.readByte(this.PC + 1)
                // Handle signed 8-bit offset for branch instructions
                if (offset < 0x80) {
                    return this.PC + 2 + offset
                }
                return this.PC + 2 + offset - 0x100
            }
            case AddressingMode.ZeroPage:
                return this.readByte(this.PC + 1)  // Use zero page address (0x0000-0x00FF)
            case AddressingMode.ZeroPageX:
                return (this.readByte(this.PC + 1) + this.X) & 0xFF  // Zero page with X offset
            case AddressingMode.ZeroPageY:
                return (this.readByte(this.PC + 1) + this.Y) & 0xFF  // Zero page with Y offset
            default:
                return 0x0000
        }
    }

    /**
     * Checks if two addresses are in different pages (crossed page boundary)
     * @param a - First address
     * @param b - Second address
     * @returns True if addresses are in different pages
     */
    private isPageBoundaryCrossed(a: number, b: number): boolean {
        return (a & 0xFF00) !== (b & 0xFF00)
    }

    /**
     * Checks if the given addressing mode causes a page boundary crossing
     * @param mode - Addressing mode to check
     * @param address - Effective address
     * @returns True if page boundary is crossed
     */
    private isPageBoundaryCrossedForMode(mode: AddressingMode, address: number): boolean {
        switch (mode) {
            case AddressingMode.AbsoluteX:
                return this.isPageBoundaryCrossed((address - this.X), address)
            case AddressingMode.AbsoluteY:
                return this.isPageBoundaryCrossed((address - this.Y), address)
            case AddressingMode.IndirectIndexed:
                return this.isPageBoundaryCrossed((address - this.Y), address)
            default:
                return false
        }
    }

    /**
     * Triggers a Non-Maskable Interrupt (NMI)
     */
    public triggerNMI() {
        this.currentInterrupt = InterruptType.NMI
    }

    /**
     * Triggers an Interrupt Request (IRQ)
     */
    public triggerIRQ() {
        this.currentInterrupt = InterruptType.IRQ
    }

    /**
     * Adds cycle penalties for branch instructions
     * One cycle for branch taken, one additional cycle if page boundary crossed
     * @param ctx - Instruction execution context
     */
    private addBranchCycles(ctx: InstructionExecutionContext) {
        this.cpuCycles++
        if (this.isPageBoundaryCrossed(ctx.pc, ctx.address)) {
            this.cpuCycles++
        }
    }

    /**
     * Performs comparison operation and sets appropriate flags
     * Used by CMP, CPX, and CPY instructions
     * @param a - First value to compare
     * @param b - Second value to compare
     */
    private compareValues(a: number, b: number) {
        this.P.ZN = a - b
        this.P.C = a >= b
    }

    /**
     * Resets the CPU to its initial state
     * Clears registers, loads reset vector, initializes stack pointer
     */
    public reset(): void {
        this.A = this.X = this.Y = 0
        this.PC = this.readWord(0xFFFC)
        this.SP = 0xFF
        this.P.reset()
    }

    /**
     * Executes one CPU cycle update
     * Handles interrupts, fetches and executes instructions
     * @returns Number of CPU cycles consumed in this update
     */
    public update(): number {
        // Handle CPU stall cycles (if any)
        if (this.stall > 0) {
            this.stall--
            return 1
        }
        // Process pending interrupts (NMI has priority over IRQ)
        switch (this.currentInterrupt) {
            case InterruptType.NMI:
                this.handleNMI()
                break
            case InterruptType.IRQ:
                this.handleIRQ()
                break
        }
        this.currentInterrupt = InterruptType.NONE

        // Fetch instruction
        const opcode = this.readByte(this.PC)
        const instruction = Instruction.getInstruction(opcode)

        // Resolve effective address based on addressing mode
        const address = this.resolveInstructionAddress(instruction.addressingMode)

        // Check for page boundary crossing
        const isPageCrossed = this.isPageBoundaryCrossedForMode(instruction.addressingMode, address)
        // Advance program counter by instruction length
        this.PC += instruction.byteLength

        // Track cycles for this instruction
        const cpuCycles = this.cpuCycles

        // Add base cycles for this instruction
        this.cpuCycles += instruction.baseCycles

        // Add penalty cycles for page boundary crossing if applicable
        if (isPageCrossed) {
            this.cpuCycles += instruction.pageBoundaryCycles
        }

        // Execute the instruction
        const instructionExecutor = this.instructionExecutors[opcode]
        instructionExecutor({
            address: address,          // Effective address for the instruction
            pc: this.PC,              // Current program counter
            addressingMode: instruction.addressingMode  // Addressing mode used
        })

        // Return number of cycles consumed by this instruction
        return this.cpuCycles - cpuCycles
    }


    /**
     * Handles Non-Maskable Interrupt (NMI)
     * NMI cannot be disabled and has highest priority after RESET
     * Sequence:
     * 1. Push Program Counter to stack
     * 2. Push Processor Status to stack
     * 3. Load NMI vector from 0xFFFA-0xFFFB
     * 4. Set Interrupt Disable flag
     * 5. Add 7 cycle penalty
     */
    private handleNMI() {
        this.pushWordToStack(this.PC)
        this.PHP()
        this.PC = this.readWord(0xFFFA)
        this.P.I = true
        this.cpuCycles += 7
    }

    /**
     * Handles Interrupt Request (IRQ)
     * IRQ can be disabled by setting the I flag in processor status
     * Sequence:
     * 1. Push Program Counter to stack
     * 2. Push Processor Status to stack
     * 3. Load IRQ vector from 0xFFFE-0xFFFF
     * 4. Set Interrupt Disable flag
     * 5. Add 7 cycle penalty
     */
    private handleIRQ() {
        this.pushWordToStack(this.PC)
        this.PHP()
        this.PC = this.readWord(0xFFFE)
        this.P.I = true
        this.cpuCycles += 7
    }

    /**
     * ---------------------Data Transfer Instructions----------------------
     * These instructions move data between registers, memory, and the stack.
     */

    /**
     * Load accumulator (A) from memory.
     * @param ctx
     * @constructor
     */
    private LDA(ctx: InstructionExecutionContext) {
        this.A = this.readByte(ctx.address)
        this.P.ZN = this.A
    }

    /**
     * Load register X from memory.
     * @param ctx
     * @constructor
     */
    private LDX(ctx: InstructionExecutionContext) {
        this.X = this.readByte(ctx.address)
        this.P.ZN = this.X
    }

    /**
     * Load register Y from memory.
     * @param ctx
     * @constructor
     */
    private LDY(ctx: InstructionExecutionContext) {
        this.Y = this.readByte(ctx.address)
        this.P.ZN = this.Y
    }

    /**
     * Store accumulator (A) into memory.
     * @param ctx
     * @constructor
     */
    private STA(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.A)
    }

    /**
     * Store register X into memory.
     * @param ctx
     * @constructor
     */
    private STX(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.X)
    }

    /**
     * Store register Y into memory.
     * @param ctx
     * @constructor
     */
    private STY(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.Y)
    }

    /**
     * Transfer accumulator (A) to register X.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TAX(_: InstructionExecutionContext) {
        this.X = this.A
        this.P.ZN = this.X
    }

    /**
     * Transfer accumulator (A) to register Y.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TAY(_: InstructionExecutionContext) {
        this.Y = this.A
        this.P.ZN = this.Y
    }

    /**
     * Transfer register X to accumulator (A).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TXA(_: InstructionExecutionContext) {
        this.A = this.X
        this.P.ZN = this.A
    }

    /**
     * Transfer register Y to accumulator (A).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TYA(_: InstructionExecutionContext) {
        this.A = this.Y
        this.P.ZN = this.A
    }

    /**
     * Transfer stack pointer (SP) to register X.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TSX(_: InstructionExecutionContext) {
        this.X = this.SP
        this.P.ZN = this.X
    }

    /**
     * Transfer register X to stack pointer (SP).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TXS(_: InstructionExecutionContext) {
        this.SP = this.X
    }


    /**
     * -----------------------Arithmetic Instructions-----------------------
     * These perform addition and subtraction on the accumulator and memory.
     */

    /**
     * Add with carry (Accumulator + Operand + Carry).
     * @param ctx
     * @constructor
     */
    private ADC(ctx: InstructionExecutionContext) {
        const a = this.A
        const b = this.readByte(ctx.address)
        const c = this.P.C ? 1 : 0
        const abc = a + b + c
        this.A = abc
        this.P.ZN = this.A
        this.P.C = abc > 0xFF
        this.P.V = (((a ^ b) & 0x80) == 0) && (((a ^ this.A) & 0x80) != 0)
    }

    /**
     * Subtract with carry (Accumulator - Operand - Borrow).
     * @param ctx
     * @constructor
     */
    private SBC(ctx: InstructionExecutionContext) {
        const a = this.A
        const b = this.readByte(ctx.address)
        const c = this.P.C ? 1 : 0
        const abc = a - b - (1 - c)
        this.A = abc
        this.P.ZN = this.A
        this.P.C = abc >= 0
        this.P.V = (((a ^ b) & 0x80) != 0) && ((a ^ this.A) & 0x80) != 0
    }

    /**
     * Increment memory by 1.
     * @param ctx
     * @constructor
     */
    private INC(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address) + 1
        this.writeByte(ctx.address, value)
        this.P.ZN = value
    }

    /**
     * Increment register X by 1.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private INX(_: InstructionExecutionContext) {
        this.X++
        this.P.ZN = this.X
    }

    /**
     * Increment register Y by 1.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private INY(_: InstructionExecutionContext) {
        this.Y++
        this.P.ZN = this.Y
    }

    /**
     * Decrement memory by 1.
     * @param ctx
     * @constructor
     */
    private DEC(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address) - 1
        this.writeByte(ctx.address, value)
        this.P.ZN = value
    }

    /**
     * Decrement register X by 1.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private DEX(_: InstructionExecutionContext) {
        this.X--
        this.P.ZN = this.X
    }

    /**
     * Decrement register Y by 1.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private DEY(_: InstructionExecutionContext) {
        this.Y--
        this.P.ZN = this.Y
    }

    /**
     * ---------------------Logical Instructions---------------------
     * These perform bitwise operations on the accumulator and memory.
     */

    /**
     * Logical AND (Accumulator & Operand).
     * @param ctx
     * @constructor
     */
    private AND(ctx: InstructionExecutionContext) {
        this.A = this.A & this.readByte(ctx.address)
        this.P.ZN = this.A
    }

    /**
     * Logical OR (Accumulator & Operand).
     * @param ctx
     * @constructor
     */
    private ORA(ctx: InstructionExecutionContext) {
        this.A = this.A | this.readByte(ctx.address)
        this.P.ZN = this.A
    }

    /**
     * Exclusive OR (Accumulator ^ Operand).
     * @param ctx
     * @constructor
     */
    private EOR(ctx: InstructionExecutionContext) {
        this.A = this.A ^ this.readByte(ctx.address)
        this.P.ZN = this.A
    }

    /**
     * Test bits in memory (affects zero, overflow flags).
     * @param ctx
     * @constructor
     */
    private BIT(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.P.V = !!((value >> 6) & 1)
        this.P.Z = (value & this.A)
        this.P.N = value
    }

    /**
     * -------------Shift and Rotate Instructions-------------
     * These manipulate bits in the accumulator or memory.
     */

    /**
     * Arithmetic shift left (Multiply by 2).
     * @param ctx
     * @constructor
     */
    private ASL(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode === AddressingMode.Accumulator) {
            this.P.C = !!((this.A >> 7) & 1)
            this.A <<= 1
            this.P.ZN = this.A

        } else {
            let value = this.readByte(ctx.address)
            this.P.C = !!((this.A >> 7) & 1)
            value <<= 1
            this.writeByte(ctx.address, value)
            this.P.ZN = value
        }
    }

    /**
     * Logical shift right (Divide by 2).
     * @param ctx
     * @constructor
     */
    private LSR(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            this.P.C = !!(this.A & 1)
            this.A >>= 1
            this.P.ZN = this.A
        } else {
            let value = this.readByte(ctx.address)
            this.P.C = !!(value & 1)
            value >>= 1
            this.writeByte(ctx.address, value)
            this.P.ZN = value
        }
    }

    /**
     * Rotate left through the carry flag.
     * @param ctx
     * @constructor
     */
    private ROL(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            const c = this.P.C ? 1 : 0
            this.P.C = !!((this.A >> 7) & 1)
            this.A = (this.A << 1) | c
            this.P.ZN = this.A
        } else {
            const c = this.P.C ? 1 : 0
            let value = this.readByte(ctx.address)
            this.P.C = !!((value >> 7) & 1)
            value = (value << 1) | c
            this.writeByte(ctx.address, value)
            this.P.ZN = c
        }
    }

    /**
     * Rotate right through the carry flag.
     * @param ctx
     * @constructor
     */
    private ROR(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            const c = this.P.C ? 1 : 0
            this.P.C = !!(this.A & 1)
            this.A = ((this.A >> 1) | (c << 7))
            this.P.ZN = this.A
        } else {
            const c = this.P.C ? 1 : 0
            let value = this.readByte(ctx.address)
            this.P.C = !!(value & 1)
            value = (value >> 1) | (c << 7)
            this.writeByte(ctx.address, value)
            this.P.ZN = c
        }
    }

    /**
     * ---------Flag Manipulation Instructions---------
     * These modify specific processor status flags.
     */

    /**
     * Clear carry flag (C = 0).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private CLC(_: InstructionExecutionContext) {
        this.P.C = false
    }

    /**
     * Set carry flag (C = 1).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SEC(_: InstructionExecutionContext) {
        this.P.I = true
    }

    /**
     * Clear decimal mode (D = 0).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private CLD(_: InstructionExecutionContext) {
        this.P.D = false
    }

    /**
     * Set decimal mode (D = 1).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SED(_: InstructionExecutionContext) {
        this.P.D = true
    }

    /**
     * Clear interrupt disable flag (I = 0).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private CLI(_: InstructionExecutionContext) {
        this.P.I = false
    }

    /**
     * Set interrupt disable flag (I = 1).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SEI(_: InstructionExecutionContext) {
        this.P.I = true
    }

    /**
     * Clear overflow flag (V = 0).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private CLV(_: InstructionExecutionContext) {
        this.P.V = false
    }

    /**
     * ---------------------------Comparison Instructions---------------------------
     * These instructions compare the accumulator or registers (X, Y) with a given operand.
     * @param ctx
     * @constructor
     */

    /**
     * Compare the accumulator (A) with the operand.
     * Sets the carry flag if A gt operand (A >= operand).
     * @param ctx
     * @constructor
     */
    private CMP(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.A, value)
    }

    /**
     * Compare the X register with the operand.
     * Sets the carry flag if X gt operand (X >= operand).
     * @param ctx
     * @constructor
     */
    private CPX(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.X, value)
    }

    /**
     * Compare the Y register with the operand.
     * Sets the carry flag if Y gt operand (Y >= operand).
     * @param ctx
     * @constructor
     */
    private CPY(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.Y, value)
    }

    /**
     * ----------------Program Control Instructions-----------------
     * These change the program flow (jumps, branches, subroutines).
     */

    /**
     * Unconditional jump.
     * @param ctx
     * @constructor
     */
    private JMP(ctx: InstructionExecutionContext) {
        this.PC = ctx.address
    }

    /**
     * Jump to subroutine.
     * @param ctx
     * @constructor
     */
    private JSR(ctx: InstructionExecutionContext) {
        this.pushWordToStack(this.PC - 1)
        this.PC = ctx.address
    }

    /**
     * Return from subroutine.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private RTS(_: InstructionExecutionContext) {
        this.PC = this.pullWordFromStack() + 1
    }

    /**
     * Return from interrupt.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private RTI(_: InstructionExecutionContext) {
        this.P.flags = this.pullByteFromStack() & 0xEF | 0x20
        this.PC = this.pullWordFromStack()
    }

    /**
     * Force an interrupt.
     * @param ctx
     * @constructor
     */
    private BRK(ctx: InstructionExecutionContext) {
        this.pushWordToStack(this.PC)
        this.PHP()
        this.SEC(ctx)
        this.PC = this.readWord(0xFFFE)
    }

    /**
     * Branch if positive (N = 0).
     * @param ctx
     * @constructor
     */
    private BPL(ctx: InstructionExecutionContext) {
        if (!this.P.N) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if negative (N = 1).
     * @param ctx
     * @constructor
     */
    private BMI(ctx: InstructionExecutionContext) {
        if (this.P.N) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if no overflow (V = 0).
     * @param ctx
     * @constructor
     */
    private BVC(ctx: InstructionExecutionContext) {
        if (!this.P.C) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if overflow (V = 1).
     * @param ctx
     * @constructor
     */
    private BVS(ctx: InstructionExecutionContext) {
        if (this.P.C) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if carry clear (C = 0).
     * @param ctx
     * @constructor
     */
    private BCC(ctx: InstructionExecutionContext) {
        if (!this.P.C) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if carry set (C = 1).
     * @param ctx
     * @constructor
     */
    private BCS(ctx: InstructionExecutionContext) {
        if (this.P.C) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if not equal (Z = 0).
     * @param ctx
     * @constructor
     */
    private BNE(ctx: InstructionExecutionContext) {
        if (!this.P.Z) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Branch if equal (Z = 1).
     * @param ctx
     * @constructor
     */
    private BEQ(ctx: InstructionExecutionContext) {
        if (this.P.Z) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * ---------------------Stack Operations---------------------
     * These manage the stack, enabling push and pull operations.
     * @param _
     * @constructor
     */

    /**
     * Push accumulator (A) onto the stack.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private PHA(_: InstructionExecutionContext) {
        this.pushByteToStack(this.A)
    }

    /**
     * Push processor status register onto the stack.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private PHP(_?: InstructionExecutionContext) {
        this.pushByteToStack(this.P.flags | 0x10)
    }

    /**
     * Pull from stack to accumulator (A).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private PLA(_: InstructionExecutionContext) {
        this.A = this.pullByteFromStack()
        this.P.ZN = this.A
    }

    /**
     * Pull from stack to processor status.
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private PLP(_: InstructionExecutionContext) {
        this.P.flags = this.pullByteFromStack() & 0xEF | 0x20
    }

    /**
     * -----------No-Operation Instruction-----------
     * Used for delaying or placeholder operations.
     * No operation (takes one cycle).
     * @param _
     * @constructor
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private NOP(_: InstructionExecutionContext) {
    }

    /**
     * ------------------Illegal (Unofficial) Instructions--------------------
     * The MOS 6502 has several undocumented "illegal instructions,"
     * which vary by hardware implementation and are not officially supported.
     */

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private AHX(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private ALR(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private ANC(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private ARR(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private AXS(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private DCP(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private ISC(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private KIL(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private LAS(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private LAX(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private RLA(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private RRA(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SAX(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SHX(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SHY(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SLO(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private SRE(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private TAS(_: InstructionExecutionContext) {
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private XAA(_: InstructionExecutionContext) {
    }
}

export default CPU;