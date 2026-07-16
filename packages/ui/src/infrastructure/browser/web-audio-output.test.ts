import { describe, expect, it, vi } from "vitest";
import type {
  AudioWorkletInputMessage,
  AudioWorkletOutputMessage,
} from "./audio/audio-worklet-messages.js";
import { WebAudioOutput, type WebAudioEnvironment } from "./web-audio-output.js";

describe("WebAudioOutput", () => {
  it("loads an AudioWorklet and transfers samples in bounded batches", async () => {
    const fixture = createAudioFixture();
    const output = new WebAudioOutput(fixture.environment);

    expect(output.sampleRate).toBe(48_000);
    for (let index = 0; index < 512; index++) output.writeSample(index / 512);
    expect(await output.resume()).toBe("running");

    expect(fixture.addModule).toHaveBeenCalledWith("worklet.js");
    expect(fixture.createNode).toHaveBeenCalledOnce();
    expect(fixture.connect).toHaveBeenCalledOnce();
    const sampleMessage = fixture.messages[0]?.message as AudioWorkletInputMessage;
    expect(sampleMessage.type).toBe("samples");
    if (sampleMessage.type !== "samples") throw new Error("Expected an audio sample message");
    expect(sampleMessage.samples).toHaveLength(512);
    expect(fixture.messages[0]?.transfer).toEqual([sampleMessage.samples.buffer]);
  });

  it("bounds samples produced while worklet initialization is pending", async () => {
    const moduleLoad = deferred<void>();
    const fixture = createAudioFixture(() => moduleLoad.promise);
    const output = new WebAudioOutput(fixture.environment);

    for (let index = 0; index < 19 * 512; index++) output.writeSample(0.25);

    expect(output.diagnostics).toMatchObject({
      sampleRate: 48_000,
      droppedSamples: 512,
      pendingSamples: 9216,
    });
    moduleLoad.resolve();
    expect(await output.resume()).toBe("running");
    expect(fixture.messages).toHaveLength(18);
  });

  it("clears partial and worklet buffers before suspension", async () => {
    const fixture = createAudioFixture();
    const output = new WebAudioOutput(fixture.environment);
    expect(await output.resume()).toBe("running");
    output.writeSample(0.5);
    expect(output.diagnostics.pendingSamples).toBe(1);

    await output.suspend();

    expect(output.diagnostics.pendingSamples).toBe(0);
    expect(fixture.suspend).toHaveBeenCalledOnce();
    expect(fixture.messages.at(-1)?.message).toEqual({ type: "reset" });
  });

  it("does not create a node if disposal wins an initialization race", async () => {
    const moduleLoad = deferred<void>();
    const fixture = createAudioFixture(() => moduleLoad.promise);
    const output = new WebAudioOutput(fixture.environment);
    void output.sampleRate;

    const disposal = output.dispose();
    moduleLoad.resolve();
    await disposal;

    expect(fixture.createNode).not.toHaveBeenCalled();
    expect(fixture.close).toHaveBeenCalledOnce();
  });

  it("reports worklet buffer depth and audio failures", async () => {
    const fixture = createAudioFixture();
    const output = new WebAudioOutput(fixture.environment);
    expect(await output.resume()).toBe("running");

    fixture.emitFromWorklet({ type: "buffer-level", bufferedSamples: 2048 });
    fixture.emitFromWorklet({ type: "underrun" });
    fixture.emitFromWorklet({ type: "overflow", droppedSamples: 128 });

    expect(output.diagnostics).toMatchObject({
      bufferedSamples: 2048,
      underruns: 1,
      droppedSamples: 128,
    });
  });
});

function createAudioFixture(loadModule: () => Promise<void> = async () => undefined) {
  const messages: Array<{ message: unknown; transfer?: readonly Transferable[] }> = [];
  const addModule = vi.fn<() => Promise<void>>(loadModule);
  const resume = vi.fn<() => Promise<void>>(async () => {
    context.state = "running";
  });
  const suspend = vi.fn<() => Promise<void>>(async () => {
    context.state = "suspended";
  });
  const close = vi.fn<() => Promise<void>>(async () => {
    context.state = "closed";
  });
  const connect = vi.fn<() => void>();
  const disconnect = vi.fn<() => void>();
  const port = {
    onmessage: null,
    postMessage(message: unknown, transfer?: readonly Transferable[]) {
      messages.push({ message, ...(transfer ? { transfer } : {}) });
    },
  };
  const node = { port, connect, disconnect };
  const audioNode = node as unknown as AudioWorkletNode;
  const context = {
    state: "suspended" as AudioContextState,
    sampleRate: 48_000,
    destination: {},
    audioWorklet: { addModule },
    resume,
    suspend,
    close,
  };
  const createNode = vi.fn<
    (context: AudioContext, name: string, options: AudioWorkletNodeOptions) => AudioWorkletNode
  >(() => audioNode);
  const environment: WebAudioEnvironment = {
    createContext: () => context as unknown as AudioContext,
    createWorkletNode: createNode,
    workletModuleUrl: "worklet.js",
  };

  return {
    addModule,
    close,
    connect,
    createNode,
    environment,
    emitFromWorklet(message: unknown) {
      audioNode.port.onmessage?.call(audioNode.port, {
        data: message,
      } as MessageEvent<AudioWorkletOutputMessage>);
    },
    messages,
    resume,
    suspend,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
