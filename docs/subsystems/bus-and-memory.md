# System bus, memory map and controllers

`Bus` is the machine composition root of `@fcemu/core`: it constructs and owns the RP2A03 CPU, the
RP2C02 PPU, the APU, two standard controllers and the cartridge with its selected mapper, then drives
them one CPU cycle at a time. `CPUMemory` and `PPUMemory` decode the two physically distinct address
buses, `Controller` models the standard eight-button serial shift register, and `IRQSource` names the
level-sensitive interrupt lines the CPU can see. This file documents the observable behavior wired in
`bus.ts`, `memory.ts`, `controller.ts` and `irq-source.ts`; PPU-internal decoding is summarized here
and detailed in [`ppu.md`](./ppu.md).

## Bus as composition root and orchestrator

The constructor takes a `Cartridge`, an audio sample rate (default `44_100`) and an optional console
region, resolves an immutable `ConsoleTiming`, builds a `MachineClock` from the region CPU:PPU ratio,
allocates the 2 KiB internal RAM, then constructs `CPU`, `APU`, `PPU`, two `Controller`s and the
mapper (`createMapper`). It finishes by calling `powerOn()`. `Bus` implements `MapperInterruptPort`
(so IRQ-capable boards assert through it without seeing the whole machine) and `DmaArbiterPort`. It
exposes its owned chips through read-only accessors (`CPU`, `APU`, `PPU`, `RAM`, `Controller1`,
`Controller2`, `Cartridge`, `Timing`, `Mapper`).

### The per-CPU-cycle `update()` loop

`update()` advances the machine by exactly one CPU cycle and returns the cycle count consumed. In
order it:

1. Marks `cpuUpdateActive = true` and calls `clock.beginCpuUpdate`.
2. If DMA is active and can begin a DMC transfer on the next cycle, begins DMC at the CPU's PC.
3. Decides `dmaOwnsCycle` from `dma.ownsBusCycle` or an awaiting sprite halt while the CPU has no
   active instruction. It then clocks the CPU with `clockDmaCycle()` (bus stolen) or `clock()`.
4. On a DMA-owned cycle, catches the APU up to completed CPU cycles and clocks the DMA arbiter.
5. Commits any pending controller write, commits the CPU cycle to the clock, synchronizes the PPU
   committed interrupt sample, samples the CPU `/NMI` line, synchronizes the PPU committed dot and
   the APU committed state, and finishes the DMA cycle if one was owned.
6. Clears `cpuUpdateActive` and returns the cycle count.

`updateFrame()` loops `update()` until `ppu.frame` changes and returns the accumulated CPU cycles.
`updateSeconds(seconds)` loops `update()` until `timing.cpuFrequencyHz * seconds` cycles have been
consumed.

### PPU synchronization points

The private `clockPpuDot` callback advances the PPU by one dot (`ppu.update()`) and invokes the
mapper's optional A12 timing clock (`mapper.tickPpu?.()`). `Bus` catches the PPU up to
specific CPU bus phases through `MachineClock` helpers, each gated by `cpuUpdateActive` (read-side
helpers additionally gated by `ppuReadSynchronizationRequired`, taken from
`clock.readSampleRequiresPpuSynchronization`): current-read (`beginCpuRead`), advanced-read (DMA
sample fetches), advanced-write (OAM DMA writes), completed-CPU-cycles, and completed-interrupt-sample
during DMA-stalled reads. This keeps PPU dots, mapper A12 timing and CPU reads ordered without
fabricated scanline callbacks.

### Level-sensitive IRQ sources and the `/NMI` line

`Bus` owns a `Set<IRQSource>` of currently asserted lines. `setIRQSource(source, asserted)` adds or
removes the source, then drives `cpu.setIRQLine(this.irqSources.size > 0)` so any asserted source
holds the shared line low. When a source newly asserts, the bus may immediately re-sample the CPU IRQ
line: a mapper source always re-samples, and an APU source re-samples only if at least two committed
APU cycles remain in the instruction (`cpu.sampleIRQLine(source === Mapper || remaining >= 3)`),
modeling the recognition delay without inferring it from returned cycle counts. `setMapperIrq`
forwards to `setIRQSource(IRQSource.Mapper, …)`. The PPU's `/NMI` output is routed straight through
`setPpuNmiLine(asserted) -> cpu.setNmiLine(asserted)`; the CPU edge detector samples it during the
`update()` loop.

### DMA request routing

`Bus` forwards DMA requests to the arbiter and services the arbiter's bus accesses:

- `requestSpriteDma(page)` / `requestDmcDma(address, haltPhase)` / `cancelDmcDma()` start or cancel
  transfers; `currentDmaPhase()` reports the GET/PUT phase at the current CPU cycle.
- `readCpuByteForDma(address)` and `writeOamByteForDma(value)` perform OAM copies, each bracketing the
  access with `performingDmaMemoryAccess = true` and a PPU advanced-read/write synchronization.
- `readDmcByteForDma(address, haltedCpuAddress)` reproduces the RP2A03's split DMA bus: DMA drives
  A0-A4 while the halted 6502 retains A5-A15. It reads the external sample byte, and if the halted CPU
  half selects `$4000-$401F` and the folded internal address is `$4015`-`$4017`, it additionally
  activates that internal register (acknowledging the frame IRQ or clocking a controller port).
- `repeatHaltedCpuReadForDma(address)` re-issues the halted read for the controller-glitch case; when
  `timing.dmcDmaControllerReadGlitch` is off it suppresses the extra `$4016`/`$4017` clock.
- `completeDmcDmaByte(value)` hands the fetched sample back to the APU.

### Power-on versus reset lifecycle

`powerOn()` is a full cold start: it clears IRQ sources, resets the DMA arbiter and clock
synchronization, zeroes internal RAM, then powers on the cartridge, mapper, both controllers, PPU,
APU and CPU. `reset()` is a soft reset: it clears IRQ sources, resets the DMA arbiter and clock
synchronization, delivers the optional mapper reset signal, then resets the PPU, APU and CPU.
Internal RAM, cartridge memory, controller button state and mapper state not wired to reset remain
intact; resettable address-latch multicarts return only their bank latch to the menu mapping.
`resetClockSynchronization()` (shared by both) resets the clock and clears
`performingDmaMemoryAccess`, `cpuUpdateActive` and any pending controller write.

## CPU memory map (`CPUMemory`)

`CPUMemory` decodes the 16-bit CPU address space (`0x0000-0xFFFF`), masking every address to 16 bits
first. Each access first calls the mapper's optional `observeCpuBusCycle` hook (R/W-aware) and, for
reads, `bus.beginCpuRead(address)` — which resolves any DMA stall and records whether the read was
halted (`lastCpuReadWasHalted`). Writes call `bus.beginCpuWrite()` first.

See NESdev [CPU memory map](https://www.nesdev.org/wiki/CPU_memory_map).

| Address range | Size   | Region                     | Read behavior                                       | Write behavior                          |
| ------------- | ------ | -------------------------- | --------------------------------------------------- | --------------------------------------- |
| `$0000-$1FFF` | 8 KiB  | Internal RAM               | 2 KiB RAM mirrored 4× (`address % 0x0800`)          | writes the mirrored RAM byte            |
| `$2000-$3FFF` | 8 KiB  | PPU registers              | 8 registers mirrored every 8 bytes (`0x2000 + a%8`) | writes the mirrored PPU register        |
| `$4000-$4013` | 20 B   | APU registers (write-only) | open bus (external latch)                           | scheduled APU register write            |
| `$4014`       | 1 B    | OAM DMA                    | open bus (external latch)                           | `PPU.writeRegister($4014)` (starts DMA) |
| `$4015`       | 1 B    | APU status                 | APU status OR internal-bus bit 5; internal only     | scheduled APU register write            |
| `$4016`       | 1 B    | Controller 1 / OUT latch   | Controller 1 serial bit on D0-D4, external D5-D7    | scheduled `$4016` OUT-latch write       |
| `$4017`       | 1 B    | Controller 2 / frame ctr   | Controller 2 serial bit on D0-D4, external D5-D7    | scheduled APU frame-counter write       |
| `$4018-$5FFF` | ~7 KiB | Cartridge expansion        | optional mapper value/mask; otherwise open bus      | optional mapper expansion write         |
| `$6000-$FFFF` | 40 KiB | Cartridge (PRG RAM/ROM)    | `Mapper.read` + optional data-line drive mask       | `Mapper.write`                          |

### Internal vs external data-bus latches and open bus

`CPUMemory` models the two byte-wide RP2A03 data paths as `internalDataBus` and `externalDataBus`
(both restorable through `restoreDataBuses`). Reads take a `cpuOwnsRead` flag distinguishing ordinary
CPU reads (`read` -> `readMapped(…, true)`) from DMA bus-master reads (`readForDma` ->
`readMapped(…, false)`):

- `readFullyDriven` (RAM and PPU registers) drives the external latch to the returned byte, and the
  internal latch too only when the CPU owns the read.
- `readOpenBus` (write-only `$4000-$4014`, and unmapped `$4018-$5FFF`) returns the retained external
  latch; the internal latch copies it only on a CPU-owned read. An optional cartridge expansion
  result can drive selected external lines in the latter range.
- `readPartiallyDriven` (controller ports and cartridge reads) drives only the bits in the mask and
  retains the rest of the external latch, mirroring the internal latch on a CPU-owned read. A mapper
  omitting `cpuReadDriveMask` drives all eight bits; write-only or disabled cartridge windows return
  mask `0`, preserving open bus.
- Writes drive both latches to the written value before dispatching.

A DMA fetch therefore updates the external pins without disturbing the CPU's internal bus, which is
what lets a DMC fetch land between an operand read and a `$4015` access without corrupting it. See
NESdev [open bus behavior](https://www.nesdev.org/wiki/Open_bus_behavior).

### Special reads: `$4015`, `$4016`, `$4017`

- `$4015` is internal to the 2A03. Its returned value is `APU.readRegister($4015)` OR the internal
  bus's bit 5 (`internalDataBus & 0x20`), and it updates the internal latch only (never the external
  pins) on a CPU-owned read.
- `$4016` returns `Controller1.currentButton` driven onto D0-D4 (mask `0x1f`); D5-D7 keep the
  external latch.
- `$4017` returns `Controller2.currentButton` on D0-D4 (mask `0x1f`); D5-D7 keep the external latch.

On VS UniSystem, `$4016/$4017` instead drive all eight bits. D0 is the corresponding controller
serial line; `$4016` adds service, DIP 1–2 and two coin contacts, while `$4017` adds DIP 3–8.
NES 2.0 default expansion value 4/5 decides whether application player one is wired to the right
`$4016` or left `$4017` stick. Ice Climber protection forces the Start serial bit on both physical
ports. A committed `$4016` write also presents OUT2 to mapper 99.

`VsSystem` observes the mirrored `$4020-$5FFF` coin-counter address decode before mapper expansion
ports. Reads write the current external open-bus D0 into that output, matching the cabinet circuit.
The same console device supplies the header-selected RBI, TKO and Super Xevious protection reads;
all cabinet/protection state participates in transactional save states.

## PPU memory map (`PPUMemory`)

`PPUMemory` decodes the independent 14-bit PPU bus, masking every access with `& 0x3fff`. It emits
`observePpuAddress` before a transaction and `observePpuRead` after a read returns, preserving the
physical distinction between address-sensitive and read-triggered boards. The three regions are:
`$0000-$1FFF` pattern tables via `Mapper.read`/`Mapper.write` (CHR ROM/RAM); `$2000-$3EFF`
nametables, folded through the cartridge mirroring mode (horizontal, vertical, single-screen low/high
or four-screen) into `PPU.nameTableData`; and `$3F00-$3FFF` palette RAM via `PPU.readPalette` /
`PPU.writePalette` with `address % 32`. Nametable/palette internals and mirroring are detailed in
[`ppu.md`](./ppu.md).

Before applying fixed header mirroring, nametable reads and writes ask the mapper's optional
`mapNametableAddress` capability for a direct nametable-memory index. This models boards that wire a
CHR bank output to CIRAM A10: routing is selected per nametable slot and can change with CHR banking,
so reducing it to one mutable horizontal/vertical enum would lose hardware state. Separate optional
`readNametable`/`writeNametable` capabilities let Sunsoft-4 replace CIRAM with read-only CHR ROM
without encoding memory ownership in an address sentinel. `readNametableBus` additionally carries
a value and drive mask when a cartridge owns the range or deliberately leaves it undriven. LROG017
uses this to keep cartridge RAM at `$2000-$27FF`, CIRAM at `$2800-$2FFF` and open bus at
`$3000-$3EFF` distinct instead of accepting the PPU memory map's ordinary mirror fallback.

Before a pattern-table access reaches CHR, `mapPatternToCiramAddress` can instead route it to one
of the console's two CIRAM pages. Namco 163 uses this narrow capability independently for each
1 KiB pattern selector; the PPU retains ownership of CIRAM bytes and the mapper owns only wiring.

Pattern-table reads also apply the mapper's optional `ppuReadDriveMask`. The cartridge normally
drives all eight bits. When CHR is disabled and the cartridge tri-states those pins, undriven bits
come from the current address low byte because the RP2C02 multiplexes its video-memory address and
data on the same pins. This bus rule is modeled once in `PPUMemory`; mapper implementations report
electrical drive state without fabricating an open-bus byte or owning a duplicate PPU latch.

## Standard controllers (`Controller`)

Each `Controller` is a standard-controller serial shift register of eight booleans in fixed
`A, B, Select, Start, Up, Down, Left, Right` order (`ControllerButton` enum, indices 0-7), plus a
`currentButtonIndex` and a `strobeSignal`. `setButton(button, pressed)` validates the button index
and boolean; `buttonsState` sets all eight at once.

The `strobe` setter stores `Boolean(value & 1)` and, while high, resets `currentButtonIndex` to 0.
The `currentButton` getter returns the current button's bit while `currentButtonIndex < 8`; once all
eight have shifted out it returns `1` indefinitely (the high sentinel software uses to detect the end
of the report). When strobe is low, each read advances the index, saturating at 8
(`Math.min(8, index + 1)`) so the position never exceeds the eight-button report. `powerOn()` clears
the index and strobe without touching physical button state. See NESdev
[standard controller](https://www.nesdev.org/wiki/Standard_controller).

### The shared `$4016` OUT latch

A `$4016` CPU write does not reach the controllers immediately. The RP2A03 has a single OUT latch
shared by both ports, owned by the bus: `CPUMemory.write` calls `bus.scheduleControllerWrite(value)`,
which stores the byte in `pendingControllerWrite`. The bus commits it only on a PUT bus cycle —
`commitControllerWrite()` checks `dma.phaseAt(cpuCycles - 1) === DmaBusPhase.Put`, then applies the
value to both `controller1.strobe` and `controller2.strobe` and clears the pending write. Because the
commit is gated on GET/PUT alignment, the two writes of an RMW instruction can either form or suppress
a one-cycle strobe. The pending write is bus state (a save-state field), not duplicated inside each
controller.

## IRQ sources (`IRQSource`)

`IRQSource` is a string-valued constant map of the level-sensitive lines the CPU sees: `ApuDmc`
(`"apu-dmc"`), `ApuFrame` (`"apu-frame"`) and `Mapper` (`"mapper"`). Each source asserts and clears
its own line independently through `setIRQSource`, and the CPU IRQ input is simply the OR of the
active set (`irqSources.size > 0`). `setMapperIrq` is the mapper-facing shortcut for the `Mapper`
source. Devices and the bus refer to these named members instead of bare string literals.

## Save-state snapshot

`captureState()` returns a `BusSnapshot` owning the internal RAM (copied), the CPU, PPU, APU,
cartridge-memory, mapper, both controller and DMA snapshots, the machine-clock state, the array of
asserted `irqSources`, the `performingDmaMemoryAccess` flag, and `pendingControllerWrite` only when
one is pending. `restoreState()` is transactional: it captures the current state, attempts an
unchecked restore, and rolls back on any thrown error. The unchecked restore validates the RAM type
and length, validates the IRQ-source array (only the three known sources, no duplicates), validates
`pendingControllerWrite` as a byte, and cross-checks two invariants — the PPU `/NMI` output must equal
the CPU `/NMI` input line, and the presence of any IRQ source must equal `cpu.isIRQLineAsserted`.

## Verification and known limits

Aggregate tests exercise mirrored maps, internal/external open bus, controller partial drives,
source-aware IRQs, `/NMI` routing, controller OUT timing and transactional restore. AccuracyCoin and
the DMA/OAM fixtures in
[External conformance ROMs](../../packages/fc-emu/test-support/external-roms.md) provide executable
evidence for interactions that isolated device tests cannot prove.

The supported CPU map is the standard NES/Famicom Control Deck map plus explicitly decoded cartridge
and VS UniSystem devices; mappers 79 and 113 use distinct write-only expansion latches, while the VS
cabinet owns its controller-bit overlays, protection reads and mirrored coin-counter output. VS DualSystem and
PlayChoice-10 behavior are rejected rather than approximated with a single standard-console bus. A
mapper may expose a current cartridge-audio voltage through `expansionAudioSample`; the bus presents
that narrow capability to the APU mixer without teaching the APU any mapper register protocol.

## Source files

- `packages/fc-emu/src/domain/emulation/bus.ts` — machine composition root, per-cycle update loop,
  IRQ/NMI routing, DMA request routing, controller-write commit, and the bus save-state snapshot.
- `packages/fc-emu/src/domain/emulation/memory.ts` — `CPUMemory` 16-bit map with internal/external
  data-bus latches and open bus, and `PPUMemory` 14-bit map.
- `packages/fc-emu/src/domain/emulation/controller.ts` — `Controller` standard eight-button serial
  shift register with strobe and saturated position.
- `packages/fc-emu/src/domain/emulation/irq-source.ts` — the `IRQSource` level-sensitive line names.
