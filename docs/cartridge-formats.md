# Cartridge format support

Header support is intentionally narrower than header decoding. `CartridgeHeader` decodes the iNES
and NES 2.0 fields needed to make a safe decision; `Cartridge` accepts only layouts the current
hardware model can represent correctly. Unsupported metadata or board geometry fails before
execution.

## Accepted formats

| Capability          | iNES                                              | NES 2.0                                  |
| ------------------- | ------------------------------------------------- | ---------------------------------------- |
| Mapper identity     | 8-bit legacy mapper                               | 12-bit mapper plus 4-bit submapper       |
| PRG/CHR ROM size    | Linear bank counts                                | Linear and exponent-multiplier encodings |
| Timing              | NTSC or PAL                                       | NTSC, PAL, multi-region or Dendy         |
| Console             | Standard NES/Famicom                              | Standard NES/Famicom                     |
| PRG writable memory | Direct or board-implied internal memory           | Direct, MMC1-banked or board-implied     |
| CHR writable memory | Implicit 8 KiB without CHR ROM; TQROM RAM implied | Explicit CHR RAM or CHR NVRAM            |
| Trainer             | Default `$7000`; mapper-owned loader exceptions   | Default plus mapper/submapper exceptions |
| Miscellaneous ROMs  | Not encoded                                       | None                                     |
| Default expansion   | Legacy/default                                    | Unspecified or standard controllers      |

The battery flag must agree with all NES 2.0 NVRAM metadata. Volatile bytes never enter a save
snapshot. An 8 KiB CHR NVRAM region is supported when it is the cartridge's only CHR memory.
MMC1 SOROM/SZROM may combine one 8 KiB volatile PRG region with one 8 KiB battery region; SUROM,
SOROM, SXROM and SZROM bank selection follows the board wiring rather than concatenating capacities
into the direct `$6000-$7FFF` window. Two implemented ASICs define mixed CHR explicitly: mapper 119
TQROM selects 16–64 KiB CHR ROM or 8 KiB volatile CHR RAM per 1 KiB bank, while mapper 19 Namco 163
uses `$00-$DF` for ROM and `$E0-$FF` for up to 32 KiB RAM when CIRAM substitution is disabled.
Other simultaneous CHR RAM/NVRAM, CHR ROM plus writable CHR memory, and mapper-internal battery
memory remain rejected unless an implemented ASIC defines the exact capacity and protection rules.

Taito X1 memory is a deliberate board-derived exception to the header's power-of-two units.
Mapper 80 normalizes legacy iNES's generic 8 KiB RAM implication to the X1-005's 128 internal bytes;
the battery flag decides whether those bytes are volatile or persistent. NES 2.0 mapper 80 must
declare the exact 128 bytes. Mapper 82 always normalizes to the X1-017's physical 5 KiB NVRAM,
because neither header format can encode that capacity exactly; mapper creation additionally
requires the battery flag.

Mapper 6/8/17 images are extracted FFE copier-card memory, so their PRG/CHR payload initializes
mutable board RAM and their work RAM is normalized to the physical 32 KiB volatile capacity.
Battery declarations are rejected. Their optional trainer is a loader entry rather than passive
generic initialization: mapper 6/8 loads `$7000-$71FF`, cold-calls `$7003` and returns to the reset
vector; mapper 17 submappers 0-3 load and cold-jump to `$7000`, `$5D00`, `$5E00` or `$5F00`.

Mapper 19 derives the Namco 163 ASIC's 128-byte shared RAM independently from header PRG/CHR
fields. The battery flag makes those bytes persistent even when the NES 2.0 PRG NVRAM field is
zero. Optional external memory is absent or exactly 8 KiB; NES 2.0 must declare it as volatile PRG
RAM without a battery or PRG NVRAM with one. Legacy iNES retains the conventional implicit 8 KiB
external allocation because it cannot describe absence. Submapper 1 requires battery-backed
internal RAM and no external WRAM; submappers 1/2 omit audio mixing, while 3/4/5 name the published
N163 mix levels.

The address-latch multicarts use board-exact geometry rather than arbitrary modulo banking. Mapper
15 is 1 MiB PRG plus 8 KiB volatile CHR RAM. Mapper 225 accepts matched 1 MiB/512 KiB or 2 MiB/1 MiB
PRG/CHR ROM pairs. Mapper 227 is 1 MiB PRG plus 8 KiB volatile CHR RAM; only submapper 0 may also
declare 8 KiB PRG NVRAM. Mapper 228 accepts 512 KiB or the NES 2.0/iNES-representable 1.5 MiB PRG
layout plus exactly 512 KiB CHR ROM.

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
Mapper 6 NES 2.0 submappers 0-7 select the initial Magic Card latch mode; legacy mapper 6 means mode
1, while mapper 8 is its mode-4 synonym and accepts submapper 0. Mapper 17 accepts submappers 0-3
solely for the trainer relocation described above. Mappers 15/225/228 accept submapper 0 only.
Mapper 227 accepts submapper 0 (RPG/optional NVRAM), submapper 1 (protected multicart/solder-pad
reads), and submapper 2 (protected multicart/outer-bank reset rule).

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
- Mapper-internal EEPROM/battery memory outside the explicit Bandai FCG, Taito X1-005/X1-017 and
  Namco 163 policies.
- Simultaneous CHR ROM and writable CHR memory outside Namco 163/TQROM, or simultaneous CHR RAM and
  CHR NVRAM.
- Unknown submappers and geometries with unreachable declared memory.

This list is a policy boundary, not a parser limitation.
