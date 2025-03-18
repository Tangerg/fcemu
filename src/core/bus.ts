import CPU from "./cpu.ts";
import PPU from "./ppu.ts";
import Controller from "./controller.ts";
import Cartridge from "./cartridge.ts";
import APU from "./apu.ts";

export class Bus {
    private readonly cpu: CPU
    private readonly apu: APU
    private readonly ppu: PPU
    private readonly ram: Uint8Array
    private readonly controller1: Controller
    private readonly controller2: Controller
    public cartridge: Cartridge | undefined = undefined

    constructor() {
        this.ram = new Uint8Array(2048);
        this.cpu = new CPU(this)
        this.apu = new APU(this)
        this.ppu = new PPU(this)
        this.controller1 = new Controller()
        this.controller2 = new Controller()
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

    loadCartridge(cartridge: Cartridge) {
        this.cartridge = cartridge
    }
}

export default Bus;