import type { MapperState } from "./mapper.js";

/** Returns the physical mapper /IRQ output encoded by a mapper snapshot. */
export function mapperIrqAsserted(state: MapperState): boolean {
  switch (state.kind) {
    case "ffe-magic-card":
      return state.irqPending || state.fdsIrqPending;
    case "vrc2-vrc4":
      return state.irq?.pending ?? false;
    case "vrc6":
    case "vrc7":
      return state.irq.pending;
    case "mmc5":
      return (
        (state.irqEnabled && state.irqPending) ||
        state.timerPending ||
        (state.audio.pcmPending && (state.audio.pcmControl & 0x80) !== 0)
      );
    case "taito-x1-017":
      return state.irqPending && state.irqOutputEnabled;
    case "supergame-114":
    case "kasheng-115":
    case "rex-soft-12":
    case "txc-mmc3-189":
    case "waixing-f003-245":
      return state.mmc3.irqPending;
    default:
      return "irqPending" in state && state.irqPending;
  }
}
