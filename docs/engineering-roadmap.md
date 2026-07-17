# Engineering evolution roadmap

This document records evidence-backed architecture and correctness work. Passing quality gates is
the baseline, not proof that emulation is complete.

## Completed in the current audit

- Boot the CPU from the cartridge reset vector before executing the first frame.
- Separate NROM (Mapper 0) from UxROM (Mapper 2), and keep PRG/CHR ROM writes immutable.
- Add CNROM (Mapper 3) with fixed/mirrored PRG, switchable 8 KiB CHR, original-board AND bus
  conflicts, CHR-ROM immutability, legacy CHR-RAM fallback and the licensed oversize register shape.
  Empty PRG-ROM images are now rejected before mapper construction instead of producing zero-length
  modulo behavior.
- Add AxROM (Mapper 7) with 32 KiB PRG switching, fixed CHR-RAM, dynamic one-screen nametable
  selection, default iNES no-conflict behavior and the common 512 KiB extension. Public cartridge
  information now exposes mapper-controlled mirroring through a live read-only getter instead of a
  stale construction-time copy.
- Decode iNES and NES 2.0 through an immutable `CartridgeHeader` value object, including the 12-bit
  mapper, submapper, linear/exponent ROM sizes, RAM/NVRAM shifts, trainer, console, timing,
  miscellaneous-ROM and expansion-device fields. Accept the explicitly documented safe subset and
  reject unsupported metadata with stable domain error codes instead of silently approximating it.
- Keep volatile PRG RAM and battery-backed PRG NVRAM distinct. Trainers now initialize the required
  `$7000-$71FF` PRG-RAM window instead of merely being skipped, and only NVRAM participates in
  revisioned persistence snapshots.
- Extract `CartridgeMemory` as the owner of volatile/non-volatile PRG and CHR regions. Mappers see a
  logical banked address space while persistence snapshots contain only PRG then CHR NVRAM. Add
  CHR-NVRAM saves, MMC1 SOROM/SZROM mixed 8+8 KiB RAM, SUROM/SXROM outer PRG banking, SOROM/SXROM/
  SZROM RAM banking, CNROM 2 KiB RAM mirroring and MMC3 RAM enable/write protection. Reject declared
  capacities that the selected board cannot address, including oversize AxROM and MMC3 images.
- Select Mapper 2/3/7 bus-conflict behavior from NES 2.0 submappers 1 and 2 while retaining each
  legacy iNES default. Reject unknown variants and validate every supported board's PRG/CHR sizes
  and bank alignment before mapper construction.
- Replace the implicit NTSC clock with an immutable `ConsoleTiming` value object shared by the bus,
  PPU and APU. PAL now uses a drift-free 16:5 PPU ratio, 312 scanlines, 2A07 frame/Noise/DMC timing
  and a 1.662607 MHz sample cadence; Dendy uses 312 scanlines, delayed vblank, a 3:1 PPU ratio and
  NTSC-family APU timing. Multi-region images execute under an explicit NTSC default policy, while
  core callers and the conformance runner may override the region for legacy test/homebrew images.
- Organize mapper hardware as an isolated core domain module with a common contract, selection
  factory and one implementation file per board. IRQ-capable mappers depend on a narrow interrupt
  port instead of the complete emulation bus.
- Add MMC1 (Mapper 1) serial banking, PRG/CHR modes, dynamic mirroring and PRG-RAM behavior.
- Represent four-screen nametable memory explicitly and allocate the required 4 KiB PPU memory.
- Correct palette conversion from `0xRRGGBBAA` constants to Canvas RGBA bytes.
- Correct CPU byte wrapping, memory ASL/ROL flags, stack wrapping, indirect-JMP wrapping,
  interrupt masking, overflow branches and BRK/IRQ/NMI status-stack semantics.
- Implement stable unofficial instructions, model KIL/STP as an explicit resettable CPU halt, and
  preserve the page-crossing address corruption of unstable store instructions.
- Pass all 16 groups in both blargg `instr_test-v5/official_only.nes` and `all_instrs.nes`; keep
  their ROMs external and run either with `yarn conformance:rom -- /absolute/path/to/test.nes`.
- Replace MMC3's scanline approximation with filtered PPU A12 address events, revision-B counter
  reload semantics and source-aware IRQ lines. Blargg `mmc3_test_2` tests 1-5 pass; test 6 targets
  the intentionally unselected alternate MMC3 silicon behavior.
- Preserve masked IRQs, the CLI/SEI/PLP polling delay and a standalone seven-cycle interrupt entry.
- Replace the approximate 240 Hz APU loop with an exact NTSC frame-sequencer entity, shared
  envelope and length-counter value objects, source-aware frame/DMC IRQs, and a buffered DMC output
  pipeline. Blargg `apu_test` passes 8/8 and `apu_reset` passes 6/6.
- Give `LengthCounter` ownership of delayed halt/reload commits, track the APU with absolute CPU-cycle
  watermarks, and separate the CPU's physical IRQ line from its sampled polling state. Region-aware
  register phases now preserve the distinct NTSC reset/DMC behavior while all ten Blargg PAL APU
  timing ROMs pass, including IRQ entry and coincident halt/reload writes.
- Replace immediate OAM copying with a `SpriteDma` halt/alignment/GET/PUT entity, queue APU register
  writes at their target cycles, and execute IRQ/NMI/BRK entry one CPU cycle at a time. NMI vector
  hijacking, DMA interrupt timing and the taken-branch polling exception now pass all five
  `cpu_interrupts_v2` single-test ROMs.
- Replace immediate DMC memory reads and scalar CPU stalls with a `DmcDma` request plus a shared
  `DmaArbiter`. The channel receives fetched bytes through a completion callback, preserves the
  `$C000`/one-byte power-on register state, models phase-dependent enable/disable delays, and unit
  tests cover three/four-cycle fetches plus DMC/OAM overlap without losing OAM bytes. Blargg
  `apu_test` remains 8/8; exact `dmc_dma_during_read4` `$2007`/`$4016` collision ROMs now produce all
  allowed outputs.
- Extract `DeltaModulationChannel` from the APU aggregate behind `DmcChannelPort`. The channel no
  longer imports Bus/CPU/PPU/Mapper; pure domain tests cover power-on addressing, odd/even start
  delay, delayed cancellation, terminal IRQ and loop restart behavior.
- Move committed CPU time, projected instruction progress and the synchronized APU watermark from
  independent Bus scalars into `CpuApuClockSynchronization`. Its domain tests fix projection,
  catch-up, partial-window and reset invariants ahead of the cycle-scheduler migration.
- Consolidate physical/sample/software IRQ state, I-mask polling snapshots, branch deferral, NMI
  recognition delay and post-entry deferral in `CpuInterruptState`. CPU interrupt entry now consumes
  explicit take/hijack operations; `cpu_interrupts_v2` remains 5/5.
- Extract the seven-cycle IRQ/NMI and six-remaining-cycle BRK sequences into `CpuInterruptEntry`.
  Its narrow port exposes only read, stack push, PC/flags and vector-hijack operations; direct domain
  tests verify cycle count, bus addresses, pushed status and NMI takeover. This is the reference
  micro-operation shape for migrating ordinary instructions.
- Activate one unified production microcode state for implied, branch, non-RMW memory, stack and
  control-flow instructions. Separate NMI edge latches, DMA IRQ deferral and projected `$4014`/APU
  write cycles keep `cpu_interrupts_v2` at 5/5. RMW now composes the final address-read cycle with
  read/write-old/write-new, removing the last ordinary aggregate fallback.
- Make `CPU.clock()` the sole execution engine. The instruction-step `CPU.update()` facade now loops
  the same active state; the former aggregate decoder/address resolver, branch penalty, indexed
  dummy-read state and duplicate BRK/branch/stack/control-flow semantic methods were deleted.
- Extract the complete 256-opcode definition table, addressing modes, byte lengths, timing and
  read/write/RMW classification into `cpu/instruction-set`. Direct domain tests cover cache identity,
  representative official opcodes, bus behavior and rejection of out-of-range opcode values; the
  CPU aggregate no longer owns decoder metadata.
- Extract status-byte packing, power-on reset and Z/N projection into the `ProcessorStatus` value
  object. Pure tests cover all writable flags and the signed/wrapped result cases used by ALU
  instructions, leaving the CPU aggregate responsible for coordination rather than flag encoding.
- Extract relative branches into `CpuBranchCycle`, including offset reads, taken dummy reads,
  wrong-page reads and wrapped targets. The entity exposes the taken/non-crossing early interrupt
  poll explicitly. A production experiment passed `cpu_interrupts_v2` 5/5 but changed the combined
  APU suite's inherited DMC phase, so activation was grouped with the remaining immediate, stack,
  control-flow and ordinary memory cycles rather than left as a mixed isolated path.
- Model PHA/PHP/PLA/PLP in `CpuStackCycle`, with their repeated next-PC dummy reads before the final
  push/pull. Model JSR/RTS/RTI in `CpuControlFlowCycle`, preserving internal PC dummy cycles,
  return-address byte order, RTS's final increment read and RTI's status-before-PC restoration.
  Direct tests assert every externally visible bus address and stack value ahead of coherent
  production activation.
- Add `CpuMemoryCycle` for immediate, zero-page, indexed zero-page and absolute operand resolution.
  Its tests fix program-byte order, zero-page wrapping, indexed dummy reads and final effective
  addresses while delegating the actual ALU/store action through a narrow execution port.
- Extend `CpuMemoryCycle` through absolute indexed, indexed-indirect and indirect-indexed reads and
  writes, including conditional/mandatory wrong-page reads and zero-page pointer wrapping. Add
  `CpuReadModifyWriteCycle` for the separate read/write-old/write-new data sequence, and extend
  `CpuControlFlowCycle` with absolute/indirect JMP including the page-wrap hardware bug.
- Add `InstructionCyclePlan` as the exhaustive 256-opcode authority for implied, branch, stack,
  control-flow and memory cycle families. It carries X/Y index and read/write/RMW policy; CPU now
  consumes it for every production non-RMW path instead of duplicating classification logic.
- Classify instructions by read/write/read-modify-write domain behavior and emit indexed zero-page,
  indexed-indirect and wrong-page dummy reads. Memory RMW now performs the NMOS
  read/write-old/write-new sequence, while composite unofficial instructions reuse the internal new
  value instead of incorrectly reading I/O again. A CPU data-bus latch separates PPUDATA side
  effects from the value returned by consecutive mirrored reads. `read_write_2007` and
  `dma_2007_write` now report Passed, and `double_2007_read` produces allowed CRC `85CFD627`.
- Separate power-on from soft reset across CPU, PPU, APU, DMA, controllers, cartridge memory and
  mapper aggregates, then project both commands through the UI application port. Reset retains
  RAM/OAM/VRAM and mapper latches while applying the CPU/APU/PPU reset-line state; the deterministic
  cold-start policy clears volatile memory, rebuilds channel state and restores fresh mapper latches.
  Blargg `apu_reset` passes 6/6, and cold-start output matches a fresh instance for both real smoke ROMs.
- Derive sample emission from the selected audio sink rate and reject invalid device rates.
- Persist battery-backed Save RAM using content-addressed ROM identities, revisioned immutable core
  snapshots, a UI application storage port, lifecycle/periodic checkpoints and an IndexedDB adapter.
  Save RAM remains intact across both soft reset and power-cycle commands.
- Make overlapping UI ROM loads latest-wins and prevent completion after disposal.
- Decouple video session transitions from blocked WebAudio promises and project audio permission as
  an explicit `starting/running/blocked` state.
- Replace deprecated `ScriptProcessorNode` output with a separately bundled AudioWorklet. A tested
  bounded queue batches 512 samples and converts time-based startup/capacity targets into whole
  batches at the actual device sample rate. At 44.1 kHz this starts/rebuffers at 1024 samples and caps
  growth at 8192 samples. Suspend clears partial/worklet buffers so resume cannot replay stale audio;
  disposal wins asynchronous module-loading races without leaking nodes.
- Route keyboard controls through a UI input port and a core anti-corruption adapter.
- Add a standard Gamepad adapter with stable player-one/player-two slots and an input-source
  compositor that prevents false releases when keyboard and gamepad buttons overlap. Input listeners
  now survive stop/reload and are released exactly once on application disposal.
- Add a Workbench `auto` / NTSC / PAL / Dendy execution-region preference. Region changes rebuild
  the core runtime transactionally, preserve battery Save RAM and held controller intents, and keep
  paused sessions paused while running sessions resume on the selected clock domain.
- Replace the frame's nested arrays with a measured flat typed-array representation.
- Add versioned deterministic save states across active CPU cycles, PPU/APU pipelines, DMA, clocks,
  mapper latches and writable cartridge memory. Restore is ROM/region/sample-rate compatible and
  transactional; the Workbench keeps the core payload opaque, restores its timeline, flushes audio
  and reapplies live controller intent. Mid-instruction and in-flight OAM-DMA continuation tests pass.
- Add three persistent Workbench quick-save slots behind a storage port. IndexedDB records use an
  outer format version and are isolated by content-addressed ROM identity plus actual execution
  region; selecting an empty slot never exposes another ROM or region's state.
- Expose measured frame cadence and AudioWorklet ring/queue/underrun/drop counters as read-only
  application diagnostics. Real Mario and Contra browser runs hold about 60 FPS, pause without
  advancing frames, clear buffered audio on pause, and resume audio after a user gesture.
- Extract MMC1 board wiring into an immutable `Mmc1Board` value object. Accept geometry-consistent
  NES 2.0 SUROM/SOROM/SXROM submappers 1/2/4, implement fixed-PRG submapper 5, and model SNROM's
  redundant CHR-A16 WRAM disable. Holy Mapperel 0.02 passes SKROM, SGROM, SNROM, SUROM and SXROM 5/5.
- Route the CPU R/W bus sequence to MMC1 and ignore only the second D0 write of consecutive write
  cycles while still accepting D7 reset. A real `INC $E000` CPU-cycle regression now commits control
  value `$01` with an empty shift register instead of the incorrect `$02`/half-filled state; the
  previous R/W level advances the save-state envelope to version 12. Holy Mapperel remains 5/5.
- Split Mapper 34 through one validated board-selection function plus independent NINA-001 and BNROM
  aggregates. NES 2.0 submappers 1/2 are explicit; legacy submapper 0 selects one board from CHR
  geometry. Holy Mapperel's BNROM fixture reaches detailed result `0000` after 1200 frames.
- Replace PPU's ambiguous last-written `register` byte with a dedicated `PpuIoBusLatch`. Writes,
  PPUSTATUS's partial high-bit drive, OAMDATA, buffered/palette PPUDATA and OAM DMA now share
  per-bit retention and deterministic decay. Palette RAM is constrained to six bits and grayscale
  affects both rendering and palette reads. Blargg `ppu_open_bus` advances from failure #2 to Passed.
- Extract sprite pattern addressing, evaluation and sprite-zero status into explicit PPU domain
  objects. Correct the 8×16 lower-tile/vertical-flip wiring, replace dot-257 predictive overflow
  with primary-to-secondary OAM evaluation over dots 65–256, reproduce the diagonal byte-index bug,
  and latch sprite-zero overlap one dot after detection. Blargg sprite hit improves from 9/11 to
  11/11 and sprite overflow from 3/5 to 5/5; `oam_read` also passes.
- Project rendering-time `$2004` reads from the evaluator's internal OAM bus instead of primary OAM.
  Secondary-OAM clearing, odd/even evaluation accesses, the post-scan failed-copy loop and all eight
  sprite fetch slots now have explicit dot behavior. OAMDATA writes are ignored while rendering owns
  the bus, OAMADDR is forced to zero throughout dots 257–320, ordinary writes wrap `$FF` to `$00`,
  and physically absent attribute bits are masked on storage. Focused tests cover each phase;
  `oam_read`, `oam_stress` and `cpu_dummy_writes_oam` pass, while sprite hit remains 11/11, sprite
  overflow 5/5 and MMC3 tests 1–5 pass.
- Correct two CPU-visible evaluator transitions missed by flag-only ROMs. After finding an overflow
  candidate, hardware reads exactly three continuation bytes and then realigns to repeated Y-byte
  failed copies; it does not continue four-byte sprites through dot 256. The even dot that fills the
  eighth secondary-OAM slot still exposes the primary copy buffer and switches to secondary reads on
  the following even dot. Both transient states participate in save-state validation, advancing the
  public envelope to version 3.
- Add a checksum-pinned `conformance:oam-bus` runner for Quietust's `read2004.nes` and its published
  RP2C02G 256-byte screen. It intentionally exits non-zero until the exact screen matches. A timing
  experiment showed the corrected evaluator can match every overlapping sample once CPU/PPU phase
  is aligned, but shortening OAM DMA in isolation breaks `cpu_interrupts_v2/4-irq_and_dma`; the
  isolated DMA shortening was therefore removed.
- Introduce `CpuPpuClockSynchronization` as an integer master-clock domain object. CPU reads/writes,
  DMA samples and PPU dots now share explicit watermarks, and each PPU callback retains its exact
  position inside the CPU cycle. This removes the formerly ambiguous NMI batch index, keeps
  `05-nmi_timing` exact and moves `08-nmi_off_timing` to Passed, improving the full `ppu_vbl_nmi`
  matrix from 5/10 to 6/10. The
  snapshot envelope advances to version 4. Correcting OAM DMA from the retained scheduler's 515-dot
  integration to its 513/514-cycle transfer makes every overlapping `read2004` sample exact at one
  fixed phase, but still moves the APU IRQ boundary in `4-irq_and_dma`; that correction remains
  uncommitted until APU event phase joins the master clock.
- Consolidate the separate CPU/APU and CPU/PPU synchronization aggregates into one hardware-oriented
  `MachineClock`. The stable snapshot no longer duplicates the update-start watermark or stores the
  same committed CPU time in CPU-cycle and master-clock forms. Bus has one clock dependency and the
  public save-state envelope advances to version 5.
- Audit the CPU cycle-family objects against the MOS/NESdev bus model instead of merging by file
  count. Blargg `instr_test-v5` passes 16/16 single ROMs, `instr_misc` passes 4/4,
  `instr_timing` passes 2/2 and `cpu_dummy_writes_ppumem` passes. Address resolution, branch, stack,
  control-flow, interrupt-entry and RMW state remain internal parts of the single CPU bounded
  context because each preserves a distinct physical bus sequence; they are not treated as nested
  DDD contexts.
- Replace CPU-cycle-parity DMA guesses with snapshot-backed GET/PUT alignment owned directly by the
  DMA arbiter. OAM alignment is now derived after halt, transfers are always 513/514
  cycles, a second pre-halt `$4014` write selects the latest page, and `4-irq_and_dma` remains Passed.
- Replace PPU's inherited integer NMI propagation delay with a physical `/NMI` level sampled by the
  CPU at its master-clock boundary. `_needNmi` and `_prevNeedNmi` update in hardware order, IRQ/BRK
  vector selection occurs only before the status push, and the dot-0 PPUSTATUS race suppresses the
  following vblank edge. Add the PPUMASK internal rendering-enable pipeline used by odd-frame skip.
  The full `ppu_vbl_nmi` matrix now passes 10/10 while `cpu_interrupts_v2` remains 5/5.
- Align the NTSC CPU register-read sample with the first PPU dot. Quietust `read2004.nes` now matches
  all 252 compared bytes at zero dot shift with matching stack bytes. The public save-state envelope
  advances to version 7 for DMA cadence, the new CPU/PPU signal pipelines, and the full-cycle DMC timer.
- Replace hard-coded zeroes for CPU write-only/unmapped reads with the RP2A03's internal and external
  byte-wide bus latches. Controller ports now preserve external bits 5–7, `$4015` uses internal bit 5
  without refreshing the external pins, and DMC/OAM memory fetches change only the external latch.
  AccuracyCoin's hardware-backed Open Bus test passes 9/9 subtests and Internal Data Bus passes 3/3;
  the new deterministic state advances the save-state envelope to version 8.
- Treat sprite evaluation and sprite pattern fetch as separate PPU stages when PPUCTRL changes during
  hblank. Pattern addressing now masks the scanline delta through the live 8×8/8×16 row wiring
  instead of throwing when the evaluator selected a sprite under the previous size. AccuracyCoin's
  Suddenly Resize Sprite test advances from a production crash to 5/5 passing subtests.
- Delay the shared RP2A03 `$4016` OUT latch to its PUT-cycle commit point instead of mutating both
  Controller entities inside the CPU write callback. A later RMW write can replace a still-pending
  value, reproducing both accepted and suppressed one-cycle pulses. AccuracyCoin Controller Strobing
  advances from failure code 4 to 4/4, and save-state format 9 persists the pending byte.
- Stop treating an OAM DMA request as immediate bus ownership. The CPU now attempts the pending halt
  cycle, allowing writes to complete until a read can actually be halted. `INC $4014` consequently
  replaces its write-old page with write-new and triggers one transfer instead of two; AccuracyCoin
  advances from failure code 3 to 3/3 while the existing SpriteDma transfer state stays unchanged.
  The read-stall loop re-arbitrates DMC each CPU cycle, preserving both sixteen-position
  `sprdma_and_dmc_dma` matrices after moving the initial OAM halt into the CPU read path.
- Put branch interrupt polling on its two hardware boundaries: before every offset fetch and, for a
  taken page crossing, before PCH fixup. `CpuInterruptState` retains an earlier successful poll until
  the service boundary while discarding samples masked by I. AccuracyCoin Interrupt Flag Latency now
  passes 14/14; Blargg `cpu_interrupts_v2` remains 5/5 and `instr_timing` remains 2/2.
- Preserve the RDY history of an indexed write inside `CpuMemoryCycle`. A DMC DMA that stretches the
  dummy read now removes the unstable store's `(ABH+1)` data mask without suppressing independent
  page-crossing address corruption. AccuracyCoin SHA `$93/$9F`, SHS, SHY, SHX and the LAE control
  case all pass; the in-flight latch advances the save-state envelope to version 10.
- Separate `$4015`'s immediate CPU IRQ acknowledgement from the internal frame-IRQ flag clear at the
  following APU-cycle boundary, and align the first DMC load halt with GET in the second following
  APU cycle. AccuracyCoin `DMA + $2002 Read` now passes with its common result code 5: halt and dummy
  reads clear PPUSTATUS before the resumed CPU read. The pending flag clear advances the save-state
  envelope to version 11.
- Model the RP2A03 DMC GET as a split address: DMA supplies A0-A4 and the halted 6502 retains
  A5-A15. Combined `$4015/$4016/$4017` activations now preserve the external sample's open-bus bits,
  clock the selected controller, and acknowledge a frame IRQ. AccuracyCoin `DMC DMA Bus Conflicts`
  now matches all 64 expected bytes and returns the console-specific success value `$E1`.
- Replace the half-rate DMC approximation with the hardware's full CPU-cycle timer periods and
  align the first expiration with the selected APU power-on half-cycle. Distinguish GET-scheduled
  load DMA from PUT-scheduled reload DMA; the arbiter preserves this request phase across OAM
  overlap and failed CPU-write halts. Blargg `sprdma_and_dmc_dma` and its `_512` variant now both
  complete all sixteen collision positions with their hardware CRCs.
- Add a revision-named DMC silicon profile for the one-byte implicit-stop races documented on
  RP2A03H and late RP2A03G. Same-boundary completion now performs the unexpected reload; preceding-
  boundary completion schedules the reload and cancels it after one halt. PAL/Dendy do not inherit
  these unverified NTSC behaviors. Focused state-transition tests cover both glitches and the
  conservative profile; the original forum ROM attachment is not mirrored into the repository.
- Move the DMC/controller extra-read distinction into `ConsoleTiming`. NTSC halt cycles delete one
  controller bit before the resumed CPU read; PAL 2A07 and unverified Dendy timing suppress that
  side effect. Focused bus tests assert both the returned button and final shift-register index.
- Apply PPUMASK colour emphasis to the rendered output. Eight precomputed palettes attenuate the two
  channels each active emphasis bit does not select, so a single bit tints the picture and all three
  darken it. The 2C07 (PAL) red/green emphasis-line swap is modelled; NTSC/Dendy keep the 2C02
  ordering. A rendering test asserts an unmodified white backdrop, the blue-emphasis channel pattern
  and the all-emphasis darkening.
- Add the console's analog RC output filters to the APU mixer: 90 Hz and 440 Hz high-pass stages plus
  a 14 kHz low-pass, clocked at the output sample rate. The high-pass stages also remove the large DC
  bias of the non-linear mixing tables, centering the waveform for the output device. A test drives a
  constant DMC DAC level and asserts the long-run sample average returns to zero instead of the raw
  DC level. Save-state version 13 captures the filter history so restoring an early-game snapshot
  reproduces the startup audio transient exactly.
- Silence the triangle channel only for the genuinely ultrasonic timer periods 0 and 1 (previously
  0-2), matching the common de-popping convention without muting the audible ~18.6 kHz period-2 note.

## Near-term direction

The core has moved beyond the original fogleman/nes-sized port, so further work defaults to
simplification and evidence-backed compatibility rather than adding speculative chip-revision
objects. Keep the two-package monorepo, the physical CPU/PPU/APU/cartridge/controller boundaries and
the mapper directory. Collapse internal objects that own only scalar state back into their physical
owner while preserving conformance results. `DmaCadence` was the first such correction: its one-bit
GET/PUT alignment now belongs directly to `DmaArbiter`, with the save-state shape unchanged.
The same audit consolidated the three public Mapper error types into one module, removing invented
lifecycle boundaries without weakening validation, error semantics or package exports. A later
domain-modelling audit kept sprite-pattern address resolution and ROM identity generation as pure
functions: both perform one stateless calculation, so wrapping their scalar result in a short-lived
object added ceremony without protecting a longer-lived invariant. Their focused unit tests exercise
the functions directly.
The clock-domain audit then removed the unused `ClockRatioCounter` duplicate, replaced three
field-only timing classes with immutable data and made CPU/PPU master dividers the sole source for
the derived PPU frequency. `MachineClock` remains the only owner of fractional regional phase.
The CPU instruction-set audit replaced the field-only `Instruction` class/static namespace with a
frozen 256-entry definition table and a byte-domain lookup function. Lookup now rejects fractional
and non-finite opcodes instead of leaking `undefined`; table-wide tests validate every definition.
The cartridge-format audit likewise replaced the field-only `CartridgeHeader` class with a parser
that returns frozen metadata. Header interpretation remains isolated from supported-layout policy
and cartridge memory ownership, but no longer pretends that parsed bytes have an object lifecycle.
The Mapper 34 board audit applied the same rule to its field-only identity wrapper. The pure
`resolveMapper34Board` function still owns submapper and memory-geometry validation, but returns the
single discriminator consumed by the mapper factory; the stateful NINA-001 and BNROM aggregates
remain separate.
The UI boundary audit then removed PRG/CHR capacity fields that crossed the core adapter only to be
copied into immutable session snapshots. Cartridge format, mapper/submapper, execution region and
battery capability remain because Workbench behavior or presentation consumes them; capacity stays
inside the core until a real UI use case needs it. Mapper label formatting now accepts only its
three identity fields instead of the complete ROM-detail shape.
The session-state audit removed the derived `hasQuickSave` flag. Available slots and the selected
slot remain the two domain facts; the Workbench derives its button labels and disabled state from
their membership relation, so initialization, transitions and test fixtures no longer repeat a
boolean projection.
The application-lifecycle audit then removed `currentRomId`, which always duplicated
`currentRom.id`. Persistence, quick saves, region changes and periodic checkpoints now use the ID
from the current or already captured `RomImage`, reducing the mutable state that load, error, stop
and disposal paths must update in lockstep.
A follow-up unified the runtime and loaded image into one private `ActiveEmulation` record because
neither has a valid independent lifecycle. Load, region replacement, load failure, ejection and
disposal now replace or clear that pair atomically, and asynchronous continuations compare the
captured pair before committing. The record deliberately remains a plain application detail rather
than a new lifecycle aggregate.
An XML-driven visual audit matched 87 input-free, supported-Mapper fixtures exactly and separated
hardware tests from protocol/palette/power-up-policy differences. The controller audit then removed
the internal `Buttons` wrapper and sixteen unused convenience methods, represented the standard
4021 report as exactly eight booleans and saturated its serial position after the trailing high bit.
Short input reports and impossible save-state positions are rejected instead of silently retaining
old buttons or allowing an unbounded index.
The address-bus audit removed the behavior-free `Memory` inheritance layer between the unrelated
CPU and PPU maps. PPU normalization now masks to the physical low 14 bits; JavaScript remainder no
longer leaks negative addresses outside the `$0000-$3FFF` bus domain.
The PPU audit then folded the two-boolean sprite-zero delay back into its sole owner. The public
snapshot shape and one-dot behavior remain unchanged, but the standalone latch class and test file
are gone; focused snapshot coverage and the hardware ROM matrix verify the same transition.
The real-ROM audit added checksum-pinned Mario and Contra profiles outside the normal test suite.
Their local runner verifies cartridge identity, a 300-frame no-input sequence, deterministic
Start/A/B/directional input, exact audio output and a 120-frame Save State replay. Commercial ROM
bytes remain outside the repository and `.nes` files are ignored.
The browser audit then exercised both ROMs through the production UI. It verified measured cadence,
autoplay-blocked recovery, pause/resume buffer clearing, Mapper 0/2 rendering, full-page refresh
persistence for quick-save slot 2, and NTSC/PAL slot isolation.
The console lifecycle controls now expose the existing soft-reset and power-cycle commands without
adding another domain abstraction. A running restart cancels frame scheduling, clears queued audio,
resets the displayed timeline, reapplies held controller buttons and resumes playback; a paused
restart remains paused. Battery-backed RAM and the three quick-save slots stay intact.
The keyboard-focus audit then separated browser controls from gameplay ownership. Focused buttons,
inputs and links retain their default Enter/Space behavior; the focusable Canvas owns P1/P2
bindings, receives focus after successful ROM loading and regains it after Workbench actions. A
held game key still releases correctly if focus moves mid-press.
Persistent quick saves can now be removed through the same application storage port that hydrates
them. The Workbench requires an explicit second activation, cancels confirmation on blur or slot
change, and keeps the in-memory slot available when IndexedDB removal fails or a newer snapshot
replaces the pending deletion. In the latter race, the newer snapshot is written again after the
older removal finishes so it also survives a page reload.
The existing application stop command is now exposed as cartridge ejection without introducing a
new lifecycle abstraction. Ejection clears the active runtime and returns the Workbench to standby
before best-effort battery persistence finishes, so a slow IndexedDB write cannot later stop a ROM
the user loaded in the meantime. Persisted battery data and quick-save records remain available.
The autoplay-recovery audit turned the transport control into an explicit `Enable audio` action
while emulation is running with blocked WebAudio. A new application use case retries the existing
audio port without pausing or rescheduling the console timeline, clears buffered samples before
resuming, and ignores stale completions after another session transition. Quick-save slot buttons
now meet the Workbench's 40-pixel hit-area baseline; the transport icon cross-fades between play,
pause and audio states without a new motion dependency.
The ROM-loading interaction audit now removes the inactive Canvas from the keyboard tab order,
announces each complete status label through a polite live region and labels the picker as `Replace
ROM` while a cartridge is active. Internal drag transitions no longer clear the drop-target state,
and the Workbench exposes its loading state with `aria-busy` without adding a UI state abstraction.

New mapper families are outside the current scope; compatibility work stays on the already supported
Mapper 0/1/2/3/4/7/34 board variants and their verified hardware behavior.
NTSC/PAL DMC combined-register conflicts and revision-specific OAMADDR corruption remain deferred
hardware research; they are not implementation tasks until a reproducible hardware trace supplies
an exact observable result and an automated regression test.
Explicit-stop DMC abort also remains deferred. A shorter load-request delay can match
AccuracyCoin's 16-byte abort vector, but it breaks the independently hardware-backed
`DMA + $2002 Read` timing result. A second experiment followed BreakingNES's DPCM enable/DMA
control latches and distinguished requests created during the current CPU read. It kept the existing
DMA suite green and corrected one abort phase, but still produced
`04 04 04 04 04 04 04 04 02 02 00 00 00 00 00 00` instead of AccuracyCoin's
`04 04 04 04 04 04 03 04 01 01 00 00 00 00 00 00`. Its four extra transient flags were therefore
removed: passing broad regressions is not enough evidence for an incomplete hardware model. The
next attempt must derive the remaining DPCM frequency/request phase from the enable and DMA-control
signals and pass both tests without a ROM-specific exception.

## Real-ROM smoke evidence

- `CONTRA.NES`: the checksum-pinned Mapper 2 profile automates a 300-frame title-screen baseline,
  Start plus movement/fire/jump input, exact audio output and a 120-frame Save State replay. Its
  no-input frame-300 SHA-256 is
  `afc7b953c0ad2c909a9fbf260c271132349b6f108ddc6e4732b06f75e91c0ff3`.
- `MARIO.NES`: the checksum-pinned Mapper 0 profile automates a 300-frame title-screen baseline,
  Start plus movement/run/jump input, exact audio output and a 120-frame Save State replay. Its
  no-input frame-300 SHA-256 is
  `b4c7057486daed529336c7fe1dd25aced70dc52d69e2a03ed5c719fd1263776f`.
- CC0 `bntest-aorom.nes`: iNES Mapper 7, all sixteen 32 KiB PRG banks reported as
  `0123456789ABCDEF`; switched nametable pages reported as `00004444` in Chromium. The legacy image
  and an equivalent NES 2.0 Mapper 7.1 header also produced the same final frame SHA-256 after 300
  core frames.
- Blargg `pal_apu_tests`: 10/10 pass under an explicit PAL execution region, including IRQ-entry and
  length halt/reload writes coincident with a frame-counter clock.
- Blargg `cpu_interrupts_v2`: 5/5 single-test ROMs pass, covering CLI/RTI latency, NMI during
  BRK/IRQ vectoring, IRQ around sprite DMA and the taken non-page-crossing branch poll.
- Blargg `mmc3_test_2`: tests 1-5 pass, including exact scanline-0/1/239 IRQ boundaries.
- Holy Mapperel Mapper 34 BNROM `M34_P128K_CR8K_H.nes`: detailed result `0000`; the pinned
  1200-frame RGBA SHA-256 is `a6c51ac1094541e0ac9987c94b7dd3ff27c67a73557e6978f1594797d6ac28b9`.
- Blargg `ppu_open_bus`: Passed after 250 frames, covering writes to all PPU ports, non-refreshing
  write-only/status reads, palette high bits, OAM attribute masking and one-second latch decay.
- Blargg `sprite_hit_tests_2005.10.05`: 11/11 pass through the zero-page result protocol, including
  8×16 tiles, clipping, right/bottom edges and CPU-visible flag timing.
- Blargg `sprite_overflow_tests`: 5/5 pass through the zero-page result protocol, including precise
  first/last-scanline timing, horizontal-position independence and the diagonal-index pathology.
- Blargg `oam_read`: Passed through the `$6000` protocol.
- Blargg `oam_stress` and `cpu_dummy_writes_oam`: Passed. Quietust's visual-only `read2004.nes`
  now has a checksum-pinned exact runner and matches all 252 compared bytes at zero PPU-dot shift.
- Blargg `ppu_vbl_nmi`: 10/10 single-test ROMs pass, including vblank set/read suppression, immediate
  NMI control, CPU recognition timing and both PPUMASK odd-frame skip boundaries.
- `dmc_dma_during_read4`: `$4016` and both write variants report Passed; `$2007` read produces allowed
  CRC `5E3DF9C4`, and double read produces allowed CRC `85CFD627`.

## Measurement baseline

On 2026-07-12, the old nested FrameBuffer took about 30.63 ms for 120 synthetic 256×240 frame
writes plus RGBA serialization. A flat typed-array candidate took about 9.81 ms on the same process
(about 3.12× faster without domain validation). The committed validated typed-array implementation
measured about 15.11 ms after warm-up, roughly 2× faster than the previous representation. Run
`yarn benchmark:core` to measure it locally.
After the full cycle-state migration and single-engine cleanup, repeated measurements were
16.346–17.252 ms (about 6956–7341 FPS), so no dominant FrameBuffer regression was observed.
The new rendering-loop benchmark measures the complete CPU/PPU/APU/mapper path instead of only pixel
storage. Its first post-`CartridgeMemory` baseline is 1344.519 ms for 300 rendered NROM frames
(223.1 FPS); the concurrent FrameBuffer measurement was 16.475 ms for 120 frames.
The first complete save-state benchmark captures 514,392 typed-array bytes. Forty captures average
0.050 ms each and 200 transactional restores average 0.045 ms each; the concurrent rendered-loop
measurement was 220.4 FPS. Snapshotting is a low-frequency interaction and does not justify
compression, delta encoding or caching without new evidence.
After adding the PPU I/O latch's eight independent `Float64` deadlines, snapshots contain 514,456
typed-array bytes. Capture/restore measured 0.053/0.044 ms each, and five repeated rendered-loop
runs measured 213.8–222.2 FPS with a 220.6 FPS median. The per-dot decay clock therefore has no
measured hot-path regression and does not justify a more complex time source.
The dot-clocked sprite evaluator adds 48 typed-array bytes for secondary OAM and fetch identity;
snapshots now contain 514,504 typed-array bytes and capture/restore measured 0.055/0.046 ms each.
Five rendered-loop runs measured 209.1–212.2 FPS with a 209.7 FPS median, about 5% below the previous
slice. A redundant PPU-side range guard measured no improvement and was removed. Predictive or
batched dual paths would undermine the CPU-visible overflow timing and mid-evaluation snapshot that
the new model exists to preserve, so no more complex optimization is justified by this profile.
Rendering-time OAM bus projection did not enlarge snapshots. A subsequent five-run sample varied
from 188.2–205.3 FPS (197.7 FPS median), while an isolated V8-profile run measured 207.6 FPS. The
profile attributed only 0.7% of samples directly to sprite selection and no separate dominant cost
to the failed-copy continuation, so the noisy difference does not justify a speculative second
execution path.
After adding the exact three-byte overflow continuation and eighth-slot fill-dot latch, snapshots
remain 514,504 typed-array bytes. Five isolated rendered-loop runs measured 191.5–208.7 FPS with a
199.2 FPS median; capture/restore remained 0.054/0.051 ms each. The two scalar states do not form a
measured bottleneck.

The CPU/PPU master-clock slice keeps snapshots at 514,504 typed-array bytes; three save-state runs
measured about 0.058–0.060 ms per capture and 0.058–0.073 ms per restore. Its first integration
measured a 173.8 FPS median. A V8 CPU profile exposed two redundant read synchronizations plus an
empty pre-dot synchronization path. Resynchronizing only after a real DMC stall and proving that an
NTSC read sample cannot cross the first PPU dot raised three isolated rendered-loop runs to
204.5–206.6 FPS (205.8 FPS median). A later three-run sample varied from 191.4–205.3 FPS with a
199.9 FPS median, confirming recovery to the prior baseline but not a statistically meaningful
speedup over it. PAL/Dendy retain the fractional-clock path; no predictive PPU execution path was
introduced.

The former 4096-frame ScriptProcessor callback spanned about 92.9 ms at 44.1 kHz and its 16384-frame
ring could retain about 371.5 ms. At that rate, the AudioWorklet policy uses 512-frame transfers
(about 11.6 ms), a 1024-frame start threshold (about 23.2 ms) and an 8192-frame hard cap. Those frame
counts scale from 20 ms/185 ms targets for 48 kHz and 96 kHz devices. Unit simulations verify startup,
underrun recovery and oldest-first overflow behavior; browser QA verifies the emitted worklet module,
autoplay-blocked state, user-gesture recovery and pause/resume lifecycle with real ROMs.

No other performance optimization should be accepted without a reproducible benchmark or profile.

After the bus-cycle scheduler slice, 300 headless frames measured about 733 ms for `CONTRA.NES`
(409 fps) and 720 ms for `MARIO.NES` (417 fps) on the same local runtime; both retained their prior
final-frame SHA-256 hashes. The FrameBuffer microbenchmark measured 16.70 ms for 120 frames.
