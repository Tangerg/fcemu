import Cartridge from "../src/domain/model/cartridge.js";

export interface TestRomOptions {
  readonly mapper?: number;
  readonly prgBanks?: number;
  readonly chrBanks?: number;
  readonly fourScreen?: boolean;
  readonly battery?: boolean;
  readonly nes2?: boolean;
  readonly submapper?: number;
  readonly consoleType?: number;
  readonly timingMode?: number;
  readonly prgRamShift?: number;
  readonly prgNvRamShift?: number;
  readonly chrRamShift?: number;
  readonly chrNvRamShift?: number;
  readonly miscellaneousRomCount?: number;
  readonly defaultExpansionDevice?: number;
  readonly trainer?: readonly number[] | boolean;
  readonly program?: readonly number[];
  readonly resetVector?: number;
  readonly nmiVector?: number;
  readonly irqVector?: number;
}

export function createTestRom(options: TestRomOptions = {}): ArrayBuffer {
  const mapper = options.mapper ?? 0;
  const prgBanks = options.prgBanks ?? 1;
  const chrBanks = options.chrBanks ?? 0;
  const trainerSize = options.trainer ? 512 : 0;
  const bytes = new Uint8Array(16 + trainerSize + prgBanks * 16_384 + chrBanks * 8192);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, prgBanks & 0xff, chrBanks & 0xff]);
  bytes[6] =
    ((mapper & 0x0f) << 4) |
    (options.fourScreen ? 0x08 : 0) |
    (options.trainer ? 0x04 : 0) |
    (options.battery ? 0x02 : 0);
  bytes[7] = (mapper & 0xf0) | (options.nes2 ? 0x08 : 0) | ((options.consoleType ?? 0) & 0x03);
  if (options.nes2) {
    bytes[8] = ((options.submapper ?? 0) << 4) | ((mapper >>> 8) & 0x0f);
    bytes[9] = (((chrBanks >>> 8) & 0x0f) << 4) | ((prgBanks >>> 8) & 0x0f);
    const prgRamShift = options.prgRamShift ?? 0;
    const prgNvRamShift = options.prgNvRamShift ?? (options.battery ? 7 : 0);
    const chrRamShift = options.chrRamShift ?? (chrBanks === 0 ? 7 : 0);
    bytes[10] = (prgNvRamShift << 4) | prgRamShift;
    bytes[11] = ((options.chrNvRamShift ?? 0) << 4) | chrRamShift;
    bytes[12] = options.timingMode ?? 0;
    bytes[14] = options.miscellaneousRomCount ?? 0;
    bytes[15] = options.defaultExpansionDevice ?? 0;
  }

  if (options.trainer) {
    const trainer = options.trainer === true ? [] : options.trainer;
    bytes.set(trainer.slice(0, 512), 16);
  }

  const prgOffset = 16 + trainerSize;
  if (prgBanks > 0) {
    bytes.set(options.program ?? [0xea], prgOffset);
    const vectors = prgOffset + prgBanks * 16_384 - 6;
    writeWord(bytes, vectors, options.nmiVector ?? options.resetVector ?? 0x8000);
    writeWord(bytes, vectors + 2, options.resetVector ?? 0x8000);
    writeWord(bytes, vectors + 4, options.irqVector ?? options.resetVector ?? 0x8000);
  }
  return bytes.buffer;
}

export function createTestCartridge(options: TestRomOptions = {}): Cartridge {
  return Cartridge.fromArrayBuffer(createTestRom(options), "test.nes");
}

function writeWord(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}
