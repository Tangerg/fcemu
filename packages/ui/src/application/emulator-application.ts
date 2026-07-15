import { EmulationSession } from "../domain/emulation-session.js";
import type { RomDetails, SessionSnapshot } from "../domain/emulation-session.js";
import type { RegionPreference } from "../domain/execution-region.js";
import type {
  AudioLifecyclePort,
  BinaryFile,
  ControllerInputPort,
  EmulatorFactoryPort,
  EmulatorRuntimePort,
  EmulatorRuntimeState,
  FrameSchedulerPort,
  GameButton,
  RomImage,
  RomReaderPort,
  SaveRamStoragePort,
  ScheduledFrame,
} from "./ports.js";

export interface EmulatorApplicationDependencies {
  readonly romReader: RomReaderPort;
  readonly emulatorFactory: EmulatorFactoryPort;
  readonly scheduler: FrameSchedulerPort;
  readonly audio: AudioLifecyclePort;
  readonly controllerInput: ControllerInputPort;
  readonly saveRamStorage: SaveRamStoragePort;
}

const SAVE_CHECKPOINT_FRAMES = 300;
const MAX_FRAMES_PER_CALLBACK = 3;
const MAX_BACKLOG_INTERVALS = 4;
const GAME_BUTTONS: readonly GameButton[] = [
  "a",
  "b",
  "select",
  "start",
  "up",
  "down",
  "left",
  "right",
];

interface QuickSave {
  readonly romId: string;
  readonly regionPreference: RegionPreference;
  readonly frameCount: number;
  readonly cpuCycles: number;
  readonly runtimeState: EmulatorRuntimeState;
}

export class EmulatorApplication {
  private session = EmulationSession.idle();
  private runtime: EmulatorRuntimePort | undefined;
  private scheduledFrame: ScheduledFrame | undefined;
  private lastFrameTime: number | undefined;
  private frameTimeDebtMs = 0;
  private readonly listeners = new Set<() => void>();
  private operationSequence = 0;
  private disposed = false;
  private readonly unsubscribeControllerInput: () => void;
  private currentRomId: string | undefined;
  private currentRom: RomImage | undefined;
  private quickSave: QuickSave | undefined;
  private readonly pressedButtons = {
    1: new Set<GameButton>(),
    2: new Set<GameButton>(),
  };
  private readonly persistedRevisions = new WeakMap<EmulatorRuntimePort, number>();

  constructor(private readonly dependencies: EmulatorApplicationDependencies) {
    this.unsubscribeControllerInput = dependencies.controllerInput.subscribe((event) => {
      const buttons = this.pressedButtons[event.player];
      if (event.pressed) buttons.add(event.button);
      else buttons.delete(event.button);
      this.runtime?.setControllerButton(event.player, event.button, event.pressed);
    });
  }

  getSnapshot = (): SessionSnapshot => this.session.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async loadRom(file: BinaryFile): Promise<void> {
    if (this.disposed) return;
    const operation = ++this.operationSequence;
    const shouldSuspendAudio =
      this.session.snapshot.status === "running" || this.session.snapshot.status === "paused";
    if (this.runtime && this.currentRomId) {
      void this.persistRuntime(this.runtime, this.currentRomId);
    }
    this.cancelScheduledFrame();
    this.runtime = undefined;
    this.currentRomId = undefined;
    this.currentRom = undefined;
    this.quickSave = undefined;
    this.session = this.session.beginLoading(file.name);
    this.emit();

    try {
      this.dependencies.audio.activate();
      if (shouldSuspendAudio) {
        void this.dependencies.audio.suspend().catch(() => undefined);
      }
      const rom = await this.dependencies.romReader.read(file);
      if (!this.isCurrent(operation)) return;
      const runtime = this.dependencies.emulatorFactory.create(
        rom,
        this.session.snapshot.regionPreference,
      );
      if (!this.isCurrent(operation)) return;
      if (runtime.cartridge.hasBatteryBackup) {
        const save = await this.dependencies.saveRamStorage.load(rom.id).catch(() => undefined);
        if (!this.isCurrent(operation)) return;
        if (save) {
          try {
            runtime.restoreBatterySave(save);
          } catch {
            // A corrupt or obsolete save must not prevent the cartridge from booting.
          }
        }
      }
      this.restoreControllerState(runtime);
      this.runtime = runtime;
      this.currentRomId = rom.id;
      this.currentRom = rom;
      this.persistedRevisions.set(runtime, runtime.captureBatterySave()?.revision ?? 0);
      this.session = this.session.romLoaded(toRomDetails(rom, runtime));
      await this.play();
    } catch (error) {
      this.failIfCurrent(operation, error);
    }
  }

  async play(): Promise<void> {
    const operation = this.operationSequence;
    const runtime = this.runtime;
    const status = this.session.snapshot.status;
    if (
      !this.isCurrent(operation) ||
      !runtime ||
      status === "running" ||
      (status !== "ready" && status !== "paused")
    ) {
      return;
    }

    try {
      this.session = this.session.play();
      this.emit();
      this.lastFrameTime = undefined;
      this.frameTimeDebtMs = 0;
      this.scheduleNextFrame();
      const audioResult = await this.dependencies.audio.resume();
      if (
        !this.isCurrent(operation) ||
        this.runtime !== runtime ||
        this.session.snapshot.status !== "running"
      ) {
        return;
      }
      this.session = this.session.audioChanged(audioResult);
      this.emit();
    } catch (error) {
      if (this.isCurrent(operation) && this.session.snapshot.status === "running") {
        this.session = this.session.audioChanged("blocked");
        this.emit();
      } else {
        this.failIfCurrent(operation, error);
      }
    }
  }

  async pause(): Promise<void> {
    if (this.session.snapshot.status !== "running") return;
    this.cancelScheduledFrame();
    this.session = this.session.pause();
    this.emit();
    if (this.runtime && this.currentRomId) {
      await this.persistRuntime(this.runtime, this.currentRomId);
    }
    void this.dependencies.audio.suspend().catch(() => undefined);
  }

  reset(): void {
    if (!this.runtime) return;
    this.runtime.reset();
    this.session = this.session.restarted();
    this.emit();
  }

  powerCycle(): void {
    if (!this.runtime) return;
    this.runtime.powerCycle();
    this.session = this.session.restarted();
    this.emit();
  }

  quickSaveCurrentState(): void {
    const runtime = this.runtime;
    const romId = this.currentRomId;
    const snapshot = this.session.snapshot;
    if (!runtime || !romId || !["ready", "running", "paused"].includes(snapshot.status)) return;
    this.quickSave = {
      romId,
      regionPreference: snapshot.regionPreference,
      frameCount: snapshot.frameCount,
      cpuCycles: snapshot.cpuCycles,
      runtimeState: runtime.captureSaveState(),
    };
    this.session = this.session.quickSaveCreated();
    this.emit();
  }

  async quickLoadCurrentState(): Promise<void> {
    const runtime = this.runtime;
    const quickSave = this.quickSave;
    const snapshot = this.session.snapshot;
    if (
      !runtime ||
      !quickSave ||
      quickSave.romId !== this.currentRomId ||
      quickSave.regionPreference !== snapshot.regionPreference ||
      !["ready", "running", "paused"].includes(snapshot.status)
    )
      return;

    const operation = this.operationSequence;
    const wasRunning = snapshot.status === "running";
    if (wasRunning) {
      this.cancelScheduledFrame();
      await this.dependencies.audio.suspend().catch(() => undefined);
      if (!this.isCurrent(operation) || this.runtime !== runtime) return;
    }

    try {
      runtime.restoreSaveState(quickSave.runtimeState);
      this.restoreControllerState(runtime);
      this.session = this.session.quickSaveRestored(quickSave.frameCount, quickSave.cpuCycles);
      this.emit();
      if (wasRunning) await this.play();
    } catch {
      if (wasRunning && this.isCurrent(operation) && this.runtime === runtime) {
        this.scheduleNextFrame();
        void this.dependencies.audio.resume().catch(() => undefined);
      }
    }
  }

  async setRegionPreference(regionPreference: RegionPreference): Promise<void> {
    if (this.disposed || this.session.snapshot.regionPreference === regionPreference) return;
    const previousPreference = this.session.snapshot.regionPreference;
    this.session = this.session.regionPreferenceChanged(regionPreference);
    this.emit();

    const previousRuntime = this.runtime;
    const rom = this.currentRom;
    if (!previousRuntime || !rom) return;

    const previousStatus = this.session.snapshot.status;
    let runtime: EmulatorRuntimePort;
    try {
      const batterySave = previousRuntime.captureBatterySave();
      runtime = this.dependencies.emulatorFactory.create(rom, regionPreference);
      if (batterySave && runtime.cartridge.hasBatteryBackup) {
        runtime.restoreBatterySave(batterySave.data);
      }
      this.restoreControllerState(runtime);
    } catch {
      this.session = this.session.regionPreferenceChanged(previousPreference);
      this.emit();
      return;
    }

    this.operationSequence += 1;
    this.cancelScheduledFrame();
    if (this.currentRomId) void this.persistRuntime(previousRuntime, this.currentRomId);
    if (previousStatus === "running") {
      void this.dependencies.audio.suspend().catch(() => undefined);
    }

    this.runtime = runtime;
    this.quickSave = undefined;
    this.persistedRevisions.set(runtime, runtime.captureBatterySave()?.revision ?? 0);
    this.session = this.session.romReconfigured(toRomDetails(rom, runtime));
    this.emit();
    if (previousStatus === "running") await this.play();
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.operationSequence += 1;
    this.cancelScheduledFrame();
    if (this.runtime && this.currentRomId) {
      await this.persistRuntime(this.runtime, this.currentRomId);
    }
    this.runtime = undefined;
    this.currentRomId = undefined;
    this.currentRom = undefined;
    this.quickSave = undefined;
    this.session = this.session.stop();
    this.emit();
    void this.dependencies.audio.suspend().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.operationSequence += 1;
    this.cancelScheduledFrame();
    if (this.runtime && this.currentRomId) {
      await this.persistRuntime(this.runtime, this.currentRomId);
    }
    this.runtime = undefined;
    this.currentRomId = undefined;
    this.currentRom = undefined;
    this.quickSave = undefined;
    this.session = this.session.stop();
    this.unsubscribeControllerInput();
    this.listeners.clear();
    await this.dependencies.audio.dispose();
  }

  private scheduleNextFrame(): void {
    if (this.session.snapshot.status !== "running") return;
    this.scheduledFrame = this.dependencies.scheduler.schedule((timestamp) => {
      const runtime = this.runtime;
      if (!runtime || this.session.snapshot.status !== "running") return;
      try {
        const framesDue = this.framesDue(timestamp);
        for (let frame = 0; frame < framesDue; frame++) {
          if (this.runtime !== runtime || this.session.snapshot.status !== "running") break;
          const result = runtime.runFrame();
          this.session = this.session.frameCompleted(result.cpuCycles);
          this.emit();
          if (
            this.currentRomId &&
            this.session.snapshot.frameCount % SAVE_CHECKPOINT_FRAMES === 0
          ) {
            void this.persistRuntime(runtime, this.currentRomId);
          }
        }
        this.scheduleNextFrame();
      } catch (error) {
        this.session = this.session.fail(toErrorMessage(error));
        this.emit();
      }
    });
  }

  /** Returns a bounded number of emulated frames due at this display timestamp. */
  private framesDue(timestamp: number): number {
    const runtime = this.runtime;
    if (!runtime || !Number.isFinite(runtime.frameRateHz) || runtime.frameRateHz <= 0) {
      throw new RangeError("Emulator frame rate must be a positive finite number");
    }
    const interval = 1000 / runtime.frameRateHz;
    if (this.lastFrameTime === undefined) {
      this.lastFrameTime = timestamp;
      this.frameTimeDebtMs = 0;
      return 1;
    }
    const elapsed = Math.max(0, timestamp - this.lastFrameTime);
    this.lastFrameTime = timestamp;
    if (elapsed > interval * MAX_BACKLOG_INTERVALS) {
      this.frameTimeDebtMs = 0;
      return 1;
    }
    this.frameTimeDebtMs += elapsed;
    const due = Math.min(Math.floor(this.frameTimeDebtMs / interval), MAX_FRAMES_PER_CALLBACK);
    this.frameTimeDebtMs -= due * interval;
    return due;
  }

  private cancelScheduledFrame(): void {
    this.scheduledFrame?.cancel();
    this.scheduledFrame = undefined;
  }

  private emit(): void {
    if (this.disposed) return;
    this.listeners.forEach((listener) => listener());
  }

  private isCurrent(operation: number): boolean {
    return !this.disposed && operation === this.operationSequence;
  }

  private failIfCurrent(operation: number, error: unknown): void {
    if (!this.isCurrent(operation)) return;
    this.cancelScheduledFrame();
    this.runtime = undefined;
    this.currentRom = undefined;
    this.currentRomId = undefined;
    this.quickSave = undefined;
    this.session = this.session.fail(toErrorMessage(error));
    this.emit();
  }

  private async persistRuntime(runtime: EmulatorRuntimePort, cartridgeId: string): Promise<void> {
    try {
      const save = runtime.captureBatterySave();
      if (!save || this.persistedRevisions.get(runtime) === save.revision) return;
      await this.dependencies.saveRamStorage.save(cartridgeId, save.data);
      this.persistedRevisions.set(runtime, save.revision);
    } catch {
      // Persistence is best-effort; emulation must remain available if storage is denied.
    }
  }

  private restoreControllerState(runtime: EmulatorRuntimePort): void {
    for (const player of [1, 2] as const) {
      for (const button of GAME_BUTTONS) {
        runtime.setControllerButton(player, button, this.pressedButtons[player].has(button));
      }
    }
  }
}

function toRomDetails(rom: RomImage, runtime: EmulatorRuntimePort): RomDetails {
  return {
    name: rom.name,
    format: runtime.cartridge.format,
    mapperNumber: runtime.cartridge.mapperNumber,
    submapperNumber: runtime.cartridge.submapperNumber,
    consoleRegion: runtime.cartridge.consoleRegion,
    prgRomBytes: runtime.cartridge.prgRomBytes,
    chrRomBytes: runtime.cartridge.chrRomBytes,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected emulator error";
}
