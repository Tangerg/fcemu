/**
 * Class representing NES controller buttons state
 */
export enum ControllerButton {
  A = 0,
  B = 1,
  Select = 2,
  Start = 3,
  Up = 4,
  Down = 5,
  Left = 6,
  Right = 7,
}

export interface ControllerState {
  readonly buttons: readonly boolean[];
  readonly currentButtonIndex: number;
  readonly strobeSignal: boolean;
}

/**
 * Class implementing NES controller functionality
 * Simulates the shift register behavior of real NES controller
 */
class Controller {
  private readonly buttons: boolean[] = Array<boolean>(8).fill(false);
  private currentButtonIndex = 0;
  private strobeSignal = false;

  /** Resets console-side serial state without changing physical button inputs. */
  powerOn(): void {
    this.currentButtonIndex = 0;
    this.strobeSignal = false;
  }

  captureState(): ControllerState {
    return {
      buttons: [...this.buttons],
      currentButtonIndex: this.currentButtonIndex,
      strobeSignal: this.strobeSignal,
    };
  }

  restoreState(state: ControllerState): void {
    Controller.validateButtons(state.buttons, "Controller save state");
    if (
      !Number.isSafeInteger(state.currentButtonIndex) ||
      state.currentButtonIndex < 0 ||
      state.currentButtonIndex > 8
    ) {
      throw new RangeError("Controller save state contains an invalid shift index");
    }
    if (typeof state.strobeSignal !== "boolean") {
      throw new TypeError("Controller save state contains an invalid strobe value");
    }
    this.buttons.splice(0, this.buttons.length, ...state.buttons);
    this.currentButtonIndex = state.currentButtonIndex;
    this.strobeSignal = state.strobeSignal;
  }

  /**
   * Set strobe signal
   * When strobe is high (1), button reading resets to first button
   * @param value Strobe signal value
   */
  set strobe(value: number) {
    this.strobeSignal = Boolean(value & 1);
    if (this.strobeSignal) {
      this.currentButtonIndex = 0;
    }
  }

  /**
   * Set all button states at once
   * @param state Array of button states
   */
  set buttonsState(state: readonly boolean[]) {
    Controller.validateButtons(state, "Controller input");
    this.buttons.splice(0, this.buttons.length, ...state);
  }

  public setButton(button: ControllerButton, pressed: boolean): void {
    if (
      !Number.isInteger(button) ||
      button < ControllerButton.A ||
      button > ControllerButton.Right
    ) {
      throw new RangeError("Controller button is outside the standard eight-button report");
    }
    if (typeof pressed !== "boolean")
      throw new TypeError("Controller button state must be boolean");
    this.buttons[button] = pressed;
  }

  /**
   * Read current button state and advance to next button
   * Simulates shift register behavior of real NES controller
   * @returns Current button state (0 or 1)
   */
  get currentButton(): number {
    // The NES controller's serial output stays high after all eight buttons
    // have shifted out; software commonly uses this trailing 1 as a sentinel.
    const button = this.currentButtonIndex < 8 ? Number(this.buttons[this.currentButtonIndex]) : 1;
    if (!this.strobeSignal) this.currentButtonIndex = Math.min(8, this.currentButtonIndex + 1);
    return button;
  }

  private static validateButtons(buttons: readonly boolean[], label: string): void {
    if (buttons.length !== 8 || buttons.some((button) => typeof button !== "boolean")) {
      throw new RangeError(`${label} must contain exactly eight boolean button values`);
    }
  }
}

export default Controller;
