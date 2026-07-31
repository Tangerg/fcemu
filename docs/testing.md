# Testing and conformance

FC Emu separates fast repository-owned tests from external hardware-conformance evidence and local
commercial-ROM smoke tests. A green unit suite is necessary, but it is not sufficient evidence for
hardware compatibility.

## Required local gate

```bash
yarn quality
yarn build
```

`yarn quality` runs, in order:

| Gate                  | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `yarn typecheck`      | Type-check both workspaces without emitting output.          |
| `yarn lint`           | Reject Oxlint warnings in production and test code.          |
| `yarn format:check`   | Enforce one Prettier representation.                         |
| `yarn check:docs`     | Validate Markdown structure and repository-local links.      |
| `yarn test`           | Run all core and UI Vitest suites.                           |
| `yarn knip`           | Detect unused files, exports and dependencies.               |
| `yarn check:circular` | Reject runtime import cycles.                                |
| `yarn check:layers`   | Enforce package and clean-architecture dependency direction. |

CI runs the same gate on pushes to `master`/`main` and on every pull request, then runs the
production build.

## Focused development tests

Run the smallest owning suite while iterating:

```bash
yarn workspace @fcemu/core test src/domain/emulation/ppu.test.ts
yarn workspace @fcemu/core test src/domain/emulation/mapper/mmc2-mapper.test.ts
yarn workspace @fcemu/ui test src/application/emulator-application.test.ts
```

Tests live next to the code they exercise. Prefer:

1. pure value/function tests for address and bit-level rules;
2. entity tests for state transitions and validation;
3. aggregate tests for bus order and cross-component invariants;
4. public-facade tests for caller-visible contracts.

When a bug crossed a boundary, keep a regression at that boundary. For example, mapper latch unit
tests do not replace a PPU integration test proving that real sprite fetches emit the full address in
the correct order.

## Evidence levels

Mapper status uses two explicit evidence levels:

- **Implemented** — the board is selected only from valid identity/geometry, its focused behavior
  and save-state tests pass, and unsupported variants fail closed.
- **Verified** — Implemented, plus a checksum-pinned redistributable conformance fixture or an
  explicit pinned real-ROM profile exercises the board through the public emulator.

“Verified” applies to the recorded behavior, not every game ever shipped on that mapper. See
[Mapper compatibility](./mapper-compatibility.md).

## External conformance runners

External fixtures stay outside the worktree. The repository records upstream revision, license,
checksum, invocation and expected protocol in
[`packages/fc-emu/test-support/external-roms.md`](../packages/fc-emu/test-support/external-roms.md).

| Command                                                    | Evidence                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `yarn conformance:rom -- ROM [frames] [region] [protocol]` | Generic Blargg or zero-page result protocol.             |
| `yarn conformance:accuracy-coin -- ROM`                    | RP2A03 data-bus, DMA, controller and interrupt behavior. |
| `yarn conformance:mmc1 -- DIR`                             | Holy Mapperel SxROM board matrix.                        |
| `yarn conformance:mapper34 -- DIR`                         | Holy Mapperel BNROM fixture and visual hash.             |
| `yarn conformance:oam-bus -- ROM [frames]`                 | Exact Quietust `read2004` byte screen.                   |
| `yarn conformance:pal-apu -- DIR`                          | Ten PAL APU visual hashes.                               |

Do not copy an upstream fixture into the repository merely to make CI convenient. If a fixture is
redistributable but too large or awkward for Git, document a checksum-pinned acquisition process.

## Real-ROM smoke tests

Commercial ROM bytes never enter Git or CI. The runner accepts only an explicit path whose SHA-256
matches a committed profile:

```bash
yarn smoke:real-rom -- mario /absolute/path/to/MARIO.NES
yarn smoke:real-rom -- contra /absolute/path/to/CONTRA.NES
yarn smoke:real-rom -- all /absolute/path/to/rom-directory
```

Before creating profiles, inventory an explicitly supplied directory without changing it:

```bash
yarn catalog:roms -- /absolute/path/to/rom-directory
```

After reviewing the summary, append `--apply` to organize images by parsed mapper and loadability.
The cataloger never deletes or patches a ROM. It preserves duplicate payloads and isolates dirty
headers, trailing data, truncated files and unsupported board configurations for review:

```bash
yarn catalog:roms -- /absolute/path/to/rom-directory --apply
```

Profiles verify cartridge identity, several visual checkpoints, a deterministic input sequence,
audio output, CPU-cycle counts and two identical save-state replays. Full details live in
[`packages/fc-emu/test-support/real-roms.md`](../packages/fc-emu/test-support/real-roms.md).
The title, region and board candidates for extending that corpus across every implemented ID live
in [Mapper real-ROM validation plan](./mapper-real-rom-plan.md).

The runner must never:

- search a user's disk for ROMs;
- download a ROM;
- write to or normalize the ROM;
- print ROM content;
- accept a different checksum under an existing profile name.

## Updating a baseline

Never update an expected hash solely because implementation output changed.

1. Identify the hardware rule or intentional presentation change.
2. Add a focused test that explains the new state transition.
3. Inspect the first divergent frame/sample/checkpoint.
4. Run neighboring conformance suites that share the clock or bus boundary.
5. Record why the old baseline was wrong.
6. Update only the affected expected values.

If two hardware-backed tests require incompatible results, keep the last jointly verified behavior
and document the missing silicon revision, signal or phase. Do not introduce a ROM-specific branch.

## Clock-ordering regression matrix

Changes to `MachineClock`, CPU read/write phases, PPU fetches, interrupts or DMA should run at least:

- CPU instruction and interrupt suites;
- PPU vblank/NMI, sprite and OAM suites;
- APU/DMC and OAM/DMC collision suites;
- MMC3 A12/IRQ tests;
- both real-ROM smoke profiles.

The exact external command depends on which local fixtures are available; report skipped fixtures
rather than claiming they passed.

## Benchmarks

```bash
yarn benchmark:core
```

The benchmark builds the core and measures frame-buffer conversion, full-frame execution and
save-state capture/restore. Benchmarks are diagnostic, not a CI pass/fail gate. Performance changes
need before/after measurements on the same runtime and hardware; accuracy changes do not need a
performance justification.

## Documentation checks

`yarn check:docs` validates every repository-owned Markdown file for:

- exactly one top-level heading;
- no heading-level jumps;
- valid repository-local link targets;
- no machine-specific absolute file links.

External URLs are intentionally not fetched in CI. When adding one, prefer stable upstream project,
hardware-documentation or source-revision URLs over search results and mirrors.
