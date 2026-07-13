# FC Emu architecture

This repository is a Yarn workspace monorepo with two independently versioned packages.

```text
packages/
  fc-emu/                 @fcemu/core
    src/domain/           FC/NES hardware and cartridge model
      emulation/apu/      timing/modulation entities and narrow DMC port
      emulation/clock/    one console machine clock and regional cadence
      emulation/cpu/      instruction definitions, interrupt state and entry sequences
      emulation/dma/      sprite/DMC transfers and shared bus arbiter
      emulation/mapper/   mapper contract, factory and isolated board implementations
    src/application/      emulation session use cases and output ports
    src/index.ts          the only supported public API
  ui/                     @fcemu/ui
    src/domain/           workbench session state and invariants
    src/application/      load/play/pause orchestration and ports
    src/infrastructure/   browser and @fcemu/core adapters
    src/presentation/     React UI
    src/app/              composition root
```

## Dependency rule

Dependencies only point inward:

```text
@fcemu/core: domain <- application <- public API
@fcemu/ui:   domain <- application <- infrastructure/presentation <- app
```

- The core package cannot import DOM, Canvas, WebAudio or browser `File` APIs.
- The UI domain and application layers cannot import browser APIs.
- UI infrastructure consumes `@fcemu/core` only through its package root.
- Concrete browser adapters are created only in `src/app/compose.ts`.
- `yarn check:layers` and `yarn check:circular` enforce these decisions in CI.

## Hardware bounded contexts

Domain boundaries follow the physical NES rather than a generic DDD directory template. The
**Machine** composes independently owned **CPU**, **PPU**, **APU**, **Cartridge** and **Controller**
contexts over their real buses and interrupt/DMA signals. CPU, PPU and APU are each cohesive chips,
not application services to subdivide for layering symmetry. Small internal types are justified only
when they represent a real subunit or isolate a measured state machine; their folders are an
implementation detail, not another bounded context.

The **Cartridge** context owns image format, ROM/RAM and mapper-selected board wiring. Mapper
implementations encapsulate cartridge-specific address translation and bank state. The **Video
Output** and **Audio Output** contexts begin at application ports; Canvas, AudioWorklet and browser
device lifecycle remain replaceable UI infrastructure. CPU halt is explicit hardware state surfaced
through application diagnostics.

CPU and PPU memory maps are separate physical buses and therefore use direct mapping objects rather
than inheriting from a generic memory base class. CPU addresses are truncated to 16 bits; PPU
addresses are truncated to its independent 14-bit bus before CHR, nametable or palette decoding.

Architecture follows the smallest model that preserves those physical responsibilities. A folder,
class or port is not a bounded context by itself. Scalar state stays with the chip or bus that owns
it; pure address calculations remain functions or tables; an internal object is extracted only when
it represents a documented hardware subunit, a separately testable state machine, or a real external
boundary. Rare silicon behavior is added only when a reproducible ROM or hardware trace makes its
observable result part of the supported emulator contract.

The cartridge-header parser translates iNES/NES 2.0 bytes into immutable domain metadata. The
`Cartridge` aggregate then applies the core's supported-format policy and owns
ROM, volatile RAM and non-volatile RAM. Parsing, policy and board construction are deliberately
separate: malformed data raises `CartridgeFormatError`, unsupported mapper variants/layouts raise
mapper-domain errors, and no mapper is constructed from an ambiguous or invalid memory shape.

The mapper directory is a cohesive domain submodule: its index exposes a contract, selection factory
and domain error while board implementations remain internal. IRQ-capable boards depend only on
`MapperInterruptPort`, preventing cartridge hardware from coupling to the complete emulation bus.
The factory resolves mapper/submapper identity, chooses documented bus-conflict behavior and checks
the board's PRG/CHR bank invariants before any address calculation can encounter an empty or partial
bank.

The bus arbitrates level-sensitive IRQ sources so the APU and mapper can assert and acknowledge
their own lines independently. `CpuInterruptState` owns the physical IRQ line, sampled polling value,
software pending request, I-mask snapshot, branch deferral, the physical `/NMI` input and separate
current-edge/previous-cycle NMI latches. The CPU
consumes that entity instead of coordinating independent booleans. `CpuInterruptEntry` owns the
one-bus-cycle-at-a-time IRQ/NMI/BRK micro-operation sequence behind `CpuInterruptEntryPort`, so NMI
can hijack the vector only at the documented boundary before the status push. `MachineClock`
advances the PPU to the CPU's input-sampling phase before `CpuInterruptState` samples `/NMI`, so a
short PPUSTATUS race pulse can disappear without being latched while a sampled edge remains pending.
Branches poll before their operand cycle; page-crossing taken branches poll again before PCH fixup,
and a successful first IRQ poll remains latched if the line clears before the second. Taken
non-crossing branches still ignore a newly detected final-cycle IRQ. Ordinary
instructions expose whether their current cycle actually performed the interrupt poll, so Bus does
not infer NMI recognition delay from the number of cycles returned by an update. Implied, branch,
ordinary read/write memory, stack and control-flow instructions now share one active-instruction
state after opcode fetch. RMW joins the same state by composing address resolution with its three
data cycles; BRK/IRQ/NMI retain their dedicated entry state.
`CPU.clock()` is the only execution engine. `CPU.update()` is an instruction/debug step facade that
loops the same engine until the active instruction or interrupt entry completes; it owns no decoder,
addressing or dummy-read fallback. Cycle-owned opcodes point at an explicit throwing semantic-table
guard, preventing accidental reintroduction of a second execution path.
`CpuBranchCycle` specifies relative-offset, taken-dummy and wrong-page cycles. It exposes the two
NMOS polling boundaries directly: every branch before its operand cycle and a crossing branch again
before PCH fixup. A taken non-crossing branch ignores an interrupt appearing during its final dummy
cycle; production activation is grouped with the adjacent DMC-sensitive operand and stack cycles.
`CpuStackCycle` specifies the repeated next-PC dummy reads and final push/pull shared by
PHA/PHP/PLA/PLP.
`CpuControlFlowCycle` owns absolute/indirect JMP target reads, the indirect page-wrap bug, JSR
return-address pushes, internal PC dummy cycles, RTS's final increment read and RTI's ordered
status/PC restoration. These entities depend on narrow cycle ports rather than the CPU aggregate.
`CpuMemoryCycle` resolves immediate, zero-page, absolute, indexed and indirect operands through
explicit program-byte, zero-page-pointer, wrong-page, dummy and final data-operation cycles. Its
`execute(address)` port keeps ALU and store semantics inside CPU while allowing address scheduling
to evolve independently; `dummyRead(dummyAddress, effectiveAddress)` preserves PPUDATA's distinct
side-effect/value behavior across mirrored wrong-page reads. `CpuReadModifyWriteCycle` separately
owns the NMOS read/write-old/write-new data sequence. Its first read occupies the address cycle's
final execute callback, while a narrow CPU semantic adapter applies official and composite
unofficial transforms once on the final write without rereading I/O.
`InstructionCyclePlan` classifies all 256 opcodes into BRK, implied, branch, stack, control-flow or
memory families and carries index-register plus read/write/RMW policy. CPU already consumes this
plan for every ordinary instruction path, replacing local opcode-shape checks with one domain authority.
Instruction definitions and their addressing/read-write classifications live in the isolated
`cpu/instruction-set` domain module. CPU execution consumes immutable table data through a byte-domain
lookup function instead of owning the 256-opcode table, so micro-operation schedulers can depend on instruction metadata
without depending on the CPU aggregate.
`ProcessorStatus` is a separate mutable value object for byte packing, cold-start state, reset-line
IRQ masking and Z/N result projection. The CPU aggregate coordinates it but no longer owns flag
encoding rules.
`CPUMemory` owns the RP2A03's two byte-wide data paths without introducing another bus object:
ordinary CPU reads update the internal and external latches, CPU writes drive both, and DMA memory
fetches drive only the external pins. Unmapped and write-only I/O reads retain the external byte;
controller ports replace only bits 0–4. `$4015` is the inverse boundary: its status and floating bit
5 use only the internal CPU bus and never refresh the external pins. This separation is required for
DMC fetches that land between an operand read and a `$4015` access.

`SpriteDma` and `DmcDma` are isolated domain entities coordinated by `DmaArbiter`. The arbiter also
owns the independently powered APU GET/PUT alignment; a one-bit cadence is state of that physical
bus owner rather than another domain object. OAM owns its halt/GET/PUT transfer state, while DMC
owns its request-to-GET state and may steal a GET
without losing an overlapping OAM byte. The bus grants DMA one CPU cycle at a time instead of
copying data inside a register write. CPU accounting, PPU progress and interrupt recognition
therefore continue during transfers. IRQs first sampled during DMA wait for the halted instruction;
pre-sampled IRQs retain their original service point. PPU cartridge-address observations drive mapper timing;
mapper IRQs do not depend on presentation frames or scanline callbacks.
An OAM request in `halt` state does not own the bus yet: the CPU must expose a read cycle first.
Consecutive CPU writes therefore continue normally, and a second `$4014` RMW write replaces the
pending page before the single transfer begins. Once the halt read is observed, the existing DMA
state machine owns halt/alignment/GET/PUT cycles as before. The stalled CPU-read loop still
resamples DMC requests every CPU cycle, so a newly emptied sample buffer can steal a GET from an
in-progress OAM transfer rather than waiting until all 256 bytes finish.
Background fetch addresses pass through a dot-delay queue instead of fabricated scanline callbacks;
MMC3 accepts A12 rises only after ten low dots, rejecting the cross-line nine-dot pulse.

`ConsoleTiming` is immutable clock-domain data for NTSC, PAL and Dendy execution. It owns CPU
frequency, rational CPU-to-PPU clock ratio, scanline/vblank geometry and the selected APU timing
profile. The stateful `MachineClock` is the sole owner of PAL's fractional 16:5 PPU remainder,
avoiding duplicate clock authorities. Multi-region headers resolve deterministically to NTSC
in automatic mode. The Workbench owns an `auto` / NTSC / PAL / Dendy preference and rebuilds the
active runtime transactionally when it changes; the core remains unaware of UI policy and receives
only an optional explicit override. Save RAM and held controller intents cross that runtime boundary.

The APU aggregate delegates deterministic timing and modulation rules to `FrameSequencer`,
`Envelope`, `LengthCounter`, and `DeltaModulationChannel` domain objects. DMC depends only on
`DmcChannelPort`—request/cancel DMA, assert/clear IRQ and observe CPU phase—rather than importing the
complete bus. CPU writes enter an ordered APU register-event queue and commit after the target APU
tick; reads catch up the current APU cycle while DMC can still schedule a halt.
The first DMC load fetch is phase-delayed after `$4015` and requests GET; consuming the reader
buffer requests a PUT-scheduled reload. `DmcDma` retains that requested halt phase until the arbiter
can overlap or halt a readable CPU cycle, and retries without the phase restriction after a failed
write-cycle halt. Its GET port carries both the sample address and the retained halted-CPU address,
allowing the Bus to reproduce the RP2A03's split A0-A4/A5-A15 internal-register activation without
making the DMC channel depend on controllers or APU register decoding. `DmcSiliconProfile` keeps
revision evidence explicit: NTSC selects the common
RP2A03H/late-G implicit-stop abort and unexpected-reload behavior, while regions without measured
evidence use a conservative profile. Controller
ports expose the NES shift-register high sentinel after eight bits, so a DMC halt read of `$4016`
loses exactly one controller bit rather than hanging sentinel-based readers.
The Bus owns the RP2A03's single pending `$4016` OUT-latch write. The latest value is committed to
both controller ports only after a PUT bus cycle; consecutive RMW old/new writes can therefore
collapse into one level or form a one-cycle strobe according to APU alignment. The Controller entity
still owns only the external device's button state, strobe level and serial position.
`ConsoleTiming.dmcDmaControllerReadGlitch` owns the regional silicon distinction: NTSC exposes the
halt-side controller clock, while PAL and unverified Dendy configurations suppress it. The
Controller entity remains a serial shift register and does not import console-region policy.
`LengthCounter` owns pending halt/reload writes and commits them after the coincident frame-counter
clock, preserving the rule that a reload is ignored when that clock already changed the counter.
The APU aggregate separately owns the frame IRQ's external CPU line and internal `$4015` status
flag. A status read drops the line immediately while a one-APU-cycle pending clear retains the flag
through the required GET/PUT boundary and through save/restore.
`MachineClock` is the console's single source of committed CPU time, projected bus time, synchronized
APU time and PPU master-clock phase. Bus no longer coordinates separate CPU/APU and CPU/PPU
watermark objects. `ApuTiming` owns the 2A07 channel PUT delay together with the region's frame,
Noise and DMC periods. Power-on and soft reset
are distinct lifecycle commands. The front-loader reset policy preserves CPU arithmetic
registers/flags, internal RAM, PPU VRAM/OAM and mapper bank latches while consuming the CPU's three
stack positions, masking IRQs and applying the documented PPU/APU reset state. The deterministic
cold-start policy clears volatile console/cartridge memory, rebuilds APU channels and returns mapper
latches to their fresh-instance state; NVRAM and currently held physical controller buttons remain
intact. This policy deliberately gives unspecified hardware power-up bytes stable emulator values.
Browser audio remains an output adapter whose device rate is supplied through the application port.

The same `MachineClock` carries the regional PPU divider remainder, emits the exact master-clock
value for every PPU dot and exposes the CPU `/NMI` input-sampling boundary. NTSC register reads occur
after the first PPU dot in the selected deterministic alignment; this is verified by an exact
`read2004` screen rather than a phase-tolerant comparison. PPUSTATUS at scanline 241 dot 0 suppresses
the pending vblank edge, and PPUMASK's register bits feed a two-dot internal rendering-enable
pipeline used by background, sprite, OAM and odd-frame skip logic.

Browser audio separates lifecycle orchestration from data policy. `AudioSampleBatcher` bounds
main-thread message frequency, while `RebufferingAudioRing` owns capacity, startup and underrun
invariants inside a separately bundled AudioWorklet. The Workbench application sees only
`AudioLifecyclePort`; worklet messages and WebAudio nodes remain infrastructure details.

`CartridgeMemory` owns four physically distinct regions: volatile PRG RAM, PRG NVRAM, volatile CHR
RAM and CHR NVRAM. It presents mapper-selected logical address spaces without exposing mutable
backing arrays; a write increments the shared save revision only when it changes an NVRAM byte.
Battery snapshots concatenate PRG NVRAM then CHR NVRAM, so existing PRG-only saves remain byte-for-
byte compatible. The Workbench owns restore/checkpoint policy through `SaveRamStoragePort`; SHA-256
ROM identity and IndexedDB storage remain browser infrastructure details.

Deterministic save states are a separate application capability from battery persistence. Every
execution-owning aggregate exposes an explicit typed snapshot: active CPU/interrupt micro-cycles,
PPU fetch and pixel pipelines, APU channels/delayed writes, DMA transfers, requested halt phase and
implicit-stop counters, fractional clocks,
controller shift registers, mapper latches/IRQ timing and all writable cartridge regions. `Bus`
restores these snapshots transactionally and rolls every aggregate back if any nested invariant
fails. The public envelope carries a schema version, console region, audio sample rate and a whole-
image CRC-32 identity (compatibility guard, not a security primitive). The Workbench sees the core
snapshot only through an opaque runtime port, owns its matching UI timeline, clears buffered audio
before restore and reapplies current input intents so stale saved buttons cannot remain held.

`PpuIoBusLatch` owns the PPU's CPU-facing dynamic data bus independently from VRAM. Each bit keeps
its own deterministic decay deadline, partial reads drive only their physical lines, and passive
open-bus reads do not refresh retained bits. PPUSTATUS, OAMDATA, PPUDATA and OAM DMA therefore share
one state transition model instead of duplicating a vague “last register” byte inside `PPU`.
Introducing this additional deterministic state initially advanced the public save-state envelope
to version 2. The evaluator's later byte-counted overflow continuation advances it to version 3,
and the explicit CPU/PPU master-clock watermarks advance it to version 4. Consolidating all console
watermarks into `MachineClock` advanced it to version 5. DMA cadence, physical NMI-line, the PPU
render-enable pipeline and the full-cycle DMC timer advanced it to version 7. Persisting the RP2A03
internal and external data-bus latches advanced the envelope to version 8. Persisting the pending
RP2A03 controller OUT write advanced it to version 9. Version 10 also persists whether
RDY stretched an indexed dummy read in an active CPU memory cycle, because that signal changes the
following SHA/SHS/SHX/SHY write. Version 11 persists the delayed internal frame-IRQ clear following
a `$4015` read. The current version 12 persists MMC1's previous CPU R/W level so restoring between
the two writes of an RMW instruction cannot admit a serial bit that hardware would ignore. Older
in-memory snapshots are rejected explicitly instead of being restored with ambiguous state.

Sprite processing is split into small timing-domain objects rather than one scanline batch inside
`PPU`. A pure sprite-pattern address function interprets 8×8/8×16 table, tile and vertical-flip
wiring. Its row input is a scanline delta rather than a prevalidated tile row: the physical pattern
address register consumes only the low three or four row bits selected by the live PPUCTRL size.
This permits the evaluator and fetcher to observe different sprite sizes when software changes
PPUCTRL during hblank, without inventing an impossible domain error. `SpriteEvaluator` clocks
primary-to-secondary OAM from dots 65–256, retains copied
bytes for the fetch phase and models the overflow diagonal-index hardware bug. It also projects the
rendering-time internal OAM data bus: secondary-OAM clear on dots 1–64, primary/secondary evaluation
accesses on 65–256, sprite-slot loading on 257–320 and the first secondary byte afterward. `PPU`
keeps ownership of the CPU-facing register policy, including forced OAMADDR zero during sprite
loading, ignored rendering-time writes and ordinary eight-bit address wrapping. PPU directly owns
the two booleans in the one-dot pipeline between an opaque overlap and PPUSTATUS bit 6. Their in-flight state is
part of the transactional PPU snapshot, so a mid-evaluation restore continues the same byte and dot.
The evaluator keeps the eighth-sprite fill-dot bus latch distinct from the subsequent secondary-OAM
read mode. Once overflow is detected it consumes exactly three continuation bytes, realigns to the Y
lane and resumes the hardware's failed-copy loop; both transient counters are snapshot state rather
than inferred from a later dot.

Mapper wiring, not header parsing, decides whether declared memory is reachable. `Mmc1Board` is an
immutable domain value selected from ROM/RAM geometry plus explicit submapper constraints. It owns
SUROM/SXROM outer PRG selection, SOROM/SXROM/SZROM WRAM banking, SNROM's CHR-A16 WRAM protection and
SEROM-family fixed PRG wiring; `Mmc1Mapper` consumes those board capabilities without reinterpreting
headers. Unsupported or contradictory combinations fail at the factory boundary. MMC3 owns its
`$A001` RAM enable/write-protect state instead of treating the direct window as permanently writable.
`Mapper34Board` similarly resolves the unrelated NINA-001 and BNROM identities before execution.
The resulting aggregate owns only its physical register decoder: NINA's three PRG-RAM-overlay
registers cannot leak into BNROM, and BNROM's bus-conflicted high-address latch cannot leak into NINA.
MMC1 additionally observes the CPU bus's R/W sequence through an optional mapper capability. This
keeps its consecutive-write filter inside the cartridge ASIC boundary while CPU memory remains
unaware of mapper identity; D0 is suppressed on the second write cycle but D7 reset is still decoded.

Keyboard and Gamepad are independent controller-input adapters. `CompositeControllerInput` merges
their domain-level intents with source-aware pressed-state semantics; browser key codes, button
indexes and axes never cross the UI application port or enter `@fcemu/core`.

The UI package owns the **Workbench** context: ROM loading, session lifecycle, execution-region
preference, scheduling, controller intent, quick-save slot, runtime statistics and user feedback.
Canvas, WebAudio, requestAnimationFrame, keyboard input and the core emulator are replaceable
adapters around that context.

## Composition flow

```text
React presentation
  -> EmulatorApplication
    -> RomReaderPort / FrameSchedulerPort / AudioLifecyclePort / ControllerInputPort
      -> browser adapters / CoreEmulatorFactory
        -> @fcemu/core Emulator
          -> domain hardware model
```
