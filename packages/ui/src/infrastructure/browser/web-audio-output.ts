import type { AudioSampleSink } from "@fcemu/core";
import type { AudioLifecyclePort } from "../../application/ports.js";
import { AUDIO_BATCH_SIZE, createAudioBufferPolicy } from "./audio/audio-buffer-policy.js";
import { AudioSampleBatcher } from "./audio/audio-sample-batcher.js";
import {
  NES_AUDIO_PROCESSOR_NAME,
  type AudioWorkletInputMessage,
  type AudioWorkletOutputMessage,
  type NesAudioProcessorOptions,
} from "./audio/audio-worklet-messages.js";
// Vite supplies the URL default export for the `?worker&url` virtual module.
// oxlint-disable-next-line import/default
import audioWorkletModuleUrl from "./audio/nes-audio-worklet.ts?worker&url";

const AUDIO_RESUME_TIMEOUT_MS = 250;

export interface WebAudioEnvironment {
  createContext(): AudioContext;
  createWorkletNode(
    context: AudioContext,
    name: string,
    options: AudioWorkletNodeOptions,
  ): AudioWorkletNode;
  readonly workletModuleUrl: string;
}

export interface WebAudioDiagnostics {
  readonly underruns: number;
  readonly droppedSamples: number;
  readonly pendingSamples: number;
}

const browserEnvironment: WebAudioEnvironment = {
  createContext: () => new AudioContext({ latencyHint: "interactive" }),
  createWorkletNode: (context, name, options) => new AudioWorkletNode(context, name, options),
  workletModuleUrl: audioWorkletModuleUrl,
};

export class WebAudioOutput implements AudioSampleSink, AudioLifecyclePort {
  private context: AudioContext | undefined;
  private node: AudioWorkletNode | undefined;
  private initialization: Promise<void> | undefined;
  private generation = 0;
  private bufferPolicy = createAudioBufferPolicy(44_100);
  private readonly pendingBatches: Float32Array<ArrayBuffer>[] = [];
  private readonly batcher = new AudioSampleBatcher(AUDIO_BATCH_SIZE, (batch) =>
    this.enqueueBatch(batch),
  );
  private underruns = 0;
  private droppedSamples = 0;

  constructor(private readonly environment: WebAudioEnvironment = browserEnvironment) {}

  get sampleRate(): number {
    return this.ensureContext().sampleRate;
  }

  get diagnostics(): WebAudioDiagnostics {
    return Object.freeze({
      underruns: this.underruns,
      droppedSamples: this.droppedSamples,
      pendingSamples:
        this.batcher.pendingSamples + this.pendingBatches.length * this.batcher.batchSize,
    });
  }

  activate(): void {
    const context = this.ensureContext();
    void this.startContext(context).catch(() => undefined);
  }

  writeSample(sample: number): void {
    this.ensureContext();
    this.batcher.write(sample);
  }

  async resume(): Promise<"running" | "blocked"> {
    const context = this.ensureContext();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: "running" | "blocked") => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };
      const timeout = setTimeout(() => finish("blocked"), AUDIO_RESUME_TIMEOUT_MS);
      void this.startContext(context).then(
        (running) => finish(running ? "running" : "blocked"),
        () => finish("blocked"),
      );
    });
  }

  async suspend(): Promise<void> {
    this.resetBufferedAudio();
    await this.context?.suspend();
  }

  async dispose(): Promise<void> {
    const context = this.context;
    const initialization = this.initialization;
    const node = this.node;
    this.generation++;
    this.context = undefined;
    this.initialization = undefined;
    this.node = undefined;
    this.resetBufferedAudio(node);
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
    }
    await initialization?.catch(() => undefined);
    if (context?.state !== "closed") await context?.close();
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = this.environment.createContext();
    const generation = ++this.generation;
    this.bufferPolicy = createAudioBufferPolicy(context.sampleRate);
    this.context = context;
    this.initialization = this.initializeWorklet(context, generation);
    return context;
  }

  private async initializeWorklet(context: AudioContext, generation: number): Promise<void> {
    await context.audioWorklet.addModule(this.environment.workletModuleUrl);
    if (this.context !== context || this.generation !== generation || context.state === "closed") {
      return;
    }

    const processorOptions: NesAudioProcessorOptions = {
      capacity: this.bufferPolicy.ringCapacity,
      startThreshold: this.bufferPolicy.startThreshold,
    };
    const node = this.environment.createWorkletNode(context, NES_AUDIO_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions,
    });
    node.port.onmessage = (event: MessageEvent<AudioWorkletOutputMessage>) => {
      if (event.data.type === "underrun") this.underruns++;
      else this.droppedSamples += event.data.droppedSamples;
    };
    node.connect(context.destination);
    this.node = node;
    this.flushPendingBatches();
  }

  private async startContext(context: AudioContext): Promise<boolean> {
    await this.initialization;
    if (context !== this.context || context.state === "closed") return false;
    if (context.state !== "running") await context.resume();
    return context === this.context && context.state === "running";
  }

  private enqueueBatch(batch: Float32Array<ArrayBuffer>): void {
    if (this.node) {
      this.postBatch(this.node, batch);
      return;
    }

    this.pendingBatches.push(batch);
    if (this.pendingBatches.length <= this.bufferPolicy.maxPendingBatches) return;
    const droppedBatch = this.pendingBatches.shift();
    this.droppedSamples += droppedBatch?.length ?? 0;
  }

  private flushPendingBatches(): void {
    const node = this.node;
    if (!node) return;
    for (const batch of this.pendingBatches.splice(0)) this.postBatch(node, batch);
  }

  private postBatch(node: AudioWorkletNode, samples: Float32Array<ArrayBuffer>): void {
    const message: AudioWorkletInputMessage = { type: "samples", samples };
    node.port.postMessage(message, [samples.buffer]);
  }

  private resetBufferedAudio(node = this.node): void {
    this.batcher.reset();
    this.pendingBatches.length = 0;
    const message: AudioWorkletInputMessage = { type: "reset" };
    node?.port.postMessage(message);
  }
}
