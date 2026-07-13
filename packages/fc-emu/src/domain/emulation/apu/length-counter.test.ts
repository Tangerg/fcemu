import { describe, expect, it } from "vitest";
import { LengthCounter } from "./length-counter.js";

describe("APU length counter", () => {
  it("cannot load while disabled and is cleared when disabled", () => {
    const counter = new LengthCounter();
    counter.load(0);
    expect(counter.value).toBe(0);

    counter.enabled = true;
    counter.load(0);
    counter.commitRegisterWrites();
    expect(counter.value).toBe(10);
    counter.enabled = false;
    expect(counter.value).toBe(0);
  });

  it("applies a halt write after a same-cycle length clock", () => {
    const counter = new LengthCounter();
    counter.enabled = true;
    counter.load(3);
    counter.commitRegisterWrites();
    counter.halt = true;
    counter.clock();
    expect(counter.value).toBe(1);
    counter.commitRegisterWrites();
    counter.clock();
    expect(counter.value).toBe(1);
  });

  it("accepts a same-cycle reload at zero and ignores it after a decrement", () => {
    const empty = new LengthCounter();
    empty.enabled = true;
    empty.load(3);
    empty.clock();
    empty.commitRegisterWrites();
    expect(empty.value).toBe(2);

    const active = new LengthCounter();
    active.enabled = true;
    active.load(7);
    active.commitRegisterWrites();
    active.load(3);
    active.clock();
    active.commitRegisterWrites();
    expect(active.value).toBe(5);
  });

  it("uses the pre-clock value when a reload write follows the clock edge", () => {
    const empty = new LengthCounter();
    empty.enabled = true;
    empty.clock(10);
    empty.load(3, 10);
    empty.commitRegisterWrites();
    expect(empty.value).toBe(2);

    const active = new LengthCounter();
    active.enabled = true;
    active.load(7);
    active.commitRegisterWrites();
    active.clock(20);
    active.load(3, 20);
    active.commitRegisterWrites();
    expect(active.value).toBe(5);
  });
});
