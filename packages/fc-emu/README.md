# `@fcemu/core`

Platform-independent FC/NES emulation core for the FC Emu monorepo.

The package parses a supported iNES/NES 2.0 image, runs one deterministic frame at a time and emits
video/audio through narrow output ports. It has no dependency on React or browser APIs.

```ts
import { Emulator } from "@fcemu/core";

const emulator = Emulator.fromRom(romBytes, "homebrew.nes", outputs);
const frame = emulator.runFrame();
```

Only exports from the package root are supported. The package is pre-1.0, currently workspace-owned
and not documented as a published npm release.

## Commands

From the repository root:

```bash
yarn workspace @fcemu/core build
yarn workspace @fcemu/core test
yarn workspace @fcemu/core typecheck
yarn benchmark:core
```

## Documentation

- [Core API](../../docs/core-api.md)
- [Architecture](../../docs/architecture.md)
- [Testing and conformance](../../docs/testing.md)
- [Mapper compatibility](../../docs/mapper-compatibility.md)

The package metadata is currently `UNLICENSED`; see the repository
[license status](../../README.md#license-status).
