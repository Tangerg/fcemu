# Mapper compatibility

Mapper support is tracked by board behavior and evidence, rather than by a claim that a title list is
complete. The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is useful
for discovering compatibility targets; its own introduction warns that the catalog is incomplete
and that mirroring values may be unreliable.

| Mapper | Board family   | Status    | Current evidence                                    |
| ------ | -------------- | --------- | --------------------------------------------------- |
| 0      | NROM           | Supported | Unit tests; pinned `MARIO.NES` real-ROM runner      |
| 1      | MMC1/SxROM     | Supported | Board tests; Holy Mapperel SK/SG/SN/SU/SX 5/5       |
| 2      | UxROM/UNROM    | Supported | Unit tests; pinned `CONTRA.NES` real-ROM runner     |
| 3      | CNROM          | Supported | PRG/CHR/conflict/oversize tests; facade smoke       |
| 4      | MMC3           | Supported | Unit tests; blargg `mmc3_test_2` tests 1-5          |
| 7      | AxROM          | Supported | Unit tests; CC0 BNTest banks and nametables pass    |
| 9      | MMC2/PxROM     | Supported | PRG/latch/mirroring unit tests; no conformance ROM  |
| 10     | MMC4/FxROM     | Supported | PRG/RAM/latch/mirroring unit tests; no conf. ROM    |
| 11     | Color Dreams   | Supported | PRG/CHR/bus-conflict unit tests; no conformance ROM |
| 13     | CPROM          | Supported | CHR-RAM banking/conflict unit tests; no conf. ROM   |
| 34     | BNROM/NINA-001 | Supported | Board tests; Holy Mapperel BNROM result `0000`      |
| 66     | GxROM/MHROM    | Supported | PRG/CHR/bus-conflict unit tests; no conformance ROM |
| 71     | Codemasters    | Supported | PRG/mirroring unit tests; no conformance ROM        |

The core accepts both iNES and a constrained NES 2.0 subset; see
[cartridge-formats.md](./cartridge-formats.md). Mapper 0/4/9/10/11/13/66 currently accept only
submapper 0. Mapper 1 accepts submapper 0, deprecated geometry-qualified SUROM/SOROM/SXROM
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
  extension is supported and verified by BNTest. NES 2.0 PRG-RAM declarations are rejected because
  AxROM has no PRG-RAM window.
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
  vertical/horizontal mirroring.
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

New mapper families are intentionally outside the current scope. Coverage work is limited to the
listed board families and does not silently approximate unsupported mapper numbers.

Before changing a status to supported, verify header parsing, bank boundaries, mirroring, writable
memory, reset behavior and IRQ semantics where applicable. Submapper and board variants must remain
explicit rather than being silently approximated by the base mapper number.
