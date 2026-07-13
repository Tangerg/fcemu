import { describe, expect, it, vi } from "vitest";
import { CpuMemoryCycle, type CpuMemoryCyclePort } from "./cpu-memory-cycle.js";

describe("CPU operand memory cycles", () => {
  it.each([
    ["immediate", 0, 1, [0x8001], []],
    ["zero-page", 0, 2, [0x0042], [0x8001]],
    ["zero-page-indexed", 5, 3, [0x0047], [0x8001, 0x0042]],
    ["absolute", 0, 3, [0x1242], [0x8001, 0x8002]],
  ] as const)(
    "resolves %s through its exact operand and data cycles",
    (kind, index, expectedCycles, executedAddresses, readAddresses) => {
      const fixture = createFixture(
        new Map([
          [0x8001, 0x42],
          [0x8002, 0x12],
        ]),
      );
      const cycle = new CpuMemoryCycle(kind, index);

      expect(clockToCompletion(cycle, fixture.port)).toBe(expectedCycles);
      expect(fixture.execute.mock.calls).toEqual(executedAddresses.map((address) => [address]));
      expect(fixture.readByte.mock.calls).toEqual(readAddresses.map((address) => [address]));
    },
  );

  it("wraps a zero-page index without carrying into page one", () => {
    const fixture = createFixture(new Map([[0x8001, 0xfe]]));
    const cycle = new CpuMemoryCycle("zero-page-indexed", 5);

    clockToCompletion(cycle, fixture.port);

    expect(fixture.execute).toHaveBeenCalledWith(0x03);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x00fe]]);
  });

  it.each([
    ["absolute-indexed-read", 3, [0x8001, 0x8002], 0x12ff],
    ["absolute-indexed-write", 4, [0x8001, 0x8002, 0x12ff], 0x12ff],
  ] as const)(
    "applies the indexed absolute dummy policy for %s",
    (kind, cycles, reads, address) => {
      const fixture = createFixture(
        new Map([
          [0x8001, 0xf0],
          [0x8002, 0x12],
        ]),
      );
      const cycle = new CpuMemoryCycle(kind, 0x0f);

      expect(clockToCompletion(cycle, fixture.port)).toBe(cycles);
      expect(fixture.readByte.mock.calls).toEqual(reads.map((value) => [value]));
      expect(fixture.execute).toHaveBeenCalledWith(address);
    },
  );

  it("performs a wrong-page read for a crossing absolute index", () => {
    const fixture = createFixture(
      new Map([
        [0x8001, 0xf8],
        [0x8002, 0x12],
      ]),
    );
    const cycle = new CpuMemoryCycle("absolute-indexed-read", 0x10);

    expect(clockToCompletion(cycle, fixture.port)).toBe(4);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8002], [0x1208]]);
    expect(fixture.execute).toHaveBeenCalledWith(0x1308);
  });

  it("wraps the indexed-indirect pointer inside zero page", () => {
    const fixture = createFixture(
      new Map([
        [0x8001, 0xfc],
        [0x0001, 0x78],
        [0x0002, 0x56],
      ]),
    );
    const cycle = new CpuMemoryCycle("indexed-indirect", 5);

    expect(clockToCompletion(cycle, fixture.port)).toBe(5);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x00fc], [0x0001], [0x0002]]);
    expect(fixture.execute).toHaveBeenCalledWith(0x5678);
  });

  it.each(["indirect-indexed-read", "indirect-indexed-write"] as const)(
    "uses the wrong-page cycle for crossing %s",
    (kind) => {
      const fixture = createFixture(
        new Map([
          [0x8001, 0xff],
          [0x00ff, 0xf8],
          [0x0000, 0x12],
        ]),
      );
      const cycle = new CpuMemoryCycle(kind, 0x10);

      expect(clockToCompletion(cycle, fixture.port)).toBe(5);
      expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x00ff], [0x0000], [0x1208]]);
      expect(fixture.execute).toHaveBeenCalledWith(0x1308);
    },
  );

  it.each(["absolute-indexed-write", "indirect-indexed-write"] as const)(
    "remembers when RDY stretches the indexed dummy read for %s",
    (kind) => {
      const memory =
        kind === "absolute-indexed-write"
          ? new Map([
              [0x8001, 0x00],
              [0x8002, 0x05],
            ])
          : new Map([
              [0x8001, 0x50],
              [0x0050, 0x00],
              [0x0051, 0x05],
            ]);
      const fixture = createFixture(memory, new Set([0x0500]));
      const cycle = new CpuMemoryCycle(kind, 0);

      clockToCompletion(cycle, fixture.port);

      expect(cycle.indexedDummyReadWasHalted).toBe(true);
    },
  );

  it("restores an indexed-write RDY halt before the final write", () => {
    const fixture = createFixture(
      new Map([
        [0x8001, 0x00],
        [0x8002, 0x05],
      ]),
      new Set([0x0500]),
    );
    const cycle = new CpuMemoryCycle("absolute-indexed-write", 0);

    cycle.clock(fixture.port);
    cycle.clock(fixture.port);
    cycle.clock(fixture.port);
    const restored = CpuMemoryCycle.fromState(cycle.captureState());

    expect(restored.indexedDummyReadWasHalted).toBe(true);
    expect(restored.clock(fixture.port)).toBe(true);
    expect(fixture.execute).toHaveBeenCalledWith(0x0500);
  });
});

function clockToCompletion(cycle: CpuMemoryCycle, port: CpuMemoryCyclePort): number {
  for (let count = 1; count <= 5; count++) if (cycle.clock(port)) return count;
  throw new Error("Memory cycle did not complete");
}

function createFixture(
  memory: ReadonlyMap<number, number>,
  haltedDummyReads: ReadonlySet<number> = new Set(),
): {
  readonly port: CpuMemoryCyclePort;
  readonly readByte: ReturnType<typeof vi.fn<(address: number) => number>>;
  readonly execute: ReturnType<typeof vi.fn<(address: number) => void>>;
} {
  let programCounter = 0x8001;
  const readByte = vi.fn<(address: number) => number>((address) => memory.get(address) ?? 0);
  const execute = vi.fn<(address: number) => void>();
  return {
    readByte,
    execute,
    port: {
      readByte,
      dummyRead: (address) => {
        readByte(address);
        return haltedDummyReads.has(address);
      },
      execute,
      getProgramCounter: () => programCounter,
      setProgramCounter: (value) => {
        programCounter = value & 0xffff;
      },
    },
  };
}
