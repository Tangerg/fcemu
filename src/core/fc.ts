import APU from "./apu.ts";
import CPU from "./cpu.ts";

class FC {
    private readonly cpu: CPU
    private readonly apu: APU
    private readonly canvas: HTMLCanvasElement
    private readonly audioContext: AudioContext;
    private audioWorkletNode: AudioWorkletNode | null = null;


    constructor(canvas: HTMLCanvasElement) {
        this.cpu = new CPU()
        this.apu = new APU(this.cpu, this.handleAPUOutput.bind(this))
        this.canvas = canvas
        this.audioContext = new AudioContext();
    }

    private handleAPUOutput(value: number): void {
        console.log(value)
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage(value);
        }
    }

    private async initAudioWorklet(): Promise<void> {
        try {
            await this.audioContext.audioWorklet.addModule("apu-processor.js");
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, "apu-processor");
            this.audioWorkletNode.connect(this.audioContext.destination);
        } catch (err) {
            console.error("Failed to initialize AudioWorklet:", err);
        }
    }

    run(): void {
        const frame = () => {
            this.cpu.update();
            this.apu.update();
            requestAnimationFrame(frame);
        };
        frame();
    }
}

export default FC