# Mapper compatibility

Mapper support is tracked by board behavior and evidence, rather than by a claim that a title list is
complete. The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is useful
for discovering compatibility targets; its own introduction warns that the catalog is incomplete
and that mirroring values may be unreliable.

`Implemented` means the board contract, geometry and focused tests exist. `Verified` additionally
requires executable external or pinned real-ROM evidence. Both statuses are loadable; the distinction
describes evidence maturity rather than a runtime feature flag.

| Mapper | Board family   | Status      | Current evidence                                              |
| ------ | -------------- | ----------- | ------------------------------------------------------------- |
| 0      | NROM           | Verified    | Unit tests; pinned `MARIO.NES` real-ROM runner                |
| 1      | MMC1/SxROM     | Verified    | Board tests; Holy Mapperel SK/SG/SN/SU/SX 5/5                 |
| 2      | UxROM/UNROM    | Verified    | Unit tests; pinned `CONTRA.NES` real-ROM runner               |
| 3      | CNROM          | Implemented | PRG/CHR/conflict/oversize tests; facade smoke                 |
| 4      | MMC3           | Implemented | A12/IRQ tests; real PPU dot-260 integration; fixture unpinned |
| 7      | AxROM          | Implemented | Banking/mirroring/conflict tests; BNTest fixture unpinned     |
| 9      | MMC2/PxROM     | Implemented | Unit tests; full-address sprite/read-order integration tests  |
| 10     | MMC4/FxROM     | Implemented | PRG/RAM/latch/mirroring tests; no conformance ROM             |
| 11     | Color Dreams   | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM           |
| 13     | CPROM          | Implemented | CHR-RAM banking/conflict unit tests; no conformance ROM       |
| 34     | BNROM/NINA-001 | Verified    | Board tests; Holy Mapperel BNROM result `0000`                |
| 66     | GxROM/MHROM    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM           |
| 69     | Sunsoft FME-7  | Implemented | Banking/mirroring/IRQ unit tests; no 5B audio                 |
| 70     | Bandai 74xx    | Implemented | PRG/CHR/bus-conflict unit tests; no conformance ROM           |
| 71     | Codemasters    | Implemented | PRG/mirroring unit tests; no conformance ROM                  |
| 87     | Jaleco CHR     | Implemented | CHR-bit-swap unit tests; no conformance ROM                   |
| 152    | Bandai 74xx    | Implemented | PRG/CHR/mirroring unit tests; no conformance ROM              |
| 206    | Namco 118      | Implemented | PRG/CHR bank unit tests; no conformance ROM                   |

The core accepts both iNES and a constrained NES 2.0 subset; see
[cartridge-formats.md](./cartridge-formats.md). Detailed per-board behavior lives in
[mappers/README.md](./mappers/README.md). Mapper 0/4/9/10/11/13/66/69/70/87/152/206 currently accept
only submapper 0. Mapper 1 accepts submapper 0, deprecated geometry-qualified SUROM/SOROM/SXROM
identifiers 1/2/4, and fixed-PRG SEROM/SHROM/SH1ROM submapper 5. Mapper 2/3/7 accept submapper 0
plus the NES 2.0 bus-conflict variants below. Mapper 34 accepts submapper 0 through a single-board
CHR-geometry decision, submapper 1 as NINA-001 and submapper 2 as BNROM. Mapper 71 accepts
submapper 0 (fixed-mirroring BF9093) and submapper 1 (single-screen-controlled BF9097).

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
- NES 2.0 PRG-RAM declarations are also rejected for mappers 9/11/13/66/70/71/87/152/206 because
  those selected boards do not decode a writable `$6000-$7FFF` window. Legacy iNES's implicit 8 KiB
  allocation remains a parser-compatibility detail but is not exposed by these mappers.
- Mapper 1 resolves standard, SUROM, SOROM, SXROM and SZROM wiring from memory geometry. Its CHR
  outputs select outer PRG ROM and 8 KiB PRG-RAM banks; mixed volatile/battery banks retain only the
  NVRAM bytes. SNROM additionally wires CHR A16 as a redundant WRAM disable, while submapper 5
  hardwires the two 16 KiB PRG halves. Its serial port observes adjacent CPU R/W cycles, ignores an
  RMW instruction's second D0 write and still accepts a second-cycle D7 reset. MMC1A/mapper 155 and
  2ME EEPROM remain explicit variants.
- Mapper 3 mirrors an explicitly declared 2 KiB PRG RAM through `$6000-$7FFF`. Mapper 185 copy
  protection and Family Trainer speech hardware remain separate variants.
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
- Mapper 71 (Codemasters/Camerica) switches a 16 KiB `$8000-$BFFF` bank from `$C000-$FFFF` with the
  last bank fixed and no bus conflicts. The BF9097 variant (submapper 1) adds `$9000-$9FFF` bit 4
  single-screen mirroring; submapper 0 keeps the header's fixed mirroring.
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
- Mapper 206 (Namco 118 / DxROM) is the discrete predecessor to MMC3. It reuses the `$8000`/`$8001`
  bank-select and bank-data ports for two 2 KiB plus four 1 KiB CHR windows and two 8 KiB PRG banks
  with the final two banks fixed. It has no IRQ, no PRG-RAM and no mirroring register, so mirroring
  stays hardwired from the header. MMC3-family supersets that add those features remain separate.

New mapper families are intentionally outside the current scope. Coverage work is limited to the
listed board families and does not silently approximate unsupported mapper numbers.

Before changing a status to `Verified`, verify header parsing, bank boundaries, mirroring, writable
memory, reset behavior and IRQ semantics where applicable, then record executable external evidence.
Submapper and board variants must remain explicit rather than being silently approximated by the
base mapper number.

Historical local runs without a recorded fixture checksum remain useful engineering notes but do not
satisfy the current `Verified` definition. See [Testing](./testing.md) for evidence and baseline
rules.
