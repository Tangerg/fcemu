import { describe, expect, it, vi } from "vitest";
import { MachineClock } from "./machine-clock.js";

const NTSC = {
  cpuMasterClockDivider: 12,
  ppuMasterClockDivider: 4,
  readSampleMasterClock: 5,
  writeSampleMasterClock: 7,
  interruptSampleMasterClock: 8,
} as const;

describe("MachineClock", () => {
  it("projects CPU progress without committing it early", () => {
    const clock = new MachineClock(NTSC);
    clock.beginCpuUpdate(100);

    expect(clock.currentCpuBusCycle(104)).toBe(4);
    expect(clock.captureState().committedCpuCycle).toBe(0);

    clock.commitCpuCycles(4);
    expect(clock.captureState().committedCpuCycle).toBe(4);
  });

  it("projects the in-progress bus cycle before a stepped CPU increments its counter", () => {
    const clock = new MachineClock(NTSC);
    clock.beginCpuUpdate(100);

    expect(clock.currentCpuBusCycle(100)).toBe(1);
    expect(clock.completedCpuCycles(100)).toBe(0);
  });

  it("catches the APU up exactly once per missing CPU cycle", () => {
    const clock = new MachineClock(NTSC);
    const tick = vi.fn<() => void>();
    clock.commitCpuCycles(5);

    clock.synchronizeApuCommitted(tick);
    clock.synchronizeApuCommitted(tick);

    expect(tick).toHaveBeenCalledTimes(5);
    expect(clock.synchronizedApuCpuCycle).toBe(5);
    expect(clock.remainingCommittedApuCycles).toBe(0);
  });

  it("tracks a partially synchronized APU window", () => {
    const clock = new MachineClock(NTSC);
    clock.commitCpuCycles(7);
    clock.synchronizeApuTo(4, () => {});

    expect(clock.remainingCommittedApuCycles).toBe(3);
  });

  it("samples an NTSC CPU read after the first PPU dot in its bus cycle", () => {
    const clock = new MachineClock(NTSC);
    const tick = vi.fn<(masterClock: number) => void>();
    clock.beginCpuUpdate(0);

    expect(clock.readSampleRequiresPpuSynchronization).toBe(true);
    clock.synchronizePpuCurrentRead(0, tick);
    expect(tick.mock.calls.flat()).toEqual([4]);

    clock.commitCpuCycles(1);
    clock.synchronizePpuCommitted(tick);
    expect(tick.mock.calls.flat()).toEqual([4, 8, 12]);
  });

  it("projects an in-progress DMA window onto the current bus cycle", () => {
    const clock = new MachineClock(NTSC);
    const tick = vi.fn<(masterClock: number) => void>();
    clock.beginCpuUpdate(100);

    clock.synchronizePpuCompletedCpuCycles(104, tick);
    expect(tick).toHaveBeenCalledTimes(12);
    clock.synchronizePpuCurrentRead(104, tick);
    expect(tick).toHaveBeenCalledTimes(13);
  });

  it("samples a DMA bus cycle whose CPU counter was already advanced", () => {
    const clock = new MachineClock(NTSC);
    const tick = vi.fn<(masterClock: number) => void>();
    clock.beginCpuUpdate(100);

    clock.synchronizePpuAdvancedRead(101, tick);
    expect(tick.mock.calls.flat()).toEqual([4]);
    clock.synchronizePpuCompletedCpuCycles(101, tick);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("preserves PAL's sixteen PPU dots across five CPU cycles", () => {
    const clock = new MachineClock({
      cpuMasterClockDivider: 16,
      ppuMasterClockDivider: 5,
      readSampleMasterClock: 7,
      writeSampleMasterClock: 9,
      interruptSampleMasterClock: 9,
    });
    const tick = vi.fn<(masterClock: number) => void>();

    expect(clock.readSampleRequiresPpuSynchronization).toBe(true);
    for (let cpuCycle = 0; cpuCycle < 5; cpuCycle++) {
      clock.beginCpuUpdate(cpuCycle);
      clock.synchronizePpuCurrentWrite(cpuCycle, tick);
      clock.commitCpuCycles(1);
      clock.synchronizePpuCommitted(tick);
    }

    expect(tick).toHaveBeenCalledTimes(16);
  });

  it("resets every clock-domain watermark", () => {
    const clock = new MachineClock(NTSC);
    clock.beginCpuUpdate(10);
    clock.commitCpuCycles(3);
    clock.synchronizeApuCommitted(() => {});
    clock.synchronizePpuCommitted(() => {});

    clock.reset();

    expect(clock.currentCpuBusCycle(0)).toBe(1);
    expect(clock.captureState()).toEqual({
      committedCpuCycle: 0,
      synchronizedApuCycle: 0,
      synchronizedPpuMasterClock: 0,
      ppuClockRemainder: 0,
      cpuCycleAtUpdateStart: 0,
    });
  });

  it("round-trips stable watermarks and rejects an in-flight future state", () => {
    const source = new MachineClock(NTSC);
    source.beginCpuUpdate(0);
    source.commitCpuCycles(2);
    source.synchronizeApuCommitted(() => {});
    source.synchronizePpuCommitted(() => {});
    const state = source.captureState();
    const restored = new MachineClock(NTSC);

    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);
    expect(() => restored.restoreState({ ...state, synchronizedPpuMasterClock: 25 })).toThrow(
      RangeError,
    );
  });

  it("rejects invalid committed cycle counts", () => {
    const clock = new MachineClock(NTSC);
    expect(() => clock.commitCpuCycles(-1)).toThrow(RangeError);
    expect(() => clock.commitCpuCycles(0.5)).toThrow(RangeError);
  });
});
