# PPU subsystem

`PPU` (`packages/fc-emu/src/domain/emulation/ppu.ts`) models the Ricoh RP2C02 (NTSC) / RP2C07 (PAL)
picture processing unit as dot-addressed hardware. It owns the CPU-facing `$2000-$2007` register
file, the `v`/`t`/`x`/`w` internal scroll state, the background and sprite fetch pipelines, the
double-buffered 256×240 output, and the cartridge address observations that clock mapper timing. All
region geometry (scanline count, vblank line, odd-frame skip) comes from the immutable
[`ConsoleTiming`](../../packages/fc-emu/src/domain/emulation/console-timing.ts) record, so the same
class emulates NTSC, PAL and Dendy. Sprite evaluation, the sprite pattern-address wiring and the
CPU-facing open-bus latch are extracted into `ppu/` subunits; VRAM, nametable mirroring and palette
decoding live in `PPUMemory` (`packages/fc-emu/src/domain/emulation/memory.ts`). This document
describes only behavior verified in those sources. See the NESdev
[PPU rendering](https://www.nesdev.org/wiki/PPU_rendering),
[PPU frame timing](https://www.nesdev.org/wiki/PPU_frame_timing),
[PPU registers](https://www.nesdev.org/wiki/PPU_registers) and
[PPU scrolling](https://www.nesdev.org/wiki/PPU_scrolling) pages for the underlying hardware.

## CPU-facing register file (`$2000-$2007`)

`CPUMemory` (`packages/fc-emu/src/domain/emulation/memory.ts`) decodes CPU addresses `$2000-$3FFF`
to `readRegister`/`writeRegister(0x2000 + (address % 8))`, so the eight registers mirror every eight
bytes across the 8 KiB window. `$4014` (OAM DMA) is routed to `writeRegister` as well.

| Addr    | Name      | Access | Behavior in `PPU`                                                             |
| ------- | --------- | ------ | ----------------------------------------------------------------------------- |
| `$2000` | PPUCTRL   | W      | `writeControl`: decodes flags, sets `nmiOutput`, writes nametable into `t`    |
| `$2001` | PPUMASK   | W      | `writeMask`: decodes flags, arms the two-dot render-enable pipeline           |
| `$2002` | PPUSTATUS | R      | `readStatus`: bits 5-7 driven, clears vblank + `w`, races vblank suppression  |
| `$2003` | OAMADDR   | W      | `writeOAMAddress`: `oamAddress = value`                                       |
| `$2004` | OAMDATA   | R/W    | `readOAMData` / `writeOAMData`: rendering-time bus vs. primary OAM            |
| `$2005` | PPUSCROLL | W×2    | `writeScroll`: latch-toggled fine/coarse scroll into `t`/`x`                  |
| `$2006` | PPUADDR   | W×2    | `writeAddress`: latch-toggled address into `t`, copied to `v` on second write |
| `$2007` | PPUDATA   | R/W    | `readData` / `writeData`: buffered VRAM port, post-access `v` increment       |
| `$4014` | OAMDMA    | W      | `writeDMA`: `bus.requestSpriteDma(value)`                                     |

`readRegister` handles `$2002`/`$2004`/`$2007` explicitly; every other read (the write-only
registers) returns `ioBus.sample()` — the decayed open-bus latch (see
[open bus behavior](https://www.nesdev.org/wiki/Open_bus_behavior)). `writeRegister` drives the
open-bus latch with the written value for all addresses except `$4014` before dispatching.

### PPUCTRL (`$2000`)

`writeControl` unpacks: `flagNameTable` (bits 0-1), `flagIncrement` (bit 2, +1 vs +32),
`flagSpriteTable` (bit 3), `flagBackgroundTable` (bit 4), `flagSpriteSize` (bit 5, 8×8 vs 8×16),
`flagMasterSlave` (bit 6), and `nmiOutput` (bit 7). It then calls `nmiChange()` and writes the
nametable select into `t` bits 10-11 (`t = (t & 0xF3FF) | ((value & 0x03) << 10)`).

### PPUMASK (`$2001`)

`writeMask` unpacks `flagGrayscale` (bit 0), `flagShowLeftBackground`/`flagShowLeftSprites` (bits
1-2), `flagShowBackground`/`flagShowSprites` (bits 3-4) and the three emphasis bits
`flagRedTint`/`flagGreenTint`/`flagBlueTint` (bits 5-7). The two rendering-enable bits (`value &
0x18`) do not take effect immediately: a change loads `pendingRenderingMask` and sets
`renderingMaskDelay = 2`, arming a two-dot pipeline (see [Render-enable pipeline](#render-enable-pipeline)).

### PPUSTATUS (`$2002`)

`readStatus` assembles bit 5 = `flagSpriteOverflow`, bit 6 = `spriteZeroHitLatched`, bit 7 =
`nmiOccurred`, then drives only bits 5-7 onto the open-bus latch (`ioBus.drive(status, 0xE0)`); bits
0-4 read back the decayed latch. It then applies the PPUSTATUS/vblank race: if the read lands on
`scanLine === vblankStartScanline && cycle === 0`, `suppressVblank` is set so the imminent vblank
edge never asserts. Finally it clears `nmiOccurred` (calling `nmiChange()`) and resets the write
latch `w = 0`.

### OAMADDR / OAMDATA (`$2003`/`$2004`)

`writeOAMAddress` stores `oamAddress` directly. `readOAMData` returns the rendering-time internal
OAM data bus when `isOamRenderingActive()` (via `spriteEvaluator.readDataBus(cycle)`); otherwise it
returns `oamData[oamAddress]`, masking attribute-byte reads (`oamAddress & 3 === 2`) with `0xE3`
because attribute bits 2-4 are unimplemented. `writeOAMData` is ignored entirely during active
rendering (the recommended stable behavior in place of hardware's address glitch); otherwise it
stores the byte (attribute bytes masked to `0xE3`) and post-increments `oamAddress` with 8-bit wrap.
`isOamRenderingActive()` is `renderingEnabled && (scanLine < 240 || scanLine === preRenderScanline)`.

### PPUSCROLL / PPUADDR and the `v`/`t`/`x`/`w` registers

The PPU holds the loopy scroll state: `v` (current VRAM address / scroll), `t` (temporary /
latched), `x` (3-bit fine X), `w` (write toggle) and `f` (frame parity). The 15-bit address is laid
out `yyy NN YYYYY XXXXX` (fine-Y, nametable select, coarse-Y, coarse-X). `$2005` and `$2006` share
the single `w` toggle:

| Register  | `w=0` (first write)                                | `w=1` (second write)                                          |
| --------- | -------------------------------------------------- | ------------------------------------------------------------- |
| PPUSCROLL | `t[4:0]=value>>3` (coarse X), `x=value&7` (fine X) | `t` fine-Y (`value&7`) and coarse-Y (`value&0xF8`)            |
| PPUADDR   | `t[13:8]=value&0x3F`, bit 14 cleared               | `t[7:0]=value`, then `v=t`, then `observeCartridgeAddress(v)` |

Both leave `w` toggled. The `$2006` second write copies `t` into `v` and immediately observes the
new address on the cartridge bus. `writeControl` also updates `t` (nametable bits) without touching
`w`.

### PPUDATA (`$2007`)

`readData` reads `address = v % 0x4000`. For `address < 0x3F00` it returns the previously buffered
byte and stores the new one (the one-read VRAM read delay); for palette addresses it returns the
palette value directly while refilling `bufferedData` from the nametable underneath (`read(v -
0x1000)`). The result is pushed through the open-bus latch with mask `0xFF` for VRAM and `0x3F` for
palette (palette drives only six data lines). Both `readData` and `writeData` then increment `v` by
1 or 32 per `flagIncrement` and call `observeCartridgeAddress(v)`. `PPU.read`/`PPU.write` delegate to
`PPUMemory`, whose default path also observes the mapper for the pre-increment access.

## Frame timing

`ConsoleTiming` supplies the geometry used throughout `update`:

| Region | `scanlinesPerFrame` | `preRenderScanline` | `vblankStartScanline` | `skipsOddFrameDot` |
| ------ | ------------------- | ------------------- | --------------------- | ------------------ |
| NTSC   | 262                 | 261                 | 241                   | `true`             |
| PAL    | 312                 | 311                 | 241                   | `false`            |
| Dendy  | 312                 | 311                 | 291                   | `false`            |

`cycle` (dot, 0-340), `scanLine` and `frame` advance in `tick()`, which also advances the open-bus
decay clock (`ioBus.advanceDots(1)`) and the render-enable pipeline. Dots wrap at 340→next scanline;
scanlines wrap at `scanlinesPerFrame`→next frame, toggling frame parity `f`.

**Odd-frame dot skip.** When rendering is enabled and `skipsOddFrameDot` holds, `f === 1`,
`scanLine === preRenderScanline` and `cycle === 339`, `tick()` jumps straight to `cycle = 0,
scanLine = 0`, incrementing `frame` and toggling `f` — dropping the idle dot 340 of the pre-render
line on odd frames.

`update()` performs one dot: it first promotes any pending sprite-zero hit to latched, calls
`tick()`, then flushes the delayed background mapper-observation queue. The rest is gated by
`renderingEnabled` and the current scanline/dot classes: `preLine` (`= preRenderScanline`),
`visibleLine` (`< 240`), `renderLine` (`preLine || visibleLine`), `visibleCycle` (1-256),
`preFetchCycle` (321-336) and `fetchCycle` (`preFetchCycle || visibleCycle`).

**Vblank and NMI.** `nmiOccurred` is the PPUSTATUS bit-7 flag; `nmiOutput` is PPUCTRL bit 7.
`nmiChange()` recomputes `asserted = nmiOutput && nmiOccurred` and drives the physical `/NMI` line
via `bus.setPpuNmiLine` only on change (see
[NMI](https://www.nesdev.org/wiki/NMI)). At `vblankStartScanline` dot 1, `setVerticalBlank()` swaps
the front/back frame buffers and — unless `suppressVblank` is set (then it clears the flag and
returns) — sets `nmiOccurred` and calls `nmiChange()`. At `preLine` dot 1, `clearVerticalBlank()`
clears `nmiOccurred`/`suppressVblank`, clears the sprite-zero hit and clears `flagSpriteOverflow`.

### Render-enable pipeline

`renderingEnabled` is `effectiveRenderingMask !== 0`, where `effectiveRenderingMask` holds PPUMASK
bits 3-4 delayed by two dots. `advanceRenderingMask()` (called each `tick()`) decrements
`renderingMaskDelay` and, on reaching zero, copies `pendingRenderingMask` into
`effectiveRenderingMask`. This single gate governs background/sprite fetching, sprite evaluation,
forced OAMADDR zeroing, the odd-frame skip and OAM rendering-time behavior. `backgroundPixel` and
`spritePixel` test `effectiveRenderingMask & 0x08` / `& 0x10` independently for the two show bits.

## Background fetch pipeline

On `renderLine && fetchCycle`, `update()` shifts the background register one pixel (four bits) and
runs the eight-dot fetch cycle:

| `cycle % 8` | Action                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1           | `fetchNameTableByte`: `address = 0x2000 \| (v & 0x0FFF)`                                                                 |
| 3           | `fetchAttributeTableByte`: `0x23C0 \| (v & 0x0C00) \| ((v>>4)&0x38) \| ((v>>2)&0x07)`, then `((byte >> shift) & 3) << 2` |
| 5           | `fetchLowTileByte`: `0x1000*flagBackgroundTable + tile*16 + fineY`                                                       |
| 7           | `fetchHighTileByte`: same address `+ 8`                                                                                  |
| 0           | `storeTileData`: pack eight 4-bit pixels into `tileDataLow`                                                              |

`fineY` is `(v >> 12) & 7` and `tile` is the fetched `nameTableByte`. The hardware's 64-bit shift
register is split into two 32-bit halves (`tileDataHigh` = tile being drawn, `tileDataLow` = next
tile) because JS bitwise operators are 32-bit; each drawn dot does
`tileDataHigh = (tileDataHigh << 4) | (top nibble of tileDataLow)` and `tileDataLow <<= 4`. Each
packed nibble is `attributeTableByte | p1 | p2`. `backgroundPixel` returns
`(tileDataHigh >> ((7 - x) * 4)) & 0x0F`, honoring fine-X.

Scroll bookkeeping on `renderLine`: `incrementX()` every eighth fetch dot (with coarse-X/nametable
wrap), `incrementY()` at dot 256 (fine-Y, coarse-Y, nametable toggle at row 29), `copyX()` at dot
257, and `copyY()` on `preLine` dots 280-304. Two extra garbage nametable fetches on `renderLine`
dots 337 and 339 observe address `$2000` on the cartridge bus.

## Sprite pipeline

### `SpriteEvaluator` — primary → secondary OAM (dots 65-256)

`SpriteEvaluator` (`packages/fc-emu/src/domain/emulation/ppu/sprite-evaluator.ts`) is a dot-clocked
copy engine for the upcoming scanline. `begin(targetScanline, spriteHeight)` (called at `visibleLine`
dot 1, height 8 or 16 from `flagSpriteSize`) resets its state and fills 32-byte secondary OAM and the
eight `selectedIndexes` with `0xFF`. `clock(dot, primaryOam)` runs only on dots 65-256, reading a
primary-OAM byte on odd dots into `readValue` and processing on even dots; it returns `true` on the
dot the overflow flag must assert (which sets `flagSpriteOverflow` in `update`).

`processSelection` writes the Y byte to the next secondary slot, range-tests it (`isInRange`: `0 <=
targetScanline - y < spriteHeight`), and on a hit records the primary index and copies bytes 1-3.
Each rejected sprite overwrites the same slot's Y, so once evaluation reaches primary index 63
(`advancePrimary` sets `done`), sprite 63's Y is left in the first empty fetch slot. When
`selectedCount` reaches 8, evaluation enters overflow search (`overflowSearch = true`,
`secondaryOamJustFilled = true` for that single dot).

`processOverflowSearch` reproduces the hardware overflow bug: while scanning for a ninth in-range
sprite it increments both the sprite counter (`primaryIndex`, `n`) and the byte counter
(`byteIndex`, `m`) but does **not** carry `m` into `n` — the well-known diagonal read of
tile/attribute/X bytes as if they were Y. An in-range value sets `overflowFound`, returns `true`, and
then consumes exactly three continuation bytes (`overflowBytesRemaining = 3`, realigning to the Y
lane) before setting `done`. Both transient counters are snapshot state, so a mid-evaluation restore
resumes the same byte and dot.

`readDataBus(dot)` projects the internal OAM data bus during rendering, matching the phase the CPU
would observe through a rendering-time `$2004` read:

| Dot range | Value returned                                                                        |
| --------- | ------------------------------------------------------------------------------------- |
| 1-64      | `0xFF` (secondary-OAM clear)                                                          |
| 65-256    | `readValue`; on even dots during overflow search (not the fill dot) `secondaryOam[0]` |
| 257-320   | `secondaryOam[slot*4 + byte]`, `slot = (dot-257)>>3`, `byte = phase<4 ? phase : 3`    |
| else      | `secondaryOam[0]`                                                                     |

`SpriteEvaluator.validateState` enforces the coupled invariants of the overflow state machine (no
overflow search before secondary OAM is full, no `overflowFound` without a search, valid continuation
byte count, `secondaryOamJustFilled` only on the fill dot).

### `resolveSpritePatternAddress` — pattern address wiring

`resolveSpritePatternAddress` (`packages/fc-emu/src/domain/emulation/ppu/sprite-pattern-address.ts`)
is a pure function mapping `{tileIndex, row, height, patternTable, verticallyFlipped}` to the low
bit-plane CHR address. It masks the scanline delta to the live size (`row & (height - 1)`) — only the
low three (8×8) or four (8×16) row bits are wired — then applies vertical flip (`height - 1 - row`).
For 8×8: `patternTable*0x1000 + tileIndex*16 + row`. For 8×16 the pattern table comes from
`tileIndex & 1`, the tile index is `(tileIndex & 0xFE) + (row >> 3)`, and the in-tile row is `row &
7`. Because the row input is a raw scanline delta rather than a pre-validated row, the evaluator and
the fetcher may legitimately observe different `flagSpriteSize` values when software changes PPUCTRL
during hblank — this is not treated as a domain error.

### Sprite fetch and pixel selection

At dot 257 the PPU forces `oamAddress = 0` (throughout dots 257-320), runs `prepareSpriteFetchSlots`
(pre-loading `spritePatternTables` with `flagSpriteTable` for 8×8, or table 1 for empty 8×16 slots),
and — on a rendering visible line — `loadEvaluatedSprites`. That reads each selected slot's Y / tile /
attribute / X from secondary OAM and calls `fetchSpritePattern(tile, attributes, scanLine - y)`, which
resolves the CHR address, reads both bit planes via `memory.read(addr, false)` (mapper observation
deferred to the dot-aligned path), applies horizontal flip (attribute bit 6), and packs eight 4-bit
pixels (palette `(attributes & 3) << 2`). Per slot it records `spritePositions` (X),
`spritePriorities` (attribute bit 5), `spriteIndexes` (`originalIndex`) and `spritePatternTables`
(`flagSpriteTable` for 8×8, else `tile & 1`). Off visible lines `spriteCount` is forced to 0.

`spritePixel` scans the loaded slots for one covering `cycle - 1`, returning the first non-transparent
4-bit color and its slot index. `renderPixel` applies left-column masking (`x < 8` with
`flagShowLeftBackground`/`flagShowLeftSprites`), then the background/sprite priority mux. Sprite-zero
hit: when slot index 0 is opaque over an opaque background at `x < 255`, `spriteZeroHitPending` is
set (unless already latched); `update` promotes pending→latched on the next dot. The chosen 6-bit
palette entry indexes `EMPHASIS_PALETTE[emphasisIndex()]` and is written to the back buffer.

## Palette, emphasis and output

`paletteData` is 32 bytes. `readPalette`/`writePalette` mirror `$10/$14/$18/$1C` down to
`$00/$04/$08/$0C` (`address >= 16 && address % 4 === 0 → address -= 16`); reads mask with `0x30` when
`flagGrayscale` is set (else `0x3F`), writes mask with `0x3F`. `emphasisIndex()` packs the three
PPUMASK emphasis bits, swapping the red and green lines on PAL (`region === "pal"`). `PPU` precomputes
eight emphasis-adjusted palettes: each active emphasis bit attenuates (`× 0.746`) the two channels it
does not select. Output goes to a `FrameBuffer`
(`packages/fc-emu/src/domain/model/frame-buffer.ts`), a packed `Uint32Array` of 256×240 RGBA pixels;
`front`/`back` are double-buffered and swapped at vblank. `FrameBuffer.toCanvasImageData` returns an
endianness-correct RGBA byte view for presentation.

## PPU address bus and `PPUMemory`

The PPU address bus is exactly 14 bits: every access masks `address &= 0x3FFF`. `PPUMemory.read`/
`write` (`packages/fc-emu/src/domain/emulation/memory.ts`) decode three regions:

| PPU address   | Region               | Backing                                                     |
| ------------- | -------------------- | ----------------------------------------------------------- |
| `$0000-$1FFF` | pattern tables (CHR) | `bus.Mapper.read`/`write`                                   |
| `$2000-$3EFF` | nametables (VRAM)    | `mirrorAddress(mode, address)` into `nameTableData` (4 KiB) |
| `$3F00-$3FFF` | palette RAM          | `readPalette`/`writePalette(address % 32)`                  |

`mirrorAddress` folds the address into `$0000-$0FFF`, splits it into a nametable index (0-3) and a
1 KiB offset, and remaps the index through `MIRROR_LOOKUP[mode]`
(see [Mirroring](https://www.nesdev.org/wiki/Mirroring)):

| Mode | Name                 | Table map      |
| ---- | -------------------- | -------------- |
| 0    | horizontal           | `[A, A, B, B]` |
| 1    | vertical             | `[A, B, A, B]` |
| 2    | single-screen (low)  | `[A, A, A, A]` |
| 3    | single-screen (high) | `[B, B, B, B]` |
| 4    | four-screen          | `[A, B, C, D]` |

The mode comes from `bus.Cartridge.mirroringMode`. `PPUMemory.read` takes an `observeMapper` flag;
PPU background and sprite fetches pass `false` and route mapper observation through the dot-aligned
paths described next, while CPU-driven `$2007` and writes observe immediately.

## Cartridge address observation (mapper A12 timing)

`observeCartridgeAddress(address)` calls `mapper.observePpuAddress(address & 0x3FFF)` when
`mapper.observesPpuAddress` — the hook that drives A12-edge mapper timing (e.g. MMC3's scanline IRQ;
see [MMC3](https://www.nesdev.org/wiki/MMC3)). Mapper timing is driven from these observations, not
from presentation frames or scanline callbacks.

- **Background fetches** enqueue observations through a dot-delay queue:
  `observeBackgroundAddress` pushes `{address, remainingDots: 4}`
  (`BACKGROUND_MAPPER_OBSERVATION_DELAY_DOTS`), and `clockBackgroundMapperObservations` (run each
  `update`) decrements and flushes them. This delay is what lets MMC3 accept A12 rises only after ten
  low dots and reject the cross-line nine-dot pulse.
- **Sprite fetches** are batch-evaluated but emit dot-aligned observations via
  `observeSpriteFetchAddress` (dots 257-320): at dot 265 (`SPRITE_A12_START_DOT`) it observes slot 1's
  pattern-table A12; phases 0/2 observe `$2000` (garbage nametable fetches); phases 4/6 from dot 267
  (`LATER_SPRITE_FETCH_DOT`) observe `spritePatternTableForSlot(slot) << 12` where
  `slot = floor((cycle - 257) / 8)`.
- `$2006`/`$2007` and the post-increment `v` also observe the cartridge address directly.

## Open-bus latch (`PpuIoBusLatch`)

`PpuIoBusLatch` (`packages/fc-emu/src/domain/emulation/ppu/ppu-io-bus-latch.ts`) models the
CPU-facing eight-bit dynamic latch with independent per-bit decay. It is constructed with a decay
interval of `ceil(ppuFrequencyHz * 0.6)` dots (~0.6 s). `advanceDots` (one per `tick()`) advances
`elapsedDots`; each set bit carries its own `decayDeadlines[bit]`.

- `drive(value, mask = 0xFF)` overwrites only the masked lines, refreshes their decay deadlines
  (a driven-high bit gets `elapsedDots + decayAfterDots`; a driven-low bit's deadline is 0), and
  returns the full latch value including retained undriven bits.
- `sample()` (used for reads of write-only registers) applies decay and returns the latch **without**
  refreshing any bit — a passive open-bus read does not sustain the charge.
- `applyDecay()` clears any high bit whose deadline has elapsed.

Partial reads follow the physical driven lines: PPUSTATUS drives mask `0xE0` (bits 5-7 real, 0-4
decayed), and palette reads through PPUDATA drive mask `0x3F` (bits 0-5 real, 6-7 decayed). The
registers that share this one latch are PPUSTATUS, OAMDATA and PPUDATA (each via `ioBus.drive`), OAM
DMA (`writeOamDma`), and every register write except `$4014` (which drives the latch before
dispatch). `validateState` checks the value/clock and enforces that low bits carry deadline 0 and
high bits carry a future deadline.

## Lifecycle: power-on and reset

`powerOn()` applies the deterministic cold-start policy: it zeroes `paletteData`, `nameTableData`,
`oamData` and both frame buffers, clears `v`/`oamAddress`/`nmiOccurred`, resets the open-bus latch and
sprite-zero/overflow flags, then calls `reset()`. `reset()` is the front-loader reset line that
retains VRAM, palette and OAM: it sets `cycle = 340`, `scanLine = 240`, `frame = 0`, writes PPUCTRL
and PPUMASK to 0, clears the render-enable pipeline, `t`/`x`/`w`/`f`, `bufferedData`, the fetch
latches, sprite slot arrays, the sprite evaluator (`powerOn`) and the background observation queue,
and deasserts `/NMI`.

## Save-state snapshot

`captureState()` returns a `PpuSnapshot` (a typed value object) and `restoreState()` reinstalls it
after `validateSnapshot()`. The snapshot captures the full pipeline: timing (`cycle`, `scanLine`,
`frame`, `f`), scroll registers (`v`, `t`, `x`, `w`), memory (`paletteData`, `nameTableData`,
`oamData`, `front`, `back`), NMI/vblank state (`nmiOccurred`, `nmiOutput`, `nmiLineAsserted`,
`suppressVblank`), the background fetch latches and shift halves, the eight sprite slot arrays, the
nested `SpriteEvaluationState`, the nested `PpuIoBusState`, all PPUCTRL/PPUMASK flags, the
`effectiveRenderingMask`/`pendingRenderingMask`/`renderingMaskDelay` pipeline, the sprite-zero
`{pending, latched}` pair, `oamAddress`, `bufferedData`, and the pending background mapper-address
queue. `validateSnapshot` raises `RangeError` on any out-of-range dot (0-340), scanline, render-mask
pipeline (`0x18`-masked, delay 0-2), frame, typed-array shape, non-6-bit palette byte, invalid
sprite-evaluation counters, an impossible pending-and-latched sprite-zero pair, or an out-of-range
mapper observation (address 0-`0x3FFF`, `remainingDots` 0-4).

PPU-relevant public save-state envelope versions (from `docs/architecture.md`): introducing
`PpuIoBusLatch` advanced it to **v2**; the evaluator's byte-counted overflow continuation to **v3**;
the render-enable pipeline (with DMA cadence, the physical NMI line and the DMC timer) to **v7**. The
current envelope is **v13**; older in-memory snapshots are rejected rather than restored with
ambiguous state.

## Source files

- `packages/fc-emu/src/domain/emulation/ppu.ts` — the RP2C02 core: registers, timing, fetch and pixel pipelines, NMI, cartridge observation.
- `packages/fc-emu/src/domain/emulation/ppu/sprite-evaluator.ts` — dot-clocked primary→secondary OAM evaluator, overflow bug and rendering-time OAM bus.
- `packages/fc-emu/src/domain/emulation/ppu/sprite-pattern-address.ts` — pure 8×8/8×16 sprite pattern-address wiring.
- `packages/fc-emu/src/domain/emulation/ppu/ppu-io-bus-latch.ts` — CPU-facing eight-bit open-bus latch with per-bit decay.
- `packages/fc-emu/src/domain/emulation/memory.ts` — `PPUMemory`: 14-bit bus decode, nametable mirroring, palette mirrors.
- `packages/fc-emu/src/domain/model/frame-buffer.ts` — packed RGBA 256×240 output buffer.
- `packages/fc-emu/src/domain/emulation/console-timing.ts` — immutable NTSC/PAL/Dendy scanline and vblank geometry.
