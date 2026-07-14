/**
 * The shared RP2A03 DMA bus alternates between a read (GET) half-cycle and a
 * write (PUT) half-cycle. This GET/PUT alignment belongs to the DMA bus
 * hardware rather than to any individual OAM or DMC transfer, so both the
 * arbiter and the channels refer to the same named phase instead of bare
 * "get"/"put" string literals.
 */
export const DmaBusPhase = {
  Get: "get",
  Put: "put",
} as const;

export type DmaBusPhase = (typeof DmaBusPhase)[keyof typeof DmaBusPhase];
