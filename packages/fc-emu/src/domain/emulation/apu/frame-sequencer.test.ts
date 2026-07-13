import { describe, expect, it, vi } from "vitest";
import { FrameSequencer } from "./frame-sequencer.js";
import { PAL_APU_TIMING } from "../console-timing.js";

describe("APU frame sequencer", () => {
  it("clocks the first half-frame event 14913 cycles into mode 0", () => {
    const sink = createSink();
    const sequencer = new FrameSequencer(sink);
    sequencer.write(0, 0);

    tick(sequencer, 3 + 14912);
    expect(sink.halfFrame).not.toHaveBeenCalled();
    sequencer.tick();
    expect(sink.halfFrame).toHaveBeenCalledOnce();
  });

  it("applies the immediate half-frame clock when mode 1 takes effect", () => {
    const sink = createSink();
    const sequencer = new FrameSequencer(sink);
    sequencer.write(0x80, 0);

    tick(sequencer, 2);
    expect(sink.halfFrame).not.toHaveBeenCalled();
    sequencer.tick();
    expect(sink.halfFrame).toHaveBeenCalledOnce();
  });

  it("raises the mode-0 frame IRQ on three consecutive cycles", () => {
    const sink = createSink();
    const sequencer = new FrameSequencer(sink);
    sequencer.write(0, 0);

    tick(sequencer, 3 + 29830);
    expect(sink.requestIRQ).toHaveBeenCalledTimes(3);
  });

  it("uses the PAL 2A07 frame sequence", () => {
    const sink = createSink();
    const sequencer = new FrameSequencer(sink, PAL_APU_TIMING);
    sequencer.write(0, 0);

    tick(sequencer, 3 + 16_626);
    expect(sink.halfFrame).not.toHaveBeenCalled();
    sequencer.tick();
    expect(sink.halfFrame).toHaveBeenCalledOnce();

    tick(sequencer, 16_627);
    expect(sink.requestIRQ).toHaveBeenCalledTimes(3);
  });
});

function createSink() {
  return {
    quarterFrame: vi.fn<() => void>(),
    halfFrame: vi.fn<() => void>(),
    requestIRQ: vi.fn<() => void>(),
    clearIRQ: vi.fn<() => void>(),
  };
}

function tick(sequencer: FrameSequencer, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) sequencer.tick();
}
