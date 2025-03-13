import Bus from "./bus.ts";

class NES {
    private readonly bus: Bus

    constructor() {
        this.bus = new Bus()
    }

    setAudioMonitor(monitor: (output: number) => void): void {
        this.bus.APU.setMonitor(monitor)
    }

    setVideoMonitor(monitor: (output: number) => void): void {
        this.bus.PPU.setMonitor(monitor)
    }
}

export default NES