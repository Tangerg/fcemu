import { describe, expect, it } from "vitest";
import { NametableMirroring } from "../../model/cartridge.js";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { Fme7Mapper } from "./fme7-mapper.js";
import type { MapperInterruptPort } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

function command(mapper: Fme7Mapper, cmd: number, value: number) {
  mapper.write(0x8000, cmd); // command register
  mapper.write(0xa000, value); // parameter register
}

describe("Fme7Mapper", () => {
  it("banks three 8 KiB PRG windows and fixes $E000 to the last bank", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 4 });
    for (let b = 0; b < 16; b++) cartridge.prgRom[b * 0x2000] = 0xa0 + b;
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);

    expect(mapper.read(0xe000)).toBe(0xa0 + 15);
    command(mapper, 0x09, 3); // $8000 <- bank 3
    command(mapper, 0x0a, 5); // $A000 <- bank 5
    command(mapper, 0x0b, 7); // $C000 <- bank 7
    expect(mapper.read(0x8000)).toBe(0xa3);
    expect(mapper.read(0xa000)).toBe(0xa5);
    expect(mapper.read(0xc000)).toBe(0xa7);
    expect(mapper.read(0xe000)).toBe(0xa0 + 15);
  });

  it("banks eight 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 8 });
    for (let b = 0; b < 64; b++) cartridge.chrRom.fill(b, b * 0x400, (b + 1) * 0x400);
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);

    for (let i = 0; i < 8; i++) command(mapper, i, 10 + i);
    for (let i = 0; i < 8; i++) expect(mapper.read(i * 0x400)).toBe(10 + i);
  });

  it("maps the $6000-$7FFF window as ROM, enabled RAM or open bus", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 4 });
    for (let b = 0; b < 16; b++) cartridge.prgRom[b * 0x2000] = 0xa0 + b;
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);

    command(mapper, 0x08, 0x04); // bit 6 clear -> PRG ROM bank 4
    expect(mapper.read(0x6000)).toBe(0xa0 + 4);

    command(mapper, 0x08, 0xc0); // bits 6+7 set -> PRG RAM enabled
    mapper.write(0x6000, 0x5a);
    expect(mapper.read(0x6000)).toBe(0x5a);

    command(mapper, 0x08, 0x40); // bit 6 set, bit 7 clear -> RAM disabled
    expect(mapper.read(0x6000)).toBe(0);
    mapper.write(0x6000, 0x33); // ignored while disabled
    command(mapper, 0x08, 0xc0);
    expect(mapper.read(0x6000)).toBe(0x5a);
  });

  it("applies the four nametable mirroring modes", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 4 });
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);

    command(mapper, 0x0c, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    command(mapper, 0x0c, 1);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    command(mapper, 0x0c, 2);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenLower);
    command(mapper, 0x0c, 3);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.SingleScreenUpper);
  });

  it("fires a cycle-counted IRQ when the counter wraps past zero and acknowledges it", () => {
    const asserts: boolean[] = [];
    const port: MapperInterruptPort = {
      setMapperIrq(value) {
        asserts.push(value);
      },
    };
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 4 });
    const mapper = new Fme7Mapper(port, cartridge);

    command(mapper, 0x0e, 3); // counter low = 3
    command(mapper, 0x0f, 0); // counter high = 0
    command(mapper, 0x0d, 0x81); // enable counter (bit 7) and IRQ (bit 0)

    for (let i = 0; i < 3; i++) mapper.observeCpuBusCycle(false); // 3 -> 2 -> 1 -> 0
    expect(asserts.at(-1)).toBe(false);

    mapper.observeCpuBusCycle(false); // 0 -> 0xFFFF wraps -> IRQ
    expect(asserts.at(-1)).toBe(true);

    command(mapper, 0x0d, 0x81); // any write to $0D acknowledges the IRQ
    expect(asserts.at(-1)).toBe(false);
  });

  it("does not count while the counter is disabled", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 4 });
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);
    command(mapper, 0x0e, 1);
    command(mapper, 0x0f, 0);
    command(mapper, 0x0d, 0x01); // IRQ enabled but counter disabled (bit 7 clear)

    for (let i = 0; i < 8; i++) mapper.observeCpuBusCycle(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqPending: false });
  });

  it("round-trips banking, mirroring and IRQ state through save state", () => {
    const cartridge = createTestCartridge({ mapper: 69, prgBanks: 8, chrBanks: 8 });
    const mapper = new Fme7Mapper(noopInterrupt, cartridge);
    command(mapper, 0x03, 12);
    command(mapper, 0x09, 4);
    command(mapper, 0x08, 0xc0);
    command(mapper, 0x0c, 2);
    command(mapper, 0x0e, 0x34);
    command(mapper, 0x0f, 0x12);
    command(mapper, 0x0d, 0x81);

    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
  });
});
