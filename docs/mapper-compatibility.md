# Mapper compatibility

Mapper support is tracked by board behavior and evidence, rather than by a claim that a title list is
complete. The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is useful
for discovering compatibility targets; its own introduction warns that the catalog is incomplete
and that mirroring values may be unreliable.

`Implemented` means the board contract, geometry and focused tests exist. `Verified` additionally
requires executable external or pinned real-ROM evidence. Both statuses are loadable; the distinction
describes evidence maturity rather than a runtime feature flag.

| Mapper | Board family   | Status      | Current evidence                                               |
| ------ | -------------- | ----------- | -------------------------------------------------------------- |
| 0      | NROM           | Verified    | Unit tests; pinned `MARIO.NES` real-ROM runner                 |
| 1      | MMC1/SxROM     | Verified    | Board tests; Holy Mapperel SK/SG/SN/SU/SX 5/5                  |
| 2      | UxROM/UNROM    | Verified    | Unit tests; pinned `CONTRA.NES` real-ROM runner                |
| 3      | CNROM          | Implemented | PRG/CHR/conflict/oversize tests; facade smoke                  |
| 4      | MMC3           | Implemented | A12/IRQ tests; real PPU dot-260 integration; fixture unpinned  |
| 7      | AxROM          | Implemented | Banking/mirroring/conflict tests; BNTest fixture unpinned      |
| 9      | MMC2/PxROM     | Implemented | Unit tests; full-address sprite/read-order integration tests   |
| 10     | MMC4/FxROM     | Implemented | PRG/RAM/latch/mirroring tests; no conformance ROM              |
| 11     | Color Dreams   | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM            |
| 13     | CPROM          | Implemented | CHR-RAM banking/conflict unit tests; no conformance ROM        |
| 18     | Jaleco SS8806  | Implemented | Nibble banking/RAM/mirroring/cycle-IRQ tests; no fixture       |
| 32     | Irem G-101     | Implemented | PRG modes/CHR/submapper/geometry tests; no conformance ROM     |
| 33     | Taito TC0190   | Implemented | PRG/CHR/mirroring/register-mask tests; no conformance ROM      |
| 34     | BNROM/NINA-001 | Verified    | Board tests; Holy Mapperel BNROM result `0000`                 |
| 48     | Taito TC0690   | Implemented | Banking/A12/IRQ-revision/delay tests; no conformance ROM       |
| 64     | Tengen RAMBO-1 | Implemented | PRG/CHR modes/dual-clock IRQ/state tests; no conformance ROM   |
| 65     | Irem H3001     | Implemented | PRG-mode/CHR/RAM/mirroring/cycle-IRQ tests; no conformance ROM |
| 66     | GxROM/MHROM    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM            |
| 68     | Sunsoft-4      | Implemented | PRG/CHR/RAM/ROM-nametable tests; no conformance ROM            |
| 69     | Sunsoft FME-7  | Implemented | Banking/mirroring/IRQ unit tests; no 5B audio                  |
| 70     | Bandai 74xx    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM            |
| 71     | Codemasters    | Implemented | PRG/mirroring unit tests; no conformance ROM                   |
| 75     | Konami VRC1    | Implemented | PRG/CHR/mirroring/four-screen tests; no conformance ROM        |
| 76     | Namco 3446     | Implemented | Four 2 KiB CHR-window/geometry tests; no conformance ROM       |
| 78     | Irem 74HC161   | Implemented | Both mirroring wirings/conflict tests; no conformance ROM      |
| 79     | NINA-03/06     | Implemented | Expansion decode/PRG/CHR/geometry tests; no conformance ROM    |
| 80     | Taito X1-005   | Implemented | PRG/CHR/mirrored-register/internal-RAM tests; no fixture       |
| 82     | Taito X1-017   | Implemented | Banking/RAM/pull-down/cycle-IRQ tests; no conformance ROM      |
| 87     | Jaleco CHR     | Implemented | CHR-bit-swap unit tests; no conformance ROM                    |
| 88     | Namco 3433     | Implemented | Split-64 KiB CHR wiring tests; no conformance ROM              |
| 89     | Sunsoft-2      | Implemented | PRG/CHR/conflict/mirroring tests; no conformance ROM           |
| 91     | JY/EJ bootleg  | Implemented | Outer-bank/A12/M2/submapper/state tests; no conformance ROM    |
| 93     | Sunsoft-3R     | Implemented | PRG/CHR-enable/open-bus/conflict tests; no conformance ROM     |
| 94     | UN1ROM         | Implemented | Shifted banking/conflict/geometry tests; no conformance ROM    |
| 95     | Namco 3425     | Implemented | CHR/CIRAM-coupling/geometry tests; no conformance ROM          |
| 97     | Irem TAM-S1    | Implemented | Inverted PRG/mirroring/CHR-RAM tests; no conformance ROM       |
| 118    | TxSROM         | Implemented | CIRAM banking/IRQ/geometry tests; no conformance ROM           |
| 119    | TQROM          | Implemented | Mixed CHR ROM/RAM/IRQ/geometry tests; no conformance ROM       |
| 140    | Jaleco JF      | Implemented | PRG/CHR/register/open-bus/geometry tests; no conformance ROM   |
| 152    | Bandai 74xx    | Implemented | PRG/CHR/mirroring unit tests; no conformance ROM               |
| 180    | Inverted UxROM | Implemented | Fixed-first/banking/conflict tests; no conformance ROM         |
| 184    | Sunsoft-1      | Implemented | CHR wiring/open-bus/geometry tests; no conformance ROM         |
| 185    | CNROM protect  | Implemented | NES 2.0 variants/open-bus/conflict tests; no conformance ROM   |
| 206    | Namco 118      | Implemented | PRG/CHR bank unit tests; no conformance ROM                    |

The core accepts both iNES and a constrained NES 2.0 subset; see
[cartridge-formats.md](./cartridge-formats.md). Detailed per-board behavior lives in
[mappers/README.md](./mappers/README.md). Mapper
0/4/9/10/11/13/18/33/64/65/66/68/69/70/75/76/79/80/82/87/88/89/93/94/95/97/118/119/140/152/184/206 currently
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

## Legacy-header assumptions

- Mapper 3 follows original CNROM AND-type bus conflicts. NES 2.0 submapper 1 (no conflicts) and
  submapper 2 (explicit AND conflicts) override that legacy default when encoded explicitly.
- Mapper 2 retains the generic iNES full-byte/no-conflict convention. Original UNROM/UOROM conflict
  behavior is selected with NES 2.0 submapper 2 without breaking compatible legacy images.
- Mapper 7 follows the default iNES no-conflict behavior required by ANROM software. AMROM/AOROM
  conflict behavior is selected with NES 2.0 submapper 2; the common emulator 512 KiB bit-3
  extension is implemented and covered by focused tests. NES 2.0 PRG-RAM declarations are rejected
  because AxROM has no PRG-RAM window. Historical BNTest execution is not treated as current
  `Verified` evidence until its fixture identity and runner are pinned.
- NES 2.0 PRG-RAM declarations are also rejected for mappers
  9/11/13/32/33/64/66/70/71/75/76/78/79/87/88/89/91/93/94/95/97/119/140/152/180/184/185/206 because those
  selected boards do not decode a writable `$6000-$7FFF` window. Legacy iNES's implicit 8 KiB
  allocation remains a parser-compatibility detail but is not exposed by these mappers.
- Mapper 1 resolves standard, SUROM, SOROM, SXROM and SZROM wiring from memory geometry. Its CHR
  outputs select outer PRG ROM and 8 KiB PRG-RAM banks; mixed volatile/battery banks retain only the
  NVRAM bytes. SNROM additionally wires CHR A16 as a redundant WRAM disable, while submapper 5
  hardwires the two 16 KiB PRG halves. Its serial port observes adjacent CPU R/W cycles, ignores an
  RMW instruction's second D0 write and still accepts a second-cycle D7 reset. MMC1A/mapper 155 and
  2ME EEPROM remain explicit variants.
- Mapper 3 mirrors an explicitly declared 2 KiB PRG RAM through `$6000-$7FFF`. Mapper 185 copy
  protection remains a separate board implementation, and Family Trainer speech hardware remains
  out of scope.
- Mapper 4 implements the MMC3 `$A001` PRG-RAM enable and write-protect bits. MMC6 remains excluded
  by its NES 2.0 submapper and different split protection scheme.
- Mapper 34 never combines its unrelated register sets. Legacy CHR ROM above 8 KiB selects
  NINA-001; CHR RAM or at most 8 KiB CHR ROM selects BNROM. NINA-001 maps its `$7FFD-$7FFF`
  registers over 8 KiB PRG RAM. BNROM applies original-board AND bus conflicts; NES 2.0 submapper 2
  may also expose a directly declared 8 KiB Union Bond PRG-RAM window.
- Mapper 9 (MMC2) switches the `$8000-$9FFF` 8 KiB bank and fixes the final three 8 KiB banks. Its
  two CHR latches drive four 4 KiB banks; the left latch flips only on the exact `$0FD8`/`$0FE8`
  fetches while the right latch flips across `$1FD8-$1FDF` and `$1FE8-$1FEF`. `$F000` bit 0 selects
  vertical/horizontal mirroring. PxROM has no PRG-RAM window. The PPU reports full background and
  sprite fetch addresses, and the latch commits after the triggering byte is returned.
- Mapper 10 (MMC4) shares the MMC2 CHR latch banks but flips both latches across the full
  `$xFD8-$xFDF`/`$xFE8-$xFEF` ranges, switches a 16 KiB `$8000-$BFFF` bank with `$C000-$FFFF` fixed,
  and adds an 8 KiB PRG-RAM window at `$6000-$7FFF`.
- Mapper 11 (Color Dreams) and mapper 66 (GxROM/MHROM) each latch one register with documented
  AND-type bus conflicts. Color Dreams takes PRG from bits 1-0 and CHR from bits 7-4; GxROM takes
  PRG from bits 5-4 and CHR from bits 1-0. The no-conflict Color Dreams prototype board is out of
  scope.
- Mapper 13 (CPROM) fixes 32 KiB PRG and splits 16 KiB CHR RAM into a fixed `$0000-$0FFF` bank 0 and
  a bits 1-0 switchable `$1000-$1FFF` bank, with AND-type bus conflicts. Legacy iNES cannot declare
  the implied 16 KiB CHR RAM, so CPROM images require an NES 2.0 header.
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
- Mapper 32 (Irem G-101) exposes two switchable 8 KiB PRG banks, two fixed tail banks and eight
  1 KiB CHR-ROM banks. Register bit 1 swaps the first switchable and second-to-last fixed PRG
  windows; bit 0 selects horizontal/vertical mirroring. NES 2.0 submapper 1 instead identifies Major
  League's fixed-upper one-screen board and disabled `$9000` register; legacy iNES cannot
  distinguish that wiring without a title database.
- Mapper 33 (Taito TC0190) has two switchable 8 KiB PRG banks followed by the final two fixed banks,
  two 2 KiB and four 1 KiB CHR-ROM windows, and bit-6 horizontal/vertical mirroring. Its 2 KiB CHR
  register values are offsets in 2 KiB units rather than MMC3-style even 1 KiB indexes. Mapper 48
  dumps mislabeled as 33 remain out of scope because mapper 33 has no IRQ.
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
  single-screen mirroring; submapper 0 keeps the header's fixed mirroring.
- Mapper 75 (Konami VRC1) exposes three switchable 8 KiB PRG banks followed by the fixed final bank,
  plus two 4 KiB CHR banks whose fifth select bits share the horizontal/vertical mirroring register.
  Four-screen cartridges ignore that mirroring output; the ASIC has no IRQ, PRG RAM or bus
  conflicts.
- Mapper 76 rewires the Namco 108 family to four 2 KiB CHR-ROM windows selected through R2-R5;
  R0/R1 are inaccessible. Its two switchable and two fixed 8 KiB PRG windows remain unchanged, with
  no IRQ, PRG RAM, mirroring register or bus conflicts.
- Mapper 78 combines UNROM-style 16 KiB PRG and CNROM-style 8 KiB CHR switching with AND bus
  conflicts. Register bit 3 selects lower/upper one-screen mirroring on Cosmo Carrier hardware but
  horizontal/vertical mirroring on Holy Diver hardware. Legacy iNES uses the historical
  alternative-nametable flag to distinguish those wirings; NES 2.0 uses submapper 1 or 3.
- Mapper 68 (Sunsoft-4) exposes four 2 KiB CHR banks, one switchable and one fixed 16 KiB PRG bank,
  four-way mirroring and an enabled 8 KiB PRG-RAM window. It can replace either mirrored nametable
  page with one of the final 128 1 KiB CHR-ROM banks; writes to ROM-backed nametables are ignored.
  The dual-cartridge/licensing-timer submapper remains rejected because its external option ROM
  cannot be represented by the accepted cartridge format.
- Mapper 79 (AVE NINA-03/NINA-06) decodes its latch only at `$4100-$5FFF` addresses matching
  `(address & $E100) == $4100`. D3 selects one of two 32 KiB PRG banks and D2-D0 select one of eight
  8 KiB CHR-ROM banks; mirroring is hardwired and there are no conflicts, IRQs or PRG RAM.
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
- Mapper 69 (Sunsoft FME-7) commits a `$8000-$9FFF` command register with a following `$A000-$BFFF`
  parameter write: eight 1 KiB CHR banks, a `$6000-$7FFF` window that selects PRG ROM or enabled PRG
  RAM through bits 6-7, three 8 KiB PRG banks with `$E000` fixed, four-way mirroring, and a 16-bit IRQ
  counter decremented every CPU cycle that asserts on the `$0000`→`$FFFF` wrap. The Sunsoft 5B
  expansion audio at `$C000-$FFFF` is not emulated, so the audio submapper stays out of scope.
- Mappers 70 and 152 share the Bandai 74\*161/32 latch: a 16 KiB `$8000-$BFFF` bank with `$C000-$FFFF`
  fixed, an 8 KiB CHR bank and AND-type bus conflicts. Mapper 152 spends bit 7 on single-screen
  mirroring, leaving a 3-bit PRG field; mapper 70 keeps mirroring hardwired and uses four PRG bits.
- Mapper 87 (Jaleco/Konami) latches an 8 KiB CHR bank at `$6000-$7FFF` with its two select lines
  reversed (value bit 1 drives CHR line 0, value bit 0 drives CHR line 1); PRG ROM stays NROM-fixed
  and there are no bus conflicts.
- Mapper 88 retains Namco 108 banking but connects PPU A12 directly to CHR A16, forcing the left and
  right pattern tables into separate 64 KiB halves of 128 KiB CHR ROM. Smaller ROM naturally mirrors
  the absent line.
- Mapper 89 (Sunsoft-2 on Sunsoft-3) uses one AND-conflicted `$8000-$FFFF` latch for a switchable
  16 KiB PRG bank, split-field 8 KiB CHR bank and lower/upper one-screen mirroring. The final 16 KiB
  PRG bank is fixed and no PRG RAM is decoded.
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
- Mapper 97 (Irem TAM-S1) fixes the final 16 KiB PRG bank at `$8000-$BFFF`, selects one of sixteen
  banks at `$C000-$FFFF` through D3-D0, and uses D7-D6 for lower one-screen, horizontal, vertical or
  upper one-screen mirroring. Its only known board carries 256 KiB PRG ROM and 8 KiB CHR RAM.
- Mapper 118 (TxSROM) keeps full MMC3 banking and filtered-A12 IRQs but connects CHR A17 to CIRAM
  A10. R0/R1 or R2-R5 control nametable slots according to CHR mode, and `$A000` mirroring writes are
  physically disconnected.
- Mapper 119 (TQROM) keeps standard MMC3 mirroring and IRQs while CHR bank bit 6 selects between
  16–64 KiB CHR ROM and eight 1 KiB banks of volatile CHR RAM. Official boards have 128 KiB PRG ROM
  and no PRG RAM. Legacy iNES implies the otherwise-unrepresentable 8 KiB CHR RAM; NES 2.0 declares
  it explicitly.
- Mapper 140 (Jaleco JF-11/JF-14) maps a write-only `$6000-$7FFF` latch: bits 5-4 select a 32 KiB
  PRG bank and bits 3-0 select an 8 KiB CHR-ROM bank. The window has no bus conflicts and reads are
  open bus rather than a fabricated zero.
- Mapper 180 uses the opposite UxROM window arrangement: the first 16 KiB PRG bank is fixed at
  `$8000-$BFFF`, while `$C000-$FFFF` is switchable. Legacy images use original UNROM AND conflicts;
  NES 2.0 submapper 1 disables them and submapper 2 makes them explicit.
- Mapper 184 (Sunsoft-1) fixes 32 KiB PRG and selects two 4 KiB CHR-ROM windows through a write-only
  `$6000-$7FFF` latch. Bits 2-0 select the lower bank; bits 5-4 select the upper bank with CHR A14
  hard-wired high. Its 16 KiB and 32 KiB CHR layouts are both modeled explicitly.
- Mapper 185 keeps CNROM's fixed 16/32 KiB PRG and AND-conflicted two-bit latch but uses the latch as
  CHR-ROM chip select. NES 2.0 submappers 4-7 name enable values 0-3. Any other value tri-states the
  PPU data pins, whose undriven read follows the address low byte; unknown legacy wiring is rejected.
- Mapper 206 (Namco 118 / DxROM) is the discrete predecessor to MMC3. It reuses the `$8000`/`$8001`
  bank-select and bank-data ports for two 2 KiB plus four 1 KiB CHR windows and two 8 KiB PRG banks
  with the final two banks fixed. It has no IRQ, no PRG-RAM and no mirroring register, so mirroring
  stays hardwired from the header. MMC3-family supersets that add those features remain separate.

The finite mapper-completion track and its still-planned families are recorded in
[Engineering roadmap](./engineering-roadmap.md). Numbers outside that boundary remain unsupported
unless the roadmap is changed explicitly; no unknown mapper is silently approximated.

Before changing a status to `Verified`, verify header parsing, bank boundaries, mirroring, writable
memory, reset behavior and IRQ semantics where applicable, then record executable external evidence.
Submapper and board variants must remain explicit rather than being silently approximated by the
base mapper number.

Historical local runs without a recorded fixture checksum remain useful engineering notes but do not
satisfy the current `Verified` definition. See [Testing](./testing.md) for evidence and baseline
rules.
