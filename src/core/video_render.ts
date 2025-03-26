import {Image} from "./image.ts";

export interface VideoRenderer {
    render(image: Image): number
}

export class CanvasRenderer implements VideoRenderer {
    private readonly canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            throw new Error("canvas must be an HTMLCanvasElement");
        }
        this.canvas = canvas;
    }

    render(image: Image): number {
        console.log(image.value())
        const start = Date.now()
        this.canvas.width = image.getWidth()
        this.canvas.height = image.getHeight()
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            throw new Error('Could not get 2D context from canvas');
        }
        const pixelData = new ImageData(image.toCanvasImageData(), image.getWidth())
        const imageData = ctx.createImageData(pixelData)
        ctx.putImageData(imageData, 0, 0)
        const end = Date.now()

        return end - start
    }

}