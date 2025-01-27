export const CPUFrequency: number = 1789773

enum InterruptType {
    None = 1,
    NMI = 2,
    IRQ = 3
}

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
    memory: Array<number>
}


enum AddressingMode {
    Absolute = 1,
    AbsoluteX = 2,
    AbsoluteY = 3,
    Accumulator = 4,
    Immediate = 5,
    Implied = 6,
    IndexedIndirect = 7,
    Indirect = 8,
    IndirectIndexed = 9,
    Relative = 10,
    ZeroPage = 11,
    ZeroPageX = 12,
    ZeroPageY = 13,
}

type Instruction = {
    index: number;
    addressingMode: AddressingMode
    size: number
    cycles: number
    pageCycles: number
}


const addressingModes = [
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

const instructionSizes = [
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

const instructionCycles = [
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

const instructionPageCycles = [
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

const instructions: Instruction[] = []
for (let i = 0; i < 0xff; i++) {
    instructions.push({
        index: i,
        addressingMode: addressingModes[i],
        size: instructionSizes[i],
        cycles: instructionCycles[i],
        pageCycles: instructionPageCycles[i],
    })
}


class ProcessorStatus {
    C: boolean = false; // Carry Flag
    Z: boolean = false; // Zero Flag
    I: boolean = false; // Interrupt Disable Flag
    D: boolean = false; // Decimal Mode Flag
    B: boolean = false; // Break Command Flag
    U: boolean = true;  // Unused Flag (always true)
    V: boolean = false; // Overflow Flag
    N: boolean = false; // Negative Flag

    get flags(): number {
        let flags = 0;
        flags |= (this.C ? 1 : 0) << 0;
        flags |= (this.Z ? 1 : 0) << 1;
        flags |= (this.I ? 1 : 0) << 2;
        flags |= (this.D ? 1 : 0) << 3;
        flags |= (this.B ? 1 : 0) << 4;
        flags |= 1 << 5;
        flags |= (this.V ? 1 : 0) << 6;
        flags |= (this.N ? 1 : 0) << 7;
        return flags;
    }

    set flags(flags: number) {
        this.C = !!((flags >> 0) & 1);
        this.Z = !!((flags >> 1) & 1);
        this.I = !!((flags >> 2) & 1);
        this.D = !!((flags >> 3) & 1);
        this.B = !!((flags >> 4) & 1);
        this.U = true;
        this.V = !!((flags >> 6) & 1);
        this.N = !!((flags >> 7) & 1);
    }

    setZ(value: number) {
        this.Z = value == 0;
    }

    setN(value: number) {
        this.N = (value & 0x80) != 0
    }

    setZN(value: number) {
        this.setZ(value);
        this.setN(value);
    }

    toString(): string {
        return `N=${this.N} V=${this.V} U=${this.U} B=${this.B} D=${this.D} I=${this.I} Z=${this.Z} C=${this.C}`;
    }

    reset() {
        this.flags = 0b00100000
    }
}


class CPU {
    private A: number = 0;
    private X: number = 0
    private Y: number = 0
    private PC: number = 0x0000
    private SP: number = 0xFF
    private readonly P: ProcessorStatus = new ProcessorStatus()

    stall: number = 0
    private currentInterrupt = InterruptType.None
    private cpuCycles: number = 0
    private readonly memory: Uint8Array = new Uint8Array(0x10000)
    private readonly instructionExecutors: InstructionExecutor[] = []

    constructor() {
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

    saveState(): CPUState {
        return {
            A: this.A,
            X: this.X,
            Y: this.Y,
            PC: this.PC,
            SP: this.SP,
            P: this.P.flags,
            memory: Array.from(this.memory),
        };
    }

    loadState(state: CPUState): void {
        this.A = state.A;
        this.X = state.X;
        this.Y = state.Y;
        this.PC = state.PC;
        this.SP = state.SP;
        this.P.flags = state.P;
        this.memory.set(state.memory);
    }

    writeByte(address: number, value: number): void {
        this.memory[address & 0xFFFF] = value & 0xFF
    }

    readByte(address: number): number {
        return this.memory[address & 0xFFFF]
    }

    readWord(address: number): number {
        const low = this.readByte(address)
        const high = this.readByte(address + 1)
        return low | high << 8
    }

    // MOS6502 JMP bug
    readWordWithBug(address: number): number {
        const low = this.readByte(address)
        const high = this.readByte((address & 0xFF00) | (address + 1))
        return low | high << 8
    }

    pushByteToStack(value: number): void {
        this.writeByte(0x100 | this.SP, value)
        this.SP--
    }

    pushWordToStack(value: number): void {
        this.pushByteToStack(value >> 8)
        this.pushByteToStack(value & 0xFF)
    }

    pullByteFromStack(): number {
        this.SP++
        return this.readByte(0x100 | this.SP)
    }

    pullWordFromStack(): number {
        const low = this.pullByteFromStack()
        const high = this.pullByteFromStack()
        return low | high << 8
    }

    resolveInstructionAddress(mode: AddressingMode) {
        switch (mode) {
            case AddressingMode.Absolute:
                return this.readWord(this.PC + 1)
            case AddressingMode.AbsoluteX:
                return this.readWord(this.PC + 1) + this.X
            case AddressingMode.AbsoluteY:
                return this.readWord(this.PC + 1) + this.Y
            case AddressingMode.Accumulator:
                return 0x0000
            case AddressingMode.Immediate:
                return this.PC + 1
            case AddressingMode.Implied:
                return 0x0000
            case AddressingMode.IndexedIndirect:
                return this.readWordWithBug(this.readByte(this.PC + 1) + this.X)
            case AddressingMode.Indirect:
                return this.readWordWithBug(this.readWord(this.PC + 1))
            case AddressingMode.IndirectIndexed:
                return this.readWordWithBug(this.readByte(this.PC + 1)) + this.Y
            case AddressingMode.Relative:
                const offset = this.readByte(this.PC + 1)
                if (offset < 0x80) {
                    return this.PC + 2 + offset
                }
                return this.PC + 2 + offset - 0x100
            case AddressingMode.ZeroPage:
                return this.readByte(this.PC + 1)
            case AddressingMode.ZeroPageX:
                return (this.readByte(this.PC + 1) + this.X) & 0xFF
            case AddressingMode.ZeroPageY:
                return (this.readByte(this.PC + 1) + this.Y) & 0xFF
            default:
                return 0x0000
        }
    }

    isPageBoundaryCrossed(a: number, b: number): boolean {
        return (a & 0xFF00) !== (b & 0xFF00)
    }

    isPageBoundaryCrossedForMode(mode: AddressingMode, address: number): boolean {
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

    triggerNMI() {
        this.currentInterrupt = InterruptType.NMI
    }

    triggerIRQ() {
        this.currentInterrupt = InterruptType.IRQ
    }

    addBranchCycles(ctx: InstructionExecutionContext) {
        this.cpuCycles++
        if (this.isPageBoundaryCrossed(ctx.pc, ctx.address)) {
            this.cpuCycles++
        }
    }

    compareValues(a: number, b: number) {
        this.P.setZN(a - b)
        this.P.C = a >= b
    }

    reset(): void {
        this.A = this.X = this.Y = 0
        this.PC = this.readWord(0xFFFC)
        this.SP = 0xFF
        this.P.reset()
        this.memory.fill(0)
    }

    update(): number {
        if (this.stall > 0) {
            this.stall--
            return 1
        }
        switch (this.currentInterrupt) {
            case InterruptType.NMI:
                this.handleNMI()
                break
            case InterruptType.IRQ:
                this.handleIRQ()
                break
        }
        this.currentInterrupt = InterruptType.None
        const opcode = this.readByte(this.PC)
        const op = instructions[opcode]
        const address = this.resolveInstructionAddress(op.addressingMode)
        const isPageCrossed = this.isPageBoundaryCrossedForMode(op.addressingMode, address)
        this.PC += op.size
        const cpuCycles = this.cpuCycles
        this.cpuCycles += op.cycles
        if (isPageCrossed) {
            this.cpuCycles += op.pageCycles
        }
        const instruction = this.instructionExecutors[opcode]
        instruction({
            address: address,
            pc: this.PC,
            addressingMode: op.addressingMode,
        })
        return this.cpuCycles - cpuCycles
    }

    handleNMI() {
        this.pushWordToStack(this.PC)
        this.PHP()
        this.PC = this.readWord(0xFFFA)
        this.P.I = true
        this.cpuCycles += 7
    }

    handleIRQ() {
        this.pushWordToStack(this.PC)
        this.PHP()
        this.PC = this.readWord(0xFFFE)
        this.P.I = true
        this.cpuCycles += 7
    }

    /**
     * Data Transfer Instructions
     * These instructions move data between registers, memory, and the stack.
     */

    /**
     * Load accumulator (A) from memory.
     * @param ctx
     * @constructor
     */
    LDA(ctx: InstructionExecutionContext) {
        this.A = this.readByte(ctx.address)
        this.P.setZN(this.A)
    }

    /**
     * Load register X from memory.
     * @param ctx
     * @constructor
     */
    LDX(ctx: InstructionExecutionContext) {
        this.X = this.readByte(ctx.address)
        this.P.setZN(this.X)
    }

    /**
     * Load register Y from memory.
     * @param ctx
     * @constructor
     */
    LDY(ctx: InstructionExecutionContext) {
        this.Y = this.readByte(ctx.address)
        this.P.setZN(this.Y)
    }

    /**
     * Store accumulator (A) into memory.
     * @param ctx
     * @constructor
     */
    STA(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.A)
    }

    /**
     * Store register X into memory.
     * @param ctx
     * @constructor
     */
    STX(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.X)
    }

    /**
     * Store register Y into memory.
     * @param ctx
     * @constructor
     */
    STY(ctx: InstructionExecutionContext) {
        this.writeByte(ctx.address, this.Y)
    }

    /**
     * Transfer accumulator (A) to register X.
     * @param _
     * @constructor
     */
    TAX(_: InstructionExecutionContext) {
        this.X = this.A
        this.P.setZN(this.X)
    }

    /**
     * Transfer accumulator (A) to register Y.
     * @param _
     * @constructor
     */
    TAY(_: InstructionExecutionContext) {
        this.Y = this.A
        this.P.setZN(this.Y)
    }

    /**
     * Transfer register X to accumulator (A).
     * @param _
     * @constructor
     */
    TXA(_: InstructionExecutionContext) {
        this.A = this.X
        this.P.setZN(this.A)
    }

    /**
     * Transfer register Y to accumulator (A).
     * @param _
     * @constructor
     */
    TYA(_: InstructionExecutionContext) {
        this.A = this.Y
        this.P.setZN(this.A)
    }

    /**
     * Transfer stack pointer (SP) to register X.
     * @param _
     * @constructor
     */
    TSX(_: InstructionExecutionContext) {
        this.X = this.SP
        this.P.setZN(this.X)
    }

    /**
     * Transfer register X to stack pointer (SP).
     * @param _
     * @constructor
     */
    TXS(_: InstructionExecutionContext) {
        this.SP = this.X
    }


    /**
     * Arithmetic Instructions
     * These perform addition and subtraction on the accumulator and memory.
     */

    /**
     * Add with carry (Accumulator + Operand + Carry).
     * @param ctx
     * @constructor
     */
    ADC(ctx: InstructionExecutionContext) {
        const a = this.A
        const b = this.readByte(ctx.address)
        const c = this.P.C ? 1 : 0
        const abc = a + b + c
        this.A = abc
        this.P.setZN(this.A)
        this.P.C = abc > 0xFF
        this.P.V = (((a ^ b) & 0x80) == 0) && (((a ^ this.A) & 0x80) != 0)
    }

    /**
     * Subtract with carry (Accumulator - Operand - Borrow).
     * @param ctx
     * @constructor
     */
    SBC(ctx: InstructionExecutionContext) {
        const a = this.A
        const b = this.readByte(ctx.address)
        const c = this.P.C ? 1 : 0
        const abc = a - b - (1 - c)
        this.A = abc
        this.P.setZN(this.A)
        this.P.C = abc >= 0
        this.P.V = (((a ^ b) & 0x80) != 0) && ((a ^ this.A) & 0x80) != 0
    }

    /**
     * Increment memory by 1.
     * @param ctx
     * @constructor
     */
    INC(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address) + 1
        this.writeByte(ctx.address, value)
        this.P.setZN(value)
    }

    /**
     * Increment register X by 1.
     * @param _
     * @constructor
     */
    INX(_: InstructionExecutionContext) {
        this.X++
        this.P.setZN(this.X)
    }

    /**
     * Increment register Y by 1.
     * @param _
     * @constructor
     */
    INY(_: InstructionExecutionContext) {
        this.Y++
        this.P.setZN(this.Y)
    }

    /**
     * Decrement memory by 1.
     * @param ctx
     * @constructor
     */
    DEC(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address) - 1
        this.writeByte(ctx.address, value)
        this.P.setZN(value)
    }

    /**
     * Decrement register X by 1.
     * @param _
     * @constructor
     */
    DEX(_: InstructionExecutionContext) {
        this.X--
        this.P.setZN(this.X)
    }

    /**
     * Decrement register Y by 1.
     * @param _
     * @constructor
     */
    DEY(_: InstructionExecutionContext) {
        this.Y--
        this.P.setZN(this.Y)
    }

    /**
     * Logical Instructions
     * These perform bitwise operations on the accumulator and memory.
     */

    /**
     * Logical AND (Accumulator & Operand).
     * @param ctx
     * @constructor
     */
    AND(ctx: InstructionExecutionContext) {
        this.A = this.A & this.readByte(ctx.address)
        this.P.setZN(this.A)
    }

    /**
     * Logical OR (Accumulator & Operand).
     * @param ctx
     * @constructor
     */
    ORA(ctx: InstructionExecutionContext) {
        this.A = this.A | this.readByte(ctx.address)
        this.P.setZN(this.A)
    }

    /**
     * Exclusive OR (Accumulator ^ Operand).
     * @param ctx
     * @constructor
     */
    EOR(ctx: InstructionExecutionContext) {
        this.A = this.A ^ this.readByte(ctx.address)
        this.P.setZN(this.A)
    }

    /**
     * Test bits in memory (affects zero, overflow flags).
     * @param ctx
     * @constructor
     */
    BIT(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.P.V = !!((value >> 6) & 1)
        this.P.setZ(value & this.A)
        this.P.setN(value)
    }

    /**
     * Shift and Rotate Instructions
     * These manipulate bits in the accumulator or memory.
     */

    /**
     * Arithmetic shift left (Multiply by 2).
     * @param ctx
     * @constructor
     */
    ASL(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode === AddressingMode.Accumulator) {
            this.P.C = !!((this.A >> 7) & 1)
            this.A <<= 1
            this.P.setZN(this.A)

        } else {
            let value = this.readByte(ctx.address)
            this.P.C = !!((this.A >> 7) & 1)
            value <<= 1
            this.writeByte(ctx.address, value)
            this.P.setZN(value)
        }
    }

    /**
     * Logical shift right (Divide by 2).
     * @param ctx
     * @constructor
     */
    LSR(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            this.P.C = !!(this.A & 1)
            this.A >>= 1
            this.P.setZN(this.A)
        } else {
            let value = this.readByte(ctx.address)
            this.P.C = !!(value & 1)
            value >>= 1
            this.writeByte(ctx.address, value)
            this.P.setZN(value)
        }
    }

    /**
     * Rotate left through the carry flag.
     * @param ctx
     * @constructor
     */
    ROL(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            const c = this.P.C ? 1 : 0
            this.P.C = !!((this.A >> 7) & 1)
            this.A = (this.A << 1) | c
            this.P.setZN(this.A)
        } else {
            const c = this.P.C ? 1 : 0
            let value = this.readByte(ctx.address)
            this.P.C = !!((value >> 7) & 1)
            value = (value << 1) | c
            this.writeByte(ctx.address, value)
            this.P.setZN(c)
        }
    }

    /**
     * Rotate right through the carry flag.
     * @param ctx
     * @constructor
     */
    ROR(ctx: InstructionExecutionContext) {
        if (ctx.addressingMode == AddressingMode.Accumulator) {
            const c = this.P.C ? 1 : 0
            this.P.C = !!(this.A & 1)
            this.A = ((this.A >> 1) | (c << 7))
            this.P.setZN(this.A)
        } else {
            const c = this.P.C ? 1 : 0
            let value = this.readByte(ctx.address)
            this.P.C = !!(value & 1)
            value = (value >> 1) | (c << 7)
            this.writeByte(ctx.address, value)
            this.P.setZN(c)
        }
    }

    /**
     * Flag Manipulation Instructions
     * These modify specific processor status flags.
     */

    /**
     * Clear carry flag (C = 0).
     * @param _
     * @constructor
     */
    CLC(_: InstructionExecutionContext) {
        this.P.C = false
    }

    /**
     * Set carry flag (C = 1).
     * @param _
     * @constructor
     */
    SEC(_: InstructionExecutionContext) {
        this.P.I = true
    }

    /**
     * Clear decimal mode (D = 0).
     * @param _
     * @constructor
     */
    CLD(_: InstructionExecutionContext) {
        this.P.D = false
    }

    /**
     * Set decimal mode (D = 1).
     * @param _
     * @constructor
     */
    SED(_: InstructionExecutionContext) {
        this.P.D = true
    }

    /**
     * Clear interrupt disable flag (I = 0).
     * @param _
     * @constructor
     */
    CLI(_: InstructionExecutionContext) {
        this.P.I = false
    }

    /**
     * Set interrupt disable flag (I = 1).
     * @param _
     * @constructor
     */
    SEI(_: InstructionExecutionContext) {
        this.P.I = true
    }

    /**
     * Clear overflow flag (V = 0).
     * @param _
     * @constructor
     */
    CLV(_: InstructionExecutionContext) {
        this.P.V = false
    }

    /**
     * Comparison Instructions
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
    CMP(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.A, value)
    }

    /**
     * Compare the X register with the operand.
     * Sets the carry flag if X gt operand (X >= operand).
     * @param ctx
     * @constructor
     */
    CPX(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.X, value)
    }

    /**
     * Compare the Y register with the operand.
     * Sets the carry flag if Y gt operand (Y >= operand).
     * @param ctx
     * @constructor
     */
    CPY(ctx: InstructionExecutionContext) {
        const value = this.readByte(ctx.address)
        this.compareValues(this.Y, value)
    }

    /**
     * Program Control Instructions
     * These change the program flow (jumps, branches, subroutines).
     */

    /**
     * Unconditional jump.
     * @param ctx
     * @constructor
     */
    JMP(ctx: InstructionExecutionContext) {
        this.PC = ctx.address
    }

    /**
     * Jump to subroutine.
     * @param ctx
     * @constructor
     */
    JSR(ctx: InstructionExecutionContext) {
        this.pushWordToStack(this.PC - 1)
        this.PC = ctx.address
    }

    /**
     * Return from subroutine.
     * @param _
     * @constructor
     */
    RTS(_: InstructionExecutionContext) {
        this.PC = this.pullWordFromStack() + 1
    }

    /**
     * Return from interrupt.
     * @param _
     * @constructor
     */
    RTI(_: InstructionExecutionContext) {
        this.P.flags = this.pullByteFromStack() & 0xEF | 0x20
        this.PC = this.pullWordFromStack()
    }

    /**
     * Force an interrupt.
     * @param ctx
     * @constructor
     */
    BRK(ctx: InstructionExecutionContext) {
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
    BPL(ctx: InstructionExecutionContext) {
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
    BMI(ctx: InstructionExecutionContext) {
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
    BVC(ctx: InstructionExecutionContext) {
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
    BVS(ctx: InstructionExecutionContext) {
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
    BCC(ctx: InstructionExecutionContext) {
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
    BCS(ctx: InstructionExecutionContext) {
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
    BNE(ctx: InstructionExecutionContext) {
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
    BEQ(ctx: InstructionExecutionContext) {
        if (this.P.Z) {
            this.PC = ctx.address
            this.addBranchCycles(ctx)
        }
    }

    /**
     * Stack Operations
     * These manage the stack, enabling push and pull operations.
     * @param _
     * @constructor
     */

    /**
     * Push accumulator (A) onto the stack.
     * @param _
     * @constructor
     */
    PHA(_: InstructionExecutionContext) {
        this.pushByteToStack(this.A)
    }

    /**
     * Push processor status register onto the stack.
     * @param _
     * @constructor
     */
    PHP(_?: InstructionExecutionContext) {
        this.pushByteToStack(this.P.flags | 0x10)
    }

    /**
     * Pull from stack to accumulator (A).
     * @param _
     * @constructor
     */
    PLA(_: InstructionExecutionContext) {
        this.A = this.pullByteFromStack()
        this.P.setZN(this.A)
    }

    /**
     * Pull from stack to processor status.
     * @param _
     * @constructor
     */
    PLP(_: InstructionExecutionContext) {
        this.P.flags = this.pullByteFromStack() & 0xEF | 0x20
    }

    /**
     * No-Operation Instruction
     * Used for delaying or placeholder operations.
     * No operation (takes one cycle).
     * @param _
     * @constructor
     */
    NOP(_: InstructionExecutionContext) {
    }

    /**
     * Illegal (Unofficial) Instructions
     * The MOS 6502 has several undocumented "illegal instructions,"
     * which vary by hardware implementation and are not officially supported.
     */

    AHX(_: InstructionExecutionContext) {
    }

    ALR(_: InstructionExecutionContext) {
    }

    ANC(_: InstructionExecutionContext) {
    }

    ARR(_: InstructionExecutionContext) {
    }

    AXS(_: InstructionExecutionContext) {
    }

    DCP(_: InstructionExecutionContext) {
    }

    ISC(_: InstructionExecutionContext) {
    }

    KIL(_: InstructionExecutionContext) {
    }

    LAS(_: InstructionExecutionContext) {
    }

    LAX(_: InstructionExecutionContext) {
    }

    RLA(_: InstructionExecutionContext) {
    }

    RRA(_: InstructionExecutionContext) {
    }

    SAX(_: InstructionExecutionContext) {
    }

    SHX(_: InstructionExecutionContext) {
    }

    SHY(_: InstructionExecutionContext) {
    }

    SLO(_: InstructionExecutionContext) {
    }

    SRE(_: InstructionExecutionContext) {
    }

    TAS(_: InstructionExecutionContext) {
    }

    XAA(_: InstructionExecutionContext) {
    }
}

export default CPU;