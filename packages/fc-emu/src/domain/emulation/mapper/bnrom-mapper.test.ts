import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { createMapper } from "./create-mapper.js";

describe("BNROM mapper", () => {
  it("switches 32 KiB PRG banks through an AND-type bus conflict", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 34,
      submapper: 2,
      prgBanks: 8,
    });
    for (let bank = 0; bank < 4; bank++) {
      cartridge.prgRom.fill(0x10 + bank, bank * 0x8000, (bank + 1) * 0x8000);
    }
    cartridge.prgRom[0] = 0x02;
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x8000, 0x03);

    expect(mapper.read(0x8001)).toBe(0x12);
  });

  it("maps optional Union Bond PRG RAM without treating NINA register addresses specially", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 34,
      submapper: 2,
      prgBanks: 8,
      prgRamShift: 7,
    });
    cartridge.prgRom.fill(0x03, 0, 0x8000);
    for (let bank = 1; bank < 4; bank++) {
      cartridge.prgRom.fill(0x20 + bank, bank * 0x8000, (bank + 1) * 0x8000);
    }
    const mapper = createMapper(cartridge, { setMapperIrq() {} });

    mapper.write(0x7ffd, 0x02);
    expect(mapper.read(0x7ffd)).toBe(0x02);
    expect(mapper.read(0x8000)).toBe(0x03);

    mapper.write(0x8000, 0x02);
    expect(mapper.read(0x8000)).toBe(0x22);
  });

  it("keeps its fixed CHR RAM writable and round-trips its latch state", () => {
    const cartridge = createTestCartridge({
      nes2: true,
      mapper: 34,
      submapper: 2,
      prgBanks: 8,
    });
    cartridge.prgRom[0] = 0x03;
    const mapper = createMapper(cartridge, { setMapperIrq() {} });
    mapper.write(0x0010, 0x7a);
    mapper.write(0x8000, 0x03);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.read(0x0010)).toBe(0x7a);
    expect(mapper.captureState()).toEqual({ kind: "bnrom", selectedPrgBank: 3 });
  });
});
