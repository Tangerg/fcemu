import { describe, expect, it } from "vitest";
import { createTestRom } from "../../test-support/rom.js";
import { CartridgeTimingMode, NametableMirroring } from "../domain/model/cartridge.js";
import { Emulator } from "./emulator.js";
import type { UnsupportedMapperError } from "../domain/emulation/mapper/index.js";

describe("Emulator", () => {
  it("boots from the cartridge reset vector before the first frame", () => {
    const emulator = Emulator.fromRom(
      createTestRom({ program: [0x4c, 0x00, 0x80], resetVector: 0x8000 }),
    );
    expect(emulator.diagnostics.programCounter).toBe(0x8000);
    const result = emulator.runFrame();
    expect(result.frameNumber).toBe(1);
    expect(emulator.diagnostics.programCounter).toBe(0x8000);
  });

  it("reports unsupported mapper hardware explicitly", () => {
    expect(() => Emulator.fromRom(createTestRom({ mapper: 99 }))).toThrow(
      expect.objectContaining<Partial<UnsupportedMapperError>>({ mapperNumber: 99 }),
    );
  });

  it("rejects NES 2.0 ROM sizes that violate the selected board layout", () => {
    expect(() => Emulator.fromRom(createTestRom({ nes2: true, mapper: 0, prgBanks: 3 }))).toThrow(
      expect.objectContaining({ mapperNumber: 0, submapperNumber: 0 }),
    );
  });

  it("projects NES 2.0 format, submapper and distinct ROM/RAM capacities", () => {
    const emulator = Emulator.fromRom(
      createTestRom({ nes2: true, mapper: 7, submapper: 1, prgBanks: 2 }),
    );

    expect(emulator.cartridge).toMatchObject({
      format: "nes2",
      mapperNumber: 7,
      submapperNumber: 1,
      consoleRegion: "ntsc",
      prgRomBytes: 32_768,
      chrRomBytes: 0,
      chrRamBytes: 8192,
      chrNvRamBytes: 0,
    });
  });

  it.each([
    [CartridgeTimingMode.Pal, "pal"],
    [CartridgeTimingMode.MultiRegion, "ntsc"],
    [CartridgeTimingMode.Dendy, "dendy"],
  ] as const)("projects timing mode %i as the %s execution region", (timingMode, consoleRegion) => {
    const emulator = Emulator.fromRom(createTestRom({ nes2: true, timingMode }));
    expect(emulator.cartridge).toMatchObject({ timingMode, consoleRegion });
  });

  it("allows callers to override an image's declared execution region", () => {
    const emulator = Emulator.fromRom(
      createTestRom(),
      "legacy-pal-test.nes",
      {},
      {
        consoleRegion: "pal",
      },
    );
    expect(emulator.cartridge).toMatchObject({
      timingMode: CartridgeTimingMode.Ntsc,
      consoleRegion: "pal",
    });
  });

  it.each([
    [CartridgeTimingMode.Pal, 33_247.5],
    [CartridgeTimingMode.Dendy, 35_464],
  ])("keeps timing mode %i CPU/PPU frame clocks synchronized", (timingMode, expectedCycles) => {
    const emulator = Emulator.fromRom(createTestRom({ nes2: true, timingMode }));
    emulator.runFrame();
    const frameCycles = Array.from({ length: 10 }, () => emulator.runFrame().cpuCycles);
    const average = frameCycles.reduce((sum, cycles) => sum + cycles, 0) / frameCycles.length;
    expect(Math.abs(average - expectedCycles)).toBeLessThan(1);
  });

  it("boots CNROM through the public emulator facade and mapper factory", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        mapper: 3,
        chrBanks: 2,
        program: [0xa9, 0x01, 0x8d, 0x01, 0x80, 0x4c, 0x05, 0x80],
      }),
    );

    expect(emulator.cartridge.mapperNumber).toBe(3);
    expect(emulator.runFrame().frameNumber).toBe(1);
    expect(emulator.diagnostics.cpuHalted).toBe(false);
  });

  it.each([
    [1, { prgBanks: 4, chrBanks: 8, prgRamShift: 7 }],
    [2, { prgBanks: 8, chrRamShift: 7 }],
  ] as const)(
    "constructs Mapper 34 submapper %i through the public facade",
    (submapper, layout) => {
      const emulator = Emulator.fromRom(
        createTestRom({ nes2: true, mapper: 34, submapper, ...layout }),
      );

      expect(emulator.cartridge).toMatchObject({ mapperNumber: 34, submapperNumber: submapper });
    },
  );

  it("projects runtime mapper mirroring changes through live cartridge information", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        mapper: 7,
        prgBanks: 2,
        program: [0xa9, 0x10, 0x8d, 0x01, 0x80, 0x4c, 0x05, 0x80],
      }),
    );

    expect(emulator.cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
    emulator.runFrame();
    expect(emulator.cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(emulator.diagnostics.cpuHalted).toBe(false);

    emulator.powerCycle();
    expect(emulator.cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("projects a jammed CPU through diagnostics and clears it on reset", () => {
    const emulator = Emulator.fromRom(createTestRom({ program: [0x02] }));
    emulator.runFrame();
    expect(emulator.diagnostics.cpuHalted).toBe(true);

    emulator.reset();
    expect(emulator.diagnostics.cpuHalted).toBe(false);
  });

  it("captures and restores only battery-backed save RAM", () => {
    const emulator = Emulator.fromRom(createTestRom({ battery: true }));
    const initial = emulator.captureBatterySave();
    expect(initial).toMatchObject({ revision: 0 });
    expect(initial?.data.byteLength).toBe(8192);

    const restored = new Uint8Array(8192);
    restored[0] = 0x42;
    emulator.restoreBatterySave(restored);
    expect(emulator.captureBatterySave()?.data[0]).toBe(0x42);
    emulator.powerCycle();
    expect(emulator.captureBatterySave()?.data[0]).toBe(0x42);

    const withoutBattery = Emulator.fromRom(createTestRom());
    expect(withoutBattery.captureBatterySave()).toBeUndefined();
    expect(() => withoutBattery.restoreBatterySave(restored)).toThrow(/without battery/i);
  });

  it("captures and restores battery-backed CHR memory through the public facade", () => {
    const emulator = Emulator.fromRom(
      createTestRom({
        nes2: true,
        battery: true,
        prgNvRamShift: 0,
        chrRamShift: 0,
        chrNvRamShift: 7,
      }),
    );
    const initial = emulator.captureBatterySave();
    expect(initial?.data).toHaveLength(8192);

    const restored = new Uint8Array(8192);
    restored[0x10] = 0x42;
    emulator.restoreBatterySave(restored);
    expect(emulator.captureBatterySave()?.data[0x10]).toBe(0x42);
    expect(emulator.cartridge).toMatchObject({ chrRamBytes: 0, chrNvRamBytes: 8192 });
  });
});
