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
| 12  | Rex/FFE 4M     | board-specific            | Rex Soft or FFE card mapper  | no            | both |
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
| 41  | Caltron 6-in-1 | `caltron-41`              | `caltron-41-mapper.ts`       | inner AND     | no   |
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
| 86  | Jaleco JF-13   | `jaleco-jf13-86`          | `jaleco-jf13-mapper.ts`      | no            | no   |
| 87  | Jaleco CHR     | `jaleco-87`               | `jaleco-mapper.ts`           | no            | no   |
| 88  | Namco 3433     | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 89  | Sunsoft-2      | `sunsoft-2`               | `sunsoft2-mapper.ts`         | AND           | no   |
| 90  | J.Y. Company   | `jy-company`              | `jy-company-mapper.ts`       | no            | both |
| 91  | JY/EJ bootleg  | board-specific            | two boards + shared banking  | no            | both |
| 92  | Jaleco JF-19   | `jaleco-jf17`             | `jaleco-jf17-mapper.ts`      | AND           | no   |
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
| 117 | Future Media   | `future-media-117`        | `future-media-117-mapper.ts` | no            | A12  |
| 118 | TxSROM         | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 119 | TQROM          | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |
| 133 | Sachen SA72008 | `sachen-sa72008-133`      | `sachen-sa72008-mapper.ts`   | no            | no   |
| 140 | Jaleco JF      | `jaleco-jf`               | `jaleco-jf-mapper.ts`        | no            | no   |
| 142 | Kaiser KS7032  | `kaiser-ks202-142`        | `kaiser-ks202-mapper.ts`     | no            | cyc. |
| 150 | Sachen SA-015  | `sachen-sa015-150`        | `sachen-sa015-mapper.ts`     | no            | no   |
| 152 | Bandai 74xx    | `bandai-74`               | `bandai74-mapper.ts`         | AND           | no   |
| 163 | Nanjing FC-001 | `nanjing-fc001-163`       | `nanjing-fc001-mapper.ts`    | no            | no   |
| 164 | Dongda PEC9588 | `dongda-pec9588-164`      | `dongda-pec9588-mapper.ts`   | no            | no   |
| 180 | Inverted UxROM | `uxrom`                   | `uxrom-mapper.ts`            | submapper     | no   |
| 182 | SuperGame MMC3 | `supergame-114`           | `supergame-114-mapper.ts`    | no            | A12  |
| 184 | Sunsoft-1      | `sunsoft-1`               | `sunsoft1-mapper.ts`         | no            | no   |
| 185 | CNROM protect  | `cnrom-protection`        | `cnrom-protection-mapper.ts` | AND           | no   |
| 187 | UNL SF3/KOF96  | `unl-187`                 | `unl-187-mapper.ts`          | no            | A12  |
| 189 | TXC MMC3       | `txc-mmc3-189`            | `txc-mmc3-189-mapper.ts`     | no            | A12  |
| 206 | Namco 118      | `namco-118`               | `namco118-mapper.ts`         | no            | no   |
| 225 | ET-4310/K-1010 | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 226 | BMC 42/63/76-1 | `bmc-226`                 | `bmc-226-mapper.ts`          | no            | no   |
| 227 | 810449/FW-01   | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 228 | Active Ent.    | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 240 | C&E/Supertone  | `ce-supertone-240`        | `ce-supertone-mapper.ts`     | no            | no   |
| 241 | BxROM + WRAM   | `bxrom-wram-241`          | `bxrom-wram-241-mapper.ts`   | no            | no   |
| 242 | Waixing 43272  | `address-latch-multicart` | shared multicart mapper      | no            | no   |
| 243 | Sachen SA-020A | `sachen-sa020a-243`       | `sachen-sa020a-mapper.ts`    | no            | no   |
| 244 | C&E Decathlon  | `ce-decathlon-244`        | `ce-decathlon-mapper.ts`     | no            | no   |
| 245 | Waixing F003   | `waixing-f003-245`        | `waixing-f003-mapper.ts`     | no            | no   |
| 246 | C&E Fong Shen  | `ce-fong-shen-bang-246`   | Fong Shen board mapper       | no            | no   |
| 248 | Kasheng MMC3   | `kasheng-115`             | `kasheng-115-mapper.ts`      | no            | A12  |
| 250 | MMC3 addr/data | `mmc3`                    | `mmc3-mapper.ts`             | no            | A12  |

The shared CHR-latch banks used by MMC2 and MMC4 live in `chr-latch-banks.ts`; the MMC1 board wiring
lives in `mmc1-board.ts`; the mapper 34 board decision lives in `mapper34-board.ts`. Namco
76/88/95/206 select immutable pin-wiring values around one register core, while
MMC3/TxSROM/TQROM/mapper-250 select only the board behavior that differs around the shared MMC3
state machine.
Mapper 12.0 composes that MMC3 state machine with one Rex Soft GAL; mapper 12.1 resolves to the
existing FFE RAM-card owner instead of merging the two unrelated boards.
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

The pinned HVC-ELROM-01 _Uchuu Keibitai SDF_ profile identifies its 128 KiB PRG and 128 KiB CHR
payload with independent CRCs `D979C8B7`/`8734D65D`; an exact legacy-content record corrects the
old iNES header's otherwise ambiguous RAM field to the board's physical zero-WRAM layout. The
public-facade run reaches active play for 1,800 frames and locks video, audio, CPU cycles, both CHR
register sets, ExRAM modes 0/2, nametable routing, multiplication, dual-pulse state and a 120-frame
save-state replay. CHR high-bit banking, vertical split, scanline/timer/PCM IRQ edges and other RAM
geometries retain their focused test evidence and are not inferred from this title.

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

NES 2.0 mapper 12.1 is a 4M Super Magic Card extraction, not the Rex Soft board described below.
It powers up with `$4500=$42`, protected 4M banking and the final four header PRG banks visible.
Because this card has only 32 KiB CHR RAM, the header's CHR payload is copied into mutable PRG-card
memory beginning at `$40000`; the loader explicitly transfers the pages it needs into CHR RAM.

An optional 512-byte trainer represents the copier loader, not generic `$7000` initialization.
Mapper 6 and mapper 12.1 load it at `$7000`, cold-call `$7003`, then return to the ROM reset vector.
Mapper 17 submappers 0-3 cold-jump to `$7000`, `$5D00`, `$5E00` or `$5F00`; warm reset always uses
the normal reset vector. The external FDS/BIOS, copier GUI, transfer port and pass-through cartridge
hardware used to create an extraction are deliberately outside this execution format. See
[NESdev mapper 6](https://www.nesdev.org/wiki/INES_Mapper_006),
[mapper 12](https://www.nesdev.org/wiki/INES_Mapper_012),
[mapper 17](https://www.nesdev.org/wiki/INES_Mapper_017), and
[Super Magic Card](https://www.nesdev.org/wiki/Super_Magic_Card).

The checksum-pinned mapper-6 _Ganbare Goemon! Karakuri Douchuu_ extraction retains its 512-byte
trainer and runs 600 title frames plus a 1,200-frame route into the first stage. Exact checkpoints
observe legacy latch mode 1, PRG banks 6 then 0, CHR bank 1 and the write-protected PRG path. The
runner hashes the complete 256 KiB PRG-card and 32 KiB CHR-card typed arrays as compact
type/length/SHA-256 records, so mutable card contents remain fully pinned without committing
hundreds of thousands of numeric object properties. Video, native audio, CPU cycles and an
input-active 120-frame save-state replay are deterministic. The title does not exercise alternate
latch modes, other mirroring settings or the FDS-compatible data IRQ; mapper 8 remains a separate
external-evidence target.

The checksum-pinned mapper-17 _Street Fighter 2010: The Final Fight_ extraction retains its trainer
and verifies the board's distinct direct cold jump to `$7000` with stack pointer `$FD`, followed by
the normal `$FF80` vector on warm reset. A 600-frame baseline and 1,800-frame input route cross the
title, introduction and active Planet 1 play with 820 distinct frames. Compact mapper checkpoints
pin the complete 512 KiB PRG card, 256 KiB CHR card and 4 KiB scratch RAM while observing all four
PRG windows, direct 1 KiB CHR banking, `$47`-to-`$4F` mode evolution, both mirroring orientations and
the PPU-A12 IRQ source. Video, native audio, CPU cycles and an input-active 120-frame save-state
replay are deterministic. This route does not claim submapper 1–3 trainer addresses, CPU-M2 IRQ,
MMC4 latches or CHR-backed nametables; focused tests remain the evidence for those paths.

## AxROM (7)

32 KiB switchable PRG bank over the whole `$8000-$FFFF` window with single-screen mirroring selected by
register bit 4; CHR is 8 KiB RAM. The legacy default is no bus conflicts (ANROM); NES 2.0 submapper 2
selects AMROM/AOROM AND conflicts. The 512 KiB bit-3 PRG extension is supported. PRG-RAM declarations
are rejected because AxROM has no PRG-RAM window, and four-screen declarations are rejected because
the board register directly selects one of the console's two CIRAM pages. Exact legacy content
metadata identifies the NES-AOROM-03 _Battletoads_ board as zero-WRAM. Its pinned opening profile
crosses PRG banks 6, 7 and 0, both single-screen pages, CHR-RAM rendering, native audio and
input-active save-state replay. The bounded route verifies the opening/title sequence rather than
first-stage gameplay.

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
Famicom Wars. A pinned FKROM-01 _Fire Emblem: Ankoku Ryuu to Hikari no Tsurugi_ profile locks 2,400
input-driven frames, exact visual/audio/CPU output and a deterministic save-state replay. Six mapper
checkpoints capture PRG and all four CHR registers, mirroring and the right pattern-table latch before
and after its first FE transition; focused tests retain full FD/FE range and NVRAM coverage.

## Color Dreams (11)

One `$8000-$FFFF` latch: bits 1-0 select a 32 KiB PRG bank, bits 7-4 an 8 KiB CHR bank, with documented
AND-type bus conflicts. The no-conflict prototype board variant is out of scope. Exact content
metadata identifies _Bible Adventures_ 1.3 as the zero-WRAM, vertical-mirroring BC6
`COLORDREAMS-74*377` board. Its pinned 1,800-frame route advances from the story into active Baby
Moses gameplay, crosses both PRG banks and CHR banks 7/4, and locks visual/audio/CPU output plus an
input-active save-state replay. Focused tests separately preserve the exact bitwise-AND conflict
behavior.

## Rex Soft SL-5020B (12)

Legacy mapper 12 and NES 2.0 submapper 0 select the 256 KiB PRG + 512 KiB CHR SL-5020B board. Its
Huang-1 ASIC runs exclusively in MMC3 mode with revision-A IRQ behavior and an optional direct
8 KiB WRAM/NVRAM window. A separate GAL decodes every expansion write matching `$E100=$4100`:
D0 supplies CHR A18 for PPU `$0000-$0FFF`, while D4 supplies it for `$1000-$1FFF`. The choice follows
physical PPU A12 rather than MMC3 `$8000` bit 7, and changes the visible CHR page immediately.

Reads at the same aliases drive only D0 and leave D7-D1 open. Current board evidence finds no jumper
and all known copies hard-wire D0 to 1 for Chinese text. Power-on clears the two connected outer
bits; save state retains them beside the complete nested MMC3 state. Unknown submappers, different
ROM capacities and four-screen wiring fail before execution.

[NESdev mapper 12](https://www.nesdev.org/wiki/INES_Mapper_012) and pinned
[Mesen CE](https://github.com/nesdev-org/MesenCE/blob/7f418e352a2bab89f239ca09930a0c2b5074f9e3/Core/NES/Mappers/Mmc3Variants/MMC3_12.h)
agree on immediate, PPU-half-selected CHR A18 and MMC3A IRQs. Older
[FCEUX behavior](https://github.com/TASEmulators/fceux/blob/a62b868e9247c4aafd66f597cdfa8d2609704087/src/boards/mmc3.cpp#L377-L411)
deferred the outer value until another MMC3 bank write and toggled a virtual language switch on
reset; neither behavior is a second physical board. The local SHA-256
`4e8d261a023aa4bd6a4c43a88200f63bd2a0ae9437a5216e016ba4d6713d9cc8` _Dragon Ball Z 5_ ran
1,200 frames without halting and replayed frames 601-720 byte-identically. It read `$4132` once and
wrote `$02` 1,400 times, never asserting the connected D0/D4 outer bits; therefore the ROM is useful
execution evidence but not a real-ROM proof of upper-half CHR switching.

## CPROM (13)

Fixed 32 KiB PRG. 16 KiB CHR RAM is split into a fixed `$0000-$0FFF` bank 0 and a `$1000-$1FFF` bank
selected by bits 1-0 of the `$8000-$FFFF` register with AND-type bus conflicts. Because legacy iNES
cannot declare the implied 16 KiB CHR RAM, CPROM images require an NES 2.0 header.

## Address-latch multicarts (15, 225, 227, 228, 242)

`AddressLatchMulticartMapper` shares only the physical behavior common to these discrete boards: a
write-address latch, the data bits used by 15/228, mirroring, optional four-nibble register RAM and
the PRG/CHR address equations. `AddressLatchMulticartBoard` fixes the materially different wiring;
the class does not emulate a fictional common ASIC.

Mapper 15's K-1029/K-1030P board uses write-address A1-A0 to select NROM-256, UNROM, NROM-64 or
NROM-128 behavior. Written D5-D0 drive PRG A19-A14, D7 supplies PRG A13 only in NROM-64 mode, and D6
selects mirroring. Modes 0/3 write-protect the unbanked 8 KiB CHR RAM; modes 1/2 enable writes.
NES 2.0 submapper 0 selects that exact `k-1029` zero-WRAM contract. Legacy iNES cannot distinguish
the two physical multicarts from widespread mapper-164/227 hacks assigned mapper 15, so it resolves
to the explicit `mapper-15-legacy` compatibility board instead: the implicit 8 KiB PRG RAM is mapped
at `$6000-$7FFF` and CHR RAM remains writable in every mode. This is a header-level policy, with no
title or ROM-hash inference.

The checksum-pinned legacy _Pokémon Gold_ hack demonstrates why the split matters: before the
compatibility board it executed CPU code for 2,400 frames but every frame remained black because
mode 0 blocked its CHR uploads. Its deterministic profile now crosses the title and introduction
into active first-room play over 3,000 input-driven frames, produces 243 distinct frames and pins
video, native audio, CPU cycles, mapper state and an input-active 120-frame save-state replay. It
uses only mode 0 and is not physical K-1029/K-1030P evidence; the four modes and exact protection
remain focused-test evidence pending a canonical multicart fixture. See
[NESdev mapper 15](https://www.nesdev.org/wiki/INES_Mapper_015).

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
16 KiB page, A5 selects paired versus mirrored PRG, A3-A0 plus the only two retained data lines,
written D1-D0, select an 8 KiB CHR
bank, and A13 controls mirroring. A 512 KiB image occupies chip 0. Action 52's 1.5 MiB payload stores
physical chips 0, 1 and 3 consecutively; selecting absent chip 2 leaves all CPU data lines open.
The rumored four-nibble expansion RAM is not present on either real board and is not modeled. See
[NESdev mapper 228](https://www.nesdev.org/wiki/INES_Mapper_228).

Mapper 242's Waixing/UNL-43272 board latches A6-A5 as outer and A4-A2 as inner PRG lines. A7 selects
UNROM-like versus NROM wiring, A0 selects mirrored 16 KiB versus paired 32 KiB NROM, A9 chooses the
fixed upper UNROM bank, and A1 controls mirroring. On multicarts, A7 also protects unbanked 8 KiB
CHR RAM and A8 can replace PRG A4-A0 with five menu solder pads; the modeled unbridged value is
zero. The battery RPG variant maps exactly 8 KiB NVRAM, leaves CHR writable and hardwires the PRG
path to NROM modes. The checksum-pinned _Wai Xin Zhan Shi_ profile verifies 1200 input-driven frames,
424 distinct frames, exact visual/audio/cycle results and deterministic 120-frame save-state replay;
a separate trace exercises five latch states. The implemented scope is the standard 512 KiB
single-ROM board; ET-113's 640 KiB two-chip power-on selection remains explicit future work. See
[NESdev mapper 242](https://www.nesdev.org/wiki/INES_Mapper_242).

## BMC 42/63/76-in-1 (226)

Mapper 226 has two byte latches selected by CPU address A0 throughout `$8000-$FFFF`. Register 0's
D4-D0 and D7 plus register 1's D0 form a seven-bit 16 KiB PRG page. Register 0 D5 chooses a mirrored
16 KiB page or an even/odd 32 KiB pair, while D6 selects horizontal or vertical mirroring. The
unbanked 8 KiB CHR RAM is writable unless register 1 D1 asserts its documented write-protect line.
There are no bus conflicts or PRG-RAM signals.

Both latches clear on cold power and warm reset. `Bmc226Mapper` accepts the known 1 MiB 42-in-1,
1.5 MiB 63-in-1 and 2 MiB 76-in-1 PRG layouts. The three-chip image decodes its two outer selector
bits as physical blocks `0/0/1/2`; it is not treated as a flat 96-bank modulo array. State stores
the two physical latch bytes, derives mirroring from them on restore and keeps CHR memory in the
cartridge memory owner. The checksum-pinned 1 MiB _Super 42-in-1_ profile uses Select to enter the
second menu page, launches _1942_ and verifies 1800 input-driven frames, 354 distinct frames, exact
visual/audio/cycle results and deterministic 120-frame save-state replay. The 1.5/2 MiB layouts
remain focused-test evidence, and the copyrighted fixture bytes remain outside the repository. See
[NESdev mapper 226](https://www.nesdev.org/wiki/INES_Mapper_226).

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
159/157/153. Exact content metadata identifies the DRAGON BALL Z-B _Crayon Shin-chan: Ora to Poi
Poi_ payload as a no-memory LZ93D50 board, selecting submapper 5 instead of leaving it on the
legacy compatibility route.

LZ93D50 can connect a 256-byte 24C02. Register D drives SCL/SDA, while CPU reads at
`$6000-$7FFF` drive only EEPROM D4 and leave the other data-bus bits open. `Eeprom24c02` owns the
I²C-like protocol state; the bytes remain in Cartridge's 256-byte PRG NVRAM so battery saves,
revision tracking and transactional save states use the existing persistence boundary. Legacy
battery headers are normalized from iNES's misleading 8 KiB unit to this physical capacity. See
[NESdev mapper 16](https://www.nesdev.org/wiki/INES_Mapper_016) and the
[submapper table](https://www.nesdev.org/wiki/INES_Mapper_016/Submapper_table). The pinned
_Crayon Shin-chan_ profile advances 3,600 input-driven frames through its opening and story,
pinning 709 distinct frames, LZ93D50 high-address PRG/CHR state, native audio, CPU cycles and
save-state replay. Its mapper checkpoints retain zero IRQ state and `eeprom: null`; IRQ timing and
24C02 protocol claims therefore remain focused-test evidence.

## Jaleco SS8806 (18)

Three 8 KiB registers select PRG at `$8000`, `$A000` and `$C000`; `$E000-$FFFF` is fixed to the
last bank. Eight registers independently select the 1 KiB CHR-ROM windows. The ASIC decodes
registers through mask `$F003`: CPU A2-A11 are ignored, and each low/high address pair supplies the
low/high four bits of a bank. PRG has only six physical bank bits (512 KiB maximum), while CHR has
all eight (256 KiB maximum).

An optional exact 8 KiB PRG-RAM/NVRAM window occupies `$6000-$7FFF`. `$9002` bit 0 enables reads and
bit 1 permits writes, so disabled reads remain CPU open bus and read-only state is distinct from
chip disable. Unknown legacy iNES images retain the conventional 8 KiB allocation because they
cannot encode a RAM-absent board; an exact PRG/CHR content record identifies JF-25 _The Lord of
King_ and removes its nonexistent WRAM. NES 2.0 may explicitly declare zero. `$F002` selects
horizontal, vertical, lower-one-screen or upper-one-screen nametables.

`$E000-$E003` assemble a 16-bit IRQ reload value; `$F000` reloads the live counter and acknowledges
the line. `$F001` acknowledges, enables counting and selects 16/12/8/4-bit width with bit 3 taking
precedence over bit 2 over bit 1. Counting continues each CPU cycle. At a selected-width underflow,
the borrow asserts IRQ and wraps only those low bits; upper bits remain unchanged. This follows the
current [NESdev mapper 18](https://www.nesdev.org/wiki/INES_Mapper_018) hardware description.
Mesen and Nestopia currently assert one cycle earlier on the 1→0 transition, so focused tests pin the
underflow interpretation rather than hiding the contradiction. `$F003` is the port for an optional
external µPD7755/7756 sample player; that separate audio device is not emulated. The pinned JF-25
profile runs 2,400 input-driven frames from its opening into the first playable room, pinning 584
distinct frames, three exact mapper-state checkpoints, active 16-bit IRQ reload/counter state,
native audio, CPU cycles and deterministic save-state replay.

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
legacy submapper 0 uses the conservative 12 dB profile. Because iNES cannot encode a submapper, the
exact NAM-KK-5900 _King of Kings_ PRG/CHR payload has a content-addressed legacy metadata record
that selects submapper 5; unknown legacy payloads retain the conservative fallback. Its pinned
profile runs 1,800 input-driven frames from title through setup into the battle map, captures active
N163 output plus PRG/CHR/CIRAM selector state, and pins visual, audio, CPU-cycle and save-state replay
results. The captured route does not enable the mapper IRQ, whose timing claim remains covered by
focused tests.

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
declared; the other seven CPU data lines remain open bus. VRC2a's 351618 PCB instead connects that
output to ground: reads in the same window force only D0 low, writes cannot change it, and
`$7000-$7FFF` remains fully open bus. The singleton board has no PRG RAM, so legacy iNES byte 8's
generic 8 KiB fallback is suppressed and NES 2.0 RAM declarations fail closed. VRC4 accepts either
its 2 KiB RAM mirrored through `$6000-$6FFF` or an externally decoded 8 KiB window. `$9002` bit 0
gates that RAM and bit 1 selects PRG swap mode. Other VRC2 RAM, when accepted, is an always-visible
8 KiB window.

VRC4's `$F00x` ports assemble an 8-bit IRQ latch, configure cycle/scanline mode and acknowledge the
level-sensitive output. Cycle mode clocks its up-counter every CPU cycle. Scanline mode starts a
341-dot prescaler and subtracts three per CPU cycle, producing the repeating 114/114/113-cycle
sequence; a `$FF` counter clock reloads the latch and asserts IRQ. `VrcIrq` is an independent
domain component so later VRC6/VRC7 boards can reuse this actual circuit without importing VRC4
banking.

Exact legacy content metadata separates VRC boards that iNES cannot distinguish precisely:
_Wai Wai World 2_ is zero-WRAM
[352398 VRC4a](https://nescartdb.com/profile/view/2273/wai-wai-world-2-sos-paseri-jou),
_Ganbare Goemon 2_ is zero-WRAM [350926 VRC2b](https://nescartdb.com/profile/view/1568/ganbare-goemon-2),
_Getsufuu Maden_ is zero-WRAM [350636 VRC2b](https://nescartdb.com/profile/view/3306/getsufuu-maden),
and _Crisis Force_ is 2 KiB-WRAM [352396 VRC4e](https://nescartdb.com/profile/view/2279/crisis-force).
Mapper 25 records _Gradius II_, _Racer Mini Yonku_ and _Bio Miracle Bokutte Upa_ as 351406 VRC4b
with 2 KiB, zero and zero WRAM respectively; _Teenage Mutant Ninja Turtles 2_ as zero-WRAM 352400
VRC4d; and _Ganbare Goemon Gaiden_ as 8 KiB-NVRAM 351948 VRC2c. Each entry requires both independent
PRG/CHR CRCs, so a cheat with one canonical region cannot inherit physical-board metadata.
Mapper 22 needs no content override because it names only the zero-WRAM
[351618 VRC2a](https://nescartdb.com/profile/view/3132/ganbare-pennant-race) board. The pinned
_Ganbare Pennant Race!_ profile matches its PRG/CHR CRCs `953CA1B6`/`89A44100`, runs 3,600 frames
through six menu layers into an active baseball game, and locks PRG/CHR evolution, zero WRAM,
native audio, CPU cycles and an input-active save-state replay.
The pinned _Wai Wai World 2_ profile drives 3,000 frames through menus, the world map and active
gameplay. Its exact state checkpoints observe both horizontal and lower-single-screen mirroring,
scanline IRQ activity, PRG/CHR bank evolution and the absence of fabricated WRAM; video, native
audio, CPU cycles and an input-active 120-frame save-state replay are deterministic.
The pinned _Ganbare Goemon 2_ profile fixes a 600-frame baseline and 3,000-frame input route through
title, mode selection, story and active gameplay with 1,671 distinct frames. Mapper checkpoints
record 16 PRG bank values, changes in every CHR register, both mirroring states and the absence of
VRC4-only IRQ/swap/RAM state; video, native audio, CPU cycles and a 120-frame input-active save-state
replay are exact. The local file with payload CRC `88C83A1D` is a known _Crisis Force_ bad dump and
is deliberately excluded; only the canonical `FCBF28B1` payload receives VRC4e/2 KiB metadata.
The pinned _Racer Mini Yonku_ profile matches the 351406 record's PRG/CHR CRCs
`A2E68DA8`/`B2D960CC`, removes iNES's fabricated 8 KiB RAM and selects exact VRC4b routing. Its
900-frame attract sequence and 2,100-frame input route pin PRG/CHR banks, horizontal and
lower-single-screen mirroring, active scanline IRQ state, video, native audio, CPU cycles and a
120-frame save-state replay. Local _Bio Miracle_, _Teenage Mutant Ninja Turtles 2_ and _Ganbare
Goemon Gaiden_ containers have canonical extracted regions but trailing data, so they inform exact
metadata without becoming smoke profiles.

See [NESdev VRC2/VRC4](https://www.nesdev.org/wiki/VRC4),
[NES 2.0 submappers](https://www.nesdev.org/wiki/NES_2.0_submappers) and
[VRC IRQ](https://www.nesdev.org/wiki/VRC_IRQ).

## Konami VRC6 (24, 26)

`Vrc6Mapper` represents the VRC6a and VRC6b as one ASIC with immutable CPU-pin routing. Mapper 24
uses A0/A1 directly; mapper 26 swaps them before the common `$F003` decode. One 16 KiB PRG register
maps `$8000-$BFFF`, one 8 KiB register maps `$C000-$DFFF`, the final bank stays fixed, and `$B003`
bit 7 gates Mapper 26's physical 8 KiB WRAM/NVRAM window. Mapper 24 names only the 351951 VRC6a
board, which has no WRAM chip; `$6000-$7FFF` therefore stays open even when software sets that bit.

Eight byte-wide CHR registers support the documented 8×1, 4×2 and mixed 4×1+2×2 KiB layouts.
`$B003` bit 5 supplies the slot's A10 only where the selected mode combines a register into a 2 KiB
window; 1 KiB windows retain every bit of their byte-wide latch. The low mode/mirroring bits select
every conventional, direct four-table and paired nametable arrangement. Bit 4 replaces CIRAM reads
with the corresponding CHR-ROM pages and consumes writes. These routes are calculated from the
physical bank outputs instead of collapsing the chip to the eight values used by its three
commercial games.

The audio device owns two descending 16-step pulse generators and one fourteen-step saw sequence.
`$9003` can halt all phases or right-shift periods by 4/8 bits; the linear six-bit sum is inverted
and scaled so a maximum pulse matches the measured approximate amplitude of one maximum RP2A03
pulse, then enters the console's shared RC filter chain. Clearing a pulse's enable bit immediately
returns its duty generator to step 0 and holds it there while the independent frequency divider
continues; re-enabling therefore resumes from the documented first phase without fabricating a
divider reset. The byte-latch VRC IRQ reuses `VrcIrq`. Every divider, duty step, saw accumulator,
bank and pending IRQ is serialized, and disabled-pulse snapshots reject nonzero duty phases. See
[NESdev VRC6](https://www.nesdev.org/wiki/VRC6),
[VRC6 audio](https://www.nesdev.org/wiki/VRC6_audio) and
[VRC6 pinout](https://www.nesdev.org/wiki/VRC6_pinout).

The exact _Esper Dream 2_ Mapper 26 profile reaches the opening library while pinning VRC6b PRG/CHR
banks, CHR-backed nametable mode, active scanline IRQ phase, filtered audio, rendered frames and a
save-state replay. That deterministic opening does not enable the two expansion pulses or saw, so
their timing and mixer claims remain backed by the focused VRC6 audio and bus tests; the profile is
not described as commercial-ROM verification of those oscillators.

The checksum-pinned natt `vrc6test24`/`vrc6test26` pair exhaustively scans `$B003`'s low-six-bit
matrix, all PPU bank positions and both register datasets through each ASIC pin route. Both fixtures
reach `All Tests Passed!`, expose zero in the dedicated failure byte and match the reviewed final
RGBA hash. This is the executable Mapper 24 verification; a clean canonical _Akumajou Densetsu_
image is still required before making a separate commercial-game or expansion-audio claim.

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

The exact Japanese _Tiny Toon Adventures 2_ profile reaches playable roller-coaster action and pins
the legacy iNES VRC7b/A3 path with frame, native-APU audio, CPU-cycle and save-state replay hashes.
Its FM register file remains untouched throughout, as expected for the 353429 PCB without the audio
resonator or mixer. VRC7a's audible FM path remains focused-test evidence until a checksum-pinned
_Lagrange Point_ profile exercises it.

## Irem G-101 (32)

Two registers select 8 KiB PRG banks at `$8000`/`$A000`; the final two banks normally remain fixed
at `$C000`/`$E000`. `$9000` bit 1 exchanges the `$8000` switchable and `$C000` fixed windows, while
bit 0 selects vertical/horizontal mirroring. `$B000-$B007` select eight 1 KiB CHR-ROM windows.
NES 2.0 submapper 1 identifies Major League's hardwired upper one-screen board, which fixes PRG mode
0 and does not decode `$9000`; ambiguous legacy images remain on the standard board rather than use
a title hash.

The checksum-pinned local _Image Fight_ invincibility image runs 600 baseline frames and a
2,400-frame input route through the Irem logo, title, machine self-test and active combat. Its 737
distinct frames and compact mapper checkpoints cover both switchable PRG registers, all eight CHR
registers and both horizontal/vertical mirroring states, with exact native audio, CPU-cycle and
input-active 120-frame save-state replay results. The profile deliberately records the image as a
modification rather than claiming canonical dump identity. This software remains in PRG mode 0;
mode 1 and Major League's fixed-upper submapper-1 board remain focused-test evidence. See
[NESdev mapper 32](https://www.nesdev.org/wiki/INES_Mapper_032).

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

The exact _Golf Ko Open_ image matches the physical
[TFC-GO-5900-26/TC0190FMC board](https://nescartdb.com/profile/view/4703/golf-ko-open): 128 KiB PRG,
256 KiB CHR and no WRAM. Content-addressed legacy metadata removes iNES's generic 8 KiB RAM
fallback. Its pinned 900-frame baseline and 1,500-frame input route exercise both PRG registers,
both CHR window sizes and the vertical-to-horizontal mirroring transition, followed by a
deterministic 120-frame visual/audio save-state replay.

## BNROM / NINA-001 (34)

`resolveMapper34Board` (`mapper34-board.ts`) chooses exactly one board and never combines their
register sets. BNROM switches a 32 KiB PRG bank with original-board AND conflicts. NINA-001 maps three
registers (`$7FFD` PRG, `$7FFE`/`$7FFF` two 4 KiB CHR banks) over an 8 KiB PRG-RAM window. Legacy CHR
ROM above 8 KiB selects NINA-001; CHR RAM or ≤8 KiB CHR ROM selects BNROM; NES 2.0 submapper 1/2 name
the board explicitly.

## Caltron 6-in-1 (41)

The outer register is decoded only on writes to `$6000-$67FF` and ignores CPU data. Address bits
A0-A2 select one 32 KiB PRG bank, A3-A4 select one of four outer CHR groups, A5 selects
vertical/horizontal mirroring, and A2 also enables the inner latch. While enabled, writes anywhere
in `$8000-$FFFF` capture data bits D0-D1 after an AND bus conflict against the currently selected
PRG byte. The outer and retained inner fields together select an 8 KiB CHR bank. `$6000-$7FFF`
reads are open bus; the board owns no PRG RAM, CHR RAM or IRQ source.

Legacy iNES loading suppresses byte 8's generic 8 KiB PRG-RAM fallback for Mapper 41. This keeps the
public cartridge memory inventory consistent with the open-bus `$6000-$7FFF` read path instead of
allocating unreachable writable memory behind the address-only outer latch.

Both latches and mirroring reset on either power-on or the console reset signal. Save states retain
the raw six-bit address latch and two-bit inner latch, then derive mirroring from the restored
hardware state. The production board carries 256 KiB PRG ROM and 128 KiB CHR ROM; the factory also
accepts smaller power-of-two images because unconnected high ROM address inputs naturally mirror,
but rejects non-power-of-two or oversized payloads, writable cartridge memory, four-screen
nametables and unknown submappers.

Current [NESdev mapper 41](https://www.nesdev.org/wiki/INES_Mapper_041),
[Mesen CE](https://github.com/nesdev-org/MesenCE/blob/7f418e352a2bab89f239ca09930a0c2b5074f9e3/Core/NES/Mappers/Ntdec/Caltron41.h)
and
[MAME](https://github.com/mamedev/mame/blob/dcc9f33c59815103994534a85d2f70d77b2ca862/src/devices/bus/nes/multigame.cpp#L1213)
agree on A5 mirroring, the data-driven gated inner latch and reset clearing. Older FCEUX
address-derived inner selection and Nestopia A4/hard-reset-only behavior conflict with that
consensus and are not treated as hidden variants. The local 32 KiB PRG + 32 KiB CHR _Aladdin 3_
image runs and replays deterministically but never writes either mapper register, so it validates
only reduced-capacity loading—not the Caltron switching circuit.

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
RAM.

Exact content metadata identifies _Skull & Crossbones_ as the zero-WRAM TGN-020-SK/800032 REV A
board. Its pinned 1,500-frame baseline records an enabled CPU-cycle IRQ counter, while the
2,400-frame input route reaches active gameplay with 1,799 distinct frames and records filtered-A12
IRQ assertions plus broad PRG/CHR register changes. Visual/audio/CPU hashes and an input-active
save-state replay preserve the split gameplay status bar without the historically common garbage
scanline. See [NESdev RAMBO-1](https://www.nesdev.org/wiki/RAMBO-1).

## Irem H3001 (65)

`$8000-$8007` and `$A000-$A007` mirror two 8 KiB PRG registers. `$9000` bit 7 swaps the first
register between `$8000` and `$C000`; the other position holds the fixed second-to-last bank and
`$E000` always holds the final bank. There is deliberately no `$C000` PRG register: later physical
pinout testing disproved that older emulator behavior. `$B000-$B007` select eight 1 KiB CHR banks.

`$9001` bits 7-6 select vertical, horizontal or lower-one-screen mirroring. `$9005/$9006` write the
high/low 16-bit IRQ reload, `$9004` copies it into the live counter, and `$9003` acknowledges and
enables/disables counting. The counter decrements once per CPU cycle, asserts at zero and disables
itself. A directly declared PRG-RAM/NVRAM window is mapped at `$6000-$7FFF`.

Exact content metadata identifies _Kaiketsu Yanchamaru 3_ as the zero-WRAM IF-28/FC-00-017B board.
Its pinned 3,100-frame route crosses the opening into Stage 1 gameplay with 896 distinct frames,
visits both observed switchable PRG pairs and broad per-slot CHR changes, and locks visual/audio/CPU
output plus an input-active save-state replay. The observed software path leaves PRG mode 0 and does
not enable the preloaded IRQ counter; focused tests retain swapped-mode, alternate-mirroring, RAM and
one-shot IRQ coverage. See
[NESdev mapper 65](https://www.nesdev.org/wiki/INES_Mapper_065) and the
[H3001 pinout findings](https://forums.nesdev.org/viewtopic.php?t=19778).

## GxROM / MHROM (66)

One `$8000-$FFFF` latch: bits 5-4 select a 32 KiB PRG bank, bits 1-0 an 8 KiB CHR bank, with AND-type
bus conflicts. MHROM images simply never use the high PRG bit. GxROM has no PRG-RAM window and its
nametable wiring is fixed by the board solder pads.

Exact content metadata identifies _Dragon Power_ as the vertical-mirroring, zero-WRAM
NES-GN-ROM-03 board and corrects the circulating legacy header's horizontal declaration. Its pinned
2,400-frame route crosses the title and story into active gameplay with 839 distinct frames, visits
all four 32 KiB PRG banks and both observed CHR banks, and locks visual/audio/CPU output plus an
input-active save-state replay. Focused tests separately preserve the exact bitwise-AND conflict
behavior. See [NESdev GxROM](https://www.nesdev.org/wiki/GxROM).

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

Exact content metadata identifies USA _After Burner_ as the zero-WRAM
[TGN-011-AB/800042-01 REV B board](https://nescartdb.com/profile/view/326/after-burner). Its pinned
600-frame baseline and 2,400-frame input route cross the title and carrier launch into active air
combat, producing 1,336 distinct frames. Visual, native-audio and CPU-cycle hashes plus a
120-frame input-active save-state replay are fixed. Mapper checkpoints keep CHR-ROM nametables
enabled while recording broad nametable/pattern-bank changes, both PRG banks used by the route and
both observed mirroring modes. A separate trace found CHR-ROM nametables active on 2,395 of 2,400
frames. The physical board has no WRAM, so the optional RAM-enable path remains focused-test
evidence; a correctly identified _Maharaja_ image is the planned battery-WRAM supplement.

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
emulated.

Exact content metadata identifies Japanese _Batman_ as the zero-WRAM
[BAT-E301 Sunsoft-5A board](https://nescartdb.com/profile/view/3145/batman). Its pinned 1,200-frame
baseline and 3,200-frame input route cross the opening into Stage 1, produce 1,181 distinct frames
and record the enabled cycle counter at several live values alongside broad PRG/CHR changes. Visual,
native-audio and CPU-cycle hashes plus an input-active save-state replay cover the base Mapper 69
gameplay path. This zero-WRAM, non-audio board cannot verify command `$8`'s RAM mode or Sunsoft 5B
audio; those remain focused-test and future-profile scope respectively. See the
[NESdev FME-7 page](https://www.nesdev.org/wiki/Sunsoft_FME-7). Representative titles: Batman,
Gimmick!, Batman: Return of the Joker.

## Bandai 74xx (70, 152)

One `$8000-$FFFF` latch with AND-type bus conflicts: a 16 KiB `$8000-$BFFF` bank (fixed last at
`$C000-$FFFF`) and an 8 KiB CHR-ROM bank. Mapper 70 uses bits 7-4 for PRG and keeps mirroring hardwired.
Mapper 152 spends bit 7 on single-screen mirroring (0 = screen A, 1 = screen B), leaving a 3-bit PRG
field. Its four-screen declarations are rejected because that output directly drives two-screen
CIRAM; mapper 70's hardwired variant may retain externally declared four-screen memory. Both are
implemented by `Bandai74Mapper` with a `hasMirroringControl` flag.

The exact _Kamen Rider Club_ image matches the physical
[BA-KAMEN BANDAI-74\*161/161/32 board](https://nescartdb.com/profile/view/1742/kamen-rider-club-gekitotsu-shocker-land):
128 KiB PRG, 128 KiB CHR, vertical mirroring and no WRAM. Content-addressed legacy metadata corrects
the circulating iNES image's horizontal flag and generic 8 KiB RAM fallback. Its pinned 600-frame
baseline and 1,800-frame input route reach active gameplay while selecting PRG banks 0/3/4 and CHR
banks 0/1/2/12, followed by a deterministic 120-frame visual/audio save-state replay.

## Codemasters / Camerica (71)

A UNROM-style register at `$C000-$FFFF` selects the 16 KiB `$8000-$BFFF` bank; `$C000-$FFFF` is fixed
to the last bank; no bus conflicts. The BF9097 variant (submapper 1, e.g. Fire Hawk) adds single-screen
mirroring from `$9000-$9FFF` bit 4 and rejects four-screen layouts; submapper 0 (BF9093) keeps the
header's fixed mirroring, including externally declared four-screen memory.

Exact legacy metadata matches _Fire Hawk_ to the
[NESCartDB BIC-62 profile](https://nescartdb.com/profile/view/733/fire-hawk), whose PRG CRC
`1BC686A8` records a BF9097, Mapper-controlled mirroring, 8 KiB CHR RAM and no WRAM. This corrects
the plain iNES image from fixed-mirroring submapper 0 to controlled-mirroring submapper 1 and removes
its generic PRG-RAM fallback. The pinned route enters mission-one flight, selects PRG banks 0/1/4/5,
uses both single-screen pages and replays an input-active 120-frame segment with exact video, audio
and cycle counts. _Micro Machines_ remains separate fixed-mirroring BF9093 evidence.

## Jaleco JF-17 / JF-19 (72, 92)

JF-17 maps one switchable 16 KiB PRG bank at `$8000-$BFFF` and fixes the final bank at
`$C000-$FFFF`. JF-19 reverses those roles: mapper 92 fixes bank 0 in the lower window and switches
the upper window across all sixteen banks. Both boards switch one 8 KiB CHR-ROM bank and feed their
single AND-conflicted `$8000-$FFFF` port into two edge-triggered latches. A low-to-high transition
on effective D7 captures D2-D0 for JF-17 or D3-D0 for JF-19 PRG; an independent D6 rise captures
D3-D0 for CHR. Continuous-high writes do not re-latch, and a low write rearms each clock
independently. The edge-history bits are therefore save-state data rather than reconstructed from
the selected banks.

JF-17 carries exactly 128 KiB each of PRG and CHR ROM; JF-19 carries 256 KiB PRG plus 128 KiB CHR.
Neither board maps PRG RAM or IRQ, and both use solder-pad horizontal/vertical mirroring. The shared
implementation follows the current
[NESdev mapper 72 hardware description](https://www.nesdev.org/wiki/INES_Mapper_072) and the JF-19
window wiring in the pinned
[Mesen 2 implementation](https://github.com/SourMesen/Mesen2/blob/b9fa69ddc6d0a331fb103fdb5eef6904305703c2/Core/NES/Mappers/Jaleco/JalecoJf17_19.h).
[NESCartDB's JF-19 board record](https://nescartdb.com/profile/view/1731/moero-pro-yakyuu-88-kettei-ban)
confirms the mapper, exact ROM geometry, vertical solder-pad setting, absence of WRAM and combined
payload CRC `B297B5E7`.

Legacy iNES loading suppresses the format's generic 8 KiB PRG-RAM fallback for both mapper IDs;
the public cartridge inventory therefore matches the boards' electrically open `$6000-$7FFF`
range. The pinned exact _Pinball Quest_ profile matches the
[NesCartDB JF-17 record](https://nescartdb.com/profile/view/2286/pinball-quest), including PRG/CHR
CRCs `55C3589C`/`1FCDD252`, horizontal mirroring and zero WRAM. Its `POP! POP!` route locks video,
audio, CPU cycles and save-state replay while mapper checkpoints observe PRG banks 0/1/2 and CHR
banks 15/3/0.

The µPD7756C sample playback used by some JF-17/JF-19 releases is not emulated: ordinary iNES files
contain neither the external sample payload nor a standard way to identify it. A user-local
_Moero!! Pro Yakyuu '88 Ketteihen_ payload matching that catalog CRC completed 1,500 frames and a
deterministic 300-frame save-state replay. Its containing file has 524,304 trailing bytes, so it is
evidence for `Implemented`, not a checksum-pinned `Verified` fixture.

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

The pinned exact _Salamander_ profile independently matches PRG CRC32 `AC652B47` to a physical
KONAMI-VRC-3 board with vertical mirroring, 8 KiB WRAM and 8 KiB VRAM. Its first-stage route locks
frame/audio/replay output plus live mapper checkpoints: switchable PRG banks 1, 3 and 4, latch
`$9F00` and the enabled 16-bit CPU-cycle counter. The cartridge does not select 8-bit IRQ mode on
that route, so focused mapper tests remain the evidence for that mode. See the
[NesCartDB Salamander profile](https://nescartdb.com/profile/view/3313/salamander) for the physical
cartridge identity and memory inventory.

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
closed.

The checksum-pinned local _Di 4 Ci: Ji Qi Ren Da Zhan - Robot War IV_ profile uses the full
512 KiB PRG/256 KiB CHR geometry, 8 KiB battery NVRAM and board-implied 2 KiB CHR RAM. A deterministic
input route crosses title and scenario setup into the strategy map, records 209 distinct frames,
selects `$08` through R0 and R1, changes both RAM pages, switches PRG/CHR banks and enables the
filtered A12 IRQ with latch `$A0`. It also locks video, native audio, CPU cycles, complete battery
retention and an input-active 120-frame save-state replay. The local _Ji Jia Zhan Shi_ image remains
an independent software supplement. Commercial bytes stay outside the repository. See
[NESdev mapper 74](https://www.nesdev.org/wiki/INES_Mapper_074).

## Konami VRC1 (75)

Three registers select 8 KiB PRG-ROM banks at `$8000`, `$A000` and `$C000`; `$E000-$FFFF` stays
fixed to the final bank. Two 4 KiB CHR-ROM windows take their low four bank bits from `$E000` and
`$F000`, while `$9000` bits 1-2 provide each window's fifth bit. `$9000` bit 0 selects
vertical/horizontal mirroring, except on cartridges with four-screen VRAM where the line is ignored.
The VRC1 has no PRG RAM, IRQ or bus conflicts. See the
[NESdev VRC1 reference](https://www.nesdev.org/wiki/VRC1).

The checksum-pinned _Ganbare Goemon! Karakuri Douchuu_ profile matches
[NESCartDB 302114A profile 3040](https://nescartdb.com/profile/view/3040/ganbare-goemon-karakuri-douchuu)
and [profile 3041](https://nescartdb.com/profile/view/3041/ganbare-goemon-karakuri-douchuu):
both record PRG `565A57E5`, CHR `D9842835`, Mapper-controlled mirroring and no WRAM/VRAM. Exact
legacy metadata therefore suppresses the header's generic PRG-RAM fallback. The input route enters
one-player gameplay, exercises three PRG layouts and CHR banks with both high select lines, and
replays an input-active 120-frame save-state segment with exact video, audio and cycle counts.

## Namco 3446 (76)

Mapper 76 keeps the Namco 108 family's two switchable and two fixed 8 KiB PRG windows, but rewires
CHR as four 2 KiB windows selected by R2-R5. R0/R1 are physically inaccessible for CHR selection.
The board reaches 128 KiB CHR ROM with no IRQ, PRG RAM, mirroring register or bus conflicts.

Exact legacy metadata matches both physical NAM-MT-4900 _Megami Tensei_ (PRG `9F3DA143`, CHR
`73F1E3CF`) and the pinned local enhanced modification (PRG `4E0A1B82`, unchanged CHR), removing
iNES's generic 8 KiB PRG-RAM fallback from the zero-WRAM board. A 600-frame baseline and 4,000-frame
controller route complete both character builds, cross the pyramid entrance and move through the
first-person maze with 437 distinct frames. Checkpoints keep R0/R1 zero, change every physical
R2-R5 CHR register and both R6/R7 PRG registers, and pin exact video, native audio, CPU cycles and
input-active save-state replay. A canonical PRG remains the preferred independent supplement. See the
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
32 KiB CHR ROM, with no PRG RAM or IRQ. Format policy therefore removes iNES's generic implicit
8 KiB PRG-RAM allocation rather than exposing unreachable memory.

The checksum-pinned exact _Napoleon Senki_ image matches the
[LROG017-00 board record](https://nescartdb.com/profile/view/2260/napoleon-senki): combined payload
CRC `06144B4A`, PRG `ADB47286` and CHR `F822DD8D`. A 540-frame baseline and 3,600-frame input route
cross the title and scenario setup into the Italy campaign map, produce 1,293 distinct interactive
frames, exercise all four PRG banks and eight CHR-ROM banks, and lock visual, native-audio,
CPU-cycle and input-active save-state replay. The remaining CHR banks, bus-conflict masking and
mixed CHR-RAM/nametable ownership stay covered by focused tests. See also
[NESdev mapper 77](https://www.nesdev.org/wiki/INES_Mapper_077).

## Irem 74HC161/32 (78)

One conflict-prone `$8000-$FFFF` latch combines a 16 KiB `$8000-$BFFF` PRG bank (last bank fixed at
`$C000-$FFFF`), an 8 KiB CHR bank and nametable control. Bits 2-0 select PRG, bit 3 controls
mirroring and bits 7-4 select CHR. The physical mirroring wire differs: Cosmo Carrier selects
one-screen lower/upper, while Holy Diver selects horizontal/vertical. NES 2.0 submapper 1 and 3 name
those boards; submapper 0 is rejected. For legacy iNES, a clear historical alternative-nametable
flag identifies Cosmo Carrier and a set flag identifies Holy Diver. That legacy flag is a board
discriminator, not a four-screen declaration. Exact payload metadata takes precedence and assigns
canonical _Uchuusen: Cosmo Carrier_ (PRG `42392440`, CHR `CFFEE642`) to submapper 1 and canonical
_Holy Diver_ (PRG `BC1197A4`, CHR `BE4A4753`) to submapper 3. Format policy removes iNES's generic
8 KiB PRG-RAM fallback from both no-WRAM boards; explicit NES 2.0 RAM and actual four-screen layouts
remain rejected. See [NESdev mapper 78](https://www.nesdev.org/wiki/INES_Mapper_078), the
[submapper history](https://www.nesdev.org/wiki/NES_2.0_submappers) and the
[Holy Diver board record](https://nescartdb.com/profile/view/4038/holy-diver).

The checksum-pinned Holy Mapperel 0.02 `M78.3_P128K_C64K.nes` fixture exercises the IF-12 board
through the public emulator. It identifies mapper 078/Holy Diver, verifies all 128 KiB of PRG ROM,
all 64 KiB of CHR ROM and the board's horizontal/vertical mirroring, then reports detailed result
`0000`. The focused tests retain responsibility for AND bus-conflict masking and the distinct
Cosmo Carrier one-screen wiring.

## AVE NINA-03/NINA-06 (79)

The single bank latch is decoded in CPU expansion space only when
`(address & $E100) == $4100`. D3 selects one of two 32 KiB PRG banks and D2-D0 select one of eight
8 KiB CHR-ROM banks. Reads from the expansion range stay open bus, mirroring remains solder-pad
controlled, and the board has no PRG RAM, IRQ or bus conflicts. See
[NESdev mapper 79](https://www.nesdev.org/wiki/INES_Mapper_079).

The checksum-pinned _Double Strike_ v1.1 profile matches the
[AVE-NINA-06 board record](https://nescartdb.com/profile/view/1044/double-strike): combined payload
CRC `1EB4A920`, PRG `127436FC`, CHR `39536D86`, vertical mirroring and no WRAM/VRAM. Exact legacy
metadata removes iNES's generic 8 KiB PRG-RAM fallback. A 600-frame idle baseline and 1,800-frame
input route cross the title into one-player aerial combat, produce 1,553 distinct interactive
frames, observe CHR banks 0 and 1, and pin visual, native-audio, CPU-cycle and input-active
save-state replay results. Because this production image carries only one 32 KiB PRG bank, D3 and
the remaining CHR selections retain complete focused-test coverage without being overstated as
real-ROM evidence.

## Taito X1-005 (80)

The X1-005 exposes three switchable 8 KiB PRG windows followed by the fixed final bank, and two
2 KiB plus four 1 KiB CHR windows. `$7EF6/$7EF7` select horizontal/vertical mirroring.
`$7EFA/$7EFB`, `$7EFC/$7EFD` and `$7EFE/$7EFF` are paired mirrors of the three PRG registers.
CPU A7 is ignored, so all control registers also decode at `$7E70-$7E7F`.

Its 128 internal RAM bytes appear twice across `$7F00-$7FFF` only while the permission latch written
through `$7EF8/$7EF9` equals `$A3`; disabled reads remain open bus. Cartridge format policy
normalizes legacy iNES's generic RAM size to 128 bytes, with the battery flag selecting persistent
or volatile ownership. See [NESdev mapper 80](https://www.nesdev.org/wiki/INES_Mapper_080).

The checksum-pinned _Mirai Shinwa Jarvas_ profile matches two documented
[P3-034A](https://nescartdb.com/profile/view/1763/mirai-shinwa-jarvas)
[board records](https://nescartdb.com/profile/view/3163/mirai-shinwa-jarvas): combined payload CRC
`0E1683C5`, PRG `95AAED34`, CHR `599CD55D`, Mapper-controlled mirroring, a battery and no external
WRAM/VRAM. Exact legacy metadata corrects the circulating iNES image's missing battery flag and
assigns the ASIC's 128 internal bytes to NVRAM, preventing power-on from erasing saved progress. A
600-frame baseline and 2,160-frame input route cross the title into field movement, menu handling
and an enemy encounter, produce 328 distinct interactive frames, pin four PRG layouts and all six
CHR registers, and preserve exact video, native audio, CPU cycles and input-active save-state
replay. The runner pattern-fills all 128 NVRAM bytes through the public emulator facade and proves
they survive a power cycle. The game route does not open the RAM permission latch; exact `$A3`
gating, mirrored RAM access and the volatile sibling remain covered by focused mapper tests.

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

## Jaleco JF-13 (86)

JF-13 exposes exactly four 32 KiB PRG-ROM banks and eight 8 KiB CHR-ROM banks. Writes in
`$6000-$6FFF` select PRG from D5-D4 and CHR from D6/D1-D0. Because the discrete decode observes an
incomplete `/ROMSEL` signal, the same banking register is accidentally mirrored at `$E000-$EFFF`;
reads there remain ordinary PRG-ROM reads, and neither register location has bus conflicts. Reads
from the write-only `$6000-$7FFF` window remain open bus.

`$7000-$7FFF` and its `$F000-$FFFF` mirror drive a NEC µPD7756C speech device. The recorded speech
data is external to the `.nes` PRG/CHR payload, so the core currently keeps that path silent rather
than fabricating samples. A canonical fixture and identified sample set are required before audio
or whole-game behavior can be marked verified.

The local file named _Urusei Yatsura: Lum no Wedding Bell_ is deliberately rejected: its mapper-86
header declares 32 KiB PRG and 32 KiB CHR, contradicting JF-13's fixed 128/64 KiB layout, and the
original title belongs to JF-10/J87. A separate local _Moero!! Pro Yakyuu_ container's declared
payload matches the known Rev 1.3 SHA-1 but is followed by 524,304 padding bytes; it remains
review-only rather than weakening the clean-image profile policy. No filename, checksum or
relaxed-geometry exception exists in the mapper factory. See
[NESdev mapper 86](https://www.nesdev.org/wiki/INES_Mapper_086), the
[NES Directory JF-13 record](https://nesdir.github.io/30BF2DBA_Japan.html) and the
[Mesen 2 JF-13 implementation](https://github.com/SourMesen/Mesen2/blob/b9fa69ddc6d0a331fb103fdb5eef6904305703c2/Core/NES/Mappers/Jaleco/JalecoJf13.h).

## Jaleco CHR (87)

A latch at `$6000-$7FFF` selects the 8 KiB CHR bank with its two select lines reversed (value bit 1 →
CHR line 0, value bit 0 → CHR line 1). PRG ROM stays NROM-fixed; no bus conflicts because the latch
occupies the otherwise-unmapped `$6000-$7FFF` space. The checksum-pinned 32 KiB PRG + 16 KiB CHR
_The Goonies_ profile selects CHR bank 1 and completes 1,500 input-driven frames plus deterministic
visual/audio/cycle save-state replay. See
[NESdev mapper 87](https://www.nesdev.org/wiki/INES_Mapper_087).

## Namco 3433/3443 (88)

Mapper 88 retains the standard two 2 KiB plus four 1 KiB Namco CHR windows, while PPU A12 directly
drives CHR A16. The `$0000` and `$1000` pattern tables therefore select separate 64 KiB halves of a
128 KiB CHR ROM. Undersized CHR naturally mirrors into the lower capacity. PRG layout and missing
IRQ/RAM/mirroring registers match mapper 206.

Exact legacy metadata matches both the physical NAM-DS-5200 _Dragon Spirit_ image (PRG `6231E6DF`,
CHR `58216CF2`) and the pinned local invincibility modification (PRG `0E340680`, unchanged CHR),
removing iNES's generic 8 KiB PRG-RAM fallback from the zero-WRAM board. The modified image's
600-frame baseline and 3,000-frame controller route pass through title/story screens into sustained
vertical combat and a large enemy with 2,409 distinct frames. Mapper checkpoints exercise all eight
registers, both switchable PRG windows and all six CHR selectors; exact visual, native-audio,
CPU-cycle and input-active save-state replay results pin the route. A canonical PRG remains the
preferred independent supplement. See
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

The checksum-pinned _Tekken 2_ payload CRC `FC78ACAF` matches the
[Mesen NES database entry](https://github.com/nesdev-org/MesenCE/blob/master/UI/Dependencies/MesenNesDB.txt#L10523)
for 128 KiB PRG, 512 KiB CHR and zero WRAM. Exact legacy metadata removes iNES's generic 8 KiB
allocation. A 1,200-frame attract route and 1,500-frame input route reach active combat, observe
2 KiB then 1 KiB CHR modes, two distinct four-register PRG layouts and decrementing A12 IRQ setup,
and reproduce an input-active 120-frame save-state segment with exact video, audio and CPU cycles.
The title does not use the multiplier, MMC4-like latches or the other three IRQ sources, which stay
within the focused hardware-test evidence boundary.

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

The exact 128 KiB PRG + 512 KiB CHR _Street Fighter 3_ payload (PRG CRC `F754DA71`, CHR CRC
`2C40E304`, combined payload CRC `A09AA82C`) resolves legacy iNES's implicit RAM to the physical
JY830623C board's zero-WRAM layout. Its checksum-pinned profile advances from the title through
character selection into active combat for 1,800 frames, records 718 distinct frames and changing
PRG/CHR registers with the A12 IRQ enabled, and verifies exact visual/audio/cycle output plus a
120-frame save-state replay. The profile verifies mapper 91.0; EJ-006-1 remains unit-tested rather
than inheriting evidence from the electrically different J.Y. board.

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

The checksum-pinned Holy Mapperel 0.02 `M180_P128K_CR8K_H.nes` fixture identifies the original
conflict-bearing UNROM (7408) layout, scans all 128 KiB of PRG ROM, verifies its 8 KiB CHR RAM and
hardwired mirroring, and reports detailed result `0000`. Focused tests separately preserve the two
explicit NES 2.0 bus-conflict variants, conflict masking itself, reset and save-state behavior.

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
header to the physical capacity, removes its nonexistent PRG RAM and selects default expansion
device `$17`; NES 2.0 must declare the memory and tablet explicitly. The tablet remains outside the
mapper implementation as a bus-owned console peripheral. The checksum-pinned _Anpanman to Oekaki
Shiyou!!_ profile enters the tablet-only menu, selects drawing mode, produces a multi-point stroke,
observes PRG/outer-CHR register changes and replays deterministically from a checkpoint in the
middle of that stroke. See
[NESdev mapper 96](https://www.nesdev.org/wiki/INES_Mapper_096).

## Irem TAM-S1 (97)

The final 16 KiB PRG bank is fixed at `$8000-$BFFF`; D3-D0 select the 16 KiB bank at
`$C000-$FFFF`. D7-D6 select lower one-screen, horizontal, vertical or upper one-screen mirroring.
The known board carries 256 KiB PRG ROM and fixed 8 KiB CHR RAM, with no PRG RAM, IRQ or bus
conflict. The checksum-pinned _Kaiketsu Yanchamaru_ profile has the cataloged PRG CRC `D1397940`,
observes bank 14 followed by bank 0 and a vertical-mirroring write, and completes 1,500 input-driven
frames plus deterministic visual/audio/cycle save-state replay. See the
[TAM-S1 hardware analysis](https://forums.nesdev.org/viewtopic.php?t=19769) and
[NESCartDB board record](https://nescartdb.com/profile/view/3801/kaiketsu-yanchamaru).

## VS System mainboard (99)

Mapper 99 models the populated sockets on the VS mainboard, not a modulo-wrapped CNROM cartridge.
CPU `$8000-$9FFF` normally maps socket 0; the fifth Gumshoe socket participates in OUT2 selection
only on a five-socket/40 KiB image. `$A000-$FFFF` maps sockets 1–3. PPU `$0000-$1FFF` always selects
one of two 8 KiB CHR sockets through CPU OUT2 (`$4016` bit 2) when the controller latch commits.
Missing fixed PRG sockets or the selected CHR socket are electrically undriven. The 2 KiB
`$6000-$7FFF` shared RAM repeats every `$800` bytes, and nametables are four-screen on VS hardware.

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

Legacy iNES cannot encode the RGB PPU or control wiring. The exact _Vs. Soccer_ SC4-3 PRG/CHR CRC
pair `46914E3E`/`FEBB5370` therefore resolves through the content metadata registry to
`RP2C04-0003` and player-one gameplay on the `$4017` left stick. The VS Select-1 cabinet line remains
on `$4016` bit 2, so the public facade routes logical player-one Start separately from the gameplay
stick. The pinned profile exercises that crossed wiring with a real coin pulse, reaches an active
match, records 785 distinct frames across 1,800 frames, and proves deterministic visual/audio/cycle
save-state replay. _Vs. Gumshoe_ remains required to verify fifth-PRG-socket software externally.

## NTDEC/Asder (112)

Mapper 112 uses a two-stage register path rather than the Namco 118 command layout. Even-address
mirrors of `$8000`, `$A000`, `$C000` and `$E000` select one of eight registers, write its byte,
write the outer CHR lines and select vertical/horizontal mirroring respectively. Odd-address writes
are ignored.

Registers 0 and 1 select the first two 8 KiB PRG-ROM windows; the final two windows are fixed to the
last two banks. Registers 2 and 3 each select an even-aligned 2 KiB CHR pair, while registers 4–7
select four independent 1 KiB CHR banks. `$C000` bits 4–7 independently supply CHR A18 to those
four 1 KiB registers only. The board exposes no decoded PRG RAM, bus conflict or IRQ, and powers on
with cleared registers and vertical mirroring.

The checksum-pinned 128 KiB PRG + 256 KiB CHR _Sango Fighter_ profile runs 2,520 input-driven frames
from title into active combat with 460 distinct frames, exact visual/audio/CPU-cycle checkpoints and
a deterministic 120-frame save-state replay. Its execution trace writes multiple values to all eight
bank registers. Its fixed vertical mirroring and 256 KiB CHR geometry cannot exercise `$E000` changes
or the four CHR A18 lines, which remain covered by focused board tests.

Unsupported submappers, CHR RAM, four-screen nametables, PRG images beyond 128 KiB and CHR images
beyond 512 KiB fail closed. See
[NESdev mapper 112](https://www.nesdev.org/wiki/INES_Mapper_112).

## HES NTD-8 (113)

The NTD-8 extends NINA-03/NINA-06 with a single write-only expansion latch decoded when
`(address & $E100) == $4100`. Bits 5-3 select one of eight 32 KiB PRG-ROM banks. CHR selection is
deliberately non-contiguous: bit 6 supplies the high bit and bits 2-0 supply the low three bits for
one of sixteen 8 KiB CHR-ROM banks. Bit 7 selects horizontal (0) or vertical (1) mirroring.

Expansion reads remain open bus. The board has no PRG RAM, bus conflicts, IRQ or expansion audio;
power-on clears both bank fields and selects horizontal mirroring. Unsupported submappers,
four-screen nametable memory, CHR RAM and non-power-of-two or oversized ROM images fail closed; the
accepted directly addressed capacities are 32-256 KiB PRG and 8-128 KiB CHR.

Legacy iNES loading suppresses byte 8's generic 8 KiB PRG-RAM fallback for Mapper 113. The public
cartridge inventory therefore matches the NTD-8 expansion decode instead of exposing unreachable
writable memory. A legacy battery flag is rejected because this board has no persistent storage.

Mapper 113 is specifically the HES/AVE multicart extension; ordinary 32 KiB NINA-03/NINA-06 games
belong to mapper 79, whose mirroring is hardwired. Four local single-game images with legacy
mapper-113 headers were rejected as end-to-end evidence after the D7 mirroring behavior visibly
corrupted _AV Soccer_'s selection screen. Do not weaken the mapper-113 circuit model or checksum-pin
those images to accommodate a bad header. See
[NESdev mapper 79](https://www.nesdev.org/wiki/INES_Mapper_079) and
[NESdev mapper 113](https://www.nesdev.org/wiki/INES_Mapper_113).

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
128–256 KiB PRG ROM, 8–512 KiB CHR ROM and two-screen nametables. The checksum-pinned 256+256 KiB
submapper-0 _The Lion King_ profile runs 1,680 input-driven frames from title into scrolling
gameplay, produces 742 distinct frames, and verifies exact visual/audio/CPU-cycle results plus a
deterministic 120-frame save-state replay. Its trace observes 104 MMC3 register sets, IRQ
enable/disable and both pending states. The independently checksum-pinned, same-sized mapper-182
_Pocahontas_ profile runs 3,000 input-driven frames through gameplay and an event-panel transition,
produces 1,051 distinct frames, and verifies the same exact outputs plus 120-frame replay; its trace
observes 213 MMC3 register sets and IRQ enable/disable. Both images leave the outer registers zero,
so NROM and CHR-A18 paths remain focused board-test evidence; submapper 1 likewise remains
focused-test evidence. See
[NESdev mapper 114/182](https://www.nesdev.org/wiki/INES_Mapper_182).

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
The checksum-pinned mapper-115 512 KiB CHR Chinese _Yuu Yuu Hakusho Final_ profile runs 3,600
input-driven frames from title through active combat, produces 1,472 distinct frames, and verifies
exact visual/audio/CPU-cycle results plus deterministic 120-frame save-state replay. Its register
trace reaches both CHR outer halves, two direct-MMC3 outer-register values, IRQ enable/disable and
59 distinct MMC3 register sets; NROM override remains focused-test evidence. The checksum-pinned
mapper-248 _Bao Qing Tian_ profile with 256 KiB each of PRG and CHR verifies 1,800 input-driven
frames, 614 distinct frames and the same exact outputs. Focused tests prove both IDs enter the same
board state machine. See
[NESdev mapper 115](https://www.nesdev.org/wiki/INES_Mapper_115).

## Future Media (117)

Mapper 117 exposes four exact 8 KiB PRG registers at `$8000-$8003` and eight exact 1 KiB CHR
registers at `$A000-$A007`; the power-on PRG values `$FC-$FF` select the final four banks after the
physical address lines are masked. `$D000.D0` selects vertical or horizontal mirroring. CPU
`$6000-$7FFF` is electrically open and the known 128/256 KiB PRG plus 256 KiB CHR boards have no
writable cartridge memory.

The byte written to `$C001` is copied into the IRQ counter and arms it only when `$C003` is written.
`$E000.D0` independently enables counting and acknowledges the output; `$C002` acknowledges without
changing either gate or the counter. Each PPU-A12 rise after at least ten low PPU cycles decrements a
nonzero armed counter. Reaching zero asserts IRQ once and clears the armed gate, so software must
reload before another IRQ. Save state retains both gates, the pending output and the complete A12
filter phase.

Three maintained implementations independently corroborate this contract:
[Mesen CE](https://github.com/nesdev-org/MesenCE/blob/7f418e352a2bab89f239ca09930a0c2b5074f9e3/Core/NES/Mappers/Unlicensed/Mapper117.h),
[FCEUX](https://github.com/TASEmulators/fceux/blob/a62b868e9247c4aafd66f597cdfa8d2609704087/src/boards/117.cpp) and
[Nestopia](https://github.com/0ldsk00l/nestopia/blob/a0079a045b6ad87410ed7c4192977314bb86e222/source/core/board/NstBoardFutureMedia.cpp).
Current puNES describes a wider, incompatible register model, but no assigned submapper or published
hardware evidence identifies it as the base board. The factory therefore accepts only the shared
Future Media geometry and fails closed on variants instead of blending both behaviors. The
checksum-pinned _San Guo Zhi IV: Chi Bi Feng Yun_ profile exercises the three software-used PRG
windows, all CHR registers, mirroring and both IRQ gates through 1,320 input-driven frames and a
deterministic 120-frame save-state replay.

## TxSROM and TQROM (118, 119)

Both boards reuse the complete revision-B MMC3 banking and filtered-A12 IRQ state machine.

TxSROM connects CHR A17 to CIRAM A10 instead of using MMC3's mirroring output. Depending on CHR mode,
R0/R1 select nametables in two 2 KiB pairs or R2-R5 select all four 1 KiB slots independently;
`$A000` mirroring writes have no effect. The checksum-pinned 128 KiB PRG + 128 KiB CHR _Pro Sport
Hockey_ profile runs 2,520 input-driven frames from title into active play with 661 distinct frames,
exact visual/audio/CPU-cycle checkpoints and a deterministic 120-frame save-state replay. Its trace
reaches 63 MMC3 register sets, both CHR modes, IRQ enable and both uniform CIRAM pages; mixed
per-slot CIRAM layouts remain covered by focused board tests. See
[NESdev mapper 118](https://www.nesdev.org/wiki/INES_Mapper_118).

TQROM keeps standard MMC3 mirroring but connects CHR A16 to chip enable: bank values with bit 6 clear
select 16–64 KiB CHR ROM, while set values select one of eight 1 KiB CHR-RAM banks. Official boards
use 128 KiB PRG ROM, 8 KiB volatile CHR RAM and no PRG RAM. Legacy iNES cannot declare the mixed CHR
layout, so mapper 119 implies the RAM; NES 2.0 must declare it explicitly.

The checksum-pinned 128 KiB PRG + 64 KiB CHR ROM + 8 KiB CHR RAM _Pinbot_ profile runs 2,760
input-driven frames from title into active pinball with 825 distinct frames, exact
visual/audio/CPU-cycle checkpoints and a deterministic 120-frame save-state replay. Its trace
selects all four ROM/RAM slot combinations, writes 6,245 nonzero CHR-RAM bytes and observes IRQ
pending; CHR-mode 0 remains covered by focused board tests. See
[NESdev mapper 119](https://www.nesdev.org/wiki/TQROM).

## Sachen SA-72008 (133)

Mapper 133 uses the later 72-pin _Jovial Race_ board's write-only expansion latch. Addresses matching
the `$E100` mask value `$4100`—including the game's `$4120` write—store the full byte. D2 selects one
of two 32 KiB PRG banks and D1-D0 select one of four 8 KiB CHR-ROM banks; D7-D3 are retained in the
physical latch state but have no bonded outputs. Expansion reads and `$6000-$7FFF` remain CPU open
bus, `$8000-$FFFF` is ROM-only, and nametable mirroring remains hardwired from the cartridge header.
The latch clears on cold power and survives warm reset.

The factory accepts 32/64 KiB PRG and 8/16/32 KiB CHR-ROM, rejects explicit PRG RAM, CHR RAM,
four-screen memory, non-power-of-two layouts and unknown submappers. Mapper 133 also historically
labels the original 60-pin Sachen 3009 board, whose AX-24G clone has a different `$8000/$8001`
register path and analog feedback. It is not guessed from a title hash: both early game programs
already contain the compatible `$4120` write, so emulators only need the simpler SA-72008 behavior.
The checksum-pinned 64 KiB PRG + 32 KiB CHR 72-pin _Jovial Race_ profile runs a 1,200-frame attract
baseline and 2,520 input-driven frames from title and player selection into active racing. It
produces 1,069 distinct interactive frames, exact visual/audio/CPU-cycle checkpoints and a
deterministic 120-frame save-state replay. The trace selects latch values `$00/$07/$03/$04`, both
PRG banks and CHR banks 0/3; the other two reachable CHR banks remain covered by focused tests. See
[NESdev mapper 133](https://www.nesdev.org/wiki/INES_Mapper_133).

## Jaleco JF-11/JF-14 (140)

A write-only latch throughout `$6000-$7FFF` uses bits 5-4 to select one of four 32 KiB PRG banks and
bits 3-0 to select one of sixteen 8 KiB CHR-ROM banks. The register occupies otherwise-unmapped
space, so writes have no bus conflicts and reads remain open bus. Direct address-line outputs limit
PRG and CHR to power-of-two capacities through the 128 KiB reachable by those physical select lines;
non-power-of-two images fail closed instead of acquiring modulo-based aliases. See
[NESdev mapper 140](https://www.nesdev.org/wiki/INES_Mapper_140).

## Kaiser KS7032 / KS202 (142)

Mapper 142 is Kaiser's KS7032 FDS-conversion board built around the KS202 ASIC. `$E000-$EFFF`
selects one of eight internal register numbers and a following `$F000-$FFFF` write updates selectors
1-4 with its low nibble. Those four registers map 8 KiB PRG-ROM banks at `$8000`, `$A000`, `$C000`
and `$6000`; the final bank stays fixed at `$E000`. Selectors 0 and 5-7 have no modeled external
output. The board provides unbanked 8 KiB volatile CHR RAM, no writable CPU memory and hardwired
two-screen mirroring.

Writes in the complete `$8000-$BFFF` pages assemble a 16-bit IRQ reload value from four low nibbles.
`$C000` bit 1 enables the CPU-cycle counter and reloads it, while any `$C000`/`$D000` write clears the
IRQ line. On 16-bit overflow, the counter reloads, asserts IRQ and disables itself. `$D000` only
acknowledges: it does not copy bit 0 into enable as VRC3 does. This one-shot overflow behavior follows
the PCB-corrected implementation rather than inheriting the current VRC3 entity's repeating modes.

The factory accepts only the known 128 KiB PRG-ROM plus 8 KiB CHR-RAM geometry, two-screen
nametables and submapper 0. The checksum-pinned Kaiser _Super Mario Bros. 2_ profile runs a 600-frame
attract baseline and 1,800 input-driven frames into World 1-1. It produces 739 distinct interactive
frames, exact visual/audio/CPU-cycle checkpoints and deterministic 120-frame save-state replay. Its
trace reaches PRG register sets `0/0/0/0`, `12/13/4/11` and `12/13/0/11`, plus completed IRQ reloads
`$E9A7/$E9AE`. See
[NESdev mapper 142](https://www.nesdev.org/wiki/INES_Mapper_142) and the
[MAME KS7032 implementation](https://github.com/mamedev/mame/blob/f6258eb0fb487248c02cf5131ef509ddb46b7dee/src/devices/bus/nes/kaiser.cpp#L430).

## Sachen SA-015 / SA-630 (150)

Mapper 150 exposes Sachen's eight-register, `74LS374N`-marked ASIC through index and data ports whose
`$C101` decode repeats from `$4100` through `$7FFF`. The data port is readable: the normal board
drives D2-D0, and all eight registers retain all three bits even though R0-R3 have no bonded output.
R5 D1-D0 select one 32 KiB PRG bank; R4 D0 drives CHR A15 and R6 D1-D0 drive CHR A14-A13, selecting
one 8 KiB CHR bank. R2 is deliberately unused and does not inherit mapper 243's CHR A13 line.

R7 D2-D1 maps nametable pages as `[0,0,0,1]`, `[0,0,1,1]`, `[0,1,0,1]` or `[1,1,1,1]`. The ASIC
clears only on cold power and is preserved across warm reset. A board solder pad can connect ASIC pin
14 to Vcc instead of CPU D2; in that setting every write is ORed with `$04` and read D2 is open bus.
The mapper entity models both electrical settings, while the cartridge factory selects the normal
CPU-D2 connection because neither iNES nor NES 2.0 records this pad and production code does not use
title hashes.

The factory accepts power-of-two PRG capacities from 32 to 128 KiB and CHR-ROM capacities from 8 to
64 KiB, and rejects explicit PRG RAM, CHR RAM, four-screen memory and unknown submappers. A local
_Poker III 5-in-1_ dump is incorrectly headed as mapper 243; diagnostic in-memory correction to 150
ran 1,800 non-halted frames with coherent pattern banking. It remains rejection evidence rather than
a pinned profile until a correctly headed fixture is available. See
[NESdev mapper 150](https://www.nesdev.org/wiki/INES_Mapper_150) and the
[Mesen CE board implementation](https://github.com/nesdev-org/MesenCE/blob/7f418e352a2bab89f239ca09930a0c2b5074f9e3/Core/NES/Mappers/Sachen/Sachen74LS374N.h).

## Nanjing FC-001 (163)

Mapper 163 models the Nanjing FC-001 ASIC as its own board rather than aliasing the related mapper
162/164 families. CPU `$8000-$FFFF` is one switchable 32 KiB PRG-ROM window and `$6000-$7FFF` is an
unbanked 8 KiB battery-backed PRG-NVRAM window. PPU `$0000-$1FFF` uses 8 KiB volatile CHR RAM, while
nametable mirroring remains hardwired from the cartridge header.

Writes in the mirrored `$5000`, `$5100/$5101`, `$5200` and `$5300` pages own the low PRG bank,
feedback latch, high PRG bank and mode register respectively. Mode bit 0 swaps CPU D0/D1 before the
first three register inputs see them; mode bit 2 either exposes the low bank bits or forces PRG
A15/A16 high, which makes cold power start in bank 3. The 2 MiB layout exposes all six 32 KiB bank
lines. On 1 MiB cartridges the ASIC's A19/A20 outputs share the ROM's single high address input, so
high-register values 1 and 2 select the same 512 KiB half and remain equivalent after D0/D1 swapping.

The feedback latch captures enable on D0 and value on D2 during even `$5100` writes. An odd write
flips the retained value only while enabled. Mirrored feedback reads drive only D2, with the retained
value inverted; the CPU bus supplies the other seven open-bus bits. Automatic CHR mode replaces CHR
A12 with PPU A9 captured on the most recent PPU A13 rising edge. It therefore follows actual address
line transitions instead of approximating the behavior with scanline 127/239 callbacks.

The factory accepts only 1 or 2 MiB PRG ROM, 8 KiB volatile CHR RAM, exactly 8 KiB battery-backed
PRG NVRAM, hardwired two-screen nametables and submapper 0. Submapper 1 remains rejected because the
NJ-YUYIN0106 board adds an ADPCM device that is not yet modeled. The checksum-pinned 2 MiB
_Xian Jian Qi Xia Zhuan_ profile runs a 600-frame title baseline and 2,400 input-driven frames through
both title stages into the opening dialogue. It produces 69 distinct interactive frames, exact
visual/audio/CPU-cycle checkpoints and a deterministic 120-frame save-state replay. See
[NESdev mapper 163](https://www.nesdev.org/wiki/INES_Mapper_163).

## Dongda PEC-9588 (164)

Mapper 164 models the Dongda PEC-9588/cy2000-3 circuit rather than the obsolete two-register BxROM
approximation found in older emulator sources. Register pages `$5000`, `$5100`, `$5200` and `$5300`
select the low PRG/mode lines, high PRG lines, Microwire pins and mirroring control. Every register
uses an `$FF00` decode. On power or reset, all board registers clear: `$8000-$BFFF` selects 16 KiB
bank 0 and `$C000-$FFFF` selects bank `$1F`, where the reset vector resides.

With `$5000.D4` clear, the board is UxROM-like. D5 and D3-D0 select the lower 16 KiB bank; the upper
window uses bank `$1F`, or bank `$1C/$1E` when D6 enables its alternative fixed-bank wiring. With D4
set, D3-D0 select a consecutive 32 KiB BxROM-style bank. `$5100.D1-D0` supply PRG A20/A19 in both
modes. UxROM mode forces vertical mirroring; BxROM mode selects horizontal or vertical mirroring
from `$5300.D7`.

The cartridge has 8 KiB of unbanked volatile CHR RAM. When `$5000.D7` enables 1bpp mode, CHR A3 and
A12 no longer follow pattern-fetch A3/A12: they use PPU A0/A9 captured on the most recent PPU A13
rising edge. This models the board's address lines directly and works for rendering and `$2007`
access without scanline callbacks. The `$6000-$7FFF` window is absent or a 2 KiB volatile RAM chip
mirrored four times; legacy iNES uses the 2 KiB compatibility layout, while NES 2.0 can declare its
absence explicitly.

Save data lives in a separate 512-byte 93C66 EEPROM, not in PRG NVRAM. `$5200` drives EEPROM DI,
clock and chip-select, while `$5500-$55FF` drives only CPU D2 with the inverted serial output. The
Microwire device implements READ with its initial dummy bit and sequential output, WRITE/ERASE,
WRAL/ERAL and EWEN/EWDS write protection. In-flight protocol and write-enable state participate in
save states; EEPROM bytes use mapper-owned NVRAM and therefore survive power cycles and battery-save
round trips independently of volatile PRG/CHR RAM.

The factory accepts 512 KiB, 1 MiB or 2 MiB PRG ROM, 8 KiB volatile CHR RAM, optional 2 KiB volatile
PRG RAM, the 512-byte EEPROM, two-screen nametables and submapper 0. The checksum-pinned 1 MiB
_Digimon: Crystal Version_ profile verifies a 600-frame animated baseline with 574 distinct frames
and 3,000 input-driven frames through the title, character selection and opening dialogue with 345
distinct frames, exact visual/audio/CPU-cycle checkpoints and deterministic 120-frame save-state
replay. See [NESdev mapper 164](https://www.nesdev.org/wiki/INES_Mapper_164) and Microchip's
[AT93C66B command/timing specification](https://ww1.microchip.com/downloads/aemDocuments/documents/MPD/ProductDocuments/DataSheets/AT93C56B-AT93C66B-Microwire-Serial-EEPROM-Industrial-Grade-DS20006260.pdf).

## Sunsoft-1 (184)

PRG ROM is a fixed 32 KiB window. The write-only `$6000-$7FFF` latch selects the lower 4 KiB CHR bank
from bits 2-0 and the upper 4 KiB bank from bits 5-4; the upper CHR A14 line is hard-wired high, so
that window selects banks 4-7 on a 32 KiB CHR ROM and mirrors onto banks 0-3 on a 16 KiB ROM. Reads
from the latch window remain open bus.

The checksum-pinned 32 KiB PRG + 32 KiB CHR _The Wing of Madoola_ profile runs 3,000 input-driven
frames from title into active stage-one play, producing 2,295 distinct frames, exact
visual/audio/CPU-cycle checkpoints and a deterministic 120-frame save-state replay. The trace
selects lower/upper CHR bank pairs 0/4, 0/7, 2/7 and 3/7; the remaining reachable pairs stay covered
by focused tests. See
[NESdev mapper 184](https://www.nesdev.org/wiki/INES_Mapper_184) and the
[Sunsoft-1 pinout](https://www.nesdev.org/wiki/Sunsoft_1_pinout).

## CNROM protection (185)

Mapper 185 is a one-bank CNROM variant whose two-bit conflicted latch controls the CHR-ROM
chip-select line rather than selecting among banks. When the selected value does not match the
board's enable wiring, the cartridge disables CHR ROM and tri-states D7-D1 while the protection
circuit's compatibility-bearing D0 pull-up drives bit 0 high; the remaining open-bus bits follow the
PPU address low byte. This behavior is required by the earlier _Mighty Bomb Jack_ board. NES 2.0
submappers 4-7 explicitly identify enable values 0-3 and are supported; legacy/submapper 0 does not
identify that value and fails closed. PRG stays fixed as a 16 KiB mirrored or 32 KiB image, and PRG
RAM is absent. See
[NESdev mapper 185](https://www.nesdev.org/wiki/INES_Mapper_185).

## UNL SF3/KOF96 (187)

Mapper 187 wraps an MMC3-compatible core with the protection and outer-bank logic used by the
unlicensed SF3/KOF96 boards. Exact writes to `$5000` or `$6000` update the outer PRG register. With
D7 clear, MMC3 R6/R7 and PRG mode select the four 8 KiB windows through a six-bit bank path. With D7
set, the outer register replaces that path with either a mirrored 16 KiB bank or one of two 32 KiB
wiring modes selected by D5/D6. PRG ROM is 128 or 256 KiB, and the board exposes no PRG-RAM window.

The MMC3 core retains horizontal/vertical mirroring and its filtered-A12 IRQ counter. CHR ROM is 256
or 512 KiB; CHR A18 is asserted only for the four PPU slots currently sourced by MMC3's two 2 KiB
registers R0/R1, including when CHR mode exchanges the pattern-table halves. Reads throughout
`$5000-$5FFF` drive the board's reachable `$83` protection response. An exact `$8000` write arms the
exact `$8001` bank-data port, so that one address is ignored beforehand; other mirrored MMC3
register aliases retain their normal decode independently of the gate.

Checksum-pinned _The King of Fighters '96_ and _Street Fighter Zero 2 '97_ profiles cover both
published PRG/CHR capacities, outer-override activity, 2,400 input-driven frames, exact visual,
audio and CPU-cycle checkpoints, and deterministic 120-frame save-state replay. The local
`sf97.nes` image does not follow this board's startup protocol despite declaring mapper 187, so it
remains rejected as suspect metadata rather than receiving a title-hash compatibility path. The
implementation follows matching behavior in
[Mesen 2](https://github.com/SourMesen/Mesen2/blob/b9fa69ddc6d0a331fb103fdb5eef6904305703c2/Core/NES/Mappers/Mmc3Variants/MMC3_187.h) and
[FCEUX](https://github.com/TASEmulators/fceux/blob/a62b868e9247c4aafd66f597cdfa8d2609704087/src/boards/187.cpp).

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
as separate validated layers. The checksum-pinned _Thunder Warrior_ profile verifies 2,520
input-driven frames with 800 distinct frames, exact visual/audio/CPU-cycle results and a
deterministic 120-frame save-state replay. A diagnostic trace of the same input path reaches all four
outer-bank values present in its 128 KiB PRG image and observes both asserted and cleared MMC3 IRQ
state. See [NESdev mapper 189](https://www.nesdev.org/wiki/INES_Mapper_189).

## Namco 118 / DxROM (206)

The discrete predecessor to MMC3. `$8000` (even) selects one of eight bank registers and `$8001` (odd)
writes it: R0/R1 are 2 KiB CHR banks at PPU `$0000`/`$0800`, R2-R5 are 1 KiB CHR banks at
`$1000-$1FFF`, and R6/R7 are 8 KiB PRG banks at `$8000`/`$A000` with the final two banks fixed. There
is no IRQ, no PRG-RAM and no mirroring register, so mirroring stays hardwired from the header. The
two 2 KiB registers physically omit D0, all CHR windows source ROM, and writes to `$A000-$FFFF` are
ignored. See
[NESdev mapper 206](https://www.nesdev.org/wiki/INES_Mapper_206).

## C&E / Supertone (240)

Mapper 240 uses one data latch in the cartridge expansion range. Writes at `$4020-$5FFF` route
D5-D4 to a 32 KiB PRG bank and D3-D0 to an 8 KiB CHR bank. Reads in that range remain CPU open bus;
writes at `$8000-$FFFF` target ROM and do not provide a second GNROM-style register path. The latch
starts at bank zero on cold power and is not connected to the console's warm-reset signal.

The known board carries exactly 128 KiB each of PRG and CHR ROM, a directly mapped 8 KiB PRG RAM
or battery-backed NVRAM window at `$6000-$7FFF`, and hardwired horizontal or vertical mirroring.
`CeSupertoneMapper` owns those signals and validates effective bank outputs transactionally in save
state. The checksum-pinned non-HACK _Jing Ke Xin Zhuan_ profile verifies 1800 input-driven frames,
341 distinct frames, exact visual/audio/cycle results and deterministic 120-frame save-state replay.
A separate trace across it and a local HACK image exercised five effective latch states. Their
copyrighted bytes remain outside the repository. See
[NESdev mapper 240](https://www.nesdev.org/wiki/INES_Mapper_240).

## BxROM with WRAM (241)

Mapper 241 adds direct 8 KiB WRAM or battery-backed NVRAM at `$6000-$7FFF` to a conflict-free BxROM
data path. Every write at `$8000-$FFFF` replaces one byte-wide latch; its connected low lines select
the complete 32 KiB PRG window while unconnected high lines naturally mirror the available power-of-
two ROM. The board has unbanked 8 KiB volatile CHR RAM, no IRQ and horizontal or vertical mirroring
hardwired in the cartridge header. Cold power clears the PRG latch; warm reset does not reach it.

The factory accepts power-of-two PRG capacities from 32 KiB through 1 MiB, exactly 8 KiB of PRG RAM
or NVRAM, exactly 8 KiB of volatile CHR RAM and only the base submapper. It rejects four-screen
memory and does not reproduce FCEUX's D7 bank alteration, which exists only for an overdump whose
proper identity is NES 2.0 mapper 481.

Some educational cartridges additionally carry a TMS5220C-data-compatible LPC speech device at
`$5000-$5FFF`. iNES/NES 2.0 does not distinguish that optional population with a mapper subvariant;
the synthesis device is not yet implemented, so its range remains open bus rather than returning a
fabricated constant. This limits speech without contaminating the proven banking owner.

A user-local 512 KiB _Edu_ image selected raw banks 0/1/2/4, retained an 8 KiB battery snapshot and
completed 1200 non-halted frames. A 128 KiB _Journey to the West_ image selected banks 0/1/3 with
volatile WRAM. Both reproduced identical 120-frame save-state segments. Their bytes remain outside
the repository. See [NESdev mapper 241](https://www.nesdev.org/wiki/INES_Mapper_241), the
[Mesen CE implementation](https://github.com/nesdev-org/MesenCE/blob/7f418e352a2bab89f239ca09930a0c2b5074f9e3/Core/NES/Mappers/Unlicensed/Mapper241.h)
and the
[MAME TXC board notes](https://github.com/mamedev/mame/blob/dcc9f33c59815103994534a85d2f70d77b2ca862/src/devices/bus/nes/txc.cpp#L259).

## Sachen SA-020A (243)

Mapper 243 exposes the three-bit index and data ports of Sachen's eight-register ASIC through the
`$C101` address mask from `$4100` through `$7FFF`. The data port is readable and drives only D2-D0;
all eight registers retain those three bits, including R0/R1/R3 whose outputs are not bonded to
board signals. Writes outside the decoded ports do not invent PRG-RAM or ROM register aliases.

R5 D1-D0 select one 32 KiB PRG bank. R2 D0, R4 D0 and R6 D1-D0 respectively drive CHR A13, A14 and
A16-A15, selecting one 8 KiB CHR bank without conflating the differently wired mapper-150 board.
R7 D2-D1 selects the physical nametable pages `[0,0,0,1]`, `[0,0,1,1]`, `[0,1,0,1]` or
`[1,1,1,1]`; the first mode remains a true vertically flipped L rather than an approximation using
the header mirroring enum. The ASIC powers up with all registers clear and retains them across warm
reset. Save state captures the selected index and all eight validated register values.

The factory accepts power-of-two PRG capacities from 32 to 128 KiB and CHR-ROM capacities from 8
to 128 KiB, rejects explicit PRG RAM, CHR RAM, four-screen memory and unknown submappers, and keeps
ROM mirroring electrical rather than modulo-folding non-power-of-two images. A user-local
_Poker III 5-in-1_ image was rejected as mapper-243 evidence because TC-020 belongs to mapper 150;
the core neither rewrites its header nor adds a title hash. See
[NESdev mapper 243](https://www.nesdev.org/wiki/INES_Mapper_243).

## C&E Decathlon (244)

Mapper 244 writes one byte-wide permutation network throughout `$8000-$FFFF`. D3 chooses the
destination without disturbing the other output. For PRG writes, D5-D4 select one of four rows and
D1-D0 select one entry, producing a 32 KiB bank in the sequences `0123`, `3210`, `0213` or `3120`.
For CHR writes, D6-D4 select one of eight rows and D2-D0 select an entry. Those rows are `01234567`,
`02134657`, `01452367`, `04152637`, `04261537`, `02461357` and two copies of `76543210`. D7 is
unconnected and no CPU write creates a PRG-RAM window or changes hardwired nametable mirroring.

`CeDecathlonMapper` stores the two effective output latches independently, clears them on cold
power, preserves them across warm reset and validates both before save-state mutation. The factory
accepts only the known 128 KiB PRG plus 64 KiB CHR-ROM board with two-screen nametables and
submapper 0. A user-local _Decathlon_ image ran 2200 frames, exercised eight bank pairs and
completed deterministic replay across a CHR-bank transition. The current NESdev catalog has no
dedicated mapper-244 page; the permutation tables agree in
[MesenCE](https://github.com/nesdev-org/MesenCE/blob/master/Core/NES/Mappers/Unlicensed/Mapper244.h),
[puNES](https://github.com/punesemu/puNES/blob/master/src/core/mappers/mapper_244.c) and
[FCEUX](https://github.com/TASEmulators/fceux/blob/master/src/boards/244.cpp).

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
register behavior through `Mmc3Mapper`, with both layers validated in save state. The pinned 1 MiB
_Dragon Quest VII_ profile runs 1,600 input-driven frames with exact visual/audio/CPU-cycle
checkpoints, uses both outer PRG halves and completes a deterministic 120-frame save-state replay.
A second 1 MiB image also uses both halves; a 512 KiB image exercises the TNROM-like fallback. PRG
images from 128 KiB through 1 MiB are accepted only at power-of-two board sizes; images declaring
CHR-ROM fail closed rather than being mistaken for this board. See
[NESdev mapper 245](https://www.nesdev.org/wiki/INES_Mapper_245).

## C&E Fong Shen Bang (246)

Mapper 246 exposes four 8 KiB PRG registers at `$6000-$6003` and four 2 KiB CHR registers at
`$6004-$6007`; only A2-A0 are decoded, so that eight-byte register block repeats through `$67FF`.
The board maps exactly 2 KiB of SRAM at `$6800-$6FFF`, while `$6000-$67FF` reads and
`$7000-$7FFF` remain CPU open bus. Nametable mirroring is hardwired, register writes have no bus
conflict and the board has no IRQ.

The physical PRG output has a second read path: accesses to `$FFE4-$FFE7`, `$FFEC-$FFEF`,
`$FFF4-$FFF7` and `$FFFC-$FFFF` force PRG A17 high while retaining the other bank-register outputs.
This includes the reset vector and is part of the board's startup behavior, not a ROM-specific
patch. `CeFongShenBangMapper` preserves raw byte-wide register contents so this forced line is
applied before the 512 KiB PRG address space discards disconnected D7-D6. Cold power initializes
the four 74LS670 register files to their observed all-high tendency; warm reset preserves them.

The factory accepts only the original 512 KiB PRG + 512 KiB CHR-ROM geometry, submapper 0,
two-screen nametables and 2 KiB of NES 2.0 PRG RAM/NVRAM. Legacy iNES can describe the SRAM only as
its implicit 8 KiB allocation, of which the physical `$6800-$6FFF` window exposes the first 2 KiB.
Tests exhaust the 16 high-address aliases and cover repeated register decoding, every bank window,
WRAM/open bus, reset, state validation and format boundaries. The pinned original _Feng Shen Bang_
profile runs 2,200 input-driven frames with 391 distinct frames plus exact visual, audio and CPU-cycle
checkpoints, then completes a deterministic 120-frame save-state replay. A separate trace exercised
15 bank-register states. Two modified images each ran 900 frames, exercised 13/14 states and
remained active as supplemental smoke evidence. See
[NESdev mapper 246](https://www.nesdev.org/wiki/INES_Mapper_246) and the
[cartridge hardware trace](https://forums.nesdev.org/viewtopic.php?start=60&t=13969); the traced
high-address path is also modeled by
[puNES](https://github.com/punesemu/puNES/blob/master/src/core/mappers/mapper_246.c), while
[MesenCE](https://github.com/nesdev-org/MesenCE/blob/master/Core/NES/Mappers/Unlicensed/Mapper246.h)
and [FCEUX](https://github.com/TASEmulators/fceux/blob/master/src/boards/246.cpp) document the core
bank and WRAM layout.

## Time Diver MMC3 (250)

Mapper 250 retains standard MMC3 PRG/CHR banking, mirroring, 8 KiB PRG-RAM protection and filtered
PPU-A12 IRQ behavior, but rewires the CPU write bus. CPU A13-A14 still choose the `$8000`, `$A000`,
`$C000` or `$E000` register pair; A10 becomes the MMC3 port-select bit, and A7-A0 supply the value
normally driven by CPU D7-D0. The written CPU data byte is electrically ignored. The effective
MMC3 write is therefore `(address & $E000) | ((address & $0400) >> 10)` with value
`address & $00FF`.

The board is an immutable wiring mode around `Mmc3Mapper`, so it does not duplicate the bank,
mirroring, RAM, IRQ or save-state implementation. The factory accepts submapper 0, 32-512 KiB PRG
ROM, 8-256 KiB CHR ROM, optional 8 KiB PRG RAM/NVRAM and two-screen nametables. Tests cover both
address inputs, ignored CPU data, every register group, PRG/CHR banking, RAM protection, A12 IRQ,
save-state restoration and the complete geometry boundary. The pinned 128 KiB + 128 KiB _Time
Diver Avenger_ profile runs 2,200 input-driven frames with 401 distinct frames plus exact visual,
audio and CPU-cycle checkpoints, then completes a deterministic 120-frame save-state replay. A
separate register trace exercised 15 distinct MMC3 bank-register states. The address transform
agrees in
[NESdev mapper 250](https://www.nesdev.org/wiki/INES_Mapper_250),
[MesenCE](https://github.com/nesdev-org/MesenCE/blob/master/Core/NES/Mappers/Mmc3Variants/MMC3_250.h),
[puNES](https://github.com/punesemu/puNES/blob/master/src/core/mappers/mapper_250.c) and
[FCEUX](https://github.com/TASEmulators/fceux/blob/master/src/boards/mmc3.cpp).

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
