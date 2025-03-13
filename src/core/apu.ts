import CPU from "./cpu.ts";
import Bus from "./bus.ts";

/**
 * Represents a Pulse Channel in the Audio Processing Unit (APU)
 * Handles square wave generation with various modulation features
 */
class PulseChannel {
    // Channel state
    public enabled: boolean = false
    // Flag to determine if extra sweep calculation is needed (used by Pulse 1)
    private readonly applyExtraSweep
    // Length counter
    private lengthEnabled: boolean = false
    public lengthValue: number = 0
    // Timer/frequency control
    private timerPeriod: number = 0
    private timerValue: number = 0
    // Duty cycle control (wave shape)
    private dutyCycleIndex: number = 0
    private dutyStep: number = 0
    // Frequency sweep control
    private sweepReload: boolean = false
    private sweepEnabled: boolean = false
    private sweepNegative: boolean = false
    private sweepShift: number = 0
    private sweepPeriod: number = 0
    private sweepValue: number = 0
    // Volume envelope control
    private envelopeEnabled: boolean = false
    private envelopeLoop: boolean = false
    private envelopeRestart: boolean = false
    private envelopePeriod: number = 0
    private envelopeValue: number = 0
    private envelopeVolume: number = 0
    private constantVolume: number = 0

    /**
     * Duty cycle patterns for the pulse wave
     * Each array represents a different duty cycle (12.5%, 25%, 50%, 75% negated)
     * Values: 0 = low, 1 = high
     */
    private static DUTY_TABLE: number[][] = [
        [0, 1, 0, 0, 0, 0, 0, 0], // 12.5%
        [0, 1, 1, 0, 0, 0, 0, 0], // 25%
        [0, 1, 1, 1, 1, 0, 0, 0], // 50%
        [1, 0, 0, 1, 1, 1, 1, 1], // 75% negated
    ]

    /**
     * Creates a new Pulse Channel instance
     * @param applyExtraSweep - Whether to apply an extra decrement during sweep calculations
     */
    constructor(applyExtraSweep: boolean = false) {
        this.applyExtraSweep = applyExtraSweep
    }

    /**
     * Sets the control register (0x4000/0x4004)
     * Controls duty cycle, length counter, and envelope settings
     * @param value - The control register value
     */
    set control(value: number) {
        this.dutyCycleIndex = (value >> 6) & 3
        this.lengthEnabled = ((value >> 5) & 1) === 0
        this.envelopeLoop = ((value >> 5) & 1) === 1
        this.envelopeEnabled = ((value >> 4) & 1) === 0
        this.envelopePeriod = value & 15
        this.constantVolume = value & 15
        this.envelopeRestart = true
    }

    /**
     * Sets the sweep register (0x4001/0x4005)
     * Controls frequency sweep parameters
     * @param value - The sweep register value
     */
    set sweep(value: number) {
        this.sweepEnabled = ((value >> 7) & 1) === 0
        this.sweepPeriod = ((value >> 4) & 1) + 1
        this.sweepNegative = ((value >> 3) & 1) === 1
        this.sweepShift = value & 7
        this.sweepReload = true
    }

    /**
     * Sets the low 8 bits of the timer period
     * @param value - The timer low byte
     */
    set timerLow(value: number) {
        this.timerPeriod = (this.timerPeriod & 0xFF00) | value
    }

    /**
     * Sets the high 3 bits of the timer period and length counter
     * @param value - The timer high byte
     */
    set timerHigh(value: number) {
        this.lengthValue = APU.LENGTH_TABLE [value >> 3]
        this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 7) << 8)
        this.envelopeRestart = true
        this.dutyStep = 0
    }

    /**
     * Updates the timer and duty cycle step
     * Called at the CPU clock rate
     */
    public updateTimer() {
        if (this.timerValue === 0) {
            this.timerValue = this.timerPeriod
            this.dutyStep = (this.dutyStep + 1) % 8
        } else {
            this.timerValue--
        }
    }

    /**
     * Updates the volume envelope
     * Called at a rate of 240Hz
     */
    public updateEnvelope() {
        if (this.envelopeRestart) {
            this.envelopeVolume = 15
            this.envelopeValue = this.envelopePeriod
            this.envelopeRestart = false
            return
        }
        if (this.envelopeValue > 0) {
            this.envelopeValue--
            return
        }
        if (this.envelopeVolume > 0) {
            this.envelopeVolume--
        }
        if (this.envelopeLoop) {
            this.envelopeVolume = 15
        }
        this.envelopeValue = this.envelopePeriod
    }

    /**
     * Updates the length counter
     * Called at a rate of 120Hz
     */
    public updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    /**
     * Applies the frequency sweep calculation
     * Modifies the timer period based on sweep settings
     */
    private applySweep() {
        const delta = this.timerPeriod >> this.sweepShift;
        this.timerPeriod += this.sweepNegative ? -delta : delta;

        if (this.sweepNegative && this.applyExtraSweep) {
            this.timerPeriod--;
        }
    }

    /**
     * Updates the frequency sweep unit
     * Called at a rate of 120Hz
     */
    public updateSweep() {
        if (this.sweepReload) {
            if (this.sweepEnabled && this.sweepValue === 0) {
                this.applySweep()
            }
            this.sweepValue = this.sweepPeriod
            this.sweepReload = false
            return
        }

        if (this.sweepValue > 0) {
            this.sweepValue--
            return
        }

        if (this.sweepEnabled) {
            this.applySweep()
        }
        this.sweepValue = this.sweepPeriod
    }

    /**
     * Calculates the channel's output volume
     * @returns The current output level (0-15)
     */
    public output(): number {
        if (!this.enabled) {
            return 0
        }
        if (this.lengthValue === 0) {
            return 0
        }
        if (PulseChannel.DUTY_TABLE[this.dutyCycleIndex][this.dutyStep] === 0) {
            return 0
        }
        if ((this.timerPeriod < 8) || (this.timerPeriod > 0x7FF)) {
            return 0
        }
        return this.envelopeEnabled ?
            this.envelopeVolume :
            this.constantVolume
    }

}

/**
 * Represents a Triangle Channel in the Audio Processing Unit (APU)
 * Generates a triangle waveform with fixed amplitude but variable frequency
 */
class TriangleChannel {
    // Channel state
    public enabled: boolean = false
    // Length counter control
    private lengthEnabled: boolean = false
    public lengthValue: number = 0
    // Timer/frequency control
    private timerPeriod: number = 0
    private timerValue: number = 0
    private dutyIndex: number = 0
    // Linear counter control
    private counterReload: boolean = false
    private counterPeriod: number = 0
    private counterValue: number = 0

    /**
     * Sequence of 32 values that form the triangle wave
     * Values decrease from 15 to 0, then increase from 0 to 15
     * Creates a triangle shape when plotted
     */
    private static TRIANGLE_TABLE: number[] = [
        15, 14, 13, 12, 11, 10, 9, 8, 7, 6,
        5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5,
        6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]

    /**
     * Sets the control register (0x4008)
     * Controls length counter halt/linear counter control and linear counter period
     * @param value - The control register value
     */
    set control(value: number) {
        this.lengthEnabled = ((value >> 7) & 1) === 0
        this.counterPeriod = value & 0x7F
    }

    /**
     * Sets the low 8 bits of the timer period
     * @param value - The timer low byte
     */
    set timerLow(value: number) {
        this.timerPeriod = (this.timerPeriod & 0xFF00) | value
    }

    /**
     * Sets the high 3 bits of the timer period and length counter
     * Also triggers counter reload
     * @param value - The timer high byte
     */
    set timerHigh(value: number) {
        this.lengthValue = APU.LENGTH_TABLE[value >> 3]
        this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 7) << 8)
        this.timerValue = this.timerPeriod
        this.counterReload = true
    }

    /**
     * Updates the timer and steps through the triangle sequence
     * Called at the CPU clock rate
     */
    public updateTimer() {
        if (this.timerValue === 0) {
            this.timerValue = this.timerPeriod
            // Only step through sequence if both length counter and linear counter are non-zero
            if (this.lengthValue > 0 && this.counterValue > 0) {
                this.dutyIndex = (this.dutyIndex + 1) % 32
            }
        } else {
            this.timerValue--
        }
    }

    /**
     * Updates the length counter
     * Called at a rate of 120Hz
     */
    public updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    /**
     * Updates the linear counter
     * Called at a rate of 240Hz
     */
    public updateCounter() {
        if (this.counterReload) {
            this.counterValue = this.counterPeriod
        } else if (this.counterValue > 0) {
            this.counterValue--
        }
        if (this.lengthEnabled) {
            this.counterReload = false
        }
    }

    /**
     * Calculates the channel's output value
     * @returns The current output level (0-15)
     */
    public output(): number {
        if (!this.enabled) {
            return 0
        }
        if (this.timerPeriod < 3) {
            return 0
        }
        if (this.lengthValue === 0) {
            return 0
        }
        if (this.counterValue === 0) {
            return 0
        }
        return TriangleChannel.TRIANGLE_TABLE[this.dutyIndex]
    }
}

/**
 * Represents a Noise Channel in the Audio Processing Unit (APU)
 * Generates pseudo-random noise using a linear feedback shift register
 * Used for percussion and sound effects
 */
class NoiseChannel {
    // Channel state
    public enabled: boolean = false
    // Noise generation control
    private mode: boolean = false              // Mode flag (0: 93-bit sequence, 1: 32767-bit sequence)
    private shiftRegister: number = 1          // 15-bit shift register for noise generation
    // Length counter control
    private lengthEnabled: boolean = false
    public lengthValue: number = 0
    // Timer control
    private timerPeriod: number = 0
    private timerValue: number = 0
    // Volume envelope control
    private envelopeEnabled: boolean = false
    private envelopeLoop: boolean = false
    private envelopeRestart: boolean = false
    private envelopePeriod: number = 0
    private envelopeValue: number = 0
    private envelopeVolume: number = 0
    private constantVolume: number = 0

    /**
     * Lookup table for noise channel timer periods
     * Values are CPU clock divisors that determine noise frequency
     */
    private static NOISE_TABLE: number[] = [
        4, 8, 16, 32, 64, 96, 128, 160, 202,
        254, 380, 508, 762, 1016, 2034, 4068,
    ]

    /**
     * Sets the control register (0x400C)
     * Controls length counter, envelope loop, and envelope parameters
     * @param value - The control register value
     */
    set control(value: number) {
        this.lengthEnabled = ((value >> 5) & 1) === 0
        this.envelopeLoop = ((value >> 5) & 1) === 1
        this.envelopeEnabled = ((value >> 4) & 1) === 0
        this.envelopePeriod = value & 15
        this.constantVolume = value & 15
        this.envelopeRestart = true
    }

    /**
     * Sets the noise period and mode (0x400E)
     * Controls the noise frequency and sequence mode
     * @param value - The period register value
     */
    set period(value: number) {
        this.mode = (value & 0x80) === 0x80
        this.timerPeriod = NoiseChannel.NOISE_TABLE[value & 0x0F]
    }

    /**
     * Sets the length counter value (0x400F)
     * @param value - The length register value
     */
    set length(value: number) {
        this.lengthValue = APU.LENGTH_TABLE[value >> 3]
        this.envelopeRestart = true
    }

    /**
     * Updates the noise generator timer and shift register
     * Called at the CPU clock rate
     */
    public updateTimer() {
        if (this.timerValue === 0) {
            this.timerValue = this.timerPeriod
            const shift = this.mode ? 6 : 1
            const b1 = this.shiftRegister & 1
            const b2 = (this.shiftRegister >> shift) & 1
            this.shiftRegister >>= 1
            this.shiftRegister |= (b1 ^ b2) << 14
        } else {
            this.timerValue--
        }
    }

    /**
     * Updates the volume envelope
     * Called at a rate of 240Hz
     */
    public updateEnvelope() {
        if (this.envelopeRestart) {
            this.envelopeVolume = 15
            this.envelopeValue = this.envelopePeriod
            this.envelopeRestart = false
            return
        }
        if (this.envelopeValue > 0) {
            this.envelopeValue--
        }
        if (this.envelopeVolume > 0) {
            this.envelopeVolume--
        }
        if (this.envelopeLoop) {
            this.envelopeVolume = 15
        }
        this.envelopeValue = this.envelopePeriod
    }

    /**
     * Updates the length counter
     * Called at a rate of 120Hz
     */
    public updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    /**
     * Calculates the channel's output value
     * @returns The current output level (0-15)
     */
    public output(): number {
        if (!this.enabled) {
            return 0
        }
        if (this.lengthValue === 0) {
            return 0
        }
        if ((this.shiftRegister & 1) == 1) {
            return 0
        }
        return this.envelopeEnabled ?
            this.envelopeVolume :
            this.constantVolume
    }
}

/**
 * Represents the Delta Modulation Channel (DMC) in the Audio Processing Unit (APU)
 * Plays digital audio samples using delta modulation encoding
 * Can directly access CPU memory to fetch sample data
 */
class DeltaModulationChannel {
    private readonly cpu: CPU                  // Reference to CPU for memory access
    public enabled: boolean = false                   // Channel enable flag
    private val: number = 0                    // Current output level (0-127)
    // Sample memory control
    private simpleAddress: number = 0          // Initial sample address
    private simpleLength: number = 0           // Initial sample length
    private currentAddress: number = 0         // Current sample read address
    public currentLength: number = 0                  // Remaining sample bytes
    // Delta modulation control
    private shiftRegister: number = 0          // 8-bit shift register for sample data
    private bitCount: number = 0               // Remaining bits in shift register
    private tickPeriod: number = 0            // Sample rate timer period
    private tickValue: number = 0              // Current timer value
    private loop: boolean = false              // Sample loop flag

    /**
     * Lookup table for DMC timer periods
     * Values determine the sample playback rate
     */
    private static DMC_TABLE: number[] = [
        214, 190, 170, 160, 143, 127, 113,
        107, 95, 80, 71, 64, 53, 42, 36, 27,
    ]

    //private irq: boolean = false

    /**
     * Creates a new DMC instance
     * @param cpu - Reference to the CPU for memory access
     */
    constructor(cpu: CPU) {
        this.cpu = cpu
    }

    /**
     * Sets the control register (0x4010)
     * Controls IRQ, loop flag, and playback rate
     * @param value - The control register value
     */
    set control(value: number) {
        // this.irq = (value & 0x80) === 0x80
        this.loop = (value & 0x40) === 0x40
        this.tickPeriod = DeltaModulationChannel.DMC_TABLE[value & 0x0F]
    }

    /**
     * Sets the direct load counter (0x4011)
     * Directly sets the output level
     * @param value - The output level (7 bits)
     */
    set value(value: number) {
        this.val = value & 0x7F
    }

    /**
     * Sets the sample address register (0x4012)
     * Sample address = 0xC000 + (value * 64)
     * @param value - The address register value
     */
    set address(value: number) {
        this.simpleAddress = 0xC000 | value << 6
    }

    /**
     * Sets the sample length register (0x4013)
     * Sample length = (value * 16) + 1 bytes
     * @param value - The length register value
     */
    set length(value: number) {
        this.simpleLength = (value << 4) | 1
    }

    /**
     * Restarts sample playback
     * Resets current address and length to initial values
     */
    public restart(): void {
        this.currentAddress = this.simpleAddress
        this.currentLength = this.simpleLength
    }

    /**
     * Updates the sample reader
     * Fetches new sample bytes from memory when needed
     */
    public updateReader() {
        if (this.currentLength > 0 && this.bitCount === 0) {
            this.cpu.stall += 4                // CPU stall for memory read
            this.shiftRegister = this.cpu.readByte(this.currentAddress)
            this.bitCount = 8
            this.currentAddress++
            if (this.currentAddress === 0) {   // Handle memory overflow
                this.currentAddress = 0x8000
            }
            this.currentLength--
            if (this.currentLength === 0 && this.loop) {
                this.restart()
            }
        }

    }

    /**
     * Updates the delta modulation unit
     * Processes one bit of the current sample byte
     */
    public updateShifter() {
        if (this.bitCount === 0) {
            return
        }
        if ((this.shiftRegister & 1) == 1) {   // Increment output level
            if (this.val <= 125) {
                this.val += 2
            }
        } else {                               // Decrement output level
            if (this.val >= 2) {
                this.val -= 2
            }
        }
        this.shiftRegister >>= 1
        this.bitCount--
    }

    /**
     * Updates the DMC timer
     * Called at the CPU clock rate
     */
    public updateTimer() {
        if (!this.enabled) {
            return
        }
        this.updateReader()
        if (this.tickValue === 0) {
            this.tickValue = this.tickPeriod
            this.updateShifter()
        } else {
            this.tickValue--
        }
    }

    /**
     * Returns the current output level
     * @returns The current output level (0-127)
     */
    public output(): number {
        return this.val
    }
}

/**
 * Handles mixing and output processing for all Audio Processing Unit (APU) channels
 * Implements the NES/Famicom audio mixing circuit emulation
 * Uses non-linear mixing tables to accurately reproduce the hardware behavior
 */
class AudioMixer {
    private readonly pulseChannel1: PulseChannel
    private readonly pulseChannel2: PulseChannel
    private readonly triangleChannel: TriangleChannel
    private readonly noiseChannel: NoiseChannel
    private readonly deltaModulationChannel: DeltaModulationChannel

    /**
     * Lookup table for pulse channel mixing
     * Implements the non-linear mixing formula: 95.52 / (8128/n + 100)
     * Where n is the sum of pulse channel outputs (0-30)
     */
    private static readonly PULSE_MIX_TABLE = (() => {
        const pulseTable: number[] = []
        for (let i = 0; i < 31; i++) {
            pulseTable[i] = 95.52 / (8128.0 / i + 100)
        }
        return pulseTable
    })()

    /**
     * Lookup table for Triangle, Noise, and DMC channel mixing
     * Implements the non-linear mixing formula: 163.67 / (24329/n + 100)
     * Where n is the weighted sum of TND channel outputs (0-202)
     */
    private static readonly TND_MIX_TABLE: number[] = (() => {
        const tndTable: number[] = []
        for (let i = 0; i < 203; i++) {
            tndTable[i] = 163.67 / (24329.0 / i + 100)
        }
        return tndTable
    })()

    /**
     * Creates a new AudioMixer instance
     * @param channels - Object containing references to all APU channels
     */
    constructor(channels: {
        pulseChannel1: PulseChannel,
        pulseChannel2: PulseChannel,
        triangleChannel: TriangleChannel,
        noiseChannel: NoiseChannel,
        deltaModulationChannel: DeltaModulationChannel
    }) {
        this.pulseChannel1 = channels.pulseChannel1
        this.pulseChannel2 = channels.pulseChannel2
        this.triangleChannel = channels.triangleChannel
        this.noiseChannel = channels.noiseChannel
        this.deltaModulationChannel = channels.deltaModulationChannel
    }


    /**
     * Mixes all channel outputs using non-linear mixing tables
     * Implements the hardware mixing circuit behavior
     * @returns Combined output value (0.0 to 1.0)
     */
    private mix(): number {
        const p1 = this.pulseChannel1.output()
        const p2 = this.pulseChannel2.output()
        const t = this.triangleChannel.output()
        const n = this.noiseChannel.output()
        const d = this.deltaModulationChannel.output()

        // Mix using non-linear tables
        // Pulse channels are summed directly (0-30)
        // TND channels are weighted: Triangle * 3 + Noise * 2 + DMC * 1 (0-202)
        return AudioMixer.PULSE_MIX_TABLE[p1 + p2] +
            AudioMixer.TND_MIX_TABLE[3 * t + 2 * n + d]
    }

    /**
     * Applies additional filtering to the mixed output
     * Can be used for low-pass filtering or other audio processing
     * @param num - Input sample value
     * @returns Processed sample value
     */
    private filter(num: number): number {
        return num
    }

    /**
     * Produces the final audio output sample
     * @returns Final output value (0.0 to 1.0)
     */
    public output(): number {
        return this.filter(this.mix())
    }
}

/**
 * Audio Processing Unit (APU) implementation for NES/Famicom emulation
 * Manages all audio channels and handles audio timing/synchronization
 */
class APU {
    // Audio channel instances
    private readonly pulseChannel1: PulseChannel
    private readonly pulseChannel2: PulseChannel
    private readonly triangleChannel: TriangleChannel
    private readonly noiseChannel: NoiseChannel
    private readonly deltaModulationChannel: DeltaModulationChannel
    private readonly audioMixer: AudioMixer
    // System components
    private readonly bus: Bus
    private readonly sampleRate: number = 0
    private monitor: ((output: number) => void) | undefined = undefined

    // Frame counter state
    private cycle: number = 0
    private framePeriod: number = 0
    private frameValue: number = 0
    private frameIRQ: boolean = false

    /**
     * Frame counter rate (240Hz)
     * Derived from CPU frequency
     */
    private static FRAME_COUNTER_RATE: number = CPU.FREQUENCY / 240

    /**
     * Length counter lookup table
     * Used by all channels except DMC
     */
    public static LENGTH_TABLE: number[] = [
        10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
        12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
    ]

    /**
     * Creates a new APU instance
     * @param bus - Reference to the Bus
     */
    constructor(bus: Bus) {
        this.bus = bus
        this.framePeriod = 4
        this.pulseChannel1 = new PulseChannel(true)  // Extra sweep unit
        this.pulseChannel2 = new PulseChannel()
        this.triangleChannel = new TriangleChannel()
        this.noiseChannel = new NoiseChannel()
        this.deltaModulationChannel = new DeltaModulationChannel(this.bus.CPU)
        this.audioMixer = new AudioMixer({
            pulseChannel1: this.pulseChannel1,
            pulseChannel2: this.pulseChannel2,
            triangleChannel: this.triangleChannel,
            noiseChannel: this.noiseChannel,
            deltaModulationChannel: this.deltaModulationChannel,
        })
    }

    /**
     * Triggers CPU IRQ if frame IRQ is enabled
     */
    private irq() {
        if (this.frameIRQ) {
            this.bus.CPU.triggerIRQ()
        }
    }

    /**
     * Updates channel timers
     * Pulse, Noise, and DMC channels update at half CPU rate
     */
    private updateTimer() {
        if (this.cycle % 2 === 0) {
            this.pulseChannel1.updateTimer()
            this.pulseChannel2.updateTimer()
            this.noiseChannel.updateTimer()
            this.deltaModulationChannel.updateTimer()
        }
        this.triangleChannel.updateTimer()   // Triangle updates every cycle
    }

    /**
     * Updates envelope and linear counter units
     * Called at 240Hz by frame counter
     */
    private updateEnvelope() {
        this.pulseChannel1.updateEnvelope()
        this.pulseChannel2.updateEnvelope()
        this.triangleChannel.updateCounter()
        this.noiseChannel.updateEnvelope()
    }

    /**
     * Updates sweep units
     * Called at 120Hz by frame counter
     */
    private updateSweep() {
        this.pulseChannel1.updateSweep()
        this.pulseChannel2.updateSweep()
    }

    /**
     * Updates length counters
     * Called at 120Hz by frame counter
     */
    private updateLength() {
        this.pulseChannel1.updateLength()
        this.pulseChannel2.updateLength()
        this.triangleChannel.updateLength()
        this.noiseChannel.updateLength()
    }

    /**
     * Updates frame counter
     * Handles 4-step and 5-step sequence modes
     */
    private updateFrameCounter() {
        if (this.framePeriod !== 4 && this.framePeriod !== 5) {
            return
        }
        this.frameValue = (this.frameValue + 1) % this.framePeriod
        // Steps 0,2: envelope and triangle linear counter
        if (this.frameValue === 0 || this.frameValue === 2) {
            this.updateEnvelope()
        }
        // Steps 1,3: envelope, sweep, and length counters
        else if (this.frameValue === 1 || this.frameValue === 3) {
            this.updateEnvelope()
            this.updateSweep()
            this.updateLength()
        }
        // Generate IRQ in 4-step mode at step 3
        if (this.framePeriod === 4 && this.frameValue === 3) {
            this.irq()
        }
    }

    /**
     * Main update function
     * Called every CPU cycle
     */
    public update() {
        const cycle1 = this.cycle
        this.cycle++
        const cycle2 = this.cycle
        this.updateTimer()
        // Check for frame counter updates
        const f1 = Math.floor(cycle1 / APU.FRAME_COUNTER_RATE)
        const f2 = Math.floor(cycle2 / APU.FRAME_COUNTER_RATE)
        if (f1 != f2) {
            this.updateFrameCounter()
        }
        // Check for audio sample generation
        const s1 = Math.floor(cycle1 / this.sampleRate)
        const s2 = Math.floor(cycle2 / this.sampleRate)
        if (s1 != s2) {
            const output = this.output()
            this.monitor?.(output)
        }
    }

    /**
     * Gets the current mixed audio output
     */
    private output(): number {
        return this.audioMixer.output()
    }

    /**
     * Reads the APU status register ($4015)
     * Returns channel length counter status
     */
    get status(): number {
        let res = 0
        if (this.pulseChannel1.lengthValue > 0) {
            res |= 1
        }
        if (this.pulseChannel2.lengthValue > 0) {
            res |= 2
        }
        if (this.triangleChannel.lengthValue > 0) {
            res |= 4
        }
        if (this.noiseChannel.lengthValue > 0) {
            res |= 8
        }
        if (this.deltaModulationChannel.currentLength > 0) {
            res |= 16
        }
        return res
    }

    /**
     * Reads from APU registers
     * Only $4015 (status) is readable
     */
    public readRegister(address: number): number {
        if (address != 0x4015) {
            return 0
        }
        return this.status
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
                break
            case 0x4001:
                this.pulseChannel1.sweep = value;
                break
            case 0x4002:
                this.pulseChannel1.timerLow = value;
                break
            case 0x4003:
                this.pulseChannel1.timerHigh = value;
                break
            // Pulse 2 registers
            case 0x4004:
                this.pulseChannel2.control = value;
                break
            case 0x4005:
                this.pulseChannel2.sweep = value;
                break
            case 0x4006:
                this.pulseChannel2.timerLow = value;
                break
            case 0x4007:
                this.pulseChannel2.timerHigh = value;
                break
            // Triangle registers
            case 0x4008:
                this.triangleChannel.control = value;
                break
            case 0x400A:
                this.triangleChannel.timerLow = value;
                break
            case 0x400B:
                this.triangleChannel.timerHigh = value;
                break
            // DMC registers
            case 0x4010:
                this.deltaModulationChannel.control = value;
                break
            case 0x4011:
                this.deltaModulationChannel.value = value;
                break
            case 0x4012:
                this.deltaModulationChannel.address = value;
                break
            case 0x4013:
                this.deltaModulationChannel.length = value;
                break
            // Noise registers
            case 0x400C:
                this.noiseChannel.control = value;
                break
            case 0x400E:
                this.noiseChannel.period = value;
                break
            case 0x400F:
                this.noiseChannel.length = value;
                break
            // Control registers
            case 0x4015:
                this.control = value;
                break
            case 0x4017:
                this.frameCounter = value;
                break
        }
    }

    /**
     * Sets channel enable/disable flags ($4015)
     */
    set control(value: number) {
        // Enable/disable channels
        this.pulseChannel1.enabled = (value & 1) === 1
        this.pulseChannel2.enabled = (value & 2) === 2
        this.triangleChannel.enabled = (value & 4) === 4
        this.noiseChannel.enabled = (value & 8) === 8
        this.deltaModulationChannel.enabled = (value & 16) === 16

        // Clear length counters of disabled channels
        if (!this.pulseChannel1.enabled) {
            this.pulseChannel1.lengthValue = 0
        }
        if (!this.pulseChannel2.enabled) {
            this.pulseChannel2.lengthValue = 0
        }
        if (!this.triangleChannel.enabled) {
            this.triangleChannel.lengthValue = 0
        }
        if (!this.noiseChannel.enabled) {
            this.noiseChannel.lengthValue = 0
        }

        // Handle DMC channel enable/disable
        if (!this.deltaModulationChannel.enabled) {
            this.deltaModulationChannel.currentLength = 0
        } else {
            if (this.deltaModulationChannel.currentLength === 0) {
                this.deltaModulationChannel.restart()
            }
        }
    }

    /**
     * Sets frame counter mode ($4017)
     */
    set frameCounter(value: number) {
        this.framePeriod = 4 + ((value >> 7) & 1)  // 4 or 5 steps
        this.frameIRQ = ((value >> 6) & 1) === 0   // IRQ enable
        // Immediate update in 5-step mode
        if (this.framePeriod === 5) {
            this.updateEnvelope()
            this.updateSweep()
            this.updateLength()
        }
    }

    setMonitor(monitor: (output: number) => void) {
        this.monitor = monitor
    }
}

export default APU