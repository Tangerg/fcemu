# Mapper domain module

This directory is the private cartridge-hardware module of `@fcemu/core`. Other modules import its
contract, factory and public errors through `index.ts`; concrete board classes are not package API.

## Maintainer boundary

- `mapper.ts` defines CPU/PPU address-space, data-line drive, CPU expansion and floating-register
  decode, CIRAM/ROM nametable routing, cartridge audio, lifecycle, signal and deterministic-state
  capabilities.
- `create-mapper.ts` is the only mapper/submapper/board selection point.
- `mapper-errors.ts` owns the three public failure categories.
- `mapper-kind.ts` and the `MapperState` union keep snapshot identity explicit.
- `state-validation.ts` contains shared runtime guards; every board still validates its own coupled
  invariants before mutation.
- IRQ-capable boards depend on `MapperInterruptPort`, never the complete `Bus`.

Board identity includes submapper, PRG/CHR geometry, reachable writable memory, mirroring ownership,
bus conflicts and optional IRQ/latch signals. Unknown or contradictory configurations fail at the
factory boundary.

## Workflow

The canonical implementation checklist, board table and evidence rules live in
[`docs/mappers/README.md`](../../../../../../docs/mappers/README.md) and
[`docs/mapper-compatibility.md`](../../../../../../docs/mapper-compatibility.md). Keep this local file
short so maintainers entering the source directory can find the boundary without duplicating the
board reference.
