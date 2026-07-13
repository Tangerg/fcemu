/**
 * Cartridge address-space policy owned by the Emulation domain.
 *
 * CPU and PPU devices communicate with cartridge hardware exclusively through
 * this contract; mapper-specific registers and bank layouts stay encapsulated.
 */
export type MapperState =
  | { readonly kind: "nrom" }
  | { readonly kind: "uxrom"; readonly selectedPrgBank: number }
  | { readonly kind: "cnrom"; readonly selectedChrBank: number }
  | { readonly kind: "bnrom"; readonly selectedPrgBank: number }
  | {
      readonly kind: "nina-001";
      readonly selectedPrgBank: number;
      readonly selectedChrBank0: number;
      readonly selectedChrBank1: number;
    }
  | {
      readonly kind: "axrom";
      readonly selectedPrgBank: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "mmc1";
      readonly shiftRegister: number;
      readonly control: number;
      readonly chrBank0: number;
      readonly chrBank1: number;
      readonly prgBank: number;
      readonly activeChrRegister: 0 | 1;
      readonly previousCpuCycleWasWrite: boolean;
    }
  | {
      readonly kind: "mmc3";
      readonly register: number;
      readonly registers: readonly number[];
      readonly prgMode: number;
      readonly chrMode: number;
      readonly reload: number;
      readonly counter: number;
      readonly reloadPending: boolean;
      readonly irqEnable: boolean;
      readonly prgRamEnabled: boolean;
      readonly prgRamWritable: boolean;
      readonly ppuClock: number;
      readonly a12High: boolean;
      readonly a12LowSince: number;
      readonly mirroring: number;
    };

export interface Mapper {
  readonly observesPpuAddress: boolean;

  /** Restores this board's deterministic fresh-instance latch state. */
  powerOn(): void;

  captureState(): MapperState;

  restoreState(state: MapperState): void;

  read(address: number): number;

  write(address: number, value: number): void;

  /** Optional CPU R/W pin observation for boards whose latches depend on adjacent bus cycles. */
  observeCpuBusCycle?(write: boolean): void;

  observePpuAddress(address: number): void;

  tickPpu(): void;
}

/** Narrow interrupt capability required by IRQ-generating cartridge hardware. */
export interface MapperInterruptPort {
  setMapperIrq(asserted: boolean): void;
}
