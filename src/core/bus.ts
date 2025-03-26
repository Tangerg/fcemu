import CPU from "./cpu.ts";
import PPU from "./ppu.ts";
import Controller from "./controller.ts";
import Cartridge from "./cartridge.ts";
import APU from "./apu.ts";
import {Mapper, Mapper4} from "./mapper.ts";

export class Bus {
    private readonly cpu: CPU
    private readonly apu: APU
    private readonly ppu: PPU
    private readonly ram: Uint8Array
    private readonly controller1: Controller
    private readonly controller2: Controller
    private readonly mapper: Mapper
    private readonly cartridge: Cartridge

    constructor(cartridge: Cartridge) {
        this.cartridge = cartridge;
        this.ram = new Uint8Array(2048);
        this.cpu = new CPU(this)
        this.apu = new APU(this)
        this.ppu = new PPU(this)
        this.controller1 = new Controller()
        this.controller2 = new Controller()
        this.mapper = new Mapper4(this, this.cartridge)
    }


    get CPU(): CPU {
        return this.cpu
    }

    get APU(): APU {
        return this.apu
    }

    get PPU(): PPU {
        return this.ppu
    }

    get RAM(): Uint8Array {
        return this.ram
    }

    get Controller1(): Controller {
        return this.controller1
    }

    get Controller2(): Controller {
        return this.controller2
    }

    get Cartridge(): Cartridge {
        return this.cartridge
    }

    get Mapper(): Mapper {
        return this.mapper
    }

    reset() {
        this.cpu.reset()
    }

    private update(): number {
        const cpuCycle = this.cpu.update()
        const ppuCycle = cpuCycle * 3
        for (let i = 0; i < ppuCycle; i++) {
            this.ppu.update()
            this.mapper.update()
        }
        for (let i = 0; i < cpuCycle; i++) {
            this.apu.update()
        }
        return cpuCycle
    }

    updateFrame(): number {
        let cpuCycle = 0
        const frame = this.ppu.frame
        while (frame === this.ppu.frame) {
            cpuCycle += this.update()
        }
        return cpuCycle
    }

    updateSeconds(seconds: number) {
        let cycles = CPU.FREQUENCY * seconds
        while (cycles > 0) {
            cycles -= this.update()
        }
    }
}

export default Bus;