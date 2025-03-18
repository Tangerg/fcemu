import Bus from "./bus.ts";

class NES {
    private readonly bus: Bus

    constructor() {
        this.bus = new Bus()
    }

    addAudioListener(monitor: (output: number) => Promise<void>): void {
        this.bus.APU.addListener(monitor)
    }

    addVideoListener(monitor: (output: number) => Promise<void>): void {
        this.bus.PPU.addListener(monitor)
    }
}

export default NES