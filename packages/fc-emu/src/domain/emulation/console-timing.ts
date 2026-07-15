import { CartridgeTimingMode } from "../model/cartridge.js";

export type ConsoleRegion = "ntsc" | "pal" | "dendy";

export interface CpuPpuTiming {
  readonly cpuMasterClockDivider: number;
  readonly ppuMasterClockDivider: number;
  readonly readSampleMasterClock: number;
  readonly writeSampleMasterClock: number;
  readonly interruptSampleMasterClock: number;
}

/** CPU-cycle positions and timer reload values owned by one APU silicon family. */
export interface ApuTiming {
  readonly firstQuarterCycle: number;
  readonly firstHalfCycle: number;
  readonly secondQuarterCycle: number;
  readonly secondHalfCycle: number;
  readonly fiveStepFinalHalfCycle: number;
  readonly fourStepEndCycle: number;
  readonly fiveStepEndCycle: number;
  readonly noiseTimerPeriods: readonly number[];
  readonly dmcTimerPeriods: readonly number[];
  readonly channelRegisterWriteDelayCycles: number;
}

/** Immutable clock-domain configuration shared by CPU, PPU and APU. */
export interface ConsoleTiming {
  readonly region: ConsoleRegion;
  readonly cpuFrequencyHz: number;
  readonly scanlinesPerFrame: number;
  readonly preRenderScanline: number;
  readonly vblankStartScanline: number;
  readonly ppuFrequencyHz: number;
  readonly frameRateHz: number;
  readonly skipsOddFrameDot: boolean;
  readonly dmcDmaControllerReadGlitch: boolean;
  readonly cpuPpu: CpuPpuTiming;
  readonly apu: ApuTiming;
}

export const NTSC_APU_TIMING = defineApuTiming({
  firstQuarterCycle: 7457,
  firstHalfCycle: 14_913,
  secondQuarterCycle: 22_371,
  secondHalfCycle: 29_829,
  fiveStepFinalHalfCycle: 37_281,
  noiseTimerPeriods: Object.freeze([
    1, 3, 7, 15, 31, 47, 63, 79, 100, 126, 189, 253, 380, 507, 1016, 2033,
  ]),
  dmcTimerPeriods: Object.freeze([
    428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54,
  ]),
  channelRegisterWriteDelayCycles: 0,
});

export const PAL_APU_TIMING = defineApuTiming({
  firstQuarterCycle: 8313,
  firstHalfCycle: 16_627,
  secondQuarterCycle: 24_939,
  secondHalfCycle: 33_253,
  fiveStepFinalHalfCycle: 41_565,
  noiseTimerPeriods: Object.freeze([
    1, 3, 6, 14, 29, 43, 58, 73, 93, 117, 176, 235, 353, 471, 944, 1888,
  ]),
  dmcTimerPeriods: Object.freeze([
    398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50,
  ]),
  channelRegisterWriteDelayCycles: 1,
});

const CPU_PPU_TIMINGS = Object.freeze({
  ntsc: defineCpuPpuTiming(12, 4, 5, 7, 8),
  pal: defineCpuPpuTiming(16, 5, 7, 9, 9),
  dendy: defineCpuPpuTiming(15, 5, 6, 8, 8),
});

const CONSOLE_TIMINGS: Readonly<Record<ConsoleRegion, ConsoleTiming>> = Object.freeze({
  ntsc: defineConsoleTiming({
    region: "ntsc",
    cpuFrequencyHz: 1_789_773,
    scanlinesPerFrame: 262,
    vblankStartScanline: 241,
    skipsOddFrameDot: true,
    dmcDmaControllerReadGlitch: true,
    cpuPpu: CPU_PPU_TIMINGS.ntsc,
    apu: NTSC_APU_TIMING,
  }),
  pal: defineConsoleTiming({
    region: "pal",
    cpuFrequencyHz: 1_662_607,
    scanlinesPerFrame: 312,
    vblankStartScanline: 241,
    skipsOddFrameDot: false,
    dmcDmaControllerReadGlitch: false,
    cpuPpu: CPU_PPU_TIMINGS.pal,
    apu: PAL_APU_TIMING,
  }),
  dendy: defineConsoleTiming({
    region: "dendy",
    cpuFrequencyHz: 1_773_448,
    scanlinesPerFrame: 312,
    vblankStartScanline: 291,
    skipsOddFrameDot: false,
    dmcDmaControllerReadGlitch: false,
    cpuPpu: CPU_PPU_TIMINGS.dendy,
    apu: NTSC_APU_TIMING,
  }),
});

export function resolveConsoleTiming(
  mode: CartridgeTimingMode,
  regionOverride?: ConsoleRegion,
): ConsoleTiming {
  if (regionOverride) return CONSOLE_TIMINGS[regionOverride];
  switch (mode) {
    case CartridgeTimingMode.Pal:
      return CONSOLE_TIMINGS.pal;
    case CartridgeTimingMode.Dendy:
      return CONSOLE_TIMINGS.dendy;
    case CartridgeTimingMode.Ntsc:
    case CartridgeTimingMode.MultiRegion:
      return CONSOLE_TIMINGS.ntsc;
  }
}

function defineCpuPpuTiming(
  cpuMasterClockDivider: number,
  ppuMasterClockDivider: number,
  readSampleMasterClock: number,
  writeSampleMasterClock: number,
  interruptSampleMasterClock: number,
): CpuPpuTiming {
  return Object.freeze({
    cpuMasterClockDivider,
    ppuMasterClockDivider,
    readSampleMasterClock,
    writeSampleMasterClock,
    interruptSampleMasterClock,
  });
}

function defineApuTiming(
  input: Omit<ApuTiming, "fourStepEndCycle" | "fiveStepEndCycle">,
): ApuTiming {
  return Object.freeze({
    ...input,
    fourStepEndCycle: input.secondHalfCycle + 1,
    fiveStepEndCycle: input.fiveStepFinalHalfCycle + 1,
  });
}

function defineConsoleTiming(
  input: Omit<ConsoleTiming, "preRenderScanline" | "ppuFrequencyHz" | "frameRateHz">,
): ConsoleTiming {
  const ppuFrequencyHz =
    (input.cpuFrequencyHz * input.cpuPpu.cpuMasterClockDivider) /
    input.cpuPpu.ppuMasterClockDivider;
  const averageDotsPerFrame = input.scanlinesPerFrame * 341 - (input.skipsOddFrameDot ? 0.5 : 0);
  return Object.freeze({
    ...input,
    preRenderScanline: input.scanlinesPerFrame - 1,
    ppuFrequencyHz,
    frameRateHz: ppuFrequencyHz / averageDotsPerFrame,
  });
}
