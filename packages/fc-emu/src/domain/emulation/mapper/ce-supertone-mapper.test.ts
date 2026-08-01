import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { CeSupertoneMapper } from "./ce-supertone-mapper.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("CeSupertoneMapper", () => {
  it("selects 32 KiB PRG and 8 KiB CHR banks from the expansion data latch", () => {
    const cartridge = createMapper240Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new CeSupertoneMapper(cartridge);

    mapper.writeCpuExpansion(0x4020, 0x1f);
    expect(mapper.read(0x8000)).toBe(1);
    expect(mapper.read(0x0000)).toBe(15);

    mapper.writeCpuExpansion(0x5fff, 0x32);
    expect(mapper.read(0x9000)).toBe(3);
    expect(mapper.read(0x1fff)).toBe(2);
  });

  it("decodes the complete $4020-$5FFF expansion range and nothing outside it", () => {
    const cartridge = createMapper240Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const memory = new CPUMemory(new Bus(cartridge));

    memory.write(0x401f, 0x30);
    expect(memory.read(0x8000)).toBe(0);

    for (const address of [0x4020, 0x4120, 0x4800, 0x5fff]) {
      memory.write(address, 0x30);
      expect(memory.read(0x8000)).toBe(3);
      memory.write(0x4020, 0);
    }

    memory.write(0x6000, 0x30);
    expect(memory.read(0x6000)).toBe(0x30);
    expect(memory.read(0x8000)).toBe(0);
    memory.write(0x8000, 0x30);
    expect(memory.read(0x8000)).toBe(0);
  });

  it("maps 8 KiB PRG RAM directly and retains header mirroring", () => {
    const cartridge = createMapper240Cartridge();
    const mapper = new CeSupertoneMapper(cartridge);

    mapper.write(0x6000, 0x12);
    mapper.write(0x7fff, 0x34);
    mapper.writeCpuExpansion(0x4800, 0x3f);

    expect(mapper.read(0x6000)).toBe(0x12);
    expect(mapper.read(0x7fff)).toBe(0x34);
    expect(mapper.cpuReadDriveMask(0x5fff)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    expect(cartridge.captureBatterySave()?.data.byteLength).toBe(0x2000);
  });

  it("clears both bank outputs only on power-on and preserves them on warm reset", () => {
    const cartridge = createMapper240Cartridge();
    fillBanks(cartridge.prgRom, 0x8000);
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x4800, 0x31);
    bus.reset();
    expect(memory.read(0x8000)).toBe(3);

    bus.powerOn();
    expect(memory.read(0x8000)).toBe(0);
    expect(bus.Mapper.captureState()).toEqual({
      kind: "ce-supertone-240",
      selectedPrgBank: 0,
      selectedChrBank: 0,
    });
  });

  it("round-trips bank state and rejects impossible state atomically", () => {
    const mapper = new CeSupertoneMapper(createMapper240Cartridge());
    mapper.writeCpuExpansion(0x4800, 0x3f);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, selectedPrgBank: 4 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, selectedChrBank: 16 } as MapperState)).toThrow(
      RangeError,
    );
    expect(mapper.captureState()).toEqual(state);
  });

  it("accepts the physical board layout and rejects unsupported variants and geometry", () => {
    expect(() => createMapper(createMapper240Cartridge(), interruptPort)).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 240,
          nes2: true,
          prgBanks: 8,
          chrBanks: 16,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 240,
          nes2: true,
          submapper: 1,
          prgBanks: 8,
          chrBanks: 16,
          battery: true,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);

    for (const cartridge of [
      createTestCartridge({ mapper: 240, prgBanks: 4, chrBanks: 16, battery: true }),
      createTestCartridge({ mapper: 240, prgBanks: 8, chrBanks: 8, battery: true }),
      createTestCartridge({ mapper: 240, prgBanks: 8, battery: true }),
      createTestCartridge({
        mapper: 240,
        nes2: true,
        prgBanks: 8,
        chrBanks: 16,
        battery: true,
        prgNvRamShift: 6,
      }),
      createTestCartridge({
        mapper: 240,
        nes2: true,
        prgBanks: 8,
        chrBanks: 16,
        battery: true,
        fourScreen: true,
      }),
    ]) {
      expect(() => createMapper(cartridge, interruptPort)).toThrow(
        UnsupportedMapperConfigurationError,
      );
    }
  });
});

function createMapper240Cartridge() {
  return createTestCartridge({ mapper: 240, prgBanks: 8, chrBanks: 16, battery: true });
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
