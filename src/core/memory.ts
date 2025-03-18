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
            return this.bus.RAM[address & 0x0800]
        }
        if (address < 0x4000) {
            return this.bus.PPU.read(0x2000 + address % 8)
        }
        if (address === 0x4014) {
            return this.bus.PPU.read(address)
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
        return 0
    }

    public write(address: number, value: number): void {
        if (address < 0x2000) {
            this.bus.RAM[address & 0x0800] = value
            return
        }
        if (address < 0x4000) {
            this.bus.PPU.write(0x2000 + address % 8, value)
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
    }
}

export class PPUMemory extends CPUMemory {
    constructor(bus: Bus) {
        super(bus);
    }

    public read(address: number): number {
        address = address % 0x4000

        return 0
    }

    public write(address: number, value: number): void {
        console.log(address, value)
    }
}