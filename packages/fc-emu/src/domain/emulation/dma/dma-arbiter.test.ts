import { describe, expect, it } from "vitest";
import { DmaArbiter, type DmaArbiterPort } from "./dma-arbiter.js";

describe("DmaArbiter", () => {
  it("owns the alternating APU GET/PUT cadence", () => {
    const arbiter = new DmaArbiter();

    expect(Array.from({ length: 6 }, (_, cycle) => arbiter.phaseAt(cycle + 1))).toEqual([
      "get",
      "put",
      "get",
      "put",
      "get",
      "put",
    ]);
  });

  it("round-trips either physical power-on alignment", () => {
    const arbiter = new DmaArbiter();
    const state = arbiter.captureState();
    arbiter.restoreState({ ...state, cadence: { getCycleParity: 0 } });

    expect(arbiter.phaseAt(1)).toBe("put");
    expect(arbiter.phaseAt(2)).toBe("get");
    expect(arbiter.captureState().cadence).toEqual({ getCycleParity: 0 });
    expect(() =>
      arbiter.restoreState({
        ...state,
        cadence: { getCycleParity: 2 } as unknown as { getCycleParity: 0 | 1 },
      }),
    ).toThrow(RangeError);
  });

  it.each([
    { startingCycle: 0, expectedCycles: 3 },
    { startingCycle: 1, expectedCycles: 4 },
  ])(
    "runs a DMC halt/dummy/alignment/GET sequence from cycle $startingCycle",
    ({ startingCycle, expectedCycles }) => {
      const completed: number[] = [];
      const arbiter = new DmaArbiter();
      const port = createPort(completed);
      let cpuCycle = startingCycle;

      arbiter.startDmc(0xc123, "get");
      arbiter.beginDmc(0x8000);
      while (arbiter.active) arbiter.clock(++cpuCycle, port);

      expect(cpuCycle - startingCycle).toBe(expectedCycles);
      expect(port.reads).toEqual([0xc123]);
      expect(completed).toEqual([0x5a]);
    },
  );

  it("waits for the CPU to expose a readable cycle before OAM DMA owns the bus", () => {
    const arbiter = new DmaArbiter();
    arbiter.startSprite(0x02);

    expect(arbiter.active).toBe(true);
    expect(arbiter.ownsBusCycle).toBe(false);
    expect(arbiter.awaitingSpriteHalt).toBe(true);

    arbiter.clock(1, createPort([]));

    expect(arbiter.ownsBusCycle).toBe(true);
    expect(arbiter.awaitingSpriteHalt).toBe(false);
  });

  it.each([
    { writeCycle: 1, expectedCycles: 513, expectedPrefix: ["halt", "get", "put"] },
    {
      writeCycle: 2,
      expectedCycles: 514,
      expectedPrefix: ["halt", "alignment", "get", "put"],
    },
  ])(
    "runs a $expectedCycles-cycle OAM DMA after a $4014 write on cycle $writeCycle",
    ({ writeCycle, expectedCycles, expectedPrefix }) => {
      const arbiter = new DmaArbiter();
      const port = createPort([]);
      const phases: string[] = [];
      let cpuCycle = writeCycle;

      arbiter.startSprite(0x02);
      while (arbiter.active) phases.push(arbiter.clock(++cpuCycle, port));

      expect(phases).toHaveLength(expectedCycles);
      expect(phases.slice(0, expectedPrefix.length)).toEqual(expectedPrefix);
      expect(port.oam).toHaveLength(0x100);
    },
  );

  it("lets DMC steal a GET while preserving an overlapping sprite transfer", () => {
    const completed: number[] = [];
    const arbiter = new DmaArbiter();
    const port = createPort(completed);
    let cpuCycle = 0;

    arbiter.startSprite(0x02);
    arbiter.startDmc(0xc123, "get");
    arbiter.beginDmc(0x8000);
    while (arbiter.active) arbiter.clock(++cpuCycle, port);

    expect(completed).toEqual([0x5a]);
    expect(port.oam).toEqual(Array.from({ length: 0x100 }, (_, index) => (0x0200 + index) & 0xff));
  });

  it("honors load/reload halt phase and retries after a failed write-cycle halt", () => {
    const arbiter = new DmaArbiter();
    arbiter.startDmc(0xc123, "put");

    expect(arbiter.canBeginDmcAt(2)).toBe(true);
    expect(arbiter.canBeginDmcAt(3)).toBe(false);

    arbiter.missDmcHaltOnWrite(2);
    expect(arbiter.canBeginDmcAt(3)).toBe(true);
  });

  it("stops an aborted DMC transfer after its single completed halt cycle", () => {
    const completed: number[] = [];
    const arbiter = new DmaArbiter();
    const port = createPort(completed);
    arbiter.startDmc(0xc123, "put");
    arbiter.beginDmc(0x8000);

    expect(arbiter.clock(2, port)).toBe("halt");
    arbiter.cancelDmc();

    expect(arbiter.active).toBe(false);
    expect(completed).toEqual([]);
    expect(port.reads).toEqual([]);
  });
});

function createPort(completed: number[]): DmaArbiterPort & {
  readonly reads: number[];
  readonly oam: number[];
} {
  const reads: number[] = [];
  const oam: number[] = [];
  return {
    reads,
    oam,
    readDmcByteForDma(address) {
      reads.push(address);
      return address === 0xc123 ? 0x5a : address & 0xff;
    },
    readCpuByteForDma(address) {
      reads.push(address);
      return address === 0xc123 ? 0x5a : address & 0xff;
    },
    repeatHaltedCpuReadForDma() {},
    completeDmcDmaByte(value) {
      completed.push(value);
    },
    writeOamByteForDma(value) {
      oam.push(value);
    },
  };
}
