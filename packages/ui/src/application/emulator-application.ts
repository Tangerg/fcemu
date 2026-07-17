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

interface ActiveEmulation {
  readonly runtime: EmulatorRuntimePort;
  readonly rom: RomImage;
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
  private activeEmulation: ActiveEmulation | undefined;
  private scheduledFrame: ScheduledFrame | undefined;
  private lastFrameTime: number | undefined;
  private frameTimeDebtMs = 0;
  private frameRateWindowStartedAt: number | undefined;
  private framesInRateWindow = 0;
  private actualFrameRateHz = 0;
  private readonly listeners = new Set<() => void>();
  private operationSequence = 0;
  private restartInFlight = false;
  private disposed = false;
  private readonly unsubscribeControllerInput: () => void;
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
      this.activeEmulation?.runtime.setControllerButton(event.player, event.button, event.pressed);
    });
  }

  getSnapshot = (): SessionSnapshot => this.session.snapshot;

  getDiagnostics = (): EmulatorApplicationDiagnostics =>
    Object.freeze({
      actualFrameRateHz: this.actualFrameRateHz,
      targetFrameRateHz: this.activeEmulation?.runtime.frameRateHz ?? 0,
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
    const previousActiveEmulation = this.activeEmulation;
    if (previousActiveEmulation) {
      void this.persistRuntime(previousActiveEmulation.runtime, previousActiveEmulation.rom.id);
    }
    this.cancelScheduledFrame();
    this.activeEmulation = undefined;
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
      const activeEmulation = { runtime, rom };
      this.activeEmulation = activeEmulation;
      this.persistedRevisions.set(runtime, runtime.captureBatterySave()?.revision ?? 0);
      this.session = this.session.romLoaded(toRomDetails(rom, runtime));
      await this.hydrateQuickSaves(operation, activeEmulation);
      if (!this.isCurrentEmulation(operation, activeEmulation)) return;
      await audioSuspension;
      if (!this.isCurrentEmulation(operation, activeEmulation)) return;
      await this.play();
    } catch (error) {
      this.failIfCurrent(operation, error);
    }
  }

  async play(): Promise<void> {
    const operation = this.operationSequence;
    const activeEmulation = this.activeEmulation;
    const status = this.session.snapshot.status;
    if (
      this.restartInFlight ||
      !this.isCurrent(operation) ||
      !activeEmulation ||
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
        !this.isCurrentEmulation(operation, activeEmulation) ||
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

  async retryAudio(): Promise<void> {
    const operation = this.operationSequence;
    const activeEmulation = this.activeEmulation;
    const snapshot = this.session.snapshot;
    if (!activeEmulation || snapshot.status !== "running" || snapshot.audioStatus !== "blocked") {
      return;
    }

    try {
      await this.dependencies.audio.suspend().catch(() => undefined);
      if (
        !this.isCurrentEmulation(operation, activeEmulation) ||
        this.session.snapshot.status !== "running" ||
        this.session.snapshot.audioStatus !== "blocked"
      ) {
        return;
      }
      const audioResult = await this.dependencies.audio.resume();
      if (
        !this.isCurrentEmulation(operation, activeEmulation) ||
        this.session.snapshot.status !== "running" ||
        this.session.snapshot.audioStatus !== "blocked"
      ) {
        return;
      }
      this.session = this.session.audioChanged(audioResult);
      this.emit();
    } catch {
      // Keep the explicit blocked state so another user gesture can retry.
    }
  }

  async pause(): Promise<void> {
    if (this.session.snapshot.status !== "running") return;
    const activeEmulation = this.activeEmulation;
    this.cancelScheduledFrame();
    const audioSuspension = this.dependencies.audio.suspend().catch(() => undefined);
    this.session = this.session.pause();
    this.emit();
    const persistence = activeEmulation
      ? this.persistRuntime(activeEmulation.runtime, activeEmulation.rom.id)
      : Promise.resolve();
    await Promise.all([audioSuspension, persistence]);
  }

  async reset(): Promise<void> {
    await this.restartRuntime((runtime) => runtime.reset());
  }

  async powerCycle(): Promise<void> {
    await this.restartRuntime((runtime) => runtime.powerCycle());
  }

  quickSaveCurrentState(): void {
    const activeEmulation = this.activeEmulation;
    const snapshot = this.session.snapshot;
    if (!activeEmulation || !["ready", "running", "paused"].includes(snapshot.status)) return;
    const { runtime, rom } = activeEmulation;
    const quickSave: PersistedQuickSave = {
      format: "fcemu-quick-save",
      version: 1,
      cartridgeId: rom.id,
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

  async removeCurrentQuickSave(): Promise<void> {
    const activeEmulation = this.activeEmulation;
    const snapshot = this.session.snapshot;
    const quickSave = this.quickSaves.get(snapshot.selectedQuickSaveSlot);
    if (
      !activeEmulation ||
      !quickSave ||
      !["ready", "running", "paused"].includes(snapshot.status)
    ) {
      return;
    }
    const { runtime, rom } = activeEmulation;
    if (
      quickSave.cartridgeId !== rom.id ||
      quickSave.executionRegion !== runtime.cartridge.consoleRegion
    ) {
      return;
    }

    const operation = this.operationSequence;
    try {
      await this.dependencies.quickSaveStorage.removeQuickSave(
        quickSave.cartridgeId,
        quickSave.executionRegion,
        quickSave.slot,
      );
    } catch {
      return;
    }
    if (!this.isCurrentEmulation(operation, activeEmulation)) {
      return;
    }
    const currentQuickSave = this.quickSaves.get(quickSave.slot);
    if (currentQuickSave !== quickSave) {
      if (
        currentQuickSave?.cartridgeId === rom.id &&
        currentQuickSave.executionRegion === runtime.cartridge.consoleRegion
      ) {
        await this.dependencies.quickSaveStorage
          .saveQuickSave(currentQuickSave)
          .catch(() => undefined);
      }
      return;
    }

    this.quickSaves.delete(quickSave.slot);
    this.session = this.session.quickSaveRemoved(quickSave.slot);
    this.emit();
  }

  async quickLoadCurrentState(): Promise<void> {
    const activeEmulation = this.activeEmulation;
    const snapshot = this.session.snapshot;
    const quickSave = this.quickSaves.get(snapshot.selectedQuickSaveSlot);
    if (
      this.restartInFlight ||
      !activeEmulation ||
      !quickSave ||
      !["ready", "running", "paused"].includes(snapshot.status)
    )
      return;
    const { runtime, rom } = activeEmulation;
    if (
      quickSave.cartridgeId !== rom.id ||
      quickSave.executionRegion !== runtime.cartridge.consoleRegion
    ) {
      return;
    }

    const operation = this.operationSequence;
    const wasRunning = snapshot.status === "running";
    if (wasRunning) {
      this.cancelScheduledFrame();
      await this.dependencies.audio.suspend().catch(() => undefined);
      if (!this.isCurrentEmulation(operation, activeEmulation)) return;
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
      if (wasRunning && this.isCurrentEmulation(operation, activeEmulation)) {
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

    const previousActiveEmulation = this.activeEmulation;
    if (!previousActiveEmulation) return;
    const { runtime: previousRuntime, rom } = previousActiveEmulation;

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
    void this.persistRuntime(previousRuntime, rom.id);
    const audioSuspension =
      previousStatus === "running"
        ? this.dependencies.audio.suspend().catch(() => undefined)
        : Promise.resolve();

    const activeEmulation = { runtime, rom };
    this.activeEmulation = activeEmulation;
    this.persistedRevisions.set(runtime, runtime.captureBatterySave()?.revision ?? 0);
    this.session = this.session.romReconfigured(toRomDetails(rom, runtime));
    if (previousRuntime.cartridge.consoleRegion === runtime.cartridge.consoleRegion) {
      this.session = this.session.quickSaveAvailabilityChanged([...this.quickSaves.keys()]);
    } else {
      this.quickSaves.clear();
    }
    this.emit();
    if (previousRuntime.cartridge.consoleRegion !== runtime.cartridge.consoleRegion) {
      await this.hydrateQuickSaves(operation, activeEmulation);
      if (!this.isCurrentEmulation(operation, activeEmulation)) return;
    }
    if (previousStatus === "running") {
      await audioSuspension;
      if (!this.isCurrentEmulation(operation, activeEmulation)) return;
      await this.play();
    }
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.operationSequence += 1;
    this.cancelScheduledFrame();
    const activeEmulation = this.activeEmulation;
    const audioSuspension = this.dependencies.audio.suspend().catch(() => undefined);
    const persistence = activeEmulation
      ? this.persistRuntime(activeEmulation.runtime, activeEmulation.rom.id)
      : Promise.resolve();
    this.activeEmulation = undefined;
    this.quickSaves.clear();
    this.resetFrameRateDiagnostics();
    this.session = this.session.stop();
    this.emit();
    await Promise.all([audioSuspension, persistence]);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.operationSequence += 1;
    this.cancelScheduledFrame();
    const activeEmulation = this.activeEmulation;
    if (activeEmulation) {
      await this.persistRuntime(activeEmulation.runtime, activeEmulation.rom.id);
    }
    this.activeEmulation = undefined;
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
      const activeEmulation = this.activeEmulation;
      if (!activeEmulation || this.session.snapshot.status !== "running") return;
      const { runtime, rom } = activeEmulation;
      try {
        const framesDue = this.framesDue(runtime, timestamp);
        for (let frame = 0; frame < framesDue; frame++) {
          if (
            this.activeEmulation !== activeEmulation ||
            this.session.snapshot.status !== "running"
          ) {
            break;
          }
          const result = runtime.runFrame();
          this.session = this.session.frameCompleted(result.cpuCycles);
          this.recordCompletedFrame(timestamp);
          this.emit();
          if (this.session.snapshot.frameCount % SAVE_CHECKPOINT_FRAMES === 0) {
            void this.persistRuntime(runtime, rom.id);
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
  private framesDue(runtime: EmulatorRuntimePort, timestamp: number): number {
    if (!Number.isFinite(runtime.frameRateHz) || runtime.frameRateHz <= 0) {
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

  private isCurrentEmulation(operation: number, activeEmulation: ActiveEmulation): boolean {
    return this.isCurrent(operation) && this.activeEmulation === activeEmulation;
  }

  private failIfCurrent(operation: number, error: unknown): void {
    if (!this.isCurrent(operation)) return;
    this.cancelScheduledFrame();
    this.activeEmulation = undefined;
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
    activeEmulation: ActiveEmulation,
  ): Promise<void> {
    const { runtime, rom } = activeEmulation;
    const cartridgeId = rom.id;
    const executionRegion = runtime.cartridge.consoleRegion;
    const savedSlots = await Promise.all(
      QUICK_SAVE_SLOTS.map(async (slot) => ({
        slot,
        quickSave: await this.dependencies.quickSaveStorage
          .loadQuickSave(cartridgeId, executionRegion, slot)
          .catch(() => undefined),
      })),
    );
    if (!this.isCurrentEmulation(operation, activeEmulation)) return;

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

  private async restartRuntime(command: (runtime: EmulatorRuntimePort) => void): Promise<void> {
    const activeEmulation = this.activeEmulation;
    const snapshot = this.session.snapshot;
    if (
      this.restartInFlight ||
      !activeEmulation ||
      !["ready", "running", "paused"].includes(snapshot.status)
    ) {
      return;
    }
    const { runtime } = activeEmulation;

    const operation = this.operationSequence;
    const wasRunning = snapshot.status === "running";
    this.restartInFlight = true;
    try {
      if (wasRunning) {
        this.cancelScheduledFrame();
        await this.dependencies.audio.suspend().catch(() => undefined);
        if (!this.isCurrentEmulation(operation, activeEmulation)) return;
      }

      const shouldResume = wasRunning && this.session.snapshot.status === "running";
      command(runtime);
      this.restoreControllerState(runtime);
      this.resetFrameRateDiagnostics();
      this.session = this.session.restarted();
      this.emit();
      this.restartInFlight = false;
      if (shouldResume) await this.play();
    } catch (error) {
      this.failIfCurrent(operation, error);
    } finally {
      this.restartInFlight = false;
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
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected emulator error";
}
