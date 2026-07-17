import { describe, expect, it, vi } from "vitest";
import { createTestCartridge } from "../../../test-support/rom.js";
import Bus from "./bus.js";

describe("2A03 CPU", () => {
  it("loads the reset vector and power-on register state", () => {
    const bus = createBus([0xea], { resetVector: 0x8123 });
    expect(bus.CPU.state).toMatchObject({ PC: 0x8123, SP: 0xfd, P: 0x24 });
  });

  it("ignores the stack-only status bits restored by RTI", () => {
    const bus = createBus([0x40]);
    bus.RAM[0x01fe] = 0x10;
    bus.RAM[0x01ff] = 0x34;
    bus.RAM[0x0100] = 0x12;

    bus.CPU.update();

    expect(bus.CPU.state).toMatchObject({ PC: 0x1234, SP: 0, P: 0x20 });
  });

  it("preserves registers and arithmetic flags while consuming three stack bytes on reset", () => {
    const bus = createBus([0xea], { resetVector: 0x8123 });
    bus.CPU.state = { A: 1, X: 2, Y: 3, PC: 0x9000, SP: 0x10, P: 0xc9 };

    bus.reset();

    expect(bus.CPU.state).toEqual({ A: 1, X: 2, Y: 3, PC: 0x8123, SP: 0x0d, P: 0xed });
  });

  it("uses the memory operand for ASL carry and wraps the result to a byte", () => {
    const bus = createBus([0x06, 0x10]);
    bus.RAM[0x10] = 0x80;
    bus.CPU.update();
    expect(bus.RAM[0x10]).toBe(0);
    expect(bus.CPU.state.P & 0x03).toBe(0x03);
  });

  it("sets ROL flags from the rotated memory value", () => {
    const bus = createBus([0x38, 0x26, 0x10]);
    bus.RAM[0x10] = 0x40;
    bus.CPU.update();
    bus.CPU.update();
    expect(bus.RAM[0x10]).toBe(0x81);
    expect(bus.CPU.state.P & 0x82).toBe(0x80);
  });

  it("wraps ADC results and register increments at eight bits", () => {
    const bus = createBus([0xa9, 0xff, 0x69, 0x01, 0xe8]);
    bus.CPU.update();
    bus.CPU.update();
    expect(bus.CPU.state.A).toBe(0);
    expect(bus.CPU.state.P & 0x03).toBe(0x03);
    bus.CPU.state = { ...bus.CPU.state, X: 0xff };
    bus.CPU.update();
    expect(bus.CPU.state.X).toBe(0);
  });

  it("clocks a two-cycle implied instruction as fetch then dummy-read execution", () => {
    const bus = createBus([0xe8]);
    const beginCpuRead = vi.spyOn(bus, "beginCpuRead");

    expect(bus.CPU.clock()).toBe(1);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8001, X: 0 });
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(false);

    expect(bus.CPU.clock()).toBe(1);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8001, X: 1 });
    expect(bus.CPU.cpuCycles).toBe(2);
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(true);
    expect(beginCpuRead.mock.calls).toEqual([[0x8000], [0x8001]]);
  });

  it("finishes a two-cycle instruction before taking an NMI observed between its cycles", () => {
    const bus = createBus([0xe8, 0xea], { nmiVector: 0x9000 });

    bus.CPU.clock();
    bus.CPU.triggerNMI();
    bus.CPU.clock();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8001, X: 1, SP: 0xfd });

    bus.CPU.clock();
    expect(bus.CPU.state.SP).toBe(0xfd);
    clockCpuCycles(bus, 6);
    expect(bus.CPU.state).toMatchObject({ PC: 0x9000, SP: 0xfa });
  });

  it("clocks an immediate operand on the second production cycle", () => {
    const bus = createBus([0xa9, 0x42]);

    expect(bus.CPU.clock()).toBe(1);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8001, A: 0 });
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(false);
    expect(bus.CPU.clock()).toBe(1);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8002, A: 0x42 });
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(true);
  });

  it("steps instructions by delegating to the same cycle engine", () => {
    const bus = createBus([0xa9, 0x42, 0xa2, 0x24]);
    const beginCpuRead = vi.spyOn(bus, "beginCpuRead");

    expect(bus.CPU.update()).toBe(2);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8002, A: 0x42 });
    expect(beginCpuRead.mock.calls).toEqual([[0x8000], [0x8001]]);

    expect(bus.CPU.clock()).toBe(1);
    expect(bus.CPU.update()).toBe(1);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8004, X: 0x24 });
  });

  it("steps BRK through its complete seven-cycle entry", () => {
    const bus = createBus([0x00], { irqVector: 0x9000 });

    expect(bus.CPU.update()).toBe(7);
    expect(bus.CPU.state).toMatchObject({ PC: 0x9000, SP: 0xfa });
  });

  it("clocks RMW instructions through operand, read, write-old and write-new cycles", () => {
    const bus = createBus([0x06, 0x10]);
    bus.RAM[0x10] = 0x40;

    for (let cycle = 0; cycle < 4; cycle++) {
      expect(bus.CPU.clock()).toBe(1);
      expect(bus.RAM[0x10]).toBe(0x40);
      expect(bus.CPU.didPollInterruptsThisCycle).toBe(false);
    }
    expect(bus.CPU.clock()).toBe(1);
    expect(bus.RAM[0x10]).toBe(0x80);
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(true);
  });

  it("keeps absolute-indexed RMW on its seven hardware cycles", () => {
    const bus = createBus([0xfe, 0xff, 0x01]);
    bus.CPU.state = { ...bus.CPU.state, X: 1 };
    bus.RAM[0x0200] = 0x7f;

    for (let cycle = 0; cycle < 6; cycle++) {
      expect(bus.CPU.clock()).toBe(1);
      expect(bus.RAM[0x0200]).toBe(0x7f);
    }
    expect(bus.CPU.clock()).toBe(1);
    expect(bus.RAM[0x0200]).toBe(0x80);
    expect(bus.CPU.didPollInterruptsThisCycle).toBe(true);
  });

  it("executes a composite unofficial RMW transform once on the final write", () => {
    const bus = createBus([0x07, 0x10]);
    bus.CPU.state = { ...bus.CPU.state, A: 0x01 };
    bus.RAM[0x10] = 0x81;

    for (let cycle = 0; cycle < 5; cycle++) bus.CPU.clock();

    expect(bus.RAM[0x10]).toBe(0x02);
    expect(bus.CPU.state.A).toBe(0x03);
    expect(bus.CPU.state.P & 0x01).toBe(0x01);
  });

  it("does not service IRQ while the interrupt-disable flag is set", () => {
    const bus = createBus([0x78, 0xe8], { irqVector: 0x9000 });
    bus.CPU.update();
    bus.CPU.triggerIRQ();
    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8002, X: 1 });
  });

  it("keeps a masked IRQ pending and honors the CLI polling delay", () => {
    const bus = createBus([0x78, 0x58, 0xea, 0xea], { irqVector: 0x8003 });
    bus.CPU.update();
    bus.CPU.triggerIRQ();

    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8002, SP: 0xfd });
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8003, SP: 0xfd });
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    clockCpuCycles(bus, 7);
    expect(bus.CPU.state).toMatchObject({ PC: 0x8003, SP: 0xfa });
    expect(bus.CPU.hasPendingIRQ).toBe(false);
  });

  it("enters a level IRQ only after an instruction samples the asserted line", () => {
    const bus = createBus([0xea, 0xea], { irqVector: 0x9000 });
    bus.CPU.state = { ...bus.CPU.state, P: bus.CPU.state.P & ~0x04 };
    bus.CPU.setIRQLine(true);

    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8001, SP: 0xfd });
    clockCpuCycles(bus, 7);
    expect(bus.CPU.state).toMatchObject({ PC: 0x9000, SP: 0xfa });
  });

  it("keeps an IRQ recognized at the polling point after the physical line is released", () => {
    const bus = createBus([0xea, 0xea], { irqVector: 0x9000 });
    bus.CPU.state = { ...bus.CPU.state, P: bus.CPU.state.P & ~0x04 };
    bus.CPU.setIRQLine(true);

    bus.CPU.update();
    bus.CPU.setIRQLine(false);
    expect(bus.CPU.isIRQLineAsserted).toBe(false);
    expect(bus.CPU.hasPendingIRQ).toBe(true);

    clockCpuCycles(bus, 7);
    expect(bus.CPU.state).toMatchObject({ PC: 0x9000, SP: 0xfa });
  });

  it("lets one instruction run when IRQ appears on a taken non-crossing branch's last cycle", () => {
    const bus = createBus([0x18, 0x90, 0x00, 0xea, 0xea], { irqVector: 0x9000 });
    bus.CPU.state = { ...bus.CPU.state, P: bus.CPU.state.P & ~0x04 };

    bus.CPU.update();
    bus.CPU.clock();
    bus.CPU.clock();
    bus.CPU.setIRQLine(true);
    bus.CPU.clock();
    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ PC: 0x8004, SP: 0xfd });

    clockCpuCycles(bus, 7);
    expect(bus.CPU.state).toMatchObject({ PC: 0x9000, SP: 0xfa });
  });

  it("polls every branch after its opcode and a crossing branch again before PCH fixup", () => {
    const nonCrossing = createBus([0x90, 0x00]);
    nonCrossing.CPU.state = { ...nonCrossing.CPU.state, P: nonCrossing.CPU.state.P & ~0x01 };

    nonCrossing.CPU.clock();
    expect(nonCrossing.CPU.didPollInterruptsThisCycle).toBe(false);
    nonCrossing.CPU.clock();
    expect(nonCrossing.CPU.didPollInterruptsThisCycle).toBe(true);
    nonCrossing.CPU.clock();
    expect(nonCrossing.CPU.didPollInterruptsThisCycle).toBe(false);

    const crossing = createBus([0x90, 0xfd]);
    crossing.CPU.state = { ...crossing.CPU.state, P: crossing.CPU.state.P & ~0x01 };

    crossing.CPU.clock();
    expect(crossing.CPU.didPollInterruptsThisCycle).toBe(false);
    crossing.CPU.clock();
    expect(crossing.CPU.didPollInterruptsThisCycle).toBe(true);
    crossing.CPU.clock();
    expect(crossing.CPU.didPollInterruptsThisCycle).toBe(false);
    crossing.CPU.clock();
    expect(crossing.CPU.didPollInterruptsThisCycle).toBe(true);
  });

  it("pushes a clear break bit for hardware interrupts", () => {
    const bus = createBus([0xea, 0xea], { nmiVector: 0x8001 });
    bus.CPU.triggerNMI();
    clockCpuCycles(bus, 7);
    expect(bus.RAM[0x01fb] & 0x10).toBe(0);
  });

  it("pushes PC + 2 and a set break bit for BRK", () => {
    const bus = createBus([0x00]);
    clockCpuCycles(bus, 7);
    expect(bus.RAM[0x01fd]).toBe(0x80);
    expect(bus.RAM[0x01fc]).toBe(0x02);
    expect(bus.RAM[0x01fb] & 0x10).toBe(0x10);
  });

  it("lets NMI hijack an IRQ vector after the return address is pushed", () => {
    const bus = createBus([0xea], { irqVector: 0x9000, nmiVector: 0xa000 });
    bus.CPU.state = { ...bus.CPU.state, P: bus.CPU.state.P & ~0x04 };
    bus.CPU.setIRQLine(true);
    bus.CPU.update();

    clockCpuCycles(bus, 4);
    bus.CPU.triggerNMI();
    clockCpuCycles(bus, 3);

    expect(bus.CPU.state).toMatchObject({ PC: 0xa000, SP: 0xfa });
    expect(bus.RAM[0x01fb] & 0x10).toBe(0);
  });

  it("keeps the break flag when NMI hijacks a BRK vector", () => {
    const bus = createBus([0x00], { irqVector: 0x9000, nmiVector: 0xa000 });
    clockCpuCycles(bus, 4);
    bus.CPU.triggerNMI();
    clockCpuCycles(bus, 3);

    expect(bus.CPU.state).toMatchObject({ PC: 0xa000, SP: 0xfa });
    expect(bus.RAM[0x01fb] & 0x10).toBe(0x10);
  });

  it("emulates the indirect JMP page-wrap hardware behavior", () => {
    const bus = createBus([0x6c, 0xff, 0x02]);
    bus.RAM[0x02ff] = 0x34;
    bus.RAM[0x0200] = 0x12;
    bus.RAM[0x0300] = 0x56;
    bus.CPU.update();
    expect(bus.CPU.state.PC).toBe(0x1234);
  });

  it("wraps the eight-bit stack pointer", () => {
    const bus = createBus([0x48]);
    bus.CPU.state = { ...bus.CPU.state, A: 0x42, SP: 0 };
    bus.CPU.update();
    expect(bus.RAM[0x0100]).toBe(0x42);
    expect(bus.CPU.state.SP).toBe(0xff);
  });

  it("branches on the overflow flag independently of carry", () => {
    const clearOverflow = createBus([0x50, 0x02]);
    clearOverflow.CPU.state = { ...clearOverflow.CPU.state, P: 0x25 };
    clearOverflow.CPU.update();
    expect(clearOverflow.CPU.state.PC).toBe(0x8004);

    const setOverflow = createBus([0x70, 0x02]);
    setOverflow.CPU.state = { ...setOverflow.CPU.state, P: 0x64 };
    setOverflow.CPU.update();
    expect(setOverflow.CPU.state.PC).toBe(0x8004);
  });

  it("models KIL as a resettable CPU halt", () => {
    const bus = createBus([0x02, 0xe8]);
    bus.CPU.update();
    const haltedState = bus.CPU.state;

    expect(bus.CPU.isHalted).toBe(true);
    bus.CPU.update();
    expect(bus.CPU.state).toEqual(haltedState);

    bus.reset();
    expect(bus.CPU.isHalted).toBe(false);
  });

  it("executes stable combined unofficial instructions", () => {
    const bus = createBus([0xa9, 0x01, 0x07, 0x10, 0xa7, 0x10, 0xcb, 0x01]);
    bus.RAM[0x10] = 0x81;

    bus.CPU.update();
    bus.CPU.update();
    expect(bus.RAM[0x10]).toBe(0x02);
    expect(bus.CPU.state).toMatchObject({ A: 0x03, PC: 0x8004 });

    bus.CPU.update();
    expect(bus.CPU.state).toMatchObject({ A: 0x02, X: 0x02 });
    bus.CPU.update();
    expect(bus.CPU.state.X).toBe(0x01);
  });

  it("models the page-crossing address corruption of unstable stores", () => {
    const bus = createBus([0x9c, 0xfe, 0x02]);
    bus.RAM[0x0300] = 0xaa;
    bus.CPU.state = { ...bus.CPU.state, X: 2, Y: 1 };

    bus.CPU.update();

    expect(bus.RAM[0x0300]).toBe(0xaa);
    expect(bus.RAM[0x0100]).toBe(0x01);
  });

  it("bypasses the unstable-store data mask when RDY stretches its dummy read", () => {
    const bus = createBus([0x9c, 0x00, 0x05]);
    bus.CPU.state = { ...bus.CPU.state, X: 0, Y: 0xa5 };
    vi.spyOn(bus, "beginCpuRead").mockImplementation((address) => address === 0x0500);

    bus.CPU.update();

    expect(bus.RAM[0x0500]).toBe(0xa5);
  });

  it("performs the indexed-store dummy read before writing a PPU register", () => {
    const bus = createBus([
      0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20, 0xa2, 0x00, 0xa9, 0x09, 0x9d,
      0x07, 0x20,
    ]);

    runInstructions(bus, 7);

    expect(bus.PPU.nameTableData[0]).toBe(0);
    expect(bus.PPU.nameTableData[1]).toBe(9);
  });

  it("performs a wrong-page dummy read for a page-crossing indexed load", () => {
    const bus = createBus([
      0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20, 0xa2, 0x08, 0xbd, 0xff, 0x20,
      0xa9, 0x7f, 0x8d, 0x07, 0x20,
    ]);

    runInstructions(bus, 8);

    expect(bus.PPU.nameTableData[1]).toBe(0);
    expect(bus.PPU.nameTableData[2]).toBe(0x7f);
  });

  it("writes the old and new values during a memory read-modify-write", () => {
    const bus = createBus([
      0xa9, 0x20, 0x8d, 0x06, 0x20, 0xa9, 0x00, 0x8d, 0x06, 0x20, 0x0e, 0x07, 0x20, 0xa9, 0x7f,
      0x8d, 0x07, 0x20,
    ]);

    runInstructions(bus, 7);

    expect(bus.PPU.nameTableData[2]).toBe(0);
    expect(bus.PPU.nameTableData[3]).toBe(0x7f);
  });
});

function createBus(
  program: readonly number[],
  vectors: {
    readonly resetVector?: number;
    readonly nmiVector?: number;
    readonly irqVector?: number;
  } = {},
): Bus {
  const bus = new Bus(createTestCartridge({ program, ...vectors }));
  return bus;
}

function clockCpuCycles(bus: Bus, cycles: number): void {
  for (let cycle = 0; cycle < cycles; cycle++) bus.CPU.clock();
}

function runInstructions(bus: Bus, count: number): void {
  for (let instruction = 0; instruction < count; instruction++) bus.CPU.update();
}
