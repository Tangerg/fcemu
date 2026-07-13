import { describe, expect, it } from "vitest";
import {
  CONSERVATIVE_DMC_PROFILE,
  DeltaModulationChannel,
  RP2A03H_DMC_PROFILE,
  type DmcChannelPort,
  type DmcSiliconProfile,
} from "./delta-modulation-channel.js";

describe("DeltaModulationChannel", () => {
  it.each([
    { startingCycle: 0, delay: 3 },
    { startingCycle: 1, delay: 4 },
  ])(
    "requests the $C000 power-on sample after a $delay-cycle enable delay",
    ({ startingCycle, delay }) => {
      const port = createPort(startingCycle);
      const channel = createChannel(port);

      channel.setEnabled(true);
      advance(channel, port, delay - 1);
      expect(port.requests).toEqual([]);

      advance(channel, port, 1);
      expect(port.requests).toEqual([0xc000]);
      expect(port.requestPhases).toEqual(["get"]);
      expect(channel.currentLength).toBe(1);
    },
  );

  it("cancels a queued transfer when delayed disable takes effect", () => {
    const port = createPort(0);
    const channel = createChannel(port);
    channel.setEnabled(true);
    advance(channel, port, 3);
    expect(port.requests).toEqual([0xc000]);

    channel.setEnabled(false);
    advance(channel, port, 1);
    expect(channel.currentLength).toBe(1);
    expect(port.cancellations).toBe(0);

    advance(channel, port, 2);
    expect(channel.currentLength).toBe(0);
    expect(port.cancellations).toBe(1);
  });

  it("raises and clears IRQ after the final non-looping byte", () => {
    const port = createPort(0);
    const channel = createChannel(port);
    channel.control = 0x80;
    channel.setEnabled(true);
    advance(channel, port, 3);

    channel.completeDmaByte(0x5a);
    expect(channel.currentLength).toBe(0);
    expect(channel.interruptPending).toBe(true);
    expect(port.irq).toBe(true);

    channel.clearIRQ();
    expect(channel.interruptPending).toBe(false);
    expect(port.irq).toBe(false);
  });

  it("restarts a looping sample without asserting IRQ", () => {
    const port = createPort(0);
    const channel = createChannel(port);
    channel.control = 0xc0;
    channel.setEnabled(true);
    advance(channel, port, 3);

    channel.completeDmaByte(0xa5);
    expect(channel.currentLength).toBe(1);
    expect(channel.interruptPending).toBe(false);
    expect(port.irq).toBe(false);
  });

  it("requests the next byte when the output unit empties the reader buffer", () => {
    const port = createPort(0);
    const channel = createChannel(port);
    channel.length = 1;
    channel.setEnabled(true);
    advance(channel, port, 3);
    channel.completeDmaByte(0xa5);

    for (let bit = 0; bit < 8; bit++) channel.updateShifter();

    expect(port.requests).toEqual([0xc000, 0xc001]);
    expect(port.requestPhases).toEqual(["get", "put"]);
  });

  it("clocks the output unit once per full CPU-cycle period", () => {
    const port = createPort(0);
    const channel = new DeltaModulationChannel(port, Array<number>(16).fill(54));
    channel.setEnabled(true);
    advance(channel, port, 3);
    channel.completeDmaByte(0xff);

    for (let cycle = 0; cycle < 53; cycle++) channel.updateTimer();
    expect(channel.captureState().bitsRemaining).toBe(8);

    channel.updateTimer();
    expect(channel.captureState()).toMatchObject({ bitsRemaining: 7, tickValue: 54 });
  });

  it("aligns the power-on timer expiration with the selected APU GET half-cycle", () => {
    const periods = Array<number>(16).fill(54);
    expect(new DeltaModulationChannel(createPort(0), periods).captureState().tickValue).toBe(54);
    expect(new DeltaModulationChannel(createPort(1), periods).captureState().tickValue).toBe(53);
  });

  it("rejects a partial or half-cycle DMC period table", () => {
    expect(() => new DeltaModulationChannel(createPort(0), [428])).toThrow(RangeError);
    expect(() => new DeltaModulationChannel(createPort(0), Array<number>(16).fill(27))).toThrow(
      RangeError,
    );
  });

  it("repeats a one-byte sample completed on the output-counter reset boundary", () => {
    const port = createPort(0);
    const channel = createChannel(port, RP2A03H_DMC_PROFILE);
    channel.restoreState({
      ...channel.captureState(),
      currentAddress: 0xc000,
      currentLength: 1,
      bitsRemaining: 8,
      tickValue: 2,
      dmaRequested: true,
    });

    channel.completeDmaByte(0xa5);

    expect(channel.captureState()).toMatchObject({
      currentAddress: 0xc000,
      currentLength: 1,
      shiftRegister: 0xa5,
      bitsRemaining: 8,
      silence: false,
      tickValue: 2,
      dmaRequested: true,
    });
    expect(channel.captureState().sampleBuffer).toBeUndefined();
    expect(port.requests).toEqual([0xc000]);
    expect(port.requestPhases).toEqual(["put"]);
  });

  it("does not infer unmeasured stop glitches for the conservative silicon profile", () => {
    const port = createPort(0);
    const channel = createChannel(port);
    channel.restoreState({
      ...channel.captureState(),
      currentAddress: 0xc000,
      currentLength: 1,
      bitsRemaining: 8,
      tickValue: 2,
      dmaRequested: true,
    });

    channel.completeDmaByte(0xa5);

    expect(channel.captureState()).toMatchObject({
      currentAddress: 0xc001,
      currentLength: 0,
      sampleBuffer: 0xa5,
      dmaRequested: false,
    });
    expect(port.requests).toEqual([]);
  });

  it("schedules then cancels the one-cycle implicit-stop reload", () => {
    const port = createPort(0);
    const channel = createChannel(port, RP2A03H_DMC_PROFILE);
    channel.restoreState({
      ...channel.captureState(),
      currentAddress: 0xc000,
      currentLength: 1,
      bitsRemaining: 1,
      tickValue: 0,
      dmaRequested: true,
    });

    channel.completeDmaByte(0x5a);
    expect(channel.captureState()).toMatchObject({
      currentAddress: 0xc000,
      currentLength: 1,
      shiftRegister: 0x5a,
      sampleBuffer: 0x5a,
      disableDelay: 3,
    });

    channel.clockCpu();
    channel.updateTimer();
    expect(port.requests).toEqual([0xc000]);
    expect(port.requestPhases).toEqual(["put"]);

    channel.clockCpu();
    channel.clockCpu();
    expect(channel.currentLength).toBe(0);
    expect(port.cancellations).toBe(1);
  });
});

type TestPort = DmcChannelPort & {
  cycle: number;
  readonly requests: number[];
  readonly requestPhases: Array<"get" | "put">;
  cancellations: number;
  irq: boolean;
};

function createPort(startingCycle: number): TestPort {
  return {
    cycle: startingCycle,
    requests: [],
    requestPhases: [],
    cancellations: 0,
    irq: false,
    requestDma(address, haltPhase) {
      this.requests.push(address);
      this.requestPhases.push(haltPhase);
    },
    cancelDma() {
      this.cancellations++;
    },
    setIrq(asserted) {
      this.irq = asserted;
    },
    currentDmaPhase() {
      return this.cycle % 2 === 0 ? "get" : "put";
    },
  };
}

function createChannel(
  port: TestPort,
  silicon: DmcSiliconProfile = CONSERVATIVE_DMC_PROFILE,
): DeltaModulationChannel {
  return new DeltaModulationChannel(port, Array<number>(16).fill(2), silicon);
}

function advance(channel: DeltaModulationChannel, port: TestPort, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) {
    port.cycle++;
    channel.clockCpu();
  }
}
