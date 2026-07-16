import { afterEach, describe, expect, it, vi } from "vitest";
import type { ControllerInputEvent } from "../../application/ports.js";
import { KeyboardControllerInput } from "./keyboard-controller-input.js";

afterEach(() => vi.unstubAllGlobals());

describe("KeyboardControllerInput", () => {
  it("maps separate keyboard controls to player one and player two", () => {
    const keyboard = new TestKeyboardTarget();
    vi.stubGlobal("window", keyboard);
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    const unsubscribe = new KeyboardControllerInput().subscribe(listener);

    key(keyboard, "keydown", "KeyW");
    key(keyboard, "keydown", "KeyJ");
    key(keyboard, "keydown", "Enter");
    key(keyboard, "keydown", "Space");
    key(keyboard, "keydown", "ArrowUp");
    key(keyboard, "keydown", "Digit0");
    key(keyboard, "keydown", "Digit1");

    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { player: 1, button: "up", pressed: true },
      { player: 1, button: "a", pressed: true },
      { player: 1, button: "start", pressed: true },
      { player: 1, button: "select", pressed: true },
      { player: 2, button: "up", pressed: true },
      { player: 2, button: "a", pressed: true },
      { player: 2, button: "b", pressed: true },
    ]);

    unsubscribe();
  });

  it("keeps a player-two button pressed while its main and numpad aliases overlap", () => {
    const keyboard = new TestKeyboardTarget();
    vi.stubGlobal("window", keyboard);
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    const unsubscribe = new KeyboardControllerInput().subscribe(listener);

    key(keyboard, "keydown", "Digit0");
    key(keyboard, "keydown", "Numpad0");
    key(keyboard, "keyup", "Digit0");
    key(keyboard, "keyup", "Numpad0");

    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { player: 2, button: "a", pressed: true },
      { player: 2, button: "a", pressed: false },
    ]);

    unsubscribe();
  });

  it("leaves game keys to a focused browser control", () => {
    const keyboard = new TestKeyboardTarget();
    keyboard.interactive = true;
    vi.stubGlobal("window", keyboard);
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    const unsubscribe = new KeyboardControllerInput().subscribe(listener);

    key(keyboard, "keydown", "Enter", false);
    key(keyboard, "keyup", "Enter", false);
    key(keyboard, "keydown", "Space", false);
    key(keyboard, "keyup", "Space", false);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("releases a game key even if focus moves to a browser control while it is held", () => {
    const keyboard = new TestKeyboardTarget();
    vi.stubGlobal("window", keyboard);
    const listener = vi.fn<(event: ControllerInputEvent) => void>();
    const unsubscribe = new KeyboardControllerInput().subscribe(listener);

    key(keyboard, "keydown", "Space");
    keyboard.interactive = true;
    key(keyboard, "keyup", "Space");

    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      { player: 1, button: "select", pressed: true },
      { player: 1, button: "select", pressed: false },
    ]);
    unsubscribe();
  });
});

class TestKeyboardTarget extends EventTarget {
  interactive = false;

  closest(_selector: string): this | null {
    return this.interactive ? this : null;
  }
}

function key(
  target: EventTarget,
  type: "keydown" | "keyup",
  code: string,
  defaultPrevented = true,
): void {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: false },
  });
  target.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(defaultPrevented);
}
