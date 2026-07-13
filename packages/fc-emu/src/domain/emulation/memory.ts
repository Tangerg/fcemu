import type Bus from "./bus.js";

/**
 * CPU内存映射实现
 * NES CPU地址空间: 0x0000-0xFFFF (64KB)
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
   * 从CPU地址空间读取一个字节
   * @param address 16位地址 (0x0000-0xFFFF)
   * @returns 8位数据 (0-255)
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
    // 确保地址是16位无符号整数
    address = address & 0xffff;
    const readWasHalted = this.bus.beginCpuRead(address);
    if (cpuOwnsRead) this.cpuReadWasHalted = readWasHalted;

    // 0x0000-0x1FFF: 内部RAM (2KB，镜像为8KB)
    if (address < 0x2000) {
      return this.readFullyDriven(this.bus.RAM[address % 0x0800], cpuOwnsRead);
    }

    // 0x2000-0x3FFF: PPU寄存器 (8个，镜像多次)
    if (address < 0x4000) {
      return this.readFullyDriven(this.bus.PPU.readRegister(0x2000 + (address % 8)), cpuOwnsRead);
    }

    // 0x4000-0x4017: APU和I/O寄存器
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

    // 0x4018-0x5FFF: 扩展ROM区域 (通常未使用)
    if (address < 0x6000) {
      return this.readOpenBus(cpuOwnsRead);
    }

    // 0x6000-0xFFFF: 卡带空间 (PRG RAM, PRG ROM)
    return this.readFullyDriven(this.bus.Mapper.read(address), cpuOwnsRead);
  }

  /**
   * 向CPU地址空间写入一个字节
   * @param address 16位地址 (0x0000-0xFFFF)
   * @param value 8位数据 (0-255)
   */
  public write(address: number, value: number): void {
    this.bus.beginCpuWrite();
    this.bus.Mapper.observeCpuBusCycle?.(true);
    // 确保地址是16位无符号整数，数据是8位无符号整数
    address = address & 0xffff;
    value = value & 0xff;
    this.internalDataBus = value;
    this.externalDataBus = value;

    // 0x0000-0x1FFF: 内部RAM (2KB，镜像为8KB)
    if (address < 0x2000) {
      this.bus.RAM[address % 0x0800] = value;
      return;
    }

    // 0x2000-0x3FFF: PPU寄存器 (8个，镜像多次)
    if (address < 0x4000) {
      this.bus.PPU.writeRegister(0x2000 + (address % 8), value);
      return;
    }

    // 0x4000-0x4017: APU和I/O寄存器
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

    // 0x4018-0x5FFF: 扩展ROM区域 (通常未使用)
    if (address < 0x6000) {
      // 大多数游戏不使用此区域，写入可能没有效果
      return;
    }

    // 0x6000-0xFFFF: 卡带空间 (PRG RAM, PRG ROM)
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
 * PPU内存映射实现
 * NES PPU地址空间: 0x0000-0x3FFF (16KB)
 */
export class PPUMemory {
  /**
   * 命名表镜像模式查找表
   * 0: 水平镜像 [A, A, B, B]
   * 1: 垂直镜像 [A, B, A, B]
   * 2: 单屏镜像(低) [A, A, A, A]
   * 3: 单屏镜像(高) [B, B, B, B]
   * 4: 四屏镜像 [A, B, C, D] (需要额外硬件支持)
   */
  private static readonly MIRROR_LOOKUP: number[][] = [
    [0, 0, 1, 1], // 水平镜像
    [0, 1, 0, 1], // 垂直镜像
    [0, 0, 0, 0], // 单屏镜像 (低)
    [1, 1, 1, 1], // 单屏镜像 (高)
    [0, 1, 2, 3], // 四屏镜像
  ];

  /**
   * 计算镜像后的命名表地址
   * @param mode 镜像模式
   * @param address 原始地址 (0x2000-0x3EFF)
   * @returns 镜像后的地址
   */
  private static mirrorAddress(mode: number, address: number): number {
    // 将地址范围调整到0x0000-0x0FFF
    address = (address - 0x2000) % 0x1000;
    // 计算命名表索引 (0-3) 和表内偏移
    const table = Math.floor(address / 0x0400);
    const offset = address % 0x0400;
    // 返回镜像后的地址
    return 0x2000 + PPUMemory.MIRROR_LOOKUP[mode][table] * 0x0400 + offset;
  }

  constructor(private readonly bus: Bus) {}

  /**
   * 从PPU地址空间读取一个字节
   * @param address 14位地址 (0x0000-0x3FFF)
   * @returns 8位数据 (0-255)
   */
  public read(address: number, observeMapper = true): number {
    // 确保地址在PPU地址空间范围内 (0x0000-0x3FFF)
    address &= 0x3fff;
    if (observeMapper && this.bus.Mapper.observesPpuAddress) {
      this.bus.Mapper.observePpuAddress(address);
    }

    // 0x0000-0x1FFF: 图案表 (CHR ROM/RAM)
    if (address < 0x2000) {
      return this.bus.Mapper.read(address);
    }

    // 0x2000-0x3EFF: 命名表 (VRAM)
    if (address < 0x3f00) {
      const mode = this.bus.Cartridge.mirroringMode;
      const mirroredAddr = PPUMemory.mirrorAddress(mode, address) - 0x2000;
      return this.bus.PPU.nameTableData[mirroredAddr];
    }

    // 0x3F00-0x3FFF: 调色板 RAM
    return this.bus.PPU.readPalette(address % 32);
  }

  /**
   * 向PPU地址空间写入一个字节
   * @param address 14位地址 (0x0000-0x3FFF)
   * @param value 8位数据 (0-255)
   */
  public write(address: number, value: number): void {
    // 确保地址在PPU地址空间范围内，数据是8位无符号整数
    address &= 0x3fff;
    value = value & 0xff;
    if (this.bus.Mapper.observesPpuAddress) this.bus.Mapper.observePpuAddress(address);

    // 0x0000-0x1FFF: 图案表 (CHR ROM/RAM)
    if (address < 0x2000) {
      this.bus.Mapper.write(address, value);
      return;
    }

    // 0x2000-0x3EFF: 命名表 (VRAM)
    if (address < 0x3f00) {
      const mode = this.bus.Cartridge.mirroringMode;
      const mirroredAddr = PPUMemory.mirrorAddress(mode, address) - 0x2000;
      this.bus.PPU.nameTableData[mirroredAddr] = value;
      return;
    }

    // 0x3F00-0x3FFF: 调色板 RAM
    this.bus.PPU.writePalette(address % 32, value);
  }
}
