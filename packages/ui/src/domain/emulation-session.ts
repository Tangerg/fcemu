import type { ExecutionRegion, RegionPreference } from "./execution-region.js";

export type SessionStatus = "idle" | "loading" | "ready" | "running" | "paused" | "error";
export type AudioStatus = "inactive" | "starting" | "running" | "blocked";
export type QuickSaveSlot = 1 | 2 | 3;

export const QUICK_SAVE_SLOTS: readonly QuickSaveSlot[] = Object.freeze([1, 2, 3]);

export interface RomDetails {
  readonly name: string;
  readonly format: "ines" | "nes2";
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly consoleRegion: ExecutionRegion;
}

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly audioStatus: AudioStatus;
  readonly regionPreference: RegionPreference;
  readonly rom?: RomDetails;
  readonly pendingRomName?: string;
  readonly frameCount: number;
  readonly cpuCycles: number;
  readonly selectedQuickSaveSlot: QuickSaveSlot;
  readonly quickSaveSlots: readonly QuickSaveSlot[];
  readonly error?: string;
}

export class EmulationSession {
  private readonly state: SessionSnapshot;

  private constructor(state: SessionSnapshot) {
    const quickSaveSlots = Object.freeze([...state.quickSaveSlots]);
    const snapshot = {
      ...state,
      quickSaveSlots,
    };
    this.state = snapshot.rom
      ? Object.freeze({ ...snapshot, rom: Object.freeze({ ...snapshot.rom }) })
      : Object.freeze(snapshot);
  }

  static idle(
    regionPreference: RegionPreference = "auto",
    selectedQuickSaveSlot: QuickSaveSlot = 1,
  ): EmulationSession {
    return new EmulationSession({
      status: "idle",
      audioStatus: "inactive",
      regionPreference,
      frameCount: 0,
      cpuCycles: 0,
      selectedQuickSaveSlot,
      quickSaveSlots: [],
    });
  }

  get snapshot(): SessionSnapshot {
    return this.state;
  }

  beginLoading(name: string): EmulationSession {
    return new EmulationSession({
      status: "loading",
      audioStatus: "inactive",
      regionPreference: this.state.regionPreference,
      pendingRomName: name,
      frameCount: 0,
      cpuCycles: 0,
      selectedQuickSaveSlot: this.state.selectedQuickSaveSlot,
      quickSaveSlots: [],
    });
  }

  romLoaded(rom: RomDetails): EmulationSession {
    this.assertStatus("loading");
    return new EmulationSession({
      status: "ready",
      audioStatus: "inactive",
      regionPreference: this.state.regionPreference,
      rom,
      frameCount: 0,
      cpuCycles: 0,
      selectedQuickSaveSlot: this.state.selectedQuickSaveSlot,
      quickSaveSlots: [],
    });
  }

  play(): EmulationSession {
    if (this.state.status !== "ready" && this.state.status !== "paused") {
      throw new Error(`Cannot start a session while it is ${this.state.status}`);
    }
    return new EmulationSession({ ...this.state, status: "running", audioStatus: "starting" });
  }

  pause(): EmulationSession {
    this.assertStatus("running");
    return new EmulationSession({ ...this.state, status: "paused", audioStatus: "inactive" });
  }

  frameCompleted(cpuCycles: number): EmulationSession {
    this.assertStatus("running");
    if (!Number.isSafeInteger(cpuCycles) || cpuCycles < 0) {
      throw new Error("CPU cycles must be a non-negative safe integer");
    }
    return new EmulationSession({
      ...this.state,
      frameCount: this.state.frameCount + 1,
      cpuCycles: this.state.cpuCycles + cpuCycles,
    });
  }

  restarted(): EmulationSession {
    if (
      this.state.status !== "ready" &&
      this.state.status !== "running" &&
      this.state.status !== "paused"
    ) {
      throw new Error(`Cannot restart a session while it is ${this.state.status}`);
    }
    return new EmulationSession({
      ...this.state,
      status: this.state.status === "paused" ? "paused" : "ready",
      audioStatus: "inactive",
      frameCount: 0,
      cpuCycles: 0,
    });
  }

  quickSaveCreated(): EmulationSession {
    if (
      this.state.status !== "ready" &&
      this.state.status !== "running" &&
      this.state.status !== "paused"
    ) {
      throw new Error(`Cannot create a quick save while session is ${this.state.status}`);
    }
    return new EmulationSession({
      ...this.state,
      quickSaveSlots: uniqueSlots([...this.state.quickSaveSlots, this.state.selectedQuickSaveSlot]),
    });
  }

  quickSaveRemoved(slot: QuickSaveSlot): EmulationSession {
    return new EmulationSession({
      ...this.state,
      quickSaveSlots: this.state.quickSaveSlots.filter((candidate) => candidate !== slot),
    });
  }

  quickSaveSlotSelected(slot: QuickSaveSlot): EmulationSession {
    return new EmulationSession({ ...this.state, selectedQuickSaveSlot: slot });
  }

  quickSaveAvailabilityChanged(slots: readonly QuickSaveSlot[]): EmulationSession {
    return new EmulationSession({ ...this.state, quickSaveSlots: uniqueSlots(slots) });
  }

  quickSaveRestored(frameCount: number, cpuCycles: number): EmulationSession {
    if (
      this.state.status !== "ready" &&
      this.state.status !== "running" &&
      this.state.status !== "paused"
    ) {
      throw new Error(`Cannot restore a quick save while session is ${this.state.status}`);
    }
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount < 0 ||
      !Number.isSafeInteger(cpuCycles) ||
      cpuCycles < 0
    ) {
      throw new RangeError("Quick-save timeline values must be non-negative safe integers");
    }
    return new EmulationSession({
      ...this.state,
      status: this.state.status === "paused" ? "paused" : "ready",
      audioStatus: "inactive",
      frameCount,
      cpuCycles,
    });
  }

  regionPreferenceChanged(regionPreference: RegionPreference): EmulationSession {
    return new EmulationSession({ ...this.state, regionPreference });
  }

  romReconfigured(rom: RomDetails): EmulationSession {
    if (
      this.state.status !== "ready" &&
      this.state.status !== "running" &&
      this.state.status !== "paused"
    ) {
      throw new Error(`Cannot reconfigure a session while it is ${this.state.status}`);
    }
    return new EmulationSession({
      ...this.state,
      status: this.state.status === "paused" ? "paused" : "ready",
      audioStatus: "inactive",
      rom,
      frameCount: 0,
      cpuCycles: 0,
      quickSaveSlots: [],
    });
  }

  audioChanged(status: Exclude<AudioStatus, "inactive" | "starting">): EmulationSession {
    this.assertStatus("running");
    return new EmulationSession({ ...this.state, audioStatus: status });
  }

  fail(reason: string): EmulationSession {
    return new EmulationSession({
      ...this.state,
      status: "error",
      audioStatus: "inactive",
      error: reason,
    });
  }

  stop(): EmulationSession {
    return EmulationSession.idle(this.state.regionPreference, this.state.selectedQuickSaveSlot);
  }

  private assertStatus(expected: SessionStatus): void {
    if (this.state.status !== expected) {
      throw new Error(`Expected session to be ${expected}, received ${this.state.status}`);
    }
  }
}

function uniqueSlots(slots: readonly QuickSaveSlot[]): readonly QuickSaveSlot[] {
  return [...new Set(slots)].sort((left, right) => left - right);
}
