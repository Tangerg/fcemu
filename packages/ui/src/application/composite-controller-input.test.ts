import { describe, expect, it, vi } from "vitest";
import { CompositeControllerInput } from "./composite-controller-input.js";
import type { ControllerInputEvent, ControllerInputPort } from "./ports.js";

class TestInput implements ControllerInputPort {
  private listener: ((event: ControllerInputEvent) => void) | undefined;

  subscribe(listener: (event: ControllerInputEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }

  emit(event: ControllerInputEvent): void {
    this.listener?.(event);
  }
}

describe("CompositeControllerInput", () => {
  it("does not release a button while another source still holds it", () => {
    const keyboard = new TestInput();
    const gamepad = new TestInput();
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    new CompositeControllerInput([keyboard, gamepad]).subscribe(listener);

    keyboard.emit({ player: 1, button: "a", pressed: true });
    gamepad.emit({ player: 1, button: "a", pressed: true });
    keyboard.emit({ player: 1, button: "a", pressed: false });
    expect(listener).toHaveBeenCalledTimes(1);

    gamepad.emit({ player: 1, button: "a", pressed: false });
    expect(listener).toHaveBeenLastCalledWith({ player: 1, button: "a", pressed: false });
  });
});
