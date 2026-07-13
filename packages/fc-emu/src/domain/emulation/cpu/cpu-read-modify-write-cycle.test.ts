import { describe, expect, it, vi } from "vitest";
import {
  CpuReadModifyWriteCycle,
  type CpuReadModifyWriteCyclePort,
} from "./cpu-read-modify-write-cycle.js";

describe("CPU read-modify-write data cycles", () => {
  it("reads, writes the old byte, then writes the wrapped transformed byte", () => {
    const events: string[] = [];
    const port: CpuReadModifyWriteCyclePort = {
      readByte: vi.fn<(address: number) => number>((address) => {
        events.push(`read:${address.toString(16)}`);
        return 0xff;
      }),
      writeByte: vi.fn<(address: number, value: number) => void>((address, value) => {
        events.push(`write:${address.toString(16)}:${value.toString(16)}`);
      }),
    };
    const cycle = new CpuReadModifyWriteCycle(0x1234, (value) => value + 1);

    expect(cycle.clock(port)).toBeUndefined();
    expect(cycle.clock(port)).toBeUndefined();
    expect(cycle.clock(port)).toBe(0x00);

    expect(events).toEqual(["read:1234", "write:1234:ff", "write:1234:0"]);
  });

  it("invokes the transform exactly once on the final cycle", () => {
    const transform = vi.fn<(value: number) => number>((value) => value << 1);
    const cycle = new CpuReadModifyWriteCycle(0x10, transform);
    const port: CpuReadModifyWriteCyclePort = {
      readByte: () => 0x40,
      writeByte: () => undefined,
    };

    cycle.clock(port);
    cycle.clock(port);
    expect(transform).not.toHaveBeenCalled();
    expect(cycle.clock(port)).toBe(0x80);
    expect(transform).toHaveBeenCalledOnce();
  });
});
