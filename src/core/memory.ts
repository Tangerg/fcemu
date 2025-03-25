import Bus from "./bus.ts";


abstract class Memory {
    protected readonly bus: Bus

    protected constructor(bus: Bus) {
        this.bus = bus;
    }

    public abstract read(address: number): number

    public abstract write(address: number, value: number): void

}

export class CPUMemory extends Memory {
    constructor(bus: Bus) {
        super(bus);
    }

    public read(address: number): number {
        if (address < 0x2000) {
            return this.bus.RAM[address % 0x0800]
        }
        if (address < 0x4000) {
            return this.bus.PPU.read(0x2000 + address % 8)
        }
        if (address === 0x4014) {
            return this.bus.PPU.readRegister(address)
        }
        if (address === 0x4015) {
            return this.bus.APU.readRegister(address)
        }
        if (address === 0x4016) {
            return this.bus.Controller1.currentButton
        }
        if (address === 0x4017) {
            return this.bus.Controller2.currentButton
        }
        if (address >= 0x6000) {
            return this.bus.Mapper.read(address)
        }
        return 0
    }

    public write(address: number, value: number): void {
        if (address < 0x2000) {
            this.bus.RAM[address & 0x0800] = value
            return
        }
        if (address < 0x4000) {
            this.bus.PPU.writeRegister(0x2000 + address % 8, value)
            return
        }
        if (address < 0x4014) {
            this.bus.APU.writeRegister(address, value)
            return
        }
        if (address === 0x4014) {
            this.bus.PPU.write(address, value)
            return
        }
        if (address === 0x4015) {
            this.bus.APU.writeRegister(address, value)
            return
        }
        if (address === 0x4016) {
            this.bus.Controller1.strobe = value
            this.bus.Controller2.strobe = value
            return
        }
        if (address === 0x4017) {
            this.bus.APU.writeRegister(address, value)
            return
        }
        if (address >= 0x6000) {
            this.bus.Mapper.write(address, value)
        }
    }
}

export class PPUMemory extends Memory {
    private static readonly MIRROR_LOOKUP: number[][] = [
        [0, 0, 1, 1],
        [0, 1, 0, 1],
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 1, 2, 3],
    ]

    private static mirrorAddress(mode: number, address: number): number {
        address = (address - 0x2000) % 0x1000
        const table = address / 0x0400
        const offset = address % 0x0400
        return 0x2000 + PPUMemory.MIRROR_LOOKUP[mode][table] * 0x0400 + offset
    }


    constructor(bus: Bus) {
        super(bus);
    }

    public read(address: number): number {
        address = address % 0x4000
        if (address < 0x2000) {
            return this.bus.Mapper.read(address)
        }
        if (address < 0x3F00) {
            const mode = this.bus.Cartridge.mirroringMode
            return this.bus.PPU.nameTableData[PPUMemory.mirrorAddress(mode, address) % 2048]
        }
        if (address === 0x4000) {
            return this.bus.PPU.readPalette(address % 32)
        }
        return 0
    }

    public write(address: number, value: number): void {
        address = address % 0x4000
        if (address < 0x2000) {
            this.bus.Mapper.write(address, value)
            return
        }
        if (address < 0x3F00) {
            const mode = this.bus.Cartridge.mirroringMode
            this.bus.PPU.nameTableData[PPUMemory.mirrorAddress(mode, address) % 2048] = value
            return;
        }
        if (address < 0x4000) {
            this.bus.PPU.writePalette(address % 32, value)
        }
    }
}