import Bus from "./bus.ts";
import {PPUMemory} from "./memory.ts";

/**
 * PPU控制寄存器 ($2000) 管理器
 * 负责处理PPU的基本控制设置，如名称表选择、VRAM地址增量等
 */
class Controller {
    public flagNameTable: number = 0;        // 基础名称表地址 (0-3)
    public flagIncrement: boolean = false;   // VRAM地址增量模式 (0: +1, 1: +32)
    public flagSpriteTable: boolean = false; // 精灵图案表地址 (0: $0000, 1: $1000)
    public flagBackgroundTable: boolean = false; // 背景图案表地址 (0: $0000, 1: $1000)
    public flagSpriteSize: boolean = false;  // 精灵大小 (0: 8x8像素, 1: 8x16像素)
    public flagMasterSlave: boolean = false; // 主/从选择 (0: 读取EXT, 1: 写入EXT)

    set flags(value: number) {
        this.flagNameTable = (value >> 0) & 3
        this.flagIncrement = Boolean((value >> 2) & 1);
        this.flagSpriteTable = Boolean((value >> 3) & 1);
        this.flagBackgroundTable = Boolean((value >> 4) & 1);
        this.flagSpriteSize = Boolean((value >> 5) & 1);
        this.flagMasterSlave = Boolean((value >> 6) & 1);
    }
}

/**
 * PPU渲染控制寄存器 ($2001) 管理器
 * 控制PPU的渲染设置，如显示启用、色彩强调等
 */
class Renderer {
    public flagGrayscale: boolean = false;         // 灰度模式开关
    public flagShowLeftBackground: boolean = false; // 显示最左边8像素的背景
    public flagShowLeftSprites: boolean = false;    // 显示最左边8像素的精灵
    public flagShowBackground: boolean = false;     // 显示背景
    public flagShowSprites: boolean = false;        // 显示精灵
    public flagRedTint: boolean = false;           // 强调红色
    public flagGreenTint: boolean = false;         // 强调绿色
    public flagBlueTint: boolean = false;          // 强调蓝色

    set flags(value: number) {
        this.flagGrayscale = Boolean((value >> 0) & 1)
        this.flagShowLeftBackground = Boolean((value >> 1) & 1)
        this.flagShowLeftSprites = Boolean((value >> 2) & 1)
        this.flagShowBackground = Boolean((value >> 3) & 1)
        this.flagShowSprites = Boolean((value >> 4) & 1)
        this.flagRedTint = Boolean((value >> 5) & 1)
        this.flagGreenTint = Boolean((value >> 6) & 1)
        this.flagBlueTint = Boolean((value >> 7) & 1)
    }

    get flags(): number {
        let value = 0;
        if (this.flagGrayscale) value |= (1 << 0);
        if (this.flagShowLeftBackground) value |= (1 << 1);
        if (this.flagShowLeftSprites) value |= (1 << 2);
        if (this.flagShowBackground) value |= (1 << 3);
        if (this.flagShowSprites) value |= (1 << 4);
        if (this.flagRedTint) value |= (1 << 5);
        if (this.flagGreenTint) value |= (1 << 6);
        if (this.flagBlueTint) value |= (1 << 7);
        return value;
    }
}

/**
 * PPU状态寄存器 ($2002) 管理器
 * 提供PPU的当前状态信息
 */
class Status {
    public flagSpriteZeroHit: boolean = false;  // 精灵0命中标志
    public flagSpriteOverflow: boolean = false;  // 精灵溢出标志
}


/**
 * NMI (Non-Maskable Interrupt) 控制器
 * 管理PPU的不可屏蔽中断信号
 */
class Interrupt {
    public nmiOccurred: boolean = false;  // NMI中断是否发生
    public nmiOutput: boolean = false;    // NMI输出状态
    public nmiPrevious: boolean = false;  // 上一个NMI状态
    public nmiDelay: number = 0;          // NMI延迟计数器
}

/**
 * 背景渲染管理器
 * 处理PPU的背景图案渲染
 */
class BackgroundRenderer {
    private ppu: PPU = null;
    private _nameTableByte: number = 0;      // 名称表字节
    private _attributeTableByte: number = 0;  // 属性表字节
    public lowTileByte: number = 0;        // 图案表低字节
    public highTileByte: number = 0;       // 图案表高字节
    public tileData: number = 0;          // 完整的图块数据

    get nameTableByte(): number {
        return this._nameTableByte;
    }

    set nameTableByte(value: number) {
        const address = 0x2000 | (value & 0x0FFF)
        this._nameTableByte = this.ppu.read(address);
    }

    get attributeTableByte(): number {
        return this._attributeTableByte;
    }

    set attributeTableByte(value: number) {
        const address = 0x23C0 | (value & 0x0C00) | ((value >> 4) & 0x38) | ((value >> 2) & 0x07)
        const shift = ((value >> 4) & 4) | (value & 2)
        this._attributeTableByte = ((this.ppu.read(address) >> shift) & 3) << 2
    }
}


/**
 * 精灵渲染管理器
 * 处理PPU的精灵渲染
 */
class SpriteRenderer {
    public spriteCount: number = 0;                    // 当前扫描线上的精灵数量
    private spritePatterns: Uint32Array = new Uint32Array(8);   // 精灵图案数据
    private spritePositions: Uint8Array = new Uint8Array(8);    // 精灵X坐标
    private spritePriorities: Uint8Array = new Uint8Array(8);   // 精灵优先级
    private spriteIndexes: Uint8Array = new Uint8Array(8);      // 精灵索引

    getPattern(i: number): number {
        return this.spritePatterns[i];
    }

    setPattern(i: number, value: number) {
        this.spritePatterns[i] = value;
    }

    getPosition(i: number): number {
        return this.spritePositions[i];
    }

    setPosition(i: number, value: number) {
        this.spritePositions[i] = value;
    }

    getPrioritie(i: number): number {
        return this.spritePriorities[i];
    }

    setPrioritie(i: number, value: number) {
        this.spritePriorities[i] = (value >> 5) & 1;
    }

    getIndex(i: number): number {
        return this.spriteIndexes[i];
    }

    setIndex(i: number, value: number) {
        this.spriteIndexes[i] = value;
    }
}


/**
 * VRAM地址控制器
 * 管理PPU的VRAM地址生成和更新
 */
class RegisterController {
    public V: number = 0;         // 当前VRAM地址 (15位)
    public T: number = 0;         // 临时VRAM地址 (15位)
    public X: number = 0;         // 精细X滚动值 (3位)
    public W: boolean = false;    // 写入切换标志
    public F: boolean = false;    // 帧标志(奇/偶)
    public register: number = 0
}

/**
 * PPU内存管理器
 * 管理PPU的各种内存缓冲区
 */
class MemoryManager {
    private paletteData: Uint8Array = new Uint8Array(32);    // 调色板数据
    private nameTableData: Uint8Array = new Uint8Array(2048); // 名称表数据
    private _oamData: Uint8Array = new Uint8Array(256);        // 精灵属性内存(OAM)
    public oamAddress: number = 0;                           // OAM当前地址
    public bufferedData: number = 0;                         // 用于缓冲读取

    readPalette(address: number): number {
        if (address >= 16 && address % 4 == 0) {
            address -= 16
        }
        return this.paletteData[address];
    }

    writePalette(address: number, value: number) {
        if (address >= 16 && address % 4 == 0) {
            address -= 16
        }
        this.paletteData[address] = value;
    }

    get oamData(): number {
        let data = this._oamData[this.oamAddress]
        if ((this.oamAddress & 0x03) == 0x02) {
            data = data & 0xE3
        }
        return data
    }

    set oamData(value: number) {
        this._oamData[this.oamAddress] = value;
        this.oamAddress++
    }
}


class PPU {
    private readonly controller: Controller;
    private readonly renderer: Renderer;
    private readonly status: Status;
    private readonly interrupt: Interrupt;
    private readonly background: BackgroundRenderer;
    private readonly sprites: SpriteRenderer;
    private readonly address: RegisterController;
    private readonly bus: Bus
    private readonly memory: PPUMemory

    static readonly PALETTE: number[] = [
        0x666666FF, 0x002A88FF, 0x1412A7FF, 0x3B00A4FF, 0x5C007EFF, 0x6E0040FF, 0x6C0600FF, 0x561D00FF,
        0x333500FF, 0x0B4800FF, 0x005200FF, 0x004F08FF, 0x00404DFF, 0x000000FF, 0x000000FF, 0x000000FF,
        0xADADADFF, 0x155FD9FF, 0x4240FFFF, 0x7527FEFF, 0xA01ACCFF, 0xB71E7BFF, 0xB53120FF, 0x994E00FF,
        0x6B6D00FF, 0x388700FF, 0x0C9300FF, 0x008F32FF, 0x007C8DFF, 0x000000FF, 0x000000FF, 0x000000FF,
        0xFFFEFFFF, 0x64B0FFFF, 0x9290FFFF, 0xC676FFFF, 0xF36AFFFF, 0xFE6ECCFF, 0xFE8170FF, 0xEA9E22FF,
        0xBCBE00FF, 0x88D800FF, 0x5CE430FF, 0x45E082FF, 0x48CDDEFF, 0x4F4F4FFF, 0x000000FF, 0x000000FF,
        0xFFFEFFFF, 0xC0DFFFFF, 0xD3D2FFFF, 0xE8C8FFFF, 0xFBC2FFFF, 0xFEC4EAFF, 0xFECCC5FF, 0xF7D8A5FF,
        0xE4E594FF, 0xCFEF96FF, 0xBDF4ABFF, 0xB3F3CCFF, 0xB5EBF2FF, 0xB8B8B8FF, 0x000000FF, 0x000000FF,
    ]

    constructor(bus: Bus) {
        this.bus = bus;
        this.memory = new PPUMemory(bus)
    }

    /** 当前PPU周期 (0-340) */
    public cycle: number = 0;
    /** 当前扫描线 (0-261, 0-239=可见, 240=后置, 241-260=vblank, 261=预置) */
    public scanline: number = 0;
    /** 帧计数器 */
    public frameCount: number = 0;


    public read(address: number): number {
        return this.memory.read(address);
    }

    public write(address: number, value: number): void {
        this.memory.write(address, value);
    }

    public setMonitor(monitor: (output: number) => void): void {

    }
}

export default PPU