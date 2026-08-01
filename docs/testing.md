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

| Gate                  | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `yarn typecheck`      | Type-check both workspaces without emitting output.           |
| `yarn lint`           | Reject Oxlint warnings in production and test code.           |
| `yarn format:check`   | Enforce one Prettier representation.                          |
| `yarn check:docs`     | Validate links, mapper catalog and save-state version claims. |
| `yarn test`           | Run all core and UI Vitest suites.                            |
| `yarn knip`           | Detect unused files, exports and dependencies.                |
| `yarn check:circular` | Reject runtime import cycles.                                 |
| `yarn check:layers`   | Enforce package and clean-architecture dependency direction.  |

CI runs the same gate on pushes to `master`/`main` and on every pull request, then runs the
production build.

`yarn build` first emits `@fcemu/core`, compiles a separate NodeNext consumer against its public
declarations, checks the exact runtime root exports, verifies that deep `dist` imports are blocked,
and then builds the UI. Run the self-contained package contract alone with:

```bash
yarn check:core-package
```

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

External fixtures stay outside the tracked worktree. The repository records upstream revision,
license status, checksum, invocation and expected protocol in
[`packages/fc-emu/test-support/external-roms.md`](../packages/fc-emu/test-support/external-roms.md).

Fetch the pinned local CPU/PPU/APU/DMA set into the ignored `packages/fc-emu/test-roms/` directory:

```bash
yarn fetch:test-roms
```

| Command                                                    | Evidence                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `yarn conformance:fixtures`                                | Complete checksum-pinned CPU/PPU/APU/DMA CI gate.        |
| `yarn conformance:rom -- ROM [frames] [region] [protocol]` | Generic Blargg or zero-page result protocol.             |
| `yarn conformance:nestest`                                 | 8,991 CPU register and cycle trace records.              |
| `yarn conformance:cpu-timing`                              | Official/unofficial instruction timing result screen.    |
| `yarn conformance:accuracy-coin -- ROM`                    | RP2A03 data-bus, DMA, controller and interrupt behavior. |
| `yarn conformance:mmc1 -- DIR`                             | Holy Mapperel SxROM board matrix.                        |
| `yarn conformance:mapper34 -- DIR`                         | Holy Mapperel BNROM fixture and visual hash.             |
| `yarn conformance:oam-bus -- ROM [frames]`                 | Exact Quietust `read2004` byte screen.                   |
| `yarn conformance:pal-apu -- DIR`                          | Ten PAL APU visual hashes.                               |

Absolute paths are accepted. Relative ROM and fixture paths are resolved from the monorepo root
when these root-level Yarn commands are used.

CI runs `conformance:fixtures` after `quality` and `build`. The command verifies or downloads the
pinned nine-file manifest, builds the core once, then runs nestest, CPU timing, both instruction
suites, PPU VBL/NMI, APU and both Sprite/DMC DMA collision fixtures. Specialized suites whose
redistribution or local setup is not covered by that manifest remain explicit manual gates.

Do not copy an upstream fixture into the tracked repository merely to make CI convenient. If a
fixture is redistributable but too large or awkward for Git—or its collection-level license is
unclear—document a checksum-pinned acquisition process.

## Real-ROM smoke tests

Commercial ROM bytes never enter Git or CI. The runner accepts only an explicit path whose SHA-256
matches a committed profile:

```bash
yarn smoke:real-rom -- mario /absolute/path/to/MARIO.NES
yarn smoke:real-rom -- contra /absolute/path/to/CONTRA.NES
yarn smoke:real-rom -- kage /absolute/path/to/KAGE.NES
yarn smoke:real-rom -- smb3 /absolute/path/to/SMB3-J.NES
yarn smoke:real-rom -- punchout /absolute/path/to/PUNCHOUT-J.NES
yarn smoke:real-rom -- dbz5 /absolute/path/to/dbz5cn.nes
yarn smoke:real-rom -- sango4 /absolute/path/to/sango4.nes
yarn smoke:real-rom -- super42 /absolute/path/to/Super_42-in-1.nes
yarn smoke:real-rom -- genke "/absolute/path/to/Gen Ke Le Zhuan (C).nes"
yarn smoke:real-rom -- waixin "/absolute/path/to/Wai Xin Zhan Shi.nes"
yarn smoke:real-rom -- decathlon "/absolute/path/to/Cecathlon (C).nes"
yarn smoke:real-rom -- dragonquest7 "/absolute/path/to/勇者斗恶龙7(中文).nes"
yarn smoke:real-rom -- fengshenbang "/absolute/path/to/封神榜.nes"
yarn smoke:real-rom -- baoqingtian "/absolute/path/to/Bao Qing Tian (C).nes"
yarn smoke:real-rom -- timediver "/absolute/path/to/Time Diver Avenger (C).nes"
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
- all pinned real-ROM smoke profiles.

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
- exact mapper-number parity between `createMapper`, the compatibility table and detailed board
  headings, including duplicate and compatibility-table order detection.

External URLs are intentionally not fetched in CI. When adding one, prefer stable upstream project,
hardware-documentation or source-revision URLs over search results and mirrors.
