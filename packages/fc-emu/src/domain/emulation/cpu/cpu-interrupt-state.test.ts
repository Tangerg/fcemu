import { describe, expect, it } from "vitest";
import { CpuInterruptState } from "./cpu-interrupt-state.js";

describe("CpuInterruptState", () => {
  it("keeps a sampled IRQ after the physical line is released", () => {
    const interrupts = enabledInterrupts();
    interrupts.setIrqLine(true);
    interrupts.sampleIrqLine();
    interrupts.setIrqLine(false);

    expect(interrupts.isIrqLineAsserted).toBe(false);
    expect(interrupts.hasPendingIrq).toBe(true);
    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("keeps an IRQ recognized by an earlier branch poll", () => {
    const interrupts = enabledInterrupts();
    interrupts.setIrqLine(true);
    interrupts.sampleIrqLine();
    interrupts.setIrqLine(false);
    interrupts.sampleIrqLine();

    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("discards a sampled IRQ when the polling boundary is masked", () => {
    const interrupts = new CpuInterruptState();
    interrupts.reset(true);
    interrupts.setIrqLine(true);
    interrupts.sampleIrqLine();
    interrupts.setIrqLine(false);

    expect(interrupts.takeIrqForInstruction()).toBe(false);
    interrupts.setIrqPollingDisabled(false);
    expect(interrupts.takeIrqForInstruction()).toBe(false);
  });

  it("defers a branch-final IRQ sample unless explicitly allowed", () => {
    const interrupts = enabledInterrupts();
    interrupts.setIrqLine(true);
    interrupts.deferIrqSampleAfterBranch();
    interrupts.sampleIrqLine();
    expect(interrupts.takeIrqForInstruction()).toBe(false);

    interrupts.sampleIrqLine(true);
    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("defers an IRQ first sampled during DMA until the halted instruction completes", () => {
    const interrupts = enabledInterrupts();
    interrupts.setIrqLine(true);
    interrupts.captureIrqDuringDma();

    expect(interrupts.takeIrqForInstruction()).toBe(false);
    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("does not defer an IRQ that was already sampled before DMA", () => {
    const interrupts = enabledInterrupts();
    interrupts.setIrqLine(true);
    interrupts.sampleIrqLine();
    interrupts.captureIrqDuringDma();

    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("passes a requested NMI through the instruction-polling latch", () => {
    const interrupts = enabledInterrupts();
    interrupts.requestNmi();
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(false);

    interrupts.sampleNmiLine();
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(true);
  });

  it("separates the current NMI edge from the previous-cycle instruction sample", () => {
    const interrupts = enabledInterrupts();
    interrupts.requestNmi();

    expect(interrupts.takeNmiForInstruction()).toBe(false);
    expect(interrupts.consumeNmiForVectorHijack()).toBe(true);

    interrupts.requestNmi();
    interrupts.sampleNmiLine();
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(true);
  });

  it("ignores an /NMI pulse that ends before the CPU input-sampling phase", () => {
    const interrupts = enabledInterrupts();
    interrupts.setNmiLine(true);
    interrupts.setNmiLine(false);
    interrupts.sampleNmiLine();
    interrupts.beginCpuUpdate();
    interrupts.beginCpuUpdate();

    expect(interrupts.takeNmiForInstruction()).toBe(false);
  });

  it("passes a sampled /NMI edge through both CPU recognition latches", () => {
    const interrupts = enabledInterrupts();
    interrupts.setNmiLine(true);
    interrupts.sampleNmiLine();
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(false);

    interrupts.setNmiLine(false);
    interrupts.sampleNmiLine();
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(true);
  });

  it("defers an NMI observed after interrupt entry for one instruction", () => {
    const interrupts = enabledInterrupts();
    interrupts.finishInterruptEntry(false);
    interrupts.requestNmi(true);
    interrupts.beginCpuUpdate();

    expect(interrupts.takeNmiForInstruction()).toBe(false);
    interrupts.beginCpuUpdate();
    expect(interrupts.takeNmiForInstruction()).toBe(true);
  });

  it("lets NMI consume its edge while preserving a pending IRQ", () => {
    const interrupts = enabledInterrupts();
    interrupts.requestIrq();
    interrupts.requestNmi(true);
    interrupts.beginCpuUpdate();

    expect(interrupts.takeNmiForInstruction()).toBe(true);
    expect(interrupts.takeIrqForInstruction()).toBe(true);
  });

  it("allows a pending NMI to hijack an interrupt vector once", () => {
    const interrupts = enabledInterrupts();
    interrupts.requestNmi();

    expect(interrupts.consumeNmiForVectorHijack()).toBe(true);
    expect(interrupts.consumeNmiForVectorHijack()).toBe(false);
  });
});

function enabledInterrupts(): CpuInterruptState {
  const interrupts = new CpuInterruptState();
  interrupts.reset(false);
  return interrupts;
}
