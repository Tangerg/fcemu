import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("Irem78Mapper", () => {
  it("selects PRG, CHR and Cosmo Carrier one-screen mirroring", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 78,
      submapper: 1,
      prgBanks: 8,
      chrBanks: 16,
    });
    fillBanks(cartridge);
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0xab);

    expect(mapper.read(0x8000)).toBe(0x53);
    expect(mapper.read(0xc000)).toBe(0x57);
    expect(mapper.read(0)).toBe(0x6a);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
  });

  it("uses Holy Diver's bit 3 as horizontal/vertical selection", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 78,
      submapper: 3,
      prgBanks: 8,
      chrBanks: 16,
    });
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0x08);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    mapper.write(0x8000, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("resolves the historical iNES alternate-nametable convention explicitly", () => {
    const cosmo = createTestCartridge({
      mapper: 78,
      prgBanks: 8,
      chrBanks: 16,
    });
    const holyDiver = createTestCartridge({
      mapper: 78,
      prgBanks: 8,
      chrBanks: 16,
      fourScreen: true,
    });
    cosmo.prgRom[0] = 0xff;
    holyDiver.prgRom[0] = 0xff;
    const cosmoMapper = createMapper(cosmo, interruptPort);
    const holyDiverMapper = createMapper(holyDiver, interruptPort);

    cosmoMapper.write(0x8000, 0x08);
    holyDiverMapper.write(0x8000, 0x08);

    expect(cosmo.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(holyDiver.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("prefers exact legacy submapper metadata over the historical flag fallback", () => {
    const cosmo = createTestCartridge({
      mapper: 78,
      prgBanks: 8,
      chrBanks: 16,
      fourScreen: true,
    });
    const holyDiver = createTestCartridge({
      mapper: 78,
      prgBanks: 8,
      chrBanks: 16,
    });
    Object.defineProperty(cosmo, "submapperNumber", { value: 1 });
    Object.defineProperty(holyDiver, "submapperNumber", { value: 3 });
    cosmo.prgRom[0] = 0xff;
    holyDiver.prgRom[0] = 0xff;
    const cosmoMapper = createMapper(cosmo, interruptPort);
    const holyDiverMapper = createMapper(holyDiver, interruptPort);

    cosmoMapper.write(0x8000, 0x08);
    holyDiverMapper.write(0x8000, 0x08);

    expect(cosmo.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
    expect(holyDiver.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("applies AND bus conflicts before every register field", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 78,
      submapper: 1,
      prgBanks: 8,
      chrBanks: 16,
    });
    fillBanks(cartridge);
    cartridge.prgRom[0] = 0x11;
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 0xff);

    expect(mapper.read(0x8000)).toBe(0x51);
    expect(mapper.read(0)).toBe(0x61);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
  });

  it("round-trips state and rejects mirroring from the other board wiring", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 78,
      submapper: 3,
      prgBanks: 8,
      chrBanks: 16,
    });
    cartridge.prgRom[0] = 0xff;
    const mapper = createMapper(cartridge, interruptPort);
    mapper.write(0x8000, 0x29);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({
        ...state,
        mirroring: NametableMirroring.SingleScreenLower,
      } as MapperState),
    ).toThrowError(RangeError);
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < 8; bank++) {
    cartridge.prgRom.fill(0x50 + bank, bank * 0x4000, (bank + 1) * 0x4000);
  }
  for (let bank = 0; bank < 16; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
}
