export const AUDIO_BATCH_SIZE = 512;

const START_BUFFER_SECONDS = 0.02;
const MAX_BUFFER_SECONDS = 0.185;

export interface AudioBufferPolicy {
  readonly batchSize: number;
  readonly startThreshold: number;
  readonly ringCapacity: number;
  readonly maxPendingBatches: number;
}

/** Converts time-based latency targets into whole transferable sample batches. */
export function createAudioBufferPolicy(sampleRate: number): AudioBufferPolicy {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError("Audio sample rate must be a positive finite number");
  }

  const startBatches = Math.max(
    1,
    Math.ceil((sampleRate * START_BUFFER_SECONDS) / AUDIO_BATCH_SIZE),
  );
  const capacityBatches = Math.max(
    startBatches,
    Math.ceil((sampleRate * MAX_BUFFER_SECONDS) / AUDIO_BATCH_SIZE),
  );
  return Object.freeze({
    batchSize: AUDIO_BATCH_SIZE,
    startThreshold: startBatches * AUDIO_BATCH_SIZE,
    ringCapacity: capacityBatches * AUDIO_BATCH_SIZE,
    maxPendingBatches: capacityBatches,
  });
}
