import type Bus from "./bus.js";
import type { ConsoleTiming } from "./console-timing.js";
import { DmaBusPhase } from "./dma/dma-bus-phase.js";
import { IRQSource } from "./irq-source.js";
import { Envelope, type EnvelopeState } from "./apu/envelope.js";
import { FrameSequencer, type FrameSequencerState } from "./apu/frame-sequencer.js";
import { LengthCounter, type LengthCounterState } from "./apu/length-counter.js";
import {
  CONSERVATIVE_DMC_PROFILE,
  DeltaModulationChannel,
  RP2A03H_DMC_PROFILE,
  type DeltaModulationChannelState,
} from "./apu/delta-modulation-channel.js";

interface PulseChannelState {
  readonly lengthCounter: LengthCounterState;
  readonly timerPeriod: number;
  readonly timerValue: number;
  readonly dutyCycleIndex: number;
  readonly dutyStep: number;
  readonly sweepReload: boolean;
  readonly sweepEnabled: boolean;
  readonly sweepNegative: boolean;
  readonly sweepShift: number;
  readonly sweepPeriod: number;
  readonly sweepValue: number;
  readonly envelope: EnvelopeState;
}

interface TriangleChannelState {
  readonly lengthCounter: LengthCounterState;
  readonly timerPeriod: number;
  readonly timerValue: number;
  readonly dutyIndex: number;
  readonly counterReload: boolean;
  readonly counterPeriod: number;
  readonly counterValue: number;
  readonly isLengthHalted: boolean;
}

interface NoiseChannelState {
  readonly lengthCounter: LengthCounterState;
  readonly mode: boolean;
  readonly shiftRegister: number;
  readonly timerPeriod: number;
  readonly timerValue: number;
  readonly envelope: EnvelopeState;
}

export interface ApuSnapshot {
  readonly sampleRate: number;
  readonly pulseChannel1: PulseChannelState;
  readonly pulseChannel2: PulseChannelState;
  readonly triangleChannel: TriangleChannelState;
  readonly noiseChannel: NoiseChannelState;
  readonly deltaModulationChannel: DeltaModulationChannelState;
  readonly frameSequencer: FrameSequencerState;
  readonly cycle: number;
  readonly frameIRQPending: boolean;
  readonly frameIrqClearDelay: number;
  readonly pendingRegisterWrites: readonly {
    readonly address: number;
    readonly value: number;
    readonly cycle: number;
  }[];
}

/**
 * Represents a Pulse Channel in the Audio Processing Unit (APU)
 * Handles square wave generation with various modulation features
 */
class PulseChannel {
  // Channel state
  private readonly lengthCounter = new LengthCounter();
  // Flag to determine if extra sweep calculation is needed (used by Pulse 1)
  private readonly applyExtraSweep;
  // Length counter
  // Timer/frequency control
  private timerPeriod = 0;
  private timerValue = 0;
  // Duty cycle control (wave shape)
  private dutyCycleIndex = 0;
  private dutyStep = 0;
  // Frequency sweep control
  private sweepReload = false;
  private sweepEnabled = false;
  private sweepNegative = false;
  private sweepShift = 0;
  private sweepPeriod = 0;
  private sweepValue = 0;
  private readonly envelope = new Envelope();

  /**
   * Duty cycle patterns for the pulse wave
   * Each array represents a different duty cycle (12.5%, 25%, 50%, 75% negated)
   * Values: 0 = low, 1 = high
   */
  private static readonly DUTY_TABLE: readonly (readonly number[])[] = [
    [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
    [0, 1, 1, 0, 0, 0, 0, 0], // 25%
    [0, 1, 1, 1, 1, 0, 0, 0], // 50%
    [1, 0, 0, 1, 1, 1, 1, 1], // 75% negated
  ];

  /**
   * Creates a new Pulse Channel instance
   * @param applyExtraSweep - Whether to apply an extra decrement during sweep calculations
   */
  constructor(applyExtraSweep = false) {
    this.applyExtraSweep = applyExtraSweep;
  }

  /**
   * Sets the control register (0x4000/0x4004)
   * Controls duty cycle, length counter, and envelope settings
   * @param value - The control register value
   */
  set control(value: number) {
    this.dutyCycleIndex = (value >> 6) & 3;
    this.lengthCounter.halt = ((value >> 5) & 1) !== 0;
    this.envelope.configure(value);
  }

  /**
   * Sets the sweep register (0x4001/0x4005)
   * Controls frequency sweep parameters
   * @param value - The sweep register value
   */
  set sweep(value: number) {
    this.sweepEnabled = ((value >> 7) & 1) === 1;
    this.sweepPeriod = (value >> 4) & 7;
    this.sweepNegative = ((value >> 3) & 1) === 1;
    this.sweepShift = value & 7;
    this.sweepReload = true;
  }

  /**
   * Sets the low 8 bits of the timer period
   * @param value - The timer low byte
   */
  set timerLow(value: number) {
    this.timerPeriod = (this.timerPeriod & 0xff00) | value;
  }

  /**
   * Sets the high 3 bits of the timer period and length counter
   * @param value - The timer high byte
   */
  setTimerHigh(value: number, cpuCycle: number): void {
    this.lengthCounter.load(value >> 3, cpuCycle);
    this.timerPeriod = (this.timerPeriod & 0x00ff) | ((value & 7) << 8);
    this.envelope.restart();
    this.dutyStep = 0;
  }

  /**
   * Updates the timer and duty cycle step
   * Called at the CPU clock rate
   */
  public updateTimer() {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      this.dutyStep = (this.dutyStep + 1) % 8;
    } else {
      this.timerValue--;
    }
  }

  /**
   * Updates the volume envelope
   * Called at a rate of 240Hz
   */
  public updateEnvelope() {
    this.envelope.clock();
  }

  /**
   * Updates the length counter
   * Called at a rate of 120Hz
   */
  public updateLength(cpuCycle: number) {
    this.lengthCounter.clock(cpuCycle);
  }

  /**
   * Applies the frequency sweep calculation
   * Modifies the timer period based on sweep settings
   */
  private applySweep() {
    this.timerPeriod = this.sweepTargetPeriod;
  }

  private get sweepTargetPeriod(): number {
    const delta = this.timerPeriod >> this.sweepShift;
    if (!this.sweepNegative) return this.timerPeriod + delta;
    return this.timerPeriod - delta - (this.applyExtraSweep ? 1 : 0);
  }

  /**
   * Updates the frequency sweep unit
   * Called at a rate of 120Hz
   */
  public updateSweep() {
    const dividerExpired = this.sweepValue === 0;
    if (
      dividerExpired &&
      this.sweepEnabled &&
      this.sweepShift > 0 &&
      this.timerPeriod >= 8 &&
      this.sweepTargetPeriod <= 0x7ff
    ) {
      this.applySweep();
    }

    if (dividerExpired || this.sweepReload) {
      this.sweepValue = this.sweepPeriod;
      this.sweepReload = false;
    } else {
      this.sweepValue--;
    }
  }

  /**
   * Calculates the channel's output volume
   * @returns The current output level (0-15)
   */
  public output(): number {
    if (this.lengthCounter.value === 0) {
      return 0;
    }
    if (PulseChannel.DUTY_TABLE[this.dutyCycleIndex][this.dutyStep] === 0) {
      return 0;
    }
    if (this.timerPeriod < 8 || this.sweepTargetPeriod > 0x7ff) {
      return 0;
    }
    return this.envelope.output;
  }

  set enabled(enabled: boolean) {
    this.lengthCounter.enabled = enabled;
  }

  get lengthValue(): number {
    return this.lengthCounter.value;
  }

  commitRegisterWrites(): void {
    this.lengthCounter.commitRegisterWrites();
  }

  captureState(): PulseChannelState {
    return {
      lengthCounter: this.lengthCounter.captureState(),
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      dutyCycleIndex: this.dutyCycleIndex,
      dutyStep: this.dutyStep,
      sweepReload: this.sweepReload,
      sweepEnabled: this.sweepEnabled,
      sweepNegative: this.sweepNegative,
      sweepShift: this.sweepShift,
      sweepPeriod: this.sweepPeriod,
      sweepValue: this.sweepValue,
      envelope: this.envelope.captureState(),
    };
  }

  restoreState(state: PulseChannelState): void {
    this.lengthCounter.restoreState(state.lengthCounter);
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.dutyCycleIndex = state.dutyCycleIndex;
    this.dutyStep = state.dutyStep;
    this.sweepReload = state.sweepReload;
    this.sweepEnabled = state.sweepEnabled;
    this.sweepNegative = state.sweepNegative;
    this.sweepShift = state.sweepShift;
    this.sweepPeriod = state.sweepPeriod;
    this.sweepValue = state.sweepValue;
    this.envelope.restoreState(state.envelope);
  }
}

/**
 * Represents a Triangle Channel in the Audio Processing Unit (APU)
 * Generates a triangle waveform with fixed amplitude but variable frequency
 */
class TriangleChannel {
  // Channel state
  private readonly lengthCounter = new LengthCounter();
  // Length counter control
  // Timer/frequency control
  private timerPeriod = 0;
  private timerValue = 0;
  private dutyIndex = 0;
  // Linear counter control
  private counterReload = false;
  private counterPeriod = 0;
  private counterValue = 0;

  /**
   * Sequence of 32 values that form the triangle wave
   * Values decrease from 15 to 0, then increase from 0 to 15
   * Creates a triangle shape when plotted
   */
  private static readonly TRIANGLE_TABLE: readonly number[] = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    13, 14, 15,
  ];

  /**
   * Sets the control register (0x4008)
   * Controls length counter halt/linear counter control and linear counter period
   * @param value - The control register value
   */
  set control(value: number) {
    this.isLengthHalted = ((value >> 7) & 1) !== 0;
    this.lengthCounter.halt = this.isLengthHalted;
    this.counterPeriod = value & 0x7f;
  }

  /**
   * Sets the low 8 bits of the timer period
   * @param value - The timer low byte
   */
  set timerLow(value: number) {
    this.timerPeriod = (this.timerPeriod & 0xff00) | value;
  }

  /**
   * Sets the high 3 bits of the timer period and length counter
   * Also triggers counter reload
   * @param value - The timer high byte
   */
  setTimerHigh(value: number, cpuCycle: number): void {
    this.lengthCounter.load(value >> 3, cpuCycle);
    this.timerPeriod = (this.timerPeriod & 0x00ff) | ((value & 7) << 8);
    this.timerValue = this.timerPeriod;
    this.counterReload = true;
  }

  /**
   * Updates the timer and steps through the triangle sequence
   * Called at the CPU clock rate
   */
  public updateTimer() {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      // Only step through sequence if both length counter and linear counter are non-zero
      if (this.lengthCounter.value > 0 && this.counterValue > 0) {
        this.dutyIndex = (this.dutyIndex + 1) % 32;
      }
    } else {
      this.timerValue--;
    }
  }

  /**
   * Updates the length counter
   * Called at a rate of 120Hz
   */
  public updateLength(cpuCycle: number) {
    this.lengthCounter.clock(cpuCycle);
  }

  /**
   * Updates the linear counter
   * Called at a rate of 240Hz
   */
  public updateCounter() {
    if (this.counterReload) {
      this.counterValue = this.counterPeriod;
    } else if (this.counterValue > 0) {
      this.counterValue--;
    }
    if (!this.isLengthHalted) {
      this.counterReload = false;
    }
  }

  /**
   * Calculates the channel's output value
   * @returns The current output level (0-15)
   */
  public output(): number {
    // Hardware never mutes the triangle by period; emulators silence only the
    // genuinely ultrasonic periods 0 and 1 (>27 kHz) to avoid aliasing pops.
    if (this.timerPeriod < 2) {
      return 0;
    }
    if (this.lengthCounter.value === 0) {
      return 0;
    }
    if (this.counterValue === 0) {
      return 0;
    }
    return TriangleChannel.TRIANGLE_TABLE[this.dutyIndex];
  }

  private isLengthHalted = false;

  set enabled(enabled: boolean) {
    this.lengthCounter.enabled = enabled;
  }

  get lengthValue(): number {
    return this.lengthCounter.value;
  }

  commitRegisterWrites(): void {
    this.lengthCounter.commitRegisterWrites();
  }

  captureState(): TriangleChannelState {
    return {
      lengthCounter: this.lengthCounter.captureState(),
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      dutyIndex: this.dutyIndex,
      counterReload: this.counterReload,
      counterPeriod: this.counterPeriod,
      counterValue: this.counterValue,
      isLengthHalted: this.isLengthHalted,
    };
  }

  restoreState(state: TriangleChannelState): void {
    this.lengthCounter.restoreState(state.lengthCounter);
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.dutyIndex = state.dutyIndex;
    this.counterReload = state.counterReload;
    this.counterPeriod = state.counterPeriod;
    this.counterValue = state.counterValue;
    this.isLengthHalted = state.isLengthHalted;
  }
}

/**
 * Represents a Noise Channel in the Audio Processing Unit (APU)
 * Generates pseudo-random noise using a linear feedback shift register
 * Used for percussion and sound effects
 */
class NoiseChannel {
  // Channel state
  private readonly lengthCounter = new LengthCounter();
  // Noise generation control
  private mode = false; // Mode flag (0: 93-bit sequence, 1: 32767-bit sequence)
  private shiftRegister = 1; // 15-bit shift register for noise generation
  // Length counter control
  // Timer control
  private timerPeriod = 0;
  private timerValue = 0;
  private readonly envelope = new Envelope();

  /**
   * Lookup table for noise channel timer periods
   * Values are CPU clock divisors that determine noise frequency
   */
  constructor(private readonly timerPeriods: readonly number[]) {}

  /**
   * Sets the control register (0x400C)
   * Controls length counter, envelope loop, and envelope parameters
   * @param value - The control register value
   */
  set control(value: number) {
    this.lengthCounter.halt = ((value >> 5) & 1) !== 0;
    this.envelope.configure(value);
  }

  /**
   * Sets the noise period and mode (0x400E)
   * Controls the noise frequency and sequence mode
   * @param value - The period register value
   */
  set period(value: number) {
    this.mode = (value & 0x80) === 0x80;
    this.timerPeriod = this.timerPeriods[value & 0x0f] ?? 0;
  }

  /**
   * Sets the length counter value (0x400F)
   * @param value - The length register value
   */
  setLength(value: number, cpuCycle: number): void {
    this.lengthCounter.load(value >> 3, cpuCycle);
    this.envelope.restart();
  }

  /**
   * Updates the noise generator timer and shift register
   * Called at the CPU clock rate
   */
  public updateTimer() {
    if (this.timerValue === 0) {
      this.timerValue = this.timerPeriod;
      const shift = this.mode ? 6 : 1;
      const b1 = this.shiftRegister & 1;
      const b2 = (this.shiftRegister >> shift) & 1;
      this.shiftRegister >>= 1;
      this.shiftRegister |= (b1 ^ b2) << 14;
    } else {
      this.timerValue--;
    }
  }

  /**
   * Updates the volume envelope
   * Called at a rate of 240Hz
   */
  public updateEnvelope() {
    this.envelope.clock();
  }

  /**
   * Updates the length counter
   * Called at a rate of 120Hz
   */
  public updateLength(cpuCycle: number) {
    this.lengthCounter.clock(cpuCycle);
  }

  /**
   * Calculates the channel's output value
   * @returns The current output level (0-15)
   */
  public output(): number {
    if (this.lengthCounter.value === 0) {
      return 0;
    }
    if ((this.shiftRegister & 1) == 1) {
      return 0;
    }
    return this.envelope.output;
  }

  set enabled(enabled: boolean) {
    this.lengthCounter.enabled = enabled;
  }

  get lengthValue(): number {
    return this.lengthCounter.value;
  }

  commitRegisterWrites(): void {
    this.lengthCounter.commitRegisterWrites();
  }

  captureState(): NoiseChannelState {
    return {
      lengthCounter: this.lengthCounter.captureState(),
      mode: this.mode,
      shiftRegister: this.shiftRegister,
      timerPeriod: this.timerPeriod,
      timerValue: this.timerValue,
      envelope: this.envelope.captureState(),
    };
  }

  restoreState(state: NoiseChannelState): void {
    this.lengthCounter.restoreState(state.lengthCounter);
    this.mode = state.mode;
    this.shiftRegister = state.shiftRegister;
    this.timerPeriod = state.timerPeriod;
    this.timerValue = state.timerValue;
    this.envelope.restoreState(state.envelope);
  }
}

/**
 * Analog RC output filters on the RP2A03 audio pin.
 *
 * The console applies a 90 Hz high-pass, a 440 Hz high-pass and a 14 kHz
 * low-pass to the mixed signal. The high-pass stages also remove the large DC
 * bias present in the non-linear mixing tables, centering the waveform for the
 * output device. Each stage is a first-order filter clocked at the output
 * sample rate; the coefficients are derived from the RC time constants.
 */
class NesAudioFilterChain {
  private highPass90PreviousInput = 0;
  private highPass90PreviousOutput = 0;
  private highPass440PreviousInput = 0;
  private highPass440PreviousOutput = 0;
  private lowPass14kPreviousOutput = 0;
  private readonly highPass90Alpha: number;
  private readonly highPass440Alpha: number;
  private readonly lowPass14kAlpha: number;

  constructor(sampleRate: number) {
    this.highPass90Alpha = NesAudioFilterChain.highPassAlpha(90, sampleRate);
    this.highPass440Alpha = NesAudioFilterChain.highPassAlpha(440, sampleRate);
    this.lowPass14kAlpha = NesAudioFilterChain.lowPassAlpha(14_000, sampleRate);
  }

  process(sample: number): number {
    let output =
      this.highPass90Alpha *
      (this.highPass90PreviousOutput + sample - this.highPass90PreviousInput);
    this.highPass90PreviousInput = sample;
    this.highPass90PreviousOutput = output;

    const highPass440Input = output;
    output =
      this.highPass440Alpha *
      (this.highPass440PreviousOutput + highPass440Input - this.highPass440PreviousInput);
    this.highPass440PreviousInput = highPass440Input;
    this.highPass440PreviousOutput = output;

    this.lowPass14kPreviousOutput +=
      this.lowPass14kAlpha * (output - this.lowPass14kPreviousOutput);
    return this.lowPass14kPreviousOutput;
  }

  private static highPassAlpha(cutoffHz: number, sampleRate: number): number {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    return rc / (rc + dt);
  }

  private static lowPassAlpha(cutoffHz: number, sampleRate: number): number {
    const rc = 1 / (2 * Math.PI * cutoffHz);
    const dt = 1 / sampleRate;
    return dt / (rc + dt);
  }
}

/**
 * Handles mixing and output processing for all Audio Processing Unit (APU) channels
 * Implements the NES/Famicom audio mixing circuit emulation
 * Uses non-linear mixing tables to accurately reproduce the hardware behavior
 */
class AudioMixer {
  private readonly pulseChannel1: PulseChannel;
  private readonly pulseChannel2: PulseChannel;
  private readonly triangleChannel: TriangleChannel;
  private readonly noiseChannel: NoiseChannel;
  private readonly deltaModulationChannel: DeltaModulationChannel;
  private readonly filters: NesAudioFilterChain;

  /**
   * Lookup table for pulse channel mixing
   * Implements the non-linear mixing formula: 95.52 / (8128/n + 100)
   * Where n is the sum of pulse channel outputs (0-30)
   */
  private static readonly PULSE_MIX_TABLE = (() => {
    const pulseTable: number[] = [];
    for (let i = 0; i < 31; i++) {
      pulseTable[i] = 95.52 / (8128.0 / i + 100);
    }
    return pulseTable;
  })();

  /**
   * Lookup table for Triangle, Noise, and DMC channel mixing
   * Implements the non-linear mixing formula: 163.67 / (24329/n + 100)
   * Where n is the weighted sum of TND channel outputs (0-202)
   */
  private static readonly TND_MIX_TABLE: number[] = (() => {
    const tndTable: number[] = [];
    for (let i = 0; i < 203; i++) {
      tndTable[i] = 163.67 / (24329.0 / i + 100);
    }
    return tndTable;
  })();

  /**
   * Creates a new AudioMixer instance
   * @param channels - Object containing references to all APU channels
   */
  constructor(
    channels: {
      pulseChannel1: PulseChannel;
      pulseChannel2: PulseChannel;
      triangleChannel: TriangleChannel;
      noiseChannel: NoiseChannel;
      deltaModulationChannel: DeltaModulationChannel;
    },
    sampleRate: number,
  ) {
    this.pulseChannel1 = channels.pulseChannel1;
    this.pulseChannel2 = channels.pulseChannel2;
    this.triangleChannel = channels.triangleChannel;
    this.noiseChannel = channels.noiseChannel;
    this.deltaModulationChannel = channels.deltaModulationChannel;
    this.filters = new NesAudioFilterChain(sampleRate);
  }

  /**
   * Mixes all channel outputs using non-linear mixing tables
   * Implements the hardware mixing circuit behavior
   * @returns Combined output value (0.0 to 1.0)
   */
  private mix(): number {
    const p1 = this.pulseChannel1.output();
    const p2 = this.pulseChannel2.output();
    const t = this.triangleChannel.output();
    const n = this.noiseChannel.output();
    const d = this.deltaModulationChannel.output();

    // Mix using non-linear tables
    // Pulse channels are summed directly (0-30)
    // TND channels are weighted: Triangle * 3 + Noise * 2 + DMC * 1 (0-202)
    return AudioMixer.PULSE_MIX_TABLE[p1 + p2] + AudioMixer.TND_MIX_TABLE[3 * t + 2 * n + d];
  }

  /**
   * Applies the console's analog RC output filters to the mixed sample.
   * @param num - Input sample value
   * @returns Processed sample value
   */
  private filter(num: number): number {
    return this.filters.process(num);
  }

  /**
   * Produces the final audio output sample
   * @returns Final output value (0.0 to 1.0)
   */
  public output(): number {
    return this.filter(this.mix());
  }
}

/**
 * Audio Processing Unit (APU) implementation for NES/Famicom emulation
 * Manages all audio channels and handles audio timing/synchronization
 */
class APU {
  // Audio channel instances
  private pulseChannel1!: PulseChannel;
  private pulseChannel2!: PulseChannel;
  private triangleChannel!: TriangleChannel;
  private noiseChannel!: NoiseChannel;
  private deltaModulationChannel!: DeltaModulationChannel;
  private audioMixer!: AudioMixer;
  private readonly frameSequencer: FrameSequencer;
  // System components
  private readonly bus: Bus;
  private readonly cyclesPerSample: number;
  private readonly sampleRate: number;
  private readonly timing: ConsoleTiming;
  private readonly listeners: Array<(output: number) => void | Promise<void>> = [];

  // Frame counter state
  private cycle = 0;
  private frameIRQPending = false;
  private frameIrqClearDelay = 0;
  private readonly pendingRegisterWrites: Array<{
    readonly address: number;
    readonly value: number;
    readonly cycle: number;
  }> = [];

  /**
   * Creates a new APU instance
   * @param bus - Reference to the Bus
   */
  constructor(bus: Bus, timing: ConsoleTiming, sampleRate = 44_100) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new RangeError("Audio sample rate must be a positive finite number");
    }
    this.bus = bus;
    this.timing = timing;
    this.sampleRate = sampleRate;
    this.cyclesPerSample = timing.cpuFrequencyHz / sampleRate;
    this.initializeChannels();
    this.frameSequencer = new FrameSequencer(
      {
        quarterFrame: () => this.updateEnvelope(),
        halfFrame: () => this.clockHalfFrame(),
        requestIRQ: () => this.irq(),
        clearIRQ: () => this.clearFrameIRQ(),
      },
      timing.apu,
    );
  }

  public powerOn(): void {
    this.deltaModulationChannel.clearIRQ();
    this.bus.cancelDmcDma();
    this.initializeChannels();
    this.cycle = 0;
    this.clearPendingRegisterWrite();
    this.frameSequencer.powerOn();
  }

  captureState(): ApuSnapshot {
    return {
      sampleRate: this.sampleRate,
      pulseChannel1: this.pulseChannel1.captureState(),
      pulseChannel2: this.pulseChannel2.captureState(),
      triangleChannel: this.triangleChannel.captureState(),
      noiseChannel: this.noiseChannel.captureState(),
      deltaModulationChannel: this.deltaModulationChannel.captureState(),
      frameSequencer: this.frameSequencer.captureState(),
      cycle: this.cycle,
      frameIRQPending: this.frameIRQPending,
      frameIrqClearDelay: this.frameIrqClearDelay,
      pendingRegisterWrites: this.pendingRegisterWrites.map((write) => ({ ...write })),
    };
  }

  restoreState(state: ApuSnapshot): void {
    this.validateSnapshot(state);
    this.pulseChannel1.restoreState(state.pulseChannel1);
    this.pulseChannel2.restoreState(state.pulseChannel2);
    this.triangleChannel.restoreState(state.triangleChannel);
    this.noiseChannel.restoreState(state.noiseChannel);
    this.deltaModulationChannel.restoreState(state.deltaModulationChannel);
    this.frameSequencer.restoreState(state.frameSequencer);
    this.cycle = state.cycle;
    this.frameIRQPending = state.frameIRQPending;
    this.frameIrqClearDelay = state.frameIrqClearDelay;
    this.pendingRegisterWrites.splice(
      0,
      this.pendingRegisterWrites.length,
      ...state.pendingRegisterWrites.map((write) => ({ ...write })),
    );
  }

  public reset(): void {
    this.clearPendingRegisterWrite();
    this.control = 0;
    this.frameSequencer.reset();
  }

  private initializeChannels(): void {
    this.pulseChannel1 = new PulseChannel(true);
    this.pulseChannel2 = new PulseChannel();
    this.triangleChannel = new TriangleChannel();
    this.noiseChannel = new NoiseChannel(this.timing.apu.noiseTimerPeriods);
    this.deltaModulationChannel = new DeltaModulationChannel(
      {
        requestDma: (address, haltPhase) => this.bus.requestDmcDma(address, haltPhase),
        cancelDma: () => this.bus.cancelDmcDma(),
        setIrq: (asserted) => this.bus.setIRQSource(IRQSource.ApuDmc, asserted),
        currentDmaPhase: () => this.bus.currentDmaPhase(),
      },
      this.timing.apu.dmcTimerPeriods,
      this.timing.region === "ntsc" ? RP2A03H_DMC_PROFILE : CONSERVATIVE_DMC_PROFILE,
    );
    this.audioMixer = new AudioMixer(
      {
        pulseChannel1: this.pulseChannel1,
        pulseChannel2: this.pulseChannel2,
        triangleChannel: this.triangleChannel,
        noiseChannel: this.noiseChannel,
        deltaModulationChannel: this.deltaModulationChannel,
      },
      this.sampleRate,
    );
  }

  /**
   * Triggers CPU IRQ if frame IRQ is enabled
   */
  private irq() {
    this.frameIRQPending = true;
    this.frameIrqClearDelay = 0;
    this.bus.setIRQSource(IRQSource.ApuFrame, true);
  }

  /**
   * Updates channel timers
   * Pulse and noise update at half CPU rate. The DMC timer counts every CPU
   * cycle; its hardware period table contains full CPU-cycle periods.
   */
  private updateTimer() {
    if (this.cycle % 2 === 0) {
      this.pulseChannel1.updateTimer();
      this.pulseChannel2.updateTimer();
      this.noiseChannel.updateTimer();
    }
    this.deltaModulationChannel.updateTimer();
    this.triangleChannel.updateTimer(); // Triangle updates every cycle
  }

  /**
   * Updates envelope and linear counter units
   * Called at 240Hz by frame counter
   */
  private updateEnvelope() {
    this.pulseChannel1.updateEnvelope();
    this.pulseChannel2.updateEnvelope();
    this.triangleChannel.updateCounter();
    this.noiseChannel.updateEnvelope();
  }

  /**
   * Updates sweep units
   * Called at 120Hz by frame counter
   */
  private updateSweep() {
    this.pulseChannel1.updateSweep();
    this.pulseChannel2.updateSweep();
  }

  /**
   * Updates length counters
   * Called at 120Hz by frame counter
   */
  private updateLength() {
    this.pulseChannel1.updateLength(this.cycle);
    this.pulseChannel2.updateLength(this.cycle);
    this.triangleChannel.updateLength(this.cycle);
    this.noiseChannel.updateLength(this.cycle);
  }

  /**
   * Updates frame counter
   * Handles 4-step and 5-step sequence modes
   */
  private clockHalfFrame(): void {
    this.updateEnvelope();
    this.updateSweep();
    this.updateLength();
  }

  /**
   * Main update function
   * Called every CPU cycle
   */
  public update() {
    this.cycle++;
    if (this.frameIrqClearDelay > 0 && --this.frameIrqClearDelay === 0) {
      this.frameIRQPending = false;
    }
    this.deltaModulationChannel.clockCpu();
    this.updateTimer();
    this.frameSequencer.tick();
    this.commitRegisterWriteAtCurrentCycle();
    // Check for audio sample generation
    const s1 = Math.floor((this.cycle - 1) / this.cyclesPerSample);
    const s2 = Math.floor(this.cycle / this.cyclesPerSample);
    if (s1 != s2) {
      const output = this.output();
      this.listeners.forEach((listener) => {
        return listener(output);
      });
    }
  }

  /** Commits channel register writes after this CPU instruction's APU clocks. */
  public commitRegisterWrites(): void {
    this.pulseChannel1.commitRegisterWrites();
    this.pulseChannel2.commitRegisterWrites();
    this.triangleChannel.commitRegisterWrites();
    this.noiseChannel.commitRegisterWrites();
  }

  public completeDmcDmaByte(value: number): void {
    this.deltaModulationChannel.completeDmaByte(value);
  }

  get mayRequestDmcDma(): boolean {
    return this.deltaModulationChannel.mayRequestDma;
  }

  /**
   * Gets the current mixed audio output
   */
  private output(): number {
    return this.audioMixer.output();
  }

  /**
   * Reads the APU status register ($4015)
   * Returns channel length counter status
   */
  get status(): number {
    let res = 0;
    if (this.pulseChannel1.lengthValue > 0) {
      res |= 1;
    }
    if (this.pulseChannel2.lengthValue > 0) {
      res |= 2;
    }
    if (this.triangleChannel.lengthValue > 0) {
      res |= 4;
    }
    if (this.noiseChannel.lengthValue > 0) {
      res |= 8;
    }
    if (this.deltaModulationChannel.currentLength > 0) {
      res |= 16;
    }
    if (this.frameIRQPending) res |= 0x40;
    if (this.deltaModulationChannel.interruptPending) res |= 0x80;
    return res;
  }

  /**
   * Reads from APU registers
   * Only $4015 (status) is readable
   */
  public readRegister(address: number): number {
    if (address != 0x4015) {
      return 0;
    }
    const status = this.status;
    this.acknowledgeFrameIRQRead();
    return status;
  }

  /**
   * Writes to APU registers
   * Handles all channel control registers
   */
  public writeRegister(address: number, value: number) {
    switch (address) {
      // Pulse 1 registers
      case 0x4000:
        this.pulseChannel1.control = value;
        break;
      case 0x4001:
        this.pulseChannel1.sweep = value;
        break;
      case 0x4002:
        this.pulseChannel1.timerLow = value;
        break;
      case 0x4003:
        this.pulseChannel1.setTimerHigh(value, this.cycle);
        break;
      // Pulse 2 registers
      case 0x4004:
        this.pulseChannel2.control = value;
        break;
      case 0x4005:
        this.pulseChannel2.sweep = value;
        break;
      case 0x4006:
        this.pulseChannel2.timerLow = value;
        break;
      case 0x4007:
        this.pulseChannel2.setTimerHigh(value, this.cycle);
        break;
      // Triangle registers
      case 0x4008:
        this.triangleChannel.control = value;
        break;
      case 0x400a:
        this.triangleChannel.timerLow = value;
        break;
      case 0x400b:
        this.triangleChannel.setTimerHigh(value, this.cycle);
        break;
      // DMC registers
      case 0x4010:
        this.deltaModulationChannel.control = value;
        break;
      case 0x4011:
        this.deltaModulationChannel.value = value;
        break;
      case 0x4012:
        this.deltaModulationChannel.address = value;
        break;
      case 0x4013:
        this.deltaModulationChannel.length = value;
        break;
      // Noise registers
      case 0x400c:
        this.noiseChannel.control = value;
        break;
      case 0x400e:
        this.noiseChannel.period = value;
        break;
      case 0x400f:
        this.noiseChannel.setLength(value, this.cycle);
        break;
      // Control registers
      case 0x4015:
        this.control = value;
        break;
      case 0x4017:
        this.frameCounter = value;
        break;
    }
  }

  /**
   * Sets channel enable/disable flags ($4015)
   */
  set control(value: number) {
    this.deltaModulationChannel.clearIRQ();
    // Enable/disable channels
    this.pulseChannel1.enabled = (value & 1) === 1;
    this.pulseChannel2.enabled = (value & 2) === 2;
    this.triangleChannel.enabled = (value & 4) === 4;
    this.noiseChannel.enabled = (value & 8) === 8;
    this.deltaModulationChannel.setEnabled((value & 16) === 16);
  }

  /**
   * Sets frame counter mode ($4017)
   */
  set frameCounter(value: number) {
    this.frameSequencer.write(value, this.cycle);
  }

  public scheduleRegisterWrite(address: number, value: number, cpuCyclesFromNow: number): void {
    if (cpuCyclesFromNow <= 0) {
      this.writeRegister(address, value);
      this.commitRegisterWrites();
      return;
    }
    this.pendingRegisterWrites.push({
      address: address & 0xffff,
      value: value & 0xff,
      cycle: this.cycle + cpuCyclesFromNow,
    });
  }

  public addListener(listener: (output: number) => void | Promise<void>): void {
    this.listeners.push(listener);
  }

  private clearFrameIRQ(): void {
    this.frameIRQPending = false;
    this.frameIrqClearDelay = 0;
    this.bus.setIRQSource(IRQSource.ApuFrame, false);
  }

  /** A status read drops /IRQ now; its internal flag clears on the next APU-cycle boundary. */
  private acknowledgeFrameIRQRead(): void {
    this.bus.setIRQSource(IRQSource.ApuFrame, false);
    if (this.frameIRQPending && this.frameIrqClearDelay === 0) {
      this.frameIrqClearDelay = this.bus.currentDmaPhase() === DmaBusPhase.Get ? 1 : 2;
    }
  }

  private commitRegisterWriteAtCurrentCycle(): void {
    let committedWrite = false;
    while ((this.pendingRegisterWrites[0]?.cycle ?? Number.POSITIVE_INFINITY) <= this.cycle) {
      const write = this.pendingRegisterWrites.shift();
      if (write) {
        this.writeRegister(write.address, write.value);
        committedWrite = true;
      }
    }
    if (committedWrite) this.commitRegisterWrites();
  }

  private clearPendingRegisterWrite(): void {
    this.pendingRegisterWrites.length = 0;
  }

  private validateSnapshot(state: ApuSnapshot): void {
    APU.validateNonNegativeIntegers(state);
    if (state.sampleRate !== this.sampleRate) {
      throw new Error("APU save state was created for another audio sample rate");
    }
    if (
      (state.frameSequencer.period !== 4 && state.frameSequencer.period !== 5) ||
      (state.frameSequencer.pendingPeriod !== 4 && state.frameSequencer.pendingPeriod !== 5)
    ) {
      throw new RangeError("APU save state contains an invalid frame-sequencer period");
    }
    if (state.frameIrqClearDelay > 2) {
      throw new RangeError("APU save state contains an invalid frame-IRQ clear delay");
    }
    if (
      state.pendingRegisterWrites.some(
        (write) => write.address < 0x4000 || write.address > 0x4017 || write.value > 0xff,
      )
    ) {
      throw new RangeError("APU save state contains an invalid pending register write");
    }
  }

  private static validateNonNegativeIntegers(value: unknown): void {
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError("APU save state contains an invalid numeric value");
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const nested of Object.values(value)) APU.validateNonNegativeIntegers(nested);
  }
}

export default APU;
