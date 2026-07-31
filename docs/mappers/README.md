# Mapper reference

The mapper module (`packages/fc-emu/src/domain/emulation/mapper/`) is the cartridge-hardware submodule
of the Emulation bounded context. In the supported Control Deck map it translates CPU
`$6000-$FFFF` and PPU `$0000-$1FFF` accesses into
ROM/RAM offsets, owns bank latches, nametable mirroring and any board IRQ, and hides every
board-specific register behind one contract. CPU and PPU devices never see mapper registers; they see
only the `Mapper` interface.

This document describes the contract, the selection factory, save-state handling and every supported
board. Support status and evidence are tracked separately in
[../mapper-compatibility.md](../mapper-compatibility.md); accepted header/board shapes are in
[../cartridge-formats.md](../cartridge-formats.md).

## The `Mapper` contract

`mapper.ts` defines the address-space contract. Every board implements it and nothing else is exposed
to the rest of core.

| Member                       | Role                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `read(address)`              | Reads a CPU (`$6000-$FFFF`) or PPU (`$0000-$1FFF`) byte through the current bank layout. |
| `write(address, value)`      | Decodes a register write or routes a CHR/PRG-RAM write.                                  |
| `cpuReadDriveMask(address)`  | Optional CPU data-line mask; omitted means fully driven, `0` means open bus.             |
| `observePpuAddress(address)` | Optional PPU address-line snoop for boards such as MMC3.                                 |
| `observePpuRead(address)`    | Optional completed-read event for read-triggered MMC2/MMC4 CHR latches.                  |
| `tickPpu()`                  | Optional one-dot clock used by address-line timing filters.                              |
| `observeCpuBusCycle(write)`  | Optional per-M2-cycle CPU R/W snoop (MMC1 serial filter, FME-7 IRQ counter).             |
| `powerOn()`                  | Restores the board's deterministic fresh-instance latch state.                           |
| `captureState()`             | Returns a typed `MapperState` discriminated-union snapshot.                              |
| `restoreState(state)`        | Validates and restores a snapshot, rejecting mismatched kinds and out-of-range fields.   |

PPU capabilities are structural: boards implement only the optional signal hooks they physically
consume. Address-line changes and completed reads are deliberately separate because MMC3 reacts to
A12 before data transfer, while MMC2/MMC4 change their CHR latch only after the triggering byte has
been read.

CPU reads keep value selection and electrical drive behavior separate. A board may return a neutral
byte from `read` while `cpuReadDriveMask` reports that a write-only register or disabled RAM window
drives no data lines; `CPUMemory` then combines the driven bits with the retained external bus.

IRQ-generating boards depend only on the narrow `MapperInterruptPort` (`setMapperIrq(asserted)`), not
on the full bus. The bus arbitrates the mapper's level-sensitive IRQ line alongside the APU frame IRQ,
so a board asserts and acknowledges independently.

`observeCpuBusCycle` is invoked once per CPU (M2) bus cycle — every CPU read, DMA read and CPU write
routes through it, including dummy and DMA-stall cycles — so a board that counts CPU cycles (FME-7)
sees an accurate total.

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
`requireChrRom`, `requireChrRam`, `requireDirectPrgRam`, `requireNoPrgRam`,
`resolveBusConflicts`, `requireBaseSubmapper`) keep the accept/reject policy in one place. Declared
capacity is accepted only when the selected board can address every byte.

## Save state

`MapperState` (in `mapper.ts`) is a discriminated union keyed by `MapperKind` (`mapper-kind.ts`). Each
board's `captureState`/`restoreState` refer to the same named kind. `restoreState` re-validates every
untrusted field (bank indexes against the live bank count, mirroring against `NametableMirroring`,
counters against their bit width and all booleans by runtime type) and throws
`RangeError`/`TypeError` rather than trust a snapshot. Common array/boolean guards live in
`state-validation.ts`; IRQ-capable boards re-assert their line from the restored state.

## Implemented boards

| #   | Family         | Kind               | Implementation               | Bus conflicts | IRQ  |
| --- | -------------- | ------------------ | ---------------------------- | ------------- | ---- |
| 0   | NROM           | `nrom`             | `nrom-mapper.ts`             | n/a           | no   |
| 1   | MMC1 / SxROM   | `mmc1`             | `mmc1-mapper.ts` + board     | no            | no   |
| 2   | UxROM          | `uxrom`            | `uxrom-mapper.ts`            | submapper     | no   |
| 3   | CNROM          | `cnrom`            | `cnrom-mapper.ts`            | default AND   | no   |
| 4   | MMC3           | `mmc3`             | `mmc3-mapper.ts`             | no            | A12  |
| 7   | AxROM          | `axrom`            | `axrom-mapper.ts`            | submapper     | no   |
| 9   | MMC2 / PxROM   | `mmc2`             | `mmc2-mapper.ts`             | no            | no   |
| 10  | MMC4 / FxROM   | `mmc4`             | `mmc4-mapper.ts`             | no            | no   |
| 11  | Color Dreams   | `color-dreams`     | `color-dreams-mapper.ts`     | AND           | no   |
| 13  | CPROM          | `cprom`            | `cprom-mapper.ts`            | AND           | no   |
| 33  | Taito TC0190   | `taito-tc0190`     | `taito-tc0190-mapper.ts`     | no            | no   |
| 34  | BNROM/NINA-001 | `bnrom`/`nina-001` | `bnrom-`/`nina001-mapper.ts` | BNROM AND     | no   |
| 66  | GxROM / MHROM  | `gxrom`            | `gxrom-mapper.ts`            | AND           | no   |
| 69  | Sunsoft FME-7  | `fme7`             | `fme7-mapper.ts`             | no            | cyc. |
| 70  | Bandai 74xx    | `bandai-74`        | `bandai74-mapper.ts`         | AND           | no   |
| 71  | Codemasters    | `codemasters`      | `codemasters-mapper.ts`      | no            | no   |
| 78  | Irem 74HC161   | `irem-78`          | `irem78-mapper.ts`           | AND           | no   |
| 87  | Jaleco CHR     | `jaleco-87`        | `jaleco-mapper.ts`           | no            | no   |
| 94  | UN1ROM         | `uxrom`            | `uxrom-mapper.ts`            | AND           | no   |
| 140 | Jaleco JF      | `jaleco-jf`        | `jaleco-jf-mapper.ts`        | no            | no   |
| 152 | Bandai 74xx    | `bandai-74`        | `bandai74-mapper.ts`         | AND           | no   |
| 180 | Inverted UxROM | `uxrom`            | `uxrom-mapper.ts`            | submapper     | no   |
| 184 | Sunsoft-1      | `sunsoft-1`        | `sunsoft1-mapper.ts`         | no            | no   |
| 206 | Namco 118      | `namco-118`        | `namco118-mapper.ts`         | no            | no   |

The shared CHR-latch banks used by MMC2 and MMC4 live in `chr-latch-banks.ts`; the MMC1 board wiring
lives in `mmc1-board.ts`; the mapper 34 board decision lives in `mapper34-board.ts`.

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
write-new cycle is invisible to the shift register while a D7 reset still applies. See the
[NESdev MMC1 page](https://www.nesdev.org/wiki/MMC1).

## UxROM (2)

16 KiB switchable PRG bank at `$8000-$BFFF`; `$C000-$FFFF` fixed to the last bank. The generic iNES
convention uses a full-byte no-conflict register; NES 2.0 submapper 2 selects UNROM/UOROM AND
conflicts.

## CNROM (3)

Fixed PRG; a `$8000-$FFFF` register selects an 8 KiB CHR bank. The legacy default applies original
CNROM AND bus conflicts; NES 2.0 submapper 1 disables them and submapper 2 makes them explicit. A
declared 2 KiB PRG RAM is mirrored through the 8 KiB `$6000-$7FFF` window.

## MMC3 (4)

`$8000` (even) selects one of eight bank registers and the PRG/CHR banking modes; `$8001` (odd) writes
it. CHR is two 2 KiB plus four 1 KiB banks; PRG is two switchable 8 KiB banks with two fixed banks,
swappable between `$8000` and `$C000` by the PRG mode. `$A000`/`$A001` set mirroring and PRG-RAM
enable/write-protect. The revision-B IRQ counter clocks on filtered PPU A12 rising edges (`tickPpu`
counts low dots; `observePpuAddress` clocks a rise after ≥10 low dots). See the
[NESdev MMC3 page](https://www.nesdev.org/wiki/MMC3).

## AxROM (7)

32 KiB switchable PRG bank over the whole `$8000-$FFFF` window with single-screen mirroring selected by
register bit 4; CHR is 8 KiB RAM. The legacy default is no bus conflicts (ANROM); NES 2.0 submapper 2
selects AMROM/AOROM AND conflicts. The 512 KiB bit-3 PRG extension is supported. PRG-RAM declarations
are rejected because AxROM has no PRG-RAM window.

## MMC2 / PxROM (9)

`$A000` selects the 8 KiB PRG bank at `$8000-$9FFF`; `$A000-$FFFF` is three fixed 8 KiB banks.
`$B000`/`$C000`/`$D000`/`$E000` set four 4 KiB CHR banks chosen by two PPU latches. The left latch
flips on the exact PPU fetches `$0FD8` (→ FD) and `$0FE8` (→ FE); the right latch flips across
`$1FD8-$1FDF` and `$1FE8-$1FEF`. Rendering fetches preserve the full sprite/background address and
call `observePpuRead` after returning the triggering byte, so a trigger changes only subsequent
fetches. `$F000` bit 0 selects vertical/horizontal mirroring. PxROM has no PRG-RAM window. See the
[NESdev MMC2 page](https://www.nesdev.org/wiki/MMC2). Representative title: Punch-Out!!.

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

## Taito TC0190 (33)

Two 8 KiB PRG registers at `$8000`/`$8001` map CPU `$8000-$BFFF`; the final two banks stay fixed at
`$C000-$FFFF`. `$8002`/`$8003` select two 2 KiB CHR windows in **2 KiB units** (the low bit is not
dropped as on MMC3), while `$A000-$A003` select four 1 KiB windows. Register decoding uses the
documented `$A003` mask across `$8000-$BFFF`; `$8000` bit 6 selects vertical/horizontal mirroring.
The first two CHR registers can address 512 KiB, while the 1 KiB registers address the lower
256 KiB. Mapper 33 intentionally has no IRQ; IRQ-capable/mislabeled mapper-48 images are not
approximated. See [NESdev mapper 33](https://www.nesdev.org/wiki/INES_Mapper_033).

## BNROM / NINA-001 (34)

`resolveMapper34Board` (`mapper34-board.ts`) chooses exactly one board and never combines their
register sets. BNROM switches a 32 KiB PRG bank with original-board AND conflicts. NINA-001 maps three
registers (`$7FFD` PRG, `$7FFE`/`$7FFF` two 4 KiB CHR banks) over an 8 KiB PRG-RAM window. Legacy CHR
ROM above 8 KiB selects NINA-001; CHR RAM or ≤8 KiB CHR ROM selects BNROM; NES 2.0 submapper 1/2 name
the board explicitly.

## GxROM / MHROM (66)

One `$8000-$FFFF` latch: bits 5-4 select a 32 KiB PRG bank, bits 1-0 an 8 KiB CHR bank, with AND-type
bus conflicts. MHROM images simply never use the high PRG bit.

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
field. Both are implemented by `Bandai74Mapper` with a `hasMirroringControl` flag.

## Codemasters / Camerica (71)

A UNROM-style register at `$C000-$FFFF` selects the 16 KiB `$8000-$BFFF` bank; `$C000-$FFFF` is fixed
to the last bank; no bus conflicts. The BF9097 variant (submapper 1, e.g. Fire Hawk) adds single-screen
mirroring from `$9000-$9FFF` bit 4; submapper 0 (BF9093) keeps the header's fixed mirroring.

## Irem 74HC161/32 (78)

One conflict-prone `$8000-$FFFF` latch combines a 16 KiB `$8000-$BFFF` PRG bank (last bank fixed at
`$C000-$FFFF`), an 8 KiB CHR bank and nametable control. Bits 2-0 select PRG, bit 3 controls
mirroring and bits 7-4 select CHR. The physical mirroring wire differs: Cosmo Carrier selects
one-screen lower/upper, while Holy Diver selects horizontal/vertical. NES 2.0 submapper 1 and 3 name
those boards; submapper 0 is rejected. For legacy iNES, the historical alternative-nametable flag
selects Holy Diver wiring and a clear flag selects Cosmo Carrier wiring. See
[NESdev mapper 78](https://www.nesdev.org/wiki/INES_Mapper_078).

## Jaleco CHR (87)

A latch at `$6000-$7FFF` selects the 8 KiB CHR bank with its two select lines reversed (value bit 1 →
CHR line 0, value bit 0 → CHR line 1). PRG ROM stays NROM-fixed; no bus conflicts because the latch
occupies the otherwise-unmapped `$6000-$7FFF` space.

## UxROM variants (94, 180)

Both variants reuse `UxromMapper` through immutable board wiring rather than duplicate bank logic.
UN1ROM (94) keeps the usual switchable `$8000-$BFFF`/fixed-last `$C000-$FFFF` layout but decodes the
bank from conflict-masked bits 4-2; it requires 128 KiB PRG and 8 KiB CHR RAM. Mapper 180 fixes PRG
bank 0 at `$8000-$BFFF` and switches `$C000-$FFFF` from bits 2-0. Its legacy default has AND
conflicts, while NES 2.0 submapper 1/2 selects no-conflict/conflict behavior explicitly. See
[NESdev mapper 94](https://www.nesdev.org/wiki/INES_Mapper_094) and
[NESdev mapper 180](https://www.nesdev.org/wiki/INES_Mapper_180).

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

## Namco 118 / DxROM (206)

The discrete predecessor to MMC3. `$8000` (even) selects one of eight bank registers and `$8001` (odd)
writes it: R0/R1 are 2 KiB CHR banks at PPU `$0000`/`$0800`, R2-R5 are 1 KiB CHR banks at
`$1000-$1FFF`, and R6/R7 are 8 KiB PRG banks at `$8000`/`$A000` with the final two banks fixed. There
is no IRQ, no PRG-RAM and no mirroring register, so mirroring stays hardwired from the header. Writes
to `$A000-$FFFF` are ignored.

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
