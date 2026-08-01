# Browser workbench

`@fcemu/ui` is a clean-architecture browser application around `@fcemu/core`. It owns user/session
policy and adapts the core to Canvas, Web Audio, browser files, input devices, frame scheduling and
IndexedDB. No browser type crosses into the core.

## Layer map

| Layer          | Ownership                                                               | Representative files                                          |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Domain         | Immutable session transitions and execution-region preference           | `domain/emulation-session.ts`, `domain/execution-region.ts`   |
| Application    | ROM/session lifecycle, frame pacing, persistence, quick saves and ports | `application/emulator-application.ts`, `application/ports.ts` |
| Infrastructure | Core adapter, file hashing, Canvas, AudioWorklet, input and IndexedDB   | `infrastructure/browser/`                                     |
| Presentation   | React rendering, focus and accessible interaction                       | `presentation/App.tsx`, CSS                                   |
| Composition    | Concrete browser object graph                                           | `app/compose.ts`                                              |

`yarn check:layers` prevents domain/application imports from pointing outward and prevents UI code
from bypassing the `@fcemu/core` package root.

## Session lifecycle

`EmulationSession` is an immutable state machine:

```text
idle -> loading -> ready -> running <-> paused
                  \                /
                   ------> error
```

Loading another ROM is latest-wins. `EmulatorApplication.operationSequence` invalidates stale async
file, storage, audio and region-rebuild continuations. The loaded `RomImage` and its runtime live in
one private `ActiveEmulation` record and are installed or cleared atomically.

Eject, disposal and load failure cancel scheduled frames, clear the active pair and reset runtime
diagnostics. Battery persistence is best-effort and cannot later stop or replace a newer session.
The IndexedDB adapter rejects battery records that are not the `ArrayBuffer` shape it writes; it
never coerces an unrelated structured-clone value into zero-filled NVRAM.

Battery writes are serialized per cartridge identity at the application boundary. A later revision
therefore cannot reach storage before an older write finishes and then be overwritten by it. An
immediate reload of the same ROM restores the outgoing runtime's freshly captured in-memory snapshot
instead of racing a pending write against a stale storage read. Stop and disposal also drain writes
that were queued by an older cartridge during the same application lifetime.

## Frame scheduling

The application schedules through `FrameSchedulerPort`; the browser adapter uses
`requestAnimationFrame`. Target interval derives from the runtime's region-specific `frameRateHz`.

The scheduler:

- runs one frame on the first callback;
- accumulates elapsed frame debt;
- caps catch-up at three frames per callback;
- discards debt after a gap longer than four target intervals;
- records measured FPS over approximately one-second windows.

This policy keeps UI scheduling outside the core. Every emulated frame still runs the same
cycle/dot-stepped hardware engine.

## Audio lifecycle

`WebAudioOutput` implements both the core `AudioSampleSink` and the UI `AudioLifecyclePort`.

- The device `AudioContext.sampleRate` is supplied to the core at runtime construction.
- Main-thread samples are grouped into transferable batches.
- A separately bundled AudioWorklet owns a bounded rebuffering ring.
- Pause, reset, power cycle, quick-load and disposal clear stale queued/ring audio.
- Autoplay denial becomes the explicit `blocked` application state; a later user gesture retries the
  existing audio port without restarting emulation.

Diagnostics expose device rate, pending main-thread samples, worklet-buffered samples, underruns and
dropped samples. They are read-only observations, not session-domain state.

## Input and focus

Keyboard and gamepad adapters emit the same domain-level `{player, button, pressed}` event.
`CompositeControllerInput` tracks pressed intent by source, preventing a keyboard release from
canceling a gamepad button still held.

The canvas is focusable only while a cartridge session can run. It receives focus after a successful
load and after workbench actions; focused buttons and inputs retain normal browser keyboard
semantics. The status output is a polite live region, errors use `role="alert"`, and the workbench
reports loading through `aria-busy`.

Bindings are documented in [Getting started](./getting-started.md#controls).

When `RomDetails.consoleType === 1`, presentation adds a labeled `投币` button. The action crosses
`EmulatorApplication.insertCoin` and the runtime port into the core cabinet device; React never
mutates a mapper or controller directly. The button is absent for ordinary NES/Famicom images.

## ROM identity and persistence

`BrowserRomReader` reads only the explicitly selected file and derives the UI cartridge ID from its
full content. Storage is behind two application ports implemented by one IndexedDB adapter:

| Store           | Key                                 | Value                        |
| --------------- | ----------------------------------- | ---------------------------- |
| `battery-saves` | ROM content identity                | copied battery `ArrayBuffer` |
| `quick-saves`   | ROM identity + actual region + slot | version-1 Workbench envelope |

Battery writes are skipped when the core revision has not changed. Quick-save records carry frame
and CPU-cycle counters plus an opaque core runtime state. Hydration validates outer format, version,
identity, region and slot before exposing availability.

Corrupt or obsolete records are ignored or removed. A failed storage operation never makes the
active emulator unavailable.

## Region rebuild

Region preference is `auto | ntsc | pal | dendy`. The selected `ConsoleTiming` is immutable inside a
runtime, so changing preference builds a fresh runtime transactionally:

1. Capture outgoing battery memory.
2. Construct the candidate runtime.
3. Restore battery memory when compatible.
4. Reapply currently held input.
5. Swap the active runtime only after all synchronous validation succeeds.
6. Rehydrate quick saves when the actual region changed.
7. Resume only if the previous session was running.

Failure keeps the old runtime and restores the previous preference.

## Testing

Domain and application tests run with in-memory ports and deterministic schedulers. Browser adapters
have focused tests for file identity, Canvas/core translation, keyboard/gamepad composition,
AudioWorklet buffering policy and IndexedDB schema/validation.

Browser-level end-to-end coverage is still a roadmap item. Manual runs with the pinned Mario and
Contra profiles do not replace redistributable automated UI fixtures; see
[Engineering roadmap](./engineering-roadmap.md).
