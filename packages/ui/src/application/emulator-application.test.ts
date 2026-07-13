import { describe, expect, it, vi } from "vitest";
import { EmulatorApplication } from "./emulator-application.js";
import type {
  ControllerInputEvent,
  ControllerInputPort,
  EmulatorFactoryPort,
  FrameSchedulerPort,
  GameButton,
  RomImage,
  ScheduledFrame,
} from "./ports.js";
import type { RegionPreference } from "../domain/execution-region.js";

class TestScheduler implements FrameSchedulerPort {
  private tasks: Array<{ callback: () => void; cancelled: boolean }> = [];

  schedule(callback: () => void): ScheduledFrame {
    const task = { callback, cancelled: false };
    this.tasks.push(task);
    return {
      cancel: () => {
        task.cancelled = true;
      },
    };
  }

  runNext(): void {
    const task = this.tasks.shift();
    if (task && !task.cancelled) task.callback();
  }
}

class TestControllerInput implements ControllerInputPort {
  private listener: ((event: ControllerInputEvent) => void) | undefined;

  subscribe(listener: (event: ControllerInputEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(event: ControllerInputEvent): void {
    this.listener?.(event);
  }

  get isSubscribed(): boolean {
    return this.listener !== undefined;
  }
}

describe("EmulatorApplication", () => {
  it("loads a ROM, schedules frames and can pause", async () => {
    const scheduler = new TestScheduler();
    const controllerInput = new TestControllerInput();
    const audio = {
      activate: vi.fn<() => void>(),
      resume: vi.fn<() => Promise<"running">>().mockResolvedValue("running"),
      suspend: vi.fn<() => Promise<void>>().mockResolvedValue(),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const runFrame = vi.fn<() => { cpuCycles: number }>(() => ({ cpuCycles: 100 }));
    const setControllerButton =
      vi.fn<(player: 1 | 2, button: GameButton, pressed: boolean) => void>();
    const reset = vi.fn<() => void>();
    const powerCycle = vi.fn<() => void>();
    const application = new EmulatorApplication({
      romReader: {
        read: async (file) => ({
          id: file.name,
          name: file.name,
          bytes: await file.arrayBuffer(),
        }),
      },
      emulatorFactory: {
        create: () => ({
          cartridge: {
            format: "ines",
            mapperNumber: 4,
            submapperNumber: 0,
            consoleRegion: "ntsc",
            hasBatteryBackup: false,
            prgRomBytes: 16_384,
            chrRomBytes: 8192,
          },
          runFrame,
          reset,
          powerCycle,
          captureSaveState: () => ({ data: "state" }),
          restoreSaveState: () => undefined,
          captureBatterySave: () => undefined,
          restoreBatterySave: () => undefined,
          setControllerButton,
        }),
      },
      scheduler,
      audio,
      controllerInput,
      saveRamStorage: { load: async () => undefined, save: async () => undefined },
    });

    await application.loadRom({ name: "game.nes", arrayBuffer: async () => new ArrayBuffer(16) });
    expect(application.getSnapshot().status).toBe("running");
    scheduler.runNext();
    expect(application.getSnapshot()).toMatchObject({ frameCount: 1, cpuCycles: 100 });
    await application.pause();
    expect(application.getSnapshot().status).toBe("paused");
    expect(audio.activate).toHaveBeenCalledOnce();
    expect(audio.suspend).toHaveBeenCalledOnce();
    controllerInput.emit({ player: 1, button: "a", pressed: true });
    expect(setControllerButton).toHaveBeenCalledWith(1, "a", true);
    application.reset();
    expect(reset).toHaveBeenCalledOnce();
    expect(application.getSnapshot()).toMatchObject({ frameCount: 0, cpuCycles: 0 });
    application.powerCycle();
    expect(powerCycle).toHaveBeenCalledOnce();
    await application.stop();
    expect(controllerInput.isSubscribed).toBe(true);
    await application.dispose();
    expect(controllerInput.isSubscribed).toBe(false);
  });

  it("keeps the latest ROM when overlapping reads resolve out of order", async () => {
    const first = deferred<RomImage>();
    const second = deferred<RomImage>();
    const application = createApplication({
      read: (file) => (file.name === "first.nes" ? first.promise : second.promise),
    });

    const firstLoad = application.loadRom(testFile("first.nes"));
    await Promise.resolve();
    const secondLoad = application.loadRom(testFile("second.nes"));
    second.resolve({ id: "second", name: "second.nes", bytes: new ArrayBuffer(1) });
    await secondLoad;
    first.resolve({ id: "first", name: "first.nes", bytes: new ArrayBuffer(1) });
    await firstLoad;

    expect(application.getSnapshot()).toMatchObject({
      status: "running",
      rom: { name: "second.nes" },
    });
  });

  it("does not create a runtime when a pending load completes after disposal", async () => {
    const pending = deferred<RomImage>();
    const create = vi.fn<() => never>();
    const application = createApplication({ read: () => pending.promise }, create);
    const load = application.loadRom(testFile("slow.nes"));
    await Promise.resolve();

    await application.dispose();
    pending.resolve({ id: "slow", name: "slow.nes", bytes: new ArrayBuffer(1) });
    await load;

    expect(create).not.toHaveBeenCalled();
    expect(application.getSnapshot().status).toBe("idle");
  });

  it("restores and checkpoints battery-backed save RAM through its storage port", async () => {
    const stored = Uint8Array.of(0x42);
    const load = vi.fn<(id: string) => Promise<Uint8Array | undefined>>().mockResolvedValue(stored);
    const save = vi.fn<(id: string, data: Uint8Array) => Promise<void>>().mockResolvedValue();
    const restoreBatterySave = vi.fn<(data: Uint8Array) => void>();
    let revision = 0;
    const runtime = {
      cartridge: {
        format: "ines" as const,
        mapperNumber: 1,
        submapperNumber: 0,
        consoleRegion: "ntsc" as const,
        hasBatteryBackup: true,
        prgRomBytes: 16_384,
        chrRomBytes: 8192,
      },
      runFrame: () => ({ cpuCycles: 100 }),
      reset: () => undefined,
      powerCycle: () => undefined,
      captureSaveState: () => ({ data: "state" }),
      restoreSaveState: () => undefined,
      captureBatterySave: () => ({ revision, data: Uint8Array.of(revision) }),
      restoreBatterySave,
      setControllerButton: () => undefined,
    };
    const application = new EmulatorApplication({
      romReader: {
        read: async () => ({ id: "sha256", name: "zelda.nes", bytes: new ArrayBuffer(1) }),
      },
      emulatorFactory: { create: () => runtime },
      scheduler: new TestScheduler(),
      audio: {
        activate: () => undefined,
        resume: async () => "running" as const,
        suspend: async () => undefined,
        dispose: async () => undefined,
      },
      controllerInput: new TestControllerInput(),
      saveRamStorage: { load, save },
    });

    await application.loadRom(testFile("zelda.nes"));
    expect(load).toHaveBeenCalledWith("sha256");
    expect(restoreBatterySave).toHaveBeenCalledWith(stored);

    revision = 1;
    await application.pause();
    expect(save).toHaveBeenCalledWith("sha256", Uint8Array.of(1));
  });

  it("rebuilds a running runtime for an explicit region and carries save RAM across", async () => {
    const scheduler = new TestScheduler();
    const restoreReplacement = vi.fn<(data: Uint8Array) => void>();
    const replacementController =
      vi.fn<(player: 1 | 2, button: GameButton, pressed: boolean) => void>();
    const firstRuntime = createRuntime({
      consoleRegion: "ntsc",
      batterySave: { revision: 7, data: Uint8Array.of(0x42) },
    });
    const replacementRuntime = createRuntime({
      consoleRegion: "pal",
      batterySave: { revision: 7, data: Uint8Array.of(0x42) },
      restoreBatterySave: restoreReplacement,
      setControllerButton: replacementController,
    });
    const create = vi
      .fn<(rom: RomImage, regionPreference: RegionPreference) => ReturnType<typeof createRuntime>>()
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(replacementRuntime);
    const audio = {
      activate: vi.fn<() => void>(),
      resume: vi.fn<() => Promise<"running">>().mockResolvedValue("running"),
      suspend: vi.fn<() => Promise<void>>().mockResolvedValue(),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const controllerInput = new TestControllerInput();
    const application = new EmulatorApplication({
      romReader: {
        read: async () => ({ id: "sha256", name: "game.nes", bytes: new ArrayBuffer(1) }),
      },
      emulatorFactory: { create },
      scheduler,
      audio,
      controllerInput,
      saveRamStorage: { load: async () => undefined, save: async () => undefined },
    });

    await application.loadRom(testFile("game.nes"));
    controllerInput.emit({ player: 1, button: "right", pressed: true });
    scheduler.runNext();
    await application.setRegionPreference("pal");

    expect(create.mock.calls.map(([, preference]) => preference)).toEqual(["auto", "pal"]);
    expect(restoreReplacement).toHaveBeenCalledWith(Uint8Array.of(0x42));
    expect(replacementController).toHaveBeenCalledWith(1, "right", true);
    expect(application.getSnapshot()).toMatchObject({
      status: "running",
      audioStatus: "running",
      regionPreference: "pal",
      frameCount: 0,
      cpuCycles: 0,
      rom: { consoleRegion: "pal" },
    });
    expect(audio.suspend).toHaveBeenCalledOnce();
    expect(audio.resume).toHaveBeenCalledTimes(2);
  });

  it("keeps a paused session paused when its execution region changes", async () => {
    const create = vi
      .fn<(rom: RomImage, regionPreference: RegionPreference) => ReturnType<typeof createRuntime>>()
      .mockImplementation((_rom, preference) =>
        createRuntime({ consoleRegion: preference === "auto" ? "ntsc" : preference }),
      );
    const application = createApplication(
      { read: async () => ({ id: "game", name: "game.nes", bytes: new ArrayBuffer(1) }) },
      create,
    );

    await application.loadRom(testFile("game.nes"));
    await application.pause();
    await application.setRegionPreference("dendy");

    expect(application.getSnapshot()).toMatchObject({
      status: "paused",
      regionPreference: "dendy",
      rom: { consoleRegion: "dendy" },
    });
  });

  it("keeps the old preference and runtime when region reconstruction fails", async () => {
    const scheduler = new TestScheduler();
    const runFrame = vi.fn<() => { cpuCycles: number }>(() => ({ cpuCycles: 100 }));
    const runtime = { ...createRuntime({ consoleRegion: "ntsc" }), runFrame };
    const create = vi
      .fn<(rom: RomImage, regionPreference: RegionPreference) => ReturnType<typeof createRuntime>>()
      .mockReturnValueOnce(runtime)
      .mockImplementationOnce(() => {
        throw new Error("cannot construct PAL runtime");
      });
    const application = new EmulatorApplication({
      romReader: {
        read: async () => ({ id: "game", name: "game.nes", bytes: new ArrayBuffer(1) }),
      },
      emulatorFactory: { create },
      scheduler,
      audio: {
        activate: () => undefined,
        resume: async () => "running" as const,
        suspend: async () => undefined,
        dispose: async () => undefined,
      },
      controllerInput: new TestControllerInput(),
      saveRamStorage: { load: async () => undefined, save: async () => undefined },
    });

    await application.loadRom(testFile("game.nes"));
    await application.setRegionPreference("pal");
    scheduler.runNext();

    expect(application.getSnapshot()).toMatchObject({
      status: "running",
      regionPreference: "auto",
      frameCount: 1,
      rom: { consoleRegion: "ntsc" },
    });
    expect(runFrame).toHaveBeenCalledOnce();
  });

  it("uses a preference selected while a ROM read is still pending", async () => {
    const pending = deferred<RomImage>();
    const create = vi.fn<
      (rom: RomImage, regionPreference: RegionPreference) => ReturnType<typeof createRuntime>
    >((_rom, preference) =>
      createRuntime({ consoleRegion: preference === "auto" ? "ntsc" : preference }),
    );
    const application = createApplication({ read: () => pending.promise }, create);
    const load = application.loadRom(testFile("slow.nes"));

    await application.setRegionPreference("pal");
    pending.resolve({ id: "slow", name: "slow.nes", bytes: new ArrayBuffer(1) });
    await load;

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "slow" }), "pal");
    expect(application.getSnapshot()).toMatchObject({
      status: "running",
      regionPreference: "pal",
      rom: { consoleRegion: "pal" },
    });
  });

  it("quick-saves the timeline and restores it without replaying stale input or audio", async () => {
    const scheduler = new TestScheduler();
    const controllerInput = new TestControllerInput();
    const captureSaveState = vi.fn<() => { data: { slot: number } }>(() => ({
      data: { slot: 1 },
    }));
    const restoreSaveState = vi.fn<({ data }: { data: unknown }) => void>();
    const setControllerButton =
      vi.fn<(player: 1 | 2, button: GameButton, pressed: boolean) => void>();
    const runtime = createRuntime({
      consoleRegion: "ntsc",
      captureSaveState,
      restoreSaveState,
      setControllerButton,
    });
    const audio = {
      activate: vi.fn<() => void>(),
      resume: vi.fn<() => Promise<"running">>().mockResolvedValue("running"),
      suspend: vi.fn<() => Promise<void>>().mockResolvedValue(),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(),
    };
    const application = new EmulatorApplication({
      romReader: {
        read: async () => ({ id: "game", name: "game.nes", bytes: new ArrayBuffer(1) }),
      },
      emulatorFactory: { create: () => runtime },
      scheduler,
      audio,
      controllerInput,
      saveRamStorage: { load: async () => undefined, save: async () => undefined },
    });

    await application.loadRom(testFile("game.nes"));
    controllerInput.emit({ player: 1, button: "a", pressed: true });
    scheduler.runNext();
    scheduler.runNext();
    application.quickSaveCurrentState();
    expect(application.getSnapshot()).toMatchObject({
      hasQuickSave: true,
      frameCount: 2,
      cpuCycles: 200,
    });

    controllerInput.emit({ player: 1, button: "a", pressed: false });
    scheduler.runNext();
    await application.quickLoadCurrentState();

    expect(captureSaveState).toHaveBeenCalledOnce();
    expect(restoreSaveState).toHaveBeenCalledWith({ data: { slot: 1 } });
    expect(setControllerButton).toHaveBeenLastCalledWith(2, "right", false);
    expect(setControllerButton).toHaveBeenCalledWith(1, "a", false);
    expect(application.getSnapshot()).toMatchObject({
      status: "running",
      hasQuickSave: true,
      frameCount: 2,
      cpuCycles: 200,
    });
    expect(audio.suspend).toHaveBeenCalledOnce();
    expect(audio.resume).toHaveBeenCalledTimes(2);
  });
});

function createApplication(
  romReader: { read(file: { readonly name: string }): Promise<RomImage> },
  create: EmulatorFactoryPort["create"] = vi.fn<
    (
      rom: RomImage,
      regionPreference: RegionPreference,
    ) => {
      cartridge: {
        format: "ines" | "nes2";
        mapperNumber: number;
        submapperNumber: number;
        consoleRegion: "ntsc" | "pal" | "dendy";
        hasBatteryBackup: boolean;
        prgRomBytes: number;
        chrRomBytes: number;
      };
      runFrame: () => { cpuCycles: number };
      reset: () => void;
      powerCycle: () => void;
      captureSaveState: () => { data: unknown };
      restoreSaveState: () => void;
      captureBatterySave: () => undefined;
      restoreBatterySave: () => void;
      setControllerButton: () => void;
    }
  >((rom) => ({
    cartridge: {
      format: "ines",
      mapperNumber: rom.name === "first.nes" ? 1 : 2,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      hasBatteryBackup: false,
      prgRomBytes: 16_384,
      chrRomBytes: 8192,
    },
    runFrame: () => ({ cpuCycles: 100 }),
    reset: () => undefined,
    powerCycle: () => undefined,
    captureSaveState: () => ({ data: "state" }),
    restoreSaveState: () => undefined,
    captureBatterySave: () => undefined,
    restoreBatterySave: () => undefined,
    setControllerButton: () => undefined,
  })),
): EmulatorApplication {
  return new EmulatorApplication({
    romReader,
    emulatorFactory: { create },
    scheduler: new TestScheduler(),
    audio: {
      activate: () => undefined,
      resume: async () => "running" as const,
      suspend: async () => undefined,
      dispose: async () => undefined,
    },
    controllerInput: new TestControllerInput(),
    saveRamStorage: { load: async () => undefined, save: async () => undefined },
  });
}

function createRuntime({
  consoleRegion,
  batterySave,
  captureSaveState = () => ({ data: "state" }),
  restoreSaveState = () => undefined,
  restoreBatterySave = () => undefined,
  setControllerButton = () => undefined,
}: {
  readonly consoleRegion: "ntsc" | "pal" | "dendy";
  readonly batterySave?: { readonly revision: number; readonly data: Uint8Array };
  readonly captureSaveState?: () => { readonly data: unknown };
  readonly restoreSaveState?: (state: { readonly data: unknown }) => void;
  readonly restoreBatterySave?: (data: Uint8Array) => void;
  readonly setControllerButton?: (player: 1 | 2, button: GameButton, pressed: boolean) => void;
}) {
  return {
    cartridge: {
      format: "ines" as const,
      mapperNumber: 0,
      submapperNumber: 0,
      consoleRegion,
      hasBatteryBackup: batterySave !== undefined,
      prgRomBytes: 16_384,
      chrRomBytes: 8192,
    },
    runFrame: () => ({ cpuCycles: 100 }),
    reset: () => undefined,
    powerCycle: () => undefined,
    captureSaveState,
    restoreSaveState,
    captureBatterySave: () => batterySave,
    restoreBatterySave,
    setControllerButton,
  };
}

function testFile(name: string) {
  return { name, arrayBuffer: async () => new ArrayBuffer(1) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
