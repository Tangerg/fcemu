import { describe, expect, it, vi } from "vitest";
import { CpuStackCycle, type CpuStackCyclePort } from "./cpu-stack-cycle.js";

describe("CPU stack instruction cycles", () => {
  it("performs a next-PC dummy read before pushing on cycle three", () => {
    const fixture = createFixture();
    const cycle = CpuStackCycle.push(0x142);

    expect(cycle.clock(fixture.port)).toBeUndefined();
    expect(cycle.clock(fixture.port)).toEqual({ kind: "pushed" });

    expect(fixture.readByte.mock.calls).toEqual([[0x8001]]);
    expect(fixture.pushByte.mock.calls).toEqual([[0x42]]);
  });

  it("performs PC and current-stack dummy reads before pulling", () => {
    const fixture = createFixture();
    const cycle = CpuStackCycle.pull();

    expect(cycle.clock(fixture.port)).toBeUndefined();
    expect(cycle.clock(fixture.port)).toBeUndefined();
    expect(cycle.clock(fixture.port)).toEqual({ kind: "pulled", value: 0xab });

    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8001]]);
    expect(fixture.pullByte).toHaveBeenCalledOnce();
  });

  it("rejects clocks after a stack sequence has completed", () => {
    const fixture = createFixture();
    const cycle = CpuStackCycle.push(0);
    cycle.clock(fixture.port);
    cycle.clock(fixture.port);

    expect(() => cycle.clock(fixture.port)).toThrow("completed stack push");
  });
});

function createFixture(): {
  readonly port: CpuStackCyclePort;
  readonly readByte: ReturnType<typeof vi.fn<(address: number) => number>>;
  readonly pushByte: ReturnType<typeof vi.fn<(value: number) => void>>;
  readonly pullByte: ReturnType<typeof vi.fn<() => number>>;
} {
  const readByte = vi.fn<(address: number) => number>(() => 0);
  const pushByte = vi.fn<(value: number) => void>();
  const pullByte = vi.fn<() => number>(() => 0xab);
  return {
    readByte,
    pushByte,
    pullByte,
    port: {
      readByte,
      pushByte,
      pullByte,
      getProgramCounter: () => 0x8001,
    },
  };
}
