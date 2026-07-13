import { describe, expect, it } from "vitest";
import { createTestCartridge } from "../../../../test-support/rom.js";
import Bus from "../bus.js";
import { Mmc1Board } from "./mmc1-board.js";
import { Mmc1Mapper } from "./mmc1-mapper.js";

describe("MMC1 mapper", () => {
  it("ignores an RMW instruction's second consecutive D0 write", () => {
    const cartridge = createTestCartridge({
      mapper: 1,
      prgBanks: 4,
      chrBanks: 2,
      resetVector: 0x8000,
      program: [
        0xee,
        0x00,
        0xe0, // INC $E000: writes $FF, then $00 on the next CPU cycle
        0xa9,
        0x01, // LDA #$01
        0x8d,
        0x00,
        0x80, // five non-consecutive serial writes of control value $01
        0x4a,
        0x8d,
        0x00,
        0x80,
        0x4a,
        0x8d,
        0x00,
        0x80,
        0x4a,
        0x8d,
        0x00,
        0x80,
        0x4a,
        0x8d,
        0x00,
        0x80,
        0x02, // KIL
      ],
    });
    cartridge.prgRom[0xe000] = 0xff;
    const bus = new Bus(cartridge);

    for (let cycle = 0; cycle < 100 && !bus.CPU.isHalted; cycle++) bus.CPU.clock();

    expect(bus.CPU.isHalted).toBe(true);
    expect(bus.Mapper.captureState()).toMatchObject({
      kind: "mmc1",
      shiftRegister: 0x10,
      control: 0x01,
    });
  });

  it("still accepts a D7 reset on the second consecutive write", () => {
    const mapper = new Mmc1Mapper(createTestCartridge({ mapper: 1 }), Mmc1Board.standard());
    mapper.observeCpuBusCycle(true);
    mapper.write(0x8000, 0x01);
    expect(mapper.captureState()).toMatchObject({ shiftRegister: 0x18 });

    mapper.observeCpuBusCycle(true);
    mapper.write(0x8000, 0x80);

    expect(mapper.captureState()).toMatchObject({ shiftRegister: 0x10, control: 0x0c });
  });

  it("round-trips whether the previous CPU bus cycle was a write", () => {
    const mapper = new Mmc1Mapper(createTestCartridge({ mapper: 1 }), Mmc1Board.standard());
    mapper.observeCpuBusCycle(true);
    const state = mapper.captureState();
    mapper.powerOn();
    mapper.restoreState(state);

    mapper.observeCpuBusCycle(true);
    mapper.write(0x8000, 0x01);

    expect(mapper.captureState()).toMatchObject({
      shiftRegister: 0x10,
      previousCpuCycleWasWrite: true,
    });
  });
});
