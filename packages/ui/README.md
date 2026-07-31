# `@fcemu/ui`

Private React/Vite browser workbench for FC Emu. It adapts `@fcemu/core` to Canvas, AudioWorklet,
keyboard/gamepad input, requestAnimationFrame and IndexedDB while keeping browser dependencies out of
the emulator core.

## Commands

From the repository root:

```bash
yarn dev
yarn workspace @fcemu/ui test
yarn workspace @fcemu/ui typecheck
yarn workspace @fcemu/ui build
yarn preview
```

The UI is an application package, not a reusable component library. Domain/application policy lives
behind ports; concrete browser objects are created in `src/app/compose.ts`.

## Documentation

- [Getting started](../../docs/getting-started.md)
- [Browser workbench](../../docs/workbench.md)
- [Architecture](../../docs/architecture.md)
- [Core API](../../docs/core-api.md)
