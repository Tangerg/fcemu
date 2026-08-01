# RP2A03 APU

The [`APU`](https://www.nesdev.org/wiki/APU) aggregate in `packages/fc-emu/src/domain/emulation/apu.ts`
models the RP2A03's audio unit as one CPU-clocked chip. It owns five channels — two
[pulse](https://www.nesdev.org/wiki/APU_Pulse) generators (with independent sweep and duty),
a [triangle](https://www.nesdev.org/wiki/APU_Triangle), a [noise](https://www.nesdev.org/wiki/APU_Noise)
LFSR and a [delta-modulation channel (DMC)](https://www.nesdev.org/wiki/APU_DMC) — plus the
[frame sequencer](https://www.nesdev.org/wiki/APU_Frame_Counter), the [nonlinear mixer](https://www.nesdev.org/wiki/APU_Mixer)
and the analog RC output filters. Deterministic timing and modulation rules are delegated to the
`FrameSequencer`, `Envelope`, `LengthCounter` and `DeltaModulationChannel` domain objects under
`apu/`; the DMC touches the console only through the narrow `DmcChannelPort`. Register writes enter
an ordered per-cycle event queue and commit after the target APU tick, while a `$4015` read catches
the APU up to the current CPU cycle. Everything downstream of the mixer's per-sample output — device
sample rate, ring buffering, AudioWorklet — is UI infrastructure reached through the core's
application audio port.

## Register map ($4000–$4017)

`writeRegister(address, value)` decodes the addresses below; every other address is a no-op, and
`readRegister` returns `0` for all addresses except `$4015`. `$4009`, `$400D`, `$4014` and `$4016`
have no APU write case. See [APU registers](https://www.nesdev.org/wiki/APU_registers).

| Addr            | Channel  | Setter / effect                     | Fields (bit layout)                                                                                                                   |
| --------------- | -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `$4000`         | Pulse 1  | `control`                           | `DDLC VVVV` — duty index (7–6), length-halt / envelope-loop (5), constant-volume (4), volume/period (3–0); calls `envelope.configure` |
| `$4001`         | Pulse 1  | `sweep`                             | `EPPP NSSS` — enable (7), divider period (6–4), negate (3), shift (2–0); sets `sweepReload`                                           |
| `$4002`         | Pulse 1  | `timerLow`                          | low 8 bits of timer period                                                                                                            |
| `$4003`         | Pulse 1  | `setTimerHigh`                      | `----- HHH` timer high 3 bits; loads length from `value >> 3`; restarts envelope; resets duty step                                    |
| `$4004`–`$4007` | Pulse 2  | (as `$4000`–`$4003`)                | identical to Pulse 1                                                                                                                  |
| `$4008`         | Triangle | `control`                           | `CRRR RRRR` — length-halt / linear-control (7), linear-counter reload value (6–0)                                                     |
| `$400A`         | Triangle | `timerLow`                          | low 8 bits of timer period                                                                                                            |
| `$400B`         | Triangle | `setTimerHigh`                      | timer high 3 bits; loads length; reloads timer value; sets linear-counter reload flag                                                 |
| `$400C`         | Noise    | `control`                           | `--LC VVVV` — length-halt / loop (5), constant-volume (4), volume/period (3–0)                                                        |
| `$400E`         | Noise    | `period`                            | `M--- PPPP` — mode bit (7), period index into region table (3–0)                                                                      |
| `$400F`         | Noise    | `setLength`                         | loads length from `value >> 3`; restarts envelope                                                                                     |
| `$4010`         | DMC      | `control`                           | `IL-- RRRR` — IRQ enable (7), loop (6), rate index (3–0); disabling IRQ clears the pending flag                                       |
| `$4011`         | DMC      | `value`                             | `-DDD DDDD` direct output level (`value & 0x7f`)                                                                                      |
| `$4012`         | DMC      | `address`                           | sample address = `0xC000 + (value << 6)`                                                                                              |
| `$4013`         | DMC      | `length`                            | sample length = `1 + (value << 4)`                                                                                                    |
| `$4015`         | Status   | `control` (write) / `status` (read) | write enables channels and clears DMC IRQ; read returns status                                                                        |
| `$4017`         | Frame    | `frameCounter`                      | `MI-- ----` — mode (7), IRQ inhibit (6); routed to `FrameSequencer.write`                                                             |

## Frame sequencer

`FrameSequencer` (`apu/frame-sequencer.ts`) is clocked once per CPU cycle from `APU.update` and
drives four sink callbacks: `quarterFrame`, `halfFrame`, `requestIRQ`, `clearIRQ`. In the APU these
map to:

- `quarterFrame` → `updateEnvelope`: clocks the two pulse envelopes, the triangle **linear counter**
  (`updateCounter`) and the noise envelope — the ~240 Hz units.
- `halfFrame` → `clockHalfFrame`: runs `updateEnvelope` **again**, then `updateSweep` (both pulses)
  and `updateLength` (all four length counters) — the ~120 Hz units. Because the quarter-frame work
  is repeated inside the half-frame handler, the envelopes and linear counter are clocked on all
  step positions.

The sequencer holds `cycle`, the active `period` (`4 | 5`), a `pendingPeriod`, a `resetDelay`,
`irqEnabled` and the last `$4017` byte. Step positions are region data from `ApuTiming`; the
per-tick `switch` compares `cycle` against them:

| Event              | Four-step (mode 0)    | Five-step (mode 1)       | NTSC cycle | PAL cycle |
| ------------------ | --------------------- | ------------------------ | ---------- | --------- |
| Quarter clock      | `firstQuarterCycle`   | `firstQuarterCycle`      | 7457       | 8313      |
| Half clock         | `firstHalfCycle`      | `firstHalfCycle`         | 14913      | 16627     |
| Quarter clock      | `secondQuarterCycle`  | `secondQuarterCycle`     | 22371      | 24939     |
| IRQ assert (pre)   | `secondHalfCycle − 1` | —                        | 29828      | 33252     |
| Half clock + IRQ   | `secondHalfCycle`     | —                        | 29829      | 33253     |
| IRQ assert + wrap  | `fourStepEndCycle`    | —                        | 29830      | 33254     |
| Half clock         | —                     | `fiveStepFinalHalfCycle` | 37281      | 41565     |
| Wrap (`cycle = 0`) | —                     | `fiveStepEndCycle`       | 37282      | 41566     |

`fourStepEndCycle` and `fiveStepEndCycle` are derived as `secondHalfCycle + 1` and
`fiveStepFinalHalfCycle + 1` in `defineApuTiming`. In four-step mode the frame IRQ is asserted across
three consecutive CPU cycles (`secondHalfCycle − 1`, `secondHalfCycle`, `fourStepEndCycle`); each
assert is gated by `irqEnabled`, so a set inhibit bit suppresses all three. Five-step mode never
asserts the frame IRQ and issues no cycle-29829 half clock.

`write(value, cpuCycle)` stores the byte, sets `pendingPeriod = 4 + bit7`, sets `irqEnabled` from
the inverted bit 6 (clearing the IRQ immediately when inhibited) and schedules the reset:
`resetDelay = (cpuCycle & 1) === 0 ? 3 : 4`. When the delay expires, `tick` applies the pending
period, resets `cycle = 0`, and — if the new period is 5 — issues an immediate `halfFrame` clock,
reproducing the hardware's "write `$80` clocks all units at once" behavior. `powerOn` and `reset`
call `applyResetState`: they set period/pendingPeriod and `irqEnabled` from the register byte (0 on
power-on, the last byte on reset), clear `resetDelay`, seat `cycle = 5` and clear the IRQ line.

## Envelope

`Envelope` (`apu/envelope.ts`) is the shared pulse/noise volume unit. `configure` reads `loop`
(bit 5), `constant` (bit 4) and a 4-bit `period` (bits 3–0). `restart` sets the `start` flag; the
next `clock` (quarter-frame) reloads `decay = 15` and `divider = period` and clears `start`.
Otherwise `clock` decrements the divider, and on divider underflow reloads it from `period` and
either decrements `decay` or, when `loop` is set and `decay` is already 0, reloads `decay = 15`. The
`output` getter returns `period` when `constant` is set, else the current `decay` (0–15).

## Length counter

`LengthCounter` (`apu/length-counter.ts`) is the shared automatic duration counter for pulse,
triangle and noise. `load(index, cpuCycle)` looks the reload up in the 32-entry `LENGTH_TABLE` and,
critically, defers it: it records the value into `pendingReload` and snapshots the counter into
`valueBeforeReload`. `set halt` likewise only records `pendingHalt`. `clock(cpuCycle)` first stores
`valueBeforeClock` and the cycle, then decrements the counter when not halted. Disabling the channel
(`enabled = false`) immediately zeroes the counter and clears any pending reload.

`commitRegisterWrites` applies the deferred writes after the coincident frame-counter clock: the
reload takes effect **only if `counter === valueBeforeReload`**, i.e. only if a half-frame clock has
not already decremented the counter this cycle; then `halted` is updated from `pendingHalt`. To make
the "same cycle as clock" comparison exact, `load` compares its `cpuCycle` against the counter's
`lastClockCycle` and, on a match, snapshots `valueBeforeClock` (the pre-decrement value) rather than
the current counter — so a length write on the very cycle the counter is clocked is still honored,
while a write after a genuine decrement is discarded. This preserves the documented rule that a
length reload is ignored when the frame counter clocked the length on the same CPU cycle. See
[APU Length Counter](https://www.nesdev.org/wiki/APU_Length_Counter).

## Pulse channels

Each `PulseChannel` owns a `LengthCounter`, an `Envelope`, an 11-bit timer, a duty index/step and a
sweep unit. `DUTY_TABLE` holds the four 8-step patterns (12.5%, 25%, 50%, 75%-negated). The timer is
clocked at half the CPU rate (`updateTimer` runs only when `cycle % 2 === 0`); on underflow it
reloads and advances `dutyStep` modulo 8.

The [sweep](https://www.nesdev.org/wiki/APU_Sweep) unit runs at the half-frame (~120 Hz) rate.
`sweepTargetPeriod` computes `delta = timerPeriod >> sweepShift`, then `timerPeriod + delta` when
positive or `timerPeriod − delta − (applyExtraSweep ? 1 : 0)` when negating. `applyExtraSweep` is the
one difference between the two channels: Pulse 1 is constructed with it set (ones'-complement negate),
Pulse 2 without it (twos'-complement negate). `updateSweep` applies the target to the period only
when the divider has expired, the sweep is enabled, the shift is nonzero, `timerPeriod >= 8` and the
target is `<= 0x7FF`; it then reloads the divider from `sweepPeriod` on expiry or reload, otherwise
decrements it.

`output` returns `0` when the length counter is 0, when the current duty-table bit is 0, or when the
sweep-mute condition holds (`timerPeriod < 8` or `sweepTargetPeriod > 0x7FF`); otherwise it returns
the envelope output.

## Triangle channel

`TriangleChannel` owns a `LengthCounter`, an 11-bit timer, a 32-entry `TRIANGLE_TABLE` (15→0→15) and
a linear counter (`counterPeriod`, `counterValue`, `counterReload`, plus the `isLengthHalted` /
linear-control flag). The timer is clocked **every** CPU cycle; the sequence position advances only
when both the length counter and the linear counter are nonzero. `updateCounter` (quarter-frame)
reloads `counterValue` from `counterPeriod` while the reload flag is set, otherwise decrements it, and
clears the reload flag only when the control/halt flag is not set. `output` returns `0` when
`timerPeriod < 2` (an emulator-only ultrasonic guard against aliasing pops — hardware never mutes the
triangle by period), when the length counter is 0, or when the linear counter is 0; otherwise it
returns `TRIANGLE_TABLE[dutyIndex]`.

## Noise channel

`NoiseChannel` owns a `LengthCounter`, an `Envelope`, a 15-bit `shiftRegister` (seeded to 1), a mode
flag and an 11-bit timer whose period is looked up in the region's `noiseTimerPeriods` table. The
timer is clocked at half the CPU rate. On underflow it reloads and clocks the LFSR: the feedback bit
is `bit0 XOR bit(mode ? 6 : 1)`, the register shifts right, and the feedback bit is inserted at
bit 14. `output` returns `0` when the length counter is 0 or when the low LFSR bit is 1; otherwise it
returns the envelope output.

## Delta modulation channel

`DeltaModulationChannel` (`apu/delta-modulation-channel.ts`) is independent of the emulation bus: it
reaches the console only through `DmcChannelPort`, whose four methods are `requestDma(address,
haltPhase)`, `cancelDma()`, `setIrq(asserted)` and `currentDmaPhase()`. In `APU.initializeChannels`
the port is wired to `bus.requestDmcDma`, `bus.cancelDmcDma`, `bus.setIRQSource(IRQSource.ApuDmc, …)`
and `bus.currentDmaPhase()`. The bus completes a fetched byte back through `APU.completeDmcDmaByte`,
and `APU.mayRequestDmcDma` exposes whether the channel may still steal a bus cycle.

State: `outputLevel` (7-bit), `sampleAddress`/`sampleLength` (from `$4012`/`$4013`),
`currentAddress`/`currentLength`, an 8-bit `shiftRegister`, an optional `sampleBuffer`,
`bitsRemaining`, a `silence` flag, `tickPeriod`/`tickValue`, `loop`, `irqEnabled`, `irqPending`,
`dmaRequested` and two delay counters. The rate table (`dmcTimerPeriods`) is validated at
construction to be sixteen positive even CPU-cycle periods.

**Output unit.** `updateTimer` is clocked every CPU cycle; the DMC timer therefore uses full
CPU-cycle periods (not half-rate), and `tickValue` reloads and clocks `updateShifter` when it reaches
`<= 1`. `updateShifter` nudges `outputLevel` by ±2 within `[0, 127]` (raising when the current shift
bit is 1 and `outputLevel <= 125`, lowering when the bit is 0 and `outputLevel >= 2`), but only while
not silenced. After eight bits it refills: an empty `sampleBuffer` sets `silence`, otherwise it loads
the buffer into the shift register, clears silence and requests a **PUT**-scheduled reload DMA.
`output` returns `outputLevel`.

**Power-on alignment.** The constructor preloads `tickPeriod` from index 0 and sets
`tickValue = currentDmaPhase() === Get ? tickPeriod : tickPeriod − 1`. Because full DMC periods are
even, the first expiration fixes the output unit's APU half-cycle for good; aligning it to the
power-on GET/PUT selection avoids tying it to CPU cycle-number parity.

**Fetch scheduling.** `requestReaderDma(haltPhase)` requests a DMA only when no transfer-start delay
is pending, `currentLength > 0`, the buffer is empty and no request is already outstanding. Two
entry points feed it: a `$4015` enable of an empty channel (`setEnabled(true)` → `restart()` then
`transferStartDelay = phase === Get ? 4 : 3`, later firing a **GET**-scheduled load from `clockCpu`)
and the output unit emptying the buffer (a **PUT**-scheduled reload). `completeDmaByte` clears the
request, stores the byte, advances `currentAddress` with wrap to `0x8000`, decrements `currentLength`,
and on reaching 0 either restarts (loop) or, if IRQ is enabled, sets `irqPending` and asserts the IRQ
line. `setEnabled(false)` schedules `disableDelay = phase === Get ? 2 : 3`; when it expires in
`clockCpu` the length is zeroed and any outstanding request is cancelled.

**Silicon profile.** `DmcSiliconProfile` carries two flags, `implicitStopAbort` and
`unexpectedReload`. `RP2A03H_DMC_PROFILE` sets both; `CONSERVATIVE_DMC_PROFILE` clears both.
`APU.initializeChannels` selects the RP2A03H profile only when `timing.region === "ntsc"` and the
conservative profile otherwise — so Dendy (which borrows NTSC period tables) still runs conservative
because its region string is not `"ntsc"`, matching regions without established measurements.
`applyImplicitStopGlitch` runs after each completed byte only for a one-byte, non-looping sample with
a filled buffer, and models two measured NTSC races: with `unexpectedReload`, a completion at the
output bit-counter boundary (`bitsRemaining === 8`, `tickValue === tickPeriod`) immediately reloads
the shifter, restarts and requests a PUT reload; with `implicitStopAbort`, a completion one cycle
earlier (`bitsRemaining === 1`, `tickValue < 2`) reloads the shifter, restarts and sets
`disableDelay = 3` so the reload the following output clock schedules is aborted just after its halt.

**Load-DMA boundary.** A PUT-cycle `$4015` enable arms the load for three CPU cycles later; a
GET-cycle enable arms it for four. In both cases the halt targets the next-but-one GET. This matters
when `LDA $4015` immediately follows the enable: the load must stall that status read, fill the
one-byte reader buffer, decrement `currentLength` to zero and assert DMC IRQ before the status value
is sampled. A focused aggregate test pins the resulting `$80`, and the checksum-pinned Blargg
`apu_test` passes all 8 sub-suites. See
[External conformance ROMs](../../packages/fc-emu/test-support/external-roms.md) for the fixture.

## Status register and frame IRQ

The APU keeps the frame IRQ's external CPU line separate from its internal `$4015` status flag.
`irq()` sets `frameIRQPending`, clears `frameIrqClearDelay` and asserts `IRQSource.ApuFrame`.
`clearFrameIRQ` (from a `$4017` write that inhibits the IRQ, or from `applyResetState`) clears both
the flag and the line.

The `status` getter (a `$4015` read) assembles:

| Bit | Meaning                     |
| --- | --------------------------- |
| 0   | Pulse 1 length counter > 0  |
| 1   | Pulse 2 length counter > 0  |
| 2   | Triangle length counter > 0 |
| 3   | Noise length counter > 0    |
| 4   | DMC `currentLength` > 0     |
| 6   | frame IRQ pending           |
| 7   | DMC interrupt pending       |

`readRegister($4015)` returns the status and then calls `acknowledgeFrameIRQRead`, which deasserts
the CPU frame-IRQ **line immediately** but leaves the **internal flag** set for a delayed clear:
`frameIrqClearDelay = currentDmaPhase() === Get ? 1 : 2`. `APU.update` decrements that counter each
CPU cycle and clears `frameIRQPending` at the next APU-cycle boundary, so consecutive RMW reads can
observe the flag once or twice according to GET/PUT phase. The delay is deterministic save-state data.
See [APU status ($4015)](<https://www.nesdev.org/wiki/APU#Status_($4015)>).

A `$4015` **write** (the `control` setter) clears the DMC IRQ, then sets each channel's enable
(`bit0`–`bit3` for pulse/triangle/noise length counters, `bit4` for the DMC).

## Register-event queue and read catch-up

CPU writes to APU registers do not take effect instantly. `scheduleRegisterWrite(address, value,
cpuCyclesFromNow)` either applies the write immediately (when the delay is `<= 0`, followed by
`commitRegisterWrites`) or enqueues `{address, value, cycle: this.cycle + cpuCyclesFromNow}`. On each
CPU cycle `APU.update` calls `commitRegisterWriteAtCurrentCycle`, which drains every queued write
whose target cycle has arrived (writes are ordered by scheduled cycle) and then commits the deferred
length-counter halt/reload state once via `commitRegisterWrites`. This is what makes the
`LengthCounter` pending-commit rule observable relative to a same-cycle frame clock.

The Bus computes the delay in `scheduleApuRegisterWrite`: channel registers (`<= $400F`) add the
region's `channelRegisterWriteDelayCycles` (the 2A07 PUT delay — see below); other registers use 0.
For reads, the Bus catches the APU up first: `beginCpuRead` synchronizes the APU to the current CPU
cycle when the address is `$4015` or the DMC may still request DMA, so a status read (and a DMC halt)
observes an up-to-date APU while the channel can still schedule its halt within the same access.

## Mixer and output filter

`AudioMixer` combines the five channel outputs with two precomputed nonlinear lookup tables
([APU Mixer](https://www.nesdev.org/wiki/APU_Mixer)):

- `PULSE_MIX_TABLE[n]` for `n = pulse1 + pulse2` (0–30): `95.52 / (8128 / n + 100)`.
- `TND_MIX_TABLE[m]` for `m = 3·triangle + 2·noise + dmc` (0–202): `163.67 / (24329 / m + 100)`.

The mixed sample is the sum of the two table lookups, then passed through `NesAudioFilterChain`,
which applies three first-order stages clocked at the output sample rate: a 90 Hz high-pass, a 440 Hz
high-pass and a 14 kHz low-pass. The high-pass stages also remove the large DC bias baked into the
nonlinear tables. Filter coefficients derive from the RC time constants
(`highPassAlpha = rc/(rc+dt)`, `lowPassAlpha = dt/(rc+dt)`, `rc = 1/(2π·cutoff)`, `dt = 1/sampleRate`),
and the five per-stage history values are retained across samples and saved/restored (see below).

`APU.update` decides when to emit a sample: it compares `floor((cycle − 1) / cyclesPerSample)` with
`floor(cycle / cyclesPerSample)` — where `cyclesPerSample = cpuFrequencyHz / sampleRate` — and on a
boundary crossing computes `output` and notifies every registered listener.

## Region timing

`ApuTiming` (`console-timing.ts`) is the immutable per-family timing owned by the console. NTSC and
Dendy share `NTSC_APU_TIMING`; PAL uses `PAL_APU_TIMING`. The frame-sequencer cycle positions are in
the table above. The remaining fields:

| Field                             | NTSC (also Dendy)                                                           | PAL                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `channelRegisterWriteDelayCycles` | 0                                                                           | 1                                                                          |
| `noiseTimerPeriods`               | 1, 3, 7, 15, 31, 47, 63, 79, 100, 126, 189, 253, 380, 507, 1016, 2033       | 1, 3, 6, 14, 29, 43, 58, 73, 93, 117, 176, 235, 353, 471, 944, 1888        |
| `dmcTimerPeriods`                 | 428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54 | 398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50 |

`channelRegisterWriteDelayCycles` is the 2A07's one-cycle channel-register (PUT) delay: PAL adds it
to `$4000`–`$400F` writes, NTSC does not. The DMC period table holds full CPU-cycle periods
(consistent with the every-CPU-cycle DMC timer), and the sequencer sees region-specific quarter/half
cycle counts because the two clock domains differ.

## Save state

`captureState` / `restoreState` marshal the typed `ApuSnapshot`: the five channel states
(`PulseChannelState` ×2, `TriangleChannelState`, `NoiseChannelState`, `DeltaModulationChannelState`),
`FrameSequencerState`, the CPU `cycle`, `frameIRQPending`, `frameIrqClearDelay`, the
`NesAudioFilterState` history, the pending register-write queue, and the `sampleRate`. `restoreState`
runs `validateSnapshot` across the **entire state tree before mutating any channel**. Each child owns
its hardware constraints: booleans remain booleans; length, envelope, timer, duty, sweep and linear
counters stay within their register widths; noise periods belong to the active region; DMC
addresses, lengths, buffers, timer periods and DMA delays remain representable; and the frame
sequencer stays within the active region's cycle range. The aggregate additionally rejects a
mismatched sample rate, non-finite filter history, invalid frame-IRQ state, and malformed or
out-of-order pending writes. Direct child restores run the same pure validation before assignment,
so a rejected snapshot leaves both a standalone child and the complete APU unchanged. `sampleBuffer`
and `lastClockCycle` are omitted from their snapshots when undefined. The APU state travels inside
the console's current version 16 save-state envelope. Output-filter history first entered the schema
in version 13; version 14 added the PPU's real sprite-fetch pipeline state, and version 15 added
mapper-owned RAM/NVRAM for Namco 163; version 16 adds VS cabinet state.

After a successful aggregate restore, the APU reconciles its two named external lines through the
bus's restore-only IRQ port: DMC is asserted exactly when `irqPending` is set; frame IRQ is asserted
when `frameIRQPending` is set and no status-read clear delay remains. This port updates physical
source levels without treating restoration as a newly sampled runtime edge. Validation also rejects
a DMC IRQ without IRQ enable (or with bytes still remaining), a frame IRQ while the sequencer is
inhibited, and a frame-clear delay without a pending frame flag.

## Audio output boundary

The native pulse and TND nonlinear outputs are combined with the mapper's optional cartridge-audio
voltage before the shared 90 Hz/440 Hz high-pass and 14 kHz low-pass chain. The APU sees only
`cartridgeAudioSample()` on its bus port: oscillator clocks, registers and snapshot state remain
owned by the mapper. VRC6 pulse/saw, VRC7 six-channel FM, Namco 163 eight-channel wavetable and
MMC5 dual-pulse/direct-or-read-mode PCM output all enter through this boundary. Their devices
advance from CPU M2 through the same mapper bus observation used by cycle IRQs. Namco 163 preserves
the chip's time-division output: one enabled channel advances every 15 CPU cycles and its voltage
remains held until the next channel is serviced.

The core produces one filtered sample per output tick and pushes it to listeners registered through
`addListener`; the application layer wires that to the audio output port
(`application/emulator.ts` forwards each sample to `outputs.audio?.writeSample`). Device sample rate,
`AudioSampleBatcher`, the `RebufferingAudioRing` and the AudioWorklet are replaceable UI
infrastructure and never enter `@fcemu/core`.

## Verification and known limits

Focused tests cover frame-sequencer phases, envelopes, deferred length writes, DMC DMA requests,
region timing, mixing/filter state and snapshot validation. External evidence includes the
checksum-pinned AccuracyCoin bus/DMA matrix, both Sprite/DMC collision ROMs and the ten-fixture PAL
APU visual matrix documented in
[External conformance ROMs](../../packages/fc-emu/test-support/external-roms.md).

VRC6, VRC7, Namco 163 and MMC5 cartridge audio are mixed, mapper-owned and included in full save
states. Sunsoft 5B audio remains separate mapper-device work; mapper 69 currently implements the
FME-7 banking and IRQ half only. NTSC uses the measured RP2A03H/late-G implicit-stop behavior; PAL
and Dendy intentionally use the conservative DMC silicon profile until equivalent measurements
exist. These are explicit evidence limits, not automatic inheritance from a shared timer table.

## Source files

- `packages/fc-emu/src/domain/emulation/apu.ts` — APU aggregate, channels, mixer, filter chain, `$4015`/`$4017` handling, register queue, snapshot.
- `packages/fc-emu/src/domain/emulation/apu/frame-sequencer.ts` — 4-step/5-step frame sequencer, quarter/half clocks, frame IRQ, reset delay.
- `packages/fc-emu/src/domain/emulation/apu/envelope.ts` — shared pulse/noise volume envelope.
- `packages/fc-emu/src/domain/emulation/apu/length-counter.ts` — shared length counter with deferred halt/reload commit rule.
- `packages/fc-emu/src/domain/emulation/apu/delta-modulation-channel.ts` — DMC output unit, DMA scheduling, `DmcChannelPort`, `DmcSiliconProfile` glitches.
- `packages/fc-emu/src/domain/emulation/console-timing.ts` — `ApuTiming` cycle positions, noise/DMC period tables, channel-write (PUT) delay.
