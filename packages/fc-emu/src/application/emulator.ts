import Bus, { type BusSnapshot } from "../domain/emulation/bus.js";
import { ControllerButton } from "../domain/emulation/controller.js";
import Cartridge from "../domain/model/cartridge.js";
import type {
  CartridgeConsoleType,
  CartridgeFormat,
  CartridgeTimingMode,
  NametableMirroring,
} from "../domain/model/cartridge.js";
import type { ConsoleRegion } from "../domain/emulation/console-timing.js";
import type { EmulatorOutputPorts, VideoFrame } from "./ports/emulator-output.js";
import { createRomIdentity } from "../domain/model/rom-identity.js";
import type { OekaKidsTabletInput } from "../domain/emulation/oeka-kids-tablet.js";

const SAVE_STATE_FORMAT = "fcemu-state";
const SAVE_STATE_VERSION = 18;

export interface CartridgeInfo {
  readonly format: CartridgeFormat;
  readonly mapperNumber: number;
  readonly submapperNumber: number;
  readonly timingMode: CartridgeTimingMode;
  readonly consoleType: CartridgeConsoleType.Standard | CartridgeConsoleType.VsSystem;
  readonly vsPpuType: number;
  readonly vsHardwareType: number;
  readonly defaultExpansionDevice: number;
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
  readonly mapperRamBytes: number;
  readonly mapperNvRamBytes: number;
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
  readonly frameRateHz: number;
  private readonly bus: Bus;
  private readonly outputs: EmulatorOutputPorts;

  private constructor(
    cartridge: Cartridge,
    private readonly romIdentity: string,
    outputs: EmulatorOutputPorts,
    configuration: EmulatorConfiguration,
  ) {
    this.bus = new Bus(cartridge, outputs.audio?.sampleRate, configuration.consoleRegion);
    this.frameRateHz = this.bus.Timing.frameRateHz;
    this.outputs = outputs;
    this.cartridge = Object.freeze({
      format: cartridge.format,
      mapperNumber: cartridge.mapperNumber,
      submapperNumber: cartridge.submapperNumber,
      timingMode: cartridge.timingMode,
      consoleType: cartridge.consoleType as
        CartridgeConsoleType.Standard | CartridgeConsoleType.VsSystem,
      vsPpuType: cartridge.vsPpuType,
      vsHardwareType: cartridge.vsHardwareType,
      defaultExpansionDevice: cartridge.defaultExpansionDevice,
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
      mapperRamBytes: cartridge.mapperRamBytes,
      mapperNvRamBytes: cartridge.mapperNvRamBytes,
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
      createRomIdentity(rom),
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

  restoreSaveState(snapshot: unknown): void {
    assertSaveStateEnvelope(snapshot);
    if (snapshot.romIdentity !== this.romIdentity) {
      throw new Error("Cannot restore a save state created from another ROM image");
    }
    if (snapshot.consoleRegion !== this.bus.Timing.region) {
      throw new Error("Cannot restore a save state created for another console region");
    }
    this.bus.restoreState(snapshot.state);
  }

  setControllerState(player: 1 | 2, buttons: readonly boolean[]): void {
    const controller = this.controllerForPlayer(player);
    if (this.bus.Cartridge.consoleType !== 1) {
      controller.buttonsState = [...buttons];
      return;
    }
    if (
      !Array.isArray(buttons) ||
      buttons.length !== 8 ||
      buttons.some((pressed) => typeof pressed !== "boolean")
    ) {
      throw new RangeError("Controller input must contain exactly eight boolean button values");
    }

    for (const button of [
      ControllerButton.A,
      ControllerButton.B,
      ControllerButton.Up,
      ControllerButton.Down,
      ControllerButton.Left,
      ControllerButton.Right,
    ]) {
      controller.setButton(button, buttons[button] ?? false);
    }
    this.bus.Controller1.setButton(ControllerButton.Start, false);
    this.bus.Controller2.setButton(ControllerButton.Start, false);
    this.vsSelectControllerForPlayer(player).setButton(
      ControllerButton.Select,
      buttons[ControllerButton.Start] ?? false,
    );
  }

  setControllerButton(player: 1 | 2, button: ControllerButton, pressed: boolean): void {
    const controller = this.controllerForPlayer(player);
    if (this.bus.Cartridge.consoleType === 1) {
      if (button === ControllerButton.Select) {
        if (typeof pressed !== "boolean") {
          throw new TypeError("Controller button state must be boolean");
        }
        return;
      }
      if (button === ControllerButton.Start) {
        this.vsSelectControllerForPlayer(player).setButton(ControllerButton.Select, pressed);
        return;
      }
    }
    controller.setButton(button, pressed);
  }

  setOekaKidsTabletInput(input: OekaKidsTabletInput): void {
    this.bus.setOekaKidsTabletInput(input);
  }

  insertCoin(slot: 1 | 2 = 1): void {
    this.bus.insertVsCoin(slot);
  }

  setServiceButton(pressed: boolean): void {
    this.bus.setVsServiceButton(pressed);
  }

  setDipSwitch(index: number, enabled: boolean): void {
    this.bus.setVsDipSwitch(index, enabled);
  }

  private controllerForPlayer(player: 1 | 2) {
    if (player !== 1 && player !== 2) {
      throw new RangeError("Controller player must be 1 or 2");
    }
    const firstPlayerUsesPort2 =
      this.bus.Cartridge.consoleType === 1 && this.bus.Cartridge.defaultExpansionDevice === 5;
    const usesPort1 = firstPlayerUsesPort2 ? player === 2 : player === 1;
    return usesPort1 ? this.bus.Controller1 : this.bus.Controller2;
  }

  private vsSelectControllerForPlayer(player: 1 | 2) {
    return player === 1 ? this.bus.Controller1 : this.bus.Controller2;
  }
}

function assertSaveStateEnvelope(snapshot: unknown): asserts snapshot is EmulatorSaveState {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("format" in snapshot) ||
    !("version" in snapshot) ||
    snapshot.format !== SAVE_STATE_FORMAT ||
    snapshot.version !== SAVE_STATE_VERSION
  ) {
    throw new Error("Unsupported emulator save-state format or version");
  }
  if (
    !("romIdentity" in snapshot) ||
    typeof snapshot.romIdentity !== "string" ||
    !("consoleRegion" in snapshot) ||
    !isConsoleRegion(snapshot.consoleRegion) ||
    !("state" in snapshot) ||
    typeof snapshot.state !== "object" ||
    snapshot.state === null
  ) {
    throw new TypeError("Malformed emulator save-state envelope");
  }
}

function isConsoleRegion(value: unknown): value is ConsoleRegion {
  return value === "ntsc" || value === "pal" || value === "dendy";
}
