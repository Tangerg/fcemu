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
      readonly kind: "gxrom";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
    }
  | {
      readonly kind: "color-dreams";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
    }
  | { readonly kind: "cprom"; readonly selectedChrBank: number }
  | {
      readonly kind: "codemasters";
      readonly selectedPrgBank: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "bandai-74";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
      readonly mirroring: number;
    }
  | { readonly kind: "jaleco-87"; readonly selectedChrBank: number }
  | {
      readonly kind: "jaleco-jf";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
    }
  | {
      readonly kind: "sunsoft-1";
      readonly selectedChrBank0: number;
      readonly selectedChrBank1: number;
    }
  | { readonly kind: "sunsoft-2"; readonly register: number }
  | { readonly kind: "sunsoft-3r"; readonly register: number }
  | { readonly kind: "cnrom-protection"; readonly selectedChip: number }
  | {
      readonly kind: "vrc1";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly mirroring: number;
    }
  | {
      readonly kind: "taito-tc0190";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly mirroring: number;
    }
  | {
      readonly kind: "irem-78";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "namco-118";
      readonly register: number;
      readonly registers: readonly number[];
    }
  | {
      readonly kind: "fme7";
      readonly command: number;
      readonly chrBanks: readonly number[];
      readonly prgBank0: number;
      readonly prgBanks: readonly number[];
      readonly mirroring: number;
      readonly irqCounter: number;
      readonly irqCounterEnabled: boolean;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
    }
  | {
      readonly kind: "mmc2";
      readonly prgBank: number;
      readonly chrBank0Fd: number;
      readonly chrBank0Fe: number;
      readonly chrBank1Fd: number;
      readonly chrBank1Fe: number;
      readonly latch0Fe: boolean;
      readonly latch1Fe: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "mmc4";
      readonly prgBank: number;
      readonly chrBank0Fd: number;
      readonly chrBank0Fe: number;
      readonly chrBank1Fd: number;
      readonly chrBank1Fe: number;
      readonly latch0Fe: boolean;
      readonly latch1Fe: boolean;
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
  /** Restores this board's deterministic fresh-instance latch state. */
  powerOn(): void;

  captureState(): MapperState;

  restoreState(state: MapperState): void;

  read(address: number): number;

  write(address: number, value: number): void;

  /**
   * Bits driven by the cartridge during a CPU read.
   *
   * Most mapped reads drive all eight data lines, so omitting this capability
   * means 0xFF. Boards return 0 for write-only or disabled windows, allowing
   * the CPU memory bus to retain its previous value instead of inventing data.
   */
  cpuReadDriveMask?(address: number): number;

  /**
   * Bits driven by the cartridge during a PPU pattern-table read.
   *
   * Omitting this capability means all eight data lines are driven. A board
   * may return 0 while CHR is disabled; undriven bits then come from the PPU's
   * multiplexed address/data pins rather than from a fabricated mapper byte.
   */
  ppuReadDriveMask?(address: number): number;

  /**
   * Optional cartridge-controlled CIRAM routing for one nametable access.
   *
   * The returned index addresses the console/cartridge nametable memory
   * directly. Returning undefined leaves routing to fixed header mirroring.
   */
  mapNametableAddress?(address: number): number | undefined;

  /** Optional CPU R/W pin observation for boards whose latches depend on adjacent bus cycles. */
  observeCpuBusCycle?(write: boolean): void;

  /** Optional PPU address-line observation for boards such as MMC3. */
  observePpuAddress?(address: number): void;

  /** Optional completed PPU-read observation for read-triggered boards such as MMC2/MMC4. */
  observePpuRead?(address: number): void;

  /** Optional per-dot clock paired with PPU address-line observation. */
  tickPpu?(): void;
}

/** Narrow interrupt capability required by IRQ-generating cartridge hardware. */
export interface MapperInterruptPort {
  setMapperIrq(asserted: boolean): void;
}
