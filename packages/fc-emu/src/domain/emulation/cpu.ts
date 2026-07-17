import { CPUMemory } from "./memory.js";
import { isByte, isWord } from "./numeric-range.js";
import type Bus from "./bus.js";
import { CpuInterruptState, type CpuInterruptSnapshot } from "./cpu/cpu-interrupt-state.js";
import {
  CpuInterruptEntry,
  type CpuInterruptEntryKind,
  type CpuInterruptEntryPort,
  type CpuInterruptEntryState,
} from "./cpu/cpu-interrupt-entry.js";
import {
  AddressingMode,
  getInstruction,
  InstructionMemoryOperation,
} from "./cpu/instruction-set.js";
import { ProcessorStatus } from "./cpu/processor-status.js";
import {
  createInstructionCyclePlan,
  type CpuStackOperation,
  type InstructionCyclePlan,
} from "./cpu/instruction-cycle-plan.js";
import { CpuBranchCycle, type CpuBranchCycleState } from "./cpu/cpu-branch-cycle.js";
import { CpuMemoryCycle, type CpuMemoryCycleState } from "./cpu/cpu-memory-cycle.js";
import { CpuStackCycle, type CpuStackCycleState } from "./cpu/cpu-stack-cycle.js";
import {
  CpuControlFlowCycle,
  type CpuControlFlowCycleState,
} from "./cpu/cpu-control-flow-cycle.js";
import {
  CpuReadModifyWriteCycle,
  type CpuReadModifyWriteCycleState,
} from "./cpu/cpu-read-modify-write-cycle.js";

type InstructionExecutionContext = {
  address: number;
  pc: number;
  addressingMode: AddressingMode;
  indexedDummyReadHalted: boolean;
};

type InstructionExecutor = (ctx: InstructionExecutionContext) => void;

type CPUState = {
  A: number;
  X: number;
  Y: number;
  PC: number;
  SP: number;
  P: number;
};

type ActiveInstructionCycle = {
  readonly opcode: number;
  readonly interruptDisableBeforeInstruction: boolean;
} & (
  | { readonly kind: "implied" }
  | { readonly kind: "branch"; readonly cycle: CpuBranchCycle }
  | { readonly kind: "memory"; readonly cycle: CpuMemoryCycle }
  | {
      readonly kind: "rmw";
      readonly addressCycle: CpuMemoryCycle;
      dataCycle?: CpuReadModifyWriteCycle;
    }
  | { readonly kind: "stack"; readonly cycle: CpuStackCycle; readonly operation: CpuStackOperation }
  | { readonly kind: "control-flow"; readonly cycle: CpuControlFlowCycle }
);

type ActiveInstructionState = {
  readonly opcode: number;
  readonly interruptDisableBeforeInstruction: boolean;
} & (
  | { readonly kind: "implied" }
  | { readonly kind: "branch"; readonly cycle: CpuBranchCycleState }
  | { readonly kind: "memory"; readonly cycle: CpuMemoryCycleState }
  | {
      readonly kind: "rmw";
      readonly addressCycle: CpuMemoryCycleState;
      readonly dataCycle?: CpuReadModifyWriteCycleState;
    }
  | {
      readonly kind: "stack";
      readonly cycle: CpuStackCycleState;
      readonly operation: CpuStackOperation;
    }
  | { readonly kind: "control-flow"; readonly cycle: CpuControlFlowCycleState }
);

export interface CpuSnapshot {
  readonly registers: CPUState;
  readonly internalDataBus: number;
  readonly externalDataBus: number;
  readonly cpuCycles: number;
  readonly halted: boolean;
  readonly interruptPolledThisCycle: boolean;
  readonly interrupts: CpuInterruptSnapshot;
  readonly interruptEntry?: CpuInterruptEntryState;
  readonly activeInstruction?: ActiveInstructionState;
  readonly indexedReadResult?: { readonly address: number; readonly value: number };
}

/**
 * Represents the 6502 CPU with all its registers and functionality
 */
class CPU {
  private readonly memory: CPUMemory;
  // Accumulator register
  private A = 0;
  // X index register
  private X = 0;
  // Y index register
  private Y = 0;
  // Program Counter - holds the address of the next instruction to execute
  private PC = 0x0000;
  // Stack Pointer - points to the current top of the stack (0x0100-0x01FF)
  private SP = 0xff;
  // Processor Status register - contains various status flags
  private readonly P: ProcessorStatus = new ProcessorStatus();
  private readonly interrupts = new CpuInterruptState();
  private readonly interruptEntryPort: CpuInterruptEntryPort;
  private interruptEntry: CpuInterruptEntry | undefined;
  private activeInstruction: ActiveInstructionCycle | undefined;
  private indexedReadResult: { readonly address: number; readonly value: number } | undefined;
  private rmwExecution:
    | { readonly address: number; readonly previousValue: number; transformedValue?: number }
    | undefined;
  private interruptPolledThisCycle = false;
  // STP/KIL opcodes jam the NMOS CPU until reset.
  private halted = false;
  // Total number of CPU cycles executed
  public cpuCycles = 0;
  // Array of instruction execution functions
  private readonly instructionExecutors: InstructionExecutor[] = [];

  /**
   * Initializes a new CPU instance
   * Sets up the instruction execution table with all 6502 opcodes
   * Including both legal and illegal instructions
   */
  constructor(bus: Bus) {
    this.memory = new CPUMemory(bus);
    this.interruptEntryPort = {
      readByte: (address) => this.readByte(address),
      pushByte: (value) => this.pushByteToStack(value),
      getProgramCounter: () => this.PC,
      setProgramCounter: (value) => {
        this.PC = value & 0xffff;
      },
      getProcessorFlags: () => this.P.flags,
      setInterruptDisabled: () => {
        this.P.I = true;
      },
      consumeNmiForVectorHijack: () => this.interrupts.consumeNmiForVectorHijack(),
    };
    // Initialize instruction executor array
    // Each index corresponds to an opcode (0x00-0xFF)
    // Format: [Opcode Name, Implementation Function]
    this.instructionExecutors = [
      this.cycleManagedInstruction,
      this.ORA,
      this.KIL,
      this.SLO,
      this.NOP,
      this.ORA,
      this.ASL,
      this.SLO,
      this.cycleManagedInstruction,
      this.ORA,
      this.ASL,
      this.ANC,
      this.NOP,
      this.ORA,
      this.ASL,
      this.SLO,
      this.cycleManagedInstruction,
      this.ORA,
      this.KIL,
      this.SLO,
      this.NOP,
      this.ORA,
      this.ASL,
      this.SLO,
      this.CLC,
      this.ORA,
      this.NOP,
      this.SLO,
      this.NOP,
      this.ORA,
      this.ASL,
      this.SLO,
      this.cycleManagedInstruction,
      this.AND,
      this.KIL,
      this.RLA,
      this.BIT,
      this.AND,
      this.ROL,
      this.RLA,
      this.cycleManagedInstruction,
      this.AND,
      this.ROL,
      this.ANC,
      this.BIT,
      this.AND,
      this.ROL,
      this.RLA,
      this.cycleManagedInstruction,
      this.AND,
      this.KIL,
      this.RLA,
      this.NOP,
      this.AND,
      this.ROL,
      this.RLA,
      this.SEC,
      this.AND,
      this.NOP,
      this.RLA,
      this.NOP,
      this.AND,
      this.ROL,
      this.RLA,
      this.cycleManagedInstruction,
      this.EOR,
      this.KIL,
      this.SRE,
      this.NOP,
      this.EOR,
      this.LSR,
      this.SRE,
      this.cycleManagedInstruction,
      this.EOR,
      this.LSR,
      this.ALR,
      this.cycleManagedInstruction,
      this.EOR,
      this.LSR,
      this.SRE,
      this.cycleManagedInstruction,
      this.EOR,
      this.KIL,
      this.SRE,
      this.NOP,
      this.EOR,
      this.LSR,
      this.SRE,
      this.CLI,
      this.EOR,
      this.NOP,
      this.SRE,
      this.NOP,
      this.EOR,
      this.LSR,
      this.SRE,
      this.cycleManagedInstruction,
      this.ADC,
      this.KIL,
      this.RRA,
      this.NOP,
      this.ADC,
      this.ROR,
      this.RRA,
      this.cycleManagedInstruction,
      this.ADC,
      this.ROR,
      this.ARR,
      this.cycleManagedInstruction,
      this.ADC,
      this.ROR,
      this.RRA,
      this.cycleManagedInstruction,
      this.ADC,
      this.KIL,
      this.RRA,
      this.NOP,
      this.ADC,
      this.ROR,
      this.RRA,
      this.SEI,
      this.ADC,
      this.NOP,
      this.RRA,
      this.NOP,
      this.ADC,
      this.ROR,
      this.RRA,
      this.NOP,
      this.STA,
      this.NOP,
      this.SAX,
      this.STY,
      this.STA,
      this.STX,
      this.SAX,
      this.DEY,
      this.NOP,
      this.TXA,
      this.XAA,
      this.STY,
      this.STA,
      this.STX,
      this.SAX,
      this.cycleManagedInstruction,
      this.STA,
      this.KIL,
      this.AHX,
      this.STY,
      this.STA,
      this.STX,
      this.SAX,
      this.TYA,
      this.STA,
      this.TXS,
      this.TAS,
      this.SHY,
      this.STA,
      this.SHX,
      this.AHX,
      this.LDY,
      this.LDA,
      this.LDX,
      this.LAX,
      this.LDY,
      this.LDA,
      this.LDX,
      this.LAX,
      this.TAY,
      this.LDA,
      this.TAX,
      this.LAX,
      this.LDY,
      this.LDA,
      this.LDX,
      this.LAX,
      this.cycleManagedInstruction,
      this.LDA,
      this.KIL,
      this.LAX,
      this.LDY,
      this.LDA,
      this.LDX,
      this.LAX,
      this.CLV,
      this.LDA,
      this.TSX,
      this.LAS,
      this.LDY,
      this.LDA,
      this.LDX,
      this.LAX,
      this.CPY,
      this.CMP,
      this.NOP,
      this.DCP,
      this.CPY,
      this.CMP,
      this.DEC,
      this.DCP,
      this.INY,
      this.CMP,
      this.DEX,
      this.AXS,
      this.CPY,
      this.CMP,
      this.DEC,
      this.DCP,
      this.cycleManagedInstruction,
      this.CMP,
      this.KIL,
      this.DCP,
      this.NOP,
      this.CMP,
      this.DEC,
      this.DCP,
      this.CLD,
      this.CMP,
      this.NOP,
      this.DCP,
      this.NOP,
      this.CMP,
      this.DEC,
      this.DCP,
      this.CPX,
      this.SBC,
      this.NOP,
      this.ISC,
      this.CPX,
      this.SBC,
      this.INC,
      this.ISC,
      this.INX,
      this.SBC,
      this.NOP,
      this.SBC,
      this.CPX,
      this.SBC,
      this.INC,
      this.ISC,
      this.cycleManagedInstruction,
      this.SBC,
      this.KIL,
      this.ISC,
      this.NOP,
      this.SBC,
      this.INC,
      this.ISC,
      this.SED,
      this.SBC,
      this.NOP,
      this.ISC,
      this.NOP,
      this.SBC,
      this.INC,
      this.ISC,
    ];
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

  get isHalted(): boolean {
    return this.halted;
  }

  get hasActiveInstruction(): boolean {
    return this.activeInstruction !== undefined;
  }

  get hasPendingIRQ(): boolean {
    return this.interrupts.hasPendingIrq;
  }

  get isIRQLineAsserted(): boolean {
    return this.interrupts.isIrqLineAsserted;
  }

  get didPollInterruptsThisCycle(): boolean {
    return this.interruptPolledThisCycle;
  }

  captureState(): CpuSnapshot {
    const interruptEntry = this.interruptEntry?.captureState();
    const activeInstruction = this.captureActiveInstruction();
    const indexedReadResult = this.indexedReadResult ? { ...this.indexedReadResult } : undefined;
    return {
      registers: { ...this.state },
      internalDataBus: this.memory.internalBus,
      externalDataBus: this.memory.externalBus,
      cpuCycles: this.cpuCycles,
      halted: this.halted,
      interruptPolledThisCycle: this.interruptPolledThisCycle,
      interrupts: this.interrupts.captureState(),
      ...(interruptEntry ? { interruptEntry } : {}),
      ...(activeInstruction ? { activeInstruction } : {}),
      ...(indexedReadResult ? { indexedReadResult } : {}),
    };
  }

  restoreState(snapshot: CpuSnapshot): void {
    this.validateSnapshot(snapshot);
    this.state = snapshot.registers;
    this.memory.restoreDataBuses(snapshot.internalDataBus, snapshot.externalDataBus);
    this.cpuCycles = snapshot.cpuCycles;
    this.halted = snapshot.halted;
    this.interruptPolledThisCycle = snapshot.interruptPolledThisCycle;
    this.interrupts.restoreState(snapshot.interrupts);
    this.interruptEntry = snapshot.interruptEntry
      ? CpuInterruptEntry.fromState(snapshot.interruptEntry)
      : undefined;
    this.activeInstruction = snapshot.activeInstruction
      ? this.restoreActiveInstruction(snapshot.activeInstruction)
      : undefined;
    this.indexedReadResult = snapshot.indexedReadResult
      ? { ...snapshot.indexedReadResult }
      : undefined;
    this.rmwExecution = undefined;
  }

  set state(state: CPUState) {
    this.A = state.A & 0xff;
    this.X = state.X & 0xff;
    this.Y = state.Y & 0xff;
    this.PC = state.PC & 0xffff;
    this.SP = state.SP & 0xff;
    this.P.flags = state.P;
    this.interrupts.setIrqPollingDisabled(this.P.I);
  }

  private captureActiveInstruction(): ActiveInstructionState | undefined {
    const active = this.activeInstruction;
    if (!active) return undefined;
    const base = {
      opcode: active.opcode,
      interruptDisableBeforeInstruction: active.interruptDisableBeforeInstruction,
    } as const;
    switch (active.kind) {
      case "implied":
        return { ...base, kind: "implied" };
      case "branch":
        return { ...base, kind: "branch", cycle: active.cycle.captureState() };
      case "memory":
        return { ...base, kind: "memory", cycle: active.cycle.captureState() };
      case "control-flow":
        return { ...base, kind: "control-flow", cycle: active.cycle.captureState() };
      case "rmw": {
        const dataCycle = active.dataCycle?.captureState();
        return {
          ...base,
          kind: "rmw",
          addressCycle: active.addressCycle.captureState(),
          ...(dataCycle ? { dataCycle } : {}),
        };
      }
      case "stack":
        return {
          ...base,
          kind: "stack",
          operation: active.operation,
          cycle: active.cycle.captureState(),
        };
    }
  }

  private restoreActiveInstruction(state: ActiveInstructionState): ActiveInstructionCycle {
    const base = {
      opcode: state.opcode,
      interruptDisableBeforeInstruction: state.interruptDisableBeforeInstruction,
    } as const;
    switch (state.kind) {
      case "implied":
        return { ...base, kind: "implied" };
      case "branch":
        return { ...base, kind: "branch", cycle: CpuBranchCycle.fromState(state.cycle) };
      case "memory":
        return { ...base, kind: "memory", cycle: CpuMemoryCycle.fromState(state.cycle) };
      case "rmw": {
        const addressCycle = CpuMemoryCycle.fromState(state.addressCycle);
        const dataState = state.dataCycle;
        const dataCycle = dataState
          ? CpuReadModifyWriteCycle.fromState(dataState, (previousValue) =>
              this.executeReadModifyWriteInstruction(
                state.opcode,
                dataState.address,
                previousValue,
              ),
            )
          : undefined;
        return {
          ...base,
          kind: "rmw",
          addressCycle,
          ...(dataCycle ? { dataCycle } : {}),
        };
      }
      case "stack":
        return {
          ...base,
          kind: "stack",
          operation: state.operation,
          cycle: CpuStackCycle.fromState(state.cycle),
        };
      case "control-flow":
        return {
          ...base,
          kind: "control-flow",
          cycle: CpuControlFlowCycle.fromState(state.cycle),
        };
    }
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
    const value = this.memory.read(address);
    const indexedResult = this.indexedReadResult;
    if (indexedResult && indexedResult.address === (address & 0xffff)) {
      this.indexedReadResult = undefined;
      return indexedResult.value;
    }
    return value;
  }

  /** DMA observes memory directly and must not consume an instruction's data-bus latch. */
  public readByteForDma(address: number): number {
    return this.memory.readForDma(address);
  }

  /** /RDY repeats the halted CPU read, so both the internal and external buses observe it. */
  public repeatHaltedReadForDma(address: number): number {
    return this.memory.read(address);
  }

  /** Performs the NMOS 6502 read/write-old/write-new memory sequence. */
  private readModifyWrite(address: number, transform: (value: number) => number): number {
    const execution = this.rmwExecution;
    if (!execution || execution.address !== (address & 0xffff)) {
      throw new Error("RMW semantics must be invoked by CpuReadModifyWriteCycle");
    }
    const value = transform(execution.previousValue) & 0xff;
    execution.transformedValue = value;
    return value;
  }

  /**
   * Reads a 16-bit word from memory (little-endian)
   * @param address - Memory address of the low byte
   * @returns 16-bit value composed of two consecutive bytes
   */
  private readWord(address: number): number {
    const low = this.readByte(address);
    const high = this.readByte(address + 1);
    return low | (high << 8);
  }

  /**
   * Pushes a byte onto the stack (0x0100-0x01FF)
   * Stack Pointer decrements after push
   * @param value - 8-bit value to push
   */
  private pushByteToStack(value: number): void {
    this.writeByte(0x100 | this.SP, value);
    this.SP = (this.SP - 1) & 0xff;
  }

  /**
   * Pulls (pops) a byte from the stack
   * Stack Pointer increments before pull
   * @returns 8-bit value pulled from stack
   */
  private pullByteFromStack(): number {
    this.SP = (this.SP + 1) & 0xff;
    return this.readByte(0x100 | this.SP);
  }

  private isPpuDataRegisterAlias(address: number): boolean {
    return address >= 0x2000 && address < 0x4000 && (address & 7) === 7;
  }

  /**
   * Checks if two addresses are in different pages (crossed page boundary)
   * @param a - First address
   * @param b - Second address
   * @returns True if addresses are in different pages
   */
  private isPageBoundaryCrossed(a: number, b: number): boolean {
    return (a & 0xff00) !== (b & 0xff00);
  }

  /**
   * Triggers a Non-Maskable Interrupt (NMI)
   */
  public triggerNMI() {
    this.interrupts.requestNmi(true);
  }

  public setNmiLine(asserted: boolean): void {
    this.interrupts.setNmiLine(asserted);
  }

  public sampleNmiLine(): void {
    this.interrupts.sampleNmiLine();
  }

  /**
   * Triggers an Interrupt Request (IRQ)
   */
  public triggerIRQ() {
    this.interrupts.requestIrq();
  }

  public setIRQLine(asserted: boolean): void {
    this.interrupts.setIrqLine(asserted);
  }

  /** Captures the physical IRQ line at the CPU's instruction polling point. */
  public sampleIRQLine(allowDeferredBranchSample = false): void {
    this.interrupts.sampleIrqLine(allowDeferredBranchSample);
  }

  /** Advances a CPU-owned cycle while DMA has control of the external bus. */
  public clockDmaCycle(): number {
    this.interruptPolledThisCycle = false;
    this.interrupts.beginCpuUpdate();
    this.cpuCycles++;
    return 1;
  }

  /** Samples interrupt lines after PPU/APU clocks for a DMA-owned CPU cycle. */
  public finishDmaCycle(): void {
    this.interrupts.captureIrqDuringDma();
  }

  /**
   * Performs comparison operation and sets appropriate flags
   * Used by CMP, CPX, and CPY instructions
   * @param a - First value to compare
   * @param b - Second value to compare
   */
  private compareValues(a: number, b: number) {
    this.P.ZN = a - b;
    this.P.C = a >= b;
  }

  /** Applies the 2A03 reset-line state without treating it as a cold boot. */
  public reset(): void {
    this.SP = (this.SP - 3) & 0xff;
    this.P.reset();
    this.enterResetVector();
  }

  /** Applies this emulator's deterministic 2A03 cold-start policy. */
  public powerOn(): void {
    this.A = this.X = this.Y = 0;
    this.SP = 0xfd;
    this.P.powerOn();
    this.enterResetVector();
  }

  private enterResetVector(): void {
    this.interrupts.reset(this.P.I);
    this.interruptEntry = undefined;
    this.activeInstruction = undefined;
    this.indexedReadResult = undefined;
    this.rmwExecution = undefined;
    this.interruptPolledThisCycle = false;
    this.cpuCycles = 0;
    this.halted = false;
    this.PC = this.readWord(0xfffc);
  }

  /** Executes one complete instruction/interrupt step through the cycle engine. */
  public update(): number {
    const cpuCycles = this.cpuCycles;
    this.clock();
    while (this.activeInstruction || this.interruptEntry) this.clock();
    return this.cpuCycles - cpuCycles;
  }

  /** Advances one cycle for migrated instructions and falls back atomically for the remainder. */
  public clock(): number {
    this.interruptPolledThisCycle = false;
    this.interrupts.beginCpuUpdate();
    if (this.activeInstruction) return this.clockActiveInstruction();

    const nonInstructionCycle = this.clockNonInstructionState();
    if (nonInstructionCycle !== undefined) return nonInstructionCycle;

    const interruptDisableBeforeInstruction = this.P.I;
    const cpuCycles = this.cpuCycles;
    const opcode = this.readByte(this.PC);
    const instruction = getInstruction(opcode);
    const cyclePlan = createInstructionCyclePlan(instruction);
    if (!this.startInstructionCycle(cyclePlan, opcode, interruptDisableBeforeInstruction)) {
      this.PC = (this.PC + 1) & 0xffff;
      this.startInterruptEntry("brk");
      this.cpuCycles++;
      return this.cpuCycles - cpuCycles;
    }

    this.PC = (this.PC + 1) & 0xffff;
    this.cpuCycles++;
    return this.cpuCycles - cpuCycles;
  }

  private clockNonInstructionState(): number | undefined {
    if (this.halted) {
      this.interrupts.captureIrqWhileHalted();
      this.cpuCycles++;
      return 1;
    }

    if (this.interruptEntry) return this.clockInterruptEntry();

    // NMI has priority; a masked IRQ remains pending until it can be serviced.
    if (this.interrupts.takeNmiForInstruction()) {
      this.startInterruptEntry("nmi");
      return this.clockInterruptEntry();
    } else if (this.interrupts.takeIrqForInstruction()) {
      this.startInterruptEntry("irq");
      return this.clockInterruptEntry();
    }

    return undefined;
  }

  private clockActiveInstruction(): number {
    const state = this.activeInstruction;
    if (!state) return 0;
    const cpuCycles = this.cpuCycles;
    switch (state.kind) {
      case "implied":
        this.clockImpliedInstruction(state);
        break;
      case "branch":
        this.clockBranchInstruction(state);
        break;
      case "memory":
        this.clockMemoryInstruction(state);
        break;
      case "rmw":
        this.clockReadModifyWriteInstruction(state);
        break;
      case "stack":
        this.clockStackInstruction(state);
        break;
      case "control-flow":
        this.clockControlFlowInstruction(state);
        break;
    }
    this.cpuCycles++;
    return this.cpuCycles - cpuCycles;
  }

  private startInstructionCycle(
    plan: InstructionCyclePlan,
    opcode: number,
    interruptDisableBeforeInstruction: boolean,
  ): boolean {
    const base = { opcode, interruptDisableBeforeInstruction } as const;
    switch (plan.kind) {
      case "brk":
        return false;
      case "implied":
        this.activeInstruction = { ...base, kind: "implied" };
        return true;
      case "branch":
        this.activeInstruction = {
          ...base,
          kind: "branch",
          cycle: new CpuBranchCycle(this.isBranchTaken(opcode)),
        };
        return true;
      case "memory":
        if (plan.operation === InstructionMemoryOperation.ReadModifyWrite) {
          this.activeInstruction = {
            ...base,
            kind: "rmw",
            addressCycle: new CpuMemoryCycle(plan.cycle, plan.index === "x" ? this.X : this.Y),
          };
          return true;
        }
        this.activeInstruction = {
          ...base,
          kind: "memory",
          cycle: new CpuMemoryCycle(plan.cycle, plan.index === "x" ? this.X : this.Y),
        };
        return true;
      case "stack":
        this.activeInstruction = {
          ...base,
          kind: "stack",
          operation: plan.operation,
          cycle:
            plan.operation === "pha"
              ? CpuStackCycle.push(this.A)
              : plan.operation === "php"
                ? CpuStackCycle.push(this.P.flags | 0x10)
                : CpuStackCycle.pull(),
        };
        return true;
      case "control-flow":
        this.activeInstruction = {
          ...base,
          kind: "control-flow",
          cycle: new CpuControlFlowCycle(plan.operation),
        };
        return true;
    }
  }

  private clockImpliedInstruction(state: ActiveInstructionCycle & { kind: "implied" }): void {
    this.readByte(this.PC);
    this.executeCycleInstruction(state.opcode, 0);
    this.completeActiveInstruction(state);
  }

  private clockBranchInstruction(state: ActiveInstructionCycle & { kind: "branch" }): void {
    if (state.cycle.pollsBeforeCurrentCycle) {
      this.finishInstructionPolling(state.opcode, state.interruptDisableBeforeInstruction);
    }
    const result = state.cycle.clock(this.interruptEntryPort);
    if (result) this.activeInstruction = undefined;
  }

  private clockMemoryInstruction(state: ActiveInstructionCycle & { kind: "memory" }): void {
    const instruction = getInstruction(state.opcode);
    const completed = state.cycle.clock({
      readByte: (address) => this.readByte(address),
      dummyRead: (address, effectiveAddress) =>
        this.performCycleDummyRead(address, effectiveAddress, instruction.memoryOperation),
      execute: (address) =>
        this.executeCycleInstruction(state.opcode, address, state.cycle.indexedDummyReadWasHalted),
      getProgramCounter: () => this.PC,
      setProgramCounter: (value) => {
        this.PC = value & 0xffff;
      },
    });
    if (completed) this.completeActiveInstruction(state);
  }

  private clockReadModifyWriteInstruction(state: ActiveInstructionCycle & { kind: "rmw" }): void {
    const dataPort = {
      readByte: (address: number) => this.readByte(address),
      writeByte: (address: number, value: number) => this.writeByte(address, value),
    };
    if (state.dataCycle) {
      const value = state.dataCycle.clock(dataPort);
      if (value !== undefined) this.completeActiveInstruction(state);
      return;
    }

    state.addressCycle.clock({
      readByte: (address) => this.readByte(address),
      dummyRead: (address) => {
        this.readByte(address);
        return this.memory.lastCpuReadWasHalted;
      },
      execute: (address) => {
        const dataCycle = new CpuReadModifyWriteCycle(address, (previousValue) =>
          this.executeReadModifyWriteInstruction(state.opcode, address, previousValue),
        );
        state.dataCycle = dataCycle;
        dataCycle.clock(dataPort);
      },
      getProgramCounter: () => this.PC,
      setProgramCounter: (value) => {
        this.PC = value & 0xffff;
      },
    });
  }

  private executeReadModifyWriteInstruction(
    opcode: number,
    address: number,
    previousValue: number,
  ): number {
    const execution: {
      address: number;
      previousValue: number;
      transformedValue?: number;
    } = { address: address & 0xffff, previousValue: previousValue & 0xff };
    this.rmwExecution = execution;
    try {
      this.executeCycleInstruction(opcode, address);
    } finally {
      this.rmwExecution = undefined;
    }
    if (execution.transformedValue === undefined) {
      throw new Error(`RMW opcode $${opcode.toString(16).padStart(2, "0")} did not transform data`);
    }
    return execution.transformedValue;
  }

  private clockStackInstruction(state: ActiveInstructionCycle & { kind: "stack" }): void {
    const result = state.cycle.clock({
      readByte: (address) => this.readByte(address),
      pushByte: (value) => this.pushByteToStack(value),
      pullByte: () => this.pullByteFromStack(),
      getProgramCounter: () => this.PC,
    });
    if (!result) return;
    if (result.kind === "pulled" && state.operation === "pla") {
      this.A = result.value;
      this.P.ZN = this.A;
    } else if (result.kind === "pulled" && state.operation === "plp") {
      this.P.flags = result.value;
    }
    this.completeActiveInstruction(state);
  }

  private clockControlFlowInstruction(
    state: ActiveInstructionCycle & { kind: "control-flow" },
  ): void {
    const completed = state.cycle.clock({
      readByte: (address) => this.readByte(address),
      pushByte: (value) => this.pushByteToStack(value),
      pullByte: () => this.pullByteFromStack(),
      getProgramCounter: () => this.PC,
      setProgramCounter: (value) => {
        this.PC = value & 0xffff;
      },
      setProcessorFlags: (value) => {
        this.P.flags = value;
      },
    });
    if (completed) this.completeActiveInstruction(state);
  }

  private executeCycleInstruction(
    opcode: number,
    address: number,
    indexedDummyReadHalted = false,
  ): void {
    const instruction = getInstruction(opcode);
    this.instructionExecutors[opcode].call(this, {
      address,
      pc: this.PC,
      addressingMode: instruction.addressingMode,
      indexedDummyReadHalted,
    });
    this.indexedReadResult = undefined;
  }

  private completeActiveInstruction(state: ActiveInstructionCycle): void {
    this.activeInstruction = undefined;
    this.finishInstructionPolling(state.opcode, state.interruptDisableBeforeInstruction);
  }

  private performCycleDummyRead(
    address: number,
    effectiveAddress: number,
    operation: InstructionMemoryOperation,
  ): boolean {
    const value = this.readByte(address);
    const readWasHalted = this.memory.lastCpuReadWasHalted;
    if (
      operation === InstructionMemoryOperation.Read &&
      this.isPpuDataRegisterAlias(address) &&
      this.isPpuDataRegisterAlias(effectiveAddress)
    ) {
      this.indexedReadResult = { address: effectiveAddress, value };
    }
    return readWasHalted;
  }

  private isBranchTaken(opcode: number): boolean {
    switch (opcode) {
      case 0x10:
        return !this.P.N;
      case 0x30:
        return this.P.N;
      case 0x50:
        return !this.P.V;
      case 0x70:
        return this.P.V;
      case 0x90:
        return !this.P.C;
      case 0xb0:
        return this.P.C;
      case 0xd0:
        return !this.P.Z;
      case 0xf0:
        return this.P.Z;
      default:
        throw new Error(`Opcode $${opcode.toString(16).padStart(2, "0")} is not a branch`);
    }
  }

  private finishInstructionPolling(
    opcode: number,
    interruptDisableBeforeInstruction: boolean,
  ): void {
    // These instructions update I after their interrupt poll, so the value
    // from before the instruction remains effective for the next poll.
    this.interrupts.setIrqPollingDisabled(
      opcode === 0x28 || opcode === 0x58 || opcode === 0x78
        ? interruptDisableBeforeInstruction
        : this.P.I,
    );
    this.sampleIRQLine();
    this.interruptPolledThisCycle = true;
  }

  private startInterruptEntry(kind: CpuInterruptEntryKind): void {
    this.interruptEntry = new CpuInterruptEntry(kind);
  }

  private clockInterruptEntry(): number {
    const entry = this.interruptEntry;
    if (!entry) return 0;
    const cpuCycles = this.cpuCycles;

    if (entry.clock(this.interruptEntryPort)) this.finishInterruptEntry();
    this.cpuCycles++;
    return this.cpuCycles - cpuCycles;
  }

  private finishInterruptEntry(): void {
    this.interruptEntry = undefined;
    this.interrupts.finishInterruptEntry(this.P.I);
    this.interruptPolledThisCycle = true;
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
    this.A = this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  /**
   * Load register X from memory.
   * @param ctx
   * @constructor
   */
  private LDX(ctx: InstructionExecutionContext) {
    this.X = this.readByte(ctx.address);
    this.P.ZN = this.X;
  }

  /**
   * Load register Y from memory.
   * @param ctx
   * @constructor
   */
  private LDY(ctx: InstructionExecutionContext) {
    this.Y = this.readByte(ctx.address);
    this.P.ZN = this.Y;
  }

  /**
   * Store accumulator (A) into memory.
   * @param ctx
   * @constructor
   */
  private STA(ctx: InstructionExecutionContext) {
    this.writeByte(ctx.address, this.A);
  }

  /**
   * Store register X into memory.
   * @param ctx
   * @constructor
   */
  private STX(ctx: InstructionExecutionContext) {
    this.writeByte(ctx.address, this.X);
  }

  /**
   * Store register Y into memory.
   * @param ctx
   * @constructor
   */
  private STY(ctx: InstructionExecutionContext) {
    this.writeByte(ctx.address, this.Y);
  }

  /**
   * Transfer accumulator (A) to register X.
   * @param _
   * @constructor
   */ private TAX(_: InstructionExecutionContext) {
    this.X = this.A;
    this.P.ZN = this.X;
  }

  /**
   * Transfer accumulator (A) to register Y.
   * @param _
   * @constructor
   */ private TAY(_: InstructionExecutionContext) {
    this.Y = this.A;
    this.P.ZN = this.Y;
  }

  /**
   * Transfer register X to accumulator (A).
   * @param _
   * @constructor
   */ private TXA(_: InstructionExecutionContext) {
    this.A = this.X;
    this.P.ZN = this.A;
  }

  /**
   * Transfer register Y to accumulator (A).
   * @param _
   * @constructor
   */ private TYA(_: InstructionExecutionContext) {
    this.A = this.Y;
    this.P.ZN = this.A;
  }

  /**
   * Transfer stack pointer (SP) to register X.
   * @param _
   * @constructor
   */ private TSX(_: InstructionExecutionContext) {
    this.X = this.SP;
    this.P.ZN = this.X;
  }

  /**
   * Transfer register X to stack pointer (SP).
   * @param _
   * @constructor
   */ private TXS(_: InstructionExecutionContext) {
    this.SP = this.X;
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
    this.addWithCarry(this.readByte(ctx.address));
  }

  private addWithCarry(value: number): void {
    const a = this.A;
    const b = value & 0xff;
    const c = this.P.C ? 1 : 0;
    const abc = a + b + c;
    this.A = abc & 0xff;
    this.P.ZN = this.A;
    this.P.C = abc > 0xff;
    this.P.V = ((a ^ b) & 0x80) == 0 && ((a ^ this.A) & 0x80) != 0;
  }

  /**
   * Subtract with carry (Accumulator - Operand - Borrow).
   * @param ctx
   * @constructor
   */
  private SBC(ctx: InstructionExecutionContext) {
    this.subtractWithCarry(this.readByte(ctx.address));
  }

  private subtractWithCarry(value: number): void {
    const a = this.A;
    const b = value & 0xff;
    const c = this.P.C ? 1 : 0;
    const abc = a - b - (1 - c);
    this.A = abc & 0xff;
    this.P.ZN = this.A;
    this.P.C = abc >= 0;
    this.P.V = ((a ^ b) & 0x80) != 0 && ((a ^ this.A) & 0x80) != 0;
  }

  /**
   * Increment memory by 1.
   * @param ctx
   * @constructor
   */
  private INC(ctx: InstructionExecutionContext): number {
    const value = this.readModifyWrite(ctx.address, (previousValue) => previousValue + 1);
    this.P.ZN = value;
    return value;
  }

  /**
   * Increment register X by 1.
   * @param _
   * @constructor
   */ private INX(_: InstructionExecutionContext) {
    this.X = (this.X + 1) & 0xff;
    this.P.ZN = this.X;
  }

  /**
   * Increment register Y by 1.
   * @param _
   * @constructor
   */ private INY(_: InstructionExecutionContext) {
    this.Y = (this.Y + 1) & 0xff;
    this.P.ZN = this.Y;
  }

  /**
   * Decrement memory by 1.
   * @param ctx
   * @constructor
   */
  private DEC(ctx: InstructionExecutionContext): number {
    const value = this.readModifyWrite(ctx.address, (previousValue) => previousValue - 1);
    this.P.ZN = value;
    return value;
  }

  /**
   * Decrement register X by 1.
   * @param _
   * @constructor
   */ private DEX(_: InstructionExecutionContext) {
    this.X = (this.X - 1) & 0xff;
    this.P.ZN = this.X;
  }

  /**
   * Decrement register Y by 1.
   * @param _
   * @constructor
   */ private DEY(_: InstructionExecutionContext) {
    this.Y = (this.Y - 1) & 0xff;
    this.P.ZN = this.Y;
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
    this.A = this.A & this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  /**
   * Logical OR (Accumulator & Operand).
   * @param ctx
   * @constructor
   */
  private ORA(ctx: InstructionExecutionContext) {
    this.A = this.A | this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  /**
   * Exclusive OR (Accumulator ^ Operand).
   * @param ctx
   * @constructor
   */
  private EOR(ctx: InstructionExecutionContext) {
    this.A = this.A ^ this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  /**
   * Test bits in memory (affects zero, overflow flags).
   * @param ctx
   * @constructor
   */
  private BIT(ctx: InstructionExecutionContext) {
    const value = this.readByte(ctx.address);
    this.P.V = !!((value >> 6) & 1);
    this.P.Z = value & this.A;
    this.P.N = value;
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
  private ASL(ctx: InstructionExecutionContext): number {
    if (ctx.addressingMode === AddressingMode.Accumulator) {
      this.P.C = !!((this.A >> 7) & 1);
      this.A = (this.A << 1) & 0xff;
      this.P.ZN = this.A;
      return this.A;
    } else {
      let carry = false;
      const value = this.readModifyWrite(ctx.address, (previousValue) => {
        carry = (previousValue & 0x80) !== 0;
        return previousValue << 1;
      });
      this.P.C = carry;
      this.P.ZN = value;
      return value;
    }
  }

  /**
   * Logical shift right (Divide by 2).
   * @param ctx
   * @constructor
   */
  private LSR(ctx: InstructionExecutionContext): number {
    if (ctx.addressingMode == AddressingMode.Accumulator) {
      this.P.C = !!(this.A & 1);
      this.A >>= 1;
      this.P.ZN = this.A;
      return this.A;
    } else {
      let carry = false;
      const value = this.readModifyWrite(ctx.address, (previousValue) => {
        carry = (previousValue & 1) !== 0;
        return previousValue >> 1;
      });
      this.P.C = carry;
      this.P.ZN = value;
      return value;
    }
  }

  /**
   * Rotate left through the carry flag.
   * @param ctx
   * @constructor
   */
  private ROL(ctx: InstructionExecutionContext): number {
    if (ctx.addressingMode == AddressingMode.Accumulator) {
      const c = this.P.C ? 1 : 0;
      this.P.C = !!((this.A >> 7) & 1);
      this.A = ((this.A << 1) | c) & 0xff;
      this.P.ZN = this.A;
      return this.A;
    } else {
      const c = this.P.C ? 1 : 0;
      let carry = false;
      const value = this.readModifyWrite(ctx.address, (previousValue) => {
        carry = (previousValue & 0x80) !== 0;
        return (previousValue << 1) | c;
      });
      this.P.C = carry;
      this.P.ZN = value;
      return value;
    }
  }

  /**
   * Rotate right through the carry flag.
   * @param ctx
   * @constructor
   */
  private ROR(ctx: InstructionExecutionContext): number {
    if (ctx.addressingMode == AddressingMode.Accumulator) {
      const c = this.P.C ? 1 : 0;
      this.P.C = !!(this.A & 1);
      this.A = (this.A >> 1) | (c << 7);
      this.P.ZN = this.A;
      return this.A;
    } else {
      const c = this.P.C ? 1 : 0;
      let carry = false;
      const value = this.readModifyWrite(ctx.address, (previousValue) => {
        carry = (previousValue & 1) !== 0;
        return (previousValue >> 1) | (c << 7);
      });
      this.P.C = carry;
      this.P.ZN = value;
      return value;
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
  private CLC(_: InstructionExecutionContext) {
    this.P.C = false;
  }

  /**
   * Set carry flag (C = 1).
   * @param _
   * @constructor
   */ private SEC(_: InstructionExecutionContext) {
    this.P.C = true;
  }

  /**
   * Clear decimal mode (D = 0).
   * @param _
   * @constructor
   */ private CLD(_: InstructionExecutionContext) {
    this.P.D = false;
  }

  /**
   * Set decimal mode (D = 1).
   * @param _
   * @constructor
   */ private SED(_: InstructionExecutionContext) {
    this.P.D = true;
  }

  /**
   * Clear interrupt disable flag (I = 0).
   * @param _
   * @constructor
   */ private CLI(_: InstructionExecutionContext) {
    this.P.I = false;
  }

  /**
   * Set interrupt disable flag (I = 1).
   * @param _
   * @constructor
   */ private SEI(_: InstructionExecutionContext) {
    this.P.I = true;
  }

  /**
   * Clear overflow flag (V = 0).
   * @param _
   * @constructor
   */ private CLV(_: InstructionExecutionContext) {
    this.P.V = false;
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
    const value = this.readByte(ctx.address);
    this.compareValues(this.A, value);
  }

  /**
   * Compare the X register with the operand.
   * Sets the carry flag if X gt operand (X >= operand).
   * @param ctx
   * @constructor
   */
  private CPX(ctx: InstructionExecutionContext) {
    const value = this.readByte(ctx.address);
    this.compareValues(this.X, value);
  }

  /**
   * Compare the Y register with the operand.
   * Sets the carry flag if Y gt operand (Y >= operand).
   * @param ctx
   * @constructor
   */
  private CPY(ctx: InstructionExecutionContext) {
    const value = this.readByte(ctx.address);
    this.compareValues(this.Y, value);
  }

  private cycleManagedInstruction(_: InstructionExecutionContext): never {
    throw new Error("Cycle-managed instructions cannot use the semantic executor table");
  }

  /**
   * -----------No-Operation Instruction-----------
   * Used for delaying or placeholder operations.
   * No operation (takes one cycle).
   * @param ctx
   * @constructor
   */
  private NOP(ctx: InstructionExecutionContext) {
    if (
      ctx.addressingMode !== AddressingMode.Implied &&
      ctx.addressingMode !== AddressingMode.Accumulator
    ) {
      this.readByte(ctx.address);
    }
  }

  /**
   * ------------------Illegal (Unofficial) Instructions--------------------
   * The MOS 6502 has several undocumented "illegal instructions,"
   * which vary by hardware implementation and are not officially supported.
   */

  private AHX(ctx: InstructionExecutionContext) {
    this.writeUnstableStore(ctx.address, this.Y, this.A & this.X, ctx.indexedDummyReadHalted);
  }

  private ALR(ctx: InstructionExecutionContext) {
    this.A &= this.readByte(ctx.address);
    this.P.C = (this.A & 1) !== 0;
    this.A >>= 1;
    this.P.ZN = this.A;
  }

  private ANC(ctx: InstructionExecutionContext) {
    this.A &= this.readByte(ctx.address);
    this.P.ZN = this.A;
    this.P.C = this.P.N;
  }

  private ARR(ctx: InstructionExecutionContext) {
    const carry = this.P.C ? 0x80 : 0;
    this.A = ((this.A & this.readByte(ctx.address)) >> 1) | carry;
    this.P.ZN = this.A;
    this.P.C = (this.A & 0x40) !== 0;
    this.P.V = ((this.A >> 6) & 1) !== ((this.A >> 5) & 1);
  }

  private AXS(ctx: InstructionExecutionContext) {
    const left = this.A & this.X;
    const right = this.readByte(ctx.address);
    this.X = (left - right) & 0xff;
    this.P.C = left >= right;
    this.P.ZN = this.X;
  }

  private DCP(ctx: InstructionExecutionContext) {
    this.compareValues(this.A, this.DEC(ctx));
  }

  private ISC(ctx: InstructionExecutionContext) {
    this.subtractWithCarry(this.INC(ctx));
  }

  private KIL(_: InstructionExecutionContext) {
    this.halted = true;
  }

  private LAS(ctx: InstructionExecutionContext) {
    const value = this.readByte(ctx.address) & this.SP;
    this.A = this.X = this.SP = value;
    this.P.ZN = value;
  }

  private LAX(ctx: InstructionExecutionContext) {
    this.A = this.X = this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  private RLA(ctx: InstructionExecutionContext) {
    this.A &= this.ROL(ctx);
    this.P.ZN = this.A;
  }

  private RRA(ctx: InstructionExecutionContext) {
    this.addWithCarry(this.ROR(ctx));
  }

  private SAX(ctx: InstructionExecutionContext) {
    this.writeByte(ctx.address, this.A & this.X);
  }

  private SHX(ctx: InstructionExecutionContext) {
    this.writeUnstableStore(ctx.address, this.Y, this.X, ctx.indexedDummyReadHalted);
  }

  private SHY(ctx: InstructionExecutionContext) {
    this.writeUnstableStore(ctx.address, this.X, this.Y, ctx.indexedDummyReadHalted);
  }

  private SLO(ctx: InstructionExecutionContext) {
    this.A |= this.ASL(ctx);
    this.P.ZN = this.A;
  }

  private SRE(ctx: InstructionExecutionContext) {
    this.A ^= this.LSR(ctx);
    this.P.ZN = this.A;
  }

  private TAS(ctx: InstructionExecutionContext) {
    this.SP = this.A & this.X;
    this.writeUnstableStore(ctx.address, this.Y, this.SP, ctx.indexedDummyReadHalted);
  }

  private XAA(ctx: InstructionExecutionContext) {
    this.A = this.X & this.readByte(ctx.address);
    this.P.ZN = this.A;
  }

  private writeUnstableStore(
    effectiveAddress: number,
    index: number,
    value: number,
    indexedDummyReadHalted: boolean,
  ): void {
    const baseAddress = (effectiveAddress - index) & 0xffff;
    const highByteMask = ((baseAddress >> 8) + 1) & 0xff;
    const storedValue = indexedDummyReadHalted ? value : value & highByteMask;
    const corruptedHighByte = value & highByteMask;
    const address = this.isPageBoundaryCrossed(baseAddress, effectiveAddress)
      ? (corruptedHighByte << 8) | (effectiveAddress & 0xff)
      : effectiveAddress;
    this.writeByte(address, storedValue);
  }

  private validateSnapshot(snapshot: CpuSnapshot): void {
    const registers = snapshot.registers;
    if (
      !isByte(registers.A) ||
      !isByte(registers.X) ||
      !isByte(registers.Y) ||
      !isWord(registers.PC) ||
      !isByte(registers.SP) ||
      !isByte(registers.P)
    ) {
      throw new RangeError("CPU save state contains an invalid register");
    }
    if (!isByte(snapshot.internalDataBus) || !isByte(snapshot.externalDataBus)) {
      throw new RangeError("CPU save state contains an invalid data-bus latch");
    }
    if (!Number.isSafeInteger(snapshot.cpuCycles) || snapshot.cpuCycles < 0) {
      throw new RangeError("CPU save state contains an invalid cycle count");
    }
    if (snapshot.interruptEntry && snapshot.activeInstruction) {
      throw new Error("CPU save state cannot contain both an instruction and interrupt entry");
    }
    if (
      snapshot.indexedReadResult &&
      (!isWord(snapshot.indexedReadResult.address) || !isByte(snapshot.indexedReadResult.value))
    ) {
      throw new RangeError("CPU save state contains an invalid indexed-read latch");
    }
    const active = snapshot.activeInstruction;
    if (
      active &&
      (!isByte(active.opcode) || typeof active.interruptDisableBeforeInstruction !== "boolean")
    ) {
      throw new RangeError("CPU save state contains an invalid active instruction");
    }
  }
}

export default CPU;
