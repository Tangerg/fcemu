import { describe, expect, it } from "vitest";
import { NametableMirroring } from "../../model/cartridge.js";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { CodemastersMapper } from "./codemasters-mapper.js";

describe("CodemastersMapper", () => {
  it("switches the 16 KiB bank at $8000 and fixes the last bank at $C000", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    for (let bank = 0; bank < 8; bank++) cartridge.prgRom[bank * 0x4000] = 0xa0 + bank;
    const mapper = new CodemastersMapper(cartridge);

    expect(mapper.read(0x8000)).toBe(0xa0); // power-on bank 0
    expect(mapper.read(0xc000)).toBe(0xa7); // fixed final bank

    mapper.write(0xc000, 0x03); // bank register lives at $C000-$FFFF
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0xc000)).toBe(0xa7);
  });

  it("ignores writes below the $C000 bank register", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    for (let bank = 0; bank < 8; bank++) cartridge.prgRom[bank * 0x4000] = 0xa0 + bank;
    const mapper = new CodemastersMapper(cartridge);

    mapper.write(0xc000, 0x03);
    mapper.write(0x8000, 0x05); // not the register range
    expect(mapper.read(0x8000)).toBe(0xa3);
  });

  it("does not apply bus conflicts", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    for (let bank = 0; bank < 8; bank++) cartridge.prgRom[bank * 0x4000] = 0xa0 + bank;
    const mapper = new CodemastersMapper(cartridge);

    // The fixed bank at $C000 holds 0xa7, yet the full written value still applies.
    mapper.write(0xc000, 0x02);
    expect(mapper.read(0x8000)).toBe(0xa2);
  });

  it("controls single-screen mirroring at $9000 on the BF9097 variant", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    const mapper = new CodemastersMapper(cartridge, true);
    mapper.powerOn();

    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
    mapper.write(0x9000, 0x10); // bit 4 set
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    mapper.write(0x9000, 0x00);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("leaves mirroring fixed on the standard BF9093 variant", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    const mapper = new CodemastersMapper(cartridge);
    const original = cartridge.mirroringMode;

    mapper.write(0x9000, 0x10);
    expect(cartridge.mirroringMode).toBe(original);
  });

  it("round-trips bank selection through save state", () => {
    const cartridge = createTestCartridge({ mapper: 71, prgBanks: 8, chrBanks: 0 });
    const mapper = new CodemastersMapper(cartridge);
    mapper.write(0xc000, 0x05);

    const state = mapper.captureState();
    mapper.powerOn();
    expect(mapper.captureState()).toMatchObject({ selectedPrgBank: 0 });

    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
