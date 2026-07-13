import { describe, expect, it, vi } from "vitest";
import { CpuBranchCycle, type CpuBranchCyclePort } from "./cpu-branch-cycle.js";

describe("CPU relative branch cycles", () => {
  it("finishes a branch-not-taken after reading only its offset", () => {
    const fixture = createFixture(0x8001, new Map([[0x8001, 0x7f]]));
    const branch = new CpuBranchCycle(false);

    expect(branch.pollsBeforeCurrentCycle).toBe(true);
    expect(branch.clock(fixture.port)).toEqual({ taken: false, pageCrossed: false });
    expect(branch.pollsBeforeCurrentCycle).toBe(false);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001]]);
    expect(fixture.programCounter()).toBe(0x8002);
  });

  it("adds a taken dummy read without crossing a page", () => {
    const fixture = createFixture(0x8001, new Map([[0x8001, 0x05]]));
    const branch = new CpuBranchCycle(true);

    expect(branch.pollsBeforeCurrentCycle).toBe(true);
    expect(branch.clock(fixture.port)).toBeUndefined();
    expect(branch.pollsBeforeCurrentCycle).toBe(false);
    expect(branch.clock(fixture.port)).toEqual({ taken: true, pageCrossed: false });
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8002]]);
    expect(fixture.programCounter()).toBe(0x8007);
  });

  it("reads the wrong page before committing a crossing target", () => {
    const fixture = createFixture(0x80fd, new Map([[0x80fd, 0x05]]));
    const branch = new CpuBranchCycle(true);

    expect(branch.pollsBeforeCurrentCycle).toBe(true);
    expect(branch.clock(fixture.port)).toBeUndefined();
    expect(branch.pollsBeforeCurrentCycle).toBe(false);
    expect(branch.clock(fixture.port)).toBeUndefined();
    expect(branch.pollsBeforeCurrentCycle).toBe(true);
    expect(fixture.programCounter()).toBe(0x8003);
    expect(branch.clock(fixture.port)).toEqual({ taken: true, pageCrossed: true });
    expect(fixture.readByte.mock.calls).toEqual([[0x80fd], [0x80fe], [0x8003]]);
    expect(fixture.programCounter()).toBe(0x8103);
  });

  it("wraps a negative branch target at the address-space boundary", () => {
    const fixture = createFixture(0x0000, new Map([[0x0000, 0xfd]]));
    const branch = new CpuBranchCycle(true);

    branch.clock(fixture.port);
    branch.clock(fixture.port);
    expect(branch.pollsBeforeCurrentCycle).toBe(true);
    expect(branch.clock(fixture.port)).toEqual({ taken: true, pageCrossed: true });
    expect(fixture.programCounter()).toBe(0xfffe);
  });
});

function createFixture(
  initialProgramCounter: number,
  memory: ReadonlyMap<number, number>,
): {
  readonly port: CpuBranchCyclePort;
  readonly readByte: ReturnType<typeof vi.fn<(address: number) => number>>;
  readonly programCounter: () => number;
} {
  let programCounter = initialProgramCounter;
  const readByte = vi.fn<(address: number) => number>((address) => memory.get(address) ?? 0);
  return {
    readByte,
    programCounter: () => programCounter,
    port: {
      readByte,
      getProgramCounter: () => programCounter,
      setProgramCounter: (value) => {
        programCounter = value & 0xffff;
      },
    },
  };
}
