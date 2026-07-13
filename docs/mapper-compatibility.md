# Mapper compatibility

Mapper support is tracked by board behavior and evidence, rather than by a claim that a title list is
complete. The historical [TuxNES mapper list](http://tuxnes.sourceforge.net/nesmapper.txt) is useful
for discovering compatibility targets; its own introduction warns that the catalog is incomplete
and that mirroring values may be unreliable.

| Mapper | Board family   | Status    | Current evidence                                 |
| ------ | -------------- | --------- | ------------------------------------------------ |
| 0      | NROM           | Supported | Unit tests; `MARIO.NES` 300-frame smoke          |
| 1      | MMC1/SxROM     | Supported | Board tests; Holy Mapperel SK/SG/SN/SU/SX 5/5    |
| 2      | UxROM/UNROM    | Supported | Unit tests; `CONTRA.NES` 300-frame smoke         |
| 3      | CNROM          | Supported | PRG/CHR/conflict/oversize tests; facade smoke    |
| 4      | MMC3           | Supported | Unit tests; blargg `mmc3_test_2` tests 1-5       |
| 7      | AxROM          | Supported | Unit tests; CC0 BNTest banks and nametables pass |
| 34     | BNROM/NINA-001 | Supported | Board tests; Holy Mapperel BNROM result `0000`   |

The core accepts both iNES and a constrained NES 2.0 subset; see
[cartridge-formats.md](./cartridge-formats.md). Mapper 0/4 currently accept only submapper 0.
Mapper 1 accepts submapper 0, deprecated geometry-qualified SUROM/SOROM/SXROM identifiers 1/2/4,
and fixed-PRG SEROM/SHROM/SH1ROM submapper 5. Mapper 2/3/7 accept submapper 0 plus the NES 2.0
bus-conflict variants below. Mapper 34 accepts submapper 0 through a single-board CHR-geometry
decision, submapper 1 as NINA-001 and submapper 2 as BNROM.

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

New mapper families are intentionally outside the current scope. Coverage work is limited to the
listed board families and does not silently approximate unsupported mapper numbers.

Before changing a status to supported, verify header parsing, bank boundaries, mirroring, writable
memory, reset behavior and IRQ semantics where applicable. Submapper and board variants must remain
explicit rather than being silently approximated by the base mapper number.
