# CPU subsystem

`@fcemu/core` models the console's RP2A03 as an NMOS 6502 core clocked one external bus cycle at a
time. `domain/emulation/cpu.ts` owns the register file, the ALU/store semantics of all 256 opcodes
and the single `clock()` execution engine; the `cpu/` submodule isolates the immutable instruction
table, the interrupt state machine and the per-family micro-cycle objects that schedule addressing,
dummy reads, read/write-old/write-new sequences, branches, stack transfers and control flow. Every
executing sub-state is captured in a typed snapshot, so the engine can be saved and restored between
any two bus cycles. Behaviour follows the [MOS MCS6500 programming
manual](https://www.bitsavers.org/components/mosTechnology/6500-50A_MCS6500pgmManJan76.pdf) for the
programming model and the NESdev [CPU](https://www.nesdev.org/wiki/CPU),
[status flags](https://www.nesdev.org/wiki/Status_flags),
[CPU addressing modes](https://www.nesdev.org/wiki/CPU_addressing_modes),
[unofficial opcodes](https://www.nesdev.org/wiki/CPU_unofficial_opcodes) and
[interrupt](https://www.nesdev.org/wiki/Interrupts) pages for cycle-level detail.

## Register file

The core holds the six architectural registers directly on the `CPU` class. `A`, `X`, `Y` and `SP`
are masked to 8 bits and `PC` to 16 bits on every mutating path; `P` is a `ProcessorStatus` object
rather than a raw byte.

| Register | Width      | Power-on value | Reset behaviour         | Notes                        |
| -------- | ---------- | -------------- | ----------------------- | ---------------------------- |
| `A`      | 8-bit      | `0x00`         | preserved               | accumulator                  |
| `X`      | 8-bit      | `0x00`         | preserved               | index register               |
| `Y`      | 8-bit      | `0x00`         | preserved               | index register               |
| `PC`     | 16-bit     | `[$FFFC]`      | reloaded from `[$FFFC]` | program counter              |
| `SP`     | 8-bit      | `0xFD`         | `SP -= 3`               | stack lives in `$0100-$01FF` |
| `P`      | 8-bit view | `0x24`         | only `I` forced high    | six physical latches         |

The stack helpers `pushByteToStack` write to `$0100 | SP` then post-decrement `SP`;
`pullByteFromStack` pre-increments `SP` then reads `$0100 | SP`. `readWord` composes a little-endian
16-bit value from two `readByte` calls. `state` / `set state` expose the flat `CPUState`
(`A/X/Y/PC/SP/P`) used by the debugger and save state; assigning `state` re-derives the IRQ polling
mask from the restored `I` bit.

## Processor status

`ProcessorStatus` (`cpu/processor-status.ts`) stores six independent boolean latches — `C`, `I`, `D`,
`V` plus private `zero`/`negative` — and never keeps a raw status byte. `Z` and `N` are set from
result values (`Z` true when the value is `0`, `N` from bit 7); the `ZN` setter applies both at once.
Comparisons (`CMP`/`CPX`/`CPY`) and `compareValues` set `Z`/`N` from `a - b` and `C` from `a >= b`.

| Bit | Mask   | Field            | Meaning                            |
| --- | ------ | ---------------- | ---------------------------------- |
| 0   | `0x01` | `C`              | carry                              |
| 1   | `0x02` | `Z` (`zero`)     | zero result                        |
| 2   | `0x04` | `I`              | IRQ disable                        |
| 3   | `0x08` | `D`              | decimal mode latch (see note)      |
| 4   | `0x10` | —                | B, stack-only, synthesized on push |
| 5   | `0x20` | —                | unused, canonicalized high         |
| 6   | `0x40` | `V`              | overflow                           |
| 7   | `0x80` | `N` (`negative`) | negative result                    |

The `flags` getter projects the six latches into the canonical byte, forcing bit 5 high
(`UNUSED_STACK_BIT = 0x20`) and leaving bit 4 low. The `flags` setter restores only the six physical
latches and discards bits 4 and 5, so `PLP`, `RTI` and save-state restore never carry debugger-only
B/U state into the core. `powerOn()` writes `0x24` (`I` set, all arithmetic flags clear); `reset()`
raises only `I` and preserves `C/Z/D/V/N`.

The stack-only B bit (bit 4) is synthesized at each push boundary rather than stored:

- `PHP` pushes `P.flags | 0x10` and BRK pushes `P.flags | 0x10` — both drive B **high**.
- Hardware IRQ/NMI entry pushes `P.flags & 0xEF` — B **low**, bit 5 still high.
- `PLP` and `RTI` mask the pulled byte back through the setter, so both non-latched bits are ignored.

`D` is a real latch toggled by `CLD`/`SED`, but `addWithCarry`/`subtractWithCarry` compute binary
results unconditionally; the 2A03 has no BCD adder, so decimal mode has no arithmetic effect here.
`V` after `ADC`/`SBC` is derived from the sign-agreement test rather than a carry-chain bit.

## CPU data buses

`CPUMemory` (`domain/emulation/memory.ts`) owns the RP2A03's two byte-wide data paths as
`internalDataBus` and `externalDataBus`, following [open bus
behaviour](https://www.nesdev.org/wiki/Open_bus_behavior). An ordinary CPU read
(`readFullyDriven`) drives both latches; a CPU write drives both; a DMA fetch (`readForDma`) drives
only the external pins and leaves the internal latch intact. Unmapped and write-only I/O reads
(`$4000-$4014`, plus an undecoded `$4018-$5FFF`) return the retained external byte (`readOpenBus`);
an optional mapper expansion result may instead drive selected lines in the latter range. The
controller ports `$4016`/`$4017` replace only bits 0–4 (`readPartiallyDriven`, mask `0x1F`) and keep
external bits 5–7. `$4015` is the inverse boundary — its status byte takes floating bit 5 from the
internal bus, updates only the internal latch and never refreshes the external pins — which is what
lets a DMC fetch land between an operand read and a `$4015` access without corrupting either
([APU status](<https://www.nesdev.org/wiki/APU#Status_($4015)>)).

`CPU.readByte` layers one extra concern on top of `memory.read`: an _indexed-read latch_
(`indexedReadResult`). When an indexed dummy read and its effective address both alias a PPUDATA
register (`$2000-$3FFF` with `addr & 7 === 7`), `performCycleDummyRead` records `{address, value}`;
the following real read of that address returns the latched value instead of issuing a second
side-effecting PPU read. `lastCpuReadWasHalted` reports whether `/RDY` (a DMA halt) stretched the
most recent CPU read, which the indexed-write unstable-store logic consumes.

## Execution engine: `clock()` vs `update()`

`clock()` is the only execution path. Each call:

1. clears `interruptPolledThisCycle` and calls `interrupts.beginCpuUpdate()`;
2. if an instruction is active, advances exactly one of its micro-cycles;
3. otherwise handles halt / pending interrupt entry / newly-recognized NMI or IRQ;
4. otherwise fetches the opcode at `PC`, builds an `InstructionCyclePlan`, installs the matching
   active-instruction state and advances `PC`.

Every branch of `clock()` increments `cpuCycles` once and returns the delta (always `1`). `update()`
is a thin instruction/debug facade: it records `cpuCycles`, calls `clock()` once, then loops
`clock()` while `activeInstruction || interruptEntry` remain, and returns the total cycles consumed.
`update()` owns no decoder, addressing or dummy-read logic — it merely runs the same engine to the
next instruction boundary.

The active-instruction state is a discriminated union (`ActiveInstructionCycle`) over
`implied | branch | memory | rmw | stack | control-flow`, each carrying the cycle object(s) for its
family plus the opcode and the pre-instruction `I` value. Opcodes that are fully cycle-managed point
at a `cycleManagedInstruction` guard in the semantic executor table that throws if ever invoked,
preventing a second execution path from being reintroduced.

## Instruction cycle plan

`createInstructionCyclePlan` (`cpu/instruction-cycle-plan.ts`) classifies every opcode into one of six
families from its immutable metadata. Dedicated opcode maps win first, then the addressing mode and
memory operation select the memory-family cycle kind and index register.

| Family         | Selection                                                          | Cycle object                                           |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `brk`          | opcode `0x00`                                                      | falls to `CpuInterruptEntry` (`"brk"`)                 |
| `stack`        | `0x08` PHP, `0x28` PLP, `0x48` PHA, `0x68` PLA                     | `CpuStackCycle`                                        |
| `control-flow` | `0x20` JSR, `0x40` RTI, `0x4C` JMP abs, `0x60` RTS, `0x6C` JMP ind | `CpuControlFlowCycle`                                  |
| `implied`      | Implied/Accumulator with `baseCycles === 2`                        | none (single active cycle)                             |
| `branch`       | Relative                                                           | `CpuBranchCycle`                                       |
| `memory`       | all remaining addressing modes                                     | `CpuMemoryCycle` (+ `CpuReadModifyWriteCycle` for RMW) |

The plan carries the `InstructionMemoryOperation` (`Read` / `Write` / `ReadModifyWrite`) and, for
indexed modes, the index register (`"x"` or `"y"`). Indexed absolute/indirect modes pick a
read-suffixed or write-suffixed cycle kind: reads skip the fixup cycle when no page is crossed, while
writes and RMW always spend it (`indexedCycle`). An opcode that reaches the plan builder without a
family (e.g. a stray non-2-cycle implied form) throws, keeping the classification total.

## Instruction-set table

`cpu/instruction-set.ts` is the isolated opcode authority. It builds a frozen 256-entry
`Instruction[]` from parallel lookup tables — addressing mode, byte length, base cycles, page-boundary
penalty cycles — and a memory-operation classification derived from `MEMORY_WRITE_OPCODES` and
`MEMORY_RMW_OPCODES` sets (everything else is a `Read`). `AddressingMode` and
`InstructionMemoryOperation` are exported enums; `getInstruction(opcode)` range-checks the byte and
returns the shared immutable record. Nothing in this module depends on the `CPU` aggregate, so the
micro-cycle schedulers can consume instruction metadata independently. Both official and NMOS
unofficial opcodes (SLO, RLA, SRE, RRA, DCP, ISC, LAX, SAX, ANC, ALR, ARR, AXS, LAS, XAA, AHX, SHX,
SHY, TAS and the `KIL`/`STP` jams) are present in the executor table.

## Addressing and dummy reads (`CpuMemoryCycle`)

`CpuMemoryCycle` (`cpu/cpu-memory-cycle.ts`) resolves an operand address one external bus cycle at a
time and, at the final cycle, invokes an `execute(address)` callback that runs the CPU's ALU/store
semantics. Cycle counts below are _post-opcode_ cycles; add one for the opcode fetch performed by
`clock()`.

| Kind                     | Addressing modes        | Post-opcode cycles | Dummy read                                  |
| ------------------------ | ----------------------- | ------------------ | ------------------------------------------- |
| `immediate`              | Immediate               | 1                  | none (executes at `PC`, then `PC++`)        |
| `zero-page`              | ZeroPage                | 2                  | none                                        |
| `zero-page-indexed`      | ZeroPageX/Y             | 3                  | at the un-indexed zero-page address         |
| `absolute`               | Absolute                | 3                  | none                                        |
| `absolute-indexed-read`  | AbsoluteX/Y read        | 3 or 4             | wrong-page read only when a page is crossed |
| `absolute-indexed-write` | AbsoluteX/Y write & RMW | 4                  | always a wrong-page read                    |
| `indexed-indirect`       | `(zp,X)`                | 5                  | at the un-indexed zero-page pointer         |
| `indirect-indexed-read`  | `(zp),Y` read           | 4 or 5             | wrong-page read only when a page is crossed |
| `indirect-indexed-write` | `(zp),Y` write & RMW    | 5                  | always a wrong-page read                    |

Indexed addressing computes `effectiveAddress = (base + index) & 0xFFFF` and flags a page crossing
when the high bytes differ (`resolveIndexedAddress`). The dummy read hits `wrongPageAddress`
(`(base & 0xFF00) | (effective & 0x00FF)`) — the un-fixed high byte — reproducing the extra read the
hardware performs before it corrects the page. Zero-page indexing wraps within the page (`& 0xFF`) and
its dummy read observes the un-wrapped pointer. `dummyRead` returns whether `/RDY` stalled that read
and stores it in `indexedDummyReadHalted`, exposed as `indexedDummyReadWasHalted`; the unstable stores
`SHA`/`SHX`/`SHY`/`TAS` (`writeUnstableStore`) drop their `(high + 1)` data mask when the dummy read
was stretched, while the page-cross address-high corruption is applied independently. The
`dummyRead(dummyAddress, effectiveAddress)` port preserves PPUDATA's distinct side-effect vs value
behaviour through the indexed-read latch described above.

## Read-modify-write sequence (`CpuReadModifyWriteCycle`)

RMW opcodes join the `memory` family as a two-phase state: an address cycle resolves the target, then
`CpuReadModifyWriteCycle` (`cpu/cpu-read-modify-write-cycle.ts`) runs the NMOS
read / write-old / write-new data sequence.

1. **read** — capture `previousValue` from the effective address (this reuses the address cycle's
   final `execute` callback, so the initial read is the address cycle's last bus cycle);
2. **write-old** — write the unchanged `previousValue` back;
3. **write-new** — apply the transform once and write the result, returning the new byte.

The transform runs through `executeReadModifyWriteInstruction`, which sets a one-shot `rmwExecution`
record and dispatches the opcode's executor. That executor calls `readModifyWrite`, which is guarded
to run only inside this context and throws otherwise, so ALU semantics apply exactly once on the final
write without re-reading I/O. Composite unofficial RMWs (`SLO`, `RLA`, `SRE`, `RRA`, `DCP`, `ISC`)
layer their accumulator/compare step on the returned byte.

## Branch cycles (`CpuBranchCycle`)

`CpuBranchCycle` (`cpu/cpu-branch-cycle.ts`) is constructed with the taken/not-taken decision from
`isBranchTaken` (which reads the relevant flag for the eight `Bxx` opcodes). It schedules:

- **step 0** — read the signed offset at `PC`, advance `PC`; if not taken, finish immediately;
- **step 1** — taken dummy read at `PC`; if no page is crossed, set `PC = target` and finish;
- **step 2** — page-crossing fixup: dummy read at `wrongPageAddress`, then set `PC = target`.

Branches poll interrupts at explicit boundaries rather than at completion. `pollsBeforeCurrentCycle`
is true before the operand cycle (step 0) and again before the PCH fixup of a page-crossing taken
branch (step 2). `clockBranchInstruction` calls `finishInstructionPolling` at those boundaries and
clears the active state on completion without re-polling. A taken non-crossing branch therefore polls
only once (step 0) and ignores an interrupt asserted during its final dummy cycle. Because
`sampleIrqLine` latches with `||=`, a successful first poll of a page-crossing branch cannot be
revoked by an unsuccessful second poll.

## Stack cycles (`CpuStackCycle`)

`CpuStackCycle` (`cpu/cpu-stack-cycle.ts`) owns the post-opcode bus sequence shared by the four
stack opcodes. A push spends a dummy `PC` read then the push (`PHA`=3, `PHP`=3 total). A pull spends
two dummy `PC` reads then the pull (`PLA`=4, `PLP`=4 total). The pushed byte is prepared in
`startInstructionCycle`: `PHA` pushes `A`, `PHP` pushes `P.flags | 0x10`. On a pull,
`clockStackInstruction` applies the result — `PLA` loads `A` and sets `Z`/`N`, `PLP` writes the byte
through the `P.flags` setter (ignoring B/U). Completion runs the normal instruction poll.

## Control flow (`CpuControlFlowCycle`)

`CpuControlFlowCycle` (`cpu/cpu-control-flow-cycle.ts`) schedules JMP, JSR, RTS and RTI:

- **JMP absolute** (3 cycles): read low, then read high and set `PC`.
- **JMP indirect** (5 cycles): read the 16-bit pointer, read the target low byte, then read the
  target high byte from `(pointer & 0xFF00) | ((pointer + 1) & 0x00FF)`. That high-byte address
  wraps inside the pointer's page, reproducing the NMOS `JMP ($xxFF)` page-boundary bug.
- **JSR** (6 cycles): read the target low byte and advance `PC`, an internal dummy read, push `PCH`
  then `PCL` (the address of JSR's last byte), then read the target high byte and set `PC`.
- **RTS** (6 cycles): two dummy reads, pull `PCL` then `PCH`, then a final read at `PC` with a
  post-increment so execution resumes after the calling `JSR`.
- **RTI** (6 cycles): two dummy reads, pull the status byte (`(byte & 0xEF) | 0x20`, then filtered
  again by the `P.flags` setter), pull `PCL`, then pull `PCH` and set `PC` — no final increment.

## Interrupt handling

Interrupt line state lives in `CpuInterruptState` (`cpu/cpu-interrupt-state.ts`); the entry
micro-sequence lives in `CpuInterruptEntry` (`cpu/cpu-interrupt-entry.ts`). Together they implement
the NESdev [interrupt](https://www.nesdev.org/wiki/Interrupts) model.

### `CpuInterruptState`

The entity owns the physical `/IRQ` line, its sampled polling latch, the software IRQ request, the
I-mask snapshot, the physical `/NMI` input and separate current-edge / previous-cycle NMI latches:

| Field                              | Role                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `irqLineAsserted`                  | physical `/IRQ` level after active-low conversion             |
| `irqLineSampled`                   | sticky polling latch (logical OR with the line at each poll)  |
| `softwareIrqPending`               | one-shot request from `triggerIRQ`/`requestIrq`               |
| `irqPollingDisabled`               | I-mask snapshot used at the poll (starts masked)              |
| `nmiLineAsserted`                  | physical `/NMI` input                                         |
| `nmiLineSampled`                   | `/NMI` captured at the previous input-sampling phase          |
| `nmiPending`                       | edge-detector output (`_needNmi`)                             |
| `nmiSampled`                       | one-cycle-later boundary sample (`_prevNeedNmi`)              |
| `deferDmaIrqUntilAfterInstruction` | an IRQ first seen during DMA waits for the halted instruction |
| `deferNmiUntilAfterInstruction`    | an NMI arriving as an entry finishes waits one instruction    |

`sampleNmiLine` performs edge detection: it copies `nmiPending` into `nmiSampled` (so vector hijack
sees the new value immediately while an instruction boundary sees it one sample later), then latches a
freshly-asserted `/NMI` edge as pending. `sampleIrqLine` records the physical level with `||=`, so an
IRQ recognized by an early poll stays latched. `takeNmiForInstruction` and `takeIrqForInstruction`
recognize a pending interrupt at an instruction boundary — NMI has priority, a masked IRQ that was
observed while `I` was set clears its sample but a still-asserted line can be resampled later, and a
DMA-deferred IRQ is skipped once. `captureIrqWhileHalted` and `captureIrqDuringDma` keep line
recognition alive while the CPU is jammed or bus-stalled. `hasPendingIrq`, `isIrqLineAsserted` and the
`CPU` getters `hasPendingIRQ` / `isIRQLineAsserted` / `didPollInterruptsThisCycle` expose this for the
bus and diagnostics.

`finishInstructionPolling` sets `irqPollingDisabled` from the _current_ `I` for most opcodes, but from
the pre-instruction `I` for `PLP` (`0x28`), `CLI` (`0x58`) and `SEI` (`0x78`) — these update `I` after
their own interrupt poll, so the old value governs the next boundary (the "delayed I" behaviour). It
then samples `/IRQ` and marks `interruptPolledThisCycle`.

### `CpuInterruptEntry`

The entry runs one bus cycle per `clock`, returning `true` after the vector high read. IRQ and NMI use
the 7-cycle hardware sequence; BRK uses a 6-cycle sequence after its opcode fetch (7 total). The
vector defaults to `$FFFE`, or `$FFFA` for NMI.

| Cycle | Hardware (IRQ/NMI)                                 | BRK                                                  |
| ----- | -------------------------------------------------- | ---------------------------------------------------- |
| 0     | dummy read `PC`                                    | dummy read `PC`, `PC++` (consumes the padding byte)  |
| 1     | dummy read `PC`                                    | push `PCH`                                           |
| 2     | push `PCH`                                         | push `PCL`                                           |
| 3     | push `PCL`                                         | **hijack check**, push `P \| 0x10` (B high), set `I` |
| 4     | **hijack check**, push `P & 0xEF` (B low), set `I` | read vector low                                      |
| 5     | read vector low                                    | read vector high, set `PC`                           |
| 6     | read vector high, set `PC`                         | —                                                    |

The **vector-hijack boundary** is the status-push cycle: `consumeNmiForVectorHijack` is polled there,
and if an NMI is pending the vector is redirected to `$FFFA` before either vector byte is read. An IRQ
entry can be hijacked into an NMI, and a BRK likewise. Vector selection is therefore fixed at the push
cycle, not immediately before the vector fetch. BRK enters through the normal `clock()` fetch path:
`startInstructionCycle` returns `false` for the `brk` plan, `PC` advances, and a `"brk"`
`CpuInterruptEntry` is installed. NMI and IRQ enter through `clockNonInstructionState`, which prefers
NMI, then a still-maskable IRQ that stays pending until it can be serviced.

## Power-on and reset

`powerOn()` applies the emulator's deterministic 2A03 cold-start policy: `A = X = Y = 0`, `SP = 0xFD`,
`P = 0x24`, then enters the reset vector unless the cartridge mapper supplies a one-time RAM-card
loader entry. Such an entry either replaces the initial `PC` or creates a synthetic subroutine stack
frame that returns to the already-read reset vector. `reset()` never consults that cold-boot hook: it
applies the front-loader reset-line state, consumes three stack slots (`SP -= 3`), forces `I` via
`P.reset()` (preserving the arithmetic flags and registers) and re-enters the reset vector.
`enterResetVector()` resets the interrupt state to the current `I`, clears any active instruction /
interrupt entry / indexed-read / RMW state and the poll flag, zeroes `cpuCycles`, clears `halted` and
loads `PC` from `[$FFFC]` in one step (it does not run a cycle-accurate 7-cycle reset). A `KIL`/`STP`
opcode sets `halted`; a halted CPU repeats its read each cycle, still captures IRQ line state, and
only a reset clears the jam.

The bus applies an optional mapper `reset()` hook before resetting PPU/APU/CPU state. This is
separate from `powerOn()`: address-latch multicarts return to their menu bank while retaining any
small volatile register file whose purpose is to survive the reset button.

## DMA interaction surface

The CPU exposes a narrow surface for the DMA arbiter so transfers can steal bus cycles without
diverging accounting. `readByteForDma` observes memory through the external-only path and must not
consume an instruction's data-bus latch; `repeatHaltedReadForDma` re-issues the stalled CPU read so
both buses observe it under `/RDY`. `clockDmaCycle` advances one CPU-owned cycle (clearing the poll
flag, beginning the interrupt update and incrementing `cpuCycles`) while DMA drives the bus, and
`finishDmaCycle` captures an IRQ raised during that cycle via `captureIrqDuringDma`.

## Save-state snapshot

`captureState()` returns a typed `CpuSnapshot` and `restoreState()` re-applies it after
`validateSnapshot`. The snapshot carries the flat register set, both data-bus latches, `cpuCycles`,
`halted`, `interruptPolledThisCycle`, the full `CpuInterruptSnapshot`, and — mutually exclusively —
either an in-flight `interruptEntry` or an `activeInstruction`, plus the optional indexed-read latch.
The active-instruction snapshot is a discriminated union mirroring the runtime families; each cycle
object implements `captureState`/`fromState`, and an RMW `dataCycle` is rebound to a fresh transform
closure on restore. Validation rejects out-of-range registers, non-byte data-bus latches, a negative
or unsafe `cpuCycles`, an out-of-range indexed-read latch, an invalid active-opcode, and the illegal
combination of a simultaneous instruction and interrupt entry; `rmwExecution` is transient and always
cleared on restore. Because every executing sub-state round-trips, a save state can be taken and
restored mid-instruction at any bus cycle — the per-subcycle detail persisted here is what advances the
public save-state envelope (e.g. the internal/external data-bus latches and the RDY-stretched indexed
dummy-read flag).

## Verification and known limits

The repository-owned suite checks all 256 opcode definitions, official and modeled unofficial
semantics, every cycle-family scheduler, dummy reads, RMW ordering, interrupt polling/entry and
runtime snapshot validation. External bus, DMA and interrupt evidence is recorded in
[External conformance ROMs](../../packages/fc-emu/test-support/external-roms.md); the generic Blargg
runner supports additional instruction suites when supplied explicitly.

The core models the Ricoh 2A03's binary-only ALU: the decimal flag is latched but does not enable BCD
arithmetic. Chip-revision behavior is introduced only when an executable test distinguishes it; the
opcode table is not a claim that every unstable unofficial instruction is portable across all NMOS
parts.

## Source files

- `packages/fc-emu/src/domain/emulation/cpu.ts` — register file, opcode semantics and the `clock()` /
  `update()` engine.
- `packages/fc-emu/src/domain/emulation/cpu/instruction-set.ts` — isolated immutable 256-opcode table
  and `getInstruction`.
- `packages/fc-emu/src/domain/emulation/cpu/instruction-cycle-plan.ts` — classifies opcodes into the
  six cycle families with read/write/RMW and index policy.
- `packages/fc-emu/src/domain/emulation/cpu/processor-status.ts` — six status latches and the canonical
  bit-5-high/bit-4-low byte projection.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-interrupt-state.ts` — physical IRQ line, polling latch,
  `/NMI` edge detection and recognition deferrals.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-interrupt-entry.ts` — one-cycle-at-a-time IRQ/NMI/BRK
  entry sequence and vector-hijack boundary.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-memory-cycle.ts` — cycle-accurate operand addressing
  and dummy reads.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-read-modify-write-cycle.ts` — NMOS
  read/write-old/write-new data sequence.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-branch-cycle.ts` — relative-offset, taken-dummy and
  wrong-page branch cycles with the two polling boundaries.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-stack-cycle.ts` — shared PHA/PHP/PLA/PLP bus sequence.
- `packages/fc-emu/src/domain/emulation/cpu/cpu-control-flow-cycle.ts` — JMP (with the indirect
  page-wrap bug), JSR, RTS and RTI cycles.
- `packages/fc-emu/src/domain/emulation/memory.ts` — RP2A03 internal/external data-bus behaviour for
  CPU reads, writes and DMA fetches.
