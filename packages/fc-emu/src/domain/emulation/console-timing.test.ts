import { describe, expect, it } from "vitest";
import { CartridgeTimingMode } from "../model/cartridge.js";
import {
  NTSC_APU_TIMING,
  PAL_APU_TIMING,
  resolveConsoleTiming,
  type CpuPpuTiming,
} from "./console-timing.js";

function cpuPpuTiming(
  cpuMasterClockDivider: number,
  ppuMasterClockDivider: number,
  readSampleMasterClock: number,
  writeSampleMasterClock: number,
  interruptSampleMasterClock: number,
): CpuPpuTiming {
  return {
    cpuMasterClockDivider,
    ppuMasterClockDivider,
    readSampleMasterClock,
    writeSampleMasterClock,
    interruptSampleMasterClock,
  };
}

describe("ConsoleTiming", () => {
  it.each([
    [
      CartridgeTimingMode.Ntsc,
      "ntsc",
      1_789_773,
      262,
      241,
      true,
      true,
      cpuPpuTiming(12, 4, 5, 7, 8),
      NTSC_APU_TIMING,
    ],
    [
      CartridgeTimingMode.Pal,
      "pal",
      1_662_607,
      312,
      241,
      false,
      false,
      cpuPpuTiming(16, 5, 7, 9, 9),
      PAL_APU_TIMING,
    ],
    [
      CartridgeTimingMode.Dendy,
      "dendy",
      1_773_448,
      312,
      291,
      false,
      false,
      cpuPpuTiming(15, 5, 6, 8, 8),
      NTSC_APU_TIMING,
    ],
  ] as const)(
    "resolves timing mode %i to one coherent clock domain",
    (mode, region, frequency, scanlines, vblank, skipsDot, controllerGlitch, cpuPpu, apu) => {
      expect(resolveConsoleTiming(mode)).toMatchObject({
        region,
        cpuFrequencyHz: frequency,
        scanlinesPerFrame: scanlines,
        preRenderScanline: scanlines - 1,
        vblankStartScanline: vblank,
        ppuFrequencyHz: (frequency * cpuPpu.cpuMasterClockDivider) / cpuPpu.ppuMasterClockDivider,
        skipsOddFrameDot: skipsDot,
        dmcDmaControllerReadGlitch: controllerGlitch,
        cpuPpu,
        apu,
      });
      expect(resolveConsoleTiming(mode).frameRateHz).toBeCloseTo(
        region === "ntsc" ? 60.0988 : 50.007,
        3,
      );
    },
  );

  it("uses NTSC as the deterministic execution region for a multi-region image", () => {
    expect(resolveConsoleTiming(CartridgeTimingMode.MultiRegion).region).toBe("ntsc");
    expect(resolveConsoleTiming(CartridgeTimingMode.MultiRegion, "pal").region).toBe("pal");
  });

  it("owns the APU channel PUT delay for each silicon family", () => {
    expect(NTSC_APU_TIMING.channelRegisterWriteDelayCycles).toBe(0);
    expect(PAL_APU_TIMING.channelRegisterWriteDelayCycles).toBe(1);
  });

  it("allows an explicit execution-region override for legacy test and homebrew images", () => {
    expect(resolveConsoleTiming(CartridgeTimingMode.Ntsc, "pal").region).toBe("pal");
  });

  it("owns the PAL-specific frame, noise and DMC periods", () => {
    expect(PAL_APU_TIMING).toMatchObject({
      firstQuarterCycle: 8313,
      secondHalfCycle: 33_253,
      fiveStepFinalHalfCycle: 41_565,
    });
    expect(PAL_APU_TIMING.noiseTimerPeriods).toEqual([
      1, 3, 6, 14, 29, 43, 58, 73, 93, 117, 176, 235, 353, 471, 944, 1888,
    ]);
    expect(PAL_APU_TIMING.dmcTimerPeriods).toEqual([
      398, 354, 316, 298, 276, 236, 210, 198, 176, 148, 132, 118, 98, 78, 66, 50,
    ]);
  });
});
