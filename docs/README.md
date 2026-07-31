# FC Emu documentation

This documentation is organized by reader intent. Start with the shortest path that answers your
question, then follow links into the chip- or board-level references.

## I want to run the emulator

1. [Getting started](./getting-started.md) — prerequisites, local development, controls, persistence
   and troubleshooting.
2. [Mapper compatibility](./mapper-compatibility.md) — whether a cartridge board is implemented and
   what evidence supports that status.
3. [Cartridge formats](./cartridge-formats.md) — the accepted iNES/NES 2.0 subset and rejection
   policy.

## I want to integrate the core

1. [Core API](./core-api.md) — construct an emulator, supply video/audio sinks, run frames, control
   players and persist state.
2. [Browser workbench](./workbench.md) — session lifecycle, frame/audio/input policy and browser
   adapters.
3. [Architecture](./architecture.md) — package boundaries, dependency direction, composition and
   state ownership.
4. [Clock and timing](./subsystems/clock-and-timing.md) — region selection and the single time
   authority.

## I want to change hardware behavior

1. [Hardware evidence policy](./hardware-reference.md) — source hierarchy, non-negotiable timing
   rules and change acceptance.
2. [Testing and conformance](./testing.md) — test layers, external fixtures, checksum policy and
   required validation.
3. The relevant subsystem reference:

   - [CPU](./subsystems/cpu.md)
   - [PPU](./subsystems/ppu.md)
   - [APU](./subsystems/apu.md)
   - [DMA](./subsystems/dma.md)
   - [System bus, memory and controllers](./subsystems/bus-and-memory.md)
   - [Cartridge](./subsystems/cartridge.md)
   - [Clock and timing](./subsystems/clock-and-timing.md)

4. For cartridge hardware, continue with [Mapper reference](./mappers/README.md).

## I want to contribute

- [Contributing guide](../CONTRIBUTING.md) — workflow, architecture rules and pull-request evidence.
- [Code of Conduct](../CODE_OF_CONDUCT.md) — expected project behavior.
- [Security policy](../SECURITY.md) — private vulnerability reporting and supported versions.
- [Engineering roadmap](./engineering-roadmap.md) — current priorities, non-goals and definitions of
  done.

## Documentation conventions

- “CPU cycle” means one RP2A03 CPU clock; “PPU dot” means one PPU clock.
- Hexadecimal addresses use `$` in prose (`$4014`) and `0x` in TypeScript (`0x4014`).
- `Implemented` is a code-and-focused-test claim; `Verified` additionally requires executable
  external or pinned real-ROM evidence.
- Paths are repository-relative. Public API names refer only to exports from `@fcemu/core`.
- Historical implementation detail belongs in Git history. These documents describe the current
  contract, evidence and planned work.

If documentation contradicts executable behavior, treat that as a defect: identify the hardware
source, then update code, tests and documentation in the same change.
