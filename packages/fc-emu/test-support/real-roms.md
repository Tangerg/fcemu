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

The current profiles cover twenty-nine files used during development:

| Profile          | Expected file                                | SHA-256                                                            | Mapper |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------ |
| `mario`          | `MARIO.NES`                                  | `e9d2cc78600d4b765eca41b87eaa2b8f593d5bad5d71d2f3d6b43c5092e5705b` | 0      |
| `contra`         | `CONTRA.NES`                                 | `26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519` | 2      |
| `kage`           | `KAGE.NES`                                   | `72fce2a76b602d96268a4800e2b981f8d44c761fb7bf2d83f1dd486d17dc075f` | 3      |
| `smb3`           | `SMB3-J.NES`                                 | `2dbff658378216b3d4e59fdb38926d0bddabd9e78d75e8819e3824d5554daed8` | 4      |
| `punchout`       | `PUNCHOUT-J.NES`                             | `137a2f258d13367238f352d6471f0f62682dadfa4764e848b5bc96145fe789c0` | 9      |
| `dbz5`           | `dbz5cn.nes`                                 | `4e8d261a023aa4bd6a4c43a88200f63bd2a0ae9437a5216e016ba4d6713d9cc8` | 12     |
| `sangofighter`   | `Sango Fighter (UNL).nes`                    | `3408e070642368fef1eb76ee7f4526ad1310da7b8760230110624bb1f3084414` | 112    |
| `lionking`       | `TheLionKing.nes`                            | `363580d8f91fc8ce3cf27edaf7a1064e2c39c42b928c82207c1807cc61ce4a69` | 114    |
| `yuuyuu`         | `youyou_c.nes`                               | `dd2a2a1123ac405bbb975ee1c1f8845e85fcd4c6f993ee7afc895b2022a5190c` | 115    |
| `sango4`         | `sango4.nes`                                 | `dee4d95f36a621b85cfba3e7ecba7a83cda3814bb0d96f76b6502f616f21c25f` | 117    |
| `prosporthockey` | `Pro Sport Hockey (U).nes`                   | `a03cbb96ce879e81c04bde420d189329daad39b990d06f9dea284d2db4bd5254` | 118    |
| `pinbot`         | `Pinbot (U).nes`                             | `549575dae837426ba964c74f09fd11ee49fdaf82ae2669c157de5612bf76ff70` | 119    |
| `jovialrace`     | `Jovial Race (Clamshell).nes`                | `953d51cffae411ce92147de6e054236788b42abccf7d8060205014c38a0cb0fd` | 133    |
| `kaisersmb2`     | `Super Mario Bros 2 (J) (Kaiser Pirate).nes` | `f715e217f2b221d94c36744136f177442e6ccba0b3c7f15d7e3ad44f96975d75` | 142    |
| `chinesepaladin` | `pal_I.nes`                                  | `2df705fdcb03fe257cb66dc30a5f6cd41e9d242e97f3dc78ebc32d375f1f65ca` | 163    |
| `digimoncrystal` | `数码暴龙水晶版.nes`                         | `0dedaf18953a6161099ccbcd8b38ba9216457ead2f344ecbcc74b5570dc7549c` | 164    |
| `pocahontas`     | `Pocahontas.nes`                             | `c41984e57d492149e6778b29b8cdc1bc733eda8fc8c1891d782384e019b46ede` | 182    |
| `wingofmadoola`  | `Wing of Madoola, The ((J).nes`              | `d5b56d62c48ded34524db1a556086606bd9f816433eed1539e70501e8db64833` | 184    |
| `kof96`          | `kof96.nes`                                  | `0498c552f672488399ea8f741dc862ae8188367d8486fbf52214255eaf53bd1d` | 187    |
| `sfzero2`        | `sfzero2.nes`                                | `fdac6687b8ead6bad47d39c978565377da1aa12e383a0de6a49f846a62631156` | 187    |
| `thunderwarrior` | `ThunderWarrior.nes`                         | `6eba6a209e0d60c63d73e2e02b858b9580fd40e719775ffe43ae940a61ba57a2` | 189    |
| `super42`        | `Super_42-in-1.nes`                          | `927d2738e57ca5a6bd54c6eb1c2223c0332a9018249272779bcea968d5f4aabb` | 226    |
| `genke`          | `Gen Ke Le Zhuan (C).nes`                    | `3ea31a72b1f3ea26dfca4ed3b8642e51db81d551be384056da31c6d16ab8b966` | 240    |
| `waixin`         | `Wai Xin Zhan Shi.nes`                       | `efa36c857d4c46d522570437f18dbdb8c0f9675bd0d9dc9b6b1e63e566a87490` | 242    |
| `decathlon`      | `Cecathlon (C).nes`                          | `b51a894b0e478bc16f88fb1940dad05109ad1f23897b778506349dda26adae24` | 244    |
| `dragonquest7`   | `勇者斗恶龙7(中文).nes`                      | `7075d99f763e8512c0d55f4e0d2761ffb035ba887be04e124579345e91ba346d` | 245    |
| `fengshenbang`   | `封神榜.nes`                                 | `f3596ffda5c1b83821e58d15827a3a2fbc94c85352b7a5b834c1039e70509a25` | 246    |
| `baoqingtian`    | `Bao Qing Tian (C).nes`                      | `4a4f0fa02305ea403464ec8f3a009aa567e191d6069e2d1edd568d5bdff005f7` | 248    |
| `timediver`      | `Time Diver Avenger (C).nes`                 | `36bec12c4caccc958a70634e56eb18f6ec1e92c5e6d1a88afcfd1cd52050b54e` | 250    |

Run one profile with an explicit file:

```bash
yarn smoke:real-rom -- mario /absolute/path/to/MARIO.NES
yarn smoke:real-rom -- contra /absolute/path/to/CONTRA.NES
yarn smoke:real-rom -- kage /absolute/path/to/KAGE.NES
yarn smoke:real-rom -- smb3 /absolute/path/to/SMB3-J.NES
yarn smoke:real-rom -- punchout /absolute/path/to/PUNCHOUT-J.NES
yarn smoke:real-rom -- dbz5 /absolute/path/to/dbz5cn.nes
yarn smoke:real-rom -- sangofighter "/absolute/path/to/Sango Fighter (UNL).nes"
yarn smoke:real-rom -- lionking /absolute/path/to/TheLionKing.nes
yarn smoke:real-rom -- yuuyuu /absolute/path/to/youyou_c.nes
yarn smoke:real-rom -- sango4 /absolute/path/to/sango4.nes
yarn smoke:real-rom -- prosporthockey "/absolute/path/to/Pro Sport Hockey (U).nes"
yarn smoke:real-rom -- pinbot "/absolute/path/to/Pinbot (U).nes"
yarn smoke:real-rom -- jovialrace "/absolute/path/to/Jovial Race (Clamshell).nes"
yarn smoke:real-rom -- kaisersmb2 "/absolute/path/to/Super Mario Bros 2 (J) (Kaiser Pirate).nes"
yarn smoke:real-rom -- chinesepaladin /absolute/path/to/pal_I.nes
yarn smoke:real-rom -- digimoncrystal /absolute/path/to/数码暴龙水晶版.nes
yarn smoke:real-rom -- pocahontas /absolute/path/to/Pocahontas.nes
yarn smoke:real-rom -- wingofmadoola "/absolute/path/to/Wing of Madoola, The ((J).nes"
yarn smoke:real-rom -- kof96 /absolute/path/to/kof96.nes
yarn smoke:real-rom -- sfzero2 /absolute/path/to/sfzero2.nes
yarn smoke:real-rom -- thunderwarrior /absolute/path/to/ThunderWarrior.nes
yarn smoke:real-rom -- super42 /absolute/path/to/Super_42-in-1.nes
yarn smoke:real-rom -- genke "/absolute/path/to/Gen Ke Le Zhuan (C).nes"
yarn smoke:real-rom -- waixin "/absolute/path/to/Wai Xin Zhan Shi.nes"
yarn smoke:real-rom -- decathlon "/absolute/path/to/Cecathlon (C).nes"
yarn smoke:real-rom -- dragonquest7 "/absolute/path/to/勇者斗恶龙7(中文).nes"
yarn smoke:real-rom -- fengshenbang "/absolute/path/to/封神榜.nes"
yarn smoke:real-rom -- baoqingtian "/absolute/path/to/Bao Qing Tian (C).nes"
yarn smoke:real-rom -- timediver "/absolute/path/to/Time Diver Avenger (C).nes"
```

Or run every profile against a directory containing the expected filenames:

```bash
yarn smoke:real-rom -- all /absolute/path/to/roms
```

Each profile verifies:

- exact ROM SHA-256 plus format, mapper, region and ROM/CHR geometry;
- a pinned no-input visual sequence;
- a deterministic Select/Start/A/B/directional input timeline with visual, audio and CPU-cycle
  checks;
- several intermediate frame hashes so a failure can be localized;
- a Save State checkpoint followed by two identical 100–120-frame visual/audio replays.

Profile data lives in
[`scripts/real-rom-profiles.mjs`](../scripts/real-rom-profiles.mjs), separate from runner execution
logic. Before reading a ROM, the runner rejects invalid IDs, path-bearing or duplicate filenames,
malformed SHA-256 values, missing, unknown, mistyped or out-of-range cartridge metadata, unsorted or
unknown input events, checkpoint gaps and replay segments that leave the pinned interactive
timeline. The validator has focused regressions in
[`scripts/real-rom-profiles.test.mjs`](../scripts/real-rom-profiles.test.mjs).

These commands are intentionally not part of CI because the ROM files cannot be distributed with the
repository. Updating a pinned result requires deliberate review of the affected frame or audio
behavior; a new hash must not be accepted solely to make the runner green.

## Result interpretation

The runner exits non-zero for a missing file, identity mismatch or any failed checkpoint. Its JSON
output includes the resolved cartridge metadata and separate baseline, interactive and replay
results. A passing result proves only the recorded deterministic scenario on that exact image; it is
not a general compatibility claim for all Mapper 0, 2, 3, 4, 9, 12, 112, 114, 115, 117, 118, 119,
133, 142, 163, 164, 182, 184, 187, 189, 226, 240, 242, 244, 245, 246, 248 or 250
software. In particular, the Mapper 12 profile exercises the SL-5020B board but not the distinct FFE 4M
submapper-1 board.

If a profile diverges:

1. Confirm the ROM SHA-256 before investigating emulation.
2. Find the first failed checkpoint rather than comparing only the final frame.
3. Compare frame, audio and CPU-cycle failures to identify the likely subsystem.
4. Add a focused hardware regression before changing a profile.
5. Re-run all available profiles when clock, PPU, APU, DMA or save-state ordering changed.

The runner reads the ROM and emits diagnostics only. It does not write to the image, search sibling
directories or persist battery data.
