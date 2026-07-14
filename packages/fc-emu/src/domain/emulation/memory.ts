import type Bus from "./bus.js";

/**
 * CPU address-space mapping.
 * NES CPU address space: 0x0000-0xFFFF (64 KiB).
 */
export class CPUMemory {
  private internalDataBus = 0;
  private externalDataBus = 0;
  private cpuReadWasHalted = false;

  constructor(private readonly bus: Bus) {}

  get internalBus(): number {
    return this.internalDataBus;
  }

  get externalBus(): number {
    return this.externalDataBus;
  }

  get lastCpuReadWasHalted(): boolean {
    return this.cpuReadWasHalted;
  }

  restoreDataBuses(internal: number, external: number): void {
    this.internalDataBus = internal;
    this.externalDataBus = external;
  }

  /**
   * Reads one byte from the CPU address space.
   * @param address 16-bit address (0x0000-0xFFFF)
   * @returns 8-bit data (0-255)
   */
  public read(address: number): number {
    return this.readMapped(address, true);
  }

  /** A DMA bus master drives the external pins without changing the CPU's internal bus. */
  public readForDma(address: number): number {
    return this.readMapped(address, false);
  }

  private readMapped(address: number, cpuOwnsRead: boolean): number {
    this.bus.Mapper.observeCpuBusCycle?.(false);
    // Mask to a 16-bit unsigned address.
    address = address & 0xffff;
    const readWasHalted = this.bus.beginCpuRead(address);
    if (cpuOwnsRead) this.cpuReadWasHalted = readWasHalted;

    // 0x0000-0x1FFF: internal RAM (2 KiB, mirrored across 8 KiB).
    if (address < 0x2000) {
      return this.readFullyDriven(this.bus.RAM[address % 0x0800], cpuOwnsRead);
    }

    // 0x2000-0x3FFF: PPU registers (eight registers, repeatedly mirrored).
    if (address < 0x4000) {
      return this.readFullyDriven(this.bus.PPU.readRegister(0x2000 + (address % 8)), cpuOwnsRead);
    }

    // 0x4000-0x4017: APU and I/O registers.
    if (address >= 0x4000 && address <= 0x4017) {
      if (address === 0x4015) {
        // $4015 is internal to the 2A03. Its floating bit comes from the
        // internal CPU bus, and the status read does not drive external pins.
        const value = this.bus.APU.readRegister(address) | (this.internalDataBus & 0x20);
        if (cpuOwnsRead) this.internalDataBus = value;
        return value;
      }
      if (address === 0x4016) {
        return this.readPartiallyDriven(this.bus.Controller1.currentButton, 0x1f, cpuOwnsRead);
      }
      if (address === 0x4017) {
        return this.readPartiallyDriven(this.bus.Controller2.currentButton, 0x1f, cpuOwnsRead);
      }
      // $4000-$4014 are write-only. With CPU test mode disabled, no
      // Control Deck device drives a read from these addresses.
      return this.readOpenBus(cpuOwnsRead);
    }

    // 0x4018-0x5FFF: expansion ROM region (typically unused).
    if (address < 0x6000) {
      return this.readOpenBus(cpuOwnsRead);
    }

    // 0x6000-0xFFFF: cartridge space (PRG RAM, PRG ROM).
    return this.readFullyDriven(this.bus.Mapper.read(address), cpuOwnsRead);
  }

  /**
   * Writes one byte to the CPU address space.
   * @param address 16-bit address (0x0000-0xFFFF)
   * @param value 8-bit data (0-255)
   */
  public write(address: number, value: number): void {
    this.bus.beginCpuWrite();
    this.bus.Mapper.observeCpuBusCycle?.(true);
    // Mask to a 16-bit unsigned address and an 8-bit unsigned value.
    address = address & 0xffff;
    value = value & 0xff;
    this.internalDataBus = value;
    this.externalDataBus = value;

    // 0x0000-0x1FFF: internal RAM (2 KiB, mirrored across 8 KiB).
    if (address < 0x2000) {
      this.bus.RAM[address % 0x0800] = value;
      return;
    }

    // 0x2000-0x3FFF: PPU registers (eight registers, repeatedly mirrored).
    if (address < 0x4000) {
      this.bus.PPU.writeRegister(0x2000 + (address % 8), value);
      return;
    }

    // 0x4000-0x4017: APU and I/O registers.
    if (address >= 0x4000 && address <= 0x4017) {
      if (address === 0x4014) {
        this.bus.PPU.writeRegister(address, value);
        return;
      }
      if (address === 0x4016) {
        this.bus.scheduleControllerWrite(value);
        return;
      }
      this.bus.scheduleApuRegisterWrite(address, value);
      return;
    }

    // 0x4018-0x5FFF: expansion ROM region (typically unused).
    if (address < 0x6000) {
      // Most games do not use this region; writes usually have no effect.
      return;
    }

    // 0x6000-0xFFFF: cartridge space (PRG RAM, PRG ROM).
    this.bus.Mapper.write(address, value);
  }

  private readOpenBus(cpuOwnsRead: boolean): number {
    if (cpuOwnsRead) this.internalDataBus = this.externalDataBus;
    return this.externalDataBus;
  }

  private readFullyDriven(value: number, cpuOwnsRead: boolean): number {
    this.externalDataBus = value & 0xff;
    if (cpuOwnsRead) this.internalDataBus = this.externalDataBus;
    return this.externalDataBus;
  }

  private readPartiallyDriven(value: number, drivenMask: number, cpuOwnsRead: boolean): number {
    this.externalDataBus =
      (this.externalDataBus & (~drivenMask & 0xff)) | (value & drivenMask & 0xff);
    if (cpuOwnsRead) this.internalDataBus = this.externalDataBus;
    return this.externalDataBus;
  }
}

/**
 * PPU address-space mapping.
 * NES PPU address space: 0x0000-0x3FFF (16 KiB).
 */
export class PPUMemory {
  /**
   * Nametable mirroring lookup table.
   * 0: horizontal mirroring   [A, A, B, B]
   * 1: vertical mirroring     [A, B, A, B]
   * 2: single-screen (low)    [A, A, A, A]
   * 3: single-screen (high)   [B, B, B, B]
   * 4: four-screen            [A, B, C, D] (requires extra cartridge hardware)
   */
  private static readonly MIRROR_LOOKUP: number[][] = [
    [0, 0, 1, 1], // horizontal
    [0, 1, 0, 1], // vertical
    [0, 0, 0, 0], // single-screen (low)
    [1, 1, 1, 1], // single-screen (high)
    [0, 1, 2, 3], // four-screen
  ];

  /**
   * Computes the mirrored nametable address.
   * @param mode mirroring mode
   * @param address original address (0x2000-0x3EFF)
   * @returns the mirrored address
   */
  private static mirrorAddress(mode: number, address: number): number {
    // Fold the address into the 0x0000-0x0FFF nametable range.
    address = (address - 0x2000) % 0x1000;
    // Derive the nametable index (0-3) and the in-table offset.
    const table = Math.floor(address / 0x0400);
    const offset = address % 0x0400;
    // Return the mirrored address.
    return 0x2000 + PPUMemory.MIRROR_LOOKUP[mode][table] * 0x0400 + offset;
  }

  constructor(private readonly bus: Bus) {}

  /**
   * Reads one byte from the PPU address space.
   * @param address 14-bit address (0x0000-0x3FFF)
   * @returns 8-bit data (0-255)
   */
  public read(address: number, observeMapper = true): number {
    // Constrain the address to the PPU address space (0x0000-0x3FFF).
    address &= 0x3fff;
    if (observeMapper && this.bus.Mapper.observesPpuAddress) {
      this.bus.Mapper.observePpuAddress(address);
    }

    // 0x0000-0x1FFF: pattern tables (CHR ROM/RAM).
    if (address < 0x2000) {
      return this.bus.Mapper.read(address);
    }

    // 0x2000-0x3EFF: nametables (VRAM).
    if (address < 0x3f00) {
      const mode = this.bus.Cartridge.mirroringMode;
      const mirroredAddr = PPUMemory.mirrorAddress(mode, address) - 0x2000;
      return this.bus.PPU.nameTableData[mirroredAddr];
    }

    // 0x3F00-0x3FFF: palette RAM.
    return this.bus.PPU.readPalette(address % 32);
  }

  /**
   * Writes one byte to the PPU address space.
   * @param address 14-bit address (0x0000-0x3FFF)
   * @param value 8-bit data (0-255)
   */
  public write(address: number, value: number): void {
    // Constrain the address to the PPU address space and the value to 8 bits.
    address &= 0x3fff;
    value = value & 0xff;
    if (this.bus.Mapper.observesPpuAddress) this.bus.Mapper.observePpuAddress(address);

    // 0x0000-0x1FFF: pattern tables (CHR ROM/RAM).
    if (address < 0x2000) {
      this.bus.Mapper.write(address, value);
      return;
    }

    // 0x2000-0x3EFF: nametables (VRAM).
    if (address < 0x3f00) {
      const mode = this.bus.Cartridge.mirroringMode;
      const mirroredAddr = PPUMemory.mirrorAddress(mode, address) - 0x2000;
      this.bus.PPU.nameTableData[mirroredAddr] = value;
      return;
    }

    // 0x3F00-0x3FFF: palette RAM.
    this.bus.PPU.writePalette(address % 32, value);
  }
}
