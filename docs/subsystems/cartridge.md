# Cartridge subsystem

The Cartridge subsystem turns a raw ROM image (`ArrayBuffer`) into an immutable-metadata aggregate
that owns program/character ROM, the four physically distinct writable memory regions, and the
board-identifying facts a mapper needs. Parsing, policy, and memory are deliberately separated:
`parseCartridgeHeader` interprets iNES/NES 2.0 header bytes into a frozen `CartridgeHeader`, the
content-addressed legacy-ROM lookup fills hardware facts that iNES could not encode, the `Cartridge`
aggregate applies the core's supported-format policy (rejecting layouts it cannot represent with
`CartridgeFormatError`), and `CartridgeMemory` owns all mutable RAM/NVRAM behind logical address
spaces that never expose their backing arrays. Mapper selection consumes this aggregate but lives
elsewhere (see [mapper docs](../mappers/README.md)); the accepted-format policy is stated in
[cartridge format support](../cartridge-formats.md) and only summarized here.

## From ROM image to aggregate

`Cartridge.fromArrayBuffer(arrayBuffer, sourceName = "ROM")`
(`packages/fc-emu/src/domain/model/cartridge.ts`) is the only constructor path; the class
constructor is private. It runs a fixed pipeline:

1. `parseCartridgeHeader(arrayBuffer, sourceName)` decodes the 16-byte header.
2. `Cartridge.validateSupportedHeader(header, sourceName)` rejects unsupported declared metadata
   before body extraction.
3. The image body is sliced by declared sizes at increasing offsets starting at
   `CARTRIDGE_HEADER_SIZE` (16): optional 512-byte trainer, then PRG ROM, then CHR ROM. Each slice
   is bounds-checked against `arrayBuffer.byteLength` and raises a distinct incompleteness error if
   the file is truncated.
4. `enrichLegacyRomMetadata` checks an exact console/mapper/size/PRG-CRC/CHR-CRC tuple for an iNES
   image. Known records may complete otherwise absent board facts; unknown payloads and every NES
   2.0 image remain untouched. A changed header is validated again before construction.
5. The private constructor allocates `CartridgeMemory` from the header's four RAM sizes, retains an
   immutable trainer copy, performs the default PRG-memory initialization when applicable, and
   freezes the derived board facts.

Body layout and the errors raised when a region is truncated:

| Region  | Present when               | Size                           | Truncation error     |
| ------- | -------------------------- | ------------------------------ | -------------------- |
| Trainer | `header.hasTrainer`        | `CARTRIDGE_TRAINER_SIZE` (512) | `INCOMPLETE_TRAINER` |
| PRG ROM | always (size > 0 enforced) | `header.prgRomSize`            | `INCOMPLETE_PRG_ROM` |
| CHR ROM | `header.chrRomSize > 0`    | `header.chrRomSize`            | `INCOMPLETE_CHR_ROM` |

By default, the trainer is copied into PRG memory at `TRAINER_RAM_OFFSET` (`0x1000`) via
`memory.initializePrg`, i.e. offset `0x1000` inside the `$6000`-based PRG RAM window, matching CPU
`$7000-$71FF`. FFE RAM-card mappers 6/8/17 defer initialization to their board owner because mapper
17 can relocate the trainer into scratch RAM and both families attach cold-start execution
semantics. The aggregate exposes only `trainerByteLength` and bounds-checked `readTrainer(index)`;
the mapper never receives a mutable trainer array. CHR ROM absent leaves `chrRom` as a zero-length
array, and CHR accesses then fall through to writable CHR memory.

### Derived aggregate facts

The constructor exposes the following read-only fields (all `readonly` except `mirroringMode`, which
mappers may reassign at runtime): `format`, `mapperNumber`, `submapperNumber`, `timingMode`,
`mirroringMode`, `hasBatteryBackup`, `hasWritableChrMemory`, and the four RAM sizes
`prgRamBytes`/`prgNvRamBytes`/`chrRamBytes`/`chrNvRamBytes`, plus `trainerByteLength`.
`hasBatteryBackup` is true when `CartridgeMemory` holds any NVRAM; `hasWritableChrMemory` is true
when the CHR address space is non-empty.

## Header parsing

`parseCartridgeHeader` (`packages/fc-emu/src/domain/model/cartridge-header.ts`) returns a frozen
`CartridgeHeader`. It first requires at least `CARTRIDGE_HEADER_SIZE` bytes (`FILE_TOO_SMALL`) and a
valid `NES\x1A` signature in bytes 0–3 (`INVALID_SIGNATURE`). Format is NES 2.0 when
`(flags7 & 0x0C) === 0x08`, otherwise iNES. Fields common to both formats derive from flags bytes 6
and 7; the remaining fields diverge by format.

| Field                    | iNES derivation                                                         | NES 2.0 derivation                            |
| ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| `format`                 | `"ines"`                                                                | `"nes2"`                                      |
| `mapperNumber`           | `(flags6>>4) \| (flags7 & 0xF0)` (8-bit)                                | above `\| ((byte8 & 0x0F) << 8)` (12-bit)     |
| `submapperNumber`        | `0`                                                                     | `byte8 >> 4`                                  |
| `mirroringMode`          | VS or four-screen flag wins; else `flags6 & 0x01` → Horizontal/Vertical | same                                          |
| `hasTrainer`             | `flags6 & 0x04`                                                         | same                                          |
| `hasBatteryFlag`         | `flags6 & 0x02`                                                         | same                                          |
| `consoleType`            | `flags7 & 0x03`                                                         | same                                          |
| `vsPpuType`              | `0` in header; exact VS content lookup may enrich after slicing         | VS only: `byte13 & 0x0F`                      |
| `vsHardwareType`         | `0` in header; exact VS content lookup may enrich after slicing         | VS only: `byte13 >> 4`                        |
| `prgRomSize` (bytes)     | `byte4 * 16384`                                                         | `decodeRomSize(byte4, byte9 & 0x0F, 16384)`   |
| `chrRomSize` (bytes)     | `byte5 * 8192`                                                          | `decodeRomSize(byte5, byte9 >> 4, 8192)`      |
| `prgRamSize` (bytes)     | `hasBatteryFlag ? 0 : legacy`                                           | `decodeRamSize(byte10 & 0x0F)`                |
| `prgNvRamSize` (bytes)   | `hasBatteryFlag ? legacy : 0`                                           | `decodeRamSize(byte10 >> 4)`                  |
| `chrRamSize` (bytes)     | 8 KiB default; mapper 77/96/119 board policy may replace or add memory  | `decodeRamSize(byte11 & 0x0F)`                |
| `chrNvRamSize` (bytes)   | `0`                                                                     | `decodeRamSize(byte11 >> 4)`                  |
| `timingMode`             | `byte9 & 1` (NTSC/PAL)                                                  | `byte12 & 0x03` (NTSC/PAL/multi-region/Dendy) |
| `miscellaneousRomCount`  | `0`                                                                     | `byte14 & 0x03`                               |
| `defaultExpansionDevice` | `0` in header; exact VS content lookup may enrich after slicing         | `byte15 & 0x3F`                               |

`legacy` for iNES is `(byte8 || 1) * 8192`, so a zero PRG-RAM byte still yields one 8 KiB unit, and
the battery flag routes that entire legacy window to NVRAM rather than volatile RAM. iNES with no CHR
ROM implies exactly 8 KiB of volatile CHR RAM unless mapper 96 supplies its physical 32 KiB chip.
Mapper 77 adds 8 KiB of board-implied RAM beside CHR ROM, and mapper 119 similarly implies TQROM's
8 KiB RAM. Mapper 164 is another explicit exception: its battery flag denotes a mapper-owned
512-byte EEPROM, while format policy supplies 2 KiB of volatile CPU work RAM.

`mirroringMode` is a `NametableMirroring` enum (`Horizontal`, `Vertical`, `SingleScreenLower`,
`SingleScreenUpper`, `FourScreen`); the header only ever decodes Horizontal, Vertical, or FourScreen,
and mappers select the single-screen variants at runtime. `timingMode` is a `CartridgeTimingMode`
enum (`Ntsc`, `Pal`, `MultiRegion`, `Dendy`).

### Legacy content metadata

iNES cannot encode some board facts reliably: VS images omit RGB PPU/protection/control wiring, and
a zero RAM byte means either unspecified memory or no chip. `legacy-rom-metadata.ts` performs a
narrow content lookup only where physical board evidence resolves that ambiguity. A match requires
console type, mapper number, both ROM lengths and independent CRC-32 values for the extracted PRG
and CHR regions; filenames and headers alone never select an entry. _Vs. Soccer_ set SC4-3 (PRG
`46914E3E`, CHR `FEBB5370`) resolves to `RP2C04-0003`, normal UniSystem hardware and player-one
gameplay on `$4017`. HVC-ELROM-01 _Uchuu Keibitai SDF_ (PRG `D979C8B7`, CHR `8734D65D`) resolves
the generic 8 KiB fallback to its physical zero-WRAM layout. DRAGON BALL Z-B _Crayon Shin-chan_
(PRG `B515E7D4`, CHR `A4B121A9`) supplies Mapper 16 submapper 5 and removes the no-memory LZ93D50
board's generic RAM. JF-25 _The Lord of King_ (PRG `EFB1DF9E`, CHR `7A2DCF20`) does the same for its
absent external WRAM. IF-28 _Kaiketsu Yanchamaru 3_ (PRG `E30B7F64`, CHR `AF5FD6B5`) removes it
from the zero-WRAM FC-00-017B H3001 board. TGN-020-SK _Skull & Crossbones_ (PRG `0857DF48`, CHR
`D0BF8C50`) does the same for its zero-WRAM 800032 REV A RAMBO-1 board. BAT-E301 _Batman_ (PRG
`094AFAB5`, CHR `F3B41C18`) removes it from the zero-WRAM Sunsoft-5A board. NAM-KK-5900 _King of
Kings_ (PRG `1DD6619B`, CHR `D3F4B947`) supplies Mapper 19 submapper 5, preserving the board's
measured 18.0–19.5 dB N163 mix instead of the conservative legacy fallback. NES-AOROM-03
_Battletoads_ (PRG `279710DC`, empty CHR) removes iNES's generic PRG RAM allocation from its zero-WRAM
AxROM board while retaining the board-implied 8 KiB CHR RAM. BC6 _Bible Adventures_ 1.3 (PRG
`9B8E02C0`, CHR `B0A8C32A`) likewise removes the generic allocation from its zero-WRAM
`COLORDREAMS-74*377` board. NES-GN-ROM-03 _Dragon Power_ (PRG `ECE525DD`, CHR `59F0FBAA`) removes the
same allocation and corrects the matching circulating iNES image's horizontal flag to the physical
board's hardwired vertical mirroring.

The lookup completes or corrects metadata only; it never changes ROM bytes, the mapper number or ROM
geometry. It may supply an otherwise-unrepresentable submapper or correct a known inaccurate legacy
field when exact board evidence exists. Unknown legacy payloads retain conservative iNES defaults,
while all explicit NES 2.0 fields remain authoritative even if their PRG/CHR bytes match a catalog
entry.

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
| Console type other than standard NES or VS System                         | `UNSUPPORTED_CONSOLE_TYPE`     | `validateSupportedHeader` |
| Reserved VS PPU type or DualSystem hardware type                          | `UNSUPPORTED_CONSOLE_TYPE`     | `validateSupportedHeader` |
| VS timing other than NTSC                                                 | `UNSUPPORTED_TIMING_MODE`      | `validateSupportedHeader` |
| `miscellaneousRomCount !== 0`                                             | `UNSUPPORTED_MISC_ROM`         | `validateSupportedHeader` |
| Expansion device outside standard `0/1` or VS `0/4/5` policy              | `UNSUPPORTED_EXPANSION_DEVICE` | `validateSupportedHeader` |
| Combined PRG RAM + NVRAM > 32 KiB (`MAX_SUPPORTED_PRG_RAM_SIZE = 0x8000`) | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| NVRAM declared without the battery flag                                   | `INVALID_NES2_RAM_FLAGS`       | `validateSupportedHeader` |
| Battery flag with no supported PRG/CHR or mapper-owned NVRAM              | `UNSUPPORTED_BATTERY_MEMORY`   | `validateSupportedHeader` |
| No CHR ROM and no CHR RAM/NVRAM                                           | `MISSING_CHR_MEMORY`           | `validateSupportedHeader` |
| Simultaneous CHR RAM and CHR NVRAM                                        | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| CHR ROM together with writable CHR outside mapper 19/77/119 policy        | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |
| Trainer present with < 8 KiB combined PRG RAM window                      | `UNSUPPORTED_RAM_LAYOUT`       | `validateSupportedHeader` |

The console/expansion checks accept standard NES/Famicom images (`consoleType === 0`) with
unspecified or standard controllers (`0/1`) and VS UniSystem images (`consoleType === 1`) with
unspecified or VS controller routing (`0/4/5`). NES 2.0 byte 13 supplies `vsPpuType` and
`vsHardwareType`; an exact content record may supply the otherwise absent legacy VS facts. Unknown
iNES payloads retain zero/default routing. The RAM checks keep the battery flag and NVRAM nibbles
mutually consistent. Mixed CHR is accepted only where mapper 19 or 119 supplies an explicit ROM/RAM
chip-select circuit.

## Writable memory regions

`CartridgeMemory` (`packages/fc-emu/src/domain/model/cartridge-memory.ts`) owns six independent
`Uint8Array` regions sized from the header. It never returns a reference to a backing array; all
access goes through index-based accessors, and the frozen `layout` records all six sizes.

`applyBoardMemoryPolicy` replaces header-generic capacities with physical board sizes when the
format cannot express them faithfully: 32 KiB volatile work RAM for FFE mappers 6/8/17, 128 bytes
for mapper 80's X1-005, 5 KiB for mapper 82's X1-017, and 2 KiB for legacy mappers 99 and 164. They then use the same `CartridgeMemory`
ownership, power-loss and battery snapshot paths as ordinary PRG memory; the mapper alone owns
address decoding and protection keys.

Namco 163's 128-byte shared chip RAM does not occupy PRG or CHR address space. `Cartridge` derives
that exact capacity for mapper 19 and allocates it as mapper RAM or mapper NVRAM according to the
battery flag. This keeps optional external WRAM independent and lets a battery-only internal-RAM
board persist without fabricating an 8 KiB PRG region.

Dongda PEC-9588's 512-byte 93C66 EEPROM is also mapper-owned memory. Mapper 164's battery flag makes
that region persistent independently of its optional volatile PRG work RAM. The memory starts erased
to `$FF`; serial commands mutate it through mapper accessors so battery revisions, power behavior and
save-state snapshots remain owned by `CartridgeMemory` rather than by the protocol device.

| Region              | Backing field | Volatile | In battery save | Cleared by `powerOn` | Logical space (order)   |
| ------------------- | ------------- | -------- | --------------- | -------------------- | ----------------------- |
| Volatile PRG RAM    | `prgRam`      | yes      | no              | yes                  | PRG (first)             |
| PRG NVRAM           | `prgNvRam`    | no       | yes             | no                   | PRG (after volatile)    |
| Volatile CHR RAM    | `chrRam`      | yes      | no              | yes                  | CHR (first)             |
| CHR NVRAM           | `chrNvRam`    | no       | yes             | no                   | CHR (after volatile)    |
| Volatile mapper RAM | `mapperRam`   | yes      | no              | yes                  | Mapper (first)          |
| Mapper NVRAM        | `mapperNvRam` | no       | yes             | no                   | Mapper (after volatile) |

### Logical address spaces exposed to mappers

Each address space concatenates its volatile region first, then its non-volatile region. Mappers
address a single flat index per space; the memory object decides which physical region backs it. The
`Cartridge` aggregate delegates the public accessors:

- `readPrgRam(index)` / `writePrgRam(index, value)` map to `CartridgeMemory.readPrg`/`writePrg` over
  the combined PRG RAM + PRG NVRAM space.
- `readChr(index)` returns the CHR ROM byte when CHR ROM is present (read-only, `chrRom[index] ?? 0`);
  otherwise it reads the combined CHR RAM + CHR NVRAM space. `writeChr(index, value)` is a no-op when
  CHR ROM is present and otherwise writes the CHR memory space, so CHR ROM is never mutated.
- `readWritableChr(index)` / `writeWritableChr(index, value)` explicitly address writable CHR when
  a board such as Namco 163, LROG017 or TQROM owns CHR ROM and RAM simultaneously.
- `readMapperRam(index)` / `writeMapperRam(index, value)` address mapper-owned memory without
  pretending that it lives in the CPU PRG window.
- `prgWritableBytes` reports `prgAddressSpaceBytes` (PRG RAM + PRG NVRAM).
- `chrMemoryBytes` reports the CHR ROM length, or `chrAddressSpaceBytes` when there is no CHR ROM.
- `chrWritableBytes` reports CHR RAM + CHR NVRAM independently of CHR ROM presence.

Reads clamp out of range: a negative index reads `0`, and an index past the non-volatile region reads
`0`. Writes drop negative and past-end indices; values are masked to a byte (`value & 0xFF`). The
volatile/non-volatile boundary in each space is the volatile region's `byteLength`.

`powerOn()` zero-fills volatile PRG, CHR and mapper regions, leaving all NVRAM regions and the save
revision intact, which models battery-backed retention across a power cycle.

## Battery save snapshot

`captureBatterySave()` (delegating to `CartridgeMemory.captureSave`) returns a
`CartridgeSaveSnapshot` — `{ revision, data }` — or `undefined` when the cartridge has no NVRAM. The
`data` array concatenates PRG NVRAM, CHR NVRAM and mapper NVRAM in that order, so an image with only
PRG/CHR NVRAM preserves its existing byte layout. The snapshot is a fresh copy; the internal
regions are never aliased into it.

The `revision` counter increments only when a write actually changes an NVRAM byte: volatile writes,
out-of-range writes, and writes that store the same byte already present do not advance it. Callers
therefore use `revision` to detect whether persisted battery memory has diverged from the last save.
`restoreBatterySave(data)` requires an existing battery region (throws otherwise), requires a real
`Uint8Array` and the exact combined NVRAM size (throwing before mutation on mismatch), splits the
payload back into PRG, CHR then mapper NVRAM, and resets the save revision to `0`.

## Memory-state capture and restore

Full save states use `captureMemoryState()` / `restoreMemoryState(state)`, which round-trip all six
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
truncation errors, region metadata, six physical writable regions, battery snapshots, save-state
validation and ROM identity. Mapper factory tests separately prove that parsed capacities are
reachable by the selected board.

The core CRC-32 identity is a compatibility key, not a cryptographic content address. The browser
adapter independently uses SHA-256 for IndexedDB identity. Unsupported console/expansion types,
ambiguous writable-memory layouts and unsupported mapper-internal EEPROM fail before execution; see
[Cartridge formats](../cartridge-formats.md).

## Source files

- `packages/fc-emu/src/domain/model/cartridge.ts` — `Cartridge` aggregate, `fromArrayBuffer`
  pipeline, supported-format policy, and public memory accessors.
- `packages/fc-emu/src/domain/model/cartridge-header.ts` — `parseCartridgeHeader`, `CartridgeHeader`,
  size/RAM decoders, `CartridgeFormat`, `CartridgeTimingMode`, `NametableMirroring`.
- `packages/fc-emu/src/domain/model/cartridge-memory.ts` — `CartridgeMemory`, the six regions,
  logical address spaces, battery snapshot, and memory-state capture/restore.
- `packages/fc-emu/src/domain/model/cartridge-format-error.ts` — `CartridgeFormatError` and
  `CartridgeFormatErrorCode`.
- `packages/fc-emu/src/domain/model/rom-identity.ts` — `createRomIdentity` CRC-32 identity string.
