import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("Nina0306Mapper", () => {
  it("selects combined PRG and CHR banks through the expansion-area latch", () => {
    const cartridge = createTestCartridge({ mapper: 79, prgBanks: 4, chrBanks: 8 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.writeCpuExpansion?.(0x4100, 0x0d);

    expect(mapper.read(0x8000)).toBe(0x41);
    expect(mapper.read(0)).toBe(0x65);
    expect(mapper.captureState()).toEqual({ kind: "nina-03-06", prgBank: 1, chrBank: 5 });
  });

  it("mirrors the latch decode while ignoring neighboring expansion addresses", () => {
    const cartridge = createTestCartridge({ mapper: 79, prgBanks: 4, chrBanks: 8 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.writeCpuExpansion?.(0x4000, 0x0f);
    expect(mapper.captureState()).toMatchObject({ prgBank: 0, chrBank: 0 });

    mapper.writeCpuExpansion?.(0x5fff, 0x0f);
    expect(mapper.captureState()).toMatchObject({ prgBank: 1, chrBank: 7 });
    expect(mapper.cpuReadDriveMask?.(0x5fff)).toBe(0);
  });

  it("round-trips latch state and rejects banks outside the physical ROMs", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 79, prgBanks: 4, chrBanks: 8 }),
      interruptPort,
    );
    mapper.writeCpuExpansion?.(0x4100, 0x0b);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, prgBank: 2 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() => mapper.restoreState({ ...state, chrBank: 8 } as MapperState)).toThrowError(
      RangeError,
    );
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < 2; bank++) {
    cartridge.prgRom.fill(0x40 + bank, bank * 0x8000, (bank + 1) * 0x8000);
  }
  for (let bank = 0; bank < 8; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}
