# Clock and timing subsystem

`@fcemu/core` models the console's time base as two collaborators. `ConsoleTiming` is immutable,
per-region clock-domain data — CPU frequency, the rational CPU-to-PPU master-clock divider,
scanline/vblank geometry and the APU silicon profile — selected once when a `Bus` is built.
`MachineClock` is the only stateful time authority: it owns committed CPU time, projects the
in-flight bus cycle, drives the APU forward one CPU cycle at a time, and advances the PPU by
emitting the exact master-clock value of every dot, carrying PAL's fractional remainder so no dot is
gained or lost across CPU cycles. Together they replace the earlier scheme of independent CPU/APU
and CPU/PPU watermark objects with one source of truth, and they expose the sub-cycle phase at which
the CPU samples reads, writes and `/NMI`. See the NESdev
[cycle reference chart](https://www.nesdev.org/wiki/Clock_rate) for the hardware cadence these
values reproduce.

## ConsoleTiming: immutable per-region clock domain

`ConsoleTiming` (`packages/fc-emu/src/domain/emulation/console-timing.ts`) is a frozen record
describing one clock domain. Three regions exist — `ntsc`, `pal`, `dendy` — each built once at
module load by `defineConsoleTiming` and frozen into `CONSOLE_TIMINGS`. Stored fields are
`region`, `cpuFrequencyHz`, `scanlinesPerFrame`, `vblankStartScanline`, `skipsOddFrameDot`,
`dmcDmaControllerReadGlitch`, the `cpuPpu` divider record and the `apu` profile. Three further
fields are derived by `defineConsoleTiming` rather than stored as literals:

- `preRenderScanline = scanlinesPerFrame - 1`.
- `ppuFrequencyHz = cpuFrequencyHz * cpuMasterClockDivider / ppuMasterClockDivider`.
- `frameRateHz = ppuFrequencyHz / averageDotsPerFrame`, where
  `averageDotsPerFrame = scanlinesPerFrame * 341 - (skipsOddFrameDot ? 0.5 : 0)`. The `0.5` term
  accounts for NTSC dropping one dot on odd frames when rendering is enabled; PAL and Dendy never
  skip, so their average is a whole number.

The record is the shared input to CPU, PPU and APU: `Bus` resolves it once and passes it to
`new PPU(this, timing)` and `new APU(this, timing, sampleRate)`, and hands `timing.cpuPpu` to
`new MachineClock(...)`.

### Per-region constants

Values are read directly from the source; derived quantities are marked and computed from the
stored fields above.

| Field                           | NTSC              | PAL              | Dendy             |
| ------------------------------- | ----------------- | ---------------- | ----------------- |
| `region`                        | `ntsc`            | `pal`            | `dendy`           |
| `cpuFrequencyHz`                | 1,789,773         | 1,662,607        | 1,773,448         |
| `cpuMasterClockDivider`         | 12                | 16               | 15                |
| `ppuMasterClockDivider`         | 4                 | 5                | 5                 |
| CPU cycle : PPU dot ratio       | 12/4 = 3          | 16/5 = 3.2       | 15/5 = 3          |
| `ppuFrequencyHz` (derived)      | 5,369,319         | 5,320,342.4      | 5,320,344         |
| `scanlinesPerFrame`             | 262               | 312              | 312               |
| `preRenderScanline` (derived)   | 261               | 311              | 311               |
| `vblankStartScanline`           | 241               | 241              | 291               |
| `averageDotsPerFrame` (derived) | 89,341.5          | 106,392          | 106,392           |
| `frameRateHz` (derived)         | ≈ 60.0988         | ≈ 50.0070        | ≈ 50.0070         |
| `skipsOddFrameDot`              | `true`            | `false`          | `false`           |
| `dmcDmaControllerReadGlitch`    | `true`            | `false`          | `false`           |
| `readSampleMasterClock`         | 5                 | 7                | 6                 |
| `writeSampleMasterClock`        | 7                 | 9                | 8                 |
| `interruptSampleMasterClock`    | 8                 | 9                | 8                 |
| `apu` profile                   | `NTSC_APU_TIMING` | `PAL_APU_TIMING` | `NTSC_APU_TIMING` |

Only PAL has a non-integer CPU-cycle-to-dot ratio (3.2). NTSC and Dendy divide evenly, which is why
their fractional remainder returns to zero at every CPU-cycle boundary while PAL's does not.
`skipsOddFrameDot` and `dmcDmaControllerReadGlitch` are region silicon distinctions owned here and
consumed by the PPU odd-frame logic and the DMC controller-read glitch respectively; they are not
clock arithmetic but travel with the clock domain.

## The rational CPU-to-PPU divider

`CpuPpuTiming` (the `cpuPpu` field) is the subset of clock data `MachineClock` needs, and it is
structurally identical to `MachineClockTiming`:

- `cpuMasterClockDivider` / `ppuMasterClockDivider` — master oscillator ticks per CPU cycle and per
  PPU dot. One CPU cycle spans `cpuMasterClockDivider` master clocks; one PPU dot spans
  `ppuMasterClockDivider`.
- `readSampleMasterClock`, `writeSampleMasterClock`, `interruptSampleMasterClock` — the offset, in
  master clocks from the start of a CPU cycle, at which the CPU samples a read, a write and the
  interrupt/`/NMI` line respectively. `MachineClock` validates that each is a positive safe integer
  strictly less than `cpuMasterClockDivider`, i.e. every sample lands inside its own CPU cycle.

`CPU_PPU_TIMINGS` defines these as `defineCpuPpuTiming(cpuDiv, ppuDiv, read, write, interrupt)`:
`ntsc` = `(12, 4, 5, 7, 8)`, `pal` = `(16, 5, 7, 9, 9)`, `dendy` = `(15, 5, 6, 8, 8)`. The dividers
reproduce the documented rule that the NTSC console divides one master oscillator by 12 (CPU) and 4
(PPU), while PAL divides by 16 and 5.

## The APU timing profile

`ApuTiming` holds the CPU-cycle positions and timer reloads owned by one APU silicon family.
NTSC and Dendy share `NTSC_APU_TIMING`; PAL uses `PAL_APU_TIMING`. `defineApuTiming` derives the two
end cycles from the last half-frame cycle: `fourStepEndCycle = secondHalfCycle + 1` and
`fiveStepEndCycle = fiveStepFinalHalfCycle + 1`. See
[APU frame counter](https://www.nesdev.org/wiki/APU_Frame_Counter) and
[APU DMC](https://www.nesdev.org/wiki/APU_DMC).

| Field                             | NTSC & Dendy (2A03) | PAL (2A07) |
| --------------------------------- | ------------------- | ---------- |
| `firstQuarterCycle`               | 7,457               | 8,313      |
| `firstHalfCycle`                  | 14,913              | 16,627     |
| `secondQuarterCycle`              | 22,371              | 24,939     |
| `secondHalfCycle`                 | 29,829              | 33,253     |
| `fiveStepFinalHalfCycle`          | 37,281              | 41,565     |
| `fourStepEndCycle` (derived)      | 29,830              | 33,254     |
| `fiveStepEndCycle` (derived)      | 37,282              | 41,566     |
| `channelRegisterWriteDelayCycles` | 0                   | 1          |

`channelRegisterWriteDelayCycles` is the 2A07 channel PUT delay: PAL delays a `$4000-$400F` register
write by one CPU cycle before it commits, NTSC and Dendy apply no delay. `Bus.scheduleApuRegisterWrite`
reads this field and adds the delay only for addresses at or below `$400F`.

The 16-entry timer-period tables (indexed by the channel's period selector):

- Noise, NTSC & Dendy: `1, 3, 7, 15, 31, 47, 63, 79, 100, 126, 189, 253, 380, 507, 1016, 2033`.
- Noise, PAL: `1, 3, 6, 14, 29, 43, 58, 73, 93, 117, 176, 235, 353, 471, 944, 1888`.
- DMC, NTSC & Dendy: `428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54`.
- DMC, PAL: `398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50`.

The DMC periods are full CPU-cycle counts. Both tables are frozen arrays; the APU indexes them and
does not own the values.

## MachineClock: the single time source

`MachineClock` (`packages/fc-emu/src/domain/emulation/clock/machine-clock.ts`) holds five scalars
and is constructed from a `MachineClockTiming`, validated once by `validateTiming`. Its state:

- `committedCpuCycle` — committed CPU time; the count of fully retired CPU cycles.
- `synchronizedApuCycle` — how far the APU has been clocked; never exceeds `committedCpuCycle`.
- `synchronizedPpuMasterClock` — the master-clock value the PPU has been advanced to.
- `ppuClockRemainder` — leftover master clocks not yet consumed by a whole dot; sole authority.
- `cpuCycleAtUpdateStart` — the CPU-cycle baseline captured at the start of the current update, used
  to project the in-flight cycle.

### Committed CPU time and projected bus time

`beginCpuUpdate(totalCpuCycles)` records the baseline for the update. During the update,
`elapsedCpuCycles(totalCpuCycles)` returns `totalCpuCycles - cpuCycleAtUpdateStart` and throws
`RangeError` if the watermark moved backwards. From that:

- `completedCpuCycles(total)` = `committedCpuCycle + elapsed` — cycles fully done so far.
- `currentCpuBusCycle(total)` = `committedCpuCycle + max(1, elapsed)` — the _projected_ bus cycle of
  the access in flight, at least one cycle ahead so an access on the update's first cycle still
  projects forward. `Bus` uses this to schedule APU register writes and to catch the APU up to the
  current instruction's final I/O cycle.
- `commitCpuCycles(cycles)` advances `committedCpuCycle`, first checking that both the new cycle
  count and its master-clock product remain safe integers, throwing `RangeError` otherwise.

### Synchronized APU time

`synchronizeApuTo(targetCpuCycle, clockApu)` steps the APU forward one CPU cycle at a time —
`clockApu()` then `synchronizedApuCycle++` — until the watermark reaches the target.
`synchronizeApuCommitted` catches the APU up to `committedCpuCycle`. `synchronizedApuCpuCycle` and
`remainingCommittedApuCycles` (`committedCpuCycle - synchronizedApuCycle`) expose the lag. The APU is
strictly subordinate: it is pulled forward to CPU time, never ahead of it.

### PPU master-clock phase

The PPU is advanced by target master-clock value, not by dot count. `MachineClock` exposes several
targets, each computed from a CPU-cycle boundary plus an optional sub-cycle sample offset, all
routed through the private `synchronizePpuTo`:

- `synchronizePpuCurrentRead` / `synchronizePpuCurrentWrite` — the current (`committed + elapsed`)
  CPU cycle start plus `readSampleMasterClock` / `writeSampleMasterClock`.
- `synchronizePpuAdvancedRead` / `synchronizePpuAdvancedWrite` — the _previous_ completed cycle start
  plus the same offsets, used for DMA bus samples; `advancedCpuCycleStartMasterClock` throws if no
  CPU cycle has completed yet in this update.
- `synchronizePpuCompletedCpuCycles` — the full boundary of the last completed cycle.
- `synchronizePpuCompletedInterruptSample` / `synchronizePpuCommittedInterruptSample` — one CPU cycle
  back plus `interruptSampleMasterClock` (the `/NMI` sampling phase; see below). Both no-op when no
  cycle has retired.
- `synchronizePpuCommitted` — the full committed-time boundary.

`readSampleRequiresPpuSynchronization` reports whether a read must advance the PPU before the CPU
samples the bus: it is true when `cpuMasterClockDivider % ppuMasterClockDivider !== 0` (a fractional
ratio, i.e. PAL) or when `readSampleMasterClock >= ppuMasterClockDivider` (the read lands past the
first dot). All three shipped regions satisfy this, so `Bus` reads the flag once at construction and
gates its current/advanced read synchronization on it.

`Bus` supplies the concrete `PpuClock` callback (`clockPpuDot`), which updates the PPU and, for
address-observing mappers, ticks mapper timing per dot. `MachineClock` calls it once per emitted dot
with that dot's exact master-clock value.

## Fractional PPU cadence and the remainder

`synchronizePpuTo(targetMasterClock, clockPpu)` is the only place dots are emitted. It rejects a
target that is not a safe integer or that moved backwards, then:

1. `elapsedMasterClocks = targetMasterClock - synchronizedPpuMasterClock`.
2. `accumulatedMasterClocks = elapsedMasterClocks + ppuClockRemainder` — carrying the fractional
   leftover from the previous synchronization.
3. If `accumulated < ppuMasterClockDivider`, no whole dot elapsed: store `accumulated` as the new
   `ppuClockRemainder`, advance `synchronizedPpuMasterClock` to the target, and return without
   clocking the PPU.
4. Otherwise emit `floor(accumulated / ppuMasterClockDivider)` dots. The first dot lands
   `ppuMasterClockDivider - ppuClockRemainder` master clocks after `synchronizedPpuMasterClock`, and
   each subsequent dot one full divider later; every call passes the dot's absolute master clock.
   The new remainder is `accumulated % ppuMasterClockDivider`, always in `[0, ppuMasterClockDivider)`.

**Why a remainder rather than per-instruction rounding.** On PAL one CPU cycle is 16 master clocks
and one PPU dot is 5, so a CPU cycle spans 16/5 = 3.2 dots. Any scheme that rounds this ratio each
CPU cycle — 3 dots, or 4 — drifts by a fraction of a dot every cycle. Over five CPU cycles the exact
count is 80 master clocks = 16 dots; rounding to 3 per cycle loses a dot every five cycles and rounding
to 4 gains one every five. Because dot-addressed PPU behavior (odd-frame skip, vblank/NMI edge
suppression, rendering-time OAM access) cannot be reconstructed from scanline or instruction
boundaries, a lost or duplicated dot is an observable divergence. Carrying `ppuClockRemainder`
across synchronizations makes the dot count exact over any interval: the fractional part is retained,
not discarded. The same mechanism also resolves sub-cycle sample offsets on the integer-ratio
regions — an NTSC read at master clock 5 sits between dot boundaries 4 and 8, so a remainder of 1 is
carried until the CPU cycle completes and the third dot is emitted at the boundary. This is the
`ConsoleTiming` / `MachineClock` split: the divider ratio is immutable regional data, but the single
running remainder that realizes it is stateful and owned in exactly one place.

## The CPU /NMI input-sampling boundary

The PPU drives a physical `/NMI` level; the CPU edge detector samples it during a specific sub-cycle
phase, and the clock exposes exactly that phase through `interruptSampleMasterClock`. `Bus.update`
orders the boundary precisely: after committing the cycle it calls
`synchronizePpuCommittedInterruptSample(clockPpuDot)` to advance the PPU to
`(committedCpuCycle - 1) * cpuMasterClockDivider + interruptSampleMasterClock`, then
`cpu.sampleNmiLine()`, then `synchronizePpuCommitted(clockPpuDot)` to reach the full cycle boundary.
Advancing the PPU only to the sampling phase before the CPU reads the line lets a short PPUSTATUS
race pulse disappear before it can be latched, while a genuinely sampled edge stays pending — the
behavior described for the `/NMI` edge detector in
[CPU interrupts](https://www.nesdev.org/wiki/Interrupts) and
[PPU frame timing](https://www.nesdev.org/wiki/PPU_frame_timing). The DMA-stalled read path applies
the same three-step order per stolen cycle.

## Region resolution and the override path

`resolveConsoleTiming(mode, regionOverride?)` selects the domain. An explicit `regionOverride` wins
immediately and returns that region's frozen `ConsoleTiming`. Without one it maps the cartridge's
declared `CartridgeTimingMode`: `Pal → pal`, `Dendy → dendy`, and both `Ntsc` and `MultiRegion →
ntsc`. Multi-region headers therefore resolve deterministically to NTSC in automatic mode rather
than being treated as ambiguous.

The override threads through the layers without the core learning any UI policy. `Bus`'s constructor
takes an optional `consoleRegion` and calls `resolveConsoleTiming(cartridge.timingMode,
consoleRegion)`. `Emulator` (`packages/fc-emu/src/application/emulator.ts`) forwards
`configuration.consoleRegion` and reports the resolved region back as `cartridge.consoleRegion` and
`frameRateHz`. In the UI, `RegionPreference` is `auto | ntsc | pal | dendy`
(`packages/ui/src/domain/execution-region.ts`); the core adapter converts it with
`regionPreference === "auto" ? {} : { consoleRegion: regionPreference }`, so `auto` passes no
override and lets `resolveConsoleTiming` apply the header mapping.

## Runtime rebuild on region change

Because `ConsoleTiming` is chosen at `Bus` construction and is immutable, changing region rebuilds
the runtime rather than mutating the clock. `EmulatorApplication.setRegionPreference`
(`packages/ui/src/application/emulator-application.ts`) performs this transactionally: it captures
the outgoing runtime's battery save, builds a fresh runtime for the new preference, restores that
battery save when the new cartridge has battery backup, and reapplies current controller intents.
If reconstruction throws, it reverts the preference and keeps the old runtime — no partial swap. On
success it installs the new runtime, persists the old one, preserves paused/running lifecycle
(resuming play only if the session was running), and keeps quick-saves only when the resolved region
is unchanged, clearing and rehydrating them otherwise. Save RAM and held controller state cross the
boundary; the core stays unaware of the preference machinery.

## Save-state watermarks and envelope versions

`MachineClock.captureState` / `restoreState` own the clock's five watermarks: `committedCpuCycle`,
`synchronizedApuCycle`, `synchronizedPpuMasterClock`, `ppuClockRemainder` and
`cpuCycleAtUpdateStart`. Restore validates them against the live timing rather than trusting the
blob:

- The four integer watermarks must be non-negative safe integers.
- `ppuClockRemainder` must be an integer in `[0, ppuMasterClockDivider)` — bounded by the _current_
  divider, so a remainder saved under one region cannot be replayed under another.
- `committedCpuCycle * cpuMasterClockDivider` must stay a safe integer, and the watermarks must be
  mutually consistent: `synchronizedApuCycle` and `cpuCycleAtUpdateStart` cannot exceed
  `committedCpuCycle`, and `synchronizedPpuMasterClock` cannot exceed the committed master clock.

Any violation throws `RangeError` and leaves the clock untouched, so `Bus` can roll the whole
snapshot back. `reset` zeroes all five for power-on / soft reset.

These watermarks are part of the public save-state envelope carried by `EmulatorSaveState`
(current `SAVE_STATE_VERSION = 13`, guarded together with format, ROM identity and console region).
The clock-relevant milestones in the envelope's history: making the CPU/PPU master-clock watermarks
explicit advanced it to version 4, and consolidating all console watermarks into `MachineClock` —
retiring the separate CPU/APU and CPU/PPU watermark objects `Bus` previously coordinated — advanced
it to version 5. Later increments (through 13) are unrelated to the clock. Older in-memory snapshots
are rejected explicitly rather than restored with ambiguous state.

## Source files

- `packages/fc-emu/src/domain/emulation/console-timing.ts` — immutable per-region clock domains, the
  APU timing profiles and `resolveConsoleTiming`.
- `packages/fc-emu/src/domain/emulation/clock/machine-clock.ts` — the stateful CPU/APU/PPU time
  source, fractional PPU remainder and sample/interrupt phase boundaries.
- `packages/fc-emu/src/domain/emulation/bus.ts` — constructs the clock, supplies the per-dot
  `PpuClock` callback and orders the `/NMI` sampling boundary.
- `packages/fc-emu/src/application/emulator.ts` — forwards the region override and carries the clock
  watermarks in the save-state envelope.
- `packages/ui/src/domain/execution-region.ts`,
  `packages/ui/src/application/emulator-application.ts` — the `auto`/NTSC/PAL/Dendy preference and the
  transactional region-change runtime rebuild.
