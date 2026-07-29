import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Namco118Mapper } from "./namco118-mapper.js";

function bank(mapper: Namco118Mapper, register: number, value: number) {
  mapper.write(0x8000, register); // bank select (even)
  mapper.write(0x8001, value); // bank data (odd)
}

describe("Namco118Mapper", () => {
  it("banks two 8 KiB PRG windows and fixes the final two", () => {
    const cartridge = createTestCartridge({ mapper: 206, prgBanks: 8, chrBanks: 4 });
    for (let b = 0; b < 16; b++) cartridge.prgRom[b * 0x2000] = 0xa0 + b;
    const mapper = new Namco118Mapper(cartridge);

    expect(mapper.read(0xc000)).toBe(0xa0 + 14); // fixed second-to-last
    expect(mapper.read(0xe000)).toBe(0xa0 + 15); // fixed last
    bank(mapper, 6, 3);
    bank(mapper, 7, 5);
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0xa000)).toBe(0xa5);
  });

  it("banks the two 2 KiB and four 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 206, prgBanks: 8, chrBanks: 8 });
    for (let b = 0; b < 64; b++) cartridge.chrRom.fill(b, b * 0x400, (b + 1) * 0x400);
    const mapper = new Namco118Mapper(cartridge);

    bank(mapper, 0, 4); // 2 KiB -> 1 KiB banks 4,5 at $0000/$0400
    bank(mapper, 1, 8); // 2 KiB -> 1 KiB banks 8,9 at $0800/$0C00
    bank(mapper, 2, 20); // 1 KiB at $1000
    bank(mapper, 3, 21);
    bank(mapper, 4, 22);
    bank(mapper, 5, 23);

    expect(mapper.read(0x0000)).toBe(4);
    expect(mapper.read(0x0400)).toBe(5);
    expect(mapper.read(0x0800)).toBe(8);
    expect(mapper.read(0x0c00)).toBe(9);
    expect(mapper.read(0x1000)).toBe(20);
    expect(mapper.read(0x1400)).toBe(21);
    expect(mapper.read(0x1800)).toBe(22);
    expect(mapper.read(0x1c00)).toBe(23);
  });

  it("ignores writes to the $A000-$FFFF range", () => {
    const cartridge = createTestCartridge({ mapper: 206, prgBanks: 8, chrBanks: 4 });
    for (let b = 0; b < 16; b++) cartridge.prgRom[b * 0x2000] = 0xa0 + b;
    const mapper = new Namco118Mapper(cartridge);
    bank(mapper, 6, 3);

    mapper.write(0xa000, 0);
    mapper.write(0xa001, 0);
    mapper.write(0xe000, 0);
    expect(mapper.read(0x8000)).toBe(0xa3);
  });

  it("round-trips bank registers through save state", () => {
    const cartridge = createTestCartridge({ mapper: 206, prgBanks: 8, chrBanks: 8 });
    const mapper = new Namco118Mapper(cartridge);
    bank(mapper, 0, 4);
    bank(mapper, 6, 3);

    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
