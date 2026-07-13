import type { VideoFrame, VideoFrameSink } from "@fcemu/core";

export class CanvasVideoOutput implements VideoFrameSink {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D rendering is unavailable");
    this.context = context;
    this.context.imageSmoothingEnabled = false;
  }

  renderFrame(frame: VideoFrame): void {
    const width = frame.getWidth();
    const height = frame.getHeight();
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.imageSmoothingEnabled = false;
    }
    this.context.putImageData(new ImageData(frame.toCanvasImageData(), width, height), 0, 0);
  }
}
