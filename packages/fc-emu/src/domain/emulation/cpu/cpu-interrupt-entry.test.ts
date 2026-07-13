import { describe, expect, it } from "vitest";
import { CpuInterruptEntry, type CpuInterruptEntryPort } from "./cpu-interrupt-entry.js";

describe("CpuInterruptEntry", () => {
  it("runs the seven-cycle hardware IRQ entry sequence", () => {
    const port = createPort();
    const entry = new CpuInterruptEntry("irq");

    expect(clockUntilFinished(entry, port)).toBe(7);
    expect(port.reads).toEqual([0x8000, 0x8000, 0xfffe, 0xffff]);
    expect(port.pushes).toEqual([0x80, 0x00, 0x24]);
    expect(port.pc).toBe(0x1234);
    expect(port.interruptDisabled).toBe(true);
  });

  it("allows NMI to hijack IRQ vectoring after the return address is pushed", () => {
    const port = createPort();
    const entry = new CpuInterruptEntry("irq");
    for (let cycle = 0; cycle < 4; cycle++) entry.clock(port);
    port.nmiPending = true;

    expect(clockUntilFinished(entry, port)).toBe(3);
    expect(port.reads.slice(-2)).toEqual([0xfffa, 0xfffb]);
    expect(port.pc).toBe(0x5678);
    expect(port.nmiPending).toBe(false);
  });

  it("does not let an NMI arriving after the status push hijack the selected vector", () => {
    const port = createPort();
    const entry = new CpuInterruptEntry("irq");
    for (let cycle = 0; cycle < 5; cycle++) entry.clock(port);
    port.nmiPending = true;

    expect(clockUntilFinished(entry, port)).toBe(2);
    expect(port.reads.slice(-2)).toEqual([0xfffe, 0xffff]);
    expect(port.pc).toBe(0x1234);
    expect(port.nmiPending).toBe(true);
  });

  it("runs BRK padding and pushes a set break flag in six remaining cycles", () => {
    const port = createPort();
    port.pc = 0x8001;
    const entry = new CpuInterruptEntry("brk");

    expect(clockUntilFinished(entry, port)).toBe(6);
    expect(port.reads).toEqual([0x8001, 0xfffe, 0xffff]);
    expect(port.pushes).toEqual([0x80, 0x02, 0x34]);
    expect(port.pc).toBe(0x1234);
  });
});

type TestPort = CpuInterruptEntryPort & {
  pc: number;
  readonly reads: number[];
  readonly pushes: number[];
  nmiPending: boolean;
  interruptDisabled: boolean;
};

function createPort(): TestPort {
  return {
    pc: 0x8000,
    reads: [],
    pushes: [],
    nmiPending: false,
    interruptDisabled: false,
    readByte(address) {
      this.reads.push(address);
      if (address === 0xfffe) return 0x34;
      if (address === 0xffff) return 0x12;
      if (address === 0xfffa) return 0x78;
      if (address === 0xfffb) return 0x56;
      return 0;
    },
    pushByte(value) {
      this.pushes.push(value & 0xff);
    },
    getProgramCounter() {
      return this.pc;
    },
    setProgramCounter(value) {
      this.pc = value & 0xffff;
    },
    getProcessorFlags() {
      return 0x24;
    },
    setInterruptDisabled() {
      this.interruptDisabled = true;
    },
    consumeNmiForVectorHijack() {
      if (!this.nmiPending) return false;
      this.nmiPending = false;
      return true;
    },
  };
}

function clockUntilFinished(entry: CpuInterruptEntry, port: TestPort): number {
  let cycles = 0;
  while (!entry.clock(port)) cycles++;
  return cycles + 1;
}
