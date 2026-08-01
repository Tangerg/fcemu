import { describe, expect, it } from "vitest";
import { createTestRom } from "../../test-support/rom.js";
import { NametableMirroring } from "../domain/model/cartridge.js";
import { Emulator, type EmulatorSaveState } from "./emulator.js";

describe("Emulator save states", () => {
  it("preserves Vs. cabinet inputs and security-device progress", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        mapper: 99,
        nes2: true,
        consoleType: 1,
        vsPpuType: 5,
        vsHardwareType: 2,
        prgRomBytes: 0x8000,
        chrRomBytes: 0x2000,
        prgRamShift: 5,
        chrRamShift: 0,
      }),
    );
    emulator.setDipSwitch(3, true);
    emulator.setServiceButton(true);
    emulator.insertCoin(2);
    const snapshot = emulator.captureSaveState();

    expect(snapshot.state.vsSystem).toMatchObject({
      dipSwitches: 0x04,
      serviceButton: true,
      coin2CyclesRemaining: expect.any(Number),
    });
    emulator.runFrame();
    emulator.restoreSaveState(snapshot);
    expect(emulator.captureSaveState()).toEqual(snapshot);
  });

  it("replays video, audio, cycles and diagnostics exactly from an active execution snapshot", () => {
    const samples: number[] = [];
    const rom = createTestRom({
      program: [
        0xa9,
        0x1f,
        0x8d,
        0x00,
        0x40, // pulse envelope
        0xa9,
        0x08,
        0x8d,
        0x02,
        0x40, // pulse timer low
        0xa9,
        0xff,
        0x8d,
        0x03,
        0x40, // pulse timer high/length
        0xa9,
        0x01,
        0x8d,
        0x15,
        0x40, // enable pulse 1
        0xa9,
        0x08,
        0x8d,
        0x01,
        0x20, // enable background rendering
        0x4c,
        0x19,
        0x80,
      ],
    });
    const emulator = Emulator.fromRom(rom, "state-test.nes", {
      audio: { sampleRate: 44_100, writeSample: (sample) => samples.push(sample) },
    });
    for (let frame = 0; frame < 3; frame++) emulator.runFrame();

    const snapshot = emulator.captureSaveState();
    expect(snapshot.state.cpu.activeInstruction ?? snapshot.state.cpu.interruptEntry).toBeDefined();

    samples.length = 0;
    const expected = runAndCapture(emulator, 3);
    const expectedSamples = [...samples];
    const expectedDiagnostics = emulator.diagnostics;

    emulator.restoreSaveState(snapshot);
    samples.length = 0;
    expect(runAndCapture(emulator, 3)).toEqual(expected);
    expect(samples).toEqual(expectedSamples);
    expect(emulator.diagnostics).toEqual(expectedDiagnostics);
  });

  it("replays the startup audio transient exactly", () => {
    const samples: number[] = [];
    const emulator = Emulator.fromRom(
      createTestRom({
        program: [0xa9, 0x40, 0x8d, 0x11, 0x40, 0x4c, 0x05, 0x80],
      }),
      "audio-filter-state.nes",
      { audio: { sampleRate: 44_100, writeSample: (sample) => samples.push(sample) } },
    );
    const snapshot = emulator.captureSaveState();

    emulator.runFrame();
    const expectedSamples = [...samples];
    expect(expectedSamples.length).toBeGreaterThan(0);

    emulator.restoreSaveState(snapshot);
    samples.length = 0;
    emulator.runFrame();

    expect(samples).toEqual(expectedSamples);
  });

  it("rejects reentrant capture from an in-flight audio output callback", () => {
    let emulator: Emulator;
    let captureError: unknown;
    emulator = Emulator.fromRom(createTestRom(), "reentrant-capture.nes", {
      audio: {
        sampleRate: 44_100,
        writeSample: () => {
          if (captureError !== undefined) return;
          try {
            emulator.captureSaveState();
          } catch (error) {
            captureError = error;
          }
        },
      },
    });

    emulator.runFrame();

    expect(captureError).toEqual(
      new Error("Cannot capture or restore save state during an active bus transaction"),
    );
    expect(() => emulator.restoreSaveState(emulator.captureSaveState())).not.toThrow();
  });

  it("restores a snapshot into another instance of the same ROM and retains mapper mirroring", () => {
    const rom = createTestRom({
      mapper: 7,
      prgBanks: 2,
      program: [0xa9, 0x10, 0x8d, 0x01, 0x80, 0x4c, 0x05, 0x80],
    });
    const source = Emulator.fromRom(rom);
    source.runFrame();
    const snapshot = source.captureSaveState();
    const expected = runAndCapture(source, 2);

    const restored = Emulator.fromRom(rom.slice(0));
    restored.restoreSaveState(snapshot);
    expect(restored.cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(runAndCapture(restored, 2)).toEqual(expected);
  });

  it("restores Namco 163 mapper-owned NVRAM and data-port state as one transaction", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        mapper: 19,
        nes2: true,
        submapper: 3,
        prgBanks: 2,
        chrBanks: 1,
        battery: true,
        prgNvRamShift: 0,
        program: [
          0xa9,
          0x02,
          0x8d,
          0x00,
          0xf8, // select internal RAM $02
          0xad,
          0x00,
          0x48, // read
          0x18, // clear carry
          0x69,
          0x01, // increment
          0x8d,
          0x00,
          0x48, // write
          0x4c,
          0x05,
          0x80,
        ],
      }),
    );
    emulator.runFrame();
    const snapshot = emulator.captureSaveState();
    const savedBattery = emulator.captureBatterySave();
    if (!savedBattery) throw new Error("Expected Namco 163 battery save");

    emulator.runFrame();
    expect(emulator.captureBatterySave()?.revision).toBeGreaterThan(savedBattery.revision);
    emulator.restoreSaveState(snapshot);

    expect(emulator.captureBatterySave()).toEqual(savedBattery);
  });

  it("captures and restores an in-flight sprite DMA transfer", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        program: [0xa9, 0x02, 0x8d, 0x14, 0x40, 0x4c, 0x02, 0x80],
      }),
    );
    emulator.runFrame();
    const snapshot = emulator.captureSaveState();
    expect(snapshot.state.dma.sprite.phase).not.toBe("idle");
    const expected = runAndCapture(emulator, 2);

    emulator.restoreSaveState(snapshot);
    expect(runAndCapture(emulator, 2)).toEqual(expected);
  });

  it("rejects another ROM or region before mutating runtime state", () => {
    const rom = createTestRom({ program: [0xea, 0x4c, 0x00, 0x80] });
    const source = Emulator.fromRom(rom);
    source.runFrame();
    const snapshot = source.captureSaveState();

    const otherRom = Emulator.fromRom(createTestRom({ program: [0x18, 0x4c, 0x00, 0x80] }));
    const beforeOtherRom = otherRom.captureSaveState();
    expect(() => otherRom.restoreSaveState(snapshot)).toThrow(/another ROM/i);
    expect(otherRom.captureSaveState()).toEqual(beforeOtherRom);

    const pal = Emulator.fromRom(rom.slice(0), "pal.nes", {}, { consoleRegion: "pal" });
    const beforePal = pal.captureSaveState();
    expect(() => pal.restoreSaveState(snapshot)).toThrow(/another console region/i);
    expect(pal.captureSaveState()).toEqual(beforePal);
  });

  it("rejects another audio sample rate before mutating runtime state", () => {
    const rom = createTestRom();
    const source = Emulator.fromRom(rom, "source.nes", {
      audio: { sampleRate: 44_100, writeSample: () => undefined },
    });
    const snapshot = source.captureSaveState();
    const target = Emulator.fromRom(rom.slice(0), "target.nes", {
      audio: { sampleRate: 48_000, writeSample: () => undefined },
    });
    const before = target.captureSaveState();

    expect(() => target.restoreSaveState(snapshot)).toThrow(/another audio sample rate/i);
    expect(target.captureSaveState()).toEqual(before);
  });

  it("rolls back every aggregate when a nested snapshot is invalid", () => {
    const emulator = Emulator.fromRom(createTestRom());
    emulator.runFrame();
    const corrupted = structuredClone(emulator.captureSaveState());
    corrupted.state.ram[0] = 0x42;
    (corrupted.state.ppu as { paletteData: Uint8Array }).paletteData = new Uint8Array(1);
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/PPU save state/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects a snapshot whose PPU /NMI output disagrees with the CPU input", () => {
    const emulator = Emulator.fromRom(createTestRom());
    emulator.runFrame();
    const corrupted = structuredClone(emulator.captureSaveState());
    (corrupted.state.ppu as { nmiLineAsserted: boolean }).nmiLineAsserted =
      !corrupted.state.cpu.interrupts.nmiLineAsserted;
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/NMI output disagrees/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects invalid CPU data-bus state transactionally", () => {
    const emulator = Emulator.fromRom(createTestRom());
    const corrupted = structuredClone(emulator.captureSaveState());
    (corrupted.state.cpu as { externalDataBus: number }).externalDataBus = 0x100;
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/data-bus latch/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects an invalid pending controller write transactionally", () => {
    const emulator = Emulator.fromRom(createTestRom());
    const corrupted = structuredClone(emulator.captureSaveState());
    (corrupted.state as { pendingControllerWrite?: number }).pendingControllerWrite = 0x100;
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/pending controller write/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects an invalid APU frame-IRQ clear delay transactionally", () => {
    const emulator = Emulator.fromRom(createTestRom());
    const corrupted = structuredClone(emulator.captureSaveState());
    (corrupted.state.apu as { frameIrqClearDelay: number }).frameIrqClearDelay = 3;
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/frame-IRQ clear delay/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects invalid APU audio-filter history transactionally", () => {
    const emulator = Emulator.fromRom(createTestRom());
    const corrupted = structuredClone(emulator.captureSaveState());
    (
      corrupted.state.apu.audioFilter as {
        highPass90PreviousInput: number;
      }
    ).highPass90PreviousInput = Number.NaN;
    const before = emulator.captureSaveState();

    expect(() => emulator.restoreSaveState(corrupted)).toThrow(/audio filter/i);
    expect(emulator.captureSaveState()).toEqual(before);
  });

  it("rejects unknown state versions", () => {
    const emulator = Emulator.fromRom(createTestRom());
    const snapshot = emulator.captureSaveState();
    expect(snapshot.version).toBe(17);
    const future = { ...snapshot, version: 18 } as unknown as EmulatorSaveState;
    expect(() => emulator.restoreSaveState(future)).toThrow(/format or version/i);
  });

  it("rejects unknown and malformed persisted envelopes before touching runtime state", () => {
    const emulator = Emulator.fromRom(createTestRom());
    emulator.runFrame();
    const before = emulator.captureSaveState();

    for (const invalid of [
      null,
      {},
      { format: "fcemu-state", version: 17 },
      {
        format: "fcemu-state",
        version: 17,
        romIdentity: before.romIdentity,
        consoleRegion: before.consoleRegion,
        state: null,
      },
    ]) {
      expect(() => emulator.restoreSaveState(invalid)).toThrow(/format|malformed/i);
      expect(emulator.captureSaveState()).toEqual(before);
    }
  });
});

function runAndCapture(emulator: Emulator, frames: number) {
  return Array.from({ length: frames }, () => {
    const execution = emulator.runFrame();
    return {
      cpuCycles: execution.cpuCycles,
      frameNumber: execution.frameNumber,
      pixels: execution.frame.toCanvasImageData().slice(),
    };
  });
}
