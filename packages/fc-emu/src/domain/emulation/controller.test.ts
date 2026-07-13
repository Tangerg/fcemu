import { describe, expect, it } from "vitest";
import Controller, { ControllerButton } from "./controller.js";

describe("Controller", () => {
  it("serializes pressed buttons in NES shift-register order", () => {
    const controller = new Controller();
    controller.setButton(ControllerButton.A, true);
    controller.setButton(ControllerButton.Start, true);
    expect(Array.from({ length: 8 }, () => controller.currentButton)).toEqual([
      1, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it("holds the A button at the front while strobe is high", () => {
    const controller = new Controller();
    controller.setButton(ControllerButton.A, true);
    controller.strobe = 1;
    expect([controller.currentButton, controller.currentButton]).toEqual([1, 1]);
  });

  it("returns a high sentinel after the eight button bits are exhausted", () => {
    const controller = new Controller();
    const bits = Array.from({ length: 10 }, () => controller.currentButton);

    expect(bits).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(controller.captureState().currentButtonIndex).toBe(8);
  });

  it("resets serial state on power-on while preserving physical buttons", () => {
    const controller = new Controller();
    controller.setButton(ControllerButton.A, true);
    void controller.currentButton;
    void controller.currentButton;

    controller.powerOn();

    expect([controller.currentButton, controller.currentButton]).toEqual([1, 0]);
  });

  it("requires one complete standard eight-button input report", () => {
    const controller = new Controller();

    expect(() => {
      controller.buttonsState = [true];
    }).toThrow(/eight/);
    expect(() => controller.setButton(8 as ControllerButton, true)).toThrow(RangeError);
  });

  it("rejects an impossible save-state shift position", () => {
    const controller = new Controller();
    const state = controller.captureState();

    expect(() => controller.restoreState({ ...state, currentButtonIndex: 9 })).toThrow(RangeError);
  });
});
