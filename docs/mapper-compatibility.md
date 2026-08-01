# Mapper compatibility

Mapper support is tracked by board behavior and evidence, rather than by a claim that a title list is
complete. The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is useful
for discovering compatibility targets; its own introduction warns that the catalog is incomplete
and that mirroring values may be unreliable.

`Implemented` means the board contract, geometry and focused tests exist. `Verified` additionally
requires executable external or pinned real-ROM evidence. Both statuses are loadable; the distinction
describes evidence maturity rather than a runtime feature flag.

| Mapper | Board family   | Status      | Current evidence                                                   |
| ------ | -------------- | ----------- | ------------------------------------------------------------------ |
| 0      | NROM           | Verified    | Unit tests; pinned `MARIO.NES` real-ROM runner                     |
| 1      | MMC1/SxROM     | Verified    | Board tests; Holy Mapperel SK/SG/SN/SU/SX 5/5                      |
| 2      | UxROM/UNROM    | Verified    | Unit tests; pinned `CONTRA.NES` real-ROM runner                    |
| 3      | CNROM          | Verified    | Tests; pinned _The Legend of Kage_ real-ROM runner                 |
| 4      | MMC3           | Verified    | A12/IRQ tests; pinned _Super Mario Bros. 3_ real-ROM runner        |
| 5      | MMC5/ExROM     | Verified    | Tests; pinned _Uchuu Keibitai SDF_ ELROM real-ROM runner           |
| 6      | Magic Card     | Implemented | RAM banking/write/IRQ/trainer/state tests; no fixture              |
| 7      | AxROM          | Implemented | Banking/mirroring/conflict tests; BNTest fixture unpinned          |
| 8      | Magic Card m4  | Implemented | Mapper-6 mode-4 alias/protection/geometry tests; no fixture        |
| 9      | MMC2/PxROM     | Verified    | Latch tests; pinned _Punch-Out!!_ real-ROM runner                  |
| 10     | MMC4/FxROM     | Verified    | Tests; pinned _Fire Emblem_ FKROM real-ROM runner                  |
| 11     | Color Dreams   | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM                |
| 12     | Rex/FFE 4M     | Verified    | MMC3A/card tests; pinned SL-5020B _DBZ5_ real-ROM runner           |
| 13     | CPROM          | Implemented | CHR-RAM banking/conflict unit tests; no conformance ROM            |
| 15     | K-1029/K-1030P | Implemented | Four PRG modes/CHR protection/reset/state tests; no fixture        |
| 16     | Bandai FCG     | Implemented | ASIC-decode/IRQ/24C02/persistence/state tests; no fixture          |
| 17     | Super Magic    | Implemented | PRG/CHR/WRAM/IRQ/trainer/MMC4/state tests; no fixture              |
| 18     | Jaleco SS8806  | Implemented | Nibble banking/RAM/mirroring/cycle-IRQ tests; no fixture           |
| 19     | Namco 129/163  | Implemented | CIRAM/WRAM/IRQ/shared-RAM/audio/state tests; no fixture            |
| 21     | Konami VRC4    | Implemented | VRC4a/c pins/banking/RAM/mirroring/IRQ tests; no fixture           |
| 22     | Konami VRC2a   | Implemented | Swapped pins/shifted-CHR/VRC2 capability tests; no fixture         |
| 23     | VRC2b/VRC4e/f  | Implemented | Exact/dual pin routes/latch/RAM/IRQ/state tests; no fixture        |
| 24     | Konami VRC6a   | Implemented | Full PPU modes/IRQ/pulse/saw/mixer/state tests; no fixture         |
| 25     | VRC2c/VRC4b/d  | Implemented | Exact/dual pin routes/banking/IRQ/state tests; no fixture          |
| 26     | Konami VRC6b   | Implemented | Swapped A0/A1/banking/IRQ/audio/state tests; no fixture            |
| 32     | Irem G-101     | Implemented | PRG modes/CHR/submapper/geometry tests; no conformance ROM         |
| 33     | Taito TC0190   | Implemented | PRG/CHR/mirroring/register-mask tests; no conformance ROM          |
| 34     | BNROM/NINA-001 | Verified    | Board tests; Holy Mapperel BNROM result `0000`                     |
| 41     | Caltron 6-in-1 | Implemented | Address/data/conflict/reset/state tests; local no-bank replay      |
| 48     | Taito TC0690   | Implemented | Banking/A12/IRQ-revision/delay tests; no conformance ROM           |
| 64     | Tengen RAMBO-1 | Implemented | PRG/CHR modes/dual-clock IRQ/state tests; no conformance ROM       |
| 65     | Irem H3001     | Implemented | PRG-mode/CHR/RAM/mirroring/cycle-IRQ tests; no conformance ROM     |
| 66     | GxROM/MHROM    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM                |
| 67     | Sunsoft-3      | Implemented | PRG/CHR/mirroring/write-toggle/one-shot-IRQ tests; no fixture      |
| 68     | Sunsoft-4      | Implemented | PRG/CHR/RAM/ROM-nametable tests; no conformance ROM                |
| 69     | Sunsoft FME-7  | Implemented | Banking/mirroring/IRQ unit tests; no 5B audio                      |
| 70     | Bandai 74xx    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM                |
| 71     | Codemasters    | Implemented | PRG/mirroring unit tests; no conformance ROM                       |
| 72     | Jaleco JF-17   | Implemented | Dual-edge/conflict/banking/state tests; one local replay smoke     |
| 73     | Konami VRC3    | Implemented | Banking/RAM/16-bit and 8-bit IRQ tests; three local replay smokes  |
| 74     | Waixing Type A | Implemented | Mixed-CHR/MMC3/IRQ/state tests; two local replay smokes            |
| 75     | Konami VRC1    | Implemented | PRG/CHR/mirroring/four-screen tests; no conformance ROM            |
| 76     | Namco 3446     | Implemented | Four 2 KiB CHR-window/geometry tests; no conformance ROM           |
| 77     | Irem LROG017   | Implemented | Mixed-CHR/nametable/open-bus/state tests; one local replay smoke   |
| 78     | Irem 74HC161   | Implemented | Both mirroring wirings/conflict tests; no conformance ROM          |
| 79     | NINA-03/06     | Implemented | Expansion decode/PRG/CHR/geometry tests; no conformance ROM        |
| 80     | Taito X1-005   | Implemented | PRG/CHR/mirrored-register/internal-RAM tests; no fixture           |
| 82     | Taito X1-017   | Implemented | Banking/RAM/pull-down/cycle-IRQ tests; no conformance ROM          |
| 83     | Cony/Yoko ASIC | Implemented | Four PCBs/PRG/CHR/NVRAM/dual-source-IRQ/state tests; no fixture    |
| 85     | Konami VRC7    | Implemented | Three PCBs/banking/IRQ/FM/reset/state tests; no conformance ROM    |
| 86     | Jaleco JF-13   | Implemented | Banking/mirror/state tests; µPD7756C and canonical fixture pending |
| 87     | Jaleco J87     | Verified    | CHR-bit-swap tests; pinned _The Goonies_ real-ROM runner           |
| 88     | Namco 3433     | Implemented | Split-64 KiB CHR wiring tests; no conformance ROM                  |
| 89     | Sunsoft-2      | Implemented | PRG/CHR/conflict/mirroring tests; no conformance ROM               |
| 90     | J.Y. EL861226C | Implemented | PRG/CHR/multiplier/latch/four-source-IRQ/state tests; no fixture   |
| 91     | JY/EJ bootleg  | Implemented | Outer-bank/A12/M2/submapper/state tests; no conformance ROM        |
| 92     | Jaleco JF-19   | Implemented | Dual-edge/window/state tests; canonical payload local replay       |
| 93     | Sunsoft-3R     | Implemented | PRG/CHR-enable/open-bus/conflict tests; no conformance ROM         |
| 94     | UN1ROM         | Implemented | Shifted banking/conflict/geometry tests; no conformance ROM        |
| 95     | Namco 3425     | Implemented | CHR/CIRAM-coupling/geometry tests; no conformance ROM              |
| 96     | Oeka Kids      | Implemented | Address-edge/CHR-RAM/conflict/state tests; two local replay smokes |
| 97     | Irem TAM-S1    | Verified    | Board tests; pinned _Kaiketsu Yanchamaru_ real-ROM runner          |
| 99     | VS mainboard   | Verified    | Board tests; pinned _Vs. Soccer_ cabinet/gameplay real-ROM runner  |
| 112    | NTDEC/Asder    | Verified    | Banking/state tests; pinned _Sango Fighter_ real-ROM runner        |
| 113    | HES NTD-8      | Implemented | Board/geometry/state tests; local single-game misheaders rejected  |
| 114    | SuperGame MMC3 | Verified    | Scramble/MMC3A tests; pinned _The Lion King_ real-ROM runner       |
| 115    | Kasheng MMC3   | Verified    | Outer banks/MMC3C tests; pinned _Yuu Yuu Hakusho Final_ runner     |
| 117    | Future Media   | Verified    | Bank/IRQ tests; pinned _San Guo Zhi IV_ real-ROM runner            |
| 118    | TxSROM         | Verified    | CIRAM/IRQ tests; pinned _Pro Sport Hockey_ real-ROM runner         |
| 119    | TQROM          | Verified    | Mixed-CHR/IRQ tests; pinned _Pinbot_ real-ROM runner               |
| 133    | Sachen SA72008 | Verified    | Board tests; pinned _Jovial Race_ real-ROM runner                  |
| 140    | Jaleco JF      | Implemented | PRG/CHR/register/open-bus/geometry tests; no conformance ROM       |
| 142    | Kaiser KS7032  | Verified    | KS202/IRQ tests; pinned Kaiser _Super Mario Bros. 2_ runner        |
| 150    | Sachen SA-015  | Implemented | ASIC/pin-routing/solder-pad/nametable/state tests; no fixture      |
| 152    | Bandai 74xx    | Implemented | PRG/CHR/mirroring unit tests; no conformance ROM                   |
| 163    | Nanjing FC-001 | Verified    | FC-001 register/CHR/state tests; pinned _Chinese Paladin_ runner   |
| 164    | Dongda PEC9588 | Verified    | PRG/1bpp/93C66 tests; pinned _Digimon Crystal_ real-ROM runner     |
| 180    | Inverted UxROM | Implemented | Fixed-first/banking/conflict tests; no conformance ROM             |
| 182    | SuperGame MMC3 | Verified    | Duplicate-ID tests; pinned _Pocahontas_ real-ROM runner            |
| 184    | Sunsoft-1      | Verified    | Board tests; pinned _The Wing of Madoola_ real-ROM runner          |
| 185    | CNROM protect  | Implemented | NES 2.0 variants/open-bus/conflict tests; no conformance ROM       |
| 187    | UNL SF3/KOF96  | Verified    | Board tests; pinned _KOF '96_ and _SF Zero 2 '97_ runners          |
| 189    | TXC MMC3       | Verified    | Outer-PRG/MMC3/IRQ tests; pinned _Thunder Warrior_ real-ROM runner |
| 206    | Namco 118      | Implemented | PRG/CHR bank unit tests; no conformance ROM                        |
| 225    | ET-4310/K-1010 | Implemented | Dual geometry/PRG/CHR/nibble-RAM/reset tests; no fixture           |
| 226    | BMC 42/63/76-1 | Verified    | Three-geometry tests; pinned _Super 42-in-1_ real-ROM runner       |
| 227    | 810449/FW-01   | Implemented | Three variants/WRAM/protection/open-bus/state tests; no fixture    |
| 228    | Active Ent.    | Implemented | Non-contiguous PRG/open-bus/CHR/reset tests; no fixture            |
| 240    | C&E/Supertone  | Verified    | Expansion-latch tests; pinned _Jing Ke Xin Zhuan_ real-ROM runner  |
| 241    | BxROM + WRAM   | Implemented | PRG/WRAM/CHR/state tests; two local replays; LPC audio pending     |
| 242    | Waixing 43272  | Verified    | Latch/mode tests; pinned _Wai Xin Zhan Shi_ real-ROM runner        |
| 243    | Sachen SA-020A | Implemented | Wrong-header Poker III rejected; canonical fixture pending         |
| 244    | C&E Decathlon  | Verified    | Permutation tests; pinned _Decathlon_ real-ROM runner              |
| 245    | Waixing F003   | Verified    | Pin-routing tests; pinned _Dragon Quest VII_ real-ROM runner       |
| 246    | C&E Fong Shen  | Verified    | Bank/alias tests; pinned _Feng Shen Bang_ real-ROM runner          |
| 248    | Kasheng MMC3   | Verified    | Shared-board tests; pinned _Bao Qing Tian_ real-ROM runner         |
| 250    | MMC3 addr/data | Verified    | Rewiring/IRQ tests; pinned _Time Diver_ real-ROM runner            |

The core accepts both iNES and a constrained NES 2.0 subset; see
[cartridge-formats.md](./cartridge-formats.md). Detailed per-board behavior lives in
[mappers/README.md](./mappers/README.md). Mapper
0/4/5/9/10/11/13/18/24/26/33/41/64/65/66/67/68/69/70/72/73/74/75/76/77/79/80/82/86/87/88/89/90/92/93/94/95/96/97/99/112/113/115/117/118/119/133/140/142/150/152/163/164/182/184/187/189/206/226/240/241/242/243/244/245/246/248/250 currently
accept only submapper 0. Mapper 1
accepts submapper 0, deprecated geometry-qualified
SUROM/SOROM/SXROM identifiers 1/2/4, and fixed-PRG SEROM/SHROM/SH1ROM submapper 5. Mapper 2/3/7/180
accept submapper 0 plus the NES 2.0 bus-conflict variants below. Mapper 34 accepts submapper 0
through a single-board CHR-geometry decision, submapper 1 as NINA-001 and submapper 2 as BNROM.
Mapper 71 accepts submapper 0 (fixed-mirroring BF9093) and submapper 1 (single-screen-controlled
BF9097). Mapper 78 accepts its historical iNES alternative-nametable convention or NES 2.0
submapper 1 (Cosmo Carrier) and 3 (Holy Diver); ambiguous NES 2.0 submapper 0 fails closed. Mapper 32
accepts submapper 0 (normal G-101) and submapper 1 (Major League fixed-upper one-screen wiring).
Mapper 185 accepts only explicit NES 2.0 submappers 4-7; legacy/submapper 0 has unknown chip-select
wiring and fails closed. Mapper 48 accepts submapper 0 for the original 22-cycle TC0690 IRQ delay
and the community/Mesen-compatible submapper 1 timing variant with a six-cycle delay and adjusted
counter bias.

Mapper 91 accepts submapper 0 for JY830623C/YY840238C outer banking and fixed 64-rise A12 IRQs,
and submapper 1 for EJ-006-1 selectable mirroring and its 5/4-rate M2 IRQ counter.

Mapper 83 accepts legacy iNES as the standard 83.0 board and NES 2.0 submappers 0-3 as the four
currently allocated Cony PCBs. Submapper 1 rewires CHR into four 2 KiB windows; submapper 2 adds
shared PRG/CHR outer lines and four battery-backed 8 KiB NVRAM banks; submapper 3 uses a 128 KiB
inner PRG region and separate CHR outer lines. Mapper 264's different register-address wiring is a
separate mapper and is not inferred from ROM size.

Mapper 85 accepts legacy/submapper 0 as the historical VRC7 compatibility wiring, where either A3
or A4 can select the second register in a pair. NES 2.0 submapper 1 is VRC7b with A3 routing and no
working oscillator/mixer; submapper 2 is VRC7a with A4 routing and six-channel FM audio. Other
submappers fail closed.

Mapper 16 accepts submapper 0 for legacy unspecified FCG/LZ93D50 images, submapper 4 for low-range
FCG-1/2 and submapper 5 for high-range LZ93D50 with no EEPROM or a 256-byte 24C02. Deprecated
submappers 1-3 are rejected in favor of their current mapper IDs 159, 157 and 153.

Mapper 6 accepts NES 2.0 submappers 0-7 as the exact initial Magic Card latch mode; legacy iNES
mapper 6 means mode 1. Mapper 8 is the mode-4 synonym and accepts only submapper 0. Mapper 17 accepts
submappers 0-3, which relocate an optional Super Magic Card trainer to `$7000`, `$5D00`, `$5E00` or
`$5F00`.

Mapper 12 legacy images and NES 2.0 submapper 0 select Rex Soft's SL-5020B MMC3A board. NES 2.0
submapper 1 instead identifies an FFE Super Magic Card 4M extraction with fixed `$7000` trainer
placement; other submappers fail closed.

Mappers 15/133/142/150/225/226/228/240/242/243/244/246/250 accept only submapper 0. Mapper 227 submapper 0 selects the RPG-compatible board
with optional battery WRAM and always-writable CHR RAM; submapper 1 selects multicart CHR protection
and solder-pad reads; submapper 2 selects multicart protection plus the inner-bank-zero outer-bank
rule. Legacy iNES mapper 227 follows submapper 0 rather than using title hashes.

Mappers 21/23/25 accept submapper 0 as the historical VRC4 compatibility superset with both
non-overlapping CPU-address pin routes. Their exact NES 2.0 variants are mapper 21 submappers 1/2
(VRC4a/c), mapper 23 submappers 1/2/3 (VRC4f/e and VRC2b), and mapper 25 submappers 1/2/3
(VRC4b/d and VRC2c). Mapper 22 submapper 0 is the single VRC2a wiring. Unallocated VRC2
submappers remain rejected rather than infer nonexistent boards.

Mappers 24/26 are the exact VRC6a/VRC6b PCBs and accept only submapper 0. Both require the physical
8 KiB PRG RAM/NVRAM window; mapper 26 swaps the ASIC's A0/A1 register inputs rather than carrying a
second register model.

Mapper 99 accepts only submapper 0. PRG is one to five physically ordered 8 KiB sockets, CHR is one
or two 8 KiB sockets, and shared RAM is exactly 2 KiB. OUT2 always selects the CHR socket but selects
the fifth `$8000-$9FFF` PRG socket only when a 40 KiB/five-socket image actually supplies it;
ordinary boards retain socket 0. Missing fixed PRG or selected CHR sockets tri-state the bus rather
than mirroring. NES 2.0 VS metadata selects the RGB PPU, controller routing and UniSystem protection
hardware. DualSystem types fail closed because they require a second synchronized CPU/PPU and
shared-RAM ownership arbitration.

The legacy _Vs. Soccer_ SC4-3 profile matches exact PRG/CHR CRCs `46914E3E`/`FEBB5370`, completing
its absent iNES metadata as `RP2C04-0003` and player-one gameplay on `$4017`. Its public-input
timeline inserts a cabinet coin, drives the separately wired Select-1 line, enters active play for
1,800 frames, and replays 120 saved frames with exact video, audio and CPU-cycle results. Unknown
legacy VS payloads are not inferred from titles or geometry.

Mapper 114 accepts legacy/submapper 0 for the Aladdin/Lion King/Hosenkan scrambling pattern and NES
2.0 submapper 1 for Boogerman's distinct address and index permutation. Mapper 182 is a duplicate
identity fixed to mapper 114.0. Both physical variants use MMC3A IRQ behavior and the same
`$6000/$6001` NROM override/outer-CHR registers; other variants fail closed.

Mappers 115 and 248 accept only submapper 0. They retain their external header identities while
resolving to the same Kasheng board contract: direct MMC3 register addresses, MMC3C IRQ behavior
and `$6000.D6` supplying PRG A18.

## Legacy-header assumptions

- Mapper 3 uses no conflicts for ambiguous legacy/submapper-0 images, preserving compatible boards
  and historical mapper-3 conversions. NES 2.0 submapper 1 makes no conflicts explicit; submapper 2
  selects original CNROM AND conflicts. The mapper entity still models that physical conflict path;
  only the header-to-board compatibility policy changed. The pinned _The Legend of Kage_ profile
  locks this distinction: forcing its legacy image through submapper-2 AND conflicts corrupts the
  title sequence, while the compatibility path completes 900 deterministic frames and save-state
  replay without embedding the commercial ROM.
- Mapper 2 retains the generic iNES full-byte/no-conflict convention. Original UNROM/UOROM conflict
  behavior is selected with NES 2.0 submapper 2 without breaking compatible legacy images.
- Mapper 7 follows the default iNES no-conflict behavior required by ANROM software. AMROM/AOROM
  conflict behavior is selected with NES 2.0 submapper 2; the common emulator 512 KiB bit-3
  extension is implemented and covered by focused tests. NES 2.0 PRG-RAM declarations are rejected
  because AxROM has no PRG-RAM window. Four-screen layouts are rejected because its latch drives
  one of the console's two CIRAM pages. Historical BNTest execution is not treated as current
  `Verified` evidence until its fixture identity and runner are pinned.
- NES 2.0 PRG-RAM declarations are also rejected for mappers
  9/11/13/32/33/41/64/66/70/71/75/76/78/79/86/87/88/89/91/93/94/95/97/114/115/117/119/133/140/142/150/152/180/182/184/185/187/206/244/248 because those
  selected boards do not decode a writable `$6000-$7FFF` window. Legacy iNES's implicit 8 KiB
  allocation remains a parser-compatibility detail but is not exposed by these mappers.
- Mapper 1 resolves standard, SUROM, SOROM, SXROM and SZROM wiring from memory geometry. Its CHR
  outputs select outer PRG ROM and 8 KiB PRG-RAM banks; mixed volatile/battery banks retain only the
  NVRAM bytes. SNROM additionally wires CHR A16 as a redundant WRAM disable, while submapper 5
  hardwires the two 16 KiB PRG halves. Its serial port observes adjacent CPU R/W cycles, ignores an
  RMW instruction's second D0 write and still accepts a second-cycle D7 reset. MMC1A/mapper 155 and
  2ME EEPROM remain explicit variants. Four-screen headers fail closed because the modeled SxROM
  boards expose MMC1-controlled one-screen/horizontal/vertical CIRAM wiring only.
- Mapper 3 mirrors an explicitly declared 2 KiB PRG RAM through `$6000-$7FFF`. Mapper 185 copy
  protection remains a separate board implementation, and Family Trainer speech hardware remains
  out of scope.
- Mapper 4 implements the MMC3 `$A001` PRG-RAM enable and write-protect bits. MMC6 remains excluded
  by its NES 2.0 submapper and different split protection scheme. The pinned _Super Mario Bros. 3_
  profile crosses the title demo, world map and World 1-1, then validates scrolling, audio, CPU
  cycles and a mid-level save-state replay through the public facade.
- Mapper 5 models MMC5/ExROM rather than an MMC3-shaped banking subset. Four PRG and CHR modes,
  A/B fetch-selected CHR register sets, dynamic CIRAM/ExRAM/fill nametables, extended attributes and
  vertical split all follow the ASIC's physical outputs. The PPU supplies background/sprite fetch
  ownership without exposing scanline internals to the board. Commercial 0/8/16/32 KiB PRG-RAM
  layouts are accepted; ETROM's bank values 0–3 select its battery chip and 4–7 its volatile chip.
  The write key remains the exact `$5102=2`, `$5103=1` pair. Scanline, MMC5A timer and PCM sources
  share one level-sensitive IRQ output, while the two pulse channels and PCM DAC enter the normal
  expansion-audio path. Unknown diagnostic pins and `$5207/$5208` behavior remain open bus instead
  of fabricated registers. The pinned HVC-ELROM-01 _Uchuu Keibitai SDF_ profile matches independent
  PRG/CHR CRCs `D979C8B7`/`8734D65D` and the board's physical zero-WRAM layout. Its 1,800-frame
  scenario produces 1,079 distinct frames while exercising both CHR register sets, ExRAM modes 0
  and 2, dynamic nametable routing, multiplication and both pulse channels; exact mapper checkpoints
  plus a 120-frame video/audio save-state replay lock that path. Focused tests, rather than this one
  title, remain the evidence for CHR high bits, vertical split, scanline/timer/PCM IRQ edges and
  unexercised RAM geometries.
- Mappers 6/8/12.1/17 follow their current NESdev disk-extraction definitions rather than the obsolete
  FFE ASIC approximations found in older emulator tables. The iNES PRG/CHR payload initializes
  mutable card RAM, and each board owns exactly 32 KiB of volatile work RAM with no battery-backed
  storage. Magic Card supports its latch modes, PRG write protection, mirroring and FDS-compatible
  periodic data IRQ. Super Magic Card adds four 8 KiB PRG windows, eight 1 KiB CHR windows, optional
  CHR-backed nametables/MMC4 latches, four work-RAM banks and a 16-bit M2/PPU-A12 IRQ. An optional
  trainer is a hardware loader entry: mapper 6 calls `$7003` and returns to the reset vector, while
  mapper 17 cold-starts directly at its submapper-selected address. This support executes extracted
  play-mode images; the external BIOS/FDC, parallel transfer interface, copier GUI and cartridge
  pass-through used to create those images are not modeled. Mapper 12.1 starts in protected 4M mode,
  stores the header CHR payload at PRG-card offset `$40000`, exposes only 32 KiB of live CHR RAM and
  calls a `$7003` trainer before returning to the reset vector.
- Mapper 34 never combines its unrelated register sets. Legacy CHR ROM above 8 KiB selects
  NINA-001; CHR RAM or at most 8 KiB CHR ROM selects BNROM. NINA-001 maps its `$7FFD-$7FFF`
  registers over 8 KiB PRG RAM. BNROM applies original-board AND bus conflicts; NES 2.0 submapper 2
  may also expose a directly declared 8 KiB Union Bond PRG-RAM window.
- Mapper 9 (MMC2) switches the `$8000-$9FFF` 8 KiB bank and fixes the final three 8 KiB banks. Its
  two CHR latches drive four 4 KiB banks; the left latch flips only on the exact `$0FD8`/`$0FE8`
  fetches while the right latch flips across `$1FD8-$1FDF` and `$1FE8-$1FEF`. `$F000` bit 0 selects
  vertical/horizontal mirroring. PxROM has no PRG-RAM window. The PPU reports full background and
  sprite fetch addresses, and the latch commits after the triggering byte is returned. The pinned
  _Punch-Out!!_ profile crosses the title, opponent card, ring intro and active Glass Joe match,
  then verifies visual/audio output, CPU cycles and an input-active save-state replay.
- Mapper 10 (MMC4) shares the MMC2 CHR latch banks but flips both latches across the full
  `$xFD8-$xFDF`/`$xFE8-$xFEF` ranges, switches a 16 KiB `$8000-$BFFF` bank with `$C000-$FFFF` fixed,
  and adds an 8 KiB PRG-RAM window at `$6000-$7FFF`. The pinned FKROM-01 _Fire Emblem: Ankoku Ryuu
  to Hikari no Tsurugi_ profile matches PRG CRC32 `2078DCE4` and CHR CRC32 `8118B30B`, runs 2,400
  input-driven frames with 359 distinct frames, and locks exact visual/audio/CPU-cycle output plus
  six MMC4 state checkpoints. Those checkpoints cross PRG and all four CHR register changes,
  mapper-controlled mirroring and the right pattern-table latch's FD-to-FE state transition; the
  full trigger ranges and 8 KiB NVRAM remain covered by focused bus tests. A 120-frame replay from
  frame 1,800 verifies that the input-active mapper and NVRAM state restore deterministically.
- Mapper 11 (Color Dreams) and mapper 66 (GxROM/MHROM) each latch one register with documented
  AND-type bus conflicts. Color Dreams takes PRG from bits 1-0 and CHR from bits 7-4; GxROM takes
  PRG from bits 5-4 and CHR from bits 1-0. The no-conflict Color Dreams prototype board is out of
  scope.
- Mapper 12.0 models Rex Soft/Gouder SL-5020B as an MMC3A-compatible Huang-1 plus a separate GAL.
  Writes matching `$E100=$4100` immediately put D0 on CHR A18 for PPU `$0000-$0FFF` and D4 on CHR
  A18 for `$1000-$1FFF`, independent of the MMC3 CHR-mode swap. Reads through the same aliases drive
  only hard-wired language bit D0; all known boards select Chinese. The MMC3 core retains its
  optional 8 KiB WRAM window and revision-A zero-latch IRQ behavior. The older FCEUX deferred-outer
  latch and reset-toggled language choice are compatibility inventions and are not hidden variants.
  The pinned 256 KiB PRG + 512 KiB CHR _Dragon Ball Z 5_ profile runs 1,200 frames with a deterministic
  input timeline, audio and CPU-cycle checks, then replays frames 961-1,080 identically from a save
  state. A separate register trace read `$4132` once and wrote `$02` there 1,400 times, so the profile
  validates the SL-5020B language/decode path but never drives the two connected outer-CHR bits;
  those remain unit-tested hardware evidence. The distinct FFE 4M submapper-1 board is still missing
  external verification.
- Mapper 13 (CPROM) fixes 32 KiB PRG and splits 16 KiB CHR RAM into a fixed `$0000-$0FFF` bank 0 and
  a bits 1-0 switchable `$1000-$1FFF` bank, with AND-type bus conflicts. Legacy iNES cannot declare
  the implied 16 KiB CHR RAM, so CPROM images require an NES 2.0 header.
- Mapper 15 models the actual K-1029/K-1030P board, not mapper-hacked images from 164/227. CPU write
  address bits 1-0 select NROM-256, UNROM, mirrored 8 KiB NROM-64 or mirrored 16 KiB NROM-128 PRG
  wiring; data bits select the 1 MiB PRG region and horizontal/vertical mirroring. Its 8 KiB CHR RAM
  is write-protected in modes 0/3 and writable in modes 1/2. The hardware has no `$6000` RAM, so the
  permissive PRG-RAM/CHR-write behavior required by old mapper hacks is deliberately absent.
- Mapper 16 represents the Bandai FCG family without merging its ASIC revisions. Submapper 4
  (FCG-1/2) decodes only `$6000-$7FFF` and writes its live 16-bit IRQ counter directly; submapper 5
  (LZ93D50) decodes only `$8000-$FFFF`, writes a reload latch and copies it on IRQ control. Legacy
  submapper 0 responds in both ranges and applies the corresponding semantics per write address.
  All variants expose one switchable/final-fixed 16 KiB PRG pair, eight 1 KiB CHR-ROM windows and
  four-way mirroring. LZ93D50 may connect a 256-byte 24C02 through register D; the serial protocol
  state belongs to the mapper while its bytes use Cartridge NVRAM and normal battery persistence.
- Mapper 18 (Jaleco SS8806) exposes three switchable and one fixed 8 KiB PRG windows plus eight
  1 KiB CHR-ROM windows. Because the ASIC sees only CPU A12-A14/A0-A1 and data D0-D3, every bank and
  16-bit IRQ reload value is assembled from mirrored nibble writes under the `$F003` address mask.
  `$9002` independently enables and write-enables an optional exact 8 KiB PRG-RAM/NVRAM window;
  `$F002` selects horizontal, vertical or either one-screen layout. Its continuously counting IRQ
  can inhibit borrow at 4, 8 or 12 bits while retaining the upper counter bits. The implementation
  follows the current NESdev borrow/underflow description; older Mesen/Nestopia sources instead
  assert on the preceding 1→0 transition, so the chosen boundary is explicit in focused tests.
  Legacy iNES cannot say that the optional RAM is absent and therefore keeps its conventional 8 KiB
  allocation; NES 2.0 can declare zero. Optional boards' external µPD7755/7756 sample-playback chip
  is not emulated.
- Mapper 19 models the Namco 129/163 ASIC rather than treating chip RAM as ordinary PRG RAM. Three
  switchable 8 KiB PRG banks precede a fixed tail; eight pattern and four nametable selectors can
  address 1 KiB CHR banks or route CIRAM per slot. Mixed CHR ROM/RAM uses `$00-$DF` for ROM and
  `$E0-$FF` for up to 32 KiB RAM when pattern-side CIRAM substitution is disabled. The four external
  2 KiB WRAM regions have exact `$F800` write-protection bits, while reads remain visible. The
  15-bit CPU-cycle IRQ saturates at `$7FFF`. Its shared 128-byte mapper RAM participates in power,
  battery and the current full-state policy; the data-port address saturates rather than wrapping.
  Audio services one of up to eight descending wavetable channels every 15 CPU cycles and retains
  the held multiplexed output instead of averaging channels. Submappers 1/2 mute audio, while
  3/4/5 select the documented board mix levels. Pin-44 diagnostic CHR data remains an explicit
  evidence gap because its output encoding is not published; raw control state is retained without
  invented behavior.
- Mappers 21/22/23/25 share one VRC2/VRC4 register and banking owner, but `Vrc24Board` keeps every
  PCB's two register-select address lines immutable. Submapper 0 for 21/23/25 ORs the two
  historically combined, non-overlapping address routes and deliberately behaves as the VRC4
  compatibility superset. Exact VRC2b/VRC2c variants do not gain VRC4's PRG swap mode, one-screen
  mirroring or IRQ device; VRC2b instead exposes only its physical D0 latch at `$6000-$6FFF` when
  no 8 KiB RAM is declared. VRC2a additionally ignores CHR-bank bit 0. VRC4 supports 9-bit CHR
  registers, gated 2 KiB-mirrored or 8 KiB PRG RAM, and its shared CPU/cycle-or-scanline IRQ core
  with the 341-dot prescaler. PRG is capped at 256 KiB; reachable CHR capacity is capped per ASIC
  and VRC2a wiring rather than silently modulo an unreachable declaration.
- Mappers 24/26 share one VRC6 ASIC model. Mapper 26 swaps only A0/A1 before canonical register
  decode. The core implements the 16+8+fixed PRG layout, gated 8 KiB WRAM, all `$B003` pattern and
  CIRAM/ROM-nametable arrangements, byte-wide shared VRC IRQ, two descending 16-step pulse channels,
  the fourteen-step saw accumulator and `$9003` halt/16×/256× scaling. The linear six-bit DAC is
  sampled through the mapper audio capability and added before the console RC filters; oscillator,
  divider, accumulator, IRQ and bank phase all participate in save state.
- Mapper 85 owns three 8 KiB PRG registers, a fixed final bank, eight byte-wide 1 KiB CHR
  registers, four CIRAM arrangements, an optional gated 8 KiB WRAM/NVRAM window and the shared VRC
  IRQ. Legacy images accept either A3/A4 register-select route; submapper 1 fixes VRC7b's A3 route
  and absent resonator/audio path, while submapper 2 fixes VRC7a's A4 route and FM output. The
  VRC7-only sound core models six two-operator channels, the recovered instrument ROM, custom
  patch, logarithmic envelope/phase generators, tremolo/vibrato, test register and 36-CPU-cycle
  native sample divider. `$E000` bit 6 clears and silences sound-register state while vibrato phase
  continues; complete operator feedback/envelope/phase state is serialized.
- Mapper 86 models Jaleco's JF-13 discrete banking circuit with its exact 128 KiB PRG and 64 KiB
  CHR layout. `$6000-$6FFF` selects one 32 KiB PRG bank from D5-D4 and one 8 KiB CHR bank from
  D6/D1-D0; the board's incomplete `/ROMSEL` decode mirrors this latch at `$E000-$EFFF` without bus
  conflicts. `$7000-$7FFF` and its `$F000-$FFFF` mirror control the external µPD7756C speech chip.
  The core does not synthesize that voice path because its recorded sample data is not present in
  the `.nes` payload. A local _Urusei Yatsura: Lum no Wedding Bell_ image is not JF-13 evidence: it
  declares mapper 86 with an impossible 32/32 KiB geometry, while that title belongs to JF-10/J87.
  The factory rejects it instead of adding a title or hash exception. A separate local _Moero!! Pro
  Yakyuu_ container carries the known Rev 1.3 payload but also 524,304 trailing padding bytes, so it
  remains review-only despite a coherent 1,500-frame smoke and deterministic save-state replay.
- Mapper 32 (Irem G-101) exposes two switchable 8 KiB PRG banks, two fixed tail banks and eight
  1 KiB CHR-ROM banks. Register bit 1 swaps the first switchable and second-to-last fixed PRG
  windows; bit 0 selects horizontal/vertical mirroring. NES 2.0 submapper 1 instead identifies Major
  League's fixed-upper one-screen board and disabled `$9000` register; legacy iNES cannot
  distinguish that wiring without a title database.
- Mapper 33 (Taito TC0190) has two switchable 8 KiB PRG banks followed by the final two fixed banks,
  two 2 KiB and four 1 KiB CHR-ROM windows, and bit-6 horizontal/vertical mirroring. Its 2 KiB CHR
  register values are offsets in 2 KiB units rather than MMC3-style even 1 KiB indexes. Four-screen
  headers are rejected because the modeled board only drives the two-screen CIRAM layout. Mapper
  48 dumps mislabeled as 33 remain out of scope because mapper 33 has no IRQ.
- Mapper 41 models the Caltron 6-in-1 board as two distinct latches. Writes to `$6000-$67FF`
  capture CPU address bits rather than data: A0-A2 choose a 32 KiB PRG bank, A3-A4 choose the outer
  CHR block and A5 selects vertical/horizontal mirroring. Writes in `$8000-$FFFF` update the inner
  two CHR bits only while outer bit 2 is set and are AND-masked by the selected PRG byte to model
  the board's partial bus conflicts. Both latches clear on power-on and warm reset; `$6000-$7FFF`
  remains open bus because the board has no PRG RAM. The factory accepts the fully populated
  256 KiB PRG/128 KiB CHR board and smaller power-of-two ROMs whose absent high address lines
  naturally mirror, while rejecting unaddressable capacities and invented writable memory.
  Current NESdev, Mesen CE, MAME and puNES behavior agree on A5 mirroring, a data-driven inner latch
  and reset clearing. Older FCEUX address-derived inner selection and Nestopia A4/hard-reset-only
  behavior are conflicting approximations, not combined board variants. A local 32 KiB + 32 KiB
  _Aladdin 3_ image completes a deterministic replay but never writes either latch, so it is only a
  reduced-geometry compatibility smoke and not Caltron banking verification.
- Mapper 48 (Taito TC0690) reuses TC0190's PRG/CHR banking circuit but moves mirroring to `$E000`
  and adds an MMC3-shaped filtered-A12 IRQ counter with inverted reload values. IRQ assertion is
  delayed after the counter event: submapper 0 uses the empirically compatible 22 CPU cycles, while
  submapper 1 uses the later six-cycle timing and one-count reload bias. The two ASICs share one
  banking component rather than duplicate their bank geometry.
- Mapper 64 (Tengen 800032/RAMBO-1) owns three switchable 8 KiB PRG windows plus a fixed final bank
  and three CHR layouts: two 2 KiB plus four 1 KiB banks, eight independent 1 KiB banks, and either
  layout with the pattern-table halves exchanged. R6/R7/RF and R0-R9 follow the full four-bit bank
  selector; the K, P and C control bits are preserved independently. Its IRQ counter selects either
  filtered PPU-A12 rises or one clock per four CPU M2 cycles, keeps the documented reload bias and
  delayed output, and completes an in-flight CPU prescaler period when changing modes. The board
  switches horizontal/vertical mirroring and exposes no PRG RAM.
- Mapper 65 (Irem H3001) exposes only two writable PRG registers; `$9000` swaps the first register
  between `$8000` and `$C000`, opposite a fixed second-to-last bank. `$B000-$B007` select eight
  1 KiB CHR banks, `$9001` selects vertical/horizontal/lower-one-screen nametables, and an optional
  directly declared 8 KiB PRG-RAM window occupies `$6000-$7FFF`. Its 16-bit one-shot IRQ counter
  decrements each CPU cycle and stops when it asserts at zero. The obsolete emulated `$C000` PRG
  register is intentionally absent because hardware pinout testing found no such register.
- Mapper 71 (Codemasters/Camerica) switches a 16 KiB `$8000-$BFFF` bank from `$C000-$FFFF` with the
  last bank fixed and no bus conflicts. The BF9097 variant (submapper 1) adds `$9000-$9FFF` bit 4
  single-screen mirroring and rejects four-screen layouts; submapper 0 keeps the header's fixed
  mirroring and may retain external four-screen memory.
- Mappers 72/92 (Jaleco JF-17/JF-19) apply ROM bus conflicts before treating D7 and D6 as
  independent rising-edge clocks for their 16 KiB PRG and 8 KiB CHR latches. JF-17 switches the
  lower PRG window with three data bits and fixes the final bank above it; JF-19 fixes bank 0 below
  a four-bit switchable upper window. Clock history is save-state data; both use exactly 128 KiB
  CHR ROM, while PRG is respectively 128/256 KiB, with no PRG RAM and solder-pad mirroring. The
  user-local _Pinball Quest_ image completed 240 frames with deterministic 60-frame replay. A
  _Moero!! Pro Yakyuu '88 Ketteihen_ payload whose CRC matches NESCartDB completed 1,500 frames and
  deterministic 300-frame replay, but its padded container is not a pinnable fixture. Optional
  µPD7756C sample audio remains unsupported because normal iNES images omit its sample ROM.
- Mapper 73 (Konami VRC3) keeps fixed CHR RAM and solder-pad mirroring around one switchable and one
  fixed 16 KiB PRG window, with optional direct 8 KiB PRG RAM. Its four nibble registers feed a
  16-bit CPU-cycle up-counter; 8-bit mode preserves the counter's upper byte, and the distinct
  control/acknowledge path copies A to E exactly as hardware documents. Three user-local images
  completed 240-frame runs with deterministic 60-frame save-state replay. Their bytes and hashes
  remain outside the repository, so this is `Implemented` evidence rather than `Verified`.
- Mapper 74 (Waixing Type A) keeps standard MMC3 PRG banking, mirroring, direct PRG-RAM protection
  and filtered A12 IRQ, but exact 1 KiB CHR bank values `$08/$09` redirect to the two halves of 2 KiB
  volatile CHR RAM. All other values remain CHR ROM; there is no threshold, masked alias or generic
  writable-ROM fallback. Two local exact-geometry images select both RAM pages, modify them, advance
  through hundreds of frames and reproduce deterministic save-state replays. Their copyrighted
  bytes and checksums remain outside the repository, so status stays `Implemented`.
- Mapper 75 (Konami VRC1) exposes three switchable 8 KiB PRG banks followed by the fixed final bank,
  plus two 4 KiB CHR banks whose fifth select bits share the horizontal/vertical mirroring register.
  Four-screen cartridges ignore that mirroring output; the ASIC has no IRQ, PRG RAM or bus
  conflicts.
- Mapper 76 rewires the Namco 108 family to four 2 KiB CHR-ROM windows selected through R2-R5;
  R0/R1 are inaccessible. Its two switchable and two fixed 8 KiB PRG windows remain unchanged, with
  no IRQ, PRG RAM, mirroring register or bus conflicts.
- Mapper 77 (Irem LROG017) keeps one banked 2 KiB CHR-ROM window beside three fixed cartridge-RAM
  pattern windows. The RAM's fourth window owns `$2000-$27FF`, `$2800-$2FFF` reaches CIRAM, and
  `$3000-$3EFF` remains open bus; those owners are modeled explicitly rather than flattened into a
  four-screen array. Its joint PRG/CHR latch applies AND conflicts. The user-local _Napoleon Senki_
  image completed 240 frames with deterministic 60-frame save-state replay.
- Mapper 78 combines UNROM-style 16 KiB PRG and CNROM-style 8 KiB CHR switching with AND bus
  conflicts. Register bit 3 selects lower/upper one-screen mirroring on Cosmo Carrier hardware but
  horizontal/vertical mirroring on Holy Diver hardware. Legacy iNES uses the historical
  alternative-nametable flag to distinguish those wirings; NES 2.0 uses submapper 1 or 3 and rejects
  an actual four-screen declaration.
- Mapper 67 (Sunsoft-3) maps one switchable and one fixed 16 KiB PRG window plus four independent
  2 KiB CHR-ROM windows without bus conflicts or PRG RAM. The high half of each 4 KiB register
  region owns CHR, IRQ, mirroring or PRG control; every low half is an IRQ-acknowledge mirror. The
  IRQ port accepts a high-byte/low-byte counter pair, counts down once per CPU cycle, and asserts a
  one-shot IRQ only on the `$0000` to `$FFFF` wrap. Four-way mapper-controlled mirroring, the
  write-pair toggle and the pending IRQ line are preserved in validated save state.
- Mapper 68 (Sunsoft-4) exposes four 2 KiB CHR banks, one switchable and one fixed 16 KiB PRG bank,
  four-way mirroring and an enabled 8 KiB PRG-RAM window. It can replace either mirrored nametable
  page with one of the final 128 1 KiB CHR-ROM banks; writes to ROM-backed nametables are ignored.
  The dual-cartridge/licensing-timer submapper remains rejected because its external option ROM
  cannot be represented by the accepted cartridge format.
- Mapper 79 (AVE NINA-03/NINA-06) decodes its latch only at `$4100-$5FFF` addresses matching
  `(address & $E100) == $4100`. D3 selects one of two 32 KiB PRG banks and D2-D0 select one of eight
  8 KiB CHR-ROM banks; mirroring is hardwired and there are no conflicts, IRQs or PRG RAM.
- Mapper 112 (NTDEC/Asder) uses a two-stage selector/data register with two switchable and two fixed
  8 KiB PRG windows. Two even-aligned 2 KiB and four independent 1 KiB CHR paths remain distinct;
  the outer register supplies separate CHR A18 lines only to the latter four. Even-address mirrors
  are decoded, D0 controls vertical/horizontal mirroring, and the board has no decoded RAM,
  conflicts or IRQ.
  The checksum-pinned 128 KiB PRG + 256 KiB CHR _Sango Fighter_ profile verifies 2,520 input-driven
  frames from title through mode and character selection into active combat, 460 distinct frames,
  exact visual/audio/CPU-cycle results and a deterministic 120-frame save-state replay. A separate
  trace observed multiple values in all eight bank registers. This image keeps mirroring vertical
  and is too small to use CHR A18, so mirroring changes and the four independent outer CHR lines
  remain focused-test evidence rather than claims made by the profile.
- Mapper 113 (HES NTD-8) extends that expansion latch without approximating it as mapper 79. D5-D3
  select up to eight 32 KiB PRG banks; D6 joins D2-D0 as the non-contiguous 8 KiB CHR bank field;
  D7 selects horizontal/vertical mirroring. The board has no bus conflicts, IRQ, PRG RAM or driven
  expansion reads. Focused state and geometry tests pass. Four user-local 32 KiB single-game images
  previously used as short replay smokes were audited as NINA-03/NINA-06 software with mapper-113
  headers, not HES NTD-8 multicarts. In particular, applying D7 as mapper-controlled mirroring to
  _AV Soccer_ corrupts its selection screen, while the mapper-79 hardwired-mirroring contract renders
  it coherently. Those images are now rejected as mapper-113 evidence; a checksum-pinned _HES 6-in-1_,
  _Mind Blower Pak_ or _Total Funpak_ image is still required for `Verified` status.
- Mapper 114 models the SuperGame protection board around an MMC3A core. Submappers 0/1 retain their
  different register-address and bank-index permutations. `$6000` selects mirrored NROM-128 or
  paired NROM-256 override windows and `$6001` supplies CHR A18 without passing through MMC3 WRAM
  protection. The checksum-pinned submapper-0 _The Lion King_ profile verifies 1,680 input-driven
  frames from title into scrolling gameplay, 742 distinct frames, exact visual, audio and CPU-cycle
  results, and a deterministic 120-frame save-state replay. A separate trace observed 104 distinct
  MMC3 register sets, IRQ enable/disable and both pending states. It leaves the outer registers zero,
  so NROM/CHR-A18 paths and submapper 1 remain focused-test evidence.
- Mapper 182 preserves the historical header identity while resolving to mapper 114's submapper-0
  Hosenkan board contract; it cannot select the submapper-1 Boogerman wiring. The checksum-pinned
  256 KiB PRG + 256 KiB CHR _Pocahontas_ profile verifies 3,000 input-driven frames from intro
  through an event-panel transition and back to gameplay, 1,051 distinct frames, exact visual,
  audio and CPU-cycle results, and a deterministic 120-frame save-state replay. A separate trace
  observed 213 MMC3 register sets and IRQ enable/disable; the image leaves both outer registers zero.
- Mapper 115 models the Kasheng SFC-02B/-03/-004 wiring without inheriting mapper 114's scrambling.
  `$6000` supplies PRG A18 and selects direct MMC3, mirrored NROM-128 or paired NROM-256 mode;
  `$6001` supplies CHR A18, while `$6002` drives only three solder-pad bits onto the CPU data bus.
  The checksum-pinned 512 KiB CHR Chinese _Yuu Yuu Hakusho Final_ profile verifies 3,600
  input-driven frames from title through active combat, 1,472 distinct frames, exact visual, audio
  and CPU-cycle results, and a deterministic 120-frame save-state replay. A separate trace observed
  both CHR outer halves, two direct-MMC3 outer-register values, IRQ enable/disable and 59 distinct
  MMC3 register sets. It does not select NROM override, so that path remains focused-test evidence.
- Mapper 117 models the common Future Media board contract: four exact 8 KiB PRG registers, eight
  exact 1 KiB CHR registers, D0 mirroring and no decoded PRG RAM. Its IRQ has separate enable and
  armed gates; qualified PPU-A12 rises decrement a loaded byte counter and the zero transition
  asserts once, then disarms until `$C003` reloads it. Mesen CE, FCEUX and Nestopia agree on that
  contract. Current puNES instead describes incompatible `$6000` ROM banking, fixed upper PRG and
  selectable CPU/A12 IRQ modes; no NES 2.0 submapper or published hardware trace distinguishes that
  variant, so the base mapper deliberately does not combine it with the independently corroborated
  board. The pinned _San Guo Zhi IV_ profile checks 1,320 frames of visual, audio, CPU-cycle and input
  output plus an identical 120-frame save-state replay. A separate register trace exercised the
  first three PRG slots, all eight CHR slots, mirroring and the complete IRQ register family; the
  fourth PRG slot remains focused-test evidence.
- Mapper 248 is NESdev's duplicate assignment for the same Kasheng hardware, not a second guessed
  register model. The factory preserves mapper 248 in cartridge metadata while both IDs share one
  board entity, validation policy and save-state shape. The checksum-pinned 256 KiB PRG + 256 KiB
  CHR _Bao Qing Tian_ profile verifies 1800 input-driven frames, 614 distinct frames, exact
  visual/audio/cycle results and deterministic 120-frame save-state replay. The pinned mapper-115
  profile above independently covers the larger 512 KiB CHR outer-bank path through the same board
  entity.
- Mapper 80 (Taito X1-005) maps three switchable 8 KiB PRG windows, two 2 KiB plus four 1 KiB CHR
  windows, horizontal/vertical mirroring and 128 bytes of internal RAM mirrored across
  `$7F00-$7FFF`. Either `$7EF8/$7EF9` must contain `$A3` to expose RAM; CPU A7 is unconnected so
  the `$7E7x` register mirrors are decoded. Legacy iNES RAM is normalized to the physical 128-byte
  capacity and the battery flag selects volatile or persistent ownership.
- Mapper 82 (Taito X1-017) is not approximated as X1-005. It uses three consecutive PRG registers
  with historical iNES bit ordering, switchable 2/1 KiB CHR halves, three independently keyed
  regions of 5 KiB NVRAM and strong pull-downs on otherwise floating CPU reads. The reverse-
  engineered IRQ counter implements the distinct control/acknowledge reload formulas and
  asynchronous output gate. The corrected 512 KiB PRG wiring belongs to NES 2.0 mapper 552, not 82.
- Mapper 83 models the shared Cony/Yoko ASIC through four immutable PCB descriptions. The ASIC
  provides UxROM, mirrored-16 KiB and four-register 8 KiB PRG modes, four-way nametable control,
  four scratch bytes and a 16-bit one-shot IRQ clocked by CPU M2 or unfiltered PPU-A12 rises.
  Submapper 0 has eight 1 KiB CHR windows; submapper 1 physically combines them into four 2 KiB
  windows using registers 0/1/6/7. Submapper 2 routes PRG-base bits 7-6 to four battery-backed
  8 KiB NVRAM banks and bits 5-4 to shared PRG/CHR outer lines. Submapper 3 instead has a 128 KiB
  inner PRG region and routes base bits 7-6 only to CHR outer lines. `$5000` drives only the two
  solder-pad bits; the default unbridged value is zero because iNES/NES 2.0 has no field for that
  external board setting. IRQ-source writes `$00` and `$FF` select M2 and PPU A12 respectively;
  other byte patterns preserve the selection because current hardware evidence does not identify
  which individual ASIC data input is decisive.
- Mapper 69 (Sunsoft FME-7) commits a `$8000-$9FFF` command register with a following `$A000-$BFFF`
  parameter write: eight 1 KiB CHR banks, a `$6000-$7FFF` window that selects PRG ROM or enabled PRG
  RAM through bits 6-7, three 8 KiB PRG banks with `$E000` fixed, four-way mirroring, and a 16-bit IRQ
  counter decremented every CPU cycle that asserts on the `$0000`→`$FFFF` wrap. The Sunsoft 5B
  expansion audio at `$C000-$FFFF` is not emulated, so the audio submapper stays out of scope.
- Mappers 70 and 152 share the Bandai 74\*161/32 latch: a 16 KiB `$8000-$BFFF` bank with `$C000-$FFFF`
  fixed, an 8 KiB CHR bank and AND-type bus conflicts. Mapper 152 spends bit 7 on single-screen
  mirroring, leaving a 3-bit PRG field and making four-screen declarations invalid; mapper 70 keeps
  mirroring hardwired, uses four PRG bits and may retain externally declared four-screen memory.
- Mapper 87 (Jaleco/Konami) latches an 8 KiB CHR bank at `$6000-$7FFF` with its two select lines
  reversed (value bit 1 drives CHR line 0, value bit 0 drives CHR line 1); PRG ROM stays NROM-fixed
  and there are no bus conflicts. The checksum-pinned 32 KiB PRG + 16 KiB CHR _The Goonies_
  profile observes the game selecting CHR bank 1, verifies 360 no-input frames and 1,500
  input-driven frames with 1,089 distinct results, and reproduces visual, audio and CPU-cycle
  output across a 120-frame save-state replay.
- Mapper 88 retains Namco 108 banking but connects PPU A12 directly to CHR A16, forcing the left and
  right pattern tables into separate 64 KiB halves of 128 KiB CHR ROM. Smaller ROM naturally mirrors
  the absent line.
- Mapper 89 (Sunsoft-2 on Sunsoft-3) uses one AND-conflicted `$8000-$FFFF` latch for a switchable
  16 KiB PRG bank, split-field 8 KiB CHR bank and lower/upper one-screen mirroring. The final 16 KiB
  PRG bank is fixed, no PRG RAM is decoded, and four-screen layouts are rejected.
- Mapper 90 models the EL861226C J.Y. Company PCB rather than combining the distinct mapper
  35/209/211 identities. Its four PRG and eight 16-bit CHR registers support 32/16/8 KiB PRG and
  8/4/2/1 KiB CHR modes inside independently selected 512/256 KiB outer regions; PRG mode 3
  reverses all seven register bits. `$6000-$7FFF` selects optional exact 8 KiB WRAM or a derived
  PRG-ROM bank. The PCB jumper physically inhibits the ASIC's ROM-nametable and per-table CIRAM
  outputs, so `$B00x`, `$D000` bits 5-6 and `$D001` bit 3 never gain mapper-209 behavior.
  `$5800-$5803` expose the eight-M2-cycle multiplier, wrapping accumulator and test register.
  Hardware evidence specifies the completion latency and intermediate results but does not publish
  every early-read stage; the core uses the ASIC's natural eight-step unsigned shift/add sequence
  and preserves its in-flight factors in save state. The IRQ has selectable M2, unfiltered PPU-A12,
  PPU-read or CPU-write clocks, 8/256 prescaling, increment/decrement, XOR-loaded registers and
  level-sensitive acknowledgement. `$C001` bit 3/`$C007` are retained in state but add no guessed
  behavior because their hardware function remains unknown and no known title uses it.
- Mapper 91 denotes two related but electrically distinct boards sharing two switchable 8 KiB PRG
  windows and four 2 KiB CHR windows. Submapper 0 (JY830623C/YY840238C) uses write-address bits
  A2-A0 to select an outer 128 KiB PRG/512 KiB CHR region; its fixed tail follows the selected PRG
  region, mirroring is hardwired, and IRQ asserts after exactly 64 unfiltered PPU-A12 rises.
  Submapper 1 (EJ-006-1) has no outer latch, adds horizontal/vertical registers and exposes a 16-bit
  IRQ counter whose subtractor removes five every fourth CPU M2 cycle and asserts on borrow. Both
  variants decode their `$6000-$7FFF` ports with the documented, different masks and leave reads
  there open bus. Neither board exposes PRG RAM.
- Mapper 93 (Sunsoft-2 on Sunsoft-3R) uses bits 6-4 of one AND-conflicted `$8000-$FFFF` latch for a
  switchable 16 KiB PRG bank and D0 as the fixed 8 KiB CHR-RAM enable. Disabled RAM ignores writes
  and tri-states PPU pattern reads; mirroring remains hardwired and no PRG RAM is decoded.
- Mapper 94 (HVC-UN1ROM) is UxROM with a conflict-prone bank field shifted to bits 4-2. It requires
  128 KiB PRG ROM and fixed 8 KiB CHR RAM.
- Mapper 95 connects Namco 108 CHR A15 to CIRAM A10. R0 controls the two nametable slots at
  `$2000-$27FF` and R1 controls `$2800-$2FFF`; the selected nametable is coupled to each 2 KiB CHR
  bank rather than represented by one global mirroring mode.
- Mapper 96 (Bandai Oeka Kids) maps four 32 KiB PRG banks and eight 4 KiB banks within its physical
  32 KiB CHR RAM. An AND-conflicted CPU latch selects PRG and the outer CHR half; a transition of
  the PPU address bus into `$2xxx` captures A9-A8 for the lower pattern-table bank while the upper
  bank remains 3 or 7. The implementation observes both rendering fetches and CPU PPUADDR/PPUDATA
  transitions, preserves the prior address in save state and forces hardwired vertical mirroring.
  Both user-local game images completed 180-frame starts with deterministic 60-frame save-state
  replay. Their bytes and hashes remain outside the repository, and tablet input is not yet modeled.
- Mapper 97 (Irem TAM-S1) fixes the final 16 KiB PRG bank at `$8000-$BFFF`, selects one of sixteen
  banks at `$C000-$FFFF` through D3-D0, and uses D7-D6 for lower one-screen, horizontal, vertical or
  upper one-screen mirroring. Its only known board carries 256 KiB PRG ROM and 8 KiB CHR RAM. The
  checksum-pinned _Kaiketsu Yanchamaru_ profile matches the board's published PRG CRC, observes the
  game move the upper window from bank 14 to bank 0 and select vertical mirroring, verifies 360
  no-input frames plus 1,500 input-driven frames with 1,098 distinct results, and reproduces visual,
  audio and CPU-cycle output across a 120-frame save-state replay.
- Mapper 118 (TxSROM) keeps full MMC3 banking and filtered-A12 IRQs but connects CHR A17 to CIRAM
  A10. R0/R1 or R2-R5 control nametable slots according to CHR mode, and `$A000` mirroring writes are
  physically disconnected. The checksum-pinned 128 KiB PRG + 128 KiB CHR _Pro Sport Hockey_ profile
  verifies 2,520 input-driven frames from title through mode, team and lineup selection into active
  play, 661 distinct frames, exact visual/audio/CPU-cycle results and a deterministic 120-frame
  save-state replay. Its trace reaches 63 MMC3 register sets, both CHR modes, IRQ enable and both
  CIRAM pages. The game uses uniform lower/upper page patterns; mixed per-slot CIRAM layouts remain
  focused-test evidence.
- Mapper 119 (TQROM) keeps standard MMC3 mirroring and IRQs while CHR bank bit 6 selects between
  16–64 KiB CHR ROM and eight 1 KiB banks of volatile CHR RAM. Official boards have 128 KiB PRG ROM
  and no PRG RAM. Legacy iNES implies the otherwise-unrepresentable 8 KiB CHR RAM; NES 2.0 declares
  it explicitly. The checksum-pinned 128 KiB PRG + 64 KiB CHR ROM + 8 KiB CHR RAM _Pinbot_ profile
  verifies 2,760 input-driven frames from title and player selection into active pinball, 825
  distinct frames, exact visual/audio/CPU-cycle results and a deterministic 120-frame save-state
  replay. Its trace reaches all-ROM, lower-half-RAM, upper-half-RAM and all-RAM slot patterns, writes
  6,245 nonzero CHR-RAM bytes and observes IRQ pending. CHR-mode 0 remains focused-test evidence.
- Mapper 133 follows the established SA-72008 compatibility path: writes matching `$E100=$4100`
  latch D2 as one 32 KiB PRG line and D1-D0 as two 8 KiB CHR lines, while reads remain open bus and
  mirroring stays hardwired. The early 60-pin Sachen 3009/AX-24G hardware is deliberately not
  approximated; its _Jovial Race_ program also writes the compatible `$4120` latch before using its
  native ports. The checksum-pinned 64 KiB PRG + 32 KiB CHR 72-pin _Jovial Race_ profile verifies a
  1,200-frame attract baseline and 2,520 input-driven frames from title and player selection into
  active racing, with 1,069 distinct interactive frames, exact visual/audio/CPU-cycle results and a
  deterministic 120-frame save-state replay. Its trace exercises latch values `$00/$07/$03/$04`,
  both PRG banks and CHR banks 0/3; CHR banks 1/2 remain focused-test evidence. This does not validate
  the unimplemented analog-feedback board.
- Mapper 140 (Jaleco JF-11/JF-14) maps a write-only `$6000-$7FFF` latch: bits 5-4 select a 32 KiB
  PRG bank and bits 3-0 select an 8 KiB CHR-ROM bank. The window has no bus conflicts and reads are
  open bus rather than a fabricated zero.
- Mapper 142 models Kaiser's KS7032 board and KS202 ASIC independently of VRC3. Select/data writes
  assign four 8 KiB PRG windows at `$6000-$DFFF`, while the final bank is fixed at `$E000` and 8 KiB
  CHR RAM is unbanked. Its four-nibble reload feeds a CPU-cycle counter. Overflow asserts IRQ,
  reloads and disables the one-shot counter; `$D000` acknowledges without VRC3-style re-enable.
  The checksum-pinned Kaiser _Super Mario Bros. 2_ profile verifies a 600-frame attract baseline and
  1,800 input-driven frames into World 1-1, with 739 distinct interactive frames, exact visual,
  audio and CPU-cycle results, and deterministic 120-frame save-state replay.
- Mapper 150 models the eight-register ASIC on Sachen SA-015/SA-630 rather than aliasing the
  differently bonded SA-020A board. Mirrored `$4100/$4101` index/data ports retain and read all three
  bits; R5 selects one of four 32 KiB PRG banks, R4 supplies CHR A15, R6 supplies CHR A14-A13 and R7
  owns flipped-L, horizontal, vertical and upper single-screen nametable routing. The normal board
  connects ASIC pin 14 to CPU D2. Its Vcc solder-pad alternative ORs `$04` into writes and leaves D2
  open on reads; that physical path is covered by board-level tests but cannot be selected by an
  iNES/NES 2.0 header. The factory therefore uses the CPU-D2 connection without a title hash.
- Mapper 163 models Nanjing's FC-001 ASIC independently of the related mapper 162/164 boards. It
  combines a 32 KiB PRG bank, unbanked battery NVRAM and CHR RAM with mode-controlled D0/D1 input
  swapping, an inverted one-bit feedback port and automatic CHR A12 selection from PPU A9 captured
  on the latest A13 rise. The checksum-pinned 2 MiB _Xian Jian Qi Xia Zhuan_ profile verifies a
  600-frame baseline, 2,400 input-driven frames into the opening dialogue, 69 distinct interactive
  frames, exact visual/audio/CPU-cycle results and deterministic 120-frame save-state replay.
  Submapper 1 remains rejected until its separate ADPCM hardware is modeled.
- Mapper 164 models the Dongda PEC-9588/cy2000-3 board's UxROM/BxROM modes, high PRG lines and
  reset-time bank `$1F` instead of the older two-register approximation. Its 1bpp path replaces CHR
  A3/A12 with PPU A0/A9 captured at the latest A13 rise. Legacy iNES maps the documented 2 KiB
  volatile work RAM through `$6000-$7FFF`; a separate mapper-owned 512-byte 93C66 provides battery
  persistence through the `$5200` Microwire pins and inverted `$5500.D2` input. Focused tests cover
  the complete x8 command set, write protection, sequential reads, memory separation, reset and
  transactional state. The pinned 1 MiB _Digimon: Crystal Version_ profile verifies 600 animated
  baseline frames and 3,000 input-driven frames into opening dialogue with exact visual, audio,
  cycle and replay results.
- Mapper 180 uses the opposite UxROM window arrangement: the first 16 KiB PRG bank is fixed at
  `$8000-$BFFF`, while `$C000-$FFFF` is switchable. Legacy images use original UNROM AND conflicts;
  NES 2.0 submapper 1 disables them and submapper 2 makes them explicit.
- Mapper 184 (Sunsoft-1) fixes 32 KiB PRG and selects two 4 KiB CHR-ROM windows through a write-only
  `$6000-$7FFF` latch. Bits 2-0 select the lower bank; bits 5-4 select the upper bank with CHR A14
  hard-wired high. Its 16 KiB and 32 KiB CHR layouts are both modeled explicitly. The
  checksum-pinned 32 KiB PRG + 32 KiB CHR _The Wing of Madoola_ profile verifies 3,000 input-driven
  frames from title into active stage-one play, with 2,295 distinct frames, exact
  visual/audio/CPU-cycle results and a deterministic 120-frame save-state replay. Its trace reaches
  lower/upper CHR bank pairs 0/4, 0/7, 2/7 and 3/7; the remaining reachable pairs stay covered by
  focused board tests.
- Mapper 185 keeps CNROM's fixed 16/32 KiB PRG and AND-conflicted two-bit latch but uses the latch as
  CHR-ROM chip select. NES 2.0 submappers 4-7 name enable values 0-3. Any other value tri-states the
  PPU data pins, whose undriven read follows the address low byte; unknown legacy wiring is rejected.
- Mapper 187 layers the UNL SF3/KOF96 protection and outer-bank circuit over a standard MMC3 core.
  Exact `$5000`/`$6000` writes choose normal six-bit MMC3 PRG banking, mirrored 16 KiB banking or
  either documented 32 KiB wiring; CHR A18 applies only to slots sourced by R0/R1. The expansion
  range returns the board's `$83` protection value, and `$8001` remains gated until an exact `$8000`
  write. Pinned _The King of Fighters '96_ and _Street Fighter Zero 2 '97_ profiles verify the
  256/512 KiB CHR and 128/256 KiB PRG board capacities with exact frame/audio/cycle checkpoints and
  deterministic replay. A local `sf97.nes` mapper-187 header conflicts with the observed startup
  protocol and is deliberately not repaired with a checksum-based board guess.
- Mapper 189 composes a standard MMC3 clone with TXC's independent 32 KiB PRG outer latch. Writes
  across the generalized `$4020-$7FFF` decode OR the data byte's upper and lower nibbles to select
  one of eight whole PRG banks; MMC3 R6/R7 and PRG mode cannot split that external window. The MMC3
  owner still controls 1/2 KiB CHR banks, horizontal/vertical mirroring and filtered-A12 IRQs, while
  `$6000-$7FFF` remains a write-only latch instead of fabricated PRG RAM. The checksum-pinned
  _Thunder Warrior_ profile verifies 2,520 input-driven frames, 800 distinct frames, exact visual,
  audio and CPU-cycle results, and a deterministic 120-frame save-state replay. A separate mapper
  trace over that scenario observed outer-bank values 0/1/2/3 and both asserted and cleared MMC3 IRQ
  state. The secondary local _Street Fighter II_ image remains useful unpinned smoke evidence.
- Mapper 206 (Namco 118 / DxROM) is the discrete predecessor to MMC3. It reuses the `$8000`/`$8001`
  bank-select and bank-data ports for two 2 KiB plus four 1 KiB CHR windows and two 8 KiB PRG banks
  with the final two banks fixed. It has no IRQ, no PRG-RAM and no mirroring register, so mirroring
  stays hardwired from the header. MMC3-family supersets that add those features remain separate.
- Mapper 225 models the address-latched ET-4310/K-1010 pairs as either 1 MiB PRG/512 KiB CHR or
  2 MiB PRG/1 MiB CHR. A14 is the shared high bank line; A12 selects mirrored 16 KiB versus paired
  32 KiB PRG and A13 controls mirroring. Because the mapper number cannot distinguish populated
  from unpopulated 74x670 boards, the compatibility convention exposes the documented four mirrored
  low-nibble registers at `$5800-$5FFF`; they survive warm reset but not power loss.
- Mapper 226 models the BMC 42/63/76-in-1 two-register latch. Register 0 supplies five inner PRG
  lines, one outer line, mirrored-16 KiB versus paired-32 KiB mode and mirroring; register 1
  supplies the final outer line and CHR-RAM write protection. Both registers clear on warm reset.
  The accepted 1/1.5/2 MiB layouts retain their physical outer-chip wiring, including the 63-in-1
  selector order `0/0/1/2`, rather than modulo-folding the three-chip image. The checksum-pinned
  1 MiB _Super 42-in-1_ profile uses Select to enter the second menu page, launches _1942_ and
  verifies 1800 input-driven frames, 354 distinct frames, exact visual/audio/cycle results and
  deterministic 120-frame save-state replay. The 1.5/2 MiB layouts remain focused-test evidence.
- Mapper 227 separates three published variants. Submapper 0 leaves its 8 KiB CHR RAM writable and
  maps an explicitly battery-backed 8 KiB RPG WRAM window; its missing UNROM circuit hardwires the
  PRG path to the NROM-128/NROM-256 modes. Submapper 1 protects CHR RAM in NROM modes and substitutes
  the unbridged solder-pad value `0` for PRG A3-A0 when requested; other menu positions need a future
  external-board-input port, not a ROM hash. Submapper 2 applies the same CHR protection and forces
  outer A18-A17 low whenever the selected inner bank is zero. The multicart variants retain the
  address-derived UNROM/NROM-128/NROM-256 wiring and switchable mirroring.
- Mapper 228 maps the Active Enterprises board's 512 KiB Cheetahmen II layout and Action 52's
  non-power-of-two three-chip 1.5 MiB layout. PRG chip selectors 0/1/3 map file chunks 0/1/2; chip
  selector 2 is electrically absent and produces CPU open bus rather than modulo aliasing. Address
  lines select paired or mirrored 16 KiB PRG, the high four CHR bits and mirroring; write data D1-D0
  supplies the low CHR bits. The rumored `$4020-$5FFF` nibble RAM is intentionally absent because
  hardware inspection says neither cartridge contains it.
- Mapper 240 models the C&E/Supertone data latch as expansion hardware rather than a GNROM register
  alias. Writes throughout `$4020-$5FFF` select one 32 KiB PRG bank with D5-D4 and one 8 KiB CHR
  bank with D3-D0; `$8000-$FFFF` remains ROM-only, and header mirroring stays hardwired. The known
  board geometry is exactly 128 KiB each of PRG and CHR ROM plus directly mapped 8 KiB PRG RAM or
  NVRAM. The checksum-pinned non-HACK _Jing Ke Xin Zhuan_ profile verifies 1800 input-driven frames,
  341 distinct frames, exact visual/audio/cycle results and deterministic 120-frame save-state
  replay. A separate trace across it and a local HACK image exercised five effective latch states.
- Mapper 241 models the conflict-free BxROM-with-WRAM contract rather than FCEUX's incorrect-dump
  exception. Any `$8000-$FFFF` write latches one 32 KiB PRG bank; 8 KiB WRAM or battery NVRAM is
  direct at `$6000-$7FFF`, 8 KiB CHR RAM is unbanked and mirroring stays hardwired. One local 512 KiB
  _Edu_ image exercised banks 0/1/2/4 and retained an 8 KiB battery snapshot; one local 128 KiB
  _Journey to the West_ image exercised banks 0/1/3 with volatile WRAM. Both completed 1200
  non-halted frames and identical 120-frame save-state replay. Some educational cartridges add an
  LPC speech device at `$5000-$5FFF`; that optional audio hardware is not yet modeled and remains
  open bus, so status stays `Implemented` rather than `Verified`.
- Mapper 242 models the 512 KiB Waixing/UNL-43272 address latch with four outer and three inner PRG
  lines, UNROM/NROM-128/NROM-256 modes and address-selected mirroring. Multicart boards protect
  their unbanked 8 KiB CHR RAM in NROM modes and can replace PRG A4-A0 with the unbridged menu-pad
  value `0`. Battery-backed RPG boards expose 8 KiB NVRAM, keep CHR writable and hardwire away the
  UNROM path. The checksum-pinned _Wai Xin Zhan Shi_ profile verifies 1200 input-driven frames, 424
  distinct frames, exact visual/audio/cycle results and deterministic 120-frame save-state replay;
  a separate trace exercised five latch values. The optional 640 KiB two-chip ET-113 variant remains
  unsupported until a matching corpus image is available.
- Mapper 243 models the eight-register ASIC on Sachen's SA-020A board. The index/data ports use the
  full `$C101` decode through `$4100-$7FFF`; data reads drive only D2-D0, while every register retains
  all three bits even when it has no external output. R5 selects 32 KiB PRG, R2/R4/R6 independently
  drive the four 8 KiB CHR bank lines, and R7 selects flipped-L, horizontal, vertical or upper
  single-screen nametable routing. Cold power clears the ASIC while warm reset leaves it untouched.
  A local _Poker III 5-in-1_ image whose header declares mapper 243 was rejected as SA-020A evidence:
  the game is a TC-020 mapper-150 title and the SA-020A wiring visibly selects the wrong pattern
  banks. Changing only the diagnostic in-memory mapper identity to 150 produced coherent banking
  through 1,800 non-halted frames, without changing production parsing or adding a checksum quirk.
  A correctly headed mapper-150 image and an accurate _Honey Peach_ image remain the separate
  board-level validation targets.
- Mapper 244 models C&E's separate 32 KiB PRG and 8 KiB CHR outputs behind the board's documented
  permutation network. D3 chooses which output changes; D5-D4 plus D1-D0 select one of sixteen PRG
  results, while D6-D4 plus D2-D0 select one of 64 CHR results. The complete lookup network is
  covered exhaustively rather than approximated as bit swaps. The pinned _Decathlon_ profile runs
  2,200 input-driven frames with 235 distinct frames, exact visual/audio/CPU-cycle checkpoints and
  a deterministic 100-frame save-state replay. A separate register trace exercised eight effective
  bank pairs spanning PRG 0/1/3 and CHR 0/1/2/4; the exhaustive permutation test covers the remaining
  electrical combinations.
- Mapper 245 models the Waixing F003 pin routing rather than treating it as an MMC3 bank mask. PPU
  A10/A11 select the active MMC3 CHR register while its A12 input is grounded; that register's CHR
  A11 output becomes PRG A19, selecting one 512 KiB half for every CPU ROM window. CHR-RAM remains
  directly wired and unbanked, so the MMC3 CHR registers never remap pattern memory, and the
  disconnected A12 input cannot clock the scanline IRQ. The board retains MMC3 PRG banking,
  mirroring, NVRAM protection and its 8 KiB battery-backed NVRAM. The pinned 1 MiB _Dragon Quest VII_
  profile runs 1,600 input-driven frames with exact visual/audio/CPU-cycle checkpoints, uses both
  outer PRG halves and completes a deterministic 120-frame save-state replay. A second 1 MiB image
  also used both halves, while a 512 KiB image remains supplemental TNROM-like fallback evidence.
- Mapper 246 models C&E's four independently banked 8 KiB PRG windows, four 2 KiB CHR windows and
  the exact 2 KiB SRAM aperture at `$6800-$6FFF`. It also includes the hardware-traced sixteen
  high-address reads that force PRG A17, including the reset/IRQ vector at `$FFFC-$FFFF`; this is
  board wiring rather than a title-hash bootstrap fix. Cold power sets the 74LS670 register files
  to all high and warm reset preserves them. The pinned original _Feng Shen Bang_ profile runs 2,200
  input-driven frames with 391 distinct frames plus exact visual/audio/CPU-cycle checkpoints, then
  completes a deterministic 120-frame save-state replay. A separate trace exercised 15 bank states;
  two modified images retain 900-frame smoke evidence with 13/14 states but are not primary profiles.
- Mapper 250 keeps the standard MMC3 memory, mirroring, PRG-RAM protection and filtered A12 IRQ
  paths but rewires CPU writes: A10 selects the odd/even register port, A7-A0 carry its value, and
  CPU D7-D0 are ignored. The mapper factory bounds the shared MMC3 core to 512 KiB PRG, 256 KiB CHR,
  optional 8 KiB PRG RAM/NVRAM, two-screen nametables and submapper 0. The pinned 128 KiB + 128 KiB
  _Time Diver Avenger_ profile runs 2,200 input-driven frames with 401 distinct frames and exact
  visual/audio/CPU-cycle checkpoints, then completes a deterministic 120-frame save-state replay.
  A separate register trace exercised 15 distinct MMC3 bank states; the remaining register and
  geometry boundaries stay covered by focused tests.

The completed finite mapper track and the external-verification follow-up are recorded in
[Engineering roadmap](./engineering-roadmap.md). Numbers outside that boundary remain unsupported
unless the roadmap is changed explicitly; no unknown mapper is silently approximated.

Before changing a status to `Verified`, verify header parsing, bank boundaries, mirroring, writable
memory, reset behavior and IRQ semantics where applicable, then record executable external evidence.
Submapper and board variants must remain explicit rather than being silently approximated by the
base mapper number.

Representative title and variant candidates are maintained in
[Mapper real-ROM validation plan](./mapper-real-rom-plan.md). A title becomes evidence only after
its exact image identity and exercised checkpoints are pinned.

Historical local runs without a recorded fixture checksum remain useful engineering notes but do not
satisfy the current `Verified` definition. See [Testing](./testing.md) for evidence and baseline
rules.
