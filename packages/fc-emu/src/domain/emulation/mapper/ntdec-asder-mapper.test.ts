import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { MapperState } from "./mapper.js";
import { NtdecAsderMapper } from "./ntdec-asder-mapper.js";

const interruptPort = { setMapperIrq() {} };

describe("NtdecAsderMapper", () => {
  it("maps two selected and two fixed 8 KiB PRG windows", () => {
    const cartridge = createTestCartridge({ mapper: 112, prgBanks: 8, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new NtdecAsderMapper(cartridge);

    selectRegister(mapper, 0, 5);
    selectRegister(mapper, 1, 9);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 9, 14, 15]);
  });

  it("maps two paired and four independent 1 KiB CHR register paths", () => {
    const cartridge = createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 32 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new NtdecAsderMapper(cartridge);

    selectRegister(mapper, 2, 3);
    selectRegister(mapper, 3, 6);
    for (let register = 4; register < 8; register++) selectRegister(mapper, register, 8 + register);

    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([2, 3, 6, 7, 12, 13, 14, 15]);
  });

  it("applies separate outer CHR bits only to registers four through seven", () => {
    const cartridge = createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 64 });
    const mapper = new NtdecAsderMapper(cartridge);
    for (let slot = 4; slot < 8; slot++) {
      selectRegister(mapper, slot, 1);
      cartridge.chrRom[1 * 0x0400 + slot] = 0x10 + slot;
      cartridge.chrRom[0x101 * 0x0400 + slot] = 0x80 + slot;
    }

    mapper.write(0xc000, 0x50);

    expect(readAt(mapper, [0x1004, 0x1405, 0x1806, 0x1c07])).toEqual([0x84, 0x15, 0x86, 0x17]);
  });

  it("decodes only even register mirrors and controls horizontal/vertical mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 112, prgBanks: 4, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new NtdecAsderMapper(cartridge);

    mapper.write(0x8001, 1);
    mapper.write(0xa001, 3);
    expect(mapper.read(0x8000)).toBe(0);

    mapper.write(0x9ffe, 0);
    mapper.write(0xbffe, 3);
    mapper.write(0xfffe, 1);
    expect(mapper.read(0x8000)).toBe(3);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(0xe000, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("power-on clears registers and establishes vertical mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 1 });
    const mapper = new NtdecAsderMapper(cartridge);
    selectRegister(mapper, 7, 0xff);
    mapper.write(0xc000, 0xff);
    mapper.write(0xe000, 1);

    mapper.powerOn();

    expect(mapper.captureState()).toEqual({
      kind: "ntdec-asder",
      currentRegister: 0,
      registers: [0, 0, 0, 0, 0, 0, 0, 0],
      outerChrBank: 0,
      mirroring: NametableMirroring.Vertical,
    });
  });

  it("round-trips state and rejects invalid register or mirroring values", () => {
    const mapper = new NtdecAsderMapper(
      createTestCartridge({ mapper: 112, prgBanks: 8, chrBanks: 32 }),
    );
    selectRegister(mapper, 6, 0x55);
    mapper.write(0xc000, 0x40);
    mapper.write(0xe000, 1);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, registers: [0, 0, 0] } as MapperState)).toThrow(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({
        ...state,
        mirroring: NametableMirroring.SingleScreenLower,
      } as MapperState),
    ).toThrow(RangeError);
  });

  it("keeps the absent PRG-RAM range electrically open", () => {
    const mapper = new NtdecAsderMapper(
      createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 1 }),
    );

    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x8000)).toBe(0xff);
  });

  it("accepts documented bank geometry and fails closed on unsupported hardware", () => {
    expect(() =>
      createMapper(createTestCartridge({ mapper: 112, prgBanks: 8, chrBanks: 32 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(createTestCartridge({ mapper: 112, prgBanks: 8, chrBanks: 64 }), interruptPort),
    ).not.toThrow();
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 112, nes2: true, submapper: 1, chrBanks: 1 }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 112, prgBanks: 10, chrBanks: 1 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 65 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(createTestCartridge({ mapper: 112, prgBanks: 2 }), interruptPort),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 112, prgBanks: 2, chrBanks: 1, fourScreen: true }),
        interruptPort,
      ),
    ).toThrow(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 112,
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

function selectRegister(mapper: NtdecAsderMapper, register: number, value: number): void {
  mapper.write(0x8000, register);
  mapper.write(0xa000, value);
}

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
