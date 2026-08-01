import { describe, expect, it } from "vitest";
import { VsSystem } from "./vs-system.js";

describe("VsSystem", () => {
  it("drives serial input, service, coin and all eight DIP switch lines", () => {
    const system = new VsSystem(0, 1000);
    system.powerOn();
    system.setServiceButton(true);
    for (const index of [1, 3, 8]) system.setDipSwitch(index, true);
    system.insertCoin(1);

    expect(system.readController(1, 1)).toBe(0x2d);
    expect(system.readController(2, 0)).toBe(0x84);

    system.tickCpuCycles(50);
    expect(system.readController(1, 0) & 0x20).toBe(0);
  });

  it("implements the TKO and RBI resettable security streams", () => {
    const tko = new VsSystem(2, 1000);
    tko.powerOn();
    expect(tko.readExpansion(0x5e00, 0)?.value).toBe(0);
    expect([0, 1, 2, 3].map(() => tko.readExpansion(0x5e01, 0)?.value)).toEqual([
      0xff, 0xbf, 0xb7, 0x97,
    ]);

    const rbi = new VsSystem(1, 1000);
    rbi.powerOn();
    expect(rbi.readExpansion(0x5600, 0)?.value).toBe(0);
    expect(Array.from({ length: 5 }, () => rbi.readExpansion(0x5601, 0)?.value).at(-1)).toBe(0xb4);
  });

  it("models the two Super Xevious protection phases at their decoded addresses", () => {
    const system = new VsSystem(3, 1000);
    system.powerOn();

    expect(
      [0x54ff, 0x5678, 0x578f, 0x5567, 0x54ff, 0x5678, 0x578f, 0x5567].map(
        (address) => system.readExpansion(address, 0)?.value,
      ),
    ).toEqual([0x05, 0x01, 0x89, 0x37, 0x05, 0x00, 0xd1, 0x3e]);
  });

  it("captures timed inputs, counter output and protection position atomically", () => {
    const system = new VsSystem(2, 1000);
    system.powerOn();
    system.insertCoin(2);
    system.setDipSwitch(4, true);
    system.writeExpansion(0x4020, 1);
    void system.readExpansion(0x5e01, 0);
    const state = system.captureState();

    const restored = new VsSystem(2, 1000);
    restored.powerOn();
    restored.restoreState(state);
    expect(restored.captureState()).toEqual(state);
    expect(() => restored.restoreState({ ...state, coin1CyclesRemaining: 51 })).toThrow(RangeError);
  });

  it("rejects malformed cabinet commands without changing cabinet state", () => {
    const system = new VsSystem(0, 1000);
    system.powerOn();
    const before = system.captureState();

    expect(() => system.insertCoin(3 as 1 | 2)).toThrow(/slot must be 1 or 2/i);
    expect(() => system.setServiceButton(1 as unknown as boolean)).toThrow(/must be boolean/i);
    expect(() => system.setDipSwitch(1, "yes" as unknown as boolean)).toThrow(/must be boolean/i);
    expect(system.captureState()).toEqual(before);
  });
});
