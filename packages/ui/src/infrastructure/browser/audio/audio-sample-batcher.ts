export class AudioSampleBatcher {
  private samples: Float32Array<ArrayBuffer>;
  private length = 0;

  constructor(
    readonly batchSize: number,
    private readonly emitBatch: (samples: Float32Array<ArrayBuffer>) => void,
  ) {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new RangeError("Audio batch size must be a positive integer");
    }
    this.samples = new Float32Array(batchSize);
  }

  get pendingSamples(): number {
    return this.length;
  }

  write(sample: number): void {
    this.samples[this.length] = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
    this.length++;
    if (this.length !== this.batchSize) return;

    const completedBatch = this.samples;
    this.samples = new Float32Array(this.batchSize);
    this.length = 0;
    this.emitBatch(completedBatch);
  }

  reset(): void {
    this.samples = new Float32Array(this.batchSize);
    this.length = 0;
  }
}
