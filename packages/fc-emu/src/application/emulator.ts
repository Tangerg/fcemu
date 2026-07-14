import Bus, { type BusSnapshot } from "../domain/emulation/bus.js";
import type { ControllerButton } from "../domain/emulation/controller.js";
import Cartridge from "../domain/model/cartridge.js";
import type {
  CartridgeFormat,
  CartridgeTimingMode,
  NametableMirroring,
} from "../domain/model/cartridge.js";
import type { ConsoleRegion } from "../domain/emulation/console-timing.js";
import type { EmulatorOutputPorts, VideoFrame } from "./ports/emulator-output.js";
import { RomIdentity } from "../domain/model/rom-identity.js";

const SAVE_STATE_FORMAT = "fcemu-state";
const SAVE_STATE_VERSION = 12;

export interface CartridgeInfo {
  readonly format: CartridgeFormat;
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly timingMode: CartridgeTimingMode;
  readonly consoleRegion: ConsoleRegion;
  readonly mirroringMode: NametableMirroring;
  readonly hasBatteryBackup: boolean;
  readonly hasWritableChrMemory: boolean;
  readonly prgRomBytes: number;
  readonly chrRomBytes: number;
  readonly prgRamBytes: number;
  readonly prgNvRamBytes: number;
  readonly chrRamBytes: number;
  readonly chrNvRamBytes: number;
}

export interface FrameExecution {
  readonly frameNumber: number;
  readonly cpuCycles: number;
  readonly frame: VideoFrame;
}

export interface EmulatorDiagnostics {
  readonly frameNumber: number;
  readonly cpuCycles: number;
  readonly programCounter: number;
  readonly cpuHalted: boolean;
}

export interface BatterySaveSnapshot {
  readonly revision: number;
  readonly data: Uint8Array;
}

export interface EmulatorSaveState {
  readonly format: typeof SAVE_STATE_FORMAT;
  readonly version: typeof SAVE_STATE_VERSION;
  readonly romIdentity: string;
  readonly consoleRegion: ConsoleRegion;
  readonly state: BusSnapshot;
}

export interface EmulatorConfiguration {
  readonly consoleRegion?: ConsoleRegion;
}

/** Application facade for a single emulation session. */
export class Emulator {
  readonly cartridge: CartridgeInfo;
  private readonly bus: Bus;
  private readonly outputs: EmulatorOutputPorts;

  private constructor(
    cartridge: Cartridge,
    private readonly romIdentity: string,
    outputs: EmulatorOutputPorts,
    configuration: EmulatorConfiguration,
  ) {
    this.bus = new Bus(cartridge, outputs.audio?.sampleRate, configuration.consoleRegion);
    this.outputs = outputs;
    this.cartridge = Object.freeze({
      format: cartridge.format,
      mapperNumber: cartridge.mapperNumber,
      submapperNumber: cartridge.submapperNumber,
      timingMode: cartridge.timingMode,
      consoleRegion: this.bus.Timing.region,
      get mirroringMode() {
        return cartridge.mirroringMode;
      },
      hasBatteryBackup: cartridge.hasBatteryBackup,
      hasWritableChrMemory: cartridge.hasWritableChrMemory,
      prgRomBytes: cartridge.prgRom.byteLength,
      chrRomBytes: cartridge.chrRom.byteLength,
      prgRamBytes: cartridge.prgRamBytes,
      prgNvRamBytes: cartridge.prgNvRamBytes,
      chrRamBytes: cartridge.chrRamBytes,
      chrNvRamBytes: cartridge.chrNvRamBytes,
    });

    if (outputs.audio) {
      this.bus.APU.addListener((sample) => outputs.audio?.writeSample(sample));
    }
  }

  static fromRom(
    rom: ArrayBuffer,
    sourceName = "ROM",
    outputs: EmulatorOutputPorts = {},
    configuration: EmulatorConfiguration = {},
  ): Emulator {
    return new Emulator(
      Cartridge.fromArrayBuffer(rom, sourceName),
      new RomIdentity(rom).toString(),
      outputs,
      configuration,
    );
  }

  runFrame(): FrameExecution {
    const cpuCycles = this.bus.updateFrame();
    const frame = this.bus.PPU.front;
    this.outputs.video?.renderFrame(frame);
    return Object.freeze({ frameNumber: this.bus.PPU.frame, cpuCycles, frame });
  }

  get diagnostics(): EmulatorDiagnostics {
    return Object.freeze({
      frameNumber: this.bus.PPU.frame,
      cpuCycles: this.bus.CPU.cpuCycles,
      programCounter: this.bus.CPU.state.PC,
      cpuHalted: this.bus.CPU.isHalted,
    });
  }

  reset(): void {
    this.bus.reset();
  }

  powerCycle(): void {
    this.bus.powerOn();
  }

  captureBatterySave(): BatterySaveSnapshot | undefined {
    if (!this.cartridge.hasBatteryBackup) return undefined;
    const snapshot = this.bus.Cartridge.captureBatterySave();
    if (!snapshot) throw new Error("Battery-backed cartridge has no persistent memory snapshot");
    return Object.freeze(snapshot);
  }

  restoreBatterySave(data: Uint8Array): void {
    if (!this.cartridge.hasBatteryBackup) {
      throw new Error("Cannot restore battery RAM for a cartridge without battery backup");
    }
    this.bus.Cartridge.restoreBatterySave(data);
  }

  captureSaveState(): EmulatorSaveState {
    return {
      format: SAVE_STATE_FORMAT,
      version: SAVE_STATE_VERSION,
      romIdentity: this.romIdentity,
      consoleRegion: this.bus.Timing.region,
      state: this.bus.captureState(),
    };
  }

  restoreSaveState(snapshot: EmulatorSaveState): void {
    if (snapshot.format !== SAVE_STATE_FORMAT || snapshot.version !== SAVE_STATE_VERSION) {
      throw new Error(`Unsupported emulator save-state format or version`);
    }
    if (snapshot.romIdentity !== this.romIdentity) {
      throw new Error("Cannot restore a save state created from another ROM image");
    }
    if (snapshot.consoleRegion !== this.bus.Timing.region) {
      throw new Error("Cannot restore a save state created for another console region");
    }
    this.bus.restoreState(snapshot.state);
  }

  setControllerState(player: 1 | 2, buttons: readonly boolean[]): void {
    const controller = player === 1 ? this.bus.Controller1 : this.bus.Controller2;
    controller.buttonsState = [...buttons];
  }

  setControllerButton(player: 1 | 2, button: ControllerButton, pressed: boolean): void {
    const controller = player === 1 ? this.bus.Controller1 : this.bus.Controller2;
    controller.setButton(button, pressed);
  }
}
