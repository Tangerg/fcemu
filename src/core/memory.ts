import Bus from "./bus.ts";

/**
 * 抽象内存类，为CPU和PPU的内存访问提供基础
 */
abstract class Memory {
    protected readonly bus: Bus;

    protected constructor(bus: Bus) {
        this.bus = bus;
    }

    public abstract read(address: number): number;

    public abstract write(address: number, value: number): void;
}

/**
 * CPU内存映射实现
 * NES CPU地址空间: 0x0000-0xFFFF (64KB)
 */
export class CPUMemory extends Memory {
    constructor(bus: Bus) {
        super(bus);
    }

    /**
     * 从CPU地址空间读取一个字节
     * @param address 16位地址 (0x0000-0xFFFF)
     * @returns 8位数据 (0-255)
     */
    public read(address: number): number {
        // 确保地址是16位无符号整数
        address = address & 0xFFFF;

        // 0x0000-0x1FFF: 内部RAM (2KB，镜像为8KB)
        if (address < 0x2000) {
            return this.bus.RAM[address % 0x0800];
        }

        // 0x2000-0x3FFF: PPU寄存器 (8个，镜像多次)
        if (address < 0x4000) {
            return this.bus.PPU.readRegister(0x2000 + (address % 8));
        }

        // 0x4000-0x4017: APU和I/O寄存器
        if (address >= 0x4000 && address <= 0x4017) {
            if (address === 0x4014) {
                return this.bus.PPU.readRegister(address);
            }
            if (address === 0x4015) {
                return this.bus.APU.readRegister(address);
            }
            if (address === 0x4016) {
                return this.bus.Controller1.currentButton;
            }
            if (address === 0x4017) {
                return this.bus.Controller2.currentButton;
            }
            // 其他APU & I/O寄存器
            return this.bus.APU.readRegister(address);
        }

        // 0x4018-0x5FFF: 扩展ROM区域 (通常未使用)
        if (address < 0x6000) {
            // 大多数游戏不使用此区域，返回开放总线值
            // 真实硬件上，这通常是上次读取的值或固定值
            return 0;
        }

        // 0x6000-0xFFFF: 卡带空间 (PRG RAM, PRG ROM)
        return this.bus.Mapper.read(address);
    }

    /**
     * 向CPU地址空间写入一个字节
     * @param address 16位地址 (0x0000-0xFFFF)
     * @param value 8位数据 (0-255)
     */
    public write(address: number, value: number): void {
        // 确保地址是16位无符号整数，数据是8位无符号整数
        address = address & 0xFFFF;
        value = value & 0xFF;

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
                this.bus.Controller1.strobe = value;
                this.bus.Controller2.strobe = value;
                return;
            }
            // 其他APU & I/O寄存器
            this.bus.APU.writeRegister(address, value);
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
}

/**
 * PPU内存映射实现
 * NES PPU地址空间: 0x0000-0x3FFF (16KB)
 */
export class PPUMemory extends Memory {
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

    constructor(bus: Bus) {
        super(bus);
    }

    /**
     * 从PPU地址空间读取一个字节
     * @param address 14位地址 (0x0000-0x3FFF)
     * @returns 8位数据 (0-255)
     */
    public read(address: number): number {
        // 确保地址在PPU地址空间范围内 (0x0000-0x3FFF)
        address = address % 0x4000;

        // 0x0000-0x1FFF: 图案表 (CHR ROM/RAM)
        if (address < 0x2000) {
            return this.bus.Mapper.read(address);
        }

        // 0x2000-0x3EFF: 命名表 (VRAM)
        if (address < 0x3F00) {
            const mode = this.bus.Cartridge.mirroringMode;
            const mirroredAddr = PPUMemory.mirrorAddress(mode, address) % 2048;
            return this.bus.PPU.nameTableData[mirroredAddr];
        }

        // 0x3F00-0x3FFF: 调色板 RAM
        if (address < 0x4000) {
            return this.bus.PPU.readPalette(address % 32);
        }

        // 不应该到达这里
        return 0;
    }

    /**
     * 向PPU地址空间写入一个字节
     * @param address 14位地址 (0x0000-0x3FFF)
     * @param value 8位数据 (0-255)
     */
    public write(address: number, value: number): void {
        // 确保地址在PPU地址空间范围内，数据是8位无符号整数
        address = address % 0x4000;
        value = value & 0xFF;

        // 0x0000-0x1FFF: 图案表 (CHR ROM/RAM)
        if (address < 0x2000) {
            this.bus.Mapper.write(address, value);
            return;
        }

        // 0x2000-0x3EFF: 命名表 (VRAM)
        if (address < 0x3F00) {
            const mode = this.bus.Cartridge.mirroringMode;
            const mirroredAddr = PPUMemory.mirrorAddress(mode, address) % 2048;
            this.bus.PPU.nameTableData[mirroredAddr] = value;
            return;
        }

        // 0x3F00-0x3FFF: 调色板 RAM
        if (address < 0x4000) {
            this.bus.PPU.writePalette(address % 32, value);
        }
    }
}