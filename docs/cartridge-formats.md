# Cartridge format support

Header support is intentionally narrower than header decoding. `CartridgeHeader` decodes the iNES
and NES 2.0 fields needed to make a safe decision; `Cartridge` accepts only layouts the current
hardware model can represent correctly. Unsupported metadata or board geometry fails before
execution.

## Accepted formats

| Capability          | iNES                                              | NES 2.0                                   |
| ------------------- | ------------------------------------------------- | ----------------------------------------- |
| Mapper identity     | 8-bit legacy mapper                               | 12-bit mapper plus 4-bit submapper        |
| PRG/CHR ROM size    | Linear bank counts                                | Linear and exponent-multiplier encodings  |
| Timing              | NTSC or PAL                                       | NTSC, PAL, multi-region or Dendy          |
| Console             | Standard NES/Famicom                              | Standard NES/Famicom                      |
| PRG writable memory | Legacy direct window                              | Direct memory, or mapper-aware MMC1 banks |
| CHR writable memory | Implicit 8 KiB without CHR ROM; TQROM RAM implied | Explicit CHR RAM or CHR NVRAM             |
| Trainer             | Loaded at CPU `$7000-$71FF`                       | Loaded at CPU `$7000-$71FF`               |
| Miscellaneous ROMs  | Not encoded                                       | None                                      |
| Default expansion   | Legacy/default                                    | Unspecified or standard controllers       |

The battery flag must agree with all NES 2.0 NVRAM metadata. Volatile bytes never enter a save
snapshot. An 8 KiB CHR NVRAM region is supported when it is the cartridge's only CHR memory.
MMC1 SOROM/SZROM may combine one 8 KiB volatile PRG region with one 8 KiB battery region; SUROM,
SOROM, SXROM and SZROM bank selection follows the board wiring rather than concatenating capacities
into the direct `$6000-$7FFF` window. TQROM is the one supported mixed-CHR exception: mapper 119
selects 16–64 KiB CHR ROM or 8 KiB volatile CHR RAM per 1 KiB bank; legacy iNES implies that RAM and
NES 2.0 declares it. Other simultaneous CHR RAM/NVRAM, CHR ROM plus writable CHR memory, and
mapper-internal battery memory remain rejected because their selection rules are different.

These rules follow the NES 2.0 distinction between volatile/non-volatile PRG and CHR fields and the
documented [MMC1 board wiring](https://www.nesdev.org/wiki/MMC1). Declared capacity is accepted only
when the selected mapper can address every byte.

NTSC, PAL and Dendy select distinct CPU/PPU/APU clock domains. A multi-region image currently uses
NTSC as a deterministic default in Workbench `auto` mode. The Workbench can explicitly select NTSC,
PAL or Dendy without mutating cartridge metadata; changing it rebuilds the runtime while preserving
battery-backed RAM and the paused/running lifecycle. Core callers and the conformance runner can
also supply an explicit region override for legacy test or homebrew images. VS System and
PlayChoice-10 images remain rejected because their console behavior is not modeled.

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

## Failure behavior

Construction fails before execution when the image is malformed, truncated or outside the supported
hardware policy. `CartridgeFormatError` exposes a stable format-error code; mapper selection uses
`UnsupportedMapperError`, `UnsupportedMapperVariantError` or
`UnsupportedMapperConfigurationError`.

Callers should display the source name, error message and mapper/submapper metadata when available,
but should not retry an unsupported image under a guessed mapper or RAM size. Detailed format error
codes and body layout are documented in [Cartridge subsystem](./subsystems/cartridge.md).

## Explicitly unsupported

- VS System, PlayChoice-10 and extended console types.
- Miscellaneous ROM payloads and non-standard default expansion devices.
- Mapper-internal EEPROM/battery memory not represented by PRG/CHR NVRAM.
- Simultaneous CHR ROM and writable CHR memory outside TQROM, or simultaneous CHR RAM and CHR
  NVRAM.
- Unknown submappers and geometries with unreachable declared memory.

This list is a policy boundary, not a parser limitation.
