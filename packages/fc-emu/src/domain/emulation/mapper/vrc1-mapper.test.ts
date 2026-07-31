import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { createMapper } from "./create-mapper.js";
import type { MapperState } from "./mapper.js";
import { UnsupportedMapperConfigurationError } from "./mapper-errors.js";

const interruptPort = { setMapperIrq() {} };

describe("Vrc1Mapper", () => {
  it("maps three switchable 8 KiB PRG windows before the fixed final bank", () => {
    const cartridge = createTestCartridge({ mapper: 75, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x8000, 5);
    mapper.write(0xafff, 7);
    mapper.write(0xc123, 9);

    expect(mapper.read(0x8000)).toBe(0x35);
    expect(mapper.read(0xa000)).toBe(0x37);
    expect(mapper.read(0xc000)).toBe(0x39);
    expect(mapper.read(0xe000)).toBe(0x3f);
  });

  it("combines two CHR low nibbles with the control register's high bits", () => {
    const cartridge = createTestCartridge({ mapper: 75, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x9000, 0x06);
    mapper.write(0xe000, 3);
    mapper.write(0xf000, 10);

    expect(mapper.read(0)).toBe(0x73);
    expect(mapper.read(0x1000)).toBe(0x7a);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);

    mapper.write(0x9000, 1);
    expect(mapper.read(0)).toBe(0x63);
    expect(mapper.read(0x1000)).toBe(0x6a);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("preserves cartridge four-screen VRAM across mirroring writes", () => {
    const cartridge = createTestCartridge({
      mapper: 75,
      prgBanks: 8,
      chrBanks: 16,
      fourScreen: true,
    });
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0x9000, 1);

    expect(cartridge.mirroringMode).toBe(NametableMirroring.FourScreen);
  });

  it("ignores the unassigned $B000 and $D000 register ranges", () => {
    const cartridge = createTestCartridge({ mapper: 75, prgBanks: 8, chrBanks: 16 });
    fillBanks(cartridge);
    const mapper = createMapper(cartridge, interruptPort);

    mapper.write(0xb000, 7);
    mapper.write(0xd000, 9);

    expect(mapper.read(0x8000)).toBe(0x30);
    expect(mapper.read(0xc000)).toBe(0x30);
  });

  it("leaves the absent PRG-RAM window on CPU open bus", () => {
    const bus = new Bus(createTestCartridge({ mapper: 75, prgBanks: 2, chrBanks: 1 }));
    bus.RAM[0] = 0xa5;
    bus.CPU.readByte(0);

    expect(bus.CPU.readByte(0x6000)).toBe(0xa5);
  });

  it("round-trips raw latch state and rejects impossible register values", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 75, prgBanks: 8, chrBanks: 16 }),
      interruptPort,
    );
    mapper.write(0x8000, 5);
    mapper.write(0x9000, 7);
    mapper.write(0xe000, 3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({ ...state, prgBanks: [16, 0, 0] } as MapperState),
    ).toThrowError(RangeError);
  });

  it("rejects oversized ROM and writable CHR configurations", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 75, prgBanks: 16, chrBanks: 1 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 75, prgBanks: 2 }), interruptPort),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(cartridge: ReturnType<typeof createTestCartridge>): void {
  for (let bank = 0; bank < cartridge.prgRom.byteLength / 0x2000; bank++) {
    cartridge.prgRom.fill(0x30 + bank, bank * 0x2000, (bank + 1) * 0x2000);
  }
  for (let bank = 0; bank < cartridge.chrRom.byteLength / 0x1000; bank++) {
    cartridge.chrRom.fill(0x60 + bank, bank * 0x1000, (bank + 1) * 0x1000);
  }
}
