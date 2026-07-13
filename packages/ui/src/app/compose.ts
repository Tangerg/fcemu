import { EmulatorApplication } from "../application/emulator-application.js";
import { CompositeControllerInput } from "../application/composite-controller-input.js";
import { AnimationFrameScheduler } from "../infrastructure/browser/animation-frame-scheduler.js";
import { BrowserRomReader } from "../infrastructure/browser/browser-rom-reader.js";
import { CanvasVideoOutput } from "../infrastructure/browser/canvas-video-output.js";
import { CoreEmulatorFactory } from "../infrastructure/browser/core-emulator-adapter.js";
import { GamepadControllerInput } from "../infrastructure/browser/gamepad-controller-input.js";
import { KeyboardControllerInput } from "../infrastructure/browser/keyboard-controller-input.js";
import { IndexedDbSaveRamStorage } from "../infrastructure/browser/indexed-db-save-ram-storage.js";
import { WebAudioOutput } from "../infrastructure/browser/web-audio-output.js";

export function createBrowserApplication(canvas: HTMLCanvasElement): EmulatorApplication {
  const audio = new WebAudioOutput();
  const video = new CanvasVideoOutput(canvas);
  return new EmulatorApplication({
    romReader: new BrowserRomReader(),
    emulatorFactory: new CoreEmulatorFactory(video, audio),
    scheduler: new AnimationFrameScheduler(),
    audio,
    controllerInput: new CompositeControllerInput([
      new KeyboardControllerInput(),
      new GamepadControllerInput(),
    ]),
    saveRamStorage: new IndexedDbSaveRamStorage(),
  });
}
