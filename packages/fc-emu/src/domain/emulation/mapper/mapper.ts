export interface Mmc3State {
  readonly kind: "mmc3";
  readonly register: number;
  readonly registers: readonly number[];
  readonly prgMode: number;
  readonly chrMode: number;
  readonly reload: number;
  readonly counter: number;
  readonly reloadPending: boolean;
  readonly irqEnable: boolean;
  readonly irqPending: boolean;
  readonly prgRamEnabled: boolean;
  readonly prgRamWritable: boolean;
  readonly ppuClock: number;
  readonly a12High: boolean;
  readonly a12LowSince: number;
  readonly mirroring: number;
}

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
        | "active-enterprises"
        | "mapper-242";
      readonly addressLatch: number;
      readonly dataLatch: number;
      readonly nibbleRam: Uint8Array;
    }
  | { readonly kind: "uxrom"; readonly selectedPrgBank: number }
  | { readonly kind: "cnrom"; readonly selectedChrBank: number }
  | { readonly kind: "vs-system"; readonly selectedBank: number }
  | { readonly kind: "bnrom"; readonly selectedPrgBank: number }
  | { readonly kind: "bmc-226"; readonly register0: number; readonly register1: number }
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
  | {
      readonly kind: "ce-supertone-240";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
    }
  | {
      readonly kind: "ce-decathlon-244";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
    }
  | { readonly kind: "sachen-sa72008-133"; readonly register: number }
  | {
      readonly kind: "sachen-sa020a-243";
      readonly selectedRegister: number;
      readonly registers: readonly number[];
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
  | {
      readonly kind: "sunsoft-3";
      readonly selectedPrgBank: number;
      readonly chrBanks: readonly number[];
      readonly irqCounter: number;
      readonly irqHighByteNext: boolean;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly mirroring: number;
    }
  | { readonly kind: "sunsoft-3r"; readonly register: number }
  | { readonly kind: "cnrom-protection"; readonly selectedChip: number }
  | {
      readonly kind: "vrc1";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly mirroring: number;
    }
  | {
      readonly kind: "vrc3";
      readonly selectedPrgBank: number;
      readonly irqLatch: number;
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqEnableAfterAcknowledge: boolean;
      readonly irqEightBitMode: boolean;
      readonly irqPending: boolean;
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
      readonly kind: "vrc6";
      readonly board: "vrc6a" | "vrc6b";
      readonly prgBank16: number;
      readonly prgBank8: number;
      readonly chrBanks: readonly number[];
      readonly ppuMode: number;
      readonly audio: {
        readonly frequencyControl: number;
        readonly pulse1: {
          readonly control: number;
          readonly period: number;
          readonly divider: number;
          readonly dutyStep: number;
          readonly enabled: boolean;
        };
        readonly pulse2: {
          readonly control: number;
          readonly period: number;
          readonly divider: number;
          readonly dutyStep: number;
          readonly enabled: boolean;
        };
        readonly saw: {
          readonly rate: number;
          readonly period: number;
          readonly divider: number;
          readonly step: number;
          readonly accumulator: number;
          readonly enabled: boolean;
        };
      };
      readonly irq: {
        readonly latch: number;
        readonly counter: number;
        readonly prescaler: number;
        readonly enabled: boolean;
        readonly enabledAfterAcknowledge: boolean;
        readonly cycleMode: boolean;
        readonly pending: boolean;
      };
    }
  | {
      readonly kind: "vrc7";
      readonly board: "vrc7-auto" | "vrc7b" | "vrc7a";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly control: number;
      readonly audio: {
        readonly reset: boolean;
        readonly selectedRegister: number;
        readonly registers: readonly number[];
        readonly divider: number;
        readonly output: number;
        readonly pmPhase: number;
        readonly amPhase: number;
        readonly envelopeCounter: number;
        readonly slots: readonly {
          readonly phase: number;
          readonly currentOutput: number;
          readonly previousOutput: number;
          readonly envelopeState: number;
          readonly envelopeOutput: number;
          readonly keyOn: boolean;
        }[];
      } | null;
      readonly irq: {
        readonly latch: number;
        readonly counter: number;
        readonly prescaler: number;
        readonly enabled: boolean;
        readonly enabledAfterAcknowledge: boolean;
        readonly cycleMode: boolean;
        readonly pending: boolean;
      };
    }
  | {
      readonly kind: "namco-163";
      readonly audioLevel: "mute" | "12db" | "16.5db" | "18.75db";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly disableLowPatternCiram: boolean;
      readonly disableHighPatternCiram: boolean;
      readonly soundDisabled: boolean;
      readonly pinControl: number;
      readonly wramControl: number;
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly audio: {
        readonly address: number;
        readonly autoIncrement: boolean;
        readonly divider: number;
        readonly nextChannel: number;
        readonly output: number;
      };
    }
  | {
      readonly kind: "mmc5";
      readonly prgMode: number;
      readonly chrMode: number;
      readonly prgBanks: readonly number[];
      readonly chrBanksA: readonly number[];
      readonly chrBanksB: readonly number[];
      readonly chrUpperBits: number;
      readonly lastChrSet: "a" | "b";
      readonly prgRamProtect1: number;
      readonly prgRamProtect2: number;
      readonly exRamMode: number;
      readonly nametableMapping: number;
      readonly fillTile: number;
      readonly fillPalette: number;
      readonly splitControl: number;
      readonly splitScroll: number;
      readonly splitBank: number;
      readonly irqTarget: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly inFrame: boolean;
      readonly scanlineCounter: number;
      readonly ppuIdleCpuCycles: number;
      readonly spriteSize16: boolean;
      readonly ppuSubstitutionsEnabled: boolean;
      readonly extendedAttribute: number;
      readonly splitActive: boolean;
      readonly splitFineY: number;
      readonly splitColumn: number;
      readonly splitY: number;
      readonly multiplierA: number;
      readonly multiplierB: number;
      readonly timerCounter: number;
      readonly timerRunning: boolean;
      readonly timerPending: boolean;
      readonly audio: {
        readonly enabledMask: number;
        readonly frameDivider: number;
        readonly timerPhase: boolean;
        readonly pcmControl: number;
        readonly pcmOutput: number;
        readonly pcmPending: boolean;
        readonly pulses: readonly {
          readonly control: number;
          readonly period: number;
          readonly divider: number;
          readonly dutyStep: number;
          readonly length: number;
          readonly envelopeStart: boolean;
          readonly envelopeDivider: number;
          readonly envelopeDecay: number;
        }[];
      };
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
      readonly kind: "cony-yoko";
      readonly board: "cony-83-0" | "cony-83-1" | "cony-83-2" | "cony-83-3";
      readonly prgBase: number;
      readonly mode: number;
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly irqCounter: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly irqSourceA12: boolean;
      readonly a12High: boolean;
      readonly scratchRam: Uint8Array;
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
      readonly kind: "jy-company";
      readonly board: "mapper-90";
      readonly prgBanks: readonly number[];
      readonly chrBanks: readonly number[];
      readonly nametableBanks: readonly number[];
      readonly mode: number;
      readonly mirroringRegister: number;
      readonly ppuConfig: number;
      readonly outerBank: number;
      readonly chrLatchLow: boolean;
      readonly chrLatchHigh: boolean;
      readonly irqMode: number;
      readonly irqPrescaler: number;
      readonly irqCounter: number;
      readonly irqXor: number;
      readonly irqUnknownMode: number;
      readonly irqEnabled: boolean;
      readonly irqPending: boolean;
      readonly a12High: boolean;
      readonly multiplyOperand1: number;
      readonly multiplyOperand2: number;
      readonly multiplyLatchedOperand1: number;
      readonly multiplyLatchedOperand2: number;
      readonly multiplyStep: number;
      readonly accumulator: number;
      readonly testRegister: number;
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
      readonly kind: "hes-ntd8";
      readonly selectedPrgBank: number;
      readonly selectedChrBank: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "ntdec-asder";
      readonly currentRegister: number;
      readonly registers: readonly number[];
      readonly outerChrBank: number;
      readonly mirroring: number;
    }
  | {
      readonly kind: "oeka-kids";
      readonly register: number;
      readonly innerChrBank: number;
      readonly lastPpuAddress: number;
    }
  | {
      readonly kind: "jaleco-jf17";
      readonly prgBank: number;
      readonly chrBank: number;
      readonly prgClockHigh: boolean;
      readonly chrClockHigh: boolean;
    }
  | {
      readonly kind: "irem-lrog017";
      readonly prgBank: number;
      readonly chrRomBank: number;
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
  | Mmc3State
  | {
      readonly kind: "supergame-114";
      readonly variant: 0 | 1;
      readonly prgOverride: number;
      readonly chrOuterBank: number;
      readonly mmc3: Mmc3State;
    }
  | {
      readonly kind: "kasheng-115";
      readonly prgModeRegister: number;
      readonly chrOuterBank: number;
      readonly mmc3: Mmc3State;
    }
  | {
      readonly kind: "txc-mmc3-189";
      readonly selectedPrgBank: number;
      readonly mmc3: Mmc3State;
    }
  | {
      readonly kind: "waixing-f003-245";
      readonly ppuBankAddress: number;
      readonly mmc3: Mmc3State;
    };

/**
 * Meaning of a rendering fetch on the PPU bus.
 *
 * MMC5 physically selects different CHR and ExRAM wiring for background and
 * sprite fetches. Keeping that fact on the bus boundary avoids exposing PPU
 * scanline implementation details to cartridge boards.
 */
export type PpuFetchContext =
  | {
      readonly kind: "background";
      readonly phase: "nametable" | "attribute" | "pattern";
      readonly tile: number;
      readonly visible: boolean;
    }
  | {
      readonly kind: "sprite";
      readonly phase: "nametable" | "pattern";
      readonly slot: number;
      readonly visible: boolean;
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

  read(address: number, context?: PpuFetchContext): number;

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
   * Optional pattern-table routing into the console's 2 KiB CIRAM.
   *
   * The returned index is used instead of cartridge CHR for this access.
   * Namco 163 boards expose this physical substitution independently for
   * each 1 KiB pattern bank.
   */
  mapPatternToCiramAddress?(address: number, context?: PpuFetchContext): number | undefined;

  /**
   * Optional cartridge-controlled CIRAM routing for one nametable access.
   *
   * The returned index addresses the console/cartridge nametable memory
   * directly. Returning undefined leaves routing to fixed header mirroring.
   */
  mapNametableAddress?(address: number, context?: PpuFetchContext): number | undefined;

  /**
   * Optional cartridge-driven nametable byte.
   *
   * Returning undefined falls through to CIRAM routing. This models boards
   * that replace CIRAM with CHR ROM without encoding memory ownership in an
   * address sentinel.
   */
  readNametable?(address: number, context?: PpuFetchContext): number | undefined;

  /**
   * Optional cartridge-owned nametable bus response, including electrically
   * undriven ranges that must not fall through to console CIRAM.
   */
  readNametableBus?(
    address: number,
    context?: PpuFetchContext,
  ): { readonly value: number; readonly drivenMask: number } | undefined;

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

  /** Optional completed CPU-read observation for boards that snoop console traffic. */
  observeCpuRead?(address: number, value: number): void;

  /** Optional CPU-write observation for boards that snoop console registers. */
  observeCpuWrite?(address: number, value: number): void;

  /** Optional cartridge input driven by the RP2A03 OUT latch committed through $4016. */
  writeControllerLatch?(value: number): void;

  /** Optional cartridge-audio voltage contribution sampled by the console mixer. */
  expansionAudioSample?(): number;

  /** Optional PPU address-line observation for boards such as MMC3. */
  observePpuAddress?(address: number): void;

  /** Optional completed PPU-read observation for read-triggered boards such as MMC2/MMC4. */
  observePpuRead?(address: number, context?: PpuFetchContext): void;

  /** Optional per-dot clock paired with PPU address-line observation. */
  tickPpu?(): void;
}

/** Narrow interrupt capability required by IRQ-generating cartridge hardware. */
export interface MapperInterruptPort {
  setMapperIrq(asserted: boolean): void;
}
