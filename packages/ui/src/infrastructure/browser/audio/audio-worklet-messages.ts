export const NES_AUDIO_PROCESSOR_NAME = "fcemu-audio-output";

/**
 * Discriminants for the messages exchanged with the AudioWorklet. The message
 * union types below remain the canonical type definitions; senders and receivers
 * refer to these named constants instead of bare string literals.
 */
export const AudioWorkletMessageType = {
  Samples: "samples",
  Reset: "reset",
  Underrun: "underrun",
  Overflow: "overflow",
  BufferLevel: "buffer-level",
} as const;

export interface NesAudioProcessorOptions {
  readonly capacity: number;
  readonly startThreshold: number;
}

export type AudioWorkletInputMessage =
  { readonly type: "samples"; readonly samples: Float32Array } | { readonly type: "reset" };

export type AudioWorkletOutputMessage =
  | { readonly type: "underrun" }
  | { readonly type: "overflow"; readonly droppedSamples: number }
  | { readonly type: "buffer-level"; readonly bufferedSamples: number };
