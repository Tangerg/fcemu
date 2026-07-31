import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import type { MapperState } from "./mapper.js";
import { TaitoX1005Mapper } from "./taito-x1-005-mapper.js";

describe("TaitoX1005Mapper", () => {
  it("banks three PRG windows and mixed 2/1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 80, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new TaitoX1005Mapper(cartridge);

    mapper.write(0x7e7a, 4); // CPU A7 is ignored: mirror of $7EFA
    mapper.write(0x7efc, 5);
    mapper.write(0x7eff, 6);
    mapper.write(0x7ef0, 3);
    mapper.write(0x7ef1, 7);
    for (let register = 2; register < 6; register++) {
      mapper.write(0x7ef0 + register, 10 + register);
    }

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([4, 5, 6, 15]);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([3, 4, 7, 8, 12, 13, 14, 15]);
  });

  it("protects and mirrors its 128-byte internal RAM", () => {
    const cartridge = createTestCartridge({ mapper: 80, prgBanks: 8, chrBanks: 4 });
    const mapper = new TaitoX1005Mapper(cartridge);

    mapper.write(0x7f00, 0x11);
    expect(mapper.read(0x7f00)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x7f00)).toBe(0);

    mapper.write(0x7ef8, 0xa3);
    mapper.write(0x7f00, 0x5a);
    expect(mapper.read(0x7f80)).toBe(0x5a);
    expect(mapper.cpuReadDriveMask(0x7fff)).toBe(0xff);

    mapper.write(0x7e79, 0); // mirrored $7EF9 also controls the single permission latch
    expect(mapper.read(0x7f00)).toBe(0);
  });

  it("clears volatile internal RAM on power loss but retains the battery-backed variant", () => {
    for (const battery of [false, true]) {
      const cartridge = createTestCartridge({
        mapper: 80,
        battery,
        prgBanks: 8,
        chrBanks: 4,
      });
      const mapper = new TaitoX1005Mapper(cartridge);
      mapper.write(0x7ef8, 0xa3);
      mapper.write(0x7f00, 0x5a);

      cartridge.powerOn();
      mapper.powerOn();
      mapper.write(0x7ef8, 0xa3);

      expect(mapper.read(0x7f00)).toBe(battery ? 0x5a : 0);
    }
  });

  it("takes horizontal/vertical mirroring from either control-register mirror", () => {
    const cartridge = createTestCartridge({ mapper: 80, prgBanks: 8, chrBanks: 4 });
    const mapper = new TaitoX1005Mapper(cartridge);

    mapper.write(0x7ef6, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    mapper.write(0x7e77, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("round-trips latches while cartridge memory remains separately owned", () => {
    const cartridge = createTestCartridge({ mapper: 80, prgBanks: 8, chrBanks: 8 });
    const mapper = new TaitoX1005Mapper(cartridge);
    mapper.write(0x7efa, 5);
    mapper.write(0x7ef0, 7);
    mapper.write(0x7ef6, 1);
    mapper.write(0x7ef8, 0xa3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({ ...state, ramPermission: 0x100 } as MapperState),
    ).toThrowError(RangeError);
  });
});

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
