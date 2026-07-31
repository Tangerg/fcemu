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

| Member                       | Role                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `read(address)`              | Reads a CPU (`$6000-$FFFF`) or PPU (`$0000-$1FFF`) byte through the current bank layout. |
| `write(address, value)`      | Decodes a register write or routes a CHR/PRG-RAM write.                                  |
| `cpuReadDriveMask(address)`  | Optional CPU data-line mask; omitted means fully driven, `0` means open bus.             |
| `readCpuExpansion(address)`  | Optional value/drive mask for a cartridge device in CPU `$4018-$5FFF`.                   |
| `writeCpuExpansion(addr, v)` | Optional cartridge register write in CPU `$4018-$5FFF`.                                  |
| `readCpuRegisterOpenBus(a)`  | Optional cartridge drive on otherwise floating write-only 2A03 reads.                    |
| `ppuReadDriveMask(address)`  | Optional PPU pattern-data mask; omitted means fully driven, `0` means CHR is tri-stated. |
| `mapNametableAddress(addr)`  | Optional direct CIRAM/nametable-memory routing for cartridge-controlled wiring.          |
| `readNametable(address)`     | Optional cartridge-driven nametable byte, such as Sunsoft-4 CHR ROM.                     |
| `writeNametable(addr, v)`    | Optionally consumes a cartridge-owned nametable write.                                   |
| `observePpuAddress(address)` | Optional PPU address-line snoop for boards such as MMC3.                                 |
| `observePpuRead(address)`    | Optional completed-read event for read-triggered MMC2/MMC4 CHR latches.                  |
| `tickPpu()`                  | Optional one-dot clock used by address-line timing filters.                              |
| `observeCpuBusCycle(write)`  | Optional per-M2-cycle CPU R/W snoop (serial filters, IRQ counters/delays).               |
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
Pattern-table reads follow the same separation through `ppuReadDriveMask`; `PPUMemory` supplies the
current address low byte on undriven multiplexed PPU pins instead of asking a mapper to invent open
bus. `mapNametableAddress` similarly keeps per-access CIRAM wiring distinct from the cartridge's
fixed header mirroring. `readNametable`/`writeNametable` separately model memory that replaces CIRAM
entirely, so ROM ownership is not hidden in a magic address value. Expansion-range reads return their
value and drive mask together; an absent result remains normal CPU open bus.

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
| 32  | Irem G-101     | `irem-g101`        | `irem-g101-mapper.ts`        | no            | no   |
| 33  | Taito TC0190   | `taito-tc0190`     | `taito-tc0190-mapper.ts`     | no            | no   |
| 34  | BNROM/NINA-001 | `bnrom`/`nina-001` | `bnrom-`/`nina001-mapper.ts` | BNROM AND     | no   |
| 48  | Taito TC0690   | `taito-tc0690`     | `taito-tc0690-mapper.ts`     | no            | A12  |
| 65  | Irem H3001     | `irem-h3001`       | `irem-h3001-mapper.ts`       | no            | cyc. |
| 66  | GxROM / MHROM  | `gxrom`            | `gxrom-mapper.ts`            | AND           | no   |
| 68  | Sunsoft-4      | `sunsoft-4`        | `sunsoft4-mapper.ts`         | no            | no   |
| 69  | Sunsoft FME-7  | `fme7`             | `fme7-mapper.ts`             | no            | cyc. |
| 70  | Bandai 74xx    | `bandai-74`        | `bandai74-mapper.ts`         | AND           | no   |
| 71  | Codemasters    | `codemasters`      | `codemasters-mapper.ts`      | no            | no   |
| 75  | Konami VRC1    | `vrc1`             | `vrc1-mapper.ts`             | no            | no   |
| 76  | Namco 3446     | `namco-118`        | `namco118-mapper.ts`         | no            | no   |
| 78  | Irem 74HC161   | `irem-78`          | `irem78-mapper.ts`           | AND           | no   |
| 79  | NINA-03/06     | `nina-03-06`       | `nina0306-mapper.ts`         | no            | no   |
| 80  | Taito X1-005   | `taito-x1-005`     | `taito-x1-005-mapper.ts`     | no            | no   |
| 82  | Taito X1-017   | `taito-x1-017`     | `taito-x1-017-mapper.ts`     | no            | cyc. |
| 87  | Jaleco CHR     | `jaleco-87`        | `jaleco-mapper.ts`           | no            | no   |
| 88  | Namco 3433     | `namco-118`        | `namco118-mapper.ts`         | no            | no   |
| 89  | Sunsoft-2      | `sunsoft-2`        | `sunsoft2-mapper.ts`         | AND           | no   |
| 93  | Sunsoft-3R     | `sunsoft-3r`       | `sunsoft3r-mapper.ts`        | AND           | no   |
| 94  | UN1ROM         | `uxrom`            | `uxrom-mapper.ts`            | AND           | no   |
| 95  | Namco 3425     | `namco-118`        | `namco118-mapper.ts`         | no            | no   |
| 97  | Irem TAM-S1    | `irem-tam-s1`      | `irem-tam-s1-mapper.ts`      | no            | no   |
| 118 | TxSROM         | `mmc3`             | `mmc3-mapper.ts`             | no            | A12  |
| 119 | TQROM          | `mmc3`             | `mmc3-mapper.ts`             | no            | A12  |
| 140 | Jaleco JF      | `jaleco-jf`        | `jaleco-jf-mapper.ts`        | no            | no   |
| 152 | Bandai 74xx    | `bandai-74`        | `bandai74-mapper.ts`         | AND           | no   |
| 180 | Inverted UxROM | `uxrom`            | `uxrom-mapper.ts`            | submapper     | no   |
| 184 | Sunsoft-1      | `sunsoft-1`        | `sunsoft1-mapper.ts`         | no            | no   |
| 185 | CNROM protect  | `cnrom-protection` | `cnrom-protection-mapper.ts` | AND           | no   |
| 206 | Namco 118      | `namco-118`        | `namco118-mapper.ts`         | no            | no   |

The shared CHR-latch banks used by MMC2 and MMC4 live in `chr-latch-banks.ts`; the MMC1 board wiring
lives in `mmc1-board.ts`; the mapper 34 board decision lives in `mapper34-board.ts`. Namco
76/88/95/206 select immutable pin-wiring values around one register core, while MMC3/TxSROM/TQROM
select only the board behavior that differs around the shared MMC3 state machine.
Taito TC0190/TC0690 similarly share `TaitoTc0x90Banking`; their mirroring and IRQ pins remain in
their board-specific owners.
X1-005/X1-017 share only `TaitoX1Banking`, the three-PRG/eight-CHR data path actually common to both
ASICs. Register layout, internal RAM, pull-down and IRQ behavior stay separate.

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
256 KiB. Mapper 33 intentionally has no IRQ; IRQ-capable/mislabeled mapper-48 images are not
approximated. See [NESdev mapper 33](https://www.nesdev.org/wiki/INES_Mapper_033).

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
field. Both are implemented by `Bandai74Mapper` with a `hasMirroringControl` flag.

## Codemasters / Camerica (71)

A UNROM-style register at `$C000-$FFFF` selects the 16 KiB `$8000-$BFFF` bank; `$C000-$FFFF` is fixed
to the last bank; no bus conflicts. The BF9097 variant (submapper 1, e.g. Fire Hawk) adds single-screen
mirroring from `$9000-$9FFF` bit 4; submapper 0 (BF9093) keeps the header's fixed mirroring.

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

## Irem 74HC161/32 (78)

One conflict-prone `$8000-$FFFF` latch combines a 16 KiB `$8000-$BFFF` PRG bank (last bank fixed at
`$C000-$FFFF`), an 8 KiB CHR bank and nametable control. Bits 2-0 select PRG, bit 3 controls
mirroring and bits 7-4 select CHR. The physical mirroring wire differs: Cosmo Carrier selects
one-screen lower/upper, while Holy Diver selects horizontal/vertical. NES 2.0 submapper 1 and 3 name
those boards; submapper 0 is rejected. For legacy iNES, the historical alternative-nametable flag
selects Holy Diver wiring and a clear flag selects Cosmo Carrier wiring. See
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
mirroring. The board maps no PRG RAM. See
[NESdev mapper 89](https://www.nesdev.org/wiki/INES_Mapper_089) and the
[Sunsoft-2 pinout](https://www.nesdev.org/wiki/Sunsoft_2_pinout).

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

## Irem TAM-S1 (97)

The final 16 KiB PRG bank is fixed at `$8000-$BFFF`; D3-D0 select the 16 KiB bank at
`$C000-$FFFF`. D7-D6 select lower one-screen, horizontal, vertical or upper one-screen mirroring.
The known board carries 256 KiB PRG ROM and fixed 8 KiB CHR RAM, with no PRG RAM, IRQ or bus
conflict. See the
[TAM-S1 hardware analysis](https://forums.nesdev.org/viewtopic.php?t=19769).

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

## Namco 118 / DxROM (206)

The discrete predecessor to MMC3. `$8000` (even) selects one of eight bank registers and `$8001` (odd)
writes it: R0/R1 are 2 KiB CHR banks at PPU `$0000`/`$0800`, R2-R5 are 1 KiB CHR banks at
`$1000-$1FFF`, and R6/R7 are 8 KiB PRG banks at `$8000`/`$A000` with the final two banks fixed. There
is no IRQ, no PRG-RAM and no mirroring register, so mirroring stays hardwired from the header. Writes
to `$A000-$FFFF` are ignored. See
[NESdev mapper 206](https://www.nesdev.org/wiki/INES_Mapper_206).

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
