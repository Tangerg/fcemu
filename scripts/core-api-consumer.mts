import {
  CartridgeConsoleType,
  CartridgeFormatError,
  CartridgeTimingMode,
  ControllerButton,
  Emulator,
  NametableMirroring,
  UnsupportedMapperConfigurationError,
  UnsupportedMapperError,
  UnsupportedMapperVariantError,
} from "@fcemu/core";
import type {
  AudioSampleSink,
  BatterySaveSnapshot,
  CartridgeFormat,
  CartridgeFormatErrorCode,
  CartridgeInfo,
  ConsoleRegion,
  EmulatorConfiguration,
  EmulatorDiagnostics,
  EmulatorOutputPorts,
  EmulatorSaveState,
  FrameExecution,
  VideoFrame,
  VideoFrameSink,
} from "@fcemu/core";

declare const rom: ArrayBuffer;
declare const cartridgeFormat: CartridgeFormat;
declare const formatErrorCode: CartridgeFormatErrorCode;
declare const consoleRegion: ConsoleRegion;

const audio: AudioSampleSink = {
  sampleRate: 48_000,
  writeSample(sample) {
    void sample;
  },
};
const video: VideoFrameSink = {
  renderFrame(frame) {
    const pixels: Uint8ClampedArray = frame.toCanvasImageData();
    void pixels;
  },
};
const outputs: EmulatorOutputPorts = { audio, video };
const configuration: EmulatorConfiguration = { consoleRegion: "ntsc" };
const emulator = Emulator.fromRom(rom, "consumer.nes", outputs, configuration);

const cartridge: CartridgeInfo = emulator.cartridge;
const execution: FrameExecution = emulator.runFrame();
const frame: VideoFrame = execution.frame;
const diagnostics: EmulatorDiagnostics = emulator.diagnostics;
const battery: BatterySaveSnapshot | undefined = emulator.captureBatterySave();
const state: EmulatorSaveState = emulator.captureSaveState();

emulator.setControllerButton(1, ControllerButton.A, true);
emulator.restoreSaveState(state);

void [
  cartridge,
  frame,
  diagnostics,
  battery,
  cartridgeFormat,
  formatErrorCode,
  consoleRegion,
  CartridgeConsoleType,
  CartridgeFormatError,
  CartridgeTimingMode,
  NametableMirroring,
  UnsupportedMapperError,
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
];
