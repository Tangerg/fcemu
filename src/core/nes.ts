import Bus from "./bus.ts";
import Cartridge from "./cartridge.ts";
import {VideoRenderer} from "./video_render.ts";
import {AudioRenderer} from "./audio_render.ts";

class NES {
    private readonly bus: Bus
    private videoRenderer: VideoRenderer | undefined
    private audioRenderer: AudioRenderer | undefined

    constructor(cartridge: Cartridge) {
        this.bus = new Bus(cartridge)
    }

    addAudioRenderer(audioRenderer: AudioRenderer): void {
        this.audioRenderer = audioRenderer;
        this.bus.APU.addListener(this.audioRenderer.render.bind(this.audioRenderer));
    }

    addVideoRenderer(videoRenderer: VideoRenderer): void {
        this.videoRenderer = videoRenderer
    }

    update(): void {
        if (!this.videoRenderer) {
            return
        }
        let time = this.videoRenderer.render(this.bus.PPU.front) / 1000
        if (time > 1) {
            time = 0
        }
        this.bus.updateSeconds(time)
    }

    run(): void {
        while (true) {
            this.update()
        }
    }
}

export default NES