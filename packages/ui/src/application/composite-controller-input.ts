import type { ControllerInputEvent, ControllerInputPort, GameButton } from "./ports.js";

/** Merges input sources while preserving aggregate pressed-state semantics. */
export class CompositeControllerInput implements ControllerInputPort {
  constructor(private readonly sources: readonly ControllerInputPort[]) {}

  subscribe(listener: (event: ControllerInputEvent) => void): () => void {
    const sourceStates = this.sources.map(() => new Set<string>());
    const aggregateState = new Set<string>();
    const unsubscribers: Array<() => void> = [];
    let active = true;

    try {
      this.sources.forEach((source, sourceIndex) => {
        const unsubscribe = source.subscribe((event) => {
          if (!active) return;
          const key = inputKey(event.player, event.button);
          if (event.pressed) sourceStates[sourceIndex]?.add(key);
          else sourceStates[sourceIndex]?.delete(key);

          const pressed = sourceStates.some((state) => state.has(key));
          if (pressed === aggregateState.has(key)) return;
          if (pressed) aggregateState.add(key);
          else aggregateState.delete(key);
          listener({ ...event, pressed });
        });
        unsubscribers.push(unsubscribe);
      });
    } catch (error) {
      active = false;
      unsubscribeAll(unsubscribers);
      throw error;
    }

    return () => {
      if (!active) return;
      active = false;
      unsubscribeAll(unsubscribers);
    };
  }
}

function unsubscribeAll(unsubscribers: readonly (() => void)[]): void {
  unsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch {
      // Teardown is best-effort, but one broken source must not leak the remaining subscriptions.
    }
  });
}

function inputKey(player: 1 | 2, button: GameButton): string {
  return `${player}:${button}`;
}
