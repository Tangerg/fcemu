# Cartridge format support

Header support is intentionally narrower than header decoding. `CartridgeHeader` decodes the iNES
and NES 2.0 fields needed to make a safe decision; `Cartridge` accepts only layouts the current
hardware model can represent correctly. Unsupported metadata or board geometry fails before
execution.

## Accepted formats

| Capability          | iNES                                               | NES 2.0                                   |
| ------------------- | -------------------------------------------------- | ----------------------------------------- |
| Mapper identity     | 8-bit legacy mapper                                | 12-bit mapper plus 4-bit submapper        |
| PRG/CHR ROM size    | Linear bank counts                                 | Linear and exponent-multiplier encodings  |
| Timing              | NTSC or PAL                                        | NTSC, PAL, multi-region or Dendy          |
| Console             | Standard NES/Famicom; legacy mapper-99 VS identity | Standard NES/Famicom or VS UniSystem      |
| PRG writable memory | Direct or board-implied internal memory            | Direct, MMC1-banked or board-implied      |
| CHR writable memory | Implicit 8 KiB; mapper 74/77/96/119 board-implied  | Explicit CHR RAM or CHR NVRAM             |
| Trainer             | Default `$7000`; mapper-owned loader exceptions    | Default plus mapper/submapper exceptions  |
| Miscellaneous ROMs  | Not encoded                                        | None                                      |
| Default expansion   | Legacy/default; VS/content and Mapper 96 fallback  | Standard, VS or Oeka Kids device identity |

The battery flag must agree with all NES 2.0 NVRAM metadata. Volatile bytes never enter a save
snapshot. An 8 KiB CHR NVRAM region is supported when it is the cartridge's only CHR memory.
MMC1 SOROM/SZROM may combine one 8 KiB volatile PRG region with one 8 KiB battery region; SUROM,
SOROM, SXROM and SZROM bank selection follows the board wiring rather than concatenating capacities
into the direct `$6000-$7FFF` window. Four implemented boards define mixed CHR explicitly: mapper
119 TQROM selects 16–64 KiB CHR ROM or 8 KiB volatile CHR RAM per 1 KiB bank; mapper 74 Waixing
Type A routes exact bank values `$08/$09` to two 1 KiB halves of volatile CHR RAM; mapper 19 Namco
163 uses `$00-$DF` for ROM and `$E0-$FF` for up to 32 KiB RAM when CIRAM substitution is disabled;
and mapper 77 LROG017 places fixed cartridge RAM beside one banked 2 KiB CHR-ROM window.
Other simultaneous CHR RAM/NVRAM, CHR ROM plus writable CHR memory, and mapper-internal battery
memory remain rejected unless an implemented board defines the exact capacity and protection rules.

Taito X1 memory is a deliberate board-derived exception to the header's power-of-two units.
Mapper 80 normalizes legacy iNES's generic 8 KiB RAM implication to the X1-005's 128 internal bytes;
the battery flag decides whether those bytes are volatile or persistent. NES 2.0 mapper 80 must
declare the exact 128 bytes. Mapper 82 always normalizes to the X1-017's physical 5 KiB NVRAM,
because neither header format can encode that capacity exactly; mapper creation additionally
requires the battery flag.

Mapper 96 similarly overrides legacy iNES's zero-CHR default with the Oeka Kids board's physical
32 KiB volatile CHR RAM, suppresses the generic 8 KiB PRG-RAM fallback and selects default expansion
device `$17`. This mapper is used only by the two Oeka Kids tablet titles, so the legacy inference is
board-complete rather than a title-name heuristic. NES 2.0 images must declare the same 32 KiB
capacity and device explicitly; CHR ROM, CHR NVRAM and other writable sizes are rejected by board
creation.

Mapper 74's legacy image cannot declare its additional 2 KiB volatile CHR RAM beside CHR ROM, so
format policy supplies the board-implied chip. NES 2.0 must declare exactly 2 KiB. The memory is not
a writable shadow of CHR ROM: only exact MMC3 CHR bank values `$08/$09` select its two 1 KiB pages.

Mapper 77's legacy image already carries CHR ROM, so iNES cannot declare its additional 8 KiB
volatile cartridge RAM. Format policy supplies that physical chip and suppresses iNES's generic
implicit 8 KiB PRG RAM because LROG017 has no CPU-visible writable memory; NES 2.0 must explicitly
declare the CHR RAM and no PRG RAM/NVRAM. Board creation also requires the singleton's 128 KiB PRG,
32 KiB CHR ROM and four-screen flag.

Mappers 114/115/182/248 decode `$6000-$7FFF` as mirrored outer-bank registers rather than writable
memory.
Legacy iNES's conventional implicit 8 KiB allocation remains parser metadata but is electrically
undriven and unwritable; NES 2.0 must declare no PRG RAM/NVRAM, and battery headers fail closed.

Mapper 7 has the same header-versus-board distinction: AxROM never decodes a PRG-RAM window, while
legacy iNES still implies a generic 8 KiB parser allocation when byte 8 is zero. Exact content
metadata resolves NES-AOROM-03 _Battletoads_ (PRG `279710DC`, empty CHR) to zero WRAM and the
board-implied 8 KiB volatile CHR RAM. NES 2.0 Mapper 7 images must declare no PRG RAM/NVRAM.

Mapper 11's Color Dreams latch also leaves `$6000-$7FFF` electrically unmapped. Exact content
metadata resolves BC6 _Bible Adventures_ 1.3 (PRG `9B8E02C0`, CHR `B0A8C32A`) to the production
board's zero-WRAM layout instead of retaining iNES's generic 8 KiB parser allocation. Its 64 KiB
CHR payload remains ROM; no writable CHR memory is synthesized.

Mapper 66 GxROM likewise has no writable CPU memory. Exact content metadata resolves _Dragon Power_
(PRG `ECE525DD`, CHR `59F0FBAA`) to its NES-GN-ROM-03 board: zero WRAM and hardwired vertical
mirroring. This deliberately corrects the matching circulating iNES image's inaccurate horizontal
flag; unknown Mapper 66 payloads keep their own header mirroring and conservative legacy metadata.

Mapper 6/8/17 and NES 2.0 mapper 12.1 images are extracted FFE copier-card memory, so their payload initializes
mutable board RAM and their work RAM is normalized to the physical 32 KiB volatile capacity.
Battery declarations are rejected. Their optional trainer is a loader entry rather than passive
generic initialization: mapper 6/8 loads `$7000-$71FF`, cold-calls `$7003` and returns to the reset
vector; mapper 12.1 uses the same `$7003` call but copies its header CHR payload into PRG-card offset
`$40000` for the loader to transfer into 32 KiB CHR RAM; mapper 17 submappers 0-3 load and cold-jump
to `$7000`, `$5D00`, `$5E00` or `$5F00`.

Mapper 16's legacy battery flag is normalized from iNES's misleading 8 KiB PRG-NVRAM unit to the
LZ93D50 board's exact 256-byte 24C02 capacity. With no battery, unknown legacy images retain the
generic 8 KiB metadata only for compatibility; exact content metadata can replace it when the
physical board is known. DRAGON BALL Z-B _Crayon Shin-chan_ (PRG `B515E7D4`, CHR `A4B121A9`)
resolves to submapper 5 with no EEPROM or WRAM, matching its LZ93D50 production board. NES 2.0
submapper 4 requires no writable PRG memory; submapper 5 accepts none or exactly 256 bytes of NVRAM.

Mapper 18 optionally carries one exact 8 KiB external PRG RAM/NVRAM chip. Unknown legacy iNES
images retain the conventional implicit allocation because the header cannot encode absence;
NES 2.0 declares either zero or exactly 8 KiB. Exact legacy content metadata identifies JF-25
_The Lord of King_ by PRG CRC `EFB1DF9E` and CHR CRC `7A2DCF20`, resolving its physical zero-WRAM
layout instead of exposing the generic fallback.

Legacy mappers 21 and 23 combine physically different VRC pin routes that plain iNES cannot name.
Exact content metadata resolves KON-RC850 _Wai Wai World 2_ (PRG `B201B522`, CHR `75754679`) to
submapper 1 VRC4a with no WRAM. It resolves KON-RC833 _Ganbare Goemon 2_ (PRG `112140A4`, CHR
`B0C3CE2D`) and KON-RC819 _Getsufuu
Maden_ (PRG `C8859038`, CHR `DCFA8063`) to submapper 3 VRC2b with no WRAM. KON-RC856 _Crisis
Force_ (PRG `99580334`, CHR `A709BCB8`) resolves to submapper 2 VRC4e with its physical 2 KiB
volatile WRAM. Unknown legacy payloads retain the dual-route VRC4 compatibility model and generic
RAM fallback; an image matching only one region CRC receives no override.

Mapper 64 RAMBO-1 never decodes a PRG-RAM window. Exact content metadata identifies TGN-020-SK
_Skull & Crossbones_ by PRG CRC `0857DF48` and CHR CRC `D0BF8C50`, removing the generic iNES
allocation from its zero-WRAM 800032 REV A board. NES 2.0 Mapper 64 images must declare no PRG
RAM/NVRAM; battery headers fail closed.

Mapper 65 follows the same optional-memory policy. Exact content metadata identifies IF-28
_Kaiketsu Yanchamaru 3_ by PRG CRC `E30B7F64` and CHR CRC `AF5FD6B5`, removing the generic iNES
allocation from its zero-WRAM FC-00-017B H3001 board. Unknown legacy images retain the fallback;
NES 2.0 must declare either no PRG memory or one exact 8 KiB RAM/NVRAM region.

Mapper 68 also has an optional direct 8 KiB PRG RAM/NVRAM window. Exact content metadata identifies
TGN-011-AB _After Burner_ by PRG CRC `B938B7E9` and CHR CRC `725A53DC`, removing iNES's generic
allocation from its zero-WRAM 800042-01 REV B Sunsoft-4 board. Unknown legacy images retain the
fallback; explicit NES 2.0 memory must fit the modeled 8 KiB window without mixing volatile and
nonvolatile regions.

Mapper 69 can expose an optional directly addressed PRG RAM/NVRAM region through command `$8`.
Exact content metadata identifies Japanese _Batman_ by PRG CRC `094AFAB5` and CHR CRC `F3B41C18`,
removing iNES's generic allocation from its zero-WRAM BAT-E301 Sunsoft-5A board. Unknown legacy
images retain the fallback; explicit NES 2.0 memory remains authoritative and must fit the modeled
8 KiB window without mixing volatile and nonvolatile regions.

Mapper 19 derives the Namco 163 ASIC's 128-byte shared RAM independently from header PRG/CHR
fields. The battery flag makes those bytes persistent even when the NES 2.0 PRG NVRAM field is
zero. Optional external memory is absent or exactly 8 KiB; NES 2.0 must declare it as volatile PRG
RAM without a battery or PRG NVRAM with one. Legacy iNES retains the conventional implicit 8 KiB
external allocation because it cannot describe absence. Submapper 1 requires battery-backed
internal RAM and no external WRAM; submappers 1/2 omit audio mixing, while 3/4/5 name the published
N163 mix levels. Exact legacy content metadata may supply that otherwise-unrepresentable submapper:
NAM-KK-5900 _King of Kings_ (PRG `1DD6619B`, CHR `D3F4B947`) resolves to submapper 5 and its measured
18.0–19.5 dB mix range.

Mapper 164 likewise separates the Dongda board's 512-byte 93C66 EEPROM from CPU-visible PRG RAM.
The battery flag denotes that mapper-owned NVRAM even when NES 2.0 declares no PRG/CHR NVRAM.
Legacy iNES's generic 8 KiB battery allocation is replaced with the documented 2 KiB volatile work
RAM compatibility layout plus the EEPROM; NES 2.0 may declare either no work RAM or exactly 2 KiB
of volatile PRG RAM. Fresh EEPROM storage starts in its erased `$FF` state. Power-on clears volatile
PRG/CHR bytes but retains the EEPROM and its independent battery-save revision.

Mapper 5 always owns 1 KiB of volatile ExRAM independently from header RAM fields; the battery flag
never makes ExRAM persistent. ExROM accepts CHR ROM and 32 KiB–1 MiB PRG/8 KiB–1 MiB CHR ROM
geometry. Writable PRG memory may be absent, one 8 KiB chip, one 32 KiB chip, or ETROM's exact
8 KiB volatile plus 8 KiB battery pair. Legacy iNES retains its conventional single 8 KiB chip
unless an exact content record establishes a different physical layout; the pinned HVC-ELROM-01
_Uchuu Keibitai SDF_ identity establishes no external WRAM.
NES 2.0 submapper 0 is accepted; unallocated variants and four-screen headers fail closed because
MMC5 owns all four nametable routes itself.

Mapper 99 normalizes legacy iNES RAM to the VS mainboard's exact 2 KiB capacity; the battery flag
still chooses volatile RAM or NVRAM. NES 2.0 must declare exactly 2 KiB in one of those classes.
PRG ROM may contain one to five 8 KiB sockets and CHR ROM one or two 8 KiB sockets, including
exponent-multiplier sizes that linear iNES cannot encode. The fifth PRG payload is Gumshoe's
alternate `$8000-$9FFF` socket and is selected only on a five-socket/40 KiB image; OUT2 changes only
CHR on ordinary one-to-four-socket boards. Unpopulated fixed sockets remain open bus instead of
mirroring.

The address-latch multicarts use board-exact geometry rather than arbitrary modulo banking. Mapper
15 is 1 MiB PRG plus 8 KiB volatile CHR RAM. Mapper 225 accepts matched 1 MiB/512 KiB or 2 MiB/1 MiB
PRG/CHR ROM pairs. Mapper 226 accepts 1, 1.5 or 2 MiB PRG plus exactly 8 KiB volatile CHR RAM and no
PRG RAM. Mapper 227 is 1 MiB PRG plus 8 KiB volatile CHR RAM; only submapper 0 may also
declare 8 KiB PRG NVRAM. Mapper 228 accepts 512 KiB or the NES 2.0/iNES-representable 1.5 MiB PRG
layout plus exactly 512 KiB CHR ROM. Mapper 242 accepts 512 KiB PRG plus 8 KiB volatile CHR RAM;
its battery variant requires exactly 8 KiB PRG NVRAM.

Mapper 240 accepts the singleton C&E/Supertone layout: exactly 128 KiB each of PRG and CHR ROM plus
one direct 8 KiB PRG RAM or NVRAM window. Legacy iNES uses its conventional implicit 8 KiB
allocation and lets the battery flag choose persistence. NES 2.0 must declare exactly one 8 KiB
volatile or non-volatile region; four-screen headers and writable CHR memory fail closed.

These rules follow the NES 2.0 distinction between volatile/non-volatile PRG and CHR fields and the
documented [MMC1 board wiring](https://www.nesdev.org/wiki/MMC1). Declared capacity is accepted only
when the selected mapper can address every byte.

NTSC, PAL and Dendy select distinct CPU/PPU/APU clock domains. A multi-region image currently uses
NTSC as a deterministic default in Workbench `auto` mode. The Workbench can explicitly select NTSC,
PAL or Dendy without mutating cartridge metadata; changing it rebuilds the runtime while preserving
battery-backed RAM and the paused/running lifecycle. Core callers and the conformance runner can
also supply an explicit region override for legacy test or homebrew images. VS System images are
fixed to NTSC and cannot be rebuilt under PAL or Dendy timing. PlayChoice-10 and extended console
types remain rejected.

NES 2.0 VS images decode header byte 13 into the PPU type and hardware type. PPU types 0, 2–5 and
8–11 select the documented 2C03, 2C04 and 2C05 behavior; reserved values fail closed. UniSystem
hardware types 0–4 are supported, including the three Namco security devices and Ice Climber input
protection. DualSystem types 5–6 require two synchronized CPUs/PPUs, watchdog and shared-memory
arbitration and therefore fail closed. Default expansion values 0, 4 and 5 are accepted; 4/5 state
whether player one is reported through `$4016` or `$4017`.

Legacy iNES cannot encode several board facts reliably. The core may complete them only through an
exact content record containing console type, mapper, PRG/CHR lengths and independent PRG/CHR
CRC-32 values. The pinned _Vs. Soccer_ SC4-3 payload resolves to `RP2C04-0003` and reversed
gameplay-stick routing; HVC-ELROM-01 _Uchuu Keibitai SDF_ resolves the ambiguous zero byte 8 to its
physical zero-WRAM layout. Unknown payloads keep conservative iNES defaults. Explicit NES 2.0
metadata always wins, and the lookup never repairs or rewrites a ROM image.

## Mapper variants and board shape

Mapper creation validates the ROM/RAM bank geometry required by that implementation. NES 2.0
submapper 0 selects the base/unspecified behavior. Mapper 1 also accepts deprecated submappers 1
(SUROM), 2 (SOROM) and 4 (SXROM) only when the declared geometry proves that board, plus submapper 5
for fixed-PRG SEROM/SHROM/SH1ROM. For Mapper 2, 3 and 7, the legacy/submapper-0 compatibility policy
does not apply bus conflicts; submapper 1 makes that behavior explicit and submapper 2 selects
AND-type bus conflicts. Other submappers are rejected. Mapper 0 and 4 currently accept only
submapper 0. Mapper 34 submapper 1 selects NINA-001 and submapper 2 selects BNROM;
submapper 0 chooses exactly one board from CHR geometry instead of exposing both register sets.
Mapper 6 NES 2.0 submappers 0-7 select the initial Magic Card latch mode; legacy mapper 6 means mode
1, while mapper 8 is its mode-4 synonym and accepts submapper 0. Mapper 17 accepts submappers 0-3
solely for the trainer relocation described above. Mapper 12 legacy/submapper 0 is SL-5020B;
NES 2.0 submapper 1 is the FFE 4M extraction. Mappers 15/133/142/150/225/226/228/240/242/243/244/246/250 accept
submapper 0 only.
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

- VS DualSystem, PlayChoice-10 and extended console types.
- VS Zapper, miscellaneous ROM payloads and other non-standard default expansion devices.
- Mapper-internal EEPROM/battery memory outside the explicit Bandai FCG, Taito X1-005/X1-017 and
  Namco 163 policies.
- Simultaneous CHR ROM and writable CHR memory outside Namco 163/TQROM, or simultaneous CHR RAM and
  CHR NVRAM.
- Unknown submappers and geometries with unreachable declared memory.

This list is a policy boundary, not a parser limitation.
