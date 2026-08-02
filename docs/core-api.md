# Core API

`@fcemu/core` is the platform-independent emulator package. It accepts a ROM image, exposes a
synchronous one-frame execution method and communicates with hosts through narrow video/audio output
ports. It does not schedule frames, open files, create browser nodes or persist data.

The package is currently consumed from this monorepo workspace and is not documented as a published
npm release.

## Create an emulator

```ts
import { Emulator } from "@fcemu/core";

const response = await fetch("/roms/homebrew.nes");
const rom = await response.arrayBuffer();

const emulator = Emulator.fromRom(rom, "homebrew.nes");
console.log(emulator.cartridge.mapperNumber);
console.log(emulator.frameRateHz);
```

`Emulator.fromRom` accepts:

1. the complete ROM `ArrayBuffer`;
2. an optional source name used in validation errors;
3. optional video/audio output ports;
4. an optional explicit console region.

Header, format and mapper failures are reported before the first frame. Callers can distinguish
`CartridgeFormatError`, `UnsupportedMapperError`, `UnsupportedMapperVariantError` and
`UnsupportedMapperConfigurationError` from the package root.

## Drive video and audio

```ts
import { Emulator, type EmulatorOutputPorts } from "@fcemu/core";

const outputs: EmulatorOutputPorts = {
  video: {
    renderFrame(frame) {
      const rgba = frame.toCanvasImageData();
      // Copy `rgba` into the host's 256 × 240 output surface.
    },
  },
  audio: {
    sampleRate: 48_000,
    writeSample(sample) {
      // Queue one normalized mono sample for the host audio device.
    },
  },
};

const emulator = Emulator.fromRom(rom, "homebrew.nes", outputs);
const result = emulator.runFrame();
console.log(result.frameNumber, result.cpuCycles);
```

`runFrame()` advances until the PPU crosses one frame boundary, calls the optional video sink once,
and returns the immutable frame result. The host owns pacing; browser integrations should schedule
against `emulator.frameRateHz` rather than assuming 60 Hz.

The video frame is always 256 × 240. `toCanvasImageData()` returns RGBA bytes suitable for copying
into `ImageData`. On little-endian hosts the returned bytes are a read-only view over an internal
double buffer: consume or copy them synchronously rather than retaining or mutating them across
frames. The audio sink's finite positive `sampleRate` selects the core's output cadence; the host
owns buffering, resampling policy and device lifecycle.

## Controller input

```ts
import { ControllerButton } from "@fcemu/core";

emulator.setControllerButton(1, ControllerButton.A, true);
emulator.runFrame();
emulator.setControllerButton(1, ControllerButton.A, false);
```

Players are `1 | 2`. `setControllerButton` is the preferred incremental API.
`setControllerState(player, buttons)` replaces the full eight-button state and is useful for
adapters that already own a complete input snapshot.

For a loaded VS UniSystem image, cabinet inputs are explicit:

```ts
emulator.insertCoin(); // slot 1, held for a hardware-sized 50 ms contact pulse
emulator.setServiceButton(true);
emulator.setDipSwitch(3, true);
```

`insertCoin(1 | 2)`, `setServiceButton` and `setDipSwitch(1..8, enabled)` reject standard-console
images. `emulator.cartridge.consoleType`, `vsPpuType` and `vsHardwareType` let a host present
appropriate controls without inspecting ROM bytes.

The Bandai Oeka Kids expansion-port tablet is a separate typed input rather than a controller or
mapper command:

```ts
emulator.setOekaKidsTabletInput({
  x: 120, // native tablet X: 0..239
  y: 128, // native tablet Y: 0..255
  touching: true,
  clicked: false,
});
```

Hosts should expose this input when `emulator.cartridge.defaultExpansionDevice === 0x17`.
`clicked` requires `touching`; invalid coordinate/contact combinations and cartridges without the
device fail closed. The unusual coordinate extents are hardware-native—the two games rescale them
back to a 256 × 240 picture.

On VS hardware, logical `ControllerButton.Start` drives the fixed Select-1/Select-2 cabinet line;
logical NES `Select` is ignored because that button is not wired. A player's A/B/directions follow
the VS gameplay-stick routing metadata independently: Select-1 always enters through `$4016` bit 2,
even when player one's gameplay stick is the left-hand `$4017` port. Both incremental and full-state
controller APIs apply the same mapping.

Runtime command validation is fail-closed for JavaScript callers as well as TypeScript consumers:
controller players and coin slots must be `1` or `2`, full controller reports must contain exactly
eight booleans, and service/DIP states must be booleans. Invalid values never fall through to player
two, coin slot two or a truthy cabinet input.

## Region selection

```ts
const pal = Emulator.fromRom(rom, "homebrew.nes", outputs, {
  consoleRegion: "pal",
});
```

The override accepts only `"ntsc"`, `"pal"` or `"dendy"` at runtime. Without an override, the header
chooses the region; multi-region images resolve deterministically to NTSC. Region is part of save-state
compatibility and cannot be changed on an existing instance—construct a new runtime instead. VS
hardware is NTSC-only and rejects PAL/Dendy overrides.

## Reset and power cycle

- `reset()` applies the modeled console reset line and preserves state that physical reset does not
  clear.
- `powerCycle()` returns volatile machine/cartridge state to the deterministic cold-start policy.
  Battery-backed NVRAM remains intact.

Both methods act synchronously. Hosts should flush queued audio before continuing the new timeline.

## Battery-backed memory

```ts
const snapshot = emulator.captureBatterySave();
if (snapshot) {
  await storage.save(snapshot.data, snapshot.revision);
}

emulator.restoreBatterySave(savedBytes);
```

`captureBatterySave()` returns `undefined` for cartridges without a battery. The monotonic revision
changes only when NVRAM content changes, allowing hosts to avoid redundant writes.
`restoreBatterySave()` requires a `Uint8Array` and validates the exact persistent-memory length
before mutating cartridge memory.

Battery data and save states are different contracts: battery data is durable game-owned NVRAM;
save state is a versioned emulator execution snapshot.

## Save states

```ts
const state = emulator.captureSaveState();
// Keep the object opaque and restore it into the same ROM/region runtime.
emulator.restoreSaveState(state);
```

A save state contains typed arrays and internal aggregate snapshots. Treat it as an opaque object;
plain `JSON.stringify`/`JSON.parse` is not a supported serializer. Capture and restore are accepted
only at a stable public-call boundary; re-entering either operation from an audio output callback is
rejected instead of returning a snapshot from the middle of a clock transaction. The core validates:

- format and exact schema version;
- the outer envelope shape even when the caller supplies untyped persisted data;
- whole-ROM identity;
- console region;
- audio sample rate inside the nested APU snapshot;
- every nested CPU, PPU, APU, DMA, mapper, clock, controller and cartridge invariant.

Restore is transactional: if any nested validation fails, the live runtime is rolled back. Schema
version 18 is intentionally exact rather than forward/backward compatible. Version 18 adds the
Oeka Kids tablet's physical input, serial report and OUT0/OUT1 line state to the transactional bus
snapshot.

## Diagnostics

`emulator.diagnostics` returns a frozen snapshot with the current frame number, total CPU cycles,
program counter and CPU halt state. Diagnostics are observational and do not advance emulation.

## Public API policy

Only names exported from `packages/fc-emu/src/index.ts` are supported integration points. Importing
from `@fcemu/core/dist/...` or workspace-internal source paths bypasses the domain boundary and may
break without notice during pre-1.0 development.

`yarn build` compiles a separate NodeNext consumer against the emitted package declarations, checks
the exact runtime root exports and proves that unsupported `dist` subpaths remain blocked by the
package `exports` map. The UI's development-time source alias is therefore not the only consumer
contract exercised in CI.
