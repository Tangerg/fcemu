import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { IremH3001Mapper } from "./irem-h3001-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("IremH3001Mapper", () => {
  it("uses two PRG registers and swaps the first register with the fixed second-last bank", () => {
    const cartridge = createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 4 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new IremH3001Mapper(noopInterrupt, cartridge);

    mapper.write(0x8007, 4);
    mapper.write(0xa003, 5);
    mapper.write(0xc000, 8); // physically unconnected, despite older emulator documents
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([4, 5, 14, 15]);

    mapper.write(0x9000, 0x80);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([14, 5, 4, 15]);
  });

  it("banks eight 1 KiB CHR windows", () => {
    const cartridge = createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new IremH3001Mapper(noopInterrupt, cartridge);

    for (let slot = 0; slot < 8; slot++) mapper.write(0xb000 + slot, 9 + slot);

    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("decodes all four mirroring values, including both encodings of single-screen A", () => {
    const cartridge = createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 4 });
    const mapper = new IremH3001Mapper(noopInterrupt, cartridge);

    const modes = [
      NametableMirroring.Vertical,
      NametableMirroring.SingleScreenLower,
      NametableMirroring.Horizontal,
      NametableMirroring.SingleScreenLower,
    ];
    for (const [value, mode] of modes.entries()) {
      mapper.write(0x9001, value << 6);
      expect(cartridge.mirroringMode).toBe(mode);
    }
  });

  it("maps directly declared PRG RAM through $6000-$7FFF", () => {
    const cartridge = createTestCartridge({
      mapper: 65,
      nes2: true,
      prgBanks: 8,
      chrBanks: 4,
      prgRamShift: 7,
    });
    const mapper = new IremH3001Mapper(noopInterrupt, cartridge);

    mapper.write(0x6000, 0x5a);
    mapper.write(0x7fff, 0xa5);

    expect(mapper.read(0x6000)).toBe(0x5a);
    expect(mapper.read(0x7fff)).toBe(0xa5);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);
  });

  it("fires a one-shot IRQ at zero and acknowledges through $9003/$9004", () => {
    const assertions: boolean[] = [];
    const port: MapperInterruptPort = {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    };
    const mapper = new IremH3001Mapper(
      port,
      createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 4 }),
    );

    mapper.write(0x9005, 0);
    mapper.write(0x9006, 2);
    mapper.write(0x9004, 0);
    mapper.write(0x9003, 0x80);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 0, irqEnabled: false });

    mapper.write(0x9003, 0);
    expect(assertions.at(-1)).toBe(false);
  });

  it("round-trips all reachable state and rejects invalid banks and flags", () => {
    const cartridge = createTestCartridge({ mapper: 65, prgBanks: 8, chrBanks: 8 });
    const mapper = new IremH3001Mapper(noopInterrupt, cartridge);
    mapper.write(0x8000, 5);
    mapper.write(0xb003, 17);
    mapper.write(0x9000, 0x80);
    mapper.write(0x9001, 0x40);
    mapper.write(0x9005, 0x12);
    mapper.write(0x9006, 0x34);
    mapper.write(0x9004, 0);
    mapper.write(0x9003, 0x80);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, prgMode: 2 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({ ...state, chrBanks: [0, 0, 0, 0, 0, 0, 0, 64] } as MapperState),
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
