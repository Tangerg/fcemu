import {
  NES_AUDIO_PROCESSOR_NAME,
  type AudioWorkletInputMessage,
  type AudioWorkletOutputMessage,
  type NesAudioProcessorOptions,
} from "./audio-worklet-messages.js";
import { RebufferingAudioRing } from "./rebuffering-audio-ring.js";

interface ProcessorConstructionOptions {
  readonly processorOptions?: unknown;
}

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;

  constructor(options?: ProcessorConstructionOptions);

  abstract process(
    inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
    parameters: Readonly<Record<string, Float32Array>>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processor: new (options: ProcessorConstructionOptions) => AudioWorkletProcessor,
): void;

class NesAudioWorkletProcessor extends AudioWorkletProcessor {
  private readonly buffer: RebufferingAudioRing;

  constructor(options: ProcessorConstructionOptions) {
    super(options);
    const processorOptions = options.processorOptions as NesAudioProcessorOptions;
    this.buffer = new RebufferingAudioRing(
      processorOptions.capacity,
      processorOptions.startThreshold,
    );
    this.port.onmessage = (event: MessageEvent<AudioWorkletInputMessage>) => {
      if (event.data.type === "reset") {
        this.buffer.reset();
        return;
      }
      const droppedSamples = this.buffer.push(event.data.samples);
      if (droppedSamples > 0) {
        this.postMetric({ type: "overflow", droppedSamples });
      }
    };
  }

  process(
    _inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
    _parameters: Readonly<Record<string, Float32Array>>,
  ): boolean {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const result = this.buffer.pull(output);
    if (result.underrunStarted) this.postMetric({ type: "underrun" });
    return true;
  }

  private postMetric(message: AudioWorkletOutputMessage): void {
    this.port.postMessage(message);
  }
}

registerProcessor(NES_AUDIO_PROCESSOR_NAME, NesAudioWorkletProcessor);
