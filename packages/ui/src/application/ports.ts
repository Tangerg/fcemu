import type { ExecutionRegion, RegionPreference } from "../domain/execution-region.js";
import type { QuickSaveSlot } from "../domain/emulation-session.js";

export interface BinaryFile {
  readonly name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface RomImage {
  readonly id: string;
  readonly name: string;
  readonly bytes: ArrayBuffer;
}

export interface RomReaderPort {
  read(file: BinaryFile): Promise<RomImage>;
}

interface EmulatorCartridgeInfo {
  readonly format: "ines" | "nes2";
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly consoleRegion: ExecutionRegion;
  readonly hasBatteryBackup: boolean;
  readonly prgRomBytes: number;
  readonly chrRomBytes: number;
}

export interface EmulatorFrameResult {
  readonly cpuCycles: number;
}

/** Opaque state owned and interpreted only by one emulator runtime adapter. */
interface EmulatorRuntimeState {
  readonly data: unknown;
}

export interface EmulatorRuntimePort {
  readonly cartridge: EmulatorCartridgeInfo;
  readonly frameRateHz: number;
  runFrame(): EmulatorFrameResult;
  reset(): void;
  powerCycle(): void;
  captureSaveState(): EmulatorRuntimeState;
  restoreSaveState(state: EmulatorRuntimeState): void;
  captureBatterySave(): BatterySaveSnapshot | undefined;
  restoreBatterySave(data: Uint8Array): void;
  setControllerButton(player: 1 | 2, button: GameButton, pressed: boolean): void;
}

interface BatterySaveSnapshot {
  readonly revision: number;
  readonly data: Uint8Array;
}

export interface SaveRamStoragePort {
  load(cartridgeId: string): Promise<Uint8Array | undefined>;
  save(cartridgeId: string, data: Uint8Array): Promise<void>;
}

export interface PersistedQuickSave {
  readonly format: "fcemu-quick-save";
  readonly version: 1;
  readonly cartridgeId: string;
  readonly executionRegion: ExecutionRegion;
  readonly slot: QuickSaveSlot;
  readonly frameCount: number;
  readonly cpuCycles: number;
  readonly runtimeState: EmulatorRuntimeState;
}

export interface QuickSaveStoragePort {
  loadQuickSave(
    cartridgeId: string,
    executionRegion: ExecutionRegion,
    slot: QuickSaveSlot,
  ): Promise<PersistedQuickSave | undefined>;
  saveQuickSave(snapshot: PersistedQuickSave): Promise<void>;
  removeQuickSave(
    cartridgeId: string,
    executionRegion: ExecutionRegion,
    slot: QuickSaveSlot,
  ): Promise<void>;
}

export interface EmulatorFactoryPort {
  create(rom: RomImage, regionPreference: RegionPreference): EmulatorRuntimePort;
}

export interface ScheduledFrame {
  cancel(): void;
}

export interface FrameSchedulerPort {
  /** Invokes `callback` on the next frame with a monotonic millisecond timestamp. */
  schedule(callback: (timestamp: number) => void): ScheduledFrame;
}

export type GameButton = "a" | "b" | "select" | "start" | "up" | "down" | "left" | "right";

export interface ControllerInputEvent {
  readonly player: 1 | 2;
  readonly button: GameButton;
  readonly pressed: boolean;
}

export interface ControllerInputPort {
  subscribe(listener: (event: ControllerInputEvent) => void): () => void;
}

type AudioResumeResult = "running" | "blocked";

export interface AudioDiagnostics {
  readonly sampleRate: number;
  readonly underruns: number;
  readonly droppedSamples: number;
  readonly pendingSamples: number;
  readonly bufferedSamples: number;
}

export interface AudioLifecyclePort {
  readonly diagnostics: AudioDiagnostics;
  activate(): void;
  resume(): Promise<AudioResumeResult>;
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}
