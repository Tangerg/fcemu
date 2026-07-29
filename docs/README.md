# FC Emu documentation

Reference material for `@fcemu/core` (the hardware model) and `@fcemu/ui` (the browser Workbench).
The core models the console as hardware, not as a generic business domain: every documented behavior
names the chip, signal or bus phase it represents.

## Orientation

- [architecture.md](./architecture.md) — package layout, the dependency rule, hardware bounded
  contexts and the composition flow.
- [hardware-reference.md](./hardware-reference.md) — the evidence hierarchy, the hardware-to-code map
  and the non-negotiable timing rules a behavior change must respect.
- [engineering-roadmap.md](./engineering-roadmap.md) — completed work, near-term direction and
  measurement baselines.

## Subsystem references

Focused per-context references drawn from the source in `packages/fc-emu/src/domain/`.

- [subsystems/cpu.md](./subsystems/cpu.md) — RP2A03 NMOS 6502 core, cycle model and interrupts.
- [subsystems/ppu.md](./subsystems/ppu.md) — RP2C02 rendering, registers, sprite pipeline and memory.
- [subsystems/apu.md](./subsystems/apu.md) — channels, frame sequencer, DMC and mixing.
- [subsystems/cartridge.md](./subsystems/cartridge.md) — header parsing, memory regions and saves.
- [subsystems/dma.md](./subsystems/dma.md) — OAM and DMC DMA and the shared bus arbiter.
- [subsystems/clock-and-timing.md](./subsystems/clock-and-timing.md) — `ConsoleTiming` regions and the
  single `MachineClock` time authority.
- [subsystems/bus-and-memory.md](./subsystems/bus-and-memory.md) — machine composition, the CPU/PPU
  memory maps, open bus and controllers.

## Cartridge and mappers

- [cartridge-formats.md](./cartridge-formats.md) — accepted iNES/NES 2.0 header and board shapes.
- [mapper-compatibility.md](./mapper-compatibility.md) — support status and evidence per mapper.
- [mappers/README.md](./mappers/README.md) — the mapper contract, selection factory, save-state and a
  per-board reference for every supported board.
