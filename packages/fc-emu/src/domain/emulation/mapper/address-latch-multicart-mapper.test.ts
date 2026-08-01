import { describe, expect, it } from "vitest";
import { createTestCartridge, type TestRomOptions } from "../../../../test-support/rom.js";
import { NametableMirroring } from "../../model/cartridge.js";
import Bus from "../bus.js";
import { CPUMemory } from "../memory.js";
import { createMapper } from "./create-mapper.js";
import {
  UnsupportedMapperConfigurationError,
  UnsupportedMapperVariantError,
} from "./mapper-errors.js";
import type { Mapper, MapperState } from "./mapper.js";

describe("address-latch multicarts", () => {
  it("implements all four K-1029 PRG modes and data-driven mirroring", () => {
    const cartridge = createTestCartridge({ mapper: 15, prgBanks: 64 });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([0, 1]);

    mapper.write(0x8001, 0x40 | 0x22);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([0x22, 0x27]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(0x8003, 4);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([4, 4]);
  });

  it("models K-1029 NROM-64 as one mirrored 8 KiB bank", () => {
    const cartridge = createTestCartridge({ mapper: 15, prgBanks: 64 });
    fillBanks(cartridge.prgRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x8002, 0x80 | 3);
    expect(readAt(mapper, [0x8000, 0xa000, 0xc000, 0xe000])).toEqual([7, 7, 7, 7]);
  });

  it("enforces K-1029 CHR-RAM protection only in physical modes 0 and 3", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 15, prgBanks: 64 }),
      silentInterruptPort,
    );

    mapper.write(0x0010, 0x10);
    expect(mapper.read(0x0010)).toBe(0);
    mapper.write(0x8001, 0);
    mapper.write(0x0010, 0x11);
    expect(mapper.read(0x0010)).toBe(0x11);
    mapper.write(0x8003, 0);
    mapper.write(0x0010, 0x12);
    expect(mapper.read(0x0010)).toBe(0x11);
  });

  it("banks both ET-4310 ROM sizes through the shared A14 high line", () => {
    const cartridge = createTestCartridge({ mapper: 225, prgBanks: 128, chrBanks: 128 });
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);
    const address = 0x8000 | 0x4000 | 0x2000 | (5 << 6) | 3;

    mapper.write(address, 0);
    expect(readAt(mapper, [0x8000, 0xc000, 0x0000])).toEqual([68, 69, 67]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(address | 0x1000, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([69, 69]);
  });

  it("exposes mapper 225's optional 74x670 as four mirrored low-nibble registers", () => {
    const bus = new Bus(createTestCartridge({ mapper: 225, prgBanks: 64, chrBanks: 64 }));
    const memory = new CPUMemory(bus);

    memory.write(0x5801, 0xab);
    memory.write(0x5806, 0x0c);
    memory.write(0x0000, 0xa0);
    expect(memory.read(0x5805)).toBe(0xab);
    memory.write(0x0000, 0xa0);
    expect(memory.read(0x5ffe)).toBe(0xac);
  });

  it("implements mapper 227 UNROM, NROM-128 and NROM-256 address equations", () => {
    const cartridge = createTestCartridge({
      mapper: 227,
      nes2: true,
      submapper: 1,
      prgBanks: 64,
    });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);
    const outer5Inner3 = 0x8000 | 0x0100 | 0x0020 | (3 << 2);

    mapper.write(outer5Inner3 | 0x0200 | 0x0002, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([43, 47]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write(outer5Inner3 | 0x0080, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([43, 43]);

    mapper.write(outer5Inner3 | 0x0081, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([42, 43]);
  });

  it("hardwires mapper 227's RPG board to NROM modes", () => {
    const cartridge = createTestCartridge({
      mapper: 227,
      nes2: true,
      submapper: 0,
      prgBanks: 64,
    });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);
    const outer5Inner3WithUnromBits = 0x8000 | 0x0100 | 0x0020 | (3 << 2) | 0x0200;

    mapper.write(outer5Inner3WithUnromBits, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([43, 43]);
  });

  it("applies mapper 227 submapper 2's inner-zero outer-bank rule", () => {
    const cartridge = createTestCartridge({
      mapper: 227,
      nes2: true,
      submapper: 2,
      prgBanks: 64,
    });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);
    const outer5Inner3 = 0x8000 | 0x0100 | 0x0020 | (3 << 2);

    mapper.write(outer5Inner3, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([43, 32]);
  });

  it("separates mapper 227 RPG and multicart CHR write protection", () => {
    const rpg = createMapper(
      createTestCartridge({ mapper: 227, nes2: true, submapper: 0, prgBanks: 64 }),
      silentInterruptPort,
    );
    const multicart = createMapper(
      createTestCartridge({ mapper: 227, nes2: true, submapper: 1, prgBanks: 64 }),
      silentInterruptPort,
    );
    rpg.write(0x8080, 0);
    multicart.write(0x8080, 0);
    rpg.write(0x0010, 0x51);
    multicart.write(0x0010, 0x52);

    expect(rpg.read(0x0010)).toBe(0x51);
    expect(multicart.read(0x0010)).toBe(0);
  });

  it("maps mapper 227 RPG battery WRAM without fabricating it on multicart boards", () => {
    const rpg = createMapper(
      createTestCartridge({ mapper: 227, battery: true, prgBanks: 64 }),
      silentInterruptPort,
    );
    const multicart = createMapper(
      createTestCartridge({ mapper: 227, nes2: true, submapper: 1, prgBanks: 64 }),
      silentInterruptPort,
    );

    rpg.write(0x6000, 0x61);
    multicart.write(0x6000, 0x62);
    expect(rpg.read(0x6000)).toBe(0x61);
    expect(rpg.cpuReadDriveMask?.(0x6000)).toBe(0xff);
    expect(multicart.cpuReadDriveMask?.(0x6000)).toBe(0);
  });

  it("uses mapper 227 submapper 1's unbridged solder-pad value for PRG A3-A0", () => {
    const cartridge = createTestCartridge({
      mapper: 227,
      nes2: true,
      submapper: 1,
      prgBanks: 64,
    });
    for (let index = 0; index < cartridge.prgRom.byteLength; index++) {
      cartridge.prgRom[index] = index & 0x0f;
    }
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x8000, 0);
    expect(mapper.read(0x800f)).toBe(0x0f);
    mapper.write(0x8400, 0);
    expect(mapper.read(0x800f)).toBe(0);
  });

  it("maps Action 52's chip 3 after the absent chip 2 and leaves chip 2 open bus", () => {
    const cartridge = createTestCartridge({ mapper: 228, prgBanks: 96, chrBanks: 64 });
    fillBanks(cartridge.prgRom, 0x4000);
    fillBanks(cartridge.chrRom, 0x2000);
    const mapper = createMapper(cartridge, silentInterruptPort);

    const chip3Page5 = 0x8000 | 0x1800 | (5 << 6) | 0x000a;
    mapper.write(chip3Page5, 3);
    expect(readAt(mapper, [0x8000, 0xc000, 0x0000])).toEqual([68, 69, 43]);

    mapper.write(chip3Page5 | 0x0020 | 0x2000, 3);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([69, 69]);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);

    mapper.write((chip3Page5 & ~0x1800) | 0x1000, 0);
    expect(mapper.cpuReadDriveMask?.(0x8000)).toBe(0);
  });

  it("implements mapper 242's address-derived UNROM and NROM modes", () => {
    const cartridge = createTestCartridge({ mapper: 242, prgBanks: 32 });
    fillBanks(cartridge.prgRom, 0x4000);
    const mapper = createMapper(cartridge, silentInterruptPort);
    const outer8Inner3 = 0x8000 | 0x0020 | 0x000c;
    const modes = [
      ["UNROM fixed inner 0", 0, [11, 8]],
      ["even-bank UNROM fixed inner 0", 0x0001, [10, 8]],
      ["UNROM fixed inner 7", 0x0200, [11, 15]],
      ["even-bank UNROM fixed inner 7", 0x0201, [10, 15]],
      ["NROM-128", 0x0080, [11, 11]],
      ["NROM-256", 0x0081, [10, 11]],
    ] as const;

    for (const [mode, bits, expectedBanks] of modes) {
      mapper.write(outer8Inner3 | bits, 0);
      expect({ mode, banks: readAt(mapper, [0x8000, 0xc000]) }).toEqual({
        mode,
        banks: expectedBanks,
      });
    }

    mapper.write(outer8Inner3 | 0x0002, 0);
    expect(cartridge.mirroringMode).toBe(NametableMirroring.Horizontal);
  });

  it("models mapper 242 multicart CHR protection and unbridged menu pads", () => {
    const cartridge = createTestCartridge({ mapper: 242, prgBanks: 32 });
    for (let index = 0; index < cartridge.prgRom.byteLength; index++) {
      cartridge.prgRom[index] = index & 0x1f;
    }
    const mapper = createMapper(cartridge, silentInterruptPort);

    mapper.write(0x001f, 0x51);
    expect(mapper.read(0x001f)).toBe(0x51);
    expect(mapper.read(0x801f)).toBe(0x1f);

    mapper.write(0x8180, 0);
    mapper.write(0x001f, 0x52);
    expect(mapper.read(0x001f)).toBe(0x51);
    expect(mapper.read(0x801f)).toBe(0);
  });

  it("hardwires mapper 242's battery RPG board to NROM modes and maps WRAM", () => {
    const cartridge = createTestCartridge({ mapper: 242, battery: true, prgBanks: 32 });
    fillBanks(cartridge.prgRom, 0x4000);
    const bus = new Bus(cartridge);
    const mapper = bus.Mapper;

    mapper.write(0x800d, 0);
    expect(readAt(mapper, [0x8000, 0xc000])).toEqual([2, 3]);
    mapper.write(0x6000, 0x61);
    expect(mapper.read(0x6000)).toBe(0x61);
    expect(mapper.cpuReadDriveMask?.(0x6000)).toBe(0xff);

    const state = bus.captureState();
    mapper.powerOn();
    mapper.write(0x6000, 0x71);
    bus.restoreState(state);
    expect(readAt(mapper, [0x8000, 0xc000, 0x6000])).toEqual([2, 3, 0x61]);

    mapper.write(0x8080, 0);
    mapper.write(0x0010, 0x62);
    expect(mapper.read(0x0010)).toBe(0x62);
  });

  it("resets bank latches without clearing mapper 225's warm-reset menu RAM", () => {
    const bus = new Bus(createTestCartridge({ mapper: 225, prgBanks: 64, chrBanks: 64 }));
    bus.Mapper.writeCpuExpansion?.(0x5800, 0x0d);
    bus.Mapper.write(0xf123, 0xaa);

    bus.reset();

    expect(bus.Mapper.captureState()).toMatchObject({
      addressLatch: 0x8000,
      dataLatch: 0,
      nibbleRam: new Uint8Array([0x0d, 0, 0, 0]),
    });
  });

  it("round-trips board latches and nibble RAM with transactional validation", () => {
    const mapper = createMapper(
      createTestCartridge({ mapper: 225, prgBanks: 64, chrBanks: 64 }),
      silentInterruptPort,
    );
    mapper.write(0xe543, 0x92);
    mapper.writeCpuExpansion?.(0x5803, 0x0e);
    const state = mapper.captureState();

    mapper.powerOn();
    mapper.restoreState(state);
    expect(mapper.captureState()).toEqual(state);
    expect(() =>
      mapper.restoreState({ ...state, nibbleRam: new Uint8Array([0, 0, 0, 0x10]) } as MapperState),
    ).toThrowError(RangeError);
  });

  it.each([
    { mapper: 15, prgBanks: 64 },
    { mapper: 225, prgBanks: 64, chrBanks: 64 },
    { mapper: 225, prgBanks: 128, chrBanks: 128 },
    { mapper: 227, nes2: true, submapper: 0, prgBanks: 64 },
    { mapper: 227, nes2: true, submapper: 1, prgBanks: 64 },
    { mapper: 227, nes2: true, submapper: 2, prgBanks: 64 },
    { mapper: 228, prgBanks: 32, chrBanks: 64 },
    { mapper: 228, nes2: true, prgBanks: 96, chrBanks: 64 },
    { mapper: 242, prgBanks: 32 },
    { mapper: 242, battery: true, prgBanks: 32 },
  ])("constructs $mapper/$submapper physical board geometry", (options) => {
    expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).not.toThrow();
  });

  it.each([
    { mapper: 15, nes2: true, submapper: 1, prgBanks: 64 },
    { mapper: 225, nes2: true, submapper: 1, prgBanks: 64, chrBanks: 64 },
    { mapper: 227, nes2: true, submapper: 3, prgBanks: 64 },
    { mapper: 228, nes2: true, submapper: 1, prgBanks: 32, chrBanks: 64 },
    { mapper: 242, nes2: true, submapper: 1, prgBanks: 32 },
  ])("rejects mapper $mapper unallocated submapper $submapper", (options) => {
    expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).toThrowError(
      UnsupportedMapperVariantError,
    );
  });

  it.each([
    {
      name: "K-1029 undersized PRG",
      options: { mapper: 15, prgBanks: 32 },
    },
    {
      name: "K-1029 CHR ROM",
      options: { mapper: 15, prgBanks: 64, chrBanks: 1 },
    },
    {
      name: "ET-4310 mismatched PRG/CHR pair",
      options: { mapper: 225, prgBanks: 64, chrBanks: 128 },
    },
    {
      name: "mapper 227 undersized PRG",
      options: { mapper: 227, prgBanks: 32 },
    },
    {
      name: "mapper 227 multicart battery memory",
      options: {
        mapper: 227,
        nes2: true,
        submapper: 1,
        battery: true,
        prgBanks: 64,
      },
    },
    {
      name: "Active Enterprises invented fourth PRG chip",
      options: { mapper: 228, prgBanks: 128, chrBanks: 64 },
    },
    {
      name: "mapper 242 undersized PRG",
      options: { mapper: 242, prgBanks: 16 },
    },
    {
      name: "mapper 242 CHR ROM",
      options: { mapper: 242, prgBanks: 32, chrBanks: 1 },
    },
    {
      name: "mapper 242 oversized RPG NVRAM",
      options: { mapper: 242, nes2: true, battery: true, prgBanks: 32, prgNvRamShift: 8 },
    },
    {
      name: "four-screen header",
      options: { mapper: 225, prgBanks: 64, chrBanks: 64, fourScreen: true },
    },
  ] satisfies readonly { readonly name: string; readonly options: TestRomOptions }[])(
    "rejects $name",
    ({ options }) => {
      expect(() => createMapper(createTestCartridge(options), silentInterruptPort)).toThrowError(
        UnsupportedMapperConfigurationError,
      );
    },
  );
});

const silentInterruptPort = { setMapperIrq() {} };

function fillBanks(bytes: Uint8Array, bankSize: number): void {
  for (let bank = 0; bank < bytes.byteLength / bankSize; bank++) {
    bytes.fill(bank & 0xff, bank * bankSize, (bank + 1) * bankSize);
  }
}

function readAt(mapper: Mapper, addresses: readonly number[]): number[] {
  return addresses.map((address) => mapper.read(address));
}
