import { describe, expect, it, vi } from "vitest";
import { createTestCartridge } from "../../../test-support/rom.js";
import Bus from "./bus.js";
import { CartridgeTimingMode } from "../model/cartridge.js";

describe("2A03 APU", () => {
  it("loads a length counter only while its channel is enabled", () => {
    const bus = new Bus(createTestCartridge());

    bus.APU.writeRegister(0x4003, 0);
    expect(bus.APU.readRegister(0x4015) & 1).toBe(0);

    bus.APU.writeRegister(0x4015, 1);
    bus.APU.writeRegister(0x4003, 0);
    bus.APU.commitRegisterWrites();
    expect(bus.APU.readRegister(0x4015) & 1).toBe(1);

    bus.APU.writeRegister(0x4015, 0);
    expect(bus.APU.readRegister(0x4015) & 1).toBe(0);
  });

  it("commits ordered register events on their APU cycles", () => {
    const bus = new Bus(createTestCartridge());

    bus.APU.scheduleRegisterWrite(0x4015, 1, 1);
    bus.APU.scheduleRegisterWrite(0x4003, 0, 2);
    bus.APU.update();
    expect(bus.APU.readRegister(0x4015) & 1).toBe(0);

    bus.APU.update();
    expect(bus.APU.readRegister(0x4015) & 1).toBe(1);
  });

  it("commits a register event that is already due", () => {
    const bus = new Bus(createTestCartridge());

    bus.APU.scheduleRegisterWrite(0x4015, 1, 0);
    bus.APU.scheduleRegisterWrite(0x4003, 0, 0);

    expect(bus.APU.readRegister(0x4015) & 1).toBe(1);
  });

  it("keeps the frame IRQ flag visible until the next APU-cycle boundary", () => {
    const bus = new Bus(createTestCartridge());
    const state = bus.APU.captureState();
    bus.APU.restoreState({
      ...state,
      frameIRQPending: true,
      frameIrqClearDelay: 0,
    });

    expect(bus.APU.readRegister(0x4015) & 0x40).toBe(0x40);
    expect(bus.APU.captureState().frameIrqClearDelay).toBe(2);
    expect(bus.APU.readRegister(0x4015) & 0x40).toBe(0x40);

    bus.APU.update();

    expect(bus.APU.readRegister(0x4015) & 0x40).toBe(0x40);

    bus.APU.update();

    expect(bus.APU.readRegister(0x4015) & 0x40).toBe(0);
  });

  it.each([
    [CartridgeTimingMode.Ntsc, 1_789_773],
    [CartridgeTimingMode.Pal, 1_662_607],
    [CartridgeTimingMode.Dendy, 1_773_448],
  ])("emits timing mode %i samples at the selected device rate", (timingMode, cpuFrequency) => {
    const sampleRate = 1000;
    const cpuCycles = 100_000;
    const bus = new Bus(
      createTestCartridge({
        nes2: timingMode !== CartridgeTimingMode.Ntsc,
        timingMode,
      }),
      sampleRate,
    );
    const writeSample = vi.fn<(sample: number) => void>();
    bus.APU.addListener(writeSample);

    for (let cycle = 0; cycle < cpuCycles; cycle++) bus.APU.update();

    expect(writeSample).toHaveBeenCalledTimes(Math.floor((cpuCycles * sampleRate) / cpuFrequency));
  });

  it("removes the DC bias from the mixed output through the analog output filters", () => {
    const sampleRate = 8000;
    const bus = new Bus(createTestCartridge(), sampleRate);
    const samples: number[] = [];
    bus.APU.addListener((sample) => {
      samples.push(sample);
    });

    // $4011 drives a constant level onto the DMC DAC, so the raw mix is pure DC.
    bus.APU.writeRegister(0x4011, 64);
    for (let cycle = 0; cycle < 200_000; cycle++) bus.APU.update();

    expect(samples.length).toBeGreaterThan(100);
    // The high-pass stages let the initial step through, then drain the bias so
    // the long-run average returns to zero instead of the ~0.34 raw DC level.
    expect(Math.abs(samples[0] ?? 0)).toBeGreaterThan(0.05);
    const average = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    expect(Math.abs(average)).toBeLessThan(0.02);
    expect(Math.abs(samples[samples.length - 1] ?? 0)).toBeLessThan(0.01);
  });

  it("rejects invalid audio sample rates", () => {
    expect(() => new Bus(createTestCartridge(), 0)).toThrow(/sample rate/i);
    expect(() => new Bus(createTestCartridge(), Number.NaN)).toThrow(/sample rate/i);
  });

  it("recreates channel state on power-on", () => {
    const bus = new Bus(createTestCartridge());
    bus.APU.writeRegister(0x4015, 1);
    bus.APU.writeRegister(0x4003, 0);
    bus.APU.commitRegisterWrites();
    expect(bus.APU.readRegister(0x4015) & 1).toBe(1);

    bus.powerOn();

    expect(bus.APU.readRegister(0x4015)).toBe(0);
  });
});
