# Cartridge format support

Header support is intentionally narrower than header decoding. `CartridgeHeader` decodes the iNES
and NES 2.0 fields needed to make a safe decision; `Cartridge` accepts only layouts the current
hardware model can represent correctly. Unsupported metadata or board geometry fails before
execution.

## Accepted formats

| Capability          | iNES                                  | NES 2.0                                   |
| ------------------- | ------------------------------------- | ----------------------------------------- |
| Mapper identity     | 8-bit legacy mapper                   | 12-bit mapper plus 4-bit submapper        |
| PRG/CHR ROM size    | Linear bank counts                    | Linear and exponent-multiplier encodings  |
| Timing              | NTSC or PAL                           | NTSC, PAL, multi-region or Dendy          |
| Console             | Standard NES/Famicom                  | Standard NES/Famicom                      |
| PRG writable memory | Legacy direct window                  | Direct memory, or mapper-aware MMC1 banks |
| CHR writable memory | Implicit 8 KiB when CHR ROM is absent | Explicit 8 KiB CHR RAM or CHR NVRAM       |
| Trainer             | Loaded at CPU `$7000-$71FF`           | Loaded at CPU `$7000-$71FF`               |
| Miscellaneous ROMs  | Not encoded                           | None                                      |
| Default expansion   | Legacy/default                        | Unspecified or standard controllers       |

The battery flag must agree with all NES 2.0 NVRAM metadata. Volatile bytes never enter a save
snapshot. An 8 KiB CHR NVRAM region is supported when it is the cartridge's only CHR memory.
MMC1 SOROM/SZROM may combine one 8 KiB volatile PRG region with one 8 KiB battery region; SUROM,
SOROM, SXROM and SZROM bank selection follows the board wiring rather than concatenating capacities
into the direct `$6000-$7FFF` window. Simultaneous CHR RAM/NVRAM, CHR ROM plus writable CHR memory,
and mapper-internal battery memory remain rejected because their selection rules are different.

These rules follow the NES 2.0 distinction between volatile/non-volatile PRG and CHR fields and the
documented [MMC1 board wiring](https://www.nesdev.org/wiki/MMC1). Declared capacity is accepted only
when the selected mapper can address every byte.

NTSC, PAL and Dendy select distinct CPU/PPU/APU clock domains. A multi-region image currently uses
NTSC as a deterministic default in Workbench `auto` mode. The Workbench can explicitly select NTSC,
PAL or Dendy without mutating cartridge metadata; changing it rebuilds the runtime while preserving
battery-backed RAM and the paused/running lifecycle. Core callers and the conformance runner can
also supply an explicit region override for legacy test or homebrew images. VS System and
PlayChoice-10 images remain rejected because their console behavior is not modeled.

All ordinary CPU instruction families execute through a unified cycle state. Addressing, dummy
reads, stack/control flow and RMW read/write-old/write-new operations are explicit bus cycles;
IRQ/NMI/BRK retain a dedicated entry state. The bus maintains separate committed-read and projected
I/O-write APU watermarks, while sprite and DMC DMA share a halt/dummy/alignment/GET/PUT arbiter.
`cpu_interrupts_v2` passes 5/5, PAL APU passes 10/10, and the exact DMC `$2007`/`$4016` collision ROMs
produce their allowed outputs.

## Mapper variants and board shape

Mapper creation validates the ROM/RAM bank geometry required by that implementation. NES 2.0
submapper 0 selects the base/unspecified behavior. Mapper 1 also accepts deprecated submappers 1
(SUROM), 2 (SOROM) and 4 (SXROM) only when the declared geometry proves that board, plus submapper 5
for fixed-PRG SEROM/SHROM/SH1ROM. For Mapper 2, 3 and 7, submapper 1 selects no bus conflicts and
submapper 2 selects AND-type bus conflicts. Other submappers are rejected. Mapper 0 and 4 currently
accept only submapper 0. Mapper 34 submapper 1 selects NINA-001 and submapper 2 selects BNROM;
submapper 0 chooses exactly one board from CHR geometry instead of exposing both register sets.

This policy keeps parser completeness separate from emulation claims: understanding a header field
does not imply that the corresponding hardware is silently approximated.
