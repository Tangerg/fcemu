import { describe, expect, it } from "vitest";
import { EmulationSession } from "./emulation-session.js";

describe("EmulationSession", () => {
  it("models the loading, running and paused lifecycle", () => {
    const loading = EmulationSession.idle().beginLoading("mario.nes");
    expect(loading.snapshot.regionPreference).toBe("auto");
    const running = loading
      .romLoaded({
        name: "mario.nes",
        format: "nes2",
        mapperNumber: 4,
        submapperNumber: 1,
        consoleRegion: "pal",
      })
      .play()
      .frameCompleted(29_780);
    expect(running.snapshot).toMatchObject({ status: "running", frameCount: 1, cpuCycles: 29_780 });
    expect(running.restarted().snapshot).toMatchObject({
      status: "ready",
      audioStatus: "inactive",
      frameCount: 0,
      cpuCycles: 0,
    });
    expect(running.audioChanged("blocked").snapshot.audioStatus).toBe("blocked");
    expect(running.pause().restarted().snapshot).toMatchObject({
      status: "paused",
      audioStatus: "inactive",
      frameCount: 0,
      cpuCycles: 0,
    });
  });

  it("rejects invalid transitions", () => {
    expect(() => EmulationSession.idle().play()).toThrow(/Cannot start/);
    expect(() =>
      EmulationSession.idle().romReconfigured({
        name: "mario.nes",
        format: "ines",
        mapperNumber: 0,
        submapperNumber: 0,
        consoleRegion: "ntsc",
      }),
    ).toThrow(/Cannot reconfigure/);
  });

  it("preserves an explicit region preference across reconfiguration and stop", () => {
    const paused = EmulationSession.idle()
      .regionPreferenceChanged("pal")
      .beginLoading("mario.nes")
      .romLoaded({
        name: "mario.nes",
        format: "ines",
        mapperNumber: 0,
        submapperNumber: 0,
        consoleRegion: "pal",
      })
      .play()
      .frameCompleted(33_247)
      .pause()
      .romReconfigured({
        name: "mario.nes",
        format: "ines",
        mapperNumber: 0,
        submapperNumber: 0,
        consoleRegion: "pal",
      });

    expect(paused.snapshot).toMatchObject({
      status: "paused",
      audioStatus: "inactive",
      regionPreference: "pal",
      frameCount: 0,
      cpuCycles: 0,
      rom: { consoleRegion: "pal" },
    });
    expect(paused.stop().snapshot).toMatchObject({ status: "idle", regionPreference: "pal" });
  });

  it("protects snapshots and rejects invalid cycle projections", () => {
    const running = EmulationSession.idle()
      .beginLoading("mario.nes")
      .romLoaded({
        name: "mario.nes",
        format: "ines",
        mapperNumber: 0,
        submapperNumber: 0,
        consoleRegion: "ntsc",
      })
      .play();
    expect(Object.isFrozen(running.snapshot)).toBe(true);
    expect(Object.isFrozen(running.snapshot.rom)).toBe(true);
    expect(() => running.frameCompleted(-1)).toThrow(/non-negative/);
  });

  it("tracks quick-save availability and restores its timeline", () => {
    const running = EmulationSession.idle()
      .beginLoading("mario.nes")
      .romLoaded({
        name: "mario.nes",
        format: "ines",
        mapperNumber: 0,
        submapperNumber: 0,
        consoleRegion: "ntsc",
      })
      .play()
      .frameCompleted(100)
      .quickSaveCreated()
      .frameCompleted(200)
      .quickSaveRestored(1, 100);

    expect(running.snapshot).toMatchObject({
      status: "ready",
      audioStatus: "inactive",
      selectedQuickSaveSlot: 1,
      quickSaveSlots: [1],
      frameCount: 1,
      cpuCycles: 100,
    });
    expect(running.quickSaveSlotSelected(2).snapshot).toMatchObject({
      selectedQuickSaveSlot: 2,
      quickSaveSlots: [1],
    });
    expect(() => EmulationSession.idle().quickSaveCreated()).toThrow(/Cannot create/);
  });
});
