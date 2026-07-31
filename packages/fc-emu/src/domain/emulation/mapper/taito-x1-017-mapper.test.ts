import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";
import { TaitoX1017Mapper } from "./taito-x1-017-mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("TaitoX1017Mapper", () => {
  it("uses Mapper 82's historical shifted PRG bank order", () => {
    const cartridge = createX1017Cartridge();
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = new TaitoX1017Mapper(noopInterrupt, cartridge);

    mapper.write(0x7efa, 4 << 2);
    mapper.write(0x7efb, 5 << 2);
    mapper.write(0x7efc, 6 << 2);

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([4, 5, 6, 15]);
  });

  it("aligns 2 KiB CHR registers and inverts the 2/1 KiB halves by mode", () => {
    const cartridge = createX1017Cartridge();
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new TaitoX1017Mapper(noopInterrupt, cartridge);
    mapper.write(0x7ef0, 3);
    mapper.write(0x7ef1, 7);
    for (let register = 2; register < 6; register++) {
      mapper.write(0x7ef0 + register, 10 + register);
    }

    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([2, 3, 6, 7, 12, 13, 14, 15]);

    mapper.write(0x7ef6, 0x03);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
    expect(
      readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1000, 0x1400, 0x1800, 0x1c00]),
    ).toEqual([12, 13, 14, 15, 2, 3, 6, 7]);
  });

  it("protects three independently keyed regions of its 5 KiB NVRAM", () => {
    const cartridge = createX1017Cartridge();
    const mapper = new TaitoX1017Mapper(noopInterrupt, cartridge);
    const addresses = [0x6000, 0x6800, 0x7000] as const;
    const keys = [0xca, 0x69, 0x84] as const;

    for (const address of addresses) {
      mapper.write(address, 0x11);
      expect(mapper.read(address)).toBe(0);
      expect(mapper.cpuReadDriveMask(address)).toBe(0xff);
    }
    for (let region = 0; region < 3; region++) {
      mapper.write(0x7ef7 + region, keys[region]);
      mapper.write(addresses[region], 0x40 + region);
      expect(mapper.read(addresses[region])).toBe(0x40 + region);
    }

    expect(cartridge.captureBatterySave()?.data).toHaveLength(0x1400);
    cartridge.powerOn();
    mapper.powerOn();
    mapper.write(0x7ef7, 0xca);
    expect(mapper.read(0x6000)).toBe(0x40);
  });

  it("pulls otherwise floating CPU reads down to zero", () => {
    const bus = new Bus(createX1017Cartridge());
    const memory = new CPUMemory(bus);

    memory.write(0x0000, 0xff);
    expect(memory.read(0x4000)).toBe(0);
    memory.write(0x0000, 0xff);
    expect(memory.read(0x5000)).toBe(0);
    memory.write(0x0000, 0xff);
    expect(memory.read(0x7400)).toBe(0);
  });

  it("counts the documented reload interval and gates a pending IRQ with the I bit", () => {
    const assertions: boolean[] = [];
    const port: MapperInterruptPort = {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    };
    const mapper = new TaitoX1017Mapper(port, createX1017Cartridge());
    mapper.write(0x7efd, 1);
    mapper.write(0x7efe, 0); // disabled reload: (1 + 2) * 16 = 48
    mapper.write(0x7efe, 3); // counting + IRQ output

    for (let cycle = 0; cycle < 47; cycle++) mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0x7efe, 1);
    expect(assertions.at(-1)).toBe(false);
    mapper.write(0x7efe, 3);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0x7eff, 0);
    expect(assertions.at(-1)).toBe(false);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 32, irqPending: false });
  });

  it("uses the special zero-latch reload values and round-trips IRQ state", () => {
    const cartridge = createX1017Cartridge();
    const mapper = new TaitoX1017Mapper(noopInterrupt, cartridge);
    mapper.write(0x7efd, 0);
    mapper.write(0x7efe, 0);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 17 });
    mapper.write(0x7eff, 0);
    expect(mapper.captureState()).toMatchObject({ irqCounter: 1 });
    mapper.write(0x7efa, 20);
    mapper.write(0x7ef0, 9);
    mapper.write(0x7ef6, 3);
    mapper.write(0x7ef7, 0xca);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, irqCounter: 4113 } as MapperState)).toThrowError(
      RangeError,
    );
  });
});

function createX1017Cartridge() {
  return createTestCartridge({
    mapper: 82,
    battery: true,
    prgBanks: 8,
    chrBanks: 8,
  });
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
