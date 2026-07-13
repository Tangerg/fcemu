import { ControllerButton, Emulator } from "@fcemu/core";
import type { AudioSampleSink, EmulatorSaveState, VideoFrameSink } from "@fcemu/core";
import type {
  EmulatorFactoryPort,
  EmulatorFrameResult,
  EmulatorRuntimePort,
  GameButton,
  RomImage,
} from "../../application/ports.js";
import type { RegionPreference } from "../../domain/execution-region.js";

class CoreEmulatorRuntime implements EmulatorRuntimePort {
  constructor(private readonly emulator: Emulator) {}

  get cartridge() {
    return this.emulator.cartridge;
  }

  runFrame(): EmulatorFrameResult {
    return this.emulator.runFrame();
  }

  reset(): void {
    this.emulator.reset();
  }

  powerCycle(): void {
    this.emulator.powerCycle();
  }

  captureSaveState() {
    return { data: this.emulator.captureSaveState() };
  }

  restoreSaveState(state: { readonly data: unknown }): void {
    this.emulator.restoreSaveState(state.data as EmulatorSaveState);
  }

  captureBatterySave() {
    return this.emulator.captureBatterySave();
  }

  restoreBatterySave(data: Uint8Array): void {
    this.emulator.restoreBatterySave(data);
  }

  setControllerButton(player: 1 | 2, button: GameButton, pressed: boolean): void {
    this.emulator.setControllerButton(player, BUTTON_MAP[button], pressed);
  }
}

const BUTTON_MAP: Readonly<Record<GameButton, ControllerButton>> = {
  a: ControllerButton.A,
  b: ControllerButton.B,
  select: ControllerButton.Select,
  start: ControllerButton.Start,
  up: ControllerButton.Up,
  down: ControllerButton.Down,
  left: ControllerButton.Left,
  right: ControllerButton.Right,
};

export class CoreEmulatorFactory implements EmulatorFactoryPort {
  constructor(
    private readonly video: VideoFrameSink,
    private readonly audio: AudioSampleSink,
  ) {}

  create(rom: RomImage, regionPreference: RegionPreference): EmulatorRuntimePort {
    const configuration = regionPreference === "auto" ? {} : { consoleRegion: regionPreference };
    return new CoreEmulatorRuntime(
      Emulator.fromRom(
        rom.bytes,
        rom.name,
        { video: this.video, audio: this.audio },
        configuration,
      ),
    );
  }
}
