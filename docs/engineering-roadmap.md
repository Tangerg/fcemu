# Engineering roadmap

FC Emu is an accuracy-first, pre-1.0 emulator. The current architecture is stable enough that new
work should increase executable evidence, close known hardware gaps or improve the public
integration experience—not add abstractions or mapper numbers for their own sake.

This document describes planned direction. Completed implementation history belongs in Git; current
capabilities and evidence belong in the subsystem references and compatibility matrix.

## Current baseline

- Two-package monorepo with enforced core/UI and clean-architecture boundaries.
- One cycle-stepped CPU engine, dot-stepped PPU, regional APU and shared DMA arbitration.
- NTSC, PAL and Dendy clock domains under one `MachineClock`.
- iNES plus a constrained, fail-closed NES 2.0 subset.
- 60 implemented mapper IDs; four board families currently have reproducible external or pinned
  real-ROM verification.
- Transactional version-14 save states and independent battery-backed NVRAM.
- Browser Canvas, AudioWorklet, keyboard/gamepad input, IndexedDB persistence and quick saves.
- Checksum-pinned external conformance runners and Mario/Contra local smoke profiles.

See [Mapper compatibility](./mapper-compatibility.md) and [Testing](./testing.md) for the precise
evidence behind these statements.

## Bounded mapper-completion track

The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is the finite
discovery boundary for the current expansion goal, not the hardware specification. It names 50
mapper IDs; the project covered 19 at the start of this track and must add the remaining 31 using
current NESdev board documentation. Mirroring and other electrical behavior are never copied from
the historical title table, whose own introduction warns that those fields are incomplete.

| Phase                    | Mapper IDs                     | Architectural dependency                      | Status      |
| ------------------------ | ------------------------------ | --------------------------------------------- | ----------- |
| Foundation boards        | 32, 68, 79, 97                 | Expansion-area writes; ROM nametables         | Implemented |
| IRQ and ASIC boards      | 16, 18, 48, 64, 65, 80, 82, 91 | CPU-cycle IRQ variants; board RAM             | Implemented |
| Konami VRC2/VRC4         | 21, 22, 23, 25                 | Shared pin-routing and VRC IRQ core           | Implemented |
| FFE and simple multicart | 6, 8, 15, 17, 225, 227, 228    | RAM-card state; outer/inner multicart banks   | Implemented |
| Cony clone ASIC          | 83                             | Outer banks; NVRAM; dual-source IRQ           | Implemented |
| JY clone ASIC            | 90                             | Multiplier, outer banks and IRQ variants      | Implemented |
| Expansion-audio boards   | 19, 24, 26, 85                 | VRC6 done; Namco 163 and VRC7 remain          | In progress |
| Advanced console boards  | 5, 99                          | MMC5 features; VS System console/header model | Planned     |

Completion means all 31 IDs meet the mapper definition of done below. It does not expand scope to
every assigned iNES/NES 2.0 number or permit title hashes and guessed board variants.

## Priority 1: verify the implemented mapper set

The largest compatibility risk is evidence depth, not missing class files. Mappers 6, 8, 9, 10, 11,
13, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 32, 33, 48, 64, 65, 66, 68, 69, 70, 71, 75, 76, 78,
79, 80, 82, 83, 87, 88, 89, 90, 91, 93, 94, 95, 97, 118, 119, 140, 152, 180, 184, 185, 206, 225,
227 and 228 are implemented but do not yet all have executable external verification.

For each board family:

1. Locate or build a redistributable homebrew/conformance fixture.
2. Pin upstream revision, license and SHA-256 outside the production code path.
3. Exercise bank boundaries, mirroring, RAM windows, bus conflicts, reset and IRQ/latch timing.
4. Add an automated runner with a machine-readable result or pinned visual hash.
5. Promote status to `Verified` only after the runner passes through the public emulator facade.

MMC2/MMC4 work should emphasize real PPU background/sprite trigger sequences. FME-7 work must keep
Sunsoft 5B expansion audio explicitly separate from mapper-69 base behavior.

## Priority 2: close unresolved timing evidence

Known research areas:

- DMC explicit-stop/implicit-stop abort phases across RP2A03 revisions.
- Combined DMC/internal-register activation details beyond the currently verified NTSC cases.
- Revision-specific OAMADDR corruption when rendering is toggled at unusual dots.
- Dendy clone behavior where NTSC/PAL evidence cannot safely be inherited.

A research item becomes an implementation task only when it has:

- a reproducible hardware trace or trusted technical source;
- an exact observable result;
- a focused automated regression;
- no contradiction with the existing jointly passing DMA, interrupt and PPU suites.

Do not add speculative silicon-profile flags to preserve two incompatible approximations.

## Priority 3: strengthen integration and release readiness

- Add browser-level end-to-end coverage for ROM load, focus ownership, autoplay recovery, region
  rebuild, persistence and quick-save isolation using redistributable fixtures.
- Stabilize and document the `@fcemu/core` public API; add compile-time consumer examples before an
  npm release.
- Define a supported save-state serialization/container format if states need to move across browser
  sessions or package versions. The current in-memory object is intentionally exact and opaque.
- Establish semantic versioning, changelog and release automation when the first public release is
  planned.
- Select an open-source license before accepting outside contributions or describing the repository
  as open source.

## Priority 4: accessibility and operational polish

- Keep full keyboard navigation and visible focus behavior as controls evolve.
- Add automated checks for critical status announcements and disabled-state semantics.
- Make audio/frame diagnostics actionable without turning them into mutable session state.
- Document browser support from measured results rather than inferred API availability.

## Non-goals

- JIT-compiling the 8-bit CPU without measurement showing the interpreter is the bottleneck.
- Unbounded mapper-count work outside the finite completion track while existing boards lack
  verification.
- ROM databases, title-specific hacks or automated commercial-ROM acquisition.
- Server-side ROM storage, accounts, cloud saves or telemetry.
- Netplay, rewind or shader systems before core state/version contracts are release-ready.
- Modeling every chip revision behind configuration flags without executable evidence.

## Definition of done

### Hardware behavior

- Source and current contradiction recorded.
- State transition implemented in the physical owner.
- Focused test and boundary-level regression added.
- Relevant external suites and both real-ROM profiles run or explicitly reported unavailable.
- Save-state and reset/power-on semantics covered when state changes.
- Subsystem and compatibility documentation updated.

### Mapper

- Explicit identity/submapper/geometry policy.
- No unreachable declared memory silently accepted.
- PRG/CHR/mirroring/conflict/IRQ/latch behavior covered.
- Runtime save-state validation and round-trip test.
- Evidence level recorded without overclaiming.

### Public API or UI behavior

- Domain/application ownership identified.
- Browser details remain behind ports.
- Error, loading, cancellation and disposal paths tested.
- Keyboard/focus/audio/persistence effects documented.
- `yarn quality` and `yarn build` pass.

## Release threshold

A 1.0 release should not mean “every NES game works.” It should mean:

- the repository has an explicit open-source license and contribution policy;
- the documented core API follows semantic versioning;
- supported formats/boards fail closed and match their published evidence;
- save-state and battery compatibility policies are stable;
- CI, external fixture provenance and release artifacts are reproducible;
- known limitations are discoverable from the README and compatibility matrix.
