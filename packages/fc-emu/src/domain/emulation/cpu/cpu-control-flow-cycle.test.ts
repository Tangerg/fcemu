import { describe, expect, it, vi } from "vitest";
import {
  CpuControlFlowCycle,
  type CpuControlFlowCyclePort,
  type CpuControlFlowKind,
} from "./cpu-control-flow-cycle.js";

describe("CPU subroutine and return cycles", () => {
  it("reads an absolute JMP target low then high", () => {
    const fixture = createFixture(
      "jmp-absolute",
      0x8001,
      0xfd,
      new Map([
        [0x8001, 0x34],
        [0x8002, 0x12],
      ]),
    );

    expect(clockToCompletion(fixture.cycle, fixture.port)).toBe(2);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8002]]);
    expect(fixture.programCounter()).toBe(0x1234);
  });

  it("reproduces the indirect JMP page-wrap high-byte read", () => {
    const fixture = createFixture(
      "jmp-indirect",
      0x8001,
      0xfd,
      new Map([
        [0x8001, 0xff],
        [0x8002, 0x12],
        [0x12ff, 0x78],
        [0x1200, 0x56],
      ]),
    );

    expect(clockToCompletion(fixture.cycle, fixture.port)).toBe(4);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8002], [0x12ff], [0x1200]]);
    expect(fixture.programCounter()).toBe(0x5678);
  });

  it("pushes JSR's high/low return address before reading the target high byte", () => {
    const fixture = createFixture(
      "jsr",
      0x8001,
      0xfd,
      new Map([
        [0x8001, 0x34],
        [0x8002, 0x12],
      ]),
    );

    expect(clockToCompletion(fixture.cycle, fixture.port)).toBe(5);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8002], [0x8002]]);
    expect(fixture.pushes).toEqual([0x80, 0x02]);
    expect(fixture.programCounter()).toBe(0x1234);
  });

  it("pulls RTS's address and performs its final increment dummy read", () => {
    const fixture = createFixture(
      "rts",
      0x8001,
      0xfb,
      new Map([
        [0x01fc, 0x34],
        [0x01fd, 0x12],
      ]),
    );

    expect(clockToCompletion(fixture.cycle, fixture.port)).toBe(5);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8001], [0x1234]]);
    expect(fixture.programCounter()).toBe(0x1235);
  });

  it("restores RTI status before its low/high program-counter pulls", () => {
    const fixture = createFixture(
      "rti",
      0x8001,
      0xfa,
      new Map([
        [0x01fb, 0xff],
        [0x01fc, 0x78],
        [0x01fd, 0x56],
      ]),
    );

    expect(clockToCompletion(fixture.cycle, fixture.port)).toBe(5);
    expect(fixture.readByte.mock.calls).toEqual([[0x8001], [0x8001]]);
    expect(fixture.processorFlags()).toBe(0xef);
    expect(fixture.programCounter()).toBe(0x5678);
  });
});

function clockToCompletion(cycle: CpuControlFlowCycle, port: CpuControlFlowCyclePort): number {
  for (let count = 1; count <= 5; count++) if (cycle.clock(port)) return count;
  throw new Error("Control-flow cycle did not complete");
}

function createFixture(
  kind: CpuControlFlowKind,
  initialProgramCounter: number,
  initialStackPointer: number,
  memory: ReadonlyMap<number, number>,
): {
  readonly cycle: CpuControlFlowCycle;
  readonly port: CpuControlFlowCyclePort;
  readonly readByte: ReturnType<typeof vi.fn<(address: number) => number>>;
  readonly pushes: readonly number[];
  readonly programCounter: () => number;
  readonly processorFlags: () => number;
} {
  let programCounter = initialProgramCounter;
  let stackPointer = initialStackPointer;
  let processorFlags = 0;
  const pushes: number[] = [];
  const readByte = vi.fn<(address: number) => number>((address) => memory.get(address) ?? 0);
  return {
    cycle: new CpuControlFlowCycle(kind),
    readByte,
    pushes,
    programCounter: () => programCounter,
    processorFlags: () => processorFlags,
    port: {
      readByte,
      getProgramCounter: () => programCounter,
      setProgramCounter: (value) => {
        programCounter = value & 0xffff;
      },
      pushByte: (value) => {
        pushes.push(value & 0xff);
        stackPointer = (stackPointer - 1) & 0xff;
      },
      pullByte: () => {
        stackPointer = (stackPointer + 1) & 0xff;
        return memory.get(0x0100 | stackPointer) ?? 0;
      },
      setProcessorFlags: (value) => {
        processorFlags = value & 0xff;
      },
    },
  };
}
