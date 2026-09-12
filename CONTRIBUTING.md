# Contributing

Engineering conventions that apply to every change live in [`AGENTS.md`](./AGENTS.md). This page covers only
what is specific to FC Emu: hardware evidence, architecture boundaries, mappers, and the ROM policy.

Accuracy work is useful when the hardware claim, the implementation, the test, and the documentation move
together. A change that alters emulated behaviour without naming the evidence for it is not reviewable.

> The repository is currently marked `UNLICENSED`. Before external contributions can be accepted, the owner
> must select an open-source license and contributors must agree to that contribution policy.

## Before you start

- Search existing issues and pull requests before starting overlapping work.
- For a behaviour change, identify the chip, bus signal, board, or browser boundary that owns it.
- For a large new mapper, timing model, or public API change, open a design issue before implementing.
- Never attach, commit, or request a commercial ROM.
- Report security vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## Set up the workspace

Requirements are Node.js 22 and Yarn 1.22.22.

```bash
git clone https://github.com/Tangerg/fcemu.git
cd fcemu
yarn install --frozen-lockfile
yarn quality
yarn build
```

Keep generated `dist`, coverage, local ROM, and editor files out of commits.

## Architecture rules

- Dependencies point inward. Core domain code cannot depend on application or browser code.
- `@fcemu/core` is platform-independent; browser APIs stay in UI infrastructure.
- UI domain and application code depends on ports, not on Canvas, Web Audio, IndexedDB, or React.
- Mapper implementations stay behind the mapper contract and factory.
- Extract a class or folder only for a real hardware owner, an independently testable state machine, or an
  external boundary. Do not mirror enterprise DDD templates onto chip internals.
- Preserve one time authority (`MachineClock`) and one production CPU execution engine.

Run `yarn check:layers` and `yarn check:circular` after moving imports or boundaries. The rationale and
package map live in [Architecture](./docs/architecture.md).

## Hardware behaviour changes

Every hardware-facing change should carry:

1. A source from the hierarchy in [Hardware evidence policy](./docs/hardware-reference.md).
2. A short statement of the current contradiction and the intended observable behaviour.
3. A focused unit or integration test at the owning boundary.
4. Relevant external conformance evidence when an executable fixture exists.
5. Updated compatibility, subsystem, or API documentation.

Do not make a ROM-name, checksum, or title-specific behaviour exception. Checksums are acceptable only for
test-fixture identity and pinned regression output.

## Mappers

Follow [Mapper reference: Adding a mapper](./docs/mappers/README.md#adding-a-mapper). A complete change covers
identity and submapper policy, geometry validation, board-owned RAM behaviour, mirroring, bus conflicts,
reset, save-state validation, and evidence classification.

Evidence maturity is earned, not asserted: a focused synthetic test earns `Implemented`, and only executable
external or pinned real-ROM evidence earns `Verified`.

## Tests and external fixtures

```bash
yarn quality
yarn build
```

Run the smallest focused test while developing, then the complete gate before review. When changing clock
ordering, CPU/PPU/APU/DMA behaviour, or mapper-visible fetches, run the relevant checksum-pinned external
suites described in [Testing](./docs/testing.md).

Commercial ROMs stay outside the repository. The real-ROM smoke runner accepts only known local files and must
never download or discover them automatically. Do not update a visual or audio baseline merely to make a
failure green; explain the hardware reason and inspect the changed output.

## Documentation

- Write current contracts, not a diary of implementation steps.
- Link to one canonical explanation instead of copying the same detail into several files.
- Use `$4014` for hardware addresses in prose and `0x4014` in code.
- Distinguish measured facts, source-backed facts, and implementation policy.
- Run `yarn check:docs` and `yarn format:check`.

## Pull requests

- [ ] The change has one coherent purpose.
- [ ] Public behaviour and compatibility impact are described.
- [ ] New state has power-on/reset and save/restore behaviour.
- [ ] Relevant conformance and real-ROM evidence is recorded.
- [ ] Documentation and local links are current.
- [ ] `yarn quality` and `yarn build` pass.
- [ ] No ROM, generated output, credentials, or unrelated local changes are included.

Keep commit messages imperative and scoped:

```text
fix: clock MMC3 from real PPU fetch addresses
docs: define mapper evidence maturity
```
