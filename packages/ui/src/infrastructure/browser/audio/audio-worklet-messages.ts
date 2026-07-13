export const NES_AUDIO_PROCESSOR_NAME = "fcemu-audio-output";

export interface NesAudioProcessorOptions {
  readonly capacity: number;
  readonly startThreshold: number;
}

export type AudioWorkletInputMessage =
  { readonly type: "samples"; readonly samples: Float32Array } | { readonly type: "reset" };

export type AudioWorkletOutputMessage =
  { readonly type: "underrun" } | { readonly type: "overflow"; readonly droppedSamples: number };
