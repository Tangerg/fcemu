import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { JalecoSs8806Mapper } from "./jaleco-ss8806-mapper.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("JalecoSs8806Mapper", () => {
  it("assembles three PRG banks from nibble registers and decodes their mirrors", () => {
    const cartridge = createTestCartridge({ mapper: 18, prgBanks: 32, chrBanks: 1 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);

    writeBank(mapper, 0x8a20, 0x8ff1, 61);
    writeBank(mapper, 0x8a22, 0x8ff3, 34);
    writeBank(mapper, 0x9a20, 0x9ff1, 17);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([61, 34, 17, 63]);
  });

  it("assembles all eight 1 KiB CHR banks through the mirrored register matrix", () => {
    const cartridge = createTestCartridge({ mapper: 18, prgBanks: 2, chrBanks: 32 });
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);

    for (let slot = 0; slot < 8; slot++) {
      const group = 0xa000 + (slot >>> 1) * 0x1000;
      const register = group + ((slot & 1) << 1);
      writeBank(mapper, register + 0x0a0, register + 0x0f1, 0x89 + slot);
    }

    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([0x89, 0x8a, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0x90]);
  });

  it("separates PRG RAM chip enable from write permission", () => {
    const cartridge = createTestCartridge({
      mapper: 18,
      nes2: true,
      prgBanks: 2,
      chrBanks: 1,
      prgRamShift: 7,
    });
    const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);

    mapper.write(0x6000, 0x11);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);

    mapper.write(0x9a22, 1);
    mapper.write(0x6000, 0x22);
    expect(mapper.read(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0xff);

    mapper.write(0x9002, 3);
    mapper.write(0x6000, 0x5a);
    expect(mapper.read(0x6000)).toBe(0x5a);

    mapper.write(0x9002, 2);
    expect(mapper.read(0x6000)).toBe(0);
    expect(mapper.cpuReadDriveMask(0x6000)).toBe(0);
  });

  it("clears volatile PRG RAM on power loss and retains the battery-backed form", () => {
    for (const battery of [false, true]) {
      const cartridge = createTestCartridge({
        mapper: 18,
        battery,
        prgBanks: 2,
        chrBanks: 1,
      });
      const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);
      mapper.write(0x9002, 3);
      mapper.write(0x6000, 0x5a);

      cartridge.powerOn();
      mapper.powerOn();
      mapper.write(0x9002, 3);

      expect(mapper.read(0x6000)).toBe(battery ? 0x5a : 0);
    }
  });

  it("selects horizontal, vertical and both one-screen nametables", () => {
    const cartridge = createTestCartridge({ mapper: 18, prgBanks: 2, chrBanks: 1 });
    const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);
    const modes = [
      NametableMirroring.Horizontal,
      NametableMirroring.Vertical,
      NametableMirroring.SingleScreenLower,
      NametableMirroring.SingleScreenUpper,
    ];

    for (const [value, mode] of modes.entries()) {
      mapper.write(0xfff2, value);
      expect(cartridge.mirroringMode).toBe(mode);
    }
  });

  it("inhibits borrow at the selected counter width and asserts on underflow", () => {
    const assertions: boolean[] = [];
    const port: MapperInterruptPort = {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    };
    const mapper = new JalecoSs8806Mapper(
      port,
      createTestCartridge({ mapper: 18, prgBanks: 2, chrBanks: 1 }),
    );
    writeIrqReload(mapper, 0x1230);
    mapper.write(0xf000, 0);
    mapper.write(0xf001, 0x09);

    mapper.observeCpuBusCycle(false);

    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0x123f,
      irqCounterBits: 4,
      irqPending: true,
    });

    mapper.write(0xfff1, 0x05);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounterBits: 8, irqEnabled: true });
  });

  it("reloads and acknowledges independently from IRQ control", () => {
    const assertions: boolean[] = [];
    const mapper = new JalecoSs8806Mapper(
      {
        setMapperIrq(asserted) {
          assertions.push(asserted);
        },
      },
      createTestCartridge({ mapper: 18, prgBanks: 2, chrBanks: 1 }),
    );
    writeIrqReload(mapper, 1);
    mapper.write(0xf000, 0);
    mapper.write(0xf001, 1);

    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xfff0, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1, irqEnabled: true });
  });

  it("round-trips every hardware latch and rejects impossible state", () => {
    const cartridge = createTestCartridge({ mapper: 18, prgBanks: 8, chrBanks: 8 });
    const mapper = new JalecoSs8806Mapper(noopInterrupt, cartridge);
    writeBank(mapper, 0x8000, 0x8001, 0x2d);
    writeBank(mapper, 0xa000, 0xa001, 0x35);
    mapper.write(0x9002, 3);
    mapper.write(0xf002, 3);
    writeIrqReload(mapper, 0xabcd);
    mapper.write(0xf000, 0);
    mapper.write(0xf001, 3);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, irqCounterBits: 6 } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({ ...state, prgRegisters: [0, 0, 64] } as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, irqEnabled: false, irqPending: true } as MapperState),
    ).toThrowError(RangeError);
  });
});

function writeBank(
  mapper: JalecoSs8806Mapper,
  lowAddress: number,
  highAddress: number,
  bank: number,
): void {
  mapper.write(lowAddress, bank & 0x0f);
  mapper.write(highAddress, bank >>> 4);
}

function writeIrqReload(mapper: JalecoSs8806Mapper, value: number): void {
  for (let nibble = 0; nibble < 4; nibble++) {
    mapper.write(0xe000 + nibble, value >>> (nibble * 4));
  }
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
