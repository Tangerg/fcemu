import { describe, expect, it, vi } from "vitest";
import type { ControllerInputEvent } from "../../application/ports.js";
import { GamepadControllerInput } from "./gamepad-controller-input.js";

class TestGamepadEnvironment {
  gamepads: Array<Gamepad | null> = [];
  private callback: FrameRequestCallback | undefined;

  getGamepads(): readonly (Gamepad | null)[] {
    return this.gamepads;
  }

  requestFrame(callback: FrameRequestCallback): number {
    this.callback = callback;
    return 1;
  }

  cancelFrame(): void {
    this.callback = undefined;
  }

  poll(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.(0);
  }
}

describe("GamepadControllerInput", () => {
  it("maps standard buttons and axes to stable player slots", () => {
    const environment = new TestGamepadEnvironment();
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    const input = new GamepadControllerInput(environment);
    const unsubscribe = input.subscribe(listener);

    environment.gamepads = [gamepad(3, { buttons: [0], axes: [-1, 0] }), gamepad(7)];
    environment.poll();
    expect(listener).toHaveBeenCalledWith({ player: 1, button: "a", pressed: true });
    expect(listener).toHaveBeenCalledWith({ player: 1, button: "left", pressed: true });

    listener.mockClear();
    environment.gamepads = [null, gamepad(7, { buttons: [9] })];
    environment.poll();
    expect(listener).toHaveBeenCalledWith({ player: 1, button: "a", pressed: false });
    expect(listener).toHaveBeenCalledWith({ player: 1, button: "left", pressed: false });
    expect(listener).toHaveBeenCalledWith({ player: 2, button: "start", pressed: true });

    unsubscribe();
  });
});

function gamepad(
  index: number,
  state: { readonly buttons?: readonly number[]; readonly axes?: readonly number[] } = {},
): Gamepad {
  const pressed = new Set(state.buttons ?? []);
  return {
    index,
    connected: true,
    axes: [...(state.axes ?? [0, 0])],
    buttons: Array.from({ length: 16 }, (_, button) => ({
      pressed: pressed.has(button),
      touched: pressed.has(button),
      value: pressed.has(button) ? 1 : 0,
    })),
  } as unknown as Gamepad;
}
