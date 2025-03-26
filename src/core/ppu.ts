import Bus from "./bus.ts";
import {PPUMemory} from "./memory.ts";
import {Image} from "./image.ts";

class PPU {
    private readonly memory: PPUMemory;
    private readonly bus: Bus;

    public cycle: number = 0;
    public scanLine: number = 0
    public frame: number = 0

    private readonly paletteData: Uint8Array = new Uint8Array(32)
    public readonly nameTableData: Uint8Array = new Uint8Array(2048)
    private readonly oamData: Uint8Array = new Uint8Array(256)

    public front: Image = new Image(256, 240)
    private back: Image = new Image(256, 240)

    private v: number = 0;
    private t: number = 0;
    private x: number = 0;
    private w: number = 0;
    private f: number = 0;

    private register: number = 0;

    private nmiOccurred: boolean = false;
    private nmiOutput: boolean = false;
    private nmiPrevious: boolean = false;
    private nmiDelay: number = 0;

    private nameTableByte: number = 0;
    private attributeTableByte: number = 0;
    private lowTileByte: number = 0;
    private highTileByte: number = 0;

    // 将 tileData 拆分为高低两个 32 位整数
    private tileDataLow: number = 0;
    private tileDataHigh: number = 0;

    private spriteCount: number = 0;
    private readonly spritePatterns: Uint32Array = new Uint32Array(8)
    private readonly spritePositions: Uint8Array = new Uint8Array(8)
    private readonly spritePriorities: Uint8Array = new Uint8Array(8)
    private readonly spriteIndexes: Uint8Array = new Uint8Array(8)

    public flagNameTable: number = 0
    private flagIncrement: number = 0
    private flagSpriteTable: number = 0
    private flagBackgroundTable: number = 0
    private flagSpriteSize: number = 0
    public flagMasterSlave: number = 0

    public flagGrayscale: number = 0
    private flagShowLeftBackground: number = 0
    private flagShowLeftSprites: number = 0
    public flagShowBackground: number = 0
    public flagShowSprites: number = 0
    public flagRedTint: number = 0
    public flagGreenTint: number = 0
    public flagBlueTint: number = 0

    private flagSpriteZeroHit: number = 0
    private flagSpriteOverflow: number = 0

    private oamAddress: number = 0
    private bufferedData: number = 0

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

    public read(address: number): number {
        return this.memory.read(address);
    }

    public write(address: number, value: number): void {
        this.memory.write(address, value);
    }

    public reset() {
        this.cycle = 340
        this.scanLine = 240
        this.frame = 0
        this.writeControl(0)
        this.writeMask(0)
        this.writeOAMAddress(0)
    }

    public readPalette(address: number): number {
        if (address >= 16 && address % 4 == 0) {
            address -= 16
        }
        return this.paletteData[address]
    }

    public writePalette(address: number, value: number) {
        if (address >= 16 && address % 4 == 0) {
            address -= 16
        }
        this.paletteData[address] = value
    }

    public readRegister(address: number): number {
        switch (address) {
            case 0x2002:
                return this.readStatus()
            case 0x2004:
                return this.readOAMData()
            case 0x2007:
                return this.readData()
        }
        return 0
    }

    public writeRegister(address: number, value: number) {
        this.register = value
        switch (address) {
            case 0x2000:
                this.writeControl(value)
                break
            case 0x2001:
                this.writeMask(value)
                break
            case 0x2003:
                this.writeOAMAddress(value)
                break
            case 0x2004:
                this.writeOAMData(value)
                break
            case 0x2005:
                this.writeScroll(value)
                break
            case 0x2006:
                this.writeAddress(value)
                break
            case 0x2007:
                this.writeData(value)
                break
            case 0x4014:
                this.writeDMA(value)
                break
        }
    }

    private writeControl(value: number) {
        this.flagNameTable = (value >> 0) & 3
        this.flagIncrement = (value >> 2) & 1
        this.flagSpriteTable = (value >> 3) & 1
        this.flagBackgroundTable = (value >> 4) & 1
        this.flagSpriteSize = (value >> 5) & 1
        this.flagMasterSlave = (value >> 6) & 1
        this.nmiOutput = (((value >> 7) & 1) == 1)
        this.nmiChange()
        this.t = (this.t & 0xF3FF) | (((value) & 0x03) << 10)
    }

    private nmiChange() {
        const nmi = this.nmiOutput && this.nmiOccurred
        if (nmi && !this.nmiPrevious) {
            this.nmiDelay = 15
        }
        this.nmiPrevious = nmi
    }

    private writeMask(value: number) {
        this.flagGrayscale = (value >> 0) & 1
        this.flagShowLeftBackground = (value >> 1) & 1
        this.flagShowLeftSprites = (value >> 2) & 1
        this.flagShowBackground = (value >> 3) & 1
        this.flagShowSprites = (value >> 4) & 1
        this.flagRedTint = (value >> 5) & 1
        this.flagGreenTint = (value >> 6) & 1
        this.flagBlueTint = (value >> 7) & 1
    }

    private writeOAMAddress(value: number) {
        this.oamAddress = value
    }

    private readStatus() {
        let result = this.register & 0x1F
        result |= this.flagSpriteOverflow << 5
        result |= this.flagSpriteZeroHit << 6
        if (this.nmiOccurred) {
            result |= 1 << 7
        }
        this.nmiOccurred = false
        this.nmiChange()
        this.w = 0
        return result
    }

    private readOAMData() {
        let data = this.oamData[this.oamAddress]
        if ((this.oamAddress & 0x03) === 0x02) {
            data = data & 0xE3
        }
        return data
    }

    private readData() {
        let value = this.read(this.v)
        // emulate buffered reads
        if (this.v % 0x4000 < 0x3F00) {
            const buffered = this.bufferedData
            this.bufferedData = value
            value = buffered
        } else {
            this.bufferedData = this.read(this.v - 0x1000)
        }
        // increment address
        if (this.flagIncrement === 0) {
            this.v += 1
        } else {
            this.v += 32
        }
        return value
    }

    private writeOAMData(value: number) {
        this.oamData[this.oamAddress] = value
        this.oamAddress++
    }

    private writeScroll(value: number) {
        if (this.w === 0) {
            // t: ........ ...HGFED = d: HGFED...
            // x:               CBA = d: .....CBA
            // w:                   = 1
            this.t = (this.t & 0xFFE0) | ((value) >> 3)
            this.x = value & 0x07
            this.w = 1
        } else {
            // t: .CBA..HG FED..... = d: HGFEDCBA
            // w:                   = 0
            this.t = (this.t & 0x8FFF) | (((value) & 0x07) << 12)
            this.t = (this.t & 0xFC1F) | (((value) & 0xF8) << 2)
            this.w = 0
        }
    }

    private writeAddress(value: number) {
        if (this.w === 0) {
            this.t = (this.t & 0x80FF) | (((value) & 0x3F) << 8)
            this.w = 1
        } else {
            this.t = (this.t & 0xFF00) | (value)
            this.v = this.t
            this.w = 0
        }
    }

    private writeData(value: number) {
        this.write(this.v, value)
        if (this.flagIncrement === 0) {
            this.v += 1
        } else {
            this.v += 32
        }
    }

    private writeDMA(value: number) {
        const cpu = this.bus.CPU
        let address = (value) << 8
        for (let i = 0; i < 256; i++) {
            this.oamData[this.oamAddress] = cpu.readByte(address)
            this.oamAddress++
            address++
        }
        cpu.stall += 513
        if (cpu.cpuCycles % 2 === 1) {
            cpu.stall++
        }
    }

    private incrementX() {
        if ((this.v & 0x001F) === 31) {
            this.v &= 0xFFE0
            this.v ^= 0x0400
        } else {
            this.v++
        }
    }

    private incrementY() {
        if ((this.v & 0x7000) !== 0x7000) {
            this.v += 0x1000
        } else {
            this.v &= 0x8FFF
            let y = (this.v & 0x03E0) >> 5
            if (y === 29) {
                y = 0
                this.v ^= 0x0800
            } else if (y === 31) {
                y = 0
            } else {
                y++
            }
            this.v = (this.v & 0xFC1F) | (y << 5)
        }
    }

    private copyX() {
        this.v = (this.v & 0xFBE0) | (this.t & 0x041F)
    }

    private copyY() {
        this.v = (this.v & 0x841F) | (this.t & 0x7BE0)
    }

    private setVerticalBlank() {
        const tmp = this.front
        this.front = this.back
        this.back = tmp
        this.nmiOccurred = true
        this.nmiChange()
    }

    private clearVerticalBlank() {
        this.nmiOccurred = false
        this.nmiChange()
    }

    private fetchNameTableByte() {
        const address = 0x2000 | (this.v & 0x0FFF)
        this.nameTableByte = this.read(address)
    }

    private fetchAttributeTableByte() {
        const v = this.v
        const address = 0x23C0 | (v & 0x0C00) | ((v >> 4) & 0x38) | ((v >> 2) & 0x07)
        const shift = ((v >> 4) & 4) | (v & 2)
        this.attributeTableByte = ((this.read(address) >> shift) & 3) << 2
    }

    private fetchLowTileByte() {
        const fineY = (this.v >> 12) & 7
        const table = this.flagBackgroundTable
        const tile = this.nameTableByte
        const address = 0x1000 * (table) + (tile) * 16 + fineY
        this.lowTileByte = this.read(address)
    }

    private fetchHighTileByte() {
        const fineY = (this.v >> 12) & 7
        const table = this.flagBackgroundTable
        const tile = this.nameTableByte
        const address = 0x1000 * (table) + (tile) * 16 + fineY
        this.highTileByte = this.read(address + 8)
    }

    private storeTileData() {
        let data = 0
        for (let i = 0; i < 8; i++) {
            const a = this.attributeTableByte
            const p1 = (this.lowTileByte & 0x80) >> 7
            const p2 = (this.highTileByte & 0x80) >> 6
            this.lowTileByte <<= 1
            this.highTileByte <<= 1
            data <<= 4
            data |= (a | p1 | p2)
        }

        // 修复精度问题：将data存储到tileDataLow，tileDataHigh没有变化
        this.tileDataLow = data >>> 0;
    }

    private fetchTileData(): number {
        // 修复精度问题：直接返回高32位
        return this.tileDataHigh;
    }

    private backgroundPixel(): number {
        if (this.flagShowBackground === 0) {
            return 0
        }
        const data = this.fetchTileData() >> ((7 - this.x) * 4)
        return data & 0x0F
    }

    private spritePixel(): {
        index: number;
        color: number;
    } {
        if (this.flagShowSprites === 0) {
            return {
                index: 0,
                color: 0
            }
        }
        for (let i = 0; i < this.spriteCount; i++) {
            let offset = (this.cycle - 1) - (this.spritePositions[i])
            if (offset < 0 || offset > 7) {
                continue
            }
            offset = 7 - offset
            const color = ((this.spritePatterns[i] >> (offset * 4)) & 0x0F)
            if (color % 4 === 0) {
                continue
            }
            return {
                index: i,
                color: color
            }
        }
        return {
            index: 0,
            color: 0
        }
    }

    private renderPixel() {
        let x = this.cycle - 1
        let y = this.scanLine
        let background = this.backgroundPixel()
        const pixel = this.spritePixel()
        if (x < 8 && this.flagShowLeftBackground === 0) {
            background = 0
        }
        if (x < 8 && this.flagShowLeftSprites == 0) {
            pixel.color = 0
        }
        let b = background % 4 != 0
        let s = pixel.color % 4 !== 0
        let color: number = 0
        if (!b && !s) {
            color = 0
        } else if (!b && s) {
            color = pixel.color | 0x10
        } else if (b && !s) {
            color = background
        } else {
            if (this.spriteIndexes[pixel.index] === 0 && x < 255) {
                this.flagSpriteZeroHit = 1
            }
            if (this.spritePriorities[pixel.index] == 0) {
                color = pixel.color | 0x10
            } else {
                color = background
            }
        }
        const c = PPU.PALETTE[this.readPalette((color)) % 64]
        this.back.setRGBA(x, y, c)
    }

    private fetchSpritePattern(i: number, row: number): number {
        let tile = this.oamData[i * 4 + 1]
        let attributes = this.oamData[i * 4 + 2]
        let address: number = 0

        if (this.flagSpriteSize === 0) {
            // 8x8 精灵
            if ((attributes & 0x80) === 0x80) {
                row = 7 - row // 垂直翻转
            }
            const table = this.flagSpriteTable
            address = 0x1000 * (table) + (tile) * 16 + (row)
        } else {
            // 8x16 精灵
            // 修正垂直翻转逻辑
            const isBottomTile = row >= 8;
            if ((attributes & 0x80) === 0x80) {
                row = 15 - row // 整体翻转
            }

            const table = tile & 1 // 确定使用哪个模式表
            tile &= 0xFE // 将最低位清零，因为它用于表的选择

            // 确定我们是使用上半部分还是下半部分瓦片
            if (isBottomTile !== (row >= 8)) { // 如果翻转改变了瓦片部分
                tile++; // 使用下一个瓦片
            }

            row = row & 0x7; // 保持行在0-7范围内
            address = 0x1000 * (table) + (tile) * 16 + (row)
        }

        let a = (attributes & 3) << 2
        let lowTileByte = this.read(address)
        let highTileByte = this.read(address + 8)
        let data: number = 0

        for (let i = 0; i < 8; i++) {
            let p1: number, p2: number

            if ((attributes & 0x40) === 0x40) {
                // 水平翻转
                p1 = (lowTileByte & 1) << 0
                p2 = (highTileByte & 1) << 1
                lowTileByte >>= 1
                highTileByte >>= 1
            } else {
                p1 = (lowTileByte & 0x80) >> 7
                p2 = (highTileByte & 0x80) >> 6
                lowTileByte <<= 1
                highTileByte <<= 1
            }
            data <<= 4
            data |= (a | p1 | p2)
        }
        return data
    }

    private evaluateSprites() {
        let h: number
        if (this.flagSpriteSize === 0) {
            h = 8
        } else {
            h = 16
        }
        let count: number = 0
        for (let i = 0; i < 64; i++) {
            const y = this.oamData[i * 4]
            const a = this.oamData[i * 4 + 2]
            const x = this.oamData[i * 4 + 3]
            const row = this.scanLine - (y)
            if (row < 0 || row >= h) {
                continue
            }
            if (count < 8) {
                this.spritePatterns[count] = this.fetchSpritePattern(i, row)
                this.spritePositions[count] = x
                this.spritePriorities[count] = (a >> 5) & 1
                this.spriteIndexes[count] = (i)
            }
            count++
        }
        if (count > 8) {
            count = 8
            this.flagSpriteOverflow = 1
        }
        this.spriteCount = count
    }

    private tick() {
        if (this.nmiDelay > 0) {
            this.nmiDelay--
            if (this.nmiDelay === 0 && this.nmiOutput && this.nmiOccurred) {
                this.bus.CPU.triggerNMI()
            }
        }

        if (this.flagShowBackground !== 0 || this.flagShowSprites !== 0) {
            if (this.f === 1 && this.scanLine === 261 && this.cycle === 339) {
                this.cycle = 0
                this.scanLine = 0
                this.frame++
                this.f ^= 1
                return
            }
        }
        this.cycle++
        if (this.cycle > 340) {
            this.cycle = 0
            this.scanLine++
            if (this.scanLine > 261) {
                this.scanLine = 0
                this.frame++
                this.f ^= 1
            }
        }
    }

    public update() {
        this.tick()

        let renderingEnabled = this.flagShowBackground != 0 || this.flagShowSprites != 0
        let preLine = this.scanLine == 261
        let visibleLine = this.scanLine < 240
        // postLine := ppu.ScanLine == 240
        let renderLine = preLine || visibleLine
        let preFetchCycle = this.cycle >= 321 && this.cycle <= 336
        let visibleCycle = this.cycle >= 1 && this.cycle <= 256
        let fetchCycle = preFetchCycle || visibleCycle

        // background logic
        if (renderingEnabled) {
            if (visibleLine && visibleCycle) {
                this.renderPixel()
            }
            if (renderLine && fetchCycle) {
                this.tileDataHigh = ((this.tileDataHigh << 4) | ((this.tileDataLow >>> 28) & 0xF)) >>> 0;
                this.tileDataLow = (this.tileDataLow << 4) >>> 0;

                switch (this.cycle % 8) {
                    case 1:
                        this.fetchNameTableByte()
                        break
                    case 3:
                        this.fetchAttributeTableByte()
                        break
                    case 5:
                        this.fetchLowTileByte()
                        break
                    case 7:
                        this.fetchHighTileByte()
                        break
                    case 0:
                        this.storeTileData()
                        break
                }
            }
            if (preLine && this.cycle >= 280 && this.cycle <= 304) {
                this.copyY()
            }
            if (renderLine) {
                if (fetchCycle && this.cycle % 8 === 0) {
                    this.incrementX()
                }
                if (this.cycle === 256) {
                    this.incrementY()
                }
                if (this.cycle === 257) {
                    this.copyX()
                }
            }
        }

        // sprite logic
        if (renderingEnabled) {
            if (this.cycle === 257) {
                if (visibleLine) {
                    this.evaluateSprites()
                } else {
                    this.spriteCount = 0
                }
            }
        }

        // vblank logic
        if (this.scanLine === 241 && this.cycle === 1) {
            this.setVerticalBlank()
        }
        if (preLine && this.cycle == 1) {
            this.clearVerticalBlank()
            this.flagSpriteZeroHit = 0
            this.flagSpriteOverflow = 0
        }
    }
}

export default PPU