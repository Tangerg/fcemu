import Bus from "./bus.ts";
import Cartridge from "./cartridge.ts";
import {Image} from "./image.ts";

class NES {
    private readonly bus: Bus

    constructor(cartridge: Cartridge) {
        this.bus = new Bus(cartridge)
    }

    addAudioListener(monitor: (output: number) => void | Promise<void>): void {
        this.bus.APU.addListener(monitor)
    }

    addVideoListener(monitor: (output: Image) => void | Promise<void>): void {
        this.bus.PPU.addListener(monitor)
    }

    update(): void {
        this.bus.updateSeconds(0.5)
    }

    run(): void {
        this.addVideoListener((output) => {
            console.log(output.value())
        })

        while (true) {
            this.update()
        }
    }
}

export default NES