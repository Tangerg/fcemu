export interface VideoFrame {
  getWidth(): number;
  getHeight(): number;
  toCanvasImageData(): Uint8ClampedArray<ArrayBuffer>;
}

export interface VideoFrameSink {
  renderFrame(frame: VideoFrame): void;
}

export interface AudioSampleSink {
  readonly sampleRate: number;
  writeSample(sample: number): void;
}

export interface EmulatorOutputPorts {
  readonly video?: VideoFrameSink;
  readonly audio?: AudioSampleSink;
}
