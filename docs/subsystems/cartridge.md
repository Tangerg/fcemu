# Cartridge subsystem

The Cartridge subsystem turns a raw ROM image (`ArrayBuffer`) into an immutable-metadata aggregate
that owns program/character ROM, the four physically distinct writable memory regions, and the
board-identifying facts a mapper needs. Parsing, policy, and memory are deliberately separated:
`parseCartridgeHeader` interprets iNES/NES 2.0 header bytes into a frozen `CartridgeHeader`, the
`Cartridge` aggregate applies the core's supported-format policy (rejecting layouts it cannot
represent with `CartridgeFormatError`), and `CartridgeMemory` owns all mutable RAM/NVRAM behind
logical address spaces that never expose their backing arrays. Mapper selection consumes this
aggregate but lives elsewhere (see [mapper docs](../mappers/README.md)); the accepted-format policy
is stated in [cartridge format support](../cartridge-formats.md) and only summarized here.

## From ROM image to aggregate

`Cartridge.fromArrayBuffer(arrayBuffer, sourceName = "ROM")`
(`packages/fc-emu/src/domain/model/cartridge.ts`) is the only constructor path; the class
constructor is private. It runs a fixed pipeline:

1. `parseCartridgeHeader(arrayBuffer, sourceName)` decodes the 16-byte header.
2. `Cartridge.validateSupportedHeader(header, sourceName)` enforces the supported-format policy.
3. The image body is sliced by declared sizes at increasing offsets starting at
   `CARTRIDGE_HEADER_SIZE` (16): optional 512-byte trainer, then PRG ROM, then CHR ROM. Each slice
   is bounds-checked against `arrayBuffer.byteLength` and raises a distinct incompleteness error if
   the file is truncated.
4. The private constructor allocates `CartridgeMemory` from the header's four RAM sizes, copies the
   trainer into PRG memory when present, and freezes the derived board facts.

Body layout and the errors raised when a region is truncated:

| Region  | Present when               | Size                           | Truncation error     |
| ------- | -------------------------- | ------------------------------ | -------------------- |
| Trainer | `header.hasTrainer`        | `CARTRIDGE_TRAINER_SIZE` (512) | `INCOMPLETE_TRAINER` |
| PRG ROM | always (size > 0 enforced) | `header.prgRomSize`            | `INCOMPLETE_PRG_ROM` |
| CHR ROM | `header.chrRomSize > 0`    | `header.chrRomSize`            | `INCOMPLETE_CHR_ROM` |

When present, the trainer is copied into PRG memory at `TRAINER_RAM_OFFSET` (`0x1000`) via
`memory.initializePrg`, i.e. offset `0x1000` inside the `$6000`-based PRG RAM window, matching the
CPU `$7000-$71FF` load address. CHR ROM absent leaves `chrRom` as a zero-length array, and CHR
accesses then fall through to writable CHR memory.

### Derived aggregate facts

The constructor exposes the following read-only fields (all `readonly` except `mirroringMode`, which
mappers may reassign at runtime): `format`, `mapperNumber`, `submapperNumber`, `timingMode`,
`mirroringMode`, `hasBatteryBackup`, `hasWritableChrMemory`, and the four RAM sizes
`prgRamBytes`/`prgNvRamBytes`/`chrRamBytes`/`chrNvRamBytes`. `hasBatteryBackup` is true when
`CartridgeMemory` holds any NVRAM; `hasWritableChrMemory` is true when the CHR address space is
non-empty.

## Header parsing

`parseCartridgeHeader` (`packages/fc-emu/src/domain/model/cartridge-header.ts`) returns a frozen
`CartridgeHeader`. It first requires at least `CARTRIDGE_HEADER_SIZE` bytes (`FILE_TOO_SMALL`) and a
valid `NES\x1A` signature in bytes 0–3 (`INVALID_SIGNATURE`). Format is NES 2.0 when
`(flags7 & 0x0C) === 0x08`, otherwise iNES. Fields common to both formats derive from flags bytes 6
and 7; the remaining fields diverge by format.

| Field                    | iNES derivation                                                                    | NES 2.0 derivation                            |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `format`                 | `"ines"`                                                                           | `"nes2"`                                      |
| `mapperNumber`           | `(flags6>>4) \| (flags7 & 0xF0)` (8-bit)                                           | above `\| ((byte8 & 0x0F) << 8)` (12-bit)     |
| `submapperNumber`        | `0`                                                                                | `byte8 >> 4`                                  |
| `mirroringMode`          | four-screen bit (`flags6 & 0x08`) wins; else `flags6 & 0x01` → Horizontal/Vertical | same                                          |
| `hasTrainer`             | `flags6 & 0x04`                                                                    | same                                          |
| `hasBatteryFlag`         | `flags6 & 0x02`                                                                    | same                                          |
| `consoleType`            | `flags7 & 0x03`                                                                    | same                                          |
| `prgRomSize` (bytes)     | `byte4 * 16384`                                                                    | `decodeRomSize(byte4, byte9 & 0x0F, 16384)`   |
| `chrRomSize` (bytes)     | `byte5 * 8192`                                                                     | `decodeRomSize(byte5, byte9 >> 4, 8192)`      |
| `prgRamSize` (bytes)     | `hasBatteryFlag ? 0 : legacy`                                                      | `decodeRamSize(byte10 & 0x0F)`                |
| `prgNvRamSize` (bytes)   | `hasBatteryFlag ? legacy : 0`                                                      | `decodeRamSize(byte10 >> 4)`                  |
| `chrRamSize` (bytes)     | `chrRomSize === 0 ? 8192 : 0`                                                      | `decodeRamSize(byte11 & 0x0F)`                |
| `chrNvRamSize` (bytes)   | `0`                                                                                | `decodeRamSize(byte11 >> 4)`                  |
| `timingMode`             | `byte9 & 1` (NTSC/PAL)                                                             | `byte12 & 0x03` (NTSC/PAL/multi-region/Dendy) |
| `miscellaneousRomCount`  | `0`                                                                                | `byte14 & 0x03`                               |
| `defaultExpansionDevice` | `0`                                                                                | `byte15 & 0x3F`                               |

`legacy` for iNES is `(byte8 || 1) * 8192`, so a zero PRG-RAM byte still yields one 8 KiB unit, and
the battery flag routes that entire legacy window to NVRAM rather than volatile RAM. iNES with no CHR
ROM implies exactly 8 KiB of volatile CHR RAM.

`mirroringMode` is a `NametableMirroring` enum (`Horizontal`, `Vertical`, `SingleScreenLower`,
`SingleScreenUpper`, `FourScreen`); the header only ever decodes Horizontal, Vertical, or FourScreen,
and mappers select the single-screen variants at runtime. `timingMode` is a `CartridgeTimingMode`
enum (`Ntsc`, `Pal`, `MultiRegion`, `Dendy`).

### ROM size encoding

`decodeRomSize(lsb, msb, linearUnit)` implements both NES 2.0 forms. When the MSB nibble is `0x0F`
the value is an exponent-multiplier: `2 ** (lsb >> 2) * (((lsb & 0x03) << 1) + 1)` bytes (a power-of-
two size times an odd multiplier). Otherwise it is linear: `((msb << 8) | lsb) * linearUnit`, where
`linearUnit` is 16384 for PRG and 8192 for CHR. iNES uses only the linear form with an 8-bit count.
A decoded size that is not a safe integer raises `ROM_SIZE_OUT_OF_RANGE`.

### RAM/NVRAM shift encoding

NES 2.0 sizes RAM and NVRAM through 4-bit shift fields. `decodeRamSize(shift)` returns `0` for shift
`0`, otherwise `64 << shift` bytes (64 bytes scaled by a power of two). PRG and CHR each carry a
volatile nibble (low) and a non-volatile nibble (high) in bytes 10 and 11 respectively.

## Supported-format validation

`Cartridge.validateSupportedHeader` and the body-slicing checks reject any image the current hardware
model cannot represent, always throwing `CartridgeFormatError`
(`packages/fc-emu/src/domain/model/cartridge-format-error.ts`). The error carries a discriminated
`code` (`CartridgeFormatErrorCode`), the `sourceName`, and a human-readable reason formatted as
`"<sourceName>" is not a valid NES ROM: <reason>`. This policy is intentionally narrower than the
parser; the rationale and the exact accepted matrix live in
[cartridge format support](../cartridge-formats.md).

| Rejected condition                                                        | Code                           | Origin                    |
| ------------------------------------------------------------------------- | ------------------------------ | ------------------------- |
| File shorter than 16 bytes                                                | `FILE_TOO_SMALL`               | parser                    |
| Missing/invalid `NES\x1A` signature                                       | `INVALID_SIGNATURE`            | parser                    |
| Decoded ROM size not a safe integer                                       | `ROM_SIZE_OUT_OF_RANGE`        | parser (`decodeRomSize`)  |
| Truncated trainer / PRG ROM / CHR ROM body                                | `INCOMPLETE_*`                 | `fromArrayBuffer`         |
| `prgRomSize === 0`                                                        | `MISSING_PRG_ROM`              | `validateSupportedHeader` |
| `consoleType !== 0` (VS System, PlayChoice-10, extended)                  | `UNSUPPORTED_CONSOLE_TYPE`     | `validateSupportedHeader` |
| `miscellaneousRomCount !== 0`                                             | `UNSUPPORTED_MISC_ROM`         | `validateSupportedHeader` |
| `defaultExpansionDevice > 1`                                              | `UNSUPPORTED_EXPANSION_DEVICE` | `validateSupportedHeader` |
| Combined PRG RAM + NVRAM > 32 KiB (`MAX_SUPPORTED_PRG_RAM_SIZE = 0x8000`) | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| NVRAM declared without the battery flag                                   | `INVALID_NES2_RAM_FLAGS`       | `validateSupportedHeader` |
| Battery flag set but no PRG/CHR NVRAM (mapper-internal battery memory)    | `UNSUPPORTED_BATTERY_MEMORY`   | `validateSupportedHeader` |
| No CHR ROM and no CHR RAM/NVRAM                                           | `MISSING_CHR_MEMORY`           | `validateSupportedHeader` |
| Simultaneous CHR RAM and CHR NVRAM                                        | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| CHR ROM together with any writable CHR memory                             | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| Trainer present with < 8 KiB combined PRG RAM window                      | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |

The console/expansion checks accept only standard NES/Famicom images (`consoleType === 0`) with an
unspecified or standard-controller default expansion device (`0` or `1`). The RAM checks keep the
battery flag and the NES 2.0 NVRAM nibbles mutually consistent, and confine writable CHR to exactly
one of ROM, volatile RAM, or NVRAM.

## Writable memory regions

`CartridgeMemory` (`packages/fc-emu/src/domain/model/cartridge-memory.ts`) owns four independent
`Uint8Array` regions sized from the header. It never returns a reference to a backing array; all
access goes through index-based accessors, and the frozen `layout` records the four sizes.

| Region           | Backing field | Volatile | In battery save | Cleared by `powerOn` | Logical space (order) |
| ---------------- | ------------- | -------- | --------------- | -------------------- | --------------------- |
| Volatile PRG RAM | `prgRam`      | yes      | no              | yes                  | PRG (first)           |
| PRG NVRAM        | `prgNvRam`    | no       | yes             | no                   | PRG (after volatile)  |
| Volatile CHR RAM | `chrRam`      | yes      | no              | yes                  | CHR (first)           |
| CHR NVRAM        | `chrNvRam`    | no       | yes             | no                   | CHR (after volatile)  |

### Logical address spaces exposed to mappers

Each address space concatenates its volatile region first, then its non-volatile region. Mappers
address a single flat index per space; the memory object decides which physical region backs it. The
`Cartridge` aggregate delegates the public accessors:

- `readPrgRam(index)` / `writePrgRam(index, value)` map to `CartridgeMemory.readPrg`/`writePrg` over
  the combined PRG RAM + PRG NVRAM space.
- `readChr(index)` returns the CHR ROM byte when CHR ROM is present (read-only, `chrRom[index] ?? 0`);
  otherwise it reads the combined CHR RAM + CHR NVRAM space. `writeChr(index, value)` is a no-op when
  CHR ROM is present and otherwise writes the CHR memory space, so CHR ROM is never mutated.
- `prgWritableBytes` reports `prgAddressSpaceBytes` (PRG RAM + PRG NVRAM).
- `chrMemoryBytes` reports the CHR ROM length, or `chrAddressSpaceBytes` when there is no CHR ROM.

Reads clamp out of range: a negative index reads `0`, and an index past the non-volatile region reads
`0`. Writes drop negative and past-end indices; values are masked to a byte (`value & 0xFF`). The
volatile/non-volatile boundary in each space is the volatile region's `byteLength`.

`powerOn()` zero-fills only the volatile PRG and CHR regions, leaving both NVRAM regions and the save
revision intact, which models battery-backed retention across a power cycle.

## Battery save snapshot

`captureBatterySave()` (delegating to `CartridgeMemory.captureSave`) returns a
`CartridgeSaveSnapshot` — `{ revision, data }` — or `undefined` when the cartridge has no NVRAM. The
`data` array concatenates PRG NVRAM first, then CHR NVRAM, so an image with only PRG NVRAM produces a
byte-for-byte-compatible legacy save. The snapshot is a fresh copy; the internal regions are never
aliased into it.

The `revision` counter increments only when a write actually changes an NVRAM byte: volatile writes,
out-of-range writes, and writes that store the same byte already present do not advance it. Callers
therefore use `revision` to detect whether persisted battery memory has diverged from the last save.
`restoreBatterySave(data)` requires an existing battery region (throws otherwise), requires the exact
combined NVRAM size (throwing `RangeError` on mismatch), splits the payload back into PRG then CHR
NVRAM, and resets the save revision to `0`.

## Memory-state capture and restore

Full save states use `captureMemoryState()` / `restoreMemoryState(state)`, which round-trip all four
regions plus the save revision as a `CartridgeMemoryState`. Capture returns defensive `slice()`
copies of every region and the current `saveRevision`. Restore validates that each incoming region is
a `Uint8Array` of exactly the matching size and that `saveRevision` is a non-negative safe integer,
raising `RangeError` on any mismatch before copying anything, then writes each region in place and
adopts the stored revision. Unlike a battery save, this captures volatile RAM as well, so it can
resume an in-progress session exactly.

## ROM identity

`createRomIdentity(image)` (`packages/fc-emu/src/domain/model/rom-identity.ts`) computes a CRC-32
(reversed polynomial `0xEDB88320`) over the entire image and returns the string
`crc32:<8-hex-checksum>:<byteLength>`. It is documented as a stable, non-security identity: its role
is to key persisted data to a specific ROM image and to reject save states or battery saves that
belong to a different image (a compatibility guard, not an integrity or authenticity primitive). The
application layer embeds this string in the save-state envelope and refuses to restore a snapshot
whose `romIdentity` does not match. The SHA-256 content addressing referenced for browser IndexedDB
persistence is a UI-infrastructure concern outside `@fcemu/core`; the core identity primitive here is
CRC-32.

## Mapper selection (separate concern)

Choosing the concrete board (`createMapper`) and translating logical banks to physical ROM/RAM
offsets is a distinct subsystem that validates board-specific geometry after this aggregate is built.
It is documented separately in the [mapper reference](../mappers/README.md); individual mappers are
not covered here.

## Verification and known limits

Focused tests cover iNES/NES 2.0 field decoding, linear/exponent ROM sizes, RAM shifts, trainers,
truncation errors, region metadata, four physical writable regions, battery snapshots, save-state
validation and ROM identity. Mapper factory tests separately prove that parsed capacities are
reachable by the selected board.

The core CRC-32 identity is a compatibility key, not a cryptographic content address. The browser
adapter independently uses SHA-256 for IndexedDB identity. Unsupported console/expansion types,
ambiguous writable-memory layouts and mapper-internal EEPROM fail before execution; see
[Cartridge formats](../cartridge-formats.md).

## Source files

- `packages/fc-emu/src/domain/model/cartridge.ts` — `Cartridge` aggregate, `fromArrayBuffer`
  pipeline, supported-format policy, and public memory accessors.
- `packages/fc-emu/src/domain/model/cartridge-header.ts` — `parseCartridgeHeader`, `CartridgeHeader`,
  size/RAM decoders, `CartridgeFormat`, `CartridgeTimingMode`, `NametableMirroring`.
- `packages/fc-emu/src/domain/model/cartridge-memory.ts` — `CartridgeMemory`, the four regions,
  logical address spaces, battery snapshot, and memory-state capture/restore.
- `packages/fc-emu/src/domain/model/cartridge-format-error.ts` — `CartridgeFormatError` and
  `CartridgeFormatErrorCode`.
- `packages/fc-emu/src/domain/model/rom-identity.ts` — `createRomIdentity` CRC-32 identity string.
