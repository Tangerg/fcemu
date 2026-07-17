# NES hardware reference policy

`@fcemu/core` models the console as hardware, not as a generic business domain. A behavior change
must name the chip, signal or bus phase it represents and cite evidence at the same level of detail.

## Source hierarchy

1. Original manufacturer material is authoritative for the NMOS 6502 programming model:
   [MOS MCS6500 Microcomputer Family Programming Manual](https://www.bitsavers.org/components/mosTechnology/6500-50A_MCS6500pgmManJan76.pdf).
2. NES-specific behavior that Ricoh or Nintendo did not publicly document cycle-by-cycle uses
   reproducible hardware measurements collected by the
   [NESdev reference guide](https://www.nesdev.org/wiki/NES_reference_guide).
3. A checksum-pinned test ROM with published real-hardware output is executable evidence. The ROM,
   protocol, console region and expected output must all be recorded.
4. Mesen2, Nintendulator and other accurate emulators are cross-checks only. Their implementation is
   not a specification and cannot be the sole reason for a behavior change.
5. `fogleman/nes` remains the historical implementation reference for this port, not its accuracy
   specification. Its own README records known PPU timing and APU limitations.

## Hardware-to-code map

| Hardware boundary     | Primary evidence                                                                                                                                                                         | Core module                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| RP2A03 NMOS 6502 core | [CPU](https://www.nesdev.org/wiki/CPU), [status flags](https://www.nesdev.org/wiki/Status_flags), [CPU interrupts](https://www.nesdev.org/wiki/Interrupts), MOS manual                   | `domain/emulation/cpu.ts`, `domain/emulation/cpu/`                              |
| RP2C02 PPU            | [PPU rendering](https://www.nesdev.org/wiki/PPU_rendering), [PPU frame timing](https://www.nesdev.org/wiki/PPU_frame_timing), [PPU registers](https://www.nesdev.org/wiki/PPU_registers) | `domain/emulation/ppu.ts`, `domain/emulation/ppu/`                              |
| RP2A03 APU            | [APU](https://www.nesdev.org/wiki/APU), [APU frame counter](https://www.nesdev.org/wiki/APU_Frame_Counter), [APU DMC](https://www.nesdev.org/wiki/APU_DMC)                               | `domain/emulation/apu.ts`, `domain/emulation/apu/`                              |
| OAM and DMC DMA       | [DMA](https://www.nesdev.org/wiki/DMA)                                                                                                                                                   | `domain/emulation/dma/`                                                         |
| CPU/APU/PPU cadence   | [Cycle reference chart](https://www.nesdev.org/wiki/Clock_rate)                                                                                                                          | `domain/emulation/clock/machine-clock.ts`, `domain/emulation/console-timing.ts` |
| Standard controllers  | [Standard controller](https://www.nesdev.org/wiki/Standard_controller), [controller reading code](https://www.nesdev.org/wiki/Controller_reading_code)                                   | `domain/emulation/controller.ts`                                                |
| CPU data buses        | [Open bus behavior](https://www.nesdev.org/wiki/Open_bus_behavior), [APU status](<https://www.nesdev.org/wiki/APU#Status_($4015)>)                                                       | `domain/emulation/memory.ts`                                                    |
| Cartridge boards      | [Mapper](https://www.nesdev.org/wiki/Mapper), board-specific NESdev pages                                                                                                                | `domain/emulation/mapper/`                                                      |

## Non-negotiable timing rules

- A CPU instruction is not an atomic duration. Reads, writes, dummy accesses, RMW writes and
  interrupt polls occur on named CPU cycles.
- Every branch polls interrupts before its operand fetch. A taken page-crossing branch polls again
  before PCH fixup, and a successful first poll cannot be revoked by an unsuccessful second poll.
- Processor status contains six physical C/Z/I/D/V/N latches. Bits 4 and 5 have no corresponding
  CPU state and are ignored by PLP/RTI: PHP and BRK push both high, while IRQ/NMI push bit 5 high and
  bit 4 low. Save-state projection therefore uses the same canonical bit-5-high, bit-4-low form.
- SHA/SHS/SHX/SHY normally mask their stored value with the literal address high byte plus one. If
  RDY stretches the indexed dummy read immediately before the write, that data mask disappears;
  page-crossing address-high corruption remains independent of the stalled read.
- The NTSC CPU and PPU divide one master oscillator by 12 and 4; PAL uses 16 and 5. Fractional
  region cadence must carry its remainder rather than round per instruction.
- OAM DMA attempts to halt on the first CPU cycle after `$4014`, can halt only a read, performs one
  halt plus optional alignment and 256 get/put pairs, and therefore owns 513 or 514 cycles.
- A pending OAM halt is not permission to preempt an unobserved CPU cycle. If the following cycle is
  a write, the halt fails and the CPU write completes; for an RMW of `$4014`, the write-new page
  replaces write-old before one DMA finally halts on the next read.
- DMA get/put cadence belongs to the APU clock phase. CPU cycle parity is not a hardware identity;
  the two domains can power up in either alignment.
- A DMC load DMA is scheduled for GET after `$4015` enables an empty reader buffer; a reload DMA is
  scheduled for PUT when the output unit consumes that buffer. A load halt is attempted on GET in
  the second following APU cycle (the third or fourth CPU cycle after the write). The request phase
  is part of DMA state, not a CPU-parity shortcut. During OAM DMA, the DMC GET wins and OAM realigns
  before its next GET.
- NTSC execution uses the measured RP2A03H/late-RP2A03G one-byte stop behavior: completing on the
  output-counter boundary can request the same byte again, while completing one cycle earlier
  schedules a reload that is canceled after its halt. PAL and Dendy keep these revision-specific
  behaviors disabled because equivalent 2A07/clone measurements are not established.
- NTSC 2A03 DMC halts can clock a controller read once before the CPU's resumed read, deleting one
  serial bit on NES/AV Famicom-style controller wiring. PAL 2A07 fixes this; Dendy remains
  conservative because clone behavior is not established by the selected timing mode alone.
- During a DMC GET, DMA drives address bits A0-A4 while the halted 6502 retains A5-A15. If the CPU
  half selects `$4000-$401F`, the combined address can activate `$4015`, `$4016` or `$4017` while
  the external sample ROM is read. Controller-driven bits replace their external open-bus lines;
  a `$4015` activation acknowledges the frame IRQ without replacing the external data latch.
- A standard controller latches exactly eight buttons in A, B, Select, Start, Up, Down, Left, Right
  order. While strobe is high it continuously reports A; after eight low-strobe reads it reports 1
  indefinitely. Emulator state therefore needs only eight booleans and a saturated 0–8 position.
- `$4016` writes target one RP2A03 OUT latch shared by both controller ports. The latest pending byte
  reaches the pins at a PUT-cycle boundary, so the two writes of an RMW instruction can either create
  or suppress a one-cycle strobe depending on GET/PUT alignment. This pending write belongs to the
  console bus and must survive a mid-cycle save state; it is not duplicated inside each controller.
- A `$4015` status read deasserts the CPU frame-IRQ source immediately, but its internal status flag
  clears only at the next APU-cycle boundary. Consecutive RMW reads can therefore observe the flag
  once or twice according to GET/PUT phase; the pending clear is deterministic save-state data.
- The RP2A03 internal data bus and its external pins are distinct state. CPU reads and writes update
  the internal bus; external device reads and CPU writes update the external bus; DMC DMA fetches do
  not overwrite the internal latch. `$4000-$4014` and `$4018-$5FFF` are open external bus in the
  supported Control Deck map. Controller reads drive bits 0–4 and retain external bits 5–7, while
  `$4015` takes bit 5 from the internal bus and leaves the external latch unchanged.
- MMC1 observes the CPU R/W pin, not an instruction-level write callback. Of consecutive CPU write
  cycles it accepts only the first D0 serial write, which makes an RMW instruction's write-new cycle
  invisible to the shift register. D7 reset remains effective even on that second cycle. The prior
  R/W level is deterministic mapper state and must survive save/restore.
- PPU behavior is dot-addressed. Odd-frame shortening, vblank/NMI suppression and rendering-time
  OAM reads cannot be inferred only at scanline or instruction boundaries.
- Sprite selection on dots 65–256 and pattern fetch on dots 257–320 are separate stages. The pattern
  address register uses the live PPUCTRL sprite-size/table inputs and only the corresponding low
  three or four scanline-delta bits; changing 8×8/8×16 mode between stages must not be rejected as an
  out-of-range software sprite row.
- The PPU address bus is exactly 14 bits. Every PPU memory access uses the low 14 address bits;
  `$0000-$1FFF` reaches cartridge CHR, `$2000-$3EFF` reaches mirrored nametable wiring and
  `$3F00-$3FFF` reaches the internal palette mirrors.
- The PPU drives a physical `/NMI` level; the CPU edge detector samples it during its input phase and
  transfers the detected edge through a second polling latch. Vector selection is fixed before the
  interrupt status push, not immediately before the vector read.
- The APU frame counter, channel timers and DMC DMA are CPU-clocked but have distinct half-cycle and
  register-write timing. The DMC timer uses full CPU-cycle periods (NTSC 428…54, PAL 398…50), while
  its first expiration follows the selected power-on GET/PUT alignment and load/reload scheduling
  still observes that APU phase. A Bus-side delay constant is not a substitute for a modeled signal.

## Change acceptance

Before merging a hardware behavior change:

1. Record the cited hardware rule and the current contradiction.
2. Add a focused domain test for the state transition.
3. Run the relevant checksum-pinned external ROM, not only a synthetic fixture.
4. Run CPU interrupt, PPU timing, mapper IRQ and DMA collision matrices when clock ordering changes.
5. Re-run the two read-only real ROM smoke hashes.
6. Profile before and after only when the change claims a performance improvement.

If two hardware tests require incompatible results, keep the last jointly validated behavior and
document the missing clock or revision dimension. Do not add a ROM-name special case.
