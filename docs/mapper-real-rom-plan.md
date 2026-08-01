# Mapper real-ROM validation plan

This plan names user-supplied ROM images that can seed one end-to-end smoke profile for every
implemented mapper ID. It records titles and hardware intent only: the repository does not contain,
locate or download commercial ROM data.

A representative game is not proof of a whole mapper family. One image may leave alternate
submappers, RAM layouts, IRQ modes or audio paths untouched. The compatibility status can become
`Verified` only for the behavior exercised by a checksum-pinned image through the public emulator
facade.

## Preparing the local corpus

Use legally obtained, unmodified `.nes` images with an accurate iNES or NES 2.0 header. Region and
release names below are intentional: different regional releases can use different boards. Do not
rename a patched translation or mapper conversion as the original release.

Place candidates under an explicit local root such as:

```text
/Users/you/roms/mapper-corpus/
  000/
  001/
  ...
  228/
```

Filenames are not identities. Before adding a profile, the inventory step must record:

- whole-file SHA-256 and byte length;
- parsed format, mapper, submapper, console type and region;
- PRG/CHR ROM and writable-memory geometry;
- exact release or conversion provenance supplied by the owner;
- the hardware behavior and deterministic checkpoint that the image actually exercises.

If an image's header disagrees with the expected row, quarantine it for manual review. Never patch
the mapper number merely to make it load.

## Primary candidate matrix

The primary column gives one useful smoke seed per implemented ID. A supplement is listed only when
the same ID covers materially different hardware that the primary image cannot exercise.

| Mapper | Board family       | Primary candidate                                                      | Material supplement                                                               | Main validation target                                           |
| -----: | ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
|      0 | NROM               | _Super Mario Bros._ (World/USA)                                        | —                                                                                 | Baseline CPU/PPU/APU, controller and deterministic replay        |
|      1 | MMC1/SxROM         | _The Legend of Zelda_ (USA)                                            | A larger SUROM/SXROM title after header inspection                                | Serial writes, CHR-RAM, battery RAM and mirroring                |
|      2 | UxROM/UNROM        | _Contra_ (USA)                                                         | —                                                                                 | Switchable PRG, fixed tail and CHR-RAM                           |
|      3 | CNROM              | _The Legend of Kage_ (pinned local profile)                            | _Hayauchi Super Igo_ for its 2 KiB PRG-RAM board                                  | Legacy no-conflict compatibility, CHR banks and mirrored RAM     |
|      4 | MMC3               | _Super Mario Bros. 3_ (Japan, pinned local profile)                    | _Rad Racer II_ for four-screen wiring                                             | Filtered A12 IRQ, PRG/CHR modes and mirroring                    |
|      5 | MMC5/ExROM         | _Castlevania III: Dracula's Curse_ (USA)                               | _Just Breed_ (Japan) for extended attributes, larger RAM and expansion audio      | ExRAM, split/extended rendering, scanline IRQ and MMC5 audio     |
|      6 | Magic Card         | _Arabian Dream Scheherazade_ Magic Card extraction                     | A trainer-bearing extraction if available                                         | RAM-card initialization, latch mode, trainer and data IRQ        |
|      7 | AxROM              | _Battletoads_ (USA)                                                    | —                                                                                 | 32 KiB PRG switching, one-screen mirroring and timing stress     |
|      8 | Magic Card mode 4  | _Paris-Dakar Rally Special_ mode-4 extraction                          | —                                                                                 | Mapper-6 submapper-4 alias and extraction geometry               |
|      9 | MMC2/PxROM         | _Punch-Out!!_ (Japan, pinned local profile)                            | —                                                                                 | Real PPU FD/FE latch transitions and PRG banking                 |
|     10 | MMC4/FxROM         | _Fire Emblem: Ankoku Ryuu to Hikari no Tsurugi_ (Japan)                | —                                                                                 | MMC4 latches, PRG RAM and mirroring                              |
|     11 | Color Dreams       | _Bible Adventures_ (USA, unlicensed)                                   | —                                                                                 | Combined PRG/CHR latch and bus conflicts                         |
|     13 | CPROM              | _Videomation_ (USA)                                                    | —                                                                                 | Banked upper 4 KiB CHR-RAM and conflicts                         |
|     15 | K-1029/K-1030P     | _100-in-1 Contra Function 16_                                          | _168-in-1 New Contra Function 16_                                                 | Four PRG modes, CHR protection and reset state                   |
|     16 | Bandai FCG         | _Dragon Ball Z III: Ressen Jinzou Ningen_ (Japan, NES 2.0 mapper 16.5) | _Akuma Kun_ for FCG-1/2 decode                                                    | LZ93D50 IRQ, 24C02 persistence and low/high register decode      |
|     17 | Super Magic Card   | _Kaiketsu Yanchamaru: Karakuri Land_ Super Magic Card extraction       | A trainer-bearing submapper 1–3 extraction                                        | Four PRG/eight CHR windows, WRAM, trainer and dual-source IRQ    |
|     18 | Jaleco SS8806      | _Pizza Pop!_ (Japan)                                                   | —                                                                                 | Nibble registers, RAM gate, mirroring and cycle IRQ              |
|     19 | Namco 163          | _Digital Devil Story: Megami Tensei II_ (Japan)                        | A no-audio board image after submapper inspection                                 | CIRAM/WRAM routing, shared RAM, IRQ, N163 audio and persistence  |
|     21 | Konami VRC4a/c     | _Wai Wai World 2: SOS!! Paseri Jou_ (Japan)                            | Exact alternate pin route if available                                            | Pin routing, PRG/CHR banking and VRC IRQ                         |
|     22 | Konami VRC2a       | _TwinBee 3: Poko Poko Daimaou_ (Japan)                                 | —                                                                                 | Swapped pins, shifted CHR banks and VRC2 latch behavior          |
|     23 | VRC2b/VRC4e/f      | _Contra_ (Japan)                                                       | _Getsu Fuuma Den_ for an additional board route                                   | Exact/legacy pin routes, RAM/latch and IRQ                       |
|     24 | Konami VRC6a       | _Akumajou Densetsu_ (Japan)                                            | —                                                                                 | VRC6a banking, IRQ, two pulses, saw and mixer                    |
|     25 | VRC2c/VRC4b/d      | _Gradius II_ (Japan)                                                   | _Ganbare Goemon Gaiden_ for another pin route                                     | Pin routing, PRG/CHR modes and VRC IRQ                           |
|     26 | Konami VRC6b       | _Mouryou Senki Madara_ (Japan)                                         | _Esper Dream 2_ if available                                                      | Swapped A0/A1 register inputs, IRQ and VRC6 audio                |
|     32 | Irem G-101         | _Image Fight_ (Japan)                                                  | _Major League_ (Japan, mapper 32.1)                                               | PRG mode, CHR banks and fixed-upper one-screen wiring            |
|     33 | Taito TC0190       | _Akira_ (Japan)                                                        | _Don Doko Don_ (Japan)                                                            | Register mask, PRG/CHR banks and mapper-controlled mirroring     |
|     34 | BNROM/NINA-001     | _Deadly Towers_ (USA, BNROM)                                           | _Impossible Mission II_ (USA, NINA-001)                                           | Mutually exclusive board selection, conflicts and NINA registers |
|     48 | Taito TC0690       | _Bubble Bobble 2_ (Japan)                                              | —                                                                                 | Banking, mirroring and delayed A12 IRQ                           |
|     64 | Tengen RAMBO-1     | _Skull & Crossbones_ (USA)                                             | _Klax_ (USA)                                                                      | PRG/CHR modes and CPU/A12-selectable IRQ                         |
|     65 | Irem H3001         | _Daiku no Gen-san 2: Akage no Dan no Gyakushuu_ (Japan)                | —                                                                                 | PRG mode, RAM, mirroring and cycle IRQ                           |
|     66 | GxROM/MHROM        | _Super Mario Bros. / Duck Hunt_ (USA)                                  | —                                                                                 | Combined 32 KiB PRG and 8 KiB CHR selection                      |
|     67 | Sunsoft-3          | _Mito Koumon II: Sekai Manyuu Ki_ (Japan)                              | _Fantasy Zone II_ (Japan)                                                         | 2 KiB CHR windows, four-way mirroring and one-shot cycle IRQ     |
|     68 | Sunsoft-4          | _After Burner_ (USA)                                                   | _Nantettatte!! Baseball_ (Japan)                                                  | CHR-backed nametables, RAM and mirroring                         |
|     69 | Sunsoft FME-7      | _Batman: Return of the Joker_ (USA)                                    | _Gimmick!_ (Japan), tracked as expected audio-incomplete                          | Command/data banking, RAM window and decrementing IRQ            |
|     70 | Bandai 74xx        | _Kamen Rider Club_ (Japan)                                             | —                                                                                 | Conflicted PRG/CHR latch with hard-wired mirroring               |
|     71 | Codemasters        | _Fire Hawk_ (USA)                                                      | _Micro Machines_ for fixed-mirroring wiring                                       | Controlled one-screen submapper, PRG switching and timing        |
|     72 | Jaleco JF-17       | _Pinball Quest_ (Japan)                                                | _Moero!! Pro Tennis_, tracked as expected audio-incomplete                        | Conflict-masked rising-edge PRG and CHR latches                  |
|     73 | Konami VRC3        | _Salamander_ (Japan)                                                   | —                                                                                 | Nibble latch, 16/8-bit cycle IRQ and PRG/CHR RAM                 |
|     74 | Waixing Type A     | _Di 4 Ci: Ji Qi Ren Da Zhan - Robot War IV_                            | _Ji Jia Zhan Shi_                                                                 | Exact CHR `$08/$09` RAM redirects plus MMC3 banking and IRQ      |
|     75 | Konami VRC1        | _Ganbare Goemon! Karakuri Douchuu_ (Japan)                             | —                                                                                 | Split CHR high bits, PRG banks and mirroring                     |
|     76 | Namco 3446         | _Digital Devil Story: Megami Tensei_ (Japan)                           | —                                                                                 | Four 2 KiB CHR windows and fixed PRG geometry                    |
|     77 | Irem LROG017       | _Napoleon Senki_ (Japan)                                               | —                                                                                 | Mixed CHR ROM/RAM, split nametable ownership and conflicts       |
|     78 | Irem 74HC161       | _Holy Diver_ (Japan, mapper 78.3)                                      | _Uchuusen: Cosmo Carrier_ (Japan, mapper 78.1)                                    | Both incompatible mirroring wirings and conflicts                |
|     79 | NINA-03/06         | _F-15 City War_ (USA)                                                  | —                                                                                 | Expansion-area latch and combined PRG/CHR selection              |
|     80 | Taito X1-005       | _Minelvaton Saga: Ragon no Fukkatsu_ (Japan)                           | _Taito Grand Prix_ (Japan)                                                        | Mirrored registers, internal RAM permission and banking          |
|     82 | Taito X1-017       | _Kyuukyoku Harikiri Stadium III_ (Japan)                               | —                                                                                 | PRG/CHR banking, pull-down behavior, RAM and cycle IRQ           |
|     83 | Cony/Yoko ASIC     | _Street Fighter II Pro_ (unlicensed, mapper 83.0)                      | _World Heroes 2'_ (83.1), _Dragon Ball Party_ (83.2), _1994 Super 20-in-1_ (83.3) | Four PCB wirings, NVRAM, outer banks and dual-source IRQ         |
|     85 | Konami VRC7        | _Lagrange Point_ (Japan, VRC7a)                                        | _Tiny Toon Adventures 2_ (Japan, VRC7b)                                           | Pin routing, IRQ, audible six-channel FM and muted PCB           |
|     87 | Jaleco J87         | _City Connection_ (Japan)                                              | _The Goonies_ (Japan)                                                             | Reversed CHR select bits without bus conflicts                   |
|     88 | Namco 3433         | _Dragon Spirit: Aratanaru Densetsu_ (Japan)                            | —                                                                                 | Split lower/upper 64 KiB CHR wiring                              |
|     89 | Sunsoft-2          | _Tenka no Goikenban: Mito Koumon_ (Japan)                              | —                                                                                 | Split-field CHR bank, PRG bank, mirroring and conflicts          |
|     90 | J.Y. EL861226C     | _Aladdin_ (Hummer Team, unlicensed)                                    | _Mortal Kombat II Special_                                                        | Outer banks, multiplier, latch, banking modes and IRQ sources    |
|     91 | JY/EJ bootleg      | _Street Fighter 3_ (unlicensed, mapper 91.0)                           | _Super Fighter III_ (mapper 91.1)                                                 | JY outer/A12 path and EJ mirroring/M2 IRQ path                   |
|     93 | Sunsoft-3R         | _Shanghai_ (Japan)                                                     | _Fantasy Zone_ compatible board revision                                          | PRG bank and CHR-RAM enable/open-bus behavior                    |
|     94 | UN1ROM             | _Senjou no Ookami_ (Japan)                                             | —                                                                                 | Shifted PRG bank field, fixed tail and conflicts                 |
|     95 | Namco 3425         | _Dragon Buster_ (Japan)                                                | —                                                                                 | CHR-bank-driven CIRAM selection                                  |
|     96 | Bandai Oeka Kids   | _Oeka Kids: Anpanman to Oekaki Shiyou!!_                               | _Oeka Kids: Anpanman no Hiragana Daisuki_                                         | PPU address-edge CHR latch, 32 KiB RAM and conflicts             |
|     97 | Irem TAM-S1        | _Kaiketsu Yanchamaru_ (Japan)                                          | —                                                                                 | Inverted fixed/switchable PRG placement and mirroring            |
|     99 | VS mainboard       | _Vs. Gumshoe_ (VS UniSystem)                                           | _Vs. Super Mario Bros._ for the common socket layout                              | Fifth PRG socket, CHR socket, open bus, RGB PPU and cabinet I/O  |
|    112 | NTDEC/Asder        | _Sango Fighter_ (unlicensed)                                           | _Huang Di_                                                                        | Two-stage registers, split CHR outer lines and mirroring         |
|    113 | HES NTD-8          | _HES 6-in-1_                                                           | _Total Funpak_                                                                    | Expansion decode, split-field PRG/CHR latch and mirroring        |
|    114 | SuperGame MMC3     | _The Lion King_ (SuperGame)                                            | _Boogerman_ (submapper 1)                                                         | Both scrambling patterns, outer banks and MMC3A zero-latch IRQ   |
|    115 | Kasheng MMC3       | _Yuu Yuu Hakusho Final_ (Chinese, 512 KiB CHR)                         | _Thunderbolt II_                                                                  | PRG/CHR outer lines, NROM override, solder pads and MMC3C IRQ    |
|    118 | TxSROM             | _Armadillo_ (Japan)                                                    | _Pro Sport Hockey_                                                                | CHR-bank-controlled CIRAM and MMC3 IRQ                           |
|    119 | TQROM              | _Pin-Bot_ (USA)                                                        | _High Speed_ (USA)                                                                | Per-bank CHR ROM/RAM selection and MMC3 IRQ                      |
|    140 | Jaleco JF-11/JF-14 | _Mississippi Satsujin Jiken: Murder on the Mississippi_ (Japan)        | —                                                                                 | Expansion-register decode, PRG/CHR latch and open bus            |
|    152 | Bandai 74xx        | _Pocket Zaurus: Juu Ouken no Nazo_ (Japan)                             | —                                                                                 | Reduced PRG field and single-screen mirroring bit                |
|    180 | Inverted UxROM     | _Crazy Climber_ (Japan)                                                | —                                                                                 | Fixed first 16 KiB plus switchable upper bank                    |
|    182 | SuperGame MMC3     | _Pocahontas_ (Hosenkan)                                                | —                                                                                 | Mapper-114.0 duplicate routing, scrambling and MMC3A IRQ         |
|    184 | Sunsoft-1          | _Atlantis no Nazo_ (Japan)                                             | —                                                                                 | Independently wired 4 KiB CHR windows                            |
|    185 | CNROM protection   | _Mighty Bomb Jack_ (Japan, NES 2.0 header)                             | PRG0 and PRG1 revisions if both are available                                     | Explicit chip-select submapper, PPU open bus and conflicts       |
|    189 | TXC MMC3           | _Thunder Warrior_                                                      | _Street Fighter II: The World Warrior_ (unlicensed)                               | 32 KiB outer PRG latch plus MMC3 CHR, mirroring and A12 IRQ      |
|    206 | Namco 118/DxROM    | _Super Chinese_ (Japan)                                                | VS _RBI Baseball_, _TKO Boxing_ and _Super Xevious_ for protection hardware       | Simplified MMC3 banking plus console-owned VS security variants  |
|    225 | ET-4310/K-1010     | _58-in-1_                                                              | _52 Games_ or another independently sized dump                                    | Address latch, PRG/CHR geometry, nibble registers and reset      |
|    227 | 810449/FW-01       | _1992 Contra 120-in-1_                                                 | Waixing _Bio Hazard_ for battery WRAM; an identified mapper 227.2 multicart       | NROM/UNROM modes, CHR protection, solder pads and RPG WRAM       |
|    228 | Active Enterprises | _Action 52_ (USA)                                                      | _Cheetahmen II_ (USA)                                                             | Non-power-of-two PRG chips, absent-chip open bus and CHR latch   |
|    242 | Waixing 43272      | _Wai Xin Zhan Shi_                                                     | A no-battery multicart; ET-113 after exact header inspection                      | NROM/UNROM modes, CHR protection, menu pads and RPG WRAM         |
|    245 | Waixing F003       | _勇者斗恶龙 VII - Dragon Quest_ (Waixing translation)                  | A smaller PRG F003 dump for the TNROM-like fallback                               | Dynamic 512 KiB outer PRG line, direct CHR-RAM and grounded A12  |
|    248 | Kasheng MMC3       | _Bao Qing Tian_                                                        | —                                                                                 | Duplicate-ID routing, outer banks, solder pads and MMC3C IRQ     |

## Selection cautions

- _Castlevania III: Dracula's Curse_ (USA) is MMC5/mapper 5; _Akumajou Densetsu_ (Japan) is
  VRC6a/mapper 24. They are separate required candidates, not regional substitutes.
- Current board evidence assigns _Kaiketsu Yanchamaru_ to mapper 97 and _Crazy Climber_ to mapper 180. The historical TuxNES title table labels _Crazy Climber_ as mapper 97 and must not be used to
  repair a modern header.
- Mappers 6, 8 and 17 describe play-mode images extracted from copier disk formats, not the games'
  original retail cartridge boards. Preserve the conversion provenance and trainer metadata.
- Mapper 69 can validate FME-7 banking and IRQ with _Batman: Return of the Joker_. _Gimmick!_ also
  requires Sunsoft 5B audio, which is not implemented, so its audio must not be accepted as a passing
  baseline yet.
- Mapper 99 is not the whole VS platform. Some VS protection games use mapper 206; their VS console
  metadata must remain present for cabinet inputs, RGB PPU selection and protection reads.
- Multicart and unlicensed names are frequently reused for different PCBs. Accept them only after
  parsing the actual header and checking ROM geometry against the mapper factory.

## Intake and promotion workflow

When the local corpus is ready:

1. Recursively inventory only the user-provided root and print metadata plus SHA-256; never search
   the rest of the machine.
2. Match each image to this plan by parsed hardware identity, not filename.
3. Quarantine duplicates, trainer variants, patched translations, overdumps and conflicting headers.
4. For each accepted image, define deterministic input, video, audio, CPU-cycle and save-state replay
   checkpoints through `Emulator`.
5. Commit only the profile metadata and expected hashes. ROM bytes stay ignored and outside Git.
6. Promote a compatibility row to `Verified` only when its recorded scope passes reproducibly.

The existing Mario and Contra profiles demonstrate the required identity and replay policy in
[`packages/fc-emu/test-support/real-roms.md`](../packages/fc-emu/test-support/real-roms.md).

## Research sources

- [NESdev mapper index](https://www.nesdev.org/wiki/List_of_mappers) and the mapper-specific pages it
  links provide current board assignments and example games.
- [NESdev mapper release chronology](https://www.nesdev.org/wiki/List_of_mappers_by_Release_Date)
  resolves early-board assignments such as mappers 87, 94, 97, 140, 152, 180, 184, 185 and 206.
- [NES 2.0 XML Database](https://forums.nesdev.org/viewtopic.php?t=19940) is the preferred checksum
  and header cross-check after a user supplies an image.
- The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is used only for
  discovery; its own introduction says that the catalog and mirroring data are incomplete.
- Project support policy and current evidence remain authoritative in
  [Mapper compatibility](./mapper-compatibility.md) and [Testing](./testing.md).
