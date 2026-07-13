import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../test-support/rom.js";
import Bus from "./bus.js";

describe("Bus lifecycle", () => {
  it("returns the retained CPU data bus for unmapped and write-only I/O reads", () => {
    const bus = new Bus(createTestCartridge());
    bus.RAM[0] = 0xa5;

    expect(bus.CPU.readByte(0)).toBe(0xa5);
    expect(bus.CPU.readByte(0x4000)).toBe(0xa5);
    expect(bus.CPU.readByte(0x4014)).toBe(0xa5);
    expect(bus.CPU.readByte(0x4018)).toBe(0xa5);
  });

  it("preserves the external CPU bus across an internal $4015 status read", () => {
    const bus = new Bus(createTestCartridge());
    bus.RAM[0] = 0x20;

    expect(bus.CPU.readByte(0)).toBe(0x20);
    expect(bus.CPU.readByte(0x4015)).toBe(0x20);
    expect(bus.CPU.readByte(0x4018)).toBe(0x20);
  });

  it("keeps DMC DMA's external bus reads isolated from the 2A03 internal data bus", () => {
    const externalSetCartridge = createTestCartridge();
    externalSetCartridge.prgRom[0] = 0x20;
    const externalSet = new Bus(externalSetCartridge);
    externalSet.RAM[0] = 0;
    externalSet.CPU.readByte(0);
    externalSet.CPU.readByteForDma(0x8000);

    expect(externalSet.CPU.readByte(0x4015) & 0x20).toBe(0);
    expect(externalSet.CPU.readByte(0x4018)).toBe(0x20);

    const internalSetCartridge = createTestCartridge();
    internalSetCartridge.prgRom[0] = 0;
    const internalSet = new Bus(internalSetCartridge);
    internalSet.RAM[0] = 0x20;
    internalSet.CPU.readByte(0);
    internalSet.CPU.readByteForDma(0x8000);

    expect(internalSet.CPU.readByte(0x4015) & 0x20).toBe(0x20);
    expect(internalSet.CPU.readByte(0x4018)).toBe(0);
  });

  it("combines DMC A0-A4 with a halted $4000-page CPU address", () => {
    const cartridge = createTestCartridge();
    cartridge.prgRom[0x16] = 0xe0;
    const bus = new Bus(cartridge);
    bus.Controller1.buttonsState = [true, false, false, false, false, false, false, false];
    bus.requestDmcDma(0x8016, "get");

    expect(bus.CPU.readByte(0x4000)).toBe(0xe1);
    expect(bus.Controller1.captureState().currentButtonIndex).toBe(1);
  });

  it("does not activate internal registers when the halted CPU address is outside $4000-$401F", () => {
    const cartridge = createTestCartridge();
    cartridge.prgRom[0x16] = 0xe0;
    const bus = new Bus(cartridge);
    bus.RAM[0] = 0x5a;
    bus.Controller1.buttonsState = [true, false, false, false, false, false, false, false];
    bus.requestDmcDma(0x8016, "get");

    expect(bus.CPU.readByte(0)).toBe(0x5a);
    expect(bus.Controller1.captureState().currentButtonIndex).toBe(0);
  });

  it("lets a DMC $x015 conflict acknowledge the internal frame IRQ register", () => {
    const bus = new Bus(createTestCartridge());
    const apuState = bus.APU.captureState();
    bus.APU.restoreState({
      ...apuState,
      frameIRQPending: true,
      frameIrqClearDelay: 0,
    });
    bus.setIRQSource("apu-frame", true);
    bus.requestDmcDma(0x8015, "get");

    bus.CPU.readByte(0x4000);

    expect(bus.captureState().irqSources).not.toContain("apu-frame");
    expect(bus.APU.captureState().frameIRQPending).toBe(true);
  });

  it.each([
    { pressed: false, expected: 0x40 },
    { pressed: true, expected: 0x41 },
  ])("combines controller D0=$pressed with CPU open-bus high bits", ({ pressed, expected }) => {
    const bus = new Bus(createTestCartridge({ program: [0xad, 0x16, 0x40] }));
    bus.Controller1.buttonsState = [pressed, false, false, false, false, false, false, false];

    bus.CPU.update();

    expect(bus.CPU.state.A).toBe(expected);
  });

  it("captures and restores the CPU data-bus latch", () => {
    const bus = new Bus(createTestCartridge());
    bus.RAM[0] = 0x5a;
    bus.CPU.readByte(0);
    const snapshot = bus.captureState();
    bus.RAM[1] = 0xc3;
    bus.CPU.readByte(1);

    bus.restoreState(snapshot);

    expect(bus.CPU.readByte(0x4018)).toBe(0x5a);
  });

  it("commits only the latest $4016 write on a PUT cycle", () => {
    const bus = new Bus(createTestCartridge());
    const oneCpuCycle = 1 / bus.Timing.cpuFrequencyHz;
    for (let read = 0; read < 8; read++) bus.CPU.readByte(0x4016);

    bus.updateSeconds(oneCpuCycle); // Complete the initial PUT without a write.
    bus.scheduleControllerWrite(1);
    bus.updateSeconds(oneCpuCycle); // GET: high remains pending.
    expect(bus.captureState().pendingControllerWrite).toBe(1);
    expect(bus.Controller1.captureState()).toMatchObject({
      currentButtonIndex: 8,
      strobeSignal: false,
    });

    bus.scheduleControllerWrite(0);
    bus.updateSeconds(oneCpuCycle); // PUT: the newer low value wins.
    expect(bus.captureState().pendingControllerWrite).toBeUndefined();
    expect(bus.Controller1.captureState()).toMatchObject({
      currentButtonIndex: 8,
      strobeSignal: false,
    });

    bus.updateSeconds(oneCpuCycle); // GET without a write.
    bus.scheduleControllerWrite(1);
    bus.updateSeconds(oneCpuCycle); // PUT: high reaches OUT0 and reloads the pad.
    expect(bus.Controller1.captureState()).toMatchObject({
      currentButtonIndex: 0,
      strobeSignal: true,
    });

    bus.scheduleControllerWrite(0);
    bus.updateSeconds(oneCpuCycle); // GET: low remains pending.
    expect(bus.Controller1.captureState().strobeSignal).toBe(true);
    bus.updateSeconds(oneCpuCycle); // PUT: serial mode resumes.
    expect(bus.Controller1.captureState().strobeSignal).toBe(false);
  });

  it("lets an RMW second write replace a pending OAM DMA before halt", () => {
    const bus = new Bus(createTestCartridge({ program: [0xee, 0x14, 0x40, 0x02] }));
    const oneCpuCycle = 1 / bus.Timing.cpuFrequencyHz;

    for (let step = 0; step < 700 && !bus.CPU.isHalted; step++) {
      bus.updateSeconds(oneCpuCycle);
    }

    expect(bus.CPU.isHalted).toBe(true);
    expect(bus.captureState().dma.sprite.page).toBe(0x41);
    expect(bus.CPU.cpuCycles).toBeLessThan(600);
  });

  it("keeps RAM and mapper latches across a soft reset", () => {
    const cartridge = createTestCartridge({ mapper: 2, prgBanks: 2 });
    cartridge.prgRom.fill(0x11, 0, 0x4000);
    cartridge.prgRom.fill(0x22, 0x4000);
    const bus = new Bus(cartridge);
    bus.RAM[0] = 0x31;
    bus.Mapper.write(0x6000, 0x32);
    bus.Mapper.write(0x8000, 1);

    bus.reset();

    expect(bus.RAM[0]).toBe(0x31);
    expect(bus.Mapper.read(0x6000)).toBe(0x32);
    expect(bus.Mapper.read(0x8000)).toBe(0x22);
  });

  it("returns volatile memory and mapper latches to deterministic power-on state", () => {
    const cartridge = createTestCartridge({ mapper: 2, prgBanks: 2 });
    cartridge.prgRom.fill(0x11, 0, 0x4000);
    cartridge.prgRom.fill(0x22, 0x4000);
    const bus = new Bus(cartridge);
    bus.RAM[0] = 0x41;
    bus.Mapper.write(0x6000, 0x42);
    bus.Mapper.write(0x8000, 1);

    bus.powerOn();

    expect(bus.RAM[0]).toBe(0);
    expect(bus.Mapper.read(0x6000)).toBe(0);
    expect(bus.Mapper.read(0x8000)).toBe(0x11);
    expect(bus.CPU.state).toMatchObject({ A: 0, X: 0, Y: 0, SP: 0xfd, P: 0x24 });
  });

  it("retains battery-backed cartridge memory across power-on", () => {
    const bus = new Bus(createTestCartridge({ mapper: 2, prgBanks: 2, battery: true }));
    bus.Mapper.write(0x6000, 0x52);

    bus.powerOn();

    expect(bus.Mapper.read(0x6000)).toBe(0x52);
  });

  it.each([
    { region: "ntsc" as const, returnedButton: 1, shiftedButtons: 2 },
    { region: "pal" as const, returnedButton: 0, shiftedButtons: 1 },
  ])(
    "applies the $region DMC/controller-read silicon behavior",
    ({ region, returnedButton, shiftedButtons }) => {
      const bus = new Bus(createTestCartridge(), 44_100, region);
      bus.Controller1.buttonsState = [false, true, false, false, false, false, false, false];
      bus.requestDmcDma(0x8000, "get");

      expect(bus.CPU.readByte(0x4016) & 1).toBe(returnedButton);
      expect(bus.Controller1.captureState().currentButtonIndex).toBe(shiftedButtons);
    },
  );
});
