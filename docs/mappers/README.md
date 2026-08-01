# Mapper reference

The mapper module (`packages/fc-emu/src/domain/emulation/mapper/`) is the cartridge-hardware submodule
of the Emulation bounded context. In the supported Control Deck map it translates CPU
`$6000-$FFFF`, optional cartridge-decoded `$4018-$5FFF`, and PPU `$0000-$1FFF` accesses into ROM/RAM
offsets, owns bank latches, nametable routing and any board IRQ, and hides every board-specific
register behind one contract. CPU and PPU devices never see mapper registers; they see only the
`Mapper` interface.

This document describes the contract, the selection factory, save-state handling and every supported
board. Support status and evidence are tracked separately in
[../mapper-compatibility.md](../mapper-compatibility.md); accepted header/board shapes are in
[../cartridge-formats.md](../cartridge-formats.md).

## The `Mapper` contract

`mapper.ts` defines the address-space contract. Every board implements it and nothing else is exposed
to the rest of core.

| Member                         | Role                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `read(address, context?)`      | Reads CPU/PPU data; rendering reads may identify their background/sprite fetch owner.    |
| `write(address, value)`        | Decodes a register write or routes a CHR/PRG-RAM write.                                  |
| `cpuReadDriveMask(address)`    | Optional CPU data-line mask; omitted means fully driven, `0` means open bus.             |
| `readCpuExpansion(address)`    | Optional value/drive mask for a cartridge device in CPU `$4018-$5FFF`.                   |
| `writeCpuExpansion(addr, v)`   | Optional cartridge register write in CPU `$4018-$5FFF`.                                  |
| `readCpuRegisterOpenBus(a)`    | Optional cartridge drive on otherwise floating write-only 2A03 reads.                    |
| `ppuReadDriveMask(address)`    | Optional PPU pattern-data mask; omitted means fully driven, `0` means CHR is tri-stated. |
| `mapPatternToCiramAddress(a)`  | Optional per-access pattern-page routing into the console's 2 KiB CIRAM.                 |
| `mapNametableAddress(addr)`    | Optional direct CIRAM/nametable-memory routing for cartridge-controlled wiring.          |
| `readNametable(address)`       | Optional cartridge-driven nametable byte, such as Sunsoft-4 CHR ROM.                     |
| `readNametableBus(address)`    | Optional value/drive mask for cartridge-owned or undriven nametable ranges.              |
| `writeNametable(addr, v)`      | Optionally consumes a cartridge-owned nametable write.                                   |
| `observePpuAddress(address)`   | Optional PPU address-line snoop for boards such as MMC3.                                 |
| `observePpuRead(address)`      | Optional completed-read event for read-triggered MMC2/MMC4 CHR latches.                  |
| `tickPpu()`                    | Optional one-dot clock used by address-line timing filters.                              |
| `observeCpuBusCycle(write)`    | Optional per-M2-cycle CPU R/W snoop (serial filters, IRQ counters/delays).               |
| `observeCpuRead(addr, value)`  | Optional completed CPU-read snoop for cartridge devices such as MMC5 read-mode PCM.      |
| `observeCpuWrite(addr, value)` | Optional CPU-write snoop for cartridge devices wired to console register traffic.        |
| `powerOn()`                    | Restores the board's deterministic fresh-instance latch state.                           |
| `reset()`                      | Optional warm-reset signal for boards whose latch is physically resettable.              |
| `powerOnCpuEntry()`            | Optional cold-boot entry/call target supplied by a RAM-card loader.                      |
| `captureState()`               | Returns a typed `MapperState` discriminated-union snapshot.                              |
| `restoreState(state)`          | Validates and restores a snapshot, rejecting mismatched kinds and out-of-range fields.   |

PPU capabilities are structural: boards implement only the optional signal hooks they physically
consume. Address-line changes and completed reads are deliberately separate because MMC3 reacts to
A12 before data transfer, while MMC2/MMC4 change their CHR latch only after the triggering byte has
been read.

CPU reads keep value selection and electrical drive behavior separate. A board may return a neutral
byte from `read` while `cpuReadDriveMask` reports that a write-only register or disabled RAM window
drives no data lines; `CPUMemory` then combines the driven bits with the retained external bus.
Pattern-table reads follow the same separation through `ppuReadDriveMask`; `PPUMemory` supplies the
current address low byte on undriven multiplexed PPU pins instead of asking a mapper to invent open
bus. `mapPatternToCiramAddress` models boards such as Namco 163 that replace a selected 1 KiB CHR
page with CIRAM, while `mapNametableAddress` keeps per-access nametable wiring distinct from fixed
header mirroring. `readNametable`/`writeNametable` separately model memory that replaces CIRAM
entirely, so ROM ownership is not hidden in a magic address value. `readNametableBus` additionally
keeps cartridge RAM, CIRAM and electrically undriven nametable ranges distinct on boards such as
LROG017. Expansion-range reads return their value and drive mask together; an absent result remains
normal CPU open bus.

IRQ-generating boards depend only on the narrow `MapperInterruptPort` (`setMapperIrq(asserted)`), not
on the full bus. The bus arbitrates the mapper's level-sensitive IRQ line alongside the APU frame IRQ,
so a board asserts and acknowledges independently.

`observeCpuBusCycle` is invoked once per CPU (M2) bus cycle — every CPU read, DMA read and CPU write
routes through it, including dummy and DMA-stall cycles — so a board that counts CPU cycles (FME-7)
sees an accurate total.

`powerOnCpuEntry` is consulted only after a cold power-on and never for a warm reset. The CPU either
jumps directly to the returned address or creates the loader's documented subroutine-return stack
frame. This keeps copier-specific startup behavior in the cartridge boundary without allowing a
mapper to mutate CPU registers directly.

## The selection factory

`create-mapper.ts` is the only mapper-number selection point. `createMapper(cartridge, interruptPort)`:

1. Switches on `cartridge.mapperNumber`.
2. Resolves the submapper/board variant (base submapper, bus-conflict variant, or board-specific
   choice) and rejects unmodeled variants with `UnsupportedMapperVariantError`.
3. Validates the PRG/CHR bank geometry the implementation requires, raising
   `UnsupportedMapperConfigurationError` before any address calculation can hit an empty or partial
   bank.
4. Constructs the board, passing `interruptPort` only to IRQ-capable boards.

Unknown mapper numbers raise `UnsupportedMapperError`. The shared validators
(`requireBankedLayout`, `requireRomLayout`, `requireMaximumRomSize`, `requireWritableChrSize`,
`requireChrRom`, `requireChrRam`, `requireDirectPrgRam`, `requireOptional8KiBPrgRam`,
`requireNoPrgRam`,
`resolveBusConflicts`, `requireBaseSubmapper`) keep the accept/reject policy in one place. Declared
capacity is accepted only when the selected board can address every byte.

## Save state

`MapperState` (in `mapper.ts`) is a discriminated union keyed by `MapperKind` (`mapper-kind.ts`). Each
board's `captureState`/`restoreState` refer to the same named kind. `restoreState` re-validates every
untrusted field (bank indexes against the live bank count, mirroring against `NametableMirroring`,
counters against their bit width and all booleans by runtime type) and throws
`RangeError`/`TypeError` rather than trust a snapshot. Common array/boolean guards live in
`state-validation.ts`. Boards with nested IRQ, audio, banking or CHR-latch devices validate the
complete state tree before mutating either owner or child, and IRQ-capable boards re-assert their
line only after that validation succeeds. Optional mirroring circuits are validated against the
selected board: controlled variants accept only modes their register can drive, while hardwired
variants require the exact fixed mode.

MMC3 applies the same rule to board wiring: standard/TQROM boards accept the horizontal/vertical
`$A000` output, four-screen boards retain header four-screen routing, and TxSROM retains its fixed
header mode because CHR A17 replaces the ordinary mirroring register at the nametable address path.
MMC2, MMC4 and FME-7 reject four-screen ROM declarations at the factory boundary and accept only
the mirroring modes their own registers can drive when restoring state.

## Implemented boards

| #   | Family         | Kind                      | Implementation               | Bus conflicts | IRQ  |
| --- | -------------- | ------------------------- | ---------------------------- | ------------- | ---- |
| 0   | NROM           | `nrom`                    | `nrom-mapper.ts`             | n/a           | no   |
| 1   | MMC1 / SxROM   | `mmc1`                    | `mmc1-mapper.ts` + board     | no            | no   |
| 2   | UxROM          | `uxrom`                   | `uxrom-mapper.ts`            | submapper     | no   |
| 3   | CNROM          | `cnrom`                   | `cnrom-mapper.ts`            | NES 2.0 3.2   | no   |
| 4   | MMC3           | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 5   | MMC5 / ExROM   | `mmc5`                    | `mmc5-mapper.ts` + audio     | no            | both |
| 6   | Magic Card     | `ffe-magic-card`          | `ffe-magic-card-mapper.ts`   | no            | cyc. |
| 7   | AxROM          | `axrom`                   | `axrom-mapper.ts`            | submapper     | no   |
| 8   | Magic Card m4  | `ffe-magic-card`          | `ffe-magic-card-mapper.ts`   | no            | cyc. |
| 9   | MMC2 / PxROM   | `mmc2`                    | `mmc2-mapper.ts`             | no            | no   |
| 10  | MMC4 / FxROM   | `mmc4`                    | `mmc4-mapper.ts`             | no            | no   |
| 11  | Color Dreams   | `color-dreams`            | `color-dreams-mapper.ts`     | AND           | no   |
| 13  | CPROM          | `cprom`                   | `cprom-mapper.ts`            | AND           | no   |
| 15  | K-1029/K-1030P | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 16  | Bandai FCG     | `bandai-fcg`              | `bandai-fcg-mapper.ts`       | no            | cyc. |
| 17  | Super Magic    | `ffe-magic-card`          | `ffe-magic-card-mapper.ts`   | no            | both |
| 18  | Jaleco SS8806  | `jaleco-ss8806`           | `jaleco-ss8806-mapper.ts`    | no            | cyc. |
| 19  | Namco 129/163  | `namco-163`               | `namco163-mapper.ts`         | no            | cyc. |
| 21  | Konami VRC4a/c | `vrc2-vrc4`               | `vrc2-vrc4-mapper.ts`        | no            | cyc. |
| 22  | Konami VRC2a   | `vrc2-vrc4`               | `vrc2-vrc4-mapper.ts`        | no            | no   |
| 23  | VRC2b/VRC4e/f  | `vrc2-vrc4`               | `vrc2-vrc4-mapper.ts`        | no            | opt. |
| 24  | Konami VRC6a   | `vrc6`                    | `vrc6-mapper.ts`             | no            | cyc. |
| 25  | VRC2c/VRC4b/d  | `vrc2-vrc4`               | `vrc2-vrc4-mapper.ts`        | no            | opt. |
| 26  | Konami VRC6b   | `vrc6`                    | `vrc6-mapper.ts`             | no            | cyc. |
| 32  | Irem G-101     | `irem-g101`               | `irem-g101-mapper.ts`        | no            | no   |
| 33  | Taito TC0190   | `taito-tc0190`            | `taito-tc0190-mapper.ts`     | no            | no   |
| 34  | BNROM/NINA-001 | `bnrom`/`nina-001`        | `bnrom-`/`nina001-mapper.ts` | BNROM AND     | no   |
| 48  | Taito TC0690   | `taito-tc0690`            | `taito-tc0690-mapper.ts`     | no            | A12  |
| 64  | Tengen RAMBO-1 | `rambo-1`                 | `rambo1-mapper.ts`           | no            | both |
| 65  | Irem H3001     | `irem-h3001`              | `irem-h3001-mapper.ts`       | no            | cyc. |
| 66  | GxROM / MHROM  | `gxrom`                   | `gxrom-mapper.ts`            | AND           | no   |
| 67  | Sunsoft-3      | `sunsoft-3`               | `sunsoft3-mapper.ts`         | no            | cyc. |
| 68  | Sunsoft-4      | `sunsoft-4`               | `sunsoft4-mapper.ts`         | no            | no   |
| 69  | Sunsoft FME-7  | `fme7`                    | `fme7-mapper.ts`             | no            | cyc. |
| 70  | Bandai 74xx    | `bandai-74`               | `bandai74-mapper.ts`         | AND           | no   |
| 71  | Codemasters    | `codemasters`             | `codemasters-mapper.ts`      | no            | no   |
| 72  | Jaleco JF-17   | `jaleco-jf17`             | `jaleco-jf17-mapper.ts`      | AND           | no   |
| 73  | Konami VRC3    | `vrc3`                    | `vrc3-mapper.ts`             | no            | cyc. |
| 74  | Waixing Type A | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 75  | Konami VRC1    | `vrc1`                    | `vrc1-mapper.ts`             | no            | no   |
| 76  | Namco 3446     | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 77  | Irem LROG017   | `irem-lrog017`            | `irem-lrog017-mapper.ts`     | AND           | no   |
| 78  | Irem 74HC161   | `irem-78`                 | `irem78-mapper.ts`           | AND           | no   |
| 79  | NINA-03/06     | `nina-03-06`              | `nina0306-mapper.ts`         | no            | no   |
| 80  | Taito X1-005   | `taito-x1-005`            | `taito-x1-005-mapper.ts`     | no            | no   |
| 82  | Taito X1-017   | `taito-x1-017`            | `taito-x1-017-mapper.ts`     | no            | cyc. |
| 83  | Cony/Yoko ASIC | `cony-yoko`               | `cony-yoko-mapper.ts`        | no            | both |
| 85  | Konami VRC7    | `vrc7`                    | `vrc7-mapper.ts`             | no            | cyc. |
| 87  | Jaleco CHR     | `jaleco-87`               | `jaleco-mapper.ts`           | no            | no   |
| 88  | Namco 3433     | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 89  | Sunsoft-2      | `sunsoft-2`               | `sunsoft2-mapper.ts`         | AND           | no   |
| 90  | J.Y. Company   | `jy-company`              | `jy-company-mapper.ts`       | no            | both |
| 91  | JY/EJ bootleg  | board-specific            | two boards + shared banking  | no            | both |
| 93  | Sunsoft-3R     | `sunsoft-3r`              | `sunsoft3r-mapper.ts`        | AND           | no   |
| 94  | UN1ROM         | `uxrom`                   | `uxrom-mapper.ts`            | AND           | no   |
| 95  | Namco 3425     | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 96  | Oeka Kids      | `oeka-kids`               | `oeka-kids-mapper.ts`        | AND           | no   |
| 97  | Irem TAM-S1    | `irem-tam-s1`             | `irem-tam-s1-mapper.ts`      | no            | no   |
| 99  | VS mainboard   | `vs-system`               | `vs-system-mapper.ts`        | no            | no   |
| 112 | NTDEC/Asder    | `ntdec-asder`             | `ntdec-asder-mapper.ts`      | no            | no   |
| 113 | HES NTD-8      | `hes-ntd8`                | `hes-ntd8-mapper.ts`         | no            | no   |
| 114 | SuperGame MMC3 | `supergame-114`           | `supergame-114-mapper.ts`    | no            | A12  |
| 115 | Kasheng MMC3   | `kasheng-115`             | `kasheng-115-mapper.ts`      | no            | A12  |
| 118 | TxSROM         | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 119 | TQROM          | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 140 | Jaleco JF      | `jaleco-jf`               | `jaleco-jf-mapper.ts`        | no            | no   |
| 152 | Bandai 74xx    | `bandai-74`               | `bandai74-mapper.ts`         | AND           | no   |
| 180 | Inverted UxROM | `uxrom`                   | `uxrom-mapper.ts`            | submapper     | no   |
| 182 | SuperGame MMC3 | `supergame-114`           | `supergame-114-mapper.ts`    | no            | A12  |
| 184 | Sunsoft-1      | `sunsoft-1`               | `sunsoft1-mapper.ts`         | no            | no   |
| 185 | CNROM protect  | `cnrom-protection`        | `cnrom-protection-mapper.ts` | AND           | no   |
| 189 | TXC MMC3       | `txc-mmc3-189`            | `txc-mmc3-189-mapper.ts`     | no            | A12  |
| 206 | Namco 118      | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 225 | ET-4310/K-1010 | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 227 | 810449/FW-01   | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 228 | Active Ent.    | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 245 | Waixing F003   | `waixing-f003-245`        | `waixing-f003-mapper.ts`     | no            | no   |
| 248 | Kasheng MMC3   | `kasheng-115`             | `kasheng-115-mapper.ts`      | no            | A12  |

The shared CHR-latch banks used by MMC2 and MMC4 live in `chr-latch-banks.ts`; the MMC1 board wiring
lives in `mmc1-board.ts`; the mapper 34 board decision lives in `mapper34-board.ts`. Namco
76/88/95/206 select immutable pin-wiring values around one register core, while MMC3/TxSROM/TQROM
select only the board behavior that differs around the shared MMC3 state machine.
Taito TC0190/TC0690 similarly share `TaitoTc0x90Banking`; their mirroring and IRQ pins remain in
their board-specific owners.
X1-005/X1-017 share only `TaitoX1Banking`, the three-PRG/eight-CHR data path actually common to both
ASICs. Register layout, internal RAM, pull-down and IRQ behavior stay separate.
Mapper-91's JY830623C and EJ-006-1 boards likewise share only `Mapper91Banking`; their outer-bank,
mirroring and IRQ circuits remain separate concrete mappers and save-state kinds.
RAMBO-1 stays independent from MMC3: similar register addresses do not justify sharing their
different bank set, PRG mode, IRQ prescaler or output timing.

---

## NROM (0)

Fixed layout, no banking. PRG ROM is 16 KiB (mirrored across `$8000-$FFFF`) or 32 KiB; CHR is a single
8 KiB ROM or RAM bank. An explicitly declared PRG-RAM window is mirrored through `$6000-$7FFF`.

## MMC1 / SxROM (1)

A serial shift register clocked by five consecutive `$8000-$FFFF` D0 writes commits one of four
registers (control, CHR bank 0, CHR bank 1, PRG bank). Control selects mirroring (one-screen
lower/upper, vertical, horizontal), the PRG mode (32 KiB, fix-first, or fix-last 16 KiB) and the CHR
mode (8 KiB or two 4 KiB banks). A D7 write resets the shift register and forces fix-last PRG.

`Mmc1Board` (`mmc1-board.ts`) is an immutable value selected from ROM/RAM geometry plus explicit
submapper constraints. It reinterprets the ASIC's generic CHR outputs as SUROM/SXROM outer PRG,
SOROM/SXROM/SZROM 8 KiB PRG-RAM banking and SNROM CHR-A16 WRAM protection, and hardwires the two
16 KiB halves for SEROM/SHROM/SH1ROM (submapper 5). MMC1 observes the CPU R/W pin via
`observeCpuBusCycle`: of consecutive writes it accepts only the first D0, so an RMW instruction's
write-new cycle is invisible to the shift register while a D7 reset still applies. Four-screen
headers are rejected because the modeled SxROM boards route the MMC1's two-screen CIRAM output.
See the [NESdev MMC1 page](https://www.nesdev.org/wiki/MMC1).

## UxROM (2)

16 KiB switchable PRG bank at `$8000-$BFFF`; `$C000-$FFFF` fixed to the last bank. The generic iNES
convention uses a full-byte no-conflict register; NES 2.0 submapper 2 selects UNROM/UOROM AND
conflicts.

## CNROM (3)

Fixed PRG; a `$8000-$FFFF` register selects an 8 KiB CHR bank. The legacy default applies original
CNROM-compatible banking without bus conflicts because iNES mapper 3 also covers historical mapper
hacks and compatible boards that require writable, non-conflicting registers. NES 2.0 submapper 1
makes that behavior explicit; submapper 2 selects original CNROM AND conflicts. A declared 2 KiB PRG
RAM is mirrored through the 8 KiB `$6000-$7FFF` window. A pinned local _The Legend of Kage_ profile
locks the legacy no-conflict path across its title sequence, gameplay, audio and save-state replay;
forcing the same bytes through submapper 2 reproduces the CHR corruption that policy prevents.

## MMC3 (4)

`$8000` (even) selects one of eight bank registers and the PRG/CHR banking modes; `$8001` (odd) writes
it. CHR is two 2 KiB plus four 1 KiB banks; PRG is two switchable 8 KiB banks with two fixed banks,
swappable between `$8000` and `$C000` by the PRG mode. `$A000`/`$A001` set mirroring and PRG-RAM
enable/write-protect. The revision-B IRQ counter clocks on filtered PPU A12 rising edges (`tickPpu`
counts low dots; `observePpuAddress` clocks a rise after ≥10 low dots). Its asserted IRQ output is
part of the mapper snapshot, so direct mapper restoration and the bus's named-source validation
cannot reconstruct contradictory line levels. A pinned local _Super Mario Bros. 3_ profile crosses
the title demo, world map and World 1-1; it locks scrolling, audio, CPU-cycle and mid-level
save-state-replay output without committing the ROM. See the
[NESdev MMC3 page](https://www.nesdev.org/wiki/MMC3).

## MMC5 / ExROM (5)

`Mmc5Mapper` owns the ASIC's four PRG modes and four CHR modes rather than approximating it as a
larger conventional mapper. `$5113` always selects an 8 KiB RAM bank at `$6000`; `$5114-$5117`
compose 32/16/8 KiB windows at `$8000-$FFFF`, with bit 7 selecting ROM versus RAM except for the
forced-ROM final register. RAM writes require the exact two-register key `$5102=2`, `$5103=1`.
Commercial ExROM layouts are represented explicitly: no RAM, one mirrored 8 KiB chip, ETROM's
8 KiB battery plus 8 KiB volatile chips, or one 32 KiB chip. Unreachable banks stay CPU open bus.

The PPU labels rendering reads by physical fetch owner. In 8×16-sprite mode, `$5120-$5127` drive
sprite CHR and `$5128-$512B` drive background CHR; 8×8 rendering uses the A set, while unspecialized
PPUDATA follows the most recently written set. `$5130` supplies the upper CHR address lines when the
selected bank size can use them. This bus context is also the basis for extended attributes: one
ExRAM byte supplies a background tile's palette and 4 KiB CHR bank without a mapper-specific
scanline callback.

`$5105` independently routes each nametable to CIRAM page 0/1, the ASIC's 1 KiB ExRAM, or fill mode.
ExRAM modes retain the distinct CPU read/write and rendering access rules; ExRAM is always volatile,
even on battery boards. Vertical split uses ExRAM tile/attribute data, `$5201` vertical scroll and a
fixed `$5202` 4 KiB CHR bank on the selected side of the screen.

The rendering detector exposes in-frame status and a level-sensitive scanline IRQ through `$5204`.
MMC5A's 16-bit hardware timer and PCM zero detector are independent IRQ sources on the same mapper
line. `$5205/$5206` provide immediate unsigned multiplication. `Mmc5Audio` implements the two
no-sweep pulse channels, their MMC5 envelope/length cadence, direct/read-mode PCM and inverted
cartridge mix. Banking, ExRAM ownership, fetch latches, all IRQ sources, timer phase and audio
dividers participate in validated save states. Undocumented `$5207/$5208` and diagnostic
`$5800-$5BFF` behavior remain open bus. See [NESdev MMC5](https://www.nesdev.org/wiki/MMC5) and
[MMC5 audio](https://www.nesdev.org/wiki/MMC5_audio).

## FFE Magic Card / Super Magic Card (6, 8, 17)

These mapper numbers identify play-mode disk extractions for Front Fareast copier RAM cards, not
three unrelated mask-ROM ASICs. The iNES PRG/CHR payload is copied into mutable card memory on
power-on. Magic Card provides 256 KiB PRG RAM, 32 KiB CHR RAM and 32 KiB banked work RAM; Super
Magic Card expands those limits to 512 KiB PRG RAM and 256 KiB CHR RAM while retaining 32 KiB work
RAM and adding 4 KiB scratch RAM. Battery headers fail closed because the hardware does not retain
these memories.

Mapper 6 legacy images start in latch mode 1; NES 2.0 submappers 0-7 select the precise initial latch
mode. Mapper 8 is the mapper-6 mode-4 synonym. The common card ports select 1/2 Mbit PRG layouts,
8 KiB CHR banks, PRG write protection and vertical/horizontal or lower/upper one-screen mirroring.
The Magic Card FDS-compatible data source asserts periodically at 1,792 master-clock cycles.

Mapper 17 models Super Magic Card play mode. `$4504-$4507` select four 8 KiB PRG windows,
`$4510-$4517` select eight 1 KiB CHR windows, and `$4518-$451B` can route CHR RAM behind each
nametable. Its mode register can instead select common 8 KiB CHR banking or MMC4-style
read-triggered CHR latches. A 16-bit up-counter IRQ clocks from CPU M2 or unfiltered PPU-A12 rises.
All mutable PRG/CHR/scratch bytes and in-flight IRQ/latch state are captured transactionally.

An optional 512-byte trainer represents the copier loader, not generic `$7000` initialization.
Mapper 6 loads it at `$7000`, cold-calls `$7003`, then returns to the ROM reset vector. Mapper 17
submappers 0-3 cold-jump to `$7000`, `$5D00`, `$5E00` or `$5F00`; warm reset always uses the normal
reset vector. The external FDS/BIOS, copier GUI, transfer port and pass-through cartridge hardware
used to create an extraction are deliberately outside this execution format. See
[NESdev mapper 6](https://www.nesdev.org/wiki/INES_Mapper_006),
[mapper 17](https://www.nesdev.org/wiki/INES_Mapper_017), and
[Super Magic Card](https://www.nesdev.org/wiki/Super_Magic_Card).

## AxROM (7)

32 KiB switchable PRG bank over the whole `$8000-$FFFF` window with single-screen mirroring selected by
register bit 4; CHR is 8 KiB RAM. The legacy default is no bus conflicts (ANROM); NES 2.0 submapper 2
selects AMROM/AOROM AND conflicts. The 512 KiB bit-3 PRG extension is supported. PRG-RAM declarations
are rejected because AxROM has no PRG-RAM window, and four-screen declarations are rejected because
the board register directly selects one of the console's two CIRAM pages.

## MMC2 / PxROM (9)

`$A000` selects the 8 KiB PRG bank at `$8000-$9FFF`; `$A000-$FFFF` is three fixed 8 KiB banks.
`$B000`/`$C000`/`$D000`/`$E000` set four 4 KiB CHR banks chosen by two PPU latches. The left latch
flips on the exact PPU fetches `$0FD8` (→ FD) and `$0FE8` (→ FE); the right latch flips across
`$1FD8-$1FDF` and `$1FE8-$1FEF`. Rendering fetches preserve the full sprite/background address and
call `observePpuRead` after returning the triggering byte, so a trigger changes only subsequent
fetches. `$F000` bit 0 selects vertical/horizontal mirroring. PxROM has no PRG-RAM window. See the
[NESdev MMC2 page](https://www.nesdev.org/wiki/MMC2). A pinned local _Punch-Out!!_ profile crosses
the title, opponent card, ring intro and an active Glass Joe match while locking visual/audio,
CPU-cycle and input-active save-state output.

## MMC4 / FxROM (10)

Like MMC2 but with a 16 KiB `$8000-$BFFF` bank (fixed last at `$C000-$FFFF`), an 8 KiB PRG-RAM window
at `$6000-$7FFF`, and both CHR latches flipping across the full `$xFD8-$xFDF`/`$xFE8-$xFEF` ranges.
MMC2 and MMC4 share `ChrLatchBanks` (`chr-latch-banks.ts`). Representative titles: Fire Emblem,
Famicom Wars.

## Color Dreams (11)

One `$8000-$FFFF` latch: bits 1-0 select a 32 KiB PRG bank, bits 7-4 an 8 KiB CHR bank, with documented
AND-type bus conflicts. The no-conflict prototype board variant is out of scope.

## CPROM (13)

Fixed 32 KiB PRG. 16 KiB CHR RAM is split into a fixed `$0000-$0FFF` bank 0 and a `$1000-$1FFF` bank
selected by bits 1-0 of the `$8000-$FFFF` register with AND-type bus conflicts. Because legacy iNES
cannot declare the implied 16 KiB CHR RAM, CPROM images require an NES 2.0 header.

## Address-latch multicarts (15, 225, 227, 228)

`AddressLatchMulticartMapper` shares only the physical behavior common to these discrete boards: a
write-address latch, the data bits used by 15/228, mirroring, optional four-nibble register RAM and
the PRG/CHR address equations. `AddressLatchMulticartBoard` fixes the materially different wiring;
the class does not emulate a fictional common ASIC.

Mapper 15's K-1029/K-1030P board uses write-address A1-A0 to select NROM-256, UNROM, NROM-64 or
NROM-128 behavior. Written D5-D0 drive PRG A19-A14, D7 supplies PRG A13 only in NROM-64 mode, and D6
selects mirroring. Modes 0/3 write-protect the unbanked 8 KiB CHR RAM; modes 1/2 enable writes.
Mapper-hacked ROMs that depend on nonexistent PRG RAM or disabled protection are outside the board
contract. See [NESdev mapper 15](https://www.nesdev.org/wiki/INES_Mapper_015).

Mapper 225's ET-4310/K-1010 latches A14 as the shared high PRG/CHR bank line, A13 as mirroring, A12 as
paired-32 KiB versus mirrored-16 KiB PRG mode, A11-A6 as the inner PRG bank and A5-A0 as the CHR
bank. Accepted boards are the documented 1 MiB/512 KiB and 2 MiB/1 MiB PRG/CHR pairs. Mapper 225
cannot encode whether its 74x670 is populated, so the legacy compatibility board exposes four
low-nibble registers mirrored through `$5800-$5FFF`; their high bits remain CPU open bus. See
[NESdev mapper 225](https://www.nesdev.org/wiki/INES_Mapper_225).

Mapper 227 latches non-contiguous address pins into three outer and three inner PRG lines, selects
UNROM-like or NROM-128/NROM-256 wiring, and controls mirroring. Submapper 0 is the RPG variant:
CHR RAM stays writable, an explicit battery header exposes 8 KiB NVRAM, and the absent UNROM circuit
hardwires NROM-128/NROM-256 behavior. Submapper 1 is the multicart variant with UNROM support,
NROM-mode CHR protection and a solder-pad read mode; the currently modeled physical setting is all
pads unbridged (`0`). Submapper 2 instead adds the rule that inner bank zero forces outer A18-A17 to
zero while leaving A19 unchanged. See
[NESdev mapper 227](https://www.nesdev.org/wiki/INES_Mapper_227).

Mapper 228 follows the Active Enterprises PAL: A12-A11 select a 512 KiB PRG chip, A10-A6 select its
16 KiB page, A5 selects paired versus mirrored PRG, A3-A0 plus written D1-D0 select an 8 KiB CHR
bank, and A13 controls mirroring. A 512 KiB image occupies chip 0. Action 52's 1.5 MiB payload stores
physical chips 0, 1 and 3 consecutively; selecting absent chip 2 leaves all CPU data lines open.
The rumored four-nibble expansion RAM is not present on either real board and is not modeled. See
[NESdev mapper 228](https://www.nesdev.org/wiki/INES_Mapper_228).

## Bandai FCG / LZ93D50 (16)

All current mapper-16 boards expose one switchable 16 KiB PRG bank at `$8000`, the final bank at
`$C000`, eight independent 1 KiB CHR-ROM banks and vertical, horizontal or either one-screen
mirroring. The ASIC revision determines address decode and IRQ wiring. NES 2.0 submapper 4
(FCG-1/2) responds only at `$6000-$7FFF`; registers B/C directly modify its live 16-bit down
counter. Submapper 5 (LZ93D50) responds only at `$8000-$FFFF`; B/C modify a reload latch that
register A copies into the counter while enabling or disabling it. The IRQ line asserts one CPU
cycle after the counter reaches zero and remains level-sensitive until register A acknowledges it.

Submapper 0 is intentionally a compatibility owner, not a guessed title database: both address
ranges decode, and each write uses the semantics of the ASIC that physically owns that range.
Submappers 1/2/3 are rejected because their 24C01, Datach and WRAM boards now belong to mappers
159/157/153.

LZ93D50 can connect a 256-byte 24C02. Register D drives SCL/SDA, while CPU reads at
`$6000-$7FFF` drive only EEPROM D4 and leave the other data-bus bits open. `Eeprom24c02` owns the
I²C-like protocol state; the bytes remain in Cartridge's 256-byte PRG NVRAM so battery saves,
revision tracking and transactional save states use the existing persistence boundary. Legacy
battery headers are normalized from iNES's misleading 8 KiB unit to this physical capacity. See
[NESdev mapper 16](https://www.nesdev.org/wiki/INES_Mapper_016) and the
[submapper table](https://www.nesdev.org/wiki/INES_Mapper_016/Submapper_table).

## Jaleco SS8806 (18)

Three 8 KiB registers select PRG at `$8000`, `$A000` and `$C000`; `$E000-$FFFF` is fixed to the
last bank. Eight registers independently select the 1 KiB CHR-ROM windows. The ASIC decodes
registers through mask `$F003`: CPU A2-A11 are ignored, and each low/high address pair supplies the
low/high four bits of a bank. PRG has only six physical bank bits (512 KiB maximum), while CHR has
all eight (256 KiB maximum).

An optional exact 8 KiB PRG-RAM/NVRAM window occupies `$6000-$7FFF`. `$9002` bit 0 enables reads and
bit 1 permits writes, so disabled reads remain CPU open bus and read-only state is distinct from
chip disable. Legacy iNES retains its conventional 8 KiB allocation because it cannot encode the
RAM-absent board; NES 2.0 may explicitly declare zero. `$F002` selects horizontal, vertical,
lower-one-screen or upper-one-screen nametables.

`$E000-$E003` assemble a 16-bit IRQ reload value; `$F000` reloads the live counter and acknowledges
the line. `$F001` acknowledges, enables counting and selects 16/12/8/4-bit width with bit 3 taking
precedence over bit 2 over bit 1. Counting continues each CPU cycle. At a selected-width underflow,
the borrow asserts IRQ and wraps only those low bits; upper bits remain unchanged. This follows the
current [NESdev mapper 18](https://www.nesdev.org/wiki/INES_Mapper_018) hardware description.
Mesen and Nestopia currently assert one cycle earlier on the 1→0 transition, so focused tests pin the
underflow interpretation rather than hiding the contradiction. `$F003` is the port for an optional
external µPD7755/7756 sample player; that separate audio device is not emulated.

## Namco 129 / 163 (19)

`Namco163Mapper` owns three switchable and one final-fixed 8 KiB PRG windows, eight 1 KiB pattern
selectors and four independent 1 KiB nametable selectors. Values `$00-$DF` select CHR. Values
`$E0-$FF` select either CIRAM page D0 or the final 32 CHR banks; `$E800` bits 6/7 disable CIRAM
substitution independently for the lower/upper pattern half. Nametable selectors always use CIRAM
for `$E0-$FF`, and otherwise let CHR ROM/RAM drive the nametable bus. Mixed CHR boards therefore
keep ROM in banks `$00-$DF` and expose up to 32 KiB RAM in `$E0-$FF`.

The optional external 8 KiB WRAM remains readable while `$F800`'s exact `$4x` protection pattern
write-enables any of its four 2 KiB windows whose corresponding low bit is clear. `$5000/$5800`
form a 15-bit CPU-cycle up-counter: it stops and asserts at `$7FFF`, and writing either byte
acknowledges the line. `$4800` accesses 128 bytes of chip RAM through the `$F800` address and
saturating auto-increment control. This internal RAM is a distinct cartridge-memory region because
it may be battery-backed even when external WRAM is absent.

`Namco163Audio` shares those same 128 bytes with software. Up to eight wavetable channels occupy
`$40-$7F`; one enabled channel advances every 15 CPU cycles in descending order, writes its 24-bit
phase back to chip RAM, and holds its instantaneous 4-bit sample voltage until the next channel.
No averaging removes the characteristic channel-switching output. NES 2.0 submappers 1/2 mute the
cartridge audio path; 3/4/5 select the documented approximately 12/16.5/18.75 dB mix levels, while
legacy submapper 0 uses the conservative 12 dB profile.

`$F000` bits 6-7 are retained as the chip's pin-44 control state. Current primary documentation
identifies a diagnostic CHR-output mode when PRG bank `$3F` is selected but does not publish the
resulting bit pattern, so the core does not invent observable debugger data. Banking, IRQ, WRAM,
shared-RAM, audio scheduler and all retained control state are save-state validated. See
[NESdev mapper 19](https://www.nesdev.org/wiki/INES_Mapper_019),
[Namco 163 audio](https://www.nesdev.org/wiki/Namco_106_audio) and
[Namco 163 family pinout](https://www.nesdev.org/wiki/Namcot_163_family_pinout).

## Konami VRC2 / VRC4 (21, 22, 23, 25)

`Vrc2Vrc4Mapper` owns the register file and banking shared by both ASICs: two switchable 8 KiB PRG
registers and eight independent 1 KiB CHR registers. VRC2 fixes the final 16 KiB at
`$C000-$FFFF`, supports only horizontal/vertical mirroring and has 8-bit CHR registers. VRC4 can
exchange its `$8000` switchable and `$C000` second-to-last-fixed windows, adds either one-screen
layout, and exposes a ninth CHR bank bit. VRC2a (mapper 22) additionally leaves CHR bank bit 0
unconnected, so the stored bank value is shifted right once before reaching ROM.

The ASIC's two register-select inputs are not assumed to be CPU A0/A1. `Vrc24Board` records the
physical address-line pair for VRC4a/c/e/f, VRC4b/d and VRC2a/b/c. NES 2.0 submappers 1/2/3 select
one exact wiring. Historical submapper 0 for mappers 21/23/25 remains a VRC4 compatibility owner:
it ORs the two non-overlapping routes assigned to that iNES mapper, matching the established
dual-decode contract without a title hash. Unallocated VRC2 routes fail closed.

VRC2b submapper 3 exposes the PCB's one-bit latch on D0 at `$6000-$6FFF` when no 8 KiB RAM is
declared; the other seven CPU data lines remain open bus. VRC4 accepts either its 2 KiB RAM mirrored
through `$6000-$6FFF` or an externally decoded 8 KiB window. `$9002` bit 0 gates that RAM and bit 1
selects PRG swap mode. VRC2 RAM, when declared, is an always-visible 8 KiB window.

VRC4's `$F00x` ports assemble an 8-bit IRQ latch, configure cycle/scanline mode and acknowledge the
level-sensitive output. Cycle mode clocks its up-counter every CPU cycle. Scanline mode starts a
341-dot prescaler and subtracts three per CPU cycle, producing the repeating 114/114/113-cycle
sequence; a `$FF` counter clock reloads the latch and asserts IRQ. `VrcIrq` is an independent
domain component so later VRC6/VRC7 boards can reuse this actual circuit without importing VRC4
banking. See [NESdev VRC2/VRC4](https://www.nesdev.org/wiki/VRC4),
[NES 2.0 submappers](https://www.nesdev.org/wiki/NES_2.0_submappers) and
[VRC IRQ](https://www.nesdev.org/wiki/VRC_IRQ).

## Konami VRC6 (24, 26)

`Vrc6Mapper` represents the VRC6a and VRC6b as one ASIC with immutable CPU-pin routing. Mapper 24
uses A0/A1 directly; mapper 26 swaps them before the common `$F003` decode. One 16 KiB PRG register
maps `$8000-$BFFF`, one 8 KiB register maps `$C000-$DFFF`, the final bank stays fixed, and `$B003`
bit 7 gates the physical 8 KiB WRAM/NVRAM window.

Eight byte-wide CHR registers support the documented 8×1, 4×2 and mixed 4×1+2×2 KiB layouts.
`$B003` bit 5 controls whether the ASIC overrides CHR/CIRAM A10, while its low mode/mirroring bits
select every conventional, direct four-table and paired nametable arrangement. Bit 4 replaces
CIRAM reads with the corresponding CHR-ROM pages and consumes writes. These routes are calculated
from the physical bank outputs instead of collapsing the chip to the eight values used by its
three commercial games.

The audio device owns two descending 16-step pulse generators and one fourteen-step saw sequence.
`$9003` can halt all phases or right-shift periods by 4/8 bits; the linear six-bit sum is inverted
and scaled so a maximum pulse matches the measured approximate amplitude of one maximum RP2A03
pulse, then enters the console's shared RC filter chain. The byte-latch VRC IRQ reuses `VrcIrq`.
Every divider, duty step, saw accumulator, bank and pending IRQ is serialized. See
[NESdev VRC6](https://www.nesdev.org/wiki/VRC6),
[VRC6 audio](https://www.nesdev.org/wiki/VRC6_audio) and
[VRC6 pinout](https://www.nesdev.org/wiki/VRC6_pinout).

## Konami VRC7 (85)

`Vrc7Mapper` maps three independently selected 8 KiB PRG windows followed by the fixed final bank,
eight 1 KiB CHR-ROM or CHR-RAM windows, and the vertical/horizontal/two one-screen CIRAM modes.
`$E000` bit 7 gates an optional exact 8 KiB WRAM/NVRAM window. The byte-wide IRQ latch, control and
acknowledge ports reuse `VrcIrq`.

The board descriptor keeps the physical register-select input immutable. Legacy iNES/submapper 0
accepts either A3 (`$x008`) or A4 (`$x010`) for historical images. NES 2.0 submapper 1 selects
VRC7b/A3 and has no audible expansion circuit because its PCB omits the resonator and mixer.
Submapper 2 selects VRC7a/A4 and decodes `$9010`/`$9030` into the sound device.

`Vrc7Audio` is a deliberately bounded six-channel OPLL core. It includes only VRC7 melodic mode:
the recovered 15-instrument ROM, one shared custom patch, paired phase/envelope generators,
feedback, key scaling, tremolo, vibrato and the VRC7 test register. It advances one native sample
per 36 NTSC CPU clocks and feeds its signed output into the shared console filter path. `$E000` bit
6 clears sound registers, envelopes and tremolo phase, ignores sound-port writes while asserted,
and leaves the independently running vibrato phase intact. All divider, register, operator,
feedback, envelope, bank and IRQ phases participate in save states.

The synthesis algorithm is adapted from MIT-licensed
[emu2413 1.5.9](https://github.com/digital-sound-antiques/emu2413); its license is preserved in the
repository's [third-party notices](../../THIRD_PARTY_NOTICES.md). Board behavior follows
[NESdev VRC7](https://www.nesdev.org/wiki/INES_Mapper_085) and
[VRC7 audio](https://www.nesdev.org/wiki/VRC7_audio).

## Irem G-101 (32)

Two registers select 8 KiB PRG banks at `$8000`/`$A000`; the final two banks normally remain fixed
at `$C000`/`$E000`. `$9000` bit 1 exchanges the `$8000` switchable and `$C000` fixed windows, while
bit 0 selects vertical/horizontal mirroring. `$B000-$B007` select eight 1 KiB CHR-ROM windows.
NES 2.0 submapper 1 identifies Major League's hardwired upper one-screen board, which fixes PRG mode
0 and does not decode `$9000`; ambiguous legacy images remain on the standard board rather than use
a title hash. See [NESdev mapper 32](https://www.nesdev.org/wiki/INES_Mapper_032).

## Taito TC0190 (33)

Two 8 KiB PRG registers at `$8000`/`$8001` map CPU `$8000-$BFFF`; the final two banks stay fixed at
`$C000-$FFFF`. `$8002`/`$8003` select two 2 KiB CHR windows in **2 KiB units** (the low bit is not
dropped as on MMC3), while `$A000-$A003` select four 1 KiB windows. Register decoding uses the
documented `$A003` mask across `$8000-$BFFF`; `$8000` bit 6 selects vertical/horizontal mirroring.
The first two CHR registers can address 512 KiB, while the 1 KiB registers address the lower
256 KiB. Because that register drives the board's two-screen CIRAM wiring, four-screen headers are
rejected instead of silently exposing an impossible nametable layout. Mapper 33 intentionally has
no IRQ; IRQ-capable/mislabeled mapper-48 images are not approximated. See
[NESdev mapper 33](https://www.nesdev.org/wiki/INES_Mapper_033).

## BNROM / NINA-001 (34)

`resolveMapper34Board` (`mapper34-board.ts`) chooses exactly one board and never combines their
register sets. BNROM switches a 32 KiB PRG bank with original-board AND conflicts. NINA-001 maps three
registers (`$7FFD` PRG, `$7FFE`/`$7FFF` two 4 KiB CHR banks) over an 8 KiB PRG-RAM window. Legacy CHR
ROM above 8 KiB selects NINA-001; CHR RAM or ≤8 KiB CHR ROM selects BNROM; NES 2.0 submapper 1/2 name
the board explicitly.

## Taito TC0690 (48)

TC0690 reuses TC0190's two switchable/final-two-fixed 8 KiB PRG layout and its two 2 KiB plus four
1 KiB CHR windows. Unlike mapper 33, `$8000` no longer controls mirroring: `$E000` bit 6 selects
vertical/horizontal layout. `$C000-$C003` provide an MMC3-shaped filtered-PPU-A12 IRQ unit whose
reload value is inverted.

The counter event reaches the CPU IRQ pin after an empirically measured propagation delay.
Submapper 0 uses the 22-cycle behavior required by early boards; submapper 1 uses the six-cycle
variant and adjusted reload bias associated with later titles. Both variants preserve the pending
delay in save state and keep the mapper IRQ line level-sensitive. See
[NESdev mapper 48](https://www.nesdev.org/wiki/INES_Mapper_048) and the
[TC0690 timing research](https://forums.nesdev.org/viewtopic.php?t=18277).

## Tengen RAMBO-1 (64)

Tengen's 800032 board maps three switchable 8 KiB PRG windows and fixes `$E000-$FFFF` to the final
bank. R6, R7 and RF normally drive `$8000`, `$A000` and `$C000`; the P bit exchanges the R6 and RF
windows without moving R7. R0/R1 provide two even-aligned 2 KiB CHR banks while R2-R5 provide four
1 KiB banks. The K bit instead exposes R8/R9 and turns the first half into four independent 1 KiB
banks; the C bit exchanges the two pattern-table halves. Bank-data writes use the complete low
four-bit selector, so RF is not collapsed into MMC3's eight-register model.

The IRQ reload register and counter can be clocked from filtered PPU-A12 rises or every fourth CPU
M2 cycle. `$C001` requests a reload with the documented non-zero odd bias and selects the source;
switching out of cycle mode lets the already-running four-cycle prescaler finish. Reaching zero
schedules the IRQ output four CPU cycles later. `$E000` disables, acknowledges and cancels a
not-yet-visible output, while `$E001` enables without acknowledging an asserted line. `$A000`
switches vertical/horizontal mirroring; `$A001` has no known function and the board decodes no PRG
RAM. See [NESdev RAMBO-1](https://www.nesdev.org/wiki/RAMBO-1).

## Irem H3001 (65)

`$8000-$8007` and `$A000-$A007` mirror two 8 KiB PRG registers. `$9000` bit 7 swaps the first
register between `$8000` and `$C000`; the other position holds the fixed second-to-last bank and
`$E000` always holds the final bank. There is deliberately no `$C000` PRG register: later physical
pinout testing disproved that older emulator behavior. `$B000-$B007` select eight 1 KiB CHR banks.

`$9001` bits 7-6 select vertical, horizontal or lower-one-screen mirroring. `$9005/$9006` write the
high/low 16-bit IRQ reload, `$9004` copies it into the live counter, and `$9003` acknowledges and
enables/disables counting. The counter decrements once per CPU cycle, asserts at zero and disables
itself. A directly declared PRG-RAM/NVRAM window is mapped at `$6000-$7FFF`. See
[NESdev mapper 65](https://www.nesdev.org/wiki/INES_Mapper_065) and the
[H3001 pinout findings](https://forums.nesdev.org/viewtopic.php?t=19778).

## GxROM / MHROM (66)

One `$8000-$FFFF` latch: bits 5-4 select a 32 KiB PRG bank, bits 1-0 an 8 KiB CHR bank, with AND-type
bus conflicts. MHROM images simply never use the high PRG bit.

## Sunsoft-3 (67)

The high half of each 4 KiB CPU register region is decoded under mask `$F800`: `$8800-$B800`
select four 2 KiB CHR-ROM windows, `$C800` alternately writes the high and low bytes of the live
16-bit IRQ counter, `$D800` enables counting and resets that write toggle, `$E800` selects vertical,
horizontal or either one-screen layout, and `$F800` selects the 16 KiB PRG bank at
`$8000-$BFFF`. The final PRG bank remains fixed at `$C000-$FFFF`. Every corresponding low-half
mirror acknowledges the IRQ under mask `$8800`.

While enabled, the counter decrements once per CPU cycle. Its `$0000`→`$FFFF` wrap asserts the IRQ
line and disables further counting; the enable write deliberately does not acknowledge an already
pending IRQ. The board carries no PRG RAM and has no bus conflicts. See
[NESdev mapper 67](https://www.nesdev.org/wiki/INES_Mapper_067) and the
[Sunsoft-3 pinout](https://www.nesdev.org/wiki/Sunsoft_3_pinout).

## Sunsoft-4 (68)

Registers `$8000-$B000` select four 2 KiB CHR-ROM windows. `$F000` selects the switchable 16 KiB PRG
bank at `$8000`, leaves the last bank fixed at `$C000`, and gates the direct 8 KiB PRG-RAM window.
`$E000` selects vertical, horizontal or either one-screen layout.

When `$E000` bit 4 is set, the selected nametable pages no longer reach CIRAM: `$C000`/`$D000`
choose 1 KiB banks from the final 128 KiB of CHR ROM and nametable writes are discarded. This uses
the mapper's explicit nametable read/write capabilities rather than a CIRAM-index sentinel.
Submapper 1's dual-cartridge licensing timer and external option ROM are rejected. See
[NESdev mapper 68](https://www.nesdev.org/wiki/INES_Mapper_068).

## Sunsoft FME-7 (69)

A command register at `$8000-$9FFF` selects one of sixteen internal registers that a following
`$A000-$BFFF` parameter write commits:

| Command   | Effect                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| `$0`-`$7` | Eight 1 KiB CHR banks for PPU `$0000-$1FFF`.                                         |
| `$8`      | `$6000-$7FFF` window: bits 5-0 bank; bit 6 = RAM/ROM select; bit 7 = RAM enable.     |
| `$9`-`$B` | 8 KiB PRG banks at `$8000`/`$A000`/`$C000`; `$E000-$FFFF` fixed to the last bank.    |
| `$C`      | Mirroring: 0 vertical, 1 horizontal, 2 one-screen lower, 3 one-screen upper.         |
| `$D`      | IRQ control: bit 7 counter enable, bit 0 IRQ enable; any write acknowledges the IRQ. |
| `$E`/`$F` | Low/high byte of the 16-bit IRQ counter.                                             |

The IRQ counter decrements every CPU cycle while enabled (via `observeCpuBusCycle`) and asserts the
mapper IRQ line when it wraps `$0000`→`$FFFF`. The Sunsoft 5B expansion audio at `$C000-$FFFF` is not
emulated. See the [NESdev FME-7 page](https://www.nesdev.org/wiki/Sunsoft_FME-7). Representative
titles: Gimmick!, Batman: Return of the Joker.

## Bandai 74xx (70, 152)

One `$8000-$FFFF` latch with AND-type bus conflicts: a 16 KiB `$8000-$BFFF` bank (fixed last at
`$C000-$FFFF`) and an 8 KiB CHR bank. Mapper 70 uses bits 7-4 for PRG and keeps mirroring hardwired.
Mapper 152 spends bit 7 on single-screen mirroring (0 = screen A, 1 = screen B), leaving a 3-bit PRG
field. Its four-screen declarations are rejected because that output directly drives two-screen
CIRAM; mapper 70's hardwired variant may retain externally declared four-screen memory. Both are
implemented by `Bandai74Mapper` with a `hasMirroringControl` flag.

## Codemasters / Camerica (71)

A UNROM-style register at `$C000-$FFFF` selects the 16 KiB `$8000-$BFFF` bank; `$C000-$FFFF` is fixed
to the last bank; no bus conflicts. The BF9097 variant (submapper 1, e.g. Fire Hawk) adds single-screen
mirroring from `$9000-$9FFF` bit 4 and rejects four-screen layouts; submapper 0 (BF9093) keeps the
header's fixed mirroring, including externally declared four-screen memory.

## Jaleco JF-17 (72)

JF-17 maps one switchable 16 KiB PRG bank at `$8000-$BFFF`, fixes the final bank at
`$C000-$FFFF`, and switches one 8 KiB CHR-ROM bank. Its single AND-conflicted `$8000-$FFFF` port
feeds two edge-triggered latches: a low-to-high transition on effective D7 captures D2-D0 for PRG,
and a low-to-high transition on effective D6 captures D3-D0 for CHR. Continuous high writes do not
re-latch; a low write rearms each clock independently. The edge-history bits are therefore part of
save state rather than being reconstructed from the selected banks.

The board carries exactly 128 KiB each of PRG and CHR ROM, no PRG RAM or IRQ, and uses solder-pad
horizontal/vertical mirroring. JF-19 is mapper 92 and is not inferred from image size. The optional
µPD7756C sample playback used by _Moero!! Pro Tennis_ is not emulated because its external sample
payload is not present in ordinary iNES images. See
[NESdev mapper 72](https://www.nesdev.org/wiki/INES_Mapper_072).

## Konami VRC3 (73)

VRC3 maps an optional fixed 8 KiB PRG-RAM window at `$6000-$7FFF`, one switchable 16 KiB PRG-ROM
bank at `$8000-$BFFF`, the final 16 KiB bank at `$C000-$FFFF`, and fixed 8 KiB CHR RAM. Four
register ranges from `$8000` through `$BFFF` assemble a 16-bit IRQ latch from low nibbles; `$F000`
bits 2-0 select the PRG bank. Mirroring stays fixed from the cartridge solder pads.

The IRQ counter increments on every CPU cycle while enabled. In 16-bit mode, `$FFFF` overflow
asserts IRQ and reloads the full latch. In 8-bit mode only the low byte counts and reloads, while the
upper byte remains unchanged. `$C000` control writes acknowledge IRQ and optionally reload the full
counter; `$D000` acknowledges and copies the saved A flag into the enable flag. The implementation
keeps this counter separate from the scanline-capable VRC4/VRC6/VRC7 IRQ core. See
[NESdev VRC3](https://www.nesdev.org/wiki/VRC3).

## Waixing Type A (74)

Waixing's 43-393/43-406/860908C board retains the MMC3 PRG windows, `$A000` horizontal/vertical
mirroring, optional direct 8 KiB PRG RAM/NVRAM protection and filtered PPU-A12 IRQ. Its CHR path is
not ordinary MMC3 and does not make CHR ROM generally writable: an exact 1 KiB bank value `$08` or
`$09` selects the corresponding half of a board-owned 2 KiB volatile CHR RAM, while every other
value selects CHR ROM. R0 still forms a 2 KiB pair, so selecting `$08` exposes both RAM pages.

Legacy iNES cannot encode mixed CHR memory, so the board policy supplies the physical 2 KiB RAM;
NES 2.0 must declare exactly that capacity. The accepted base board has 128–512 KiB PRG ROM,
8–256 KiB CHR ROM, submapper 0 and two-screen mirroring. Threshold-based RAM selection, writable
CHR-ROM compatibility behavior, pure-CHR-RAM images and oversized or four-screen variants fail
closed. Two local exact-geometry images exercise `$08/$09`, modify CHR RAM, advance through hundreds
of distinct frames and reproduce identical 60-frame save-state replays; their copyrighted payloads
and checksums remain outside the repository. See
[NESdev mapper 74](https://www.nesdev.org/wiki/INES_Mapper_074).

## Konami VRC1 (75)

Three registers select 8 KiB PRG-ROM banks at `$8000`, `$A000` and `$C000`; `$E000-$FFFF` stays
fixed to the final bank. Two 4 KiB CHR-ROM windows take their low four bank bits from `$E000` and
`$F000`, while `$9000` bits 1-2 provide each window's fifth bit. `$9000` bit 0 selects
vertical/horizontal mirroring, except on cartridges with four-screen VRAM where the line is ignored.
The VRC1 has no PRG RAM, IRQ or bus conflicts. See the
[NESdev VRC1 reference](https://www.nesdev.org/wiki/VRC1).

## Namco 3446 (76)

Mapper 76 keeps the Namco 108 family's two switchable and two fixed 8 KiB PRG windows, but rewires
CHR as four 2 KiB windows selected by R2-R5. R0/R1 are physically inaccessible for CHR selection.
The board reaches 128 KiB CHR ROM with no IRQ, PRG RAM, mirroring register or bus conflicts. See the
[Namco 108 family reference](https://www.nesdev.org/wiki/INES_Mapper_206) and
[pinout](https://www.nesdev.org/wiki/Namcot_108_family_pinout).

## Irem LROG017 (77)

This singleton board for _Napoleon Senki_ maps one of four 32 KiB PRG banks at `$8000-$FFFF` and
one of sixteen 2 KiB CHR-ROM banks at `$0000-$07FF`. An AND-conflicted latch uses D3-D0 for PRG and
D7-D4 for CHR. The remaining pattern range `$0800-$1FFF` is three fixed 2 KiB windows into an 8 KiB
cartridge RAM chip; the chip's fourth window owns nametable `$2000-$27FF`.

The board's nametable circuit is not represented as generic four-screen mirroring. `$2800-$2FFF`
routes to the console's two CIRAM pages, while `$3000-$3EFF` is electrically undriven and ignores
writes. The mapper therefore reports a value/drive mask for cartridge-owned nametable reads and a
direct CIRAM route for the remaining two pages. Legacy iNES implies the otherwise-unrepresentable
8 KiB mixed CHR RAM; NES 2.0 must declare it explicitly. Geometry is fixed at 128 KiB PRG and
32 KiB CHR ROM, with no PRG RAM or IRQ. See
[NESdev mapper 77](https://www.nesdev.org/wiki/INES_Mapper_077).

## Irem 74HC161/32 (78)

One conflict-prone `$8000-$FFFF` latch combines a 16 KiB `$8000-$BFFF` PRG bank (last bank fixed at
`$C000-$FFFF`), an 8 KiB CHR bank and nametable control. Bits 2-0 select PRG, bit 3 controls
mirroring and bits 7-4 select CHR. The physical mirroring wire differs: Cosmo Carrier selects
one-screen lower/upper, while Holy Diver selects horizontal/vertical. NES 2.0 submapper 1 and 3 name
those boards; submapper 0 is rejected. For legacy iNES, the historical alternative-nametable flag
selects Holy Diver wiring and a clear flag selects Cosmo Carrier wiring. That legacy flag is not a
four-screen declaration; NES 2.0 four-screen layouts are rejected for both modeled boards. See
[NESdev mapper 78](https://www.nesdev.org/wiki/INES_Mapper_078).

## AVE NINA-03/NINA-06 (79)

The single bank latch is decoded in CPU expansion space only when
`(address & $E100) == $4100`. D3 selects one of two 32 KiB PRG banks and D2-D0 select one of eight
8 KiB CHR-ROM banks. Reads from the expansion range stay open bus, mirroring remains solder-pad
controlled, and the board has no PRG RAM, IRQ or bus conflicts. See
[NESdev mapper 79](https://www.nesdev.org/wiki/INES_Mapper_079).

## Taito X1-005 (80)

The X1-005 exposes three switchable 8 KiB PRG windows followed by the fixed final bank, and two
2 KiB plus four 1 KiB CHR windows. `$7EF6/$7EF7` select horizontal/vertical mirroring.
`$7EFA/$7EFB`, `$7EFC/$7EFD` and `$7EFE/$7EFF` are paired mirrors of the three PRG registers.
CPU A7 is ignored, so all control registers also decode at `$7E70-$7E7F`.

Its 128 internal RAM bytes appear twice across `$7F00-$7FFF` only while the permission latch written
through `$7EF8/$7EF9` equals `$A3`; disabled reads remain open bus. Cartridge format policy
normalizes legacy iNES's generic RAM size to 128 bytes, with the battery flag selecting persistent
or volatile ownership. See [NESdev mapper 80](https://www.nesdev.org/wiki/INES_Mapper_080).

## Taito X1-017 (82)

X1-017 keeps the mixed CHR windows but can exchange which pattern-table half holds the two 2 KiB
windows through `$7EF6` bit 1. Mapper 82 preserves the historical shifted PRG-ROM image order:
`$7EFA-$7EFC` values select each 8 KiB bank after shifting right two bits; the final bank remains
fixed. The corrected physical ROM-line order and 512 KiB capacity are NES 2.0 mapper 552.

The ASIC owns 5 KiB of battery RAM at `$6000-$73FF`, split into 2/2/1 KiB regions independently
enabled by `$CA`, `$69` and `$84` at `$7EF7-$7EF9`. Strong internal pull-downs make disabled RAM,
write-only registers and other otherwise floating CPU reads return zero.

The reverse-engineered IRQ uses an 8-bit latch at `$7EFD`, control at `$7EFE`, and acknowledge at
`$7EFF`. Disabling count loads `(latch+2)*16` (17 for zero); acknowledgement loads
`(latch+1)*16` (1 for zero). Counting decrements each CPU cycle, while the independent output bit
asynchronously gates a pending IRQ. See [NESdev X1-017](https://www.nesdev.org/wiki/INES_Mapper_082)
and the [hardware test record](https://forums.nesdev.org/viewtopic.php?t=19724).

## Cony/Yoko ASIC (83)

Mapper 83 uses one ASIC on four electrically distinct PCBs. `ConyYokoBoard` keeps those connections
immutable: submapper 0 has eight 1 KiB CHR-ROM windows, submapper 1 rewires registers 0/1/6/7 into
four 2 KiB windows, submapper 2 adds shared PRG/CHR outer lines plus four battery-backed 8 KiB
NVRAM banks, and submapper 3 reduces the inner PRG region from 256 KiB to 128 KiB while routing the
top base bits to CHR only. Legacy iNES selects the standard 83.0 board; unsupported submappers and
contradictory RAM/ROM declarations fail at creation rather than use title hashes.

The PRG base and mode registers select UxROM, mirrored 16 KiB or two equivalent four-register 8 KiB
modes. In register mode, `$8300-$8302` select the first three CPU windows, `$E000-$FFFF` is fixed to
the last bank inside the selected region, and `$8303` supplies an optional ROM bank at
`$6000-$7FFF`; submapper 2 always uses that range for its selected NVRAM bank instead. Mode bits
also select vertical, horizontal or either one-screen nametable arrangement.

The ASIC decodes four mirrored scratch bytes in expansion space. `$5000` reads drive only D1-D0
from external solder pads, leaving D7-D2 on the CPU bus; the default board setting is the unbridged
value zero because neither accepted header format records it. The 16-bit one-shot IRQ counter can
increment or decrement on every CPU M2 cycle or on every unfiltered PPU-A12 rise. LSB writes
acknowledge, MSB writes arm counting when the mode's enable bit is set, and reaching zero disables
the counter and asserts IRQ. Current hardware evidence proves `$00`/`$FF` as the two source values
but not the decisive individual data bit, so other patterns deliberately preserve the prior
source. See [NESdev mapper 83](https://www.nesdev.org/wiki/INES_Mapper_083).

## Jaleco CHR (87)

A latch at `$6000-$7FFF` selects the 8 KiB CHR bank with its two select lines reversed (value bit 1 →
CHR line 0, value bit 0 → CHR line 1). PRG ROM stays NROM-fixed; no bus conflicts because the latch
occupies the otherwise-unmapped `$6000-$7FFF` space.

## Namco 3433/3443 (88)

Mapper 88 retains the standard two 2 KiB plus four 1 KiB Namco CHR windows, while PPU A12 directly
drives CHR A16. The `$0000` and `$1000` pattern tables therefore select separate 64 KiB halves of a
128 KiB CHR ROM. Undersized CHR naturally mirrors into the lower capacity. PRG layout and missing
IRQ/RAM/mirroring registers match mapper 206. See
[NESdev mapper 206 variants](https://www.nesdev.org/wiki/INES_Mapper_206).

## Sunsoft-2 / Sunsoft-3 (89)

One conflict-prone register across `$8000-$FFFF` selects the 16 KiB PRG bank at `$8000-$BFFF` from
bits 6-4 while fixing the final bank at `$C000-$FFFF`. Bits 2-0 select the low CHR bank bits and bit
7 supplies the high bit for one 8 KiB CHR-ROM window; bit 3 selects lower/upper one-screen
mirroring. The board maps no PRG RAM and does not provide four-screen nametable memory. See
[NESdev mapper 89](https://www.nesdev.org/wiki/INES_Mapper_089) and the
[Sunsoft-2 pinout](https://www.nesdev.org/wiki/Sunsoft_2_pinout).

## J.Y. Company EL861226C (90)

Mapper 90 is one physical configuration of J.Y. Company's shared ASIC, not an alias for mapper
35/209/211. Four 7-bit PRG registers feed 32, 16 or 8 KiB modes inside one of four 512 KiB outer
regions; the fourth register can replace the normally fixed final window, and mode 3 reverses all
seven register bits before the 512 KiB inner mask. `$6000-$7FFF` maps an optional direct 8 KiB
WRAM/NVRAM window or a mode-derived PRG-ROM bank.

Eight 16-bit CHR registers feed 8, 4, 2 or 1 KiB windows. `$D003` chooses a 256 or 512 KiB inner
region and enough outer lines to reach 2 MiB, while its high bit enables MMC4-like post-read
latches in 4 KiB mode. CHR RAM follows the same addressing and remains write-protected until
`$D002` bit 6 is set. The mapper-90 PCB jumper suppresses both ROM nametables and Extended
Mirroring; the corresponding ASIC registers are retained but only `$D001` bits 1-0 can route
CIRAM as vertical, horizontal or either one-screen arrangement.

Expansion space provides three exact jumper reads and four arithmetic registers. Writing the
second multiplier operand starts an eight-M2-cycle unsigned multiplication; early reads expose
the deterministic staged shift/add result, and the completed 16-bit product remains until another
multiply starts. `$5802` is a wrapping accumulator, while `$5803` clears it and stores a readable
test byte.

The IRQ clocks from CPU M2, unfiltered PPU-A12 rises, completed PPU reads or CPU writes. It can
increment or decrement through an 8- or 256-count prescaler; prescaler and counter loads are XORed
with `$C006`, and a wrap asserts a level-sensitive IRQ until either disable port acknowledges it.
`$C001` bit 3 and `$C007` are preserved without invented semantics because their hardware function
is still unknown and no known software uses it. See the
[J.Y. Company ASIC reference](https://www.nesdev.org/wiki/INES_Mapper_090).

## JY830623C / EJ-006-1 (91)

Both mapper-91 boards use two switchable 8 KiB PRG windows followed by a fixed 16 KiB tail and four
independent 2 KiB CHR-ROM windows. They map no PRG RAM, and reads from their write-only
`$6000-$7FFF` registers remain open bus. `Mapper91Banking` owns only this common data path.

Submapper 0 models JY830623C/YY840238C. `$6000-$6003` select CHR and `$7000-$7001` select the low
PRG bank bits under mask `$F003`. A write anywhere in `$8000-$9FFF` ignores its data and latches
address A2-A0: A2-A1 select one of four 128 KiB PRG regions (including that region's fixed final
16 KiB), while A0 selects one of two 512 KiB CHR regions. Mirroring is hardwired. `$7007` resets and
starts an IRQ counter that asserts after exactly 64 unfiltered low→high PPU-A12 transitions;
`$7006` stops and acknowledges it.

Submapper 1 models EJ-006-1 and has no outer latch. Its `$F007` decode adds `$6004/$6005`
horizontal/vertical mirroring and `$6006/$6007` low/high bytes of a 16-bit IRQ counter. `$7007`
resets the M2 divider and starts counting; every fourth CPU cycle subtracts five, and a borrow
asserts IRQ. `$7006` stops counting and acknowledges the line. This board reaches at most 128 KiB
PRG and 512 KiB CHR, while submapper 0 reaches 512 KiB/1 MiB. See
[NESdev mapper 91](https://www.nesdev.org/wiki/INES_Mapper_091).

## Sunsoft-2 / Sunsoft-3R (93)

The Sunsoft-3R board uses the same Sunsoft-2 IC with different wiring. Bits 6-4 of its
AND-conflicted `$8000-$FFFF` latch select the 16 KiB PRG bank at `$8000-$BFFF`; the final bank stays
fixed at `$C000-$FFFF`. D0 controls the fixed 8 KiB CHR RAM: clear ignores writes and tri-states
pattern reads, while set enables normal RAM access. Mirroring remains fixed from the cartridge
header and no PRG RAM is decoded. See
[NESdev mapper 93](https://www.nesdev.org/wiki/INES_Mapper_093) and the
[Sunsoft-2 pinout](https://www.nesdev.org/wiki/Sunsoft_2_pinout).

## UxROM variants (94, 180)

Both variants reuse `UxromMapper` through immutable board wiring rather than duplicate bank logic.
UN1ROM (94) keeps the usual switchable `$8000-$BFFF`/fixed-last `$C000-$FFFF` layout but decodes the
bank from conflict-masked bits 4-2; it requires 128 KiB PRG and 8 KiB CHR RAM. Mapper 180 fixes PRG
bank 0 at `$8000-$BFFF` and switches `$C000-$FFFF` from bits 2-0. Its legacy default has AND
conflicts, while NES 2.0 submapper 1/2 selects no-conflict/conflict behavior explicitly. See
[NESdev mapper 94](https://www.nesdev.org/wiki/INES_Mapper_094) and
[NESdev mapper 180](https://www.nesdev.org/wiki/INES_Mapper_180).

## Namco 3425 (95)

Mapper 95 is the Namco 108 layout with CHR A15 also connected to CIRAM A10. R0 selects the nametable
used by `$2000-$27FF`; R1 selects `$2800-$2FFF`, producing horizontal or either one-screen layout
from the same bits that select the two 2 KiB CHR banks. Fixed mirroring and MMC3-style approximations
would lose that coupling, so the mapper routes each nametable access directly. See
[NESdev mapper 95](https://www.nesdev.org/wiki/INES_Mapper_095).

## Bandai Oeka Kids (96)

The board contains exactly 128 KiB PRG ROM and 32 KiB CHR RAM. One AND-conflicted
`$8000-$FFFF` latch uses D1-D0 to select a 32 KiB PRG bank and D2 to select the outer 16 KiB CHR
region. PPU `$1000-$1FFF` always uses logical 4 KiB bank 3 or 7; `$0000-$0FFF` combines that outer
bit with a two-bit inner latch.

The inner latch is driven by PPU address lines rather than read/write strobes. A transition from any
non-`$2xxx` address to `$2xxx` captures PPU A9-A8, including transitions caused by CPU PPUADDR and
PPUDATA activity. Save states therefore preserve the last observed 14-bit PPU address as well as
both bank latches. Mirroring is hardwired vertical, and the board has no PRG RAM or IRQ. Legacy
iNES cannot encode its 32 KiB CHR RAM, so cartridge format policy normalizes mapper 96's zero-CHR
header to the physical capacity; NES 2.0 must declare it explicitly. The Oeka Kids tablet input
device remains outside this mapper implementation. See
[NESdev mapper 96](https://www.nesdev.org/wiki/INES_Mapper_096).

## Irem TAM-S1 (97)

The final 16 KiB PRG bank is fixed at `$8000-$BFFF`; D3-D0 select the 16 KiB bank at
`$C000-$FFFF`. D7-D6 select lower one-screen, horizontal, vertical or upper one-screen mirroring.
The known board carries 256 KiB PRG ROM and fixed 8 KiB CHR RAM, with no PRG RAM, IRQ or bus
conflict. See the
[TAM-S1 hardware analysis](https://forums.nesdev.org/viewtopic.php?t=19769).

## VS System mainboard (99)

Mapper 99 models the populated sockets on the VS mainboard, not a modulo-wrapped CNROM cartridge.
CPU `$8000-$9FFF` selects socket 0 or the fifth Gumshoe socket; `$A000-$FFFF` maps sockets 1–3.
PPU `$0000-$1FFF` selects either 8 KiB CHR socket. CPU OUT2 (`$4016` bit 2) changes both selections
when the controller latch commits. Missing fixed PRG sockets, the alternate PRG socket or the second
CHR socket are electrically undriven. The 2 KiB `$6000-$7FFF` shared RAM repeats every `$800`
bytes, and nametables are four-screen on VS hardware.

The surrounding `VsSystem` console device owns coin/service/DIP inputs, the mirrored `$4020` coin
counter output and NES 2.0 UniSystem protection types 1–4. `PpuVariant` owns the 2C03 palette, four
2C04 permutations, 2C05 register swap/status signatures, RGB emphasis and the absence of the
RP2C02 odd-frame missing dot. Hardware types 5–6 are DualSystem and are rejected rather than
approximated with one CPU. See [NESdev mapper 99](https://www.nesdev.org/wiki/INES_Mapper_099),
[Vs. System](https://www.nesdev.org/wiki/Vs._System) and
[PPU palettes](https://www.nesdev.org/wiki/PPU_palettes). The resettable RBI/TKO byte streams and
decoded Super Xevious phases follow the maintained
[MAME VS driver](https://github.com/mamedev/mame/blob/master/src/mame/nintendo/vsnes.cpp); the
device remains console-owned because those boards use mapper 206, not mapper 99.

## NTDEC/Asder (112)

Mapper 112 uses a two-stage register path rather than the Namco 118 command layout. Even-address
mirrors of `$8000`, `$A000`, `$C000` and `$E000` select one of eight registers, write its byte,
write the outer CHR lines and select vertical/horizontal mirroring respectively. Odd-address writes
are ignored.

Registers 0 and 1 select the first two 8 KiB PRG-ROM windows; the final two windows are fixed to the
last two banks. Registers 2 and 3 each select an even-aligned 2 KiB CHR pair, while registers 4–7
select four independent 1 KiB CHR banks. `$C000` bits 4–7 independently supply CHR A18 to those
four 1 KiB registers only. The board exposes no PRG RAM, bus conflict or IRQ, and powers on with
cleared registers and vertical mirroring. Unsupported submappers, CHR RAM, four-screen nametables,
PRG images beyond 128 KiB and CHR images beyond 512 KiB fail closed. See
[NESdev mapper 112](https://www.nesdev.org/wiki/INES_Mapper_112).

## HES NTD-8 (113)

The NTD-8 extends NINA-03/NINA-06 with a single write-only expansion latch decoded when
`(address & $E100) == $4100`. Bits 5-3 select one of eight 32 KiB PRG-ROM banks. CHR selection is
deliberately non-contiguous: bit 6 supplies the high bit and bits 2-0 supply the low three bits for
one of sixteen 8 KiB CHR-ROM banks. Bit 7 selects horizontal (0) or vertical (1) mirroring.

Expansion reads remain open bus. The board has no PRG RAM, bus conflicts, IRQ or expansion audio;
power-on clears both bank fields and selects horizontal mirroring. Unsupported submappers,
four-screen nametable memory, CHR RAM and ROM images beyond 256 KiB PRG or 128 KiB CHR fail closed.
See [NESdev mapper 113](https://www.nesdev.org/wiki/INES_Mapper_113).

## SuperGame MMC3 clone (114, 182)

Mapper 114 wraps an MMC3A-compatible register core in the SuperGame/Hosenkan protection wiring.
Submapper 0 scrambles both the eight register addresses and bank indexes used by _Aladdin_, _The
Lion King_, _Pocahontas_ and related boards. Mapper 182 is a duplicate identity fixed to that
submapper-0 contract; mapper 114 submapper 1 alone uses Boogerman's distinct address and index
permutations. Bits 6-7 of either translated command retain their normal MMC3 PRG/CHR mode meaning.

The mirrored `$6000` register can override MMC3 PRG output with one 16 KiB bank repeated in both
halves (NROM-128 mode) or adjacent A14-selected banks (NROM-256 mode). `$6001` supplies the ninth
1 KiB CHR-ROM bank bit independently. Those addresses are not MMC3 WRAM: CPU reads remain open bus,
writes work regardless of the nested core's `$A001` protection state, and battery-backed memory is
rejected. Standard mode retains MMC3 PRG windows, horizontal/vertical mirroring and filtered A12,
but uses the MMC3A rule that reloading a zero IRQ latch does not assert IRQ.

Mapper 114 accepts submappers 0/1; mapper 182 accepts only submapper 0. Both identities accept
128–256 KiB PRG ROM, 8–512 KiB CHR ROM and two-screen nametables. One local 256+256 KiB _The Lion
King_ image advances through 800 frames, changes the MMC3 register set 27 times and reproduces an
IRQ-active 100-frame save-state replay. A same-sized mapper-182 _Pocahontas_ image also completes
deterministic replay. Both leave the outer registers zero, so NROM and CHR-A18 paths remain focused
board-test evidence. See [NESdev mapper 114/182](https://www.nesdev.org/wiki/INES_Mapper_182).

## Kasheng MMC3 clone (115, 248)

Mappers 115 and 248 are duplicate iNES identities for the Kasheng SFC-02B/-03/-004 boards around an
unscrambled MMC3-compatible core. The loader preserves the parsed ID, while both identities resolve
to one physical board entity and validation policy. `$6000.D6` supplies PRG A18 in every mode. With
D7 clear, the remaining PRG lines come from
MMC3 and preserve its normal four 8 KiB windows. With D7 set, bits 3-0 select a 16 KiB bank repeated
in both CPU halves (NROM-128), or D5 replaces the low bank bit with CPU A14 to select an adjacent
pair (NROM-256). `$6001.D0` independently supplies CHR A18 above the MMC3's eight CHR bank bits.

The `$600x` decode is outside MMC3 WRAM protection and maps across `$6000-$7FFF`. Reads matching
`$6002` drive only the three solder-pad bits; the project uses the unbridged value zero while the
upper data lines remain CPU open bus. Other reads are fully open bus, writable memory and battery
headers are rejected.
The nested core retains horizontal/vertical mirroring and revision-B/Sharp IRQ behavior, including
an IRQ when a zero latch is reloaded on a qualified A12 rise.

The board accepts 128–512 KiB PRG and 8–512 KiB CHR ROM with submapper 0 and two-screen nametables.
Two local mapper-115 _Yuu Yuu Hakusho Final_ images complete 700 non-halted frames and deterministic
100-frame save-state replays. The 512 KiB Chinese image actively toggles CHR A18; neither image
enables NROM override. A local mapper-248 _Bao Qing Tian_ image with 256 KiB each of PRG and CHR
also completes deterministic replay; focused tests prove both IDs enter the same board state
machine. See
[NESdev mapper 115](https://www.nesdev.org/wiki/INES_Mapper_115).

## TxSROM and TQROM (118, 119)

Both boards reuse the complete revision-B MMC3 banking and filtered-A12 IRQ state machine.

TxSROM connects CHR A17 to CIRAM A10 instead of using MMC3's mirroring output. Depending on CHR mode,
R0/R1 select nametables in two 2 KiB pairs or R2-R5 select all four 1 KiB slots independently;
`$A000` mirroring writes have no effect. See
[NESdev mapper 118](https://www.nesdev.org/wiki/INES_Mapper_118).

TQROM keeps standard MMC3 mirroring but connects CHR A16 to chip enable: bank values with bit 6 clear
select 16–64 KiB CHR ROM, while set values select one of eight 1 KiB CHR-RAM banks. Official boards
use 128 KiB PRG ROM, 8 KiB volatile CHR RAM and no PRG RAM. Legacy iNES cannot declare the mixed CHR
layout, so mapper 119 implies the RAM; NES 2.0 must declare it explicitly. See
[NESdev mapper 119](https://www.nesdev.org/wiki/TQROM).

## Jaleco JF-11/JF-14 (140)

A write-only latch throughout `$6000-$7FFF` uses bits 5-4 to select one of four 32 KiB PRG banks and
bits 3-0 to select one of sixteen 8 KiB CHR-ROM banks. The register occupies otherwise-unmapped
space, so writes have no bus conflicts and reads remain open bus. PRG and CHR are limited to the
128 KiB reachable by those physical select lines. See
[NESdev mapper 140](https://www.nesdev.org/wiki/INES_Mapper_140).

## Sunsoft-1 (184)

PRG ROM is a fixed 32 KiB window. The write-only `$6000-$7FFF` latch selects the lower 4 KiB CHR bank
from bits 2-0 and the upper 4 KiB bank from bits 5-4; the upper CHR A14 line is hard-wired high, so
that window selects banks 4-7 on a 32 KiB CHR ROM and mirrors onto banks 0-3 on a 16 KiB ROM. Reads
from the latch window remain open bus. See
[NESdev mapper 184](https://www.nesdev.org/wiki/INES_Mapper_184) and the
[Sunsoft-1 pinout](https://www.nesdev.org/wiki/Sunsoft_1_pinout).

## CNROM protection (185)

Mapper 185 is a one-bank CNROM variant whose two-bit conflicted latch controls the CHR-ROM
chip-select line rather than selecting among banks. When the selected value does not match the
board's enable wiring, the cartridge tri-states PPU pattern reads. NES 2.0 submappers 4-7 explicitly
identify enable values 0-3 and are supported; legacy/submapper 0 does not identify that value and
fails closed. PRG stays fixed as a 16 KiB mirrored or 32 KiB image, and PRG RAM is absent. See
[NESdev mapper 185](https://www.nesdev.org/wiki/INES_Mapper_185).

## TXC MMC3 (189)

Mapper 189 is two concrete board layers rather than an MMC3 bank-mask special case. The inner MMC3
retains its standard 1/2 KiB CHR-ROM registers, horizontal/vertical mirroring and filtered-A12 IRQ
counter. An external TXC latch replaces all four CPU PRG windows with one consecutive 32 KiB bank,
so MMC3 R6/R7 and PRG mode do not affect CPU ROM mapping.

For compatibility across the original and rewired pirate boards, every write in `$4020-$7FFF`
combines the data byte's upper and lower nibbles with bitwise OR and uses the low three result bits as
the PRG bank. The range is write-only and never becomes PRG RAM, even though some board variants
reach the latch through the MMC3 WRAM interface. `TxcMmc3189Mapper` owns that outer latch and
delegates only the physically retained MMC3 behavior to `Mmc3Mapper`; save state keeps both owners
as separate validated layers. See [NESdev mapper 189](https://www.nesdev.org/wiki/INES_Mapper_189).

## Namco 118 / DxROM (206)

The discrete predecessor to MMC3. `$8000` (even) selects one of eight bank registers and `$8001` (odd)
writes it: R0/R1 are 2 KiB CHR banks at PPU `$0000`/`$0800`, R2-R5 are 1 KiB CHR banks at
`$1000-$1FFF`, and R6/R7 are 8 KiB PRG banks at `$8000`/`$A000` with the final two banks fixed. There
is no IRQ, no PRG-RAM and no mirroring register, so mirroring stays hardwired from the header. Writes
to `$A000-$FFFF` are ignored. See
[NESdev mapper 206](https://www.nesdev.org/wiki/INES_Mapper_206).

## Waixing F003 (245)

F003 reuses the MMC3 register decoder but changes its physical outputs. CPU PRG windows retain the
standard R6/R7 and fixed-tail modes inside one 512 KiB region. The MMC3 CHR A11 output becomes PRG
A19, so bit 1 of the CHR register selected by PPU A10/A11 chooses the lower or upper region for all
four CPU windows. The board grounds the MMC3's PPU A12 input: CHR mode 0 therefore selects only R0/R1
and CHR mode 1 selects only R2-R5. Games must program every register reachable in the selected mode
to the same outer bit if they do not want PRG to change between PPU fetches.

The cartridge's 8 KiB CHR-RAM is wired directly to PPU A10-A12 and is never banked. Grounded MMC3
A12 also means its scanline IRQ cannot receive a clock. Horizontal/vertical mirroring, PRG banking
and the protected `$6000-$7FFF` window remain MMC3-controlled; F003 requires exactly 8 KiB of
battery-backed PRG NVRAM. `WaixingF003Mapper` owns the changed pin routing and composes the unchanged
register behavior through `Mmc3Mapper`, with both layers validated in save state. PRG images from
128 KiB through 1 MiB are accepted only at power-of-two board sizes; images declaring CHR-ROM fail
closed rather than being mistaken for this board. See
[NESdev mapper 245](https://www.nesdev.org/wiki/INES_Mapper_245).

## Adding a mapper

1. Add one implementation file named after the board family.
2. Add its `MapperKind` discriminant and `MapperState` shape.
3. Register its identity in `create-mapper.ts`, including submapper policy, complete bank geometry,
   maximum reachable ROM and explicit PRG/CHR RAM capabilities.
4. Implement only the optional CPU/PPU signal hooks the physical board consumes.
5. Define deterministic power-on state and validate every runtime save-state field before mutation.
6. Add focused tests for PRG, CHR, mirroring, RAM, conflicts, reset and IRQ/latch behavior, plus a
   save-state round-trip and factory rejection tests.
7. Add a PPU/CPU/bus integration regression when behavior depends on transaction ordering.
8. Add an external conformance result when a redistributable fixture exists; never commit commercial
   ROMs.
9. Update [../mapper-compatibility.md](../mapper-compatibility.md) and this reference.

Board behavior must come from technical documentation and executable conformance evidence, not from
ROM title lists. New focused tests earn `Implemented`; promotion to `Verified` follows the evidence
rules in [Testing](../testing.md).
