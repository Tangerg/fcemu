/**
 * Level-sensitive IRQ lines the CPU can see. Each source asserts and clears its
 * own line independently, so both the bus and the asserting device refer to the
 * same named source instead of bare string literals.
 */
export const IRQSource = {
  ApuDmc: "apu-dmc",
  ApuFrame: "apu-frame",
  Mapper: "mapper",
} as const;

export type IRQSource = (typeof IRQSource)[keyof typeof IRQSource];
