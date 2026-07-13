export interface AudioPullResult {
  readonly writtenSamples: number;
  readonly underrunStarted: boolean;
}

/**
 * Bounded real-time queue that drops the oldest audio on overflow and waits for
 * a minimum prebuffer before starting or recovering from an underrun.
 */
export class RebufferingAudioRing {
  private readonly samples: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private size = 0;
  private playing = false;

  constructor(
    readonly capacity: number,
    readonly startThreshold: number,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError("Audio ring capacity must be a positive integer");
    }
    if (!Number.isSafeInteger(startThreshold) || startThreshold <= 0 || startThreshold > capacity) {
      throw new RangeError("Audio start threshold must be between one and the ring capacity");
    }
    this.samples = new Float32Array(capacity);
  }

  get bufferedSamples(): number {
    return this.size;
  }

  push(input: Float32Array): number {
    if (input.length >= this.capacity) {
      const droppedSamples = this.size + input.length - this.capacity;
      this.samples.set(input.subarray(input.length - this.capacity));
      this.readIndex = 0;
      this.writeIndex = 0;
      this.size = this.capacity;
      return droppedSamples;
    }

    const droppedSamples = Math.max(0, this.size + input.length - this.capacity);
    if (droppedSamples > 0) {
      this.readIndex = (this.readIndex + droppedSamples) % this.capacity;
      this.size -= droppedSamples;
    }

    for (const sample of input) {
      this.samples[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.size += input.length;
    return droppedSamples;
  }

  pull(output: Float32Array): AudioPullResult {
    output.fill(0);
    if (!this.playing) {
      if (this.size < this.startThreshold) {
        return { writtenSamples: 0, underrunStarted: false };
      }
      this.playing = true;
    }

    const writtenSamples = Math.min(output.length, this.size);
    for (let index = 0; index < writtenSamples; index++) {
      output[index] = this.samples[this.readIndex] ?? 0;
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }
    this.size -= writtenSamples;

    const underrunStarted = writtenSamples < output.length;
    if (underrunStarted) this.playing = false;
    return { writtenSamples, underrunStarted };
  }

  reset(): void {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.size = 0;
    this.playing = false;
  }
}
