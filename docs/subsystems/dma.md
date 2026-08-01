# DMA subsystem

The RP2A03 shares one CPU data bus between ordinary 6502 execution, the OAM sprite transfer started
by `$4014`, and the DMC sample fetch requested by the delta-modulation channel. `@fcemu/core` models
this as three cooperating domain objects in `domain/emulation/dma/`: `SpriteDma` owns the OAM
halt/GET/PUT transfer, `DmcDma` owns one sample fetch from CPU halt through its GET, and `DmaArbiter`
owns the shared APU GET/PUT bus alignment and grants the bus one CPU cycle at a time. `Bus` wires the
arbiter into the free-running clock and the CPU read/write paths, so DMA never copies bytes inside a
register write: CPU cycle accounting, PPU dot progress and interrupt recognition all continue while a
transfer holds the bus. The behavior below matches [NESdev DMA](https://www.nesdev.org/wiki/DMA) and
the timing rules in `docs/hardware-reference.md`.

## GET/PUT bus phase

The shared 2A03 DMA hardware alternates a read (GET) half-cycle and a write (PUT) half-cycle. This
alignment belongs to the bus owner, not to any single transfer, so `DmaBusPhase`
(`domain/emulation/dma/dma-bus-phase.ts`) is a two-value constant (`"get"`, `"put"`) that both the
arbiter and the channels reference instead of bare string literals.

`DmaArbiter` owns the alignment as a one-bit `getCycleParity` (default `1`). `phaseAt(completedCpuCycle)`
returns `Get` when `completedCpuCycle % 2 === getCycleParity`, else `Put`. CPU cycle parity is not a
hardware identity — the two domains can power up in either alignment — so the parity bit is explicit
saved state (see below). `Bus.currentDmaPhase()` exposes `phaseAt(cpu.cpuCycles)` to the APU, which
uses it to decide load/reload scheduling; the phase is also read at `cpu.cpuCycles + 1` when deciding
whether a DMC halt may begin, and at `cpu.cpuCycles - 1` when committing a pending `$4016` OUT latch
(committed only on a PUT).

## OAM DMA (`$4014`)

`SpriteDma` (`domain/emulation/dma/sprite-dma.ts`) is a four-state machine over
`phase: "idle" | "halt" | "get" | "put"`. It is `active` whenever `phase !== "idle"`; `nextCycle`
exposes the phase to the arbiter.

| `phase` | `clock()` action                                      | next `phase`                            |
| ------- | ----------------------------------------------------- | --------------------------------------- |
| `idle`  | none                                                  | `idle`                                  |
| `halt`  | none (consumes the halt cycle)                        | `get`                                   |
| `get`   | `readValue = readCpuByteForDma((page << 8) \| index)` | `put`                                   |
| `put`   | `writeOamByteForDma(readValue)`; `index++`            | `idle` if `index === 0x100`, else `get` |

A CPU write to `$4014` reaches `PPU.writeRegister`, which calls `Bus.requestSpriteDma(page)` →
`SpriteDma.start(page)`. `start` records the page, resets `index`/`readValue`, and sets
`phase = "halt"`. The transfer therefore attempts to halt on the first CPU cycle after the write.

**Halt only on a read.** `start` makes the channel `active`, but a pending halt does _not_ yet own the
bus (see the arbiter's `ownsBusCycle`). The halt is granted only when the CPU next drives a read: the
whole transfer runs inside `Bus.beginCpuRead`, which stalls that read until the arbiter releases the
bus. A CPU write never stalls for an OAM halt — `Bus.beginCpuWrite` does not grant DMA — so consecutive
CPU writes complete normally.

**Cycle count.** One halt cycle, an optional single alignment cycle (inserted only when the halt is
observed on a PUT so the first `get` lands on a GET), then 256 get/put pairs (512 cycles). OAM DMA
therefore owns **513 or 514** CPU cycles.

**`$4014` RMW page-replace edge.** Because a pending halt does not own the bus, an RMW of `$4014` (its
write-old then write-new cycles both writing before the next read) does not begin the transfer between
the two writes. `start` permits a re-entry while `phase === "halt"` (it only throws if
`active && phase !== "halt"`, i.e. mid-transfer), so the second write replaces the pending page and
resets `index` before the single transfer finally halts on the next read. The write-new page wins.

## DMC DMA

`DmcDma` (`domain/emulation/dma/dmc-dma.ts`) owns one sample fetch. Its lifecycle spans four derived
predicates over the fields `address`, `haltAddress`, `preparationCycles`, `requested`, `running`,
`haltPhase`:

| Predicate         | Definition                                                      |
| ----------------- | --------------------------------------------------------------- |
| `active`          | `running`                                                       |
| `pending`         | `requested && !running`                                         |
| `preparing`       | `preparationCycles > 0`                                         |
| `ready`           | `running && preparationCycles === 0`                            |
| `canBegin(phase)` | `pending && (haltPhase === undefined \|\| haltPhase === phase)` |

**Request scheduling and the retained halt phase.** The APU delta-modulation channel
(`domain/emulation/apu/delta-modulation-channel.ts`) requests a fetch through `Bus.requestDmcDma` →
`DmcDma.start(address, haltPhase)`, passing the phase on which the halt should be attempted:

- A **load** fetch is scheduled for **GET**: after a `$4015` write enables an empty reader buffer, the
  channel arms `transferStartDelay` for 4 CPU cycles after a GET write or 3 after a PUT write, then
  calls `requestReaderDma(DmaBusPhase.Get)`. Both paths target the next-but-one GET.
- A **reload** fetch is scheduled for **PUT**: when the output shifter consumes the reader buffer
  (`updateShifter`), `requestReaderDma(DmaBusPhase.Put)` runs immediately rather than waiting a full
  DMC period. The measured NTSC implicit-stop "unexpected reload" path also schedules a PUT reload.

`start` ignores a duplicate request (`if (this.requested) return`), and records `haltPhase`. The
retained phase means the halt is attempted only on a matching GET/PUT cycle — `canBegin` gates it.

**Retry after a missed write-cycle halt.** If the scheduled halt cycle turns out to be a CPU _write_,
`Bus.beginCpuWrite` calls `DmaArbiter.missDmcHaltOnWrite(phaseAt(cpu.cpuCycles + 1))` →
`DmcDma.missHaltOnWrite(phase)`, which clears `haltPhase` (`= undefined`) when that cycle was the one
it could have begun on. The still-pending request then retries with no phase restriction, halting on
the next readable CPU cycle.

**Begin and the preparation cycles.** `begin(haltAddress)` (invoked by the bus, see below) records the
halted-CPU address, sets `preparationCycles = 2` and `running = true`. The arbiter then clocks the
transfer:

| Cycle (arbiter call)          | `DmcDmaCycle` | Effect                                                                                    |
| ----------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| `clockPreparation` (2→1)      | `"halt"`      | `repeatHaltedCpuReadForDma(haltAddress)`                                                  |
| `clockPreparation` (1→0)      | `"dummy"`     | repeats the halted read unless it has a single side effect (see below)                    |
| `clockAlignment` (PUT, ready) | `"alignment"` | inserted only when `ready` lands on a PUT; repeats the halted read                        |
| `clockGet` (GET, ready)       | `"get"`       | `readDmcByteForDma(address, haltAddress)`, then `reset()` and `completeDmcDmaByte(value)` |

The DMC stall is thus halt + dummy + optional alignment + get. `clockGet` calls `reset()` before
`completeDmcDmaByte`, so the channel is idle again the moment the sample is delivered.

**Single-side-effect halted read.** `haltedReadHasSingleSideEffect` is true when `haltAddress` is
`$4016` or `$4017`. For those addresses the `"dummy"` and `"alignment"` cycles skip
`repeatHaltedCpuReadForDma`, so a serial controller/expansion port is clocked only once (on the halt),
not on every stall cycle. `Bus.repeatHaltedCpuReadForDma` additionally suppresses the `$4016`/`$4017`
repeat entirely when `timing.dmcDmaControllerReadGlitch` is off (PAL and unverified Dendy), modeling
the NTSC-only controller-clock glitch. The repeat drives both the internal and external CPU buses
(`cpu.repeatHaltedReadForDma` → `memory.read`), unlike the DMA sample fetch which drives only the
external pins (`cpu.readByteForDma` → `memory.readForDma`).

**Split A0-A4 / A5-A15 address.** During the GET, DMA drives address bits A0-A4 while the halted 6502
retains A5-A15. `Bus.readDmcByteForDma(address, haltedCpuAddress)` reads the external sample byte at the
real `address`, then reproduces the internal-register activation: if the halted CPU half selects
`$4000-$401F` (`(haltedCpuAddress & 0xffe0) === 0x4000`), it forms `internalAddress = 0x4000 | (address & 0x1f)`
from the DMA-driven low five bits and, when that lands in `$4015-$4017`, performs a second internal read
of that register. So a sample fetch can acknowledge the frame IRQ (`$4015`) or clock a controller port
(`$4016`/`$4017`) as a side effect, with the activated register chosen by the sample address' low bits.
`$4015` acknowledges without replacing the external data latch (see `domain/emulation/memory.ts`).

## `DmaArbiter`

`DmaArbiter` (`domain/emulation/dma/dma-arbiter.ts`) composes one `SpriteDma`, one `DmcDma` and the
`getCycleParity` cadence bit. It is `active` when either channel is active, and exposes the grant
decision to the bus:

- `ownsBusCycle` — `dmc.active || (sprite.active && sprite.nextCycle !== "halt")`. An active DMC or an
  OAM transfer already past its halt owns the next cycle.
- `awaitingSpriteHalt` — `sprite.nextCycle === "halt"`. A pending OAM halt does _not_ own the bus; it
  must first observe a CPU read (or, in the free run, an instruction boundary).
- `hasPendingDmc` — `dmc.pending`.

**One cycle at a time.** `clock(completedCpuCycles, port)` advances exactly one channel cycle and
returns which cycle ran (`DmaCycle = DmcDmaCycle | SpriteDmaCycle | "sprite-and-dmc-preparation"`). The
GET/PUT eligibility rules:

- If DMC is `preparing`, its `halt`/`dummy` cycle runs regardless of phase. If OAM is simultaneously
  eligible (`canClockSprite`) the sprite is clocked in the same call and the result is
  `"sprite-and-dmc-preparation"` — the two overlap.
- **DMC steals the GET.** If DMC is `ready` and this is a GET cycle, `clockGet` runs _before_ any sprite
  cycle. During an in-progress OAM transfer whose next cycle is also a `get`, the DMC wins that GET; the
  sprite's `phase` stays `get`, so on the following PUT cycle `canClockSprite` is false and the arbiter
  returns `"alignment"` (OAM realigns), then takes its own GET on the next GET cycle.
- Otherwise `canClockSprite(getCycle)` grants the sprite when its next cycle is `halt`, or a `get` on a
  GET, or a `put` on a PUT.
- A `ready` DMC on a PUT with no eligible sprite runs `clockAlignment`; a fully idle arbiter returns
  `"idle"`.

`canBeginDmcAt(completedCpuCycle)` = `dmc.canBegin(phaseAt(completedCpuCycle))`, and `beginDmc(haltAddress)`
forwards to `DmcDma.begin` — the bus uses these to start the DMC halt on the correct phase.

## Bus integration

`Bus` implements `DmaArbiterPort` and drives the arbiter from two entry points.

**Free-running clock — `Bus.update()`.** Each CPU cycle:

1. If a DMA is already `active` and `canBeginDmcAt(cpu.cpuCycles + 1)`, begin the DMC halt with
   `cpu.state.PC` as the halted address. (This is the mid-OAM DMC overlap; a standalone DMC halt starts
   from the read path below.)
2. `dmaOwnsCycle = dma.ownsBusCycle || (dma.awaitingSpriteHalt && !cpu.hasActiveInstruction)`. When
   true the cycle is `cpu.clockDmaCycle()` (a bus-owned stall cycle) instead of `cpu.clock()`; the OAM
   halt is only taken here at an instruction boundary.
3. On a DMA-owned cycle the APU is synchronized to the completed CPU cycles and `dma.clock(cpu.cpuCycles, this)`
   advances the transfer; `cpu.finishDmaCycle()` samples interrupts after the PPU/APU catch up.

**Stalled CPU read — `Bus.beginCpuRead(address)`.** Called when the CPU is about to read the bus (returns
whether the read stalled). It returns `false` immediately if a DMA memory access is already in flight
(`performingDmaMemoryAccess`, set around every `readCpuByteForDma`/`readDmcByteForDma`/`repeatHaltedCpuReadForDma`/
`writeOamByteForDma`), preventing re-entry. Otherwise it synchronizes the PPU/APU for the read (catching
the APU up when the read targets `$4015` or the DMC may still request a halt), begins a pending DMC with
`address` as the halted-CPU address, then loops `while (dma.active)`:

- re-checks `canBeginDmcAt(cpu.cpuCycles + 1)` every iteration — so a buffer emptied mid-transfer can
  steal a GET from an in-progress OAM transfer rather than waiting for all 256 bytes;
- runs `cpu.clockDmaCycle()`, syncs the APU, advances `dma.clock`, commits any pending controller write,
  and samples NMI/IRQ and PPU dots for the stall cycle.

This is the halt-on-read path: the whole OAM or DMC transfer executes here, one CPU cycle at a time,
with the CPU's read deferred until DMA releases the bus.

**Write path — `Bus.beginCpuWrite()`.** Never grants DMA (a halt cannot occur on a write). It calls
`missDmcHaltOnWrite(phaseAt(cpu.cpuCycles + 1))` so a DMC halt scheduled for this write cycle drops its
phase restriction and retries, then synchronizes the PPU for the write.

**Accounting during transfers.** Because each stall cycle is a real `cpu.clockDmaCycle()`
(increments `cpu.cpuCycles`, runs `interrupts.beginCpuUpdate()`) followed by PPU/APU synchronization and
`cpu.sampleNmiLine()` / `cpu.finishDmaCycle()` (`interrupts.captureIrqDuringDma()`), CPU cycle
accounting, PPU dot progress, mapper PPU-address timing and interrupt recognition all continue during
DMA. IRQs first sampled during DMA wait for the halted instruction; pre-sampled IRQs keep their
original service point. The pending `$4016` OUT latch is committed by `commitControllerWrite` only on a
PUT cycle (`phaseAt(cpu.cpuCycles - 1) === Put`), so DMA phase governs controller strobe timing too.

## Save state

`DmaArbiter.captureState()` returns a typed `DmaArbiterState`, restored transactionally by `Bus`
(`captureState` rolls back all aggregates if any nested invariant fails). `restoreState` re-validates
every field:

| Field                    | Contents                                                                                    | Validation                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `cadence.getCycleParity` | GET/PUT bus alignment bit                                                                   | must be `0` or `1`                                                                                  |
| `sprite`                 | `page`, `index`, `readValue`, `phase`                                                       | `page`/`readValue` a byte, `index` in `0..0x100`, valid phase, final index only while idle          |
| `dmc`                    | `address`, `haltAddress`, `preparationCycles`, `requested`, `running`, optional `haltPhase` | addresses 16-bit, booleans exact, preparation in `0..2` only while running, request/phase coherence |

`DmaArbiter.restoreState` validates the cadence and both child transfers before assigning any of
them. `SpriteDma` and `DmcDma` expose the same pure validators to the aggregate and run them again
for direct restoration, so malformed DMC state cannot leave a new cadence or partially restored OAM
transfer behind.

`haltPhase` is the retained requested halt phase and is omitted from the snapshot when `undefined`. The
DMC **implicit-stop / enable-disable delay counters** (`transferStartDelay`, `disableDelay`) are _not_
part of `DmaArbiterState`; they belong to the APU delta-modulation channel and are persisted in the APU
snapshot, keeping the DMA arbiter's state limited to the shared bus alignment and the two channels'
transfer state.

## Verification and known limits

Focused tests cover 513/514-cycle OAM transfers, halt-on-read, RMW page replacement, DMC
preparation/alignment, OAM overlap, GET priority and mid-transfer snapshots. Checksum-pinned
AccuracyCoin, Quietust and Sprite/DMC collision fixtures exercise CPU/APU/PPU side effects through
the integrated bus; see
[External conformance ROMs](../../packages/fc-emu/test-support/external-roms.md).

The NTSC controller-read glitch and implicit-stop races use explicitly selected evidence profiles.
PAL disables the controller glitch; Dendy remains conservative where clone measurements are absent.
Unresolved explicit-stop DMC phases are tracked in
[Engineering roadmap](../engineering-roadmap.md), not hidden behind title-specific timing.

## Source files

- `packages/fc-emu/src/domain/emulation/dma/dma-bus-phase.ts` — the shared GET/PUT phase constant.
- `packages/fc-emu/src/domain/emulation/dma/sprite-dma.ts` — OAM `$4014` halt/GET/PUT transfer.
- `packages/fc-emu/src/domain/emulation/dma/dmc-dma.ts` — one DMC sample fetch from halt through GET.
- `packages/fc-emu/src/domain/emulation/dma/dma-arbiter.ts` — cadence ownership and one-cycle bus grants.
- `packages/fc-emu/src/domain/emulation/bus.ts` — wires the arbiter into the clock and CPU read/write paths.
- `packages/fc-emu/src/domain/emulation/apu/delta-modulation-channel.ts` — schedules DMC load/reload fetches and owns the implicit-stop counters.
