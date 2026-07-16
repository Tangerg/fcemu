import { EmulationSession } from "../domain/emulation-session.js";
import { QUICK_SAVE_SLOTS } from "../domain/emulation-session.js";
import type { QuickSaveSlot, RomDetails, SessionSnapshot } from "../domain/emulation-session.js";
import type { RegionPreference } from "../domain/execution-region.js";
import type {
  AudioDiagnostics,
  AudioLifecyclePort,
  BinaryFile,
  ControllerInputPort,
  EmulatorFactoryPort,
  EmulatorRuntimePort,
  FrameSchedulerPort,
  GameButton,
  PersistedQuickSave,
  QuickSaveStoragePort,
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
  readonly quickSaveStorage: QuickSaveStoragePort;
}

export interface EmulatorApplicationDiagnostics {
  readonly actualFrameRateHz: number;
  readonly targetFrameRateHz: number;
  readonly audio: AudioDiagnostics;
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

export class EmulatorApplication {
  private session = EmulationSession.idle();
  private runtime: EmulatorRuntimePort | undefined;
  private scheduledFrame: ScheduledFrame | undefined;
  private lastFrameTime: number | undefined;
  private frameTimeDebtMs = 0;
  private frameRateWindowStartedAt: number | undefined;
  private framesInRateWindow = 0;
  private actualFrameRateHz = 0;
  private readonly listeners = new Set<() => void>();
  private operationSequence = 0;
  private disposed = false;
  private readonly unsubscribeControllerInput: () => void;
  private currentRomId: string | undefined;
  private currentRom: RomImage | undefined;
  private readonly quickSaves = new Map<QuickSaveSlot, PersistedQuickSave>();
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

  getDiagnostics = (): EmulatorApplicationDiagnostics =>
    Object.freeze({
      actualFrameRateHz: this.actualFrameRateHz,
      targetFrameRateHz: this.runtime?.frameRateHz ?? 0,
      audio: Object.freeze({ ...this.dependencies.audio.diagnostics }),
    });

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
    this.quickSaves.clear();
    this.resetFrameRateDiagnostics();
    this.session = this.session.beginLoading(file.name);
    this.emit();

    try {
      this.dependencies.audio.activate();
      const audioSuspension = shouldSuspendAudio
        ? this.dependencies.audio.suspend().catch(() => undefined)
        : Promise.resolve();
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
      await this.hydrateQuickSaves(operation, rom.id, runtime);
      if (!this.isCurrent(operation) || this.runtime !== runtime) return;
      await audioSuspension;
      if (!this.isCurrent(operation) || this.runtime !== runtime) return;
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
      this.resetFrameRateDiagnostics();
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
    const audioSuspension = this.dependencies.audio.suspend().catch(() => undefined);
    this.session = this.session.pause();
    this.emit();
    const persistence =
      this.runtime && this.currentRomId
        ? this.persistRuntime(this.runtime, this.currentRomId)
        : Promise.resolve();
    await Promise.all([audioSuspension, persistence]);
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
    const quickSave: PersistedQuickSave = {
      format: "fcemu-quick-save",
      version: 1,
      cartridgeId: romId,
      executionRegion: runtime.cartridge.consoleRegion,
      slot: snapshot.selectedQuickSaveSlot,
      frameCount: snapshot.frameCount,
      cpuCycles: snapshot.cpuCycles,
      runtimeState: runtime.captureSaveState(),
    };
    this.quickSaves.set(quickSave.slot, quickSave);
    this.session = this.session.quickSaveCreated();
    this.emit();
    void this.dependencies.quickSaveStorage.saveQuickSave(quickSave).catch(() => undefined);
  }

  selectQuickSaveSlot(slot: QuickSaveSlot): void {
    this.session = this.session.quickSaveSlotSelected(slot);
    this.emit();
  }

  async quickLoadCurrentState(): Promise<void> {
    const runtime = this.runtime;
    const snapshot = this.session.snapshot;
    const quickSave = this.quickSaves.get(snapshot.selectedQuickSaveSlot);
    if (
      !runtime ||
      !quickSave ||
      quickSave.cartridgeId !== this.currentRomId ||
      quickSave.executionRegion !== runtime.cartridge.consoleRegion ||
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
      this.quickSaves.delete(quickSave.slot);
      this.session = this.session.quickSaveRemoved(quickSave.slot);
      this.emit();
      void this.dependencies.quickSaveStorage
        .removeQuickSave(quickSave.cartridgeId, quickSave.executionRegion, quickSave.slot)
        .catch(() => undefined);
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

    const operation = ++this.operationSequence;
    this.cancelScheduledFrame();
    if (this.currentRomId) void this.persistRuntime(previousRuntime, this.currentRomId);
    const audioSuspension =
      previousStatus === "running"
        ? this.dependencies.audio.suspend().catch(() => undefined)
        : Promise.resolve();

    this.runtime = runtime;
    this.persistedRevisions.set(runtime, runtime.captureBatterySave()?.revision ?? 0);
    this.session = this.session.romReconfigured(toRomDetails(rom, runtime));
    if (previousRuntime.cartridge.consoleRegion === runtime.cartridge.consoleRegion) {
      this.session = this.session.quickSaveAvailabilityChanged([...this.quickSaves.keys()]);
    } else {
      this.quickSaves.clear();
    }
    this.emit();
    if (
      previousRuntime.cartridge.consoleRegion !== runtime.cartridge.consoleRegion &&
      this.currentRomId
    ) {
      await this.hydrateQuickSaves(operation, this.currentRomId, runtime);
      if (!this.isCurrent(operation) || this.runtime !== runtime) return;
    }
    if (previousStatus === "running") {
      await audioSuspension;
      if (!this.isCurrent(operation) || this.runtime !== runtime) return;
      await this.play();
    }
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.operationSequence += 1;
    this.cancelScheduledFrame();
    const audioSuspension = this.dependencies.audio.suspend().catch(() => undefined);
    if (this.runtime && this.currentRomId) {
      await this.persistRuntime(this.runtime, this.currentRomId);
    }
    this.runtime = undefined;
    this.currentRomId = undefined;
    this.currentRom = undefined;
    this.quickSaves.clear();
    this.resetFrameRateDiagnostics();
    this.session = this.session.stop();
    this.emit();
    await audioSuspension;
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
    this.quickSaves.clear();
    this.resetFrameRateDiagnostics();
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
          this.recordCompletedFrame(timestamp);
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

  private recordCompletedFrame(timestamp: number): void {
    if (this.frameRateWindowStartedAt === undefined) {
      this.frameRateWindowStartedAt = timestamp;
      this.framesInRateWindow = 0;
      return;
    }
    this.framesInRateWindow++;
    const elapsed = timestamp - this.frameRateWindowStartedAt;
    if (elapsed < 1000) return;
    this.actualFrameRateHz = (this.framesInRateWindow * 1000) / elapsed;
    this.frameRateWindowStartedAt = timestamp;
    this.framesInRateWindow = 0;
  }

  private resetFrameRateDiagnostics(): void {
    this.frameRateWindowStartedAt = undefined;
    this.framesInRateWindow = 0;
    this.actualFrameRateHz = 0;
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
    this.quickSaves.clear();
    this.resetFrameRateDiagnostics();
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

  private async hydrateQuickSaves(
    operation: number,
    cartridgeId: string,
    runtime: EmulatorRuntimePort,
  ): Promise<void> {
    const executionRegion = runtime.cartridge.consoleRegion;
    const savedSlots = await Promise.all(
      QUICK_SAVE_SLOTS.map(async (slot) => ({
        slot,
        quickSave: await this.dependencies.quickSaveStorage
          .loadQuickSave(cartridgeId, executionRegion, slot)
          .catch(() => undefined),
      })),
    );
    if (!this.isCurrent(operation) || this.runtime !== runtime) return;

    this.quickSaves.clear();
    for (const { slot, quickSave } of savedSlots) {
      if (
        quickSave?.format === "fcemu-quick-save" &&
        quickSave.version === 1 &&
        quickSave.cartridgeId === cartridgeId &&
        quickSave.executionRegion === executionRegion &&
        quickSave.slot === slot
      ) {
        this.quickSaves.set(quickSave.slot, quickSave);
      }
    }
    this.session = this.session.quickSaveAvailabilityChanged([...this.quickSaves.keys()]);
    this.emit();
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
