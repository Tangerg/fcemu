import type {
  ControllerInputEvent,
  ControllerInputPort,
  GameButton,
} from "../../application/ports.js";

interface KeyboardBinding {
  readonly player: 1 | 2;
  readonly button: GameButton;
}

const KEY_TO_INPUT: Readonly<Record<string, KeyboardBinding>> = {
  KeyW: { player: 1, button: "up" },
  KeyS: { player: 1, button: "down" },
  KeyA: { player: 1, button: "left" },
  KeyD: { player: 1, button: "right" },
  KeyJ: { player: 1, button: "a" },
  KeyK: { player: 1, button: "b" },
  Enter: { player: 1, button: "start" },
  Space: { player: 1, button: "select" },
  ArrowUp: { player: 2, button: "up" },
  ArrowDown: { player: 2, button: "down" },
  ArrowLeft: { player: 2, button: "left" },
  ArrowRight: { player: 2, button: "right" },
  Digit0: { player: 2, button: "a" },
  Numpad0: { player: 2, button: "a" },
  Digit1: { player: 2, button: "b" },
  Numpad1: { player: 2, button: "b" },
};

export class KeyboardControllerInput implements ControllerInputPort {
  private readonly listeners = new Set<(event: ControllerInputEvent) => void>();
  private readonly pressedCodes = new Set<string>();
  private readonly pressedInputs = new Map<string, KeyboardBinding>();

  subscribe(listener: (event: ControllerInputEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.attach();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.detach();
    };
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const binding = KEY_TO_INPUT[event.code];
    if (!binding) return;
    event.preventDefault();
    if (event.repeat || this.pressedCodes.has(event.code)) return;
    this.pressedCodes.add(event.code);

    const input = inputKey(binding);
    if (this.pressedInputs.has(input)) return;
    this.pressedInputs.set(input, binding);
    this.emit(binding, true);
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    const binding = KEY_TO_INPUT[event.code];
    if (!binding) return;
    event.preventDefault();
    if (!this.pressedCodes.delete(event.code)) return;

    const input = inputKey(binding);
    const remainsPressed = [...this.pressedCodes].some(
      (code) => inputKey(KEY_TO_INPUT[code]!) === input,
    );
    if (remainsPressed) return;
    this.pressedInputs.delete(input);
    this.emit(binding, false);
  };

  private readonly handleBlur = () => {
    this.pressedInputs.forEach((binding) => this.emit(binding, false));
    this.pressedCodes.clear();
    this.pressedInputs.clear();
  };

  private emit(binding: KeyboardBinding, pressed: boolean): void {
    const event: ControllerInputEvent = { ...binding, pressed };
    this.listeners.forEach((listener) => listener(event));
  }

  private attach(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleBlur);
  }

  private detach(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleBlur);
    this.handleBlur();
  }
}

function inputKey(binding: KeyboardBinding): string {
  return `${binding.player}:${binding.button}`;
}
