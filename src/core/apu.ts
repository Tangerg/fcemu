import CPU, {CPUFrequency} from "./cpu.ts";

const pulseTable: number[] = []
const tndTable: number[] = []

for (let i = 0; i < 31; i++) {
    pulseTable[i] = 95.52 / (8128.0 / i + 100)
}
for (let i = 0; i < 203; i++) {
    tndTable[i] = 163.67 / (24329.0 / i + 100)
}

const lengthTable: number[] = [
    10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
    12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
]

const dutyTable: number[][] = [
    [0, 1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 1, 1, 1, 1, 1],
]

const triangleTable: number[] = [
    15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]

const noiseTable: number[] = [
    4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
]

const dmcTable: number[] = [
    214, 190, 170, 160, 143, 127, 113, 107, 95, 80, 71, 64, 53, 42, 36, 27,
]

interface AudioChannel {
    output(): number
}

class PulseChannel implements AudioChannel {
    enabled: boolean = false
    private readonly applyExtraSweep
    private lengthEnabled: boolean = false
    lengthValue: number = 0
    private timerPeriod: number = 0
    private timerValue: number = 0
    private dutyCycleIndex: number = 0
    private dutyStep: number = 0
    private sweepReload: boolean = false
    private sweepEnabled: boolean = false
    private sweepNegative: boolean = false
    private sweepShift: number = 0
    private sweepPeriod: number = 0
    private sweepValue: number = 0
    private envelopeEnabled: boolean = false
    private envelopeLoop: boolean = false
    private envelopeRestart: boolean = false
    private envelopePeriod: number = 0
    private envelopeValue: number = 0
    private envelopeVolume: number = 0
    private constantVolume: number = 0

    constructor(applyExtraSweep: boolean = false) {
        this.applyExtraSweep = applyExtraSweep
    }

    set control(value: number) {
        this.dutyCycleIndex = (value >> 6) & 3
        this.lengthEnabled = ((value >> 5) & 1) === 0
        this.envelopeLoop = ((value >> 5) & 1) === 1
        this.envelopeEnabled = ((value >> 4) & 1) === 0
        this.envelopePeriod = value & 15
        this.constantVolume = value & 15
        this.envelopeRestart = true
    }

    set sweep(value: number) {
        this.sweepEnabled = ((value >> 7) & 1) === 0
        this.sweepPeriod = ((value >> 4) & 1) + 1
        this.sweepNegative = ((value >> 3) & 1) === 1
        this.sweepShift = value & 7
        this.sweepReload = true
    }

    set timerLow(value: number) {
        this.timerPeriod = (this.timerPeriod & 0xFF00) | value
    }

    set timerHigh(value: number) {
        this.lengthValue = lengthTable[value >> 3]
        this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 7) << 8)
        this.envelopeRestart = true
        this.dutyStep = 0
    }

    updateTimer() {
        if (this.timerValue === 0) {
            this.timerValue = this.timerPeriod
            this.dutyStep = (this.dutyStep + 1) % 8
        } else {
            this.timerValue--
        }
    }

    updateEnvelope() {
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

    updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    private applySweep() {
        const delta = this.timerPeriod >> this.sweepShift;
        this.timerPeriod += this.sweepNegative ? -delta : delta;

        if (this.sweepNegative && this.applyExtraSweep) {
            this.timerPeriod--;
        }
    }

    updateSweep() {
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

    output(): number {
        if (!this.enabled) {
            return 0
        }
        if (this.lengthValue === 0) {
            return 0
        }
        if (dutyTable[this.dutyCycleIndex][this.dutyStep] === 0) {
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

class TriangleChannel implements AudioChannel {
    enabled: boolean = false
    private lengthEnabled: boolean = false
    lengthValue: number = 0
    private timerPeriod: number = 0
    private timerValue: number = 0
    private dutyIndex: number = 0
    private counterReload: boolean = false
    private counterPeriod: number = 0
    private counterValue: number = 0

    set control(value: number) {
        this.lengthEnabled = ((value >> 7) & 1) === 0
        this.counterPeriod = value & 0x7F
    }

    set timerLow(value: number) {
        this.timerPeriod = (this.timerPeriod & 0xFF00) | value
    }

    set timerHigh(value: number) {
        this.lengthValue = lengthTable[value >> 3]
        this.timerPeriod = (this.timerPeriod & 0x00FF) | ((value & 7) << 8)
        this.timerValue = this.timerPeriod
        this.counterReload = true
    }

    updateTimer() {
        if (this.timerValue === 0) {
            this.timerValue = this.timerPeriod
            if (this.lengthValue > 0 && this.counterValue > 0) {
                this.dutyIndex = (this.dutyIndex + 1) % 32
            }
        } else {
            this.timerValue--
        }
    }

    updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    updateCounter() {
        if (this.counterReload) {
            this.counterValue = this.counterPeriod
        } else if (this.counterValue > 0) {
            this.counterValue--
        }
        if (this.lengthEnabled) {
            this.counterReload = false
        }
    }

    output(): number {
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
        return triangleTable[this.dutyIndex]
    }
}

class NoiseChannel implements AudioChannel {
    enabled: boolean = false
    private mode: boolean = false
    private shiftRegister: number = 1
    private lengthEnabled: boolean = false
    lengthValue: number = 0
    private timerPeriod: number = 0
    private timerValue: number = 0
    private envelopeEnabled: boolean = false
    private envelopeLoop: boolean = false
    private envelopeRestart: boolean = false
    private envelopePeriod: number = 0
    private envelopeValue: number = 0
    private envelopeVolume: number = 0
    private constantVolume: number = 0

    set control(value: number) {
        this.lengthEnabled = ((value >> 5) & 1) === 0
        this.envelopeLoop = ((value >> 5) & 1) === 1
        this.envelopeEnabled = ((value >> 4) & 1) === 0
        this.envelopePeriod = value & 15
        this.constantVolume = value & 15
        this.envelopeRestart = true
    }

    set period(value: number) {
        this.mode = (value & 0x80) === 0x80
        this.timerPeriod = noiseTable[value & 0x0F]
    }

    set length(value: number) {
        this.lengthValue = lengthTable[value >> 3]
        this.envelopeRestart = true
    }

    updateTimer() {
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

    updateEnvelope() {
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

    updateLength() {
        if (this.lengthEnabled && this.lengthValue > 0) {
            this.lengthValue--
        }
    }

    output(): number {
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

class DeltaModulationChannel implements AudioChannel {
    private readonly cpu: CPU
    enabled: boolean = false
    private val: number = 0
    private simpleAddress: number = 0
    private simpleLength: number = 0
    private currentAddress: number = 0
    currentLength: number = 0
    private shiftRegister: number = 0
    private bitCount: number = 0
    private tickPeriod: number = 0
    private tickValue: number = 0
    private loop: boolean = false

    //private irq: boolean = false

    constructor(cpu: CPU) {
        this.cpu = cpu
    }

    set control(value: number) {
        // this.irq = (value & 0x80) === 0x80
        this.loop = (value & 0x40) === 0x40
        this.tickPeriod = dmcTable[value & 0x0F]
    }

    set value(value: number) {
        this.val = value & 0x7F
    }

    set address(value: number) {
        this.simpleAddress = 0xC000 | value << 6
    }

    set length(value: number) {
        this.simpleLength = (value << 4) | 1
    }

    restart(): void {
        this.currentAddress = this.simpleAddress
        this.currentLength = this.simpleLength
    }

    updateReader() {
        if (this.currentLength > 0 && this.bitCount === 0) {
            this.cpu.stall += 4
            this.shiftRegister = this.cpu.readByte(this.currentAddress)
            this.bitCount = 8
            this.currentAddress++
            if (this.currentAddress === 0) {
                this.currentAddress = 0x8000
            }
            this.currentLength--
            if (this.currentLength === 0 && this.loop) {
                this.restart()
            }
        }

    }

    updateShifter() {
        if (this.bitCount === 0) {
            return
        }
        if ((this.shiftRegister & 1) == 1) {
            if (this.val <= 125) {
                this.val += 2
            }
        } else {
            if (this.val >= 2) {
                this.val -= 2
            }
        }
        this.shiftRegister >>= 1
        this.bitCount--
    }

    updateTimer() {
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


    output(): number {
        return this.val
    }
}

class AudioMixer {
    private readonly audioChannels: AudioChannel[] = []


    private mix(): number {
        if (this.audioChannels.length < 5) {
            throw new Error("Not enough audioChannels!")
        }
        const p1 = this.audioChannels[0].output()
        const p2 = this.audioChannels[1].output()
        const t = this.audioChannels[2].output()
        const n = this.audioChannels[3].output()
        const d = this.audioChannels[4].output()

        const po = pulseTable[p1 + p2]
        const tndo = tndTable[3 * t + 2 * n + d]
        return po + tndo
    }

    private filter(num: number): number {
        return num
    }

    addAudioChannel(channel: AudioChannel) {
        this.audioChannels.push(channel);
    }


    output(): number {
        return this.filter(this.mix())
    }
}


const frameCounterRate: number = CPUFrequency / 240

class APU {
    private readonly pulseChannel1: PulseChannel
    private readonly pulseChannel2: PulseChannel
    private readonly triangleChannel: TriangleChannel
    private readonly noiseChannel: NoiseChannel
    private readonly deltaModulationChannel: DeltaModulationChannel
    private readonly audioMixer: AudioMixer
    private readonly cpu: CPU
    private readonly sampleRate: number = 0
    private cycle: number = 0
    private framePeriod: number = 0
    private frameValue: number = 0
    private frameIRQ: boolean = false
    private readonly handler: (oupput: number) => void


    constructor(cpu: CPU, handler: (output: number) => void) {
        this.cpu = cpu
        this.handler = handler
        this.framePeriod = 4
        this.pulseChannel1 = new PulseChannel(true)
        this.pulseChannel2 = new PulseChannel()
        this.triangleChannel = new TriangleChannel()
        this.noiseChannel = new NoiseChannel()
        this.deltaModulationChannel = new DeltaModulationChannel(cpu)
        this.audioMixer = new AudioMixer()
        this.audioMixer.addAudioChannel(this.pulseChannel1)
        this.audioMixer.addAudioChannel(this.pulseChannel2)
        this.audioMixer.addAudioChannel(this.triangleChannel)
        this.audioMixer.addAudioChannel(this.noiseChannel)
        this.audioMixer.addAudioChannel(this.deltaModulationChannel)
    }

    private irq() {
        if (this.frameIRQ) {
            this.cpu.triggerIRQ()
        }
    }

    private updateTimer() {
        if (this.cycle % 2 === 0) {
            this.pulseChannel1.updateTimer()
            this.pulseChannel2.updateTimer()
            this.noiseChannel.updateTimer()
            this.deltaModulationChannel.updateTimer()
        }
        this.triangleChannel.updateTimer()
    }

    private updateEnvelope() {
        this.pulseChannel1.updateEnvelope()
        this.pulseChannel2.updateEnvelope()
        this.triangleChannel.updateCounter()
        this.noiseChannel.updateEnvelope()
    }

    private updateSweep() {
        this.pulseChannel1.updateSweep()
        this.pulseChannel2.updateSweep()
    }

    private updateLength() {
        this.pulseChannel1.updateLength()
        this.pulseChannel2.updateLength()
        this.triangleChannel.updateLength()
        this.noiseChannel.updateLength()
    }


    private updateFrameCounter() {
        if (this.framePeriod !== 4 && this.framePeriod !== 5) {
            return
        }
        this.frameValue = (this.frameValue + 1) % this.framePeriod
        if (this.frameValue === 0 || this.frameValue === 2) {
            this.updateEnvelope()
        } else if (this.frameValue === 1 || this.frameValue === 3) {
            this.updateEnvelope()
            this.updateSweep()
            this.updateLength()
        }
        if (this.framePeriod === 4 && this.frameValue === 3) {
            this.irq()
        }
    }

    update() {
        const cycle1 = this.cycle
        this.cycle++
        const cycle2 = this.cycle
        this.updateTimer()
        const f1 = Math.floor(cycle1 / frameCounterRate)
        const f2 = Math.floor(cycle2 / frameCounterRate)
        if (f1 != f2) {
            this.updateFrameCounter()
        }
        const s1 = Math.floor(cycle1 / this.sampleRate)
        const s2 = Math.floor(cycle2 / this.sampleRate)
        if (s1 != s2) {
            const output = this.output()
            this.handler(output)
        }
    }

    private output(): number {
        return this.audioMixer.output()
    }

    private readStatus(): number {
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

    readRegister(address: number) {
        if (address != 0x4015) {
            return 0
        }
        return this.readStatus()
    }

    writeRegister(address: number, value: number) {
        switch (address) {
            case 0x4000:
                this.pulseChannel1.control = value
                break
            case 0x4001:
                this.pulseChannel1.sweep = value
                break
            case 0x4002:
                this.pulseChannel1.timerLow = value
                break
            case 0x4003:
                this.pulseChannel1.timerHigh = value
                break
            case 0x4004:
                this.pulseChannel2.control = value
                break
            case 0x4005:
                this.pulseChannel2.sweep = value
                break
            case 0x4006:
                this.pulseChannel2.timerLow = value
                break
            case 0x4007:
                this.pulseChannel2.timerHigh = value
                break
            case 0x4008:
                this.triangleChannel.control = value
                break
            case 0x4009:
                this.deltaModulationChannel.control = value
                break
            case 0x4010:
                this.deltaModulationChannel.control = value
                break
            case 0x4011:
                this.deltaModulationChannel.value = value
                break
            case 0x4012:
                this.deltaModulationChannel.address = value
                break
            case 0x4013:
                this.deltaModulationChannel.length = value
                break
            case 0x400A:
                this.triangleChannel.timerLow = value
                break
            case 0x400B:
                this.triangleChannel.timerHigh = value
                break
            case 0x400C:
                this.noiseChannel.control = value
                break
            case 0x400D:
                this.noiseChannel.period = value
                break
            case 0x400E:
                this.noiseChannel.period = value
                break
            case 0x400F:
                this.noiseChannel.length = value
                break
            case 0x4015:
                this.control = value
                break
            case 0x4017:
                this.frameCounter = value
                break
        }
    }

    set control(value: number) {
        this.pulseChannel1.enabled = (value & 1) === 1
        this.pulseChannel2.enabled = (value & 2) === 2
        this.triangleChannel.enabled = (value & 4) === 4
        this.noiseChannel.enabled = (value & 8) === 8
        this.deltaModulationChannel.enabled = (value & 16) === 16
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
        if (!this.deltaModulationChannel.enabled) {
            this.deltaModulationChannel.currentLength = 0
        } else {
            if (this.deltaModulationChannel.currentLength === 0) {
                this.deltaModulationChannel.restart()
            }
        }
    }

    set frameCounter(value: number) {
        this.framePeriod = 4 + ((value >> 7) & 1)
        this.frameIRQ = ((value >> 6) & 1) === 0
        if (this.framePeriod === 5) {
            this.updateEnvelope()
            this.updateSweep()
            this.updateLength()
        }
    }
}

export default APU