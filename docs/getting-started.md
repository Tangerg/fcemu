# Getting started

This guide runs the browser workbench from a clean checkout. It assumes no globally installed
TypeScript or Vite tooling.

## Prerequisites

| Requirement | Supported value                                                                    | Check            |
| ----------- | ---------------------------------------------------------------------------------- | ---------------- |
| Node.js     | 22.x                                                                               | `node --version` |
| Yarn        | 1.22.22                                                                            | `yarn --version` |
| Browser     | Current desktop browser with Canvas, IndexedDB, Web Audio and AudioWorklet support | —                |

The repository uses Yarn Classic workspaces. Do not replace `yarn.lock` with another package
manager's lockfile.

## Install and run

```bash
git clone https://github.com/Tangerg/fcemu.git
cd fcemu
yarn install --frozen-lockfile
yarn dev
```

Vite prints the local URL, normally `http://localhost:5173`. The workbench starts without a
cartridge; select a local `.nes` file to create an emulation session.

The emulator does not include ROMs, search your filesystem for ROMs or upload them to a server.
Use dumps you are legally entitled to use.

## Controls

| Player | Direction       | A   | B   | Start   | Select  |
| ------ | --------------- | --- | --- | ------- | ------- |
| P1     | `W` `A` `S` `D` | `J` | `K` | `Enter` | `Space` |
| P2     | Arrow keys      | `0` | `1` | —       | —       |

The top-row and numeric-keypad `0`/`1` keys are both accepted for P2. Standard gamepads use their
directional axes/D-pad and are assigned by stable connection slot. Keyboard and gamepad inputs are
composed, so releasing one device does not cancel a button still held on another.

VS UniSystem images show a `投币` control that produces one physical-duration coin-contact pulse.
After inserting a coin, `Enter` selects one-player mode through the cabinet's dedicated Select-1
line; the ordinary NES `Select` function is not wired on a VS panel. Gameplay identity follows NES
2.0's `$4016`/`$4017` stick-routing metadata when it exists, independently from those fixed cabinet
selection lines.

After a ROM loads, the canvas receives gameplay focus. `Tab` moves focus to workbench controls;
activating a control with `Enter` or `Space` returns focus to the canvas when appropriate.

## Runtime controls

- **Play / pause** controls frame scheduling and suspends or resumes audio.
- **Reset** applies the front-loader reset line. CPU arithmetic state, console RAM, PPU VRAM/OAM and
  mapper latches follow the modeled reset policy.
- **Power cycle** clears volatile machine and cartridge state but preserves battery data and
  persisted quick-save slots.
- **Execution region** selects `AUTO`, `NTSC`, `PAL` or `DENDY`. Changing it rebuilds the runtime,
  preserves battery data and held controller intent, and keeps a paused session paused.
- **VS coin** appears only for VS UniSystem images. VS hardware is NTSC-only, so PAL/Dendy choices
  are disabled for those sessions.
- **Quick saves** provide three slots isolated by ROM identity and actual execution region.
- **Eject** stops the runtime and returns focus to the ROM selector.

If the browser blocks audio autoplay, the game continues silently and the primary action changes to
an audio-enable action. A user gesture retries Web Audio without restarting the emulator.

## Local browser data

The workbench stores two independent forms of data in IndexedDB:

| Data                  | Key                                        | Lifetime                                              |
| --------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Battery-backed memory | SHA-256-derived ROM identity               | Periodic and lifecycle checkpoints                    |
| Quick-save state      | ROM identity + execution region + slot 1–3 | Until that slot is removed or browser data is cleared |

Battery data contains only cartridge NVRAM. Quick saves contain a versioned machine snapshot and UI
timeline. Neither modifies the ROM file.

## Production build

```bash
yarn build
yarn preview
```

`yarn build` first builds `@fcemu/core`, then type-checks and bundles `@fcemu/ui`. `yarn preview`
serves the generated UI locally for production-bundle inspection.

## Common problems

### The ROM is rejected

The parser intentionally rejects unsupported console types, unsafe RAM layouts, unknown mapper
variants and board geometries the emulator cannot model. Compare the reported mapper/submapper with
[Cartridge formats](./cartridge-formats.md) and [Mapper compatibility](./mapper-compatibility.md).

### There is no sound

Click the audio-enable action after the ROM is running. Check that the tab is not muted and that the
browser supports AudioWorklet. The runtime diagnostics show device rate, queued/buffered samples,
underruns and dropped samples.

### Controls affect the page instead of the game

Click the game canvas to return gameplay focus. Focused workbench buttons deliberately retain
keyboard ownership for accessible navigation.

### A save does not appear in another region

Quick saves are isolated by the actual NTSC/PAL/Dendy execution region. Switch back to the region in
which the slot was created. Battery-backed memory is shared by ROM identity and survives region
changes.

### Dependencies or generated output look stale

```bash
rm -rf node_modules packages/fc-emu/dist packages/ui/dist
yarn install --frozen-lockfile
yarn quality
yarn build
```

This removes only generated dependencies/build output, not ROMs or browser IndexedDB data.
