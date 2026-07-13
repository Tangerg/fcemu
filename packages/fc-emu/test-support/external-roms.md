# External conformance ROMs

Commercial ROMs never belong in this repository. External mapper conformance uses redistributable
upstream fixtures kept outside the worktree.

## AccuracyCoin CPU data buses

- Upstream: <https://github.com/100thCoin/AccuracyCoin>
- Source revision inspected: `71f57fbca86f0801ad89681247bc2ff327671e89`
- ROM SHA-256: `898aedd850fb220cb5a915322b3077e260bd7819a87cef84d149df171329b5c1`
- Target hardware: NTSC RP2A03G CPU/APU and RP2C02G PPU

Keep the upstream ROM outside the repository and run:

```bash
yarn conformance:accuracy-coin -- /path/to/AccuracyCoin.nes
```

The pinned runner navigates the ROM's own menu and reads its published result bytes. Current evidence
is Open Bus 9/9, Internal Data Bus 3/3, Suddenly Resize Sprite 5/5, Controller Strobing 4/4,
`INC $4014` 3/3, `DMA + $2002 Read` result 5, `DMC DMA Bus Conflicts` result `$E1`, Interrupt Flag
Latency 14/14 and all six SH*/LAE unofficial-opcode cases.
Together they cover unmapped and write-only reads, absolute/indexed/dummy bus values, writes,
controller partial drives and PUT-latched output, `$4015`, DMC DMA isolation between the RP2A03
internal bus and external pins, OAM halt rejection on CPU writes, and live 8×8/8×16 PPUCTRL wiring
between sprite evaluation and fetch. The interrupt test additionally verifies CLI/SEI/PLP/RTI
latency, both branch polling points and preservation of an IRQ recognized by the first poll when the
line is cleared before a page-crossing branch's second poll. The SH* matrix verifies both stable and
page-crossing address corruption plus the RDY exception where a DMC DMA stretching the indexed dummy
read removes the `(ABH+1)` mask from the value written by SHA, SHS, SHX and SHY.
The `$2002` case verifies both the delayed internal frame-IRQ flag clear used to align GET/PUT and
the repeated PPUSTATUS side effects on DMC halt/dummy cycles.
The SHA is rejected if the upstream menu or result layout changes, preventing a different ROM
revision from silently using stale automation.

## Holy Mapperel 0.02

- Upstream: <https://github.com/pinobatch/holy-mapperel/releases/tag/v0.02>
- Archive: `holy-mapperel-bin-0.02.7z`
- SHA-256: `70f85671e21f293599baebb662faeb06a4c04e9c9ceb283d96d4197f09e4ce7a`
- License: zlib, copyright 2017 Damian Yerrick
- Upstream source revision inspected: `4e48b59432b5f1d3c011ac830e40ddf7ed5bbc61`

Extract the archive outside the repository, build the core, and run:

```bash
yarn conformance:mmc1 -- /path/to/holy-mapperel-bin-0.02
yarn conformance:mapper34 -- /path/to/holy-mapperel-bin-0.02
```

The suite covers SKROM, SGROM, SNROM, SUROM and SXROM. Holy Mapperel 0.02 does not distribute the
SNROM `W8K` header combination, so the runner plainly marks its in-memory derivative by changing
only the NES 2.0 volatile PRG-RAM size byte before execution. No modified binary is written.

The Mapper 34 runner uses the unmodified `M34_P128K_CR8K_H.nes` BNROM fixture (SHA-256
`cb00e7b0092000b272f1c5bc341038da45031d44993d1a1abde864b5eafb1d85`). Its detailed result is
`0000`; the runner pins the visually verified final-frame hash so a non-halting but incorrect screen
cannot pass silently. The upstream archive does not include the separate NES 2.0 submapper 1/2
fixtures linked from the NESdev forum, so those identities remain covered by focused synthetic ROMs.

## Blargg PPU open bus

- Archive: <https://github.com/christopherpow/nes-test-roms/tree/master/ppu_open_bus>
- Upstream revision inspected: `95d8f621ae55cee0d09b91519a8989ae0e64753b`
- ROM SHA-256: `d4208a3ff6340532dd0fced7f9d408d5b6585853a0ddc9c1f64ee1722ef08e67`
- Author: Shay Green (blargg)

Keep the ROM outside the repository and run:

```bash
yarn conformance:rom -- /path/to/ppu_open_bus.nes 3600 ntsc blargg
```

The fixture completes in 250 frames and reports `Passed`. It covers full and partial PPU I/O-bus
drives, non-refreshing open-bus reads, palette high bits, OAM attribute masking and decay after one
second of emulated time.

## Blargg sprite and OAM suites

The same `nes-test-roms` revision provides `oam_read`, `sprite_hit_tests_2005.10.05` and
`sprite_overflow_tests`. The sprite suites report their final result in zero-page byte `$F8`: `1`
means passed, while larger values are the failure code documented by each suite.

```bash
yarn conformance:rom -- /path/to/oam_read.nes 3600 ntsc blargg
yarn conformance:rom -- /path/to/sprite-test.nes 600 ntsc zero-page
```

Current evidence is `oam_read` Passed, sprite hit 11/11 and sprite overflow 5/5. The suites cover
8×16 pattern selection, clipping and edge rules, one-dot sprite-zero status timing, secondary OAM
selection, overflow timing and the hardware diagonal-index bug.

Additional read/write evidence uses `oam_stress`, `cpu_dummy_writes_oam` and Quietust's
`other/read2004.nes`. The first two report Passed. `read2004.nes` has no machine-readable status; its
[published RP2C02G reference](https://forums.nesdev.org/viewtopic.php?p=18703) is a 256-byte screen
capture. The supported fixture SHA-256 is
`91eb7535c03f112170653d62e43338c5eec92e0485557729ef69ef3522ee6def`. Run its exact comparator with:

```bash
yarn conformance:oam-bus -- /path/to/read2004.nes 300
```

The command exits non-zero if any byte differs. The current implementation matches all 252 compared
bytes at zero PPU-dot shift and also matches the stack bytes. This verifies the shared DMA cadence,
CPU read sample and rendering-time `$2004` bus selection together rather than accepting a
phase-shifted screen.

## Blargg Sprite/DMC DMA collisions

- Upstream source: <https://github.com/koute/pinky/tree/master/nes-testsuite/roms/sprdma_and_dmc_dma>
- Hardware timing reference: <https://www.nesdev.org/wiki/DMA>
- Author: Shay Green (blargg)

Run both NTSC fixtures outside the repository:

```bash
yarn conformance:rom -- /path/to/sprdma_and_dmc_dma.nes 1800 ntsc blargg
yarn conformance:rom -- /path/to/sprdma_and_dmc_dma_512.nes 1800 ntsc blargg
```

Both fixtures currently report `Passed`. Together they exercise all sixteen relative DMC/OAM
collision positions, including OAM realignment and the special end-of-transfer cases. Their DMC
timer synchronization also proves that load requests halt on GET, reload requests schedule on PUT,
and the output unit runs at the full 54-cycle NTSC maximum-rate period.

## Blargg PAL APU visual matrix

- Upstream: <https://github.com/christopherpow/nes-test-roms/tree/master/pal_apu_tests>
- Upstream revision inspected: `95d8f621ae55cee0d09b91519a8989ae0e64753b`
- Protocol: 60 PAL frames followed by SHA-1 of the 256×240 RGBA frame

These ten older fixtures do not publish a Blargg `$6000` status block. Their authoritative
`test_roms.xml` instead stores a `tvsha1` for the final frame. Run the exact visual comparator with:

```bash
yarn conformance:pal-apu -- /path/to/pal_apu_tests
```

The runner fixes the PAL region, frame count, fixture names and all ten expected hashes. It exits
non-zero on a missing ROM or any pixel mismatch; the current implementation matches 10/10.
