# Real-ROM smoke profiles

Commercial ROM images never belong in this repository. The smoke runner accepts only known local
files whose SHA-256 matches a committed profile; it never searches for, downloads or modifies ROM
content. The repository also ignores every `.nes` file to reduce the risk of committing one by
accident.

The current profiles cover the two files used during development:

| Profile  | Expected file | SHA-256                                                            | Mapper |
| -------- | ------------- | ------------------------------------------------------------------ | ------ |
| `mario`  | `MARIO.NES`   | `e9d2cc78600d4b765eca41b87eaa2b8f593d5bad5d71d2f3d6b43c5092e5705b` | 0      |
| `contra` | `CONTRA.NES`  | `26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519` | 2      |

Run one profile with an explicit file:

```bash
yarn smoke:real-rom -- mario /absolute/path/to/MARIO.NES
yarn smoke:real-rom -- contra /absolute/path/to/CONTRA.NES
```

Or run every profile against a directory containing the expected filenames:

```bash
yarn smoke:real-rom -- all /absolute/path/to/roms
```

Each profile verifies:

- exact ROM SHA-256 plus format, mapper, region and ROM/CHR geometry;
- a pinned 300-frame no-input visual sequence;
- a deterministic Start/A/B/directional input timeline with visual, audio and CPU-cycle checks;
- several intermediate frame hashes so a failure can be localized;
- a Save State captured before active input, followed by two identical 120-frame visual/audio
  replays.

These commands are intentionally not part of CI because the ROM files cannot be distributed with the
repository. Updating a pinned result requires deliberate review of the affected frame or audio
behavior; a new hash must not be accepted solely to make the runner green.
