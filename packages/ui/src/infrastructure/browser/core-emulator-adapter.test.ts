import { describe, expect, it } from "vitest";
import { ControllerButton } from "@fcemu/core";
import type { EmulatorSaveState } from "@fcemu/core";
import { CoreEmulatorFactory } from "./core-emulator-adapter.js";

describe("CoreEmulatorFactory", () => {
  const factory = new CoreEmulatorFactory(
    { renderFrame: () => undefined },
    { sampleRate: 44_100, writeSample: () => undefined },
  );

  it("lets the cartridge metadata select the region in auto mode", () => {
    const runtime = factory.create(
      { id: "pal", name: "pal.nes", bytes: createLegacyRom("pal") },
      "auto",
    );

    expect(runtime.cartridge.consoleRegion).toBe("pal");
    expect(runtime.frameRateHz).toBeCloseTo(50.007, 3);
  });

  it("overrides cartridge metadata for an explicit region preference", () => {
    const runtime = factory.create(
      { id: "pal", name: "pal.nes", bytes: createLegacyRom("pal") },
      "dendy",
    );

    expect(runtime.cartridge.consoleRegion).toBe("dendy");
  });

  it("preserves A and B semantics at the core boundary", () => {
    const runtime = factory.create(
      { id: "controller", name: "controller.nes", bytes: createLegacyRom("ntsc") },
      "auto",
    );

    runtime.setControllerButton(1, "a", true);
    const state = runtime.captureSaveState().data as EmulatorSaveState;

    expect(state.state.controller1.buttons[ControllerButton.A]).toBe(true);
    expect(state.state.controller1.buttons[ControllerButton.B]).toBe(false);
  });

  it("forwards Oeka Kids tablet input without leaking core internals", () => {
    const runtime = factory.create(
      { id: "tablet", name: "tablet.nes", bytes: createOekaKidsRom() },
      "auto",
    );

    runtime.setOekaKidsTabletInput({ x: 120, y: 128, touching: true, clicked: true });
    const state = runtime.captureSaveState().data as EmulatorSaveState;

    expect(runtime.cartridge.defaultExpansionDevice).toBe(0x17);
    expect(state.state.oekaKidsTablet).toMatchObject({
      x: 120,
      y: 128,
      touching: true,
      clicked: true,
    });
  });

  it("keeps core save-state details opaque while preserving deterministic continuation", () => {
    const runtime = factory.create(
      { id: "state", name: "state.nes", bytes: createLegacyRom("ntsc") },
      "auto",
    );
    runtime.runFrame();
    const checkpoint = runtime.captureSaveState();
    runtime.runFrame();
    const expected = runtime.captureSaveState();

    runtime.restoreSaveState(checkpoint);
    runtime.runFrame();
    expect(runtime.captureSaveState()).toEqual(expected);
  });

  it("forwards untyped persisted state to the core validation boundary", () => {
    const runtime = factory.create(
      { id: "invalid-state", name: "invalid-state.nes", bytes: createLegacyRom("ntsc") },
      "auto",
    );

    expect(() => runtime.restoreSaveState({ data: null })).toThrow(/format or version/i);
  });
});

function createLegacyRom(region: "ntsc" | "pal"): ArrayBuffer {
  const headerBytes = 16;
  const prgBytes = 16_384;
  const bytes = new Uint8Array(headerBytes + prgBytes);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, 1, 0]);
  bytes[9] = region === "pal" ? 1 : 0;
  bytes[headerBytes] = 0xea;
  const vectors = bytes.byteLength - 6;
  bytes.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], vectors);
  return bytes.buffer;
}

function createOekaKidsRom(): ArrayBuffer {
  const headerBytes = 16;
  const prgBytes = 8 * 16_384;
  const bytes = new Uint8Array(headerBytes + prgBytes);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, 8, 0, 0x00, 0x60]);
  bytes[headerBytes] = 0xea;
  const vectors = bytes.byteLength - 6;
  bytes.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], vectors);
  return bytes.buffer;
}
