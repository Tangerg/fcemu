import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";

const noopInterrupt: MapperInterruptPort = { setMapperIrq() {} };

describe("ConyYokoMapper", () => {
  it("implements the UxROM, mirrored-16K and four-register PRG modes", () => {
    const cartridge = createTestCartridge({
      mapper: 83,
      nes2: true,
      prgBanks: 64,
      chrBanks: 32,
    });
    const mapper = createMapper(cartridge, noopInterrupt);
    fillBanks(cartridge.prgRom, 0x2000);

    mapper.write(0x8000, 0x23);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([70, 94]);

    mapper.write(0x8500, 0x08);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([70, 70]);

    mapper.write(0x8b00, 3);
    mapper.write(0x8b01, 4);
    mapper.write(0x8b02, 5);
    mapper.write(0x8b03, 6);
    mapper.write(0x8900, 0x30);
    expect(readAt(mapper, [0x6000, 0x8000, 0xa000, 0xc000, 0xe000])).toEqual([70, 67, 68, 69, 95]);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0xff);

    mapper.write(0x8100, 0x10);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
  });

  it("uses only CHR registers 0, 1, 6 and 7 as four 2 KiB banks on submapper 1", () => {
    const cartridge = createTestCartridge({
      mapper: 83,
      nes2: true,
      submapper: 1,
      prgBanks: 16,
      chrBanks: 64,
    });
    fillBanks(cartridge.chrRom, 0x0800);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8310, 3);
    mapper.write(0x8311, 4);
    mapper.write(0x8312, 99);
    mapper.write(0x8316, 5);
    mapper.write(0x8317, 6);

    expect(readAt(mapper, [0x0000, 0x0400, 0x0800, 0x1000, 0x1800])).toEqual([3, 3, 4, 5, 6]);
  });

  it("uses submapper 2 outer lines for PRG/CHR and its own banked 32 KiB NVRAM", () => {
    const cartridge = createTestCartridge({
      mapper: 83,
      nes2: true,
      submapper: 2,
      battery: true,
      prgNvRamShift: 9,
      prgBanks: 64,
      chrBanks: 128,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8000, 0x80);
    mapper.write(0x6000, 0x82);
    mapper.write(0x8000, 0x40);
    mapper.write(0x6000, 0x41);
    mapper.write(0x8000, 0x80);
    expect(mapper.read(0x6000)).toBe(0x82);
    mapper.write(0x8000, 0x40);
    expect(mapper.read(0x6000)).toBe(0x41);

    mapper.write(0x8000, 0xa0);
    mapper.write(0x8100, 0x10);
    mapper.write(0x8300, 3);
    expect(mapper.read(0x8000)).toBe(67);

    const chrBank = 2 * 256 + 5;
    cartridge.chrRom[chrBank * 0x0400] = 0xa5;
    mapper.write(0x8310, 5);
    expect(mapper.read(0x0000)).toBe(0xa5);
  });

  it("keeps submapper 3's 128 KiB inner PRG lines separate from its CHR outer lines", () => {
    const cartridge = createTestCartridge({
      mapper: 83,
      nes2: true,
      submapper: 3,
      prgBanks: 64,
      chrBanks: 128,
    });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, noopInterrupt);

    mapper.write(0x8000, 0xa8);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([80, 94]);

    mapper.write(0x8100, 0x10);
    mapper.write(0x8300, 0x1b);
    expect(readAt(mapper, [0x8000, 0xe000])).toEqual([91, 95]);

    const chrBank = 2 * 256 + 7;
    cartridge.chrRom[chrBank * 0x0400] = 0xc7;
    mapper.write(0x8310, 7);
    expect(mapper.read(0x0000)).toBe(0xc7);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0);
  });

  it("decodes mirrored scratch RAM and drives only the solder-pad data lines", () => {
    const cartridge = createTestCartridge({ mapper: 83, prgBanks: 16, chrBanks: 1 });
    const bus = new Bus(cartridge);
    const memory = new CPUMemory(bus);

    memory.write(0x5d13, 0x5a);
    expect(memory.read(0x5113)).toBe(0x5a);

    memory.write(0x0000, 0xff);
    expect(memory.read(0x5000)).toBe(0xfc);
    expect(bus.Mapper.readCpuExpansion?.(0x5000)).toEqual({ value: 0, drivenMask: 3 });

    memory.write(0x0000, 0xa5);
    expect(memory.read(0x5300)).toBe(0xa5);
  });

  it("switches all four nametable arrangements from the mode register", () => {
    const cartridge = createTestCartridge({ mapper: 83, prgBanks: 16, chrBanks: 1 });
    const mapper = createMapper(cartridge, noopInterrupt);
    const modes = [
      NametableMirroring.Vertical,
      NametableMirroring.Horizontal,
      NametableMirroring.SingleScreenLower,
      NametableMirroring.SingleScreenUpper,
    ];

    for (const [value, mode] of modes.entries()) {
      mapper.write(0x8100, value);
      expect(cartridge.mirroringMode).toBe(mode);
    }
  });

  it("increments or decrements the one-shot M2 IRQ counter and acknowledges on LSB writes", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper(createTestCartridge({ mapper: 83, prgBanks: 16, chrBanks: 1 }), {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    });

    mapper.write(0x8100, 0x80);
    mapper.write(0x8200, 0xfe);
    mapper.write(0x8201, 0xff);
    mapper.observeCpuBusCycle?.(false);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);
    expect(mapper.captureState()).toMatchObject({
      irqCounter: 0,
      irqEnabled: false,
      irqPending: true,
    });

    mapper.write(0x8200, 2);
    expect(assertions.at(-1)).toBe(false);
    mapper.write(0x8100, 0xc0);
    mapper.write(0x8201, 0);
    mapper.observeCpuBusCycle?.(false);
    mapper.observeCpuBusCycle?.(false);
    expect(assertions.at(-1)).toBe(true);
  });

  it("clocks the IRQ from unfiltered PPU A12 rises after the documented all-one source write", () => {
    const assertions: boolean[] = [];
    const mapper = createMapper(createTestCartridge({ mapper: 83, prgBanks: 16, chrBanks: 1 }), {
      setMapperIrq(asserted) {
        assertions.push(asserted);
      },
    });
    mapper.write(0x8100, 0xc0);
    mapper.write(0x8318, 0xff);
    mapper.write(0x8200, 2);
    mapper.write(0x8201, 0);

    mapper.observeCpuBusCycle?.(false);
    mapper.observePpuAddress?.(0x0000);
    mapper.observePpuAddress?.(0x1000);
    expect(assertions.at(-1)).toBe(false);
    mapper.observePpuAddress?.(0x0000);
    mapper.observePpuAddress?.(0x1000);
    expect(assertions.at(-1)).toBe(true);

    mapper.write(0x8318, 0x55);
    expect(mapper.captureState()).toMatchObject({ irqSourceA12: true });
    mapper.write(0x8318, 0);
    expect(mapper.captureState()).toMatchObject({ irqSourceA12: false });
  });

  it("round-trips all volatile ASIC state and rejects cross-board or malformed snapshots", () => {
    const cartridge = createTestCartridge({
      mapper: 83,
      nes2: true,
      submapper: 2,
      battery: true,
      prgNvRamShift: 9,
      prgBanks: 16,
      chrBanks: 1,
    });
    const mapper = createMapper(cartridge, noopInterrupt);
    mapper.write(0x8000, 0xe3);
    mapper.write(0x8100, 0xf3);
    mapper.write(0x8301, 7);
    mapper.write(0x8317, 9);
    mapper.write(0x8318, 0xff);
    mapper.write(0x8200, 0x34);
    mapper.write(0x8201, 0x12);
    mapper.writeCpuExpansion?.(0x5102, 0x5a);
    mapper.observePpuAddress?.(0x1000);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);

    expect(() => mapper.restoreState({ ...state, board: "cony-83-3" } as MapperState)).toThrowError(
      RangeError,
    );
    expect(() =>
      mapper.restoreState({ ...state, prgBanks: [0, 0, 0, 32] } as MapperState),
    ).toThrowError(RangeError);
    expect(() =>
      mapper.restoreState({ ...state, scratchRam: new Uint8Array(3) } as MapperState),
    ).toThrowError(RangeError);
  });

  it("accepts only reachable ROM, nametable and RAM geometry for each submapper", () => {
    const valid = [
      { mapper: 83, prgBanks: 16, chrBanks: 1 },
      { mapper: 83, nes2: true, submapper: 1, prgBanks: 16, chrBanks: 1 },
      {
        mapper: 83,
        nes2: true,
        submapper: 2,
        battery: true,
        prgNvRamShift: 9,
        prgBanks: 16,
        chrBanks: 1,
      },
      { mapper: 83, nes2: true, submapper: 3, prgBanks: 8, chrBanks: 1 },
    ] as const;
    for (const options of valid) {
      expect(() => createMapper(createTestCartridge(options), noopInterrupt)).not.toThrow();
    }

    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 83,
          nes2: true,
          submapper: 4,
          prgBanks: 16,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperVariantError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 83,
          nes2: true,
          submapper: 2,
          battery: true,
          prgNvRamShift: 7,
          prgBanks: 16,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 83,
          nes2: true,
          prgRamShift: 7,
          prgBanks: 16,
          chrBanks: 1,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 83,
          nes2: true,
          prgBanks: 16,
          chrBanks: 1,
          fourScreen: true,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 83, nes2: true, prgBanks: 257, chrBanks: 1 }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({ mapper: 83, nes2: true, prgBanks: 16, chrBanks: 33 }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
    expect(() =>
      createMapper(
        createTestCartridge({
          mapper: 83,
          nes2: true,
          submapper: 1,
          prgBanks: 16,
          chrBanks: 65,
        }),
        noopInterrupt,
      ),
    ).toThrowError(UnsupportedMapperConfigurationError);
  });
});

function fillBanks(memory: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < memory.byteLength / bankSize; bank++) {
    memory.fill(bank & 0xff, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Pick<Mapper, "read">, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
