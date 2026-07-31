import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import type { MapperInterruptPort, MapperState } from "./mapper.js";
import { TaitoTc0690Mapper } from "./taito-tc0690-mapper.js";

describe("TaitoTc0690Mapper", () => {
  it("shares TC0190 banking but moves mirroring to $E000", () => {
    const cartridge = createTestCartridge({ mapper: 48, prgBanks: 8, chrBanks: 8 });
    fillBanks(cartridge.prgRom, 0x2000);
    fillBanks(cartridge.chrRom, 0x0400);
    const mapper = new TaitoTc0690Mapper(noopInterrupt, cartridge, "original");

    mapper.write(0x9ffc, 5); // mirrored $8000
    mapper.write(0x8001, 9);
    mapper.write(0x8002, 3);
    mapper.write(0x8003, 5);
    mapper.write(0xbfff, 17); // mirrored $A003

    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([5, 9, 14, 15]);
    expect(readAt(mapper, [0x0000, 0x0400, 0x0800, 0x0c00, 0x1c00])).toEqual([6, 7, 10, 11, 17]);

    mapper.write(0xe000, 0x40);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
    mapper.write(0xe000, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Vertical);
  });

  it("filters PPU A12 edges and applies the original 22-cycle IRQ delay", () => {
    const assertions: boolean[] = [];
    const mapper = createOriginalMapper(assertions);

    mapper.write(0xc000, 0xfe); // inverted reload = 1
    mapper.write(0xc001, 0);
    mapper.write(0xc002, 0);
    clockQualifiedA12Edge(mapper); // reload 1
    clockQualifiedA12Edge(mapper); // decrement to 0, schedule IRQ

    for (let cycle = 0; cycle < 21; cycle++) mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0xc003, 0);
    expect(assertions.at(-1)).toBe(false);
  });

  it("models submapper 1 counter bias and six-cycle propagation separately", () => {
    const assertions: boolean[] = [];
    const cartridge = createTestCartridge({
      mapper: 48,
      nes2: true,
      submapper: 1,
      prgBanks: 8,
      chrBanks: 8,
    });
    const port: MapperInterruptPort = {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    };
    const mapper = new TaitoTc0690Mapper(port, cartridge, "late");

    mapper.write(0xc000, 0xff); // late revision adds one: reload = 1
    mapper.write(0xc001, 0);
    mapper.write(0xc002, 0);
    clockQualifiedA12Edge(mapper);
    clockQualifiedA12Edge(mapper);

    for (let cycle = 0; cycle < 5; cycle++) mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(false);
    mapper.observeCpuBusCycle(false);
    expect(assertions.at(-1)).toBe(true);
  });

  it("ignores an A12 rise that was not preceded by ten low PPU cycles", () => {
    const assertions: boolean[] = [];
    const mapper = createOriginalMapper(assertions);
    mapper.write(0xc000, 0xff);
    mapper.write(0xc001, 0);
    mapper.write(0xc002, 0);

    for (let cycle = 0; cycle < 9; cycle++) mapper.tickPpu();
    mapper.observePpuAddress(0x1000);
    for (let cycle = 0; cycle < 30; cycle++) mapper.observeCpuBusCycle(false);

    expect(mapper.captureState()).toMatchObject({ counter: 0, irqDelay: 0 });
    expect(assertions.at(-1)).toBe(false);
  });

  it("round-trips bank, edge-detector and pending IRQ state", () => {
    const cartridge = createTestCartridge({ mapper: 48, prgBanks: 8, chrBanks: 8 });
    const mapper = new TaitoTc0690Mapper(noopInterrupt, cartridge, "original");
    mapper.write(0x8000, 5);
    mapper.write(0xa003, 17);
    mapper.write(0xc000, 0xfe);
    mapper.write(0xc001, 0);
    mapper.write(0xc002, 0);
    clockQualifiedA12Edge(mapper);
    clockQualifiedA12Edge(mapper);
    mapper.observeCpuBusCycle(false);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);

    expect(mapper.captureState()).toEqual(state);
    expect(() => mapper.restoreState({ ...state, irqDelay: 23 } as MapperState)).toThrowError(
      RangeError,
    );
  });
});

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

function createOriginalMapper(assertions: boolean[]): TaitoTc0690Mapper {
  const port: MapperInterruptPort = {
    setMapperIrq(asserted) {
      assertions.push(asserted);
    },
  };
  return new TaitoTc0690Mapper(
    port,
    createTestCartridge({ mapper: 48, prgBanks: 8, chrBanks: 8 }),
    "original",
  );
}

function clockQualifiedA12Edge(mapper: TaitoTc0690Mapper): void {
  mapper.observePpuAddress(0x0fff);
  for (let cycle = 0; cycle < 10; cycle++) mapper.tickPpu();
  mapper.observePpuAddress(0x1000);
}

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: { read(address: number): number }, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
