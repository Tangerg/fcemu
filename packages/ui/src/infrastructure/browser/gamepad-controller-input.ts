import type {
  ControllerInputEvent,
  ControllerInputPort,
  GameButton,
} from "../../application/ports.js";

interface GamepadEnvironment {
  getGamepads(): readonly (Gamepad | null)[];
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}

const BUTTON_INDEX: Readonly<Partial<Record<GameButton, number>>> = {
  a: 0,
  b: 1,
  select: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
};
const BUTTONS: readonly GameButton[] = ["a", "b", "select", "start", "up", "down", "left", "right"];
const AXIS_THRESHOLD = 0.5;

export class GamepadControllerInput implements ControllerInputPort {
  private readonly listeners = new Set<(event: ControllerInputEvent) => void>();
  private readonly slots: Array<number | undefined> = [undefined, undefined];
  private readonly pressed = [new Set<GameButton>(), new Set<GameButton>()];
  private frame: number | undefined;

  constructor(private readonly environment: GamepadEnvironment = browserEnvironment()) {}

  subscribe(listener: (event: ControllerInputEvent) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.schedule();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private readonly poll = () => {
    this.frame = undefined;
    const connected = this.environment
      .getGamepads()
      .filter((gamepad): gamepad is Gamepad => gamepad !== null && gamepad.connected)
      .sort((left, right) => left.index - right.index);
    const connectedIndexes = new Set(connected.map((gamepad) => gamepad.index));

    this.slots.forEach((gamepadIndex, slot) => {
      if (gamepadIndex !== undefined && !connectedIndexes.has(gamepadIndex)) {
        this.releaseSlot(slot);
        this.slots[slot] = undefined;
      }
    });
    connected.forEach((gamepad) => {
      if (this.slots.includes(gamepad.index)) return;
      const slot = this.slots.indexOf(undefined);
      if (slot !== -1) this.slots[slot] = gamepad.index;
    });

    this.slots.forEach((gamepadIndex, slot) => {
      const gamepad = connected.find((candidate) => candidate.index === gamepadIndex);
      if (gamepad) this.projectGamepad(slot, gamepad);
    });
    this.schedule();
  };

  private projectGamepad(slot: number, gamepad: Gamepad): void {
    const next = new Set<GameButton>();
    BUTTONS.forEach((button) => {
      const index = BUTTON_INDEX[button];
      const gamepadButton = index === undefined ? undefined : gamepad.buttons[index];
      if (gamepadButton?.pressed || (gamepadButton?.value ?? 0) >= 0.5) next.add(button);
    });

    const horizontal = gamepad.axes[0] ?? 0;
    const vertical = gamepad.axes[1] ?? 0;
    if (horizontal <= -AXIS_THRESHOLD) next.add("left");
    if (horizontal >= AXIS_THRESHOLD) next.add("right");
    if (vertical <= -AXIS_THRESHOLD) next.add("up");
    if (vertical >= AXIS_THRESHOLD) next.add("down");

    BUTTONS.forEach((button) => {
      const wasPressed = this.pressed[slot]?.has(button) ?? false;
      const isPressed = next.has(button);
      if (wasPressed !== isPressed) this.emit(slot, button, isPressed);
    });
    this.pressed[slot] = next;
  }

  private releaseSlot(slot: number): void {
    this.pressed[slot]?.forEach((button) => this.emit(slot, button, false));
    this.pressed[slot]?.clear();
  }

  private emit(slot: number, button: GameButton, pressed: boolean): void {
    const event: ControllerInputEvent = { player: slot === 0 ? 1 : 2, button, pressed };
    this.listeners.forEach((listener) => listener(event));
  }

  private schedule(): void {
    if (this.frame === undefined && this.listeners.size > 0) {
      this.frame = this.environment.requestFrame(this.poll);
    }
  }

  private stop(): void {
    if (this.frame !== undefined) this.environment.cancelFrame(this.frame);
    this.frame = undefined;
    this.slots.forEach((_, slot) => this.releaseSlot(slot));
    this.slots.fill(undefined);
  }
}

function browserEnvironment(): GamepadEnvironment {
  return {
    getGamepads: () => Array.from(navigator.getGamepads?.() ?? []),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
  };
}
