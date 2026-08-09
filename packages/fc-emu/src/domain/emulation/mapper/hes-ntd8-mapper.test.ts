import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import { HesNtd8Mapper } from "./hes-ntd8-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("HesNtd8Mapper", () => {
  it("selects all PRG and split-field CHR bank bits and controls mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 113, prgBanks: 16, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = new HesNtd8Mapper(cartridge);
    mapper.powerOn();

    mapper.writeCpuExpansion(0x4100, 0xf5);

    expect(mapper.read(0x8000)).toBe(6);
    expect(mapper.read(0x0000)).toBe(13);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    mapper.writeCpuExpansion(0x5fff, 0x18);
    expect(mapper.read(0x8000)).toBe(3);
    expect(mapper.read(0x0000)).toBe(0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("decodes only expansion addresses with the physical A14/A13/A8 pattern", () => {
    const cartridge = createTestCartridge({ mapper: 113, prgBanks: 16, chrBanks: 16 });
    fillBanks(cartridge.prgRom, 0x8000);
    fillBanks(cartridge.chrRom, 0x2000);
    const memory = new CPUMemory(new Bus(cartridge));

    for (const address of [0x401f, 0x4000, 0x4200, 0x6000]) memory.write(address, 0xf5);
    expect(memory.read(0x8000)).toBe(0);

    memory.write(0x4300, 0xf5);
    expect(memory.read(0x8000)).toBe(6);
  });

  it("keeps expansion reads open bus", () => {
    const mapper = new HesNtd8Mapper(
      createTestCartridge({ mapper: 113, prgBanks: 2, chrBanks: 2 }),
    );

    expect(mapper.cpuReadDriveMask(0x4100)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
  });

  it("power-on clears banks and restores horizontal mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 113, prgBanks: 4, chrBanks: 4 });
    const mapper = new HesNtd8Mapper(cartridge);
    mapper.writeCpuExpansion(0x4100, 0x9b);

    mapper.powerOn();

    expect(mapper.captureState()).toEqual({
      kind: "hes-ntd8",
      selectedPrgBank: 0,
      selectedChrBank: 0,
      mirroring: NametableMirroring.Horizontal,
    });
  });

  it("round-trips state and rejects impossible board state", () => {
    const mapper = new HesNtd8Mapper(
      createTestCartridge({ mapper: 113, prgBanks: 8, chrBanks: 16 }),
    );
    mapper.writeCpuExpansion(0x4100, 0xf5);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() =>
      mapper.restoreState({
        kind: "hes-ntd8",
        selectedPrgBank: 8,
        selectedChrBank: 0,
        mirroring: NametableMirroring.Horizontal,
      }),
    ).toThrow(RangeError);
    expect(() =>
      mapper.restoreState({
        kind: "hes-ntd8",
        selectedPrgBank: 0,
        selectedChrBank: 0,
        mirroring: NametableMirroring.SingleScreenLower,
      }),
    ).toThrow(RangeError);
  });

  it("accepts the documented ROM limits and rejects unsupported board geometry", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 113, prgBanks: 16, chrBanks: 16 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 113, nes2: true, submapper: 1, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 113, prgBanks: 18, chrBanks: 1 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 113, prgRomBytes: 0x18_000, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 113, prgBanks: 2, chrBanks: 17 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 113, prgBanks: 2, chrRomBytes: 0x6000 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() => createMapper(createTestCartridge({ mapper: 113 }), interruptPort)).toThrow(
      UnsupportedMapperConfigurationError,
    );
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 113, chrBanks: 1, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 113,
          nes2: true,
          prgBanks: 2,
          chrBanks: 1,
          prgRamShift: 7,
        }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}
