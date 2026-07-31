/**
 * Cartridge address-space policy owned by the Emulation domain.
 *
 * CPU and PPU devices communicate with cartridge hardware exclusively through
 * this contract; mapper-specific registers and bank layouts stay encapsulated.
 */
export type MapperState =
  | { readonly kind: "nrom" }
  | {
      readonly kind: "address-latch-multicart";
      readonly board:
        | "k-1029"
        | "et-4310"
        | "mapper-227-rpg"
        | "mapper-227-multicart"
        | "mapper-227-outer-reset"
        | "active-enterprises";
      readonly addressLatch: number;
      readonly dataLatch: number;
      readonly nibbleRam: Uint8Array;
    }
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
  | {
      readonly kind: "bandai-fcg";
      readonly board: "auto" | "fcg-1-2" | "lz93d50";
      readonly chrBanks: readonly number[];
      readonly prgBank: number;
      readonly irqReload: number;
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
      readonly eeprom: {
        readonly mode: number;
        readonly nextMode: number;
        readonly chipAddress: number;
        readonly address: number;
        readonly data: number;
        readonly bitCounter: number;
        readonly output: number;
        readonly previousScl: number;
        readonly previousSda: number;
      } | null;
    }
  | {
      readonly kind: "ffe-magic-card";
      readonly board: "magic-card-6" | "magic-card-8" | "super-magic-card";
      readonly prgBanks: readonly number[];
      readonly chrRegisters: readonly number[];
      readonly latchMode: number;
      readonly latchValue: number;
      readonly prgWriteProtected: boolean;
      readonly twoScreenMirroring: boolean;
      readonly mirroringSetting: boolean;
      readonly bankingMode: "latch" | "2m" | "4m";
      readonly bankingModeAddressBits: number;
      readonly chr8kBank: number;
      readonly superMode: number;
      readonly latch0Fe: boolean;
      readonly latch1Fe: boolean;
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly a12High: boolean;
      readonly fdsIrqDivider: number;
      readonly fdsIrqEnabled: boolean;
      readonly fdsIrqPending: boolean;
      readonly mirroring: number;
      readonly scratchRam: Uint8Array;
      readonly prgMemory: Uint8Array;
      readonly chrMemory: Uint8Array;
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
      readonly kind: "vrc2-vrc4";
      readonly board:
        | "vrc4-21-auto"
        | "vrc4a"
        | "vrc4c"
        | "vrc2a"
        | "vrc4-23-auto"
        | "vrc4f"
        | "vrc4e"
        | "vrc2b"
        | "vrc4-25-auto"
        | "vrc4b"
        | "vrc4d"
        | "vrc2c";
      readonly prgBanks: readonly number[];
      readonly chrRegisters: readonly number[];
      readonly prgMode: number;
      readonly wramEnabled: boolean;
      readonly microwireLatch: number;
      readonly mirroring: number;
      readonly irq: {
        readonly latch: number;
        readonly counter: number;
        readonly prescaler: number;
        readonly enabled: boolean;
        readonly enabledAfterAcknowledge: boolean;
        readonly cycleMode: boolean;
        readonly pending: boolean;
      } | null;
    }
  | {
      readonly kind: "taito-tc0190";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly mirroring: number;
    }
  | {
      readonly kind: "taito-tc0690";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly reload: number;
      readonly counter: number;
      readonly reloadPending: boolean;
      readonly irqEnabled: boolean;
      readonly irqDelay: number;
      readonly irqPending: boolean;
      readonly ppuClock: number;
      readonly a12High: boolean;
      readonly a12LowSince: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "taito-x1-005";
      readonly prgBanks: readonly number[];
      readonly chrRegisters: readonly number[];
      readonly ramPermission: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "taito-x1-017";
      readonly prgBanks: readonly number[];
      readonly chrRegisters: readonly number[];
      readonly chrMode: number;
      readonly ramPermissions: readonly number[];
      readonly irqLatch: number;
      readonly irqCounter: number;
      readonly irqCounting: boolean;
      readonly irqOutputEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "jaleco-ss8806";
      readonly prgRegisters: readonly number[];
      readonly chrRegisters: readonly number[];
      readonly ramProtection: number;
      readonly irqReload: number;
      readonly irqCounter: number;
      readonly irqCounterBits: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "jy-830623c";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly outerBank: number;
      readonly irqRiseCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly a12High: boolean;
    }
  | {
      readonly kind: "ej-006-1";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly outerBank: number;
      readonly irqCounter: number;
      readonly irqDivider: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "irem-g101";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly prgMode: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "irem-h3001";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly prgMode: number;
      readonly irqReload: number;
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "rambo-1";
      readonly registers: readonly number[];
      readonly bankSelect: number;
      readonly irqReload: number;
      readonly irqCounter: number;
      readonly irqReloadPending: boolean;
      readonly irqCycleMode: boolean;
      readonly irqEnabled: boolean;
      readonly irqDivider: number;
      readonly forceCycleClock: boolean;
      readonly irqDelay: number;
      readonly irqPending: boolean;
      readonly ppuClock: number;
      readonly a12High: boolean;
      readonly a12LowSince: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "sunsoft-4";
      readonly chrBanks: readonly number[];
      readonly nametableBanks: readonly number[];
      readonly useChrNametables: boolean;
      readonly prgBank: number;
      readonly prgRamEnabled: boolean;
      readonly mirroring: number;
    }
  | {
      readonly kind: "nina-03-06";
      readonly prgBank: number;
      readonly chrBank: number;
    }
  | {
      readonly kind: "irem-tam-s1";
      readonly prgBank: number;
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

  /** Applies board logic connected to the console's warm reset signal. */
  reset?(): void;

  captureState(): MapperState;

  restoreState(state: MapperState): void;

  /**
   * Optional cold-boot interception performed by an external cartridge loader.
   *
   * `returnsToResetVector` models a loader calling a trainer subroutine; false
   * models a direct jump. Warm reset always uses the normal CPU reset vector.
   */
  powerOnCpuEntry?():
    { readonly address: number; readonly returnsToResetVector: boolean } | undefined;

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
   * Optional cartridge device read in CPU $4018-$5FFF.
   *
   * Returning undefined leaves the expansion range open bus. The result keeps
   * the byte and physical data-line mask together so the CPU bus remains the
   * sole owner of open-bus composition.
   */
  readCpuExpansion?(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined;

  /** Optional cartridge register write in CPU $4018-$5FFF. */
  writeCpuExpansion?(address: number, value: number): void;

  /**
   * Optional cartridge drive applied when a write-only 2A03 address leaves the
   * external CPU data bus otherwise floating.
   */
  readCpuRegisterOpenBus?(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined;

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

  /**
   * Optional cartridge-driven nametable byte.
   *
   * Returning undefined falls through to CIRAM routing. This models boards
   * that replace CIRAM with CHR ROM without encoding memory ownership in an
   * address sentinel.
   */
  readNametable?(address: number): number | undefined;

  /**
   * Optional cartridge-owned nametable write.
   *
   * Returning true consumes the write; false falls through to CIRAM. ROM-backed
   * nametables use this to discard writes while keeping the PPU bus behavior
   * explicit.
   */
  writeNametable?(address: number, value: number): boolean;

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
