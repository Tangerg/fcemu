# Real-ROM smoke profiles

Commercial ROM images never belong in this repository. The smoke runner accepts only known local
files whose SHA-256 matches a committed profile; it never searches for, downloads or modifies ROM
content. The repository also ignores every `.nes` file to reduce the risk of committing one by
accident.

## Cataloging a supplied corpus

The cataloger recursively inspects only the directory named on the command line. Its default mode is
read-only and prints aggregate counts:

```bash
yarn catalog:roms -- /absolute/path/to/rom-directory
```

Use `--apply` only after reviewing that summary. The tool then moves, but never deletes or modifies,
ROM images into `classified/loadable`, `classified/unsupported`, `review`, `quarantine` and
`duplicates`. It writes a local `_catalog/roms.json` with whole-file and parsed-payload SHA-256 values
and `_catalog/mapper-coverage.csv` with aggregate coverage:

```bash
yarn catalog:roms -- /absolute/path/to/rom-directory --apply
```

`review/dirty-header` and `review/trailing-data` are deliberately not normalized. Repairing an old
header or stripping an appended payload would create a different ROM identity and requires explicit
provenance outside this workflow.

The current profiles cover four files used during development:

| Profile  | Expected file | SHA-256                                                            | Mapper |
| -------- | ------------- | ------------------------------------------------------------------ | ------ |
| `mario`  | `MARIO.NES`   | `e9d2cc78600d4b765eca41b87eaa2b8f593d5bad5d71d2f3d6b43c5092e5705b` | 0      |
| `contra` | `CONTRA.NES`  | `26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519` | 2      |
| `kage`   | `KAGE.NES`    | `72fce2a76b602d96268a4800e2b981f8d44c761fb7bf2d83f1dd486d17dc075f` | 3      |
| `smb3`   | `SMB3-J.NES`  | `2dbff658378216b3d4e59fdb38926d0bddabd9e78d75e8819e3824d5554daed8` | 4      |

Run one profile with an explicit file:

```bash
yarn smoke:real-rom -- mario /absolute/path/to/MARIO.NES
yarn smoke:real-rom -- contra /absolute/path/to/CONTRA.NES
yarn smoke:real-rom -- kage /absolute/path/to/KAGE.NES
yarn smoke:real-rom -- smb3 /absolute/path/to/SMB3-J.NES
```

Or run every profile against a directory containing the expected filenames:

```bash
yarn smoke:real-rom -- all /absolute/path/to/roms
```

Each profile verifies:

- exact ROM SHA-256 plus format, mapper, region and ROM/CHR geometry;
- a pinned no-input visual sequence;
- a deterministic Start/A/B/directional input timeline with visual, audio and CPU-cycle checks;
- several intermediate frame hashes so a failure can be localized;
- a Save State checkpoint followed by two identical 120-frame visual/audio replays.

These commands are intentionally not part of CI because the ROM files cannot be distributed with the
repository. Updating a pinned result requires deliberate review of the affected frame or audio
behavior; a new hash must not be accepted solely to make the runner green.

## Result interpretation

The runner exits non-zero for a missing file, identity mismatch or any failed checkpoint. Its JSON
output includes the resolved cartridge metadata and separate baseline, interactive and replay
results. A passing result proves only the recorded deterministic scenario on that exact image; it is
not a general compatibility claim for all Mapper 0, 2, 3 or 4 software.

If a profile diverges:

1. Confirm the ROM SHA-256 before investigating emulation.
2. Find the first failed checkpoint rather than comparing only the final frame.
3. Compare frame, audio and CPU-cycle failures to identify the likely subsystem.
4. Add a focused hardware regression before changing a profile.
5. Re-run all available profiles when clock, PPU, APU, DMA or save-state ordering changed.

The runner reads the ROM and emits diagnostics only. It does not write to the image, search sibling
directories or persist battery data.
