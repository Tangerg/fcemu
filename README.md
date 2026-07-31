# FC Emu

[![CI](https://github.com/Tangerg/fcemu/actions/workflows/ci.yml/badge.svg)](https://github.com/Tangerg/fcemu/actions/workflows/ci.yml)

An accuracy-oriented FC/NES emulator for the browser, built as a TypeScript monorepo. The core models
the console around its physical CPU, PPU, APU, cartridge, controller and bus boundaries; the React
workbench is a separate application that adapts those boundaries to Canvas, Web Audio, browser
storage and user input.

FC Emu is pre-1.0 software. It has strong automated evidence for the hardware paths listed in the
[compatibility matrix](./docs/mapper-compatibility.md), but it does not claim universal game or
mapper compatibility.

## Highlights

- Cycle-stepped RP2A03 CPU, interrupt entry and OAM/DMC DMA arbitration.
- Dot-stepped RP2C02 rendering, sprite evaluation, open bus and mapper-visible PPU transactions.
- NES/VS RGB PPU variants, cabinet inputs and mapper-99 mainboard banking.
- Region-specific NTSC, PAL and Dendy CPU/PPU/APU timing.
- iNES and a deliberately constrained NES 2.0 subset with explicit board validation.
- Battery-backed PRG/CHR/mapper persistence and versioned, transactional save states.
- Keyboard and two-player gamepad input, AudioWorklet output and three persistent quick-save slots.
- Independent `@fcemu/core` and `@fcemu/ui` packages with enforced clean-architecture boundaries.

Implemented mapper IDs: **0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24,
25, 26, 32, 33, 34, 48, 64, 65, 66, 68, 69, 70, 71, 75, 76, 78, 79, 80, 82, 83, 85, 87, 88, 89,
90, 91, 93, 94, 95, 97, 99, 118, 119, 140, 152, 180, 184, 185, 206, 225, 227 and 228**. “Implemented” and
“verified” have different evidence requirements; see
[Mapper compatibility](./docs/mapper-compatibility.md) before filing a game-compatibility report.

## Quick start

Requirements:

- Node.js 22
- Yarn 1.22.22
- A legally obtained iNES or supported NES 2.0 ROM image

```bash
git clone https://github.com/Tangerg/fcemu.git
cd fcemu
yarn install --frozen-lockfile
yarn dev
```

Open the Vite URL printed in the terminal, choose a ROM, then use the controls below. ROM images are
loaded locally in the browser and are never part of this repository.

| Player | Direction       | A   | B   | Start   | Select  |
| ------ | --------------- | --- | --- | ------- | ------- |
| P1     | `W` `A` `S` `D` | `J` | `K` | `Enter` | `Space` |
| P2     | Arrow keys      | `0` | `1` | —       | —       |

Standard gamepads are assigned to stable player-one/player-two slots. When a game is loaded, the
canvas owns gameplay keys; tabbing to a workbench control returns those keys to the browser until
the action completes. A loaded VS UniSystem image adds a dedicated coin button to the workbench.

For installation details, browser-storage behavior and troubleshooting, read
[Getting started](./docs/getting-started.md).

## Workspace

```text
packages/
  fc-emu/  @fcemu/core — platform-independent emulator and public application facade
  ui/      @fcemu/ui   — browser workbench and infrastructure adapters
docs/                  — architecture, hardware, compatibility and contributor references
```

`@fcemu/core` has no dependency on React, the DOM, Canvas, Web Audio, browser files or IndexedDB.
The only supported integration surface is its package-root export. See
[Core API](./docs/core-api.md) and [Architecture](./docs/architecture.md).

## Development

```bash
yarn dev              # start the browser workbench
yarn build            # build the core and production UI
yarn quality          # complete required local/CI quality gate
yarn test             # core and UI unit/integration tests
yarn check:docs       # Markdown structure and local-link validation
yarn benchmark:core   # frame-buffer, full-frame and save-state benchmarks
```

Redistributable conformance ROMs and local commercial-ROM smoke profiles are intentionally outside
the normal test command. Their provenance, pinned checksums and exact runners are documented in
[Testing](./docs/testing.md).

## Documentation

- [Documentation index](./docs/README.md)
- [Getting started](./docs/getting-started.md)
- [Core API](./docs/core-api.md)
- [Browser workbench](./docs/workbench.md)
- [Architecture](./docs/architecture.md)
- [Hardware evidence policy](./docs/hardware-reference.md)
- [Mapper compatibility](./docs/mapper-compatibility.md)
- [Mapper real-ROM validation plan](./docs/mapper-real-rom-plan.md)
- [Testing and conformance](./docs/testing.md)
- [Engineering roadmap](./docs/engineering-roadmap.md)

## Contributing

Hardware changes need an explicit source, a focused state-transition test and the relevant
conformance evidence. Start with [CONTRIBUTING.md](./CONTRIBUTING.md); report vulnerabilities through
the private process in [SECURITY.md](./SECURITY.md). By participating, you agree to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## ROMs and trademarks

No commercial ROM is distributed, downloaded or searched for by this project. `.nes` files are
ignored by Git, and real-ROM runners accept only explicit local paths with pinned identities. FC,
Famicom, NES and Nintendo are trademarks of their respective owners; this project is not affiliated
with or endorsed by Nintendo.

## License status

The package metadata currently declares `UNLICENSED`; no open-source license has been granted yet.
Repository owners must select and add a license before presenting the project as open source or
accepting contributions under an open-source license. Incorporated third-party work retains its
original terms in [Third-party notices](./THIRD_PARTY_NOTICES.md).
