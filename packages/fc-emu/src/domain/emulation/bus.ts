import CPU, { type CpuSnapshot } from "./cpu.js";
import PPU, { type PpuSnapshot } from "./ppu.js";
import Controller, { type ControllerState } from "./controller.js";
import APU, { type ApuSnapshot } from "./apu.js";
import { createMapper } from "./mapper/index.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper/index.js";
import type Cartridge from "../model/cartridge.js";
import type { CartridgeMemoryState } from "../model/cartridge-memory.js";
import { resolveConsoleTiming, type ConsoleRegion, type ConsoleTiming } from "./console-timing.js";
import { DmaArbiter, type DmaArbiterPort, type DmaArbiterState } from "./dma/dma-arbiter.js";
import { DmaBusPhase } from "./dma/dma-bus-phase.js";
import { IRQSource } from "./irq-source.js";
import { isByte } from "./numeric-range.js";
import { MachineClock, type MachineClockState } from "./clock/machine-clock.js";

export interface BusSnapshot {
  readonly ram: Uint8Array;
  readonly cpu: CpuSnapshot;
  readonly ppu: PpuSnapshot;
  readonly apu: ApuSnapshot;
  readonly cartridgeMemory: CartridgeMemoryState;
  readonly mapper: MapperState;
  readonly controller1: ControllerState;
  readonly controller2: ControllerState;
  readonly dma: DmaArbiterState;
  readonly clock: MachineClockState;
  readonly irqSources: readonly IRQSource[];
  readonly performingDmaMemoryAccess: boolean;
  readonly pendingControllerWrite?: number;
}

class Bus implements MapperInterruptPort, DmaArbiterPort {
  private readonly cpu: CPU;
  private readonly apu: APU;
  private readonly ppu: PPU;
  private readonly ram: Uint8Array;
  private readonly controller1: Controller;
  private readonly controller2: Controller;
  private readonly mapper: Mapper;
  private readonly cartridge: Cartridge;
  private readonly timing: ConsoleTiming;
  private readonly dma = new DmaArbiter();
  private readonly clock: MachineClock;
  private readonly ppuReadSynchronizationRequired: boolean;
  private readonly irqSources = new Set<IRQSource>();
  private performingDmaMemoryAccess = false;
  private cpuUpdateActive = false;
  private pendingControllerWrite: number | undefined;

  constructor(cartridge: Cartridge, audioSampleRate = 44_100, consoleRegion?: ConsoleRegion) {
    this.cartridge = cartridge;
    this.timing = resolveConsoleTiming(cartridge.timingMode, consoleRegion);
    this.clock = new MachineClock(this.timing.cpuPpu);
    this.ppuReadSynchronizationRequired = this.clock.readSampleRequiresPpuSynchronization;
    this.ram = new Uint8Array(2048);
    this.cpu = new CPU(this);
    this.apu = new APU(this, this.timing, audioSampleRate);
    this.ppu = new PPU(this, this.timing);
    this.controller1 = new Controller();
    this.controller2 = new Controller();
    this.mapper = createMapper(this.cartridge, this);
    this.powerOn();
  }

  get CPU(): CPU {
    return this.cpu;
  }

  get APU(): APU {
    return this.apu;
  }

  get PPU(): PPU {
    return this.ppu;
  }

  get RAM(): Uint8Array {
    return this.ram;
  }

  get Controller1(): Controller {
    return this.controller1;
  }

  get Controller2(): Controller {
    return this.controller2;
  }

  get Cartridge(): Cartridge {
    return this.cartridge;
  }

  get Timing(): ConsoleTiming {
    return this.timing;
  }

  get Mapper(): Mapper {
    return this.mapper;
  }

  captureState(): BusSnapshot {
    const pendingControllerWrite = this.pendingControllerWrite;
    return {
      ram: this.ram.slice(),
      cpu: this.cpu.captureState(),
      ppu: this.ppu.captureState(),
      apu: this.apu.captureState(),
      cartridgeMemory: this.cartridge.captureMemoryState(),
      mapper: this.mapper.captureState(),
      controller1: this.controller1.captureState(),
      controller2: this.controller2.captureState(),
      dma: this.dma.captureState(),
      clock: this.clock.captureState(),
      irqSources: [...this.irqSources],
      performingDmaMemoryAccess: this.performingDmaMemoryAccess,
      ...(pendingControllerWrite === undefined ? {} : { pendingControllerWrite }),
    };
  }

  restoreState(state: BusSnapshot): void {
    const previous = this.captureState();
    try {
      this.restoreStateUnchecked(state);
    } catch (error) {
      this.restoreStateUnchecked(previous);
      throw error;
    }
  }

  private restoreStateUnchecked(state: BusSnapshot): void {
    if (!(state.ram instanceof Uint8Array) || state.ram.byteLength !== this.ram.byteLength) {
      throw new RangeError("Bus save state contains invalid internal RAM");
    }
    const irqSources = validateIRQSources(state.irqSources);
    if (state.pendingControllerWrite !== undefined && !isByte(state.pendingControllerWrite)) {
      throw new RangeError("Bus save state contains an invalid pending controller write");
    }
    if (state.ppu.nmiLineAsserted !== state.cpu.interrupts.nmiLineAsserted) {
      throw new Error("Bus save-state PPU /NMI output disagrees with the CPU input line");
    }
    this.ram.set(state.ram);
    this.cartridge.restoreMemoryState(state.cartridgeMemory);
    this.mapper.restoreState(state.mapper);
    this.controller1.restoreState(state.controller1);
    this.controller2.restoreState(state.controller2);
    this.ppu.restoreState(state.ppu);
    this.apu.restoreState(state.apu);
    this.cpu.restoreState(state.cpu);
    this.dma.restoreState(state.dma);
    this.clock.restoreState(state.clock);
    this.irqSources.clear();
    for (const source of irqSources) this.irqSources.add(source);
    if (this.irqSources.size > 0 !== this.cpu.isIRQLineAsserted) {
      throw new Error("Bus save-state IRQ sources disagree with the CPU interrupt line");
    }
    this.performingDmaMemoryAccess = state.performingDmaMemoryAccess;
    this.pendingControllerWrite = state.pendingControllerWrite;
  }

  reset(): void {
    this.irqSources.clear();
    this.dma.reset();
    this.resetClockSynchronization();
    this.ppu.reset();
    this.apu.reset();
    this.cpu.reset();
  }

  powerOn(): void {
    this.irqSources.clear();
    this.dma.reset();
    this.resetClockSynchronization();
    this.ram.fill(0);
    this.cartridge.powerOn();
    this.mapper.powerOn();
    this.controller1.powerOn();
    this.controller2.powerOn();
    this.ppu.powerOn();
    this.apu.powerOn();
    this.cpu.powerOn();
  }

  setIRQSource(source: IRQSource, asserted: boolean): void {
    if (asserted) this.irqSources.add(source);
    else this.irqSources.delete(source);
    this.cpu.setIRQLine(this.irqSources.size > 0);
    const remainingInstructionCycles = this.clock.remainingCommittedApuCycles;
    if (asserted && (source === IRQSource.Mapper || remainingInstructionCycles >= 2)) {
      this.cpu.sampleIRQLine(source === IRQSource.Mapper || remainingInstructionCycles >= 3);
    }
  }

  setMapperIrq(asserted: boolean): void {
    this.setIRQSource(IRQSource.Mapper, asserted);
  }

  setPpuNmiLine(asserted: boolean): void {
    this.cpu.setNmiLine(asserted);
  }

  requestSpriteDma(page: number): void {
    this.dma.startSprite(page);
  }

  requestDmcDma(address: number, haltPhase: DmaBusPhase): void {
    this.dma.startDmc(address, haltPhase);
  }

  cancelDmcDma(): void {
    this.dma.cancelDmc();
  }

  currentDmaPhase(): DmaBusPhase {
    return this.dma.phaseAt(this.cpu.cpuCycles);
  }

  readCpuByteForDma(address: number): number {
    this.synchronizePpuForAdvancedRead();
    this.performingDmaMemoryAccess = true;
    try {
      return this.cpu.readByteForDma(address);
    } finally {
      this.performingDmaMemoryAccess = false;
    }
  }

  /**
   * Reads one DMC sample byte through the RP2A03's split DMA/6502 address bus.
   * DMA drives A0-A4 while the halted CPU core retains A5-A15. If those CPU
   * lines select $4000-$401F, the corresponding internal APU/input register is
   * activated at the same time as the external sample read.
   */
  readDmcByteForDma(address: number, haltedCpuAddress: number): number {
    this.synchronizePpuForAdvancedRead();
    this.performingDmaMemoryAccess = true;
    try {
      const externalValue = this.cpu.readByteForDma(address);
      if ((haltedCpuAddress & 0xffe0) !== 0x4000) return externalValue;

      const internalAddress = 0x4000 | (address & 0x1f);
      if (internalAddress < 0x4015 || internalAddress > 0x4017) return externalValue;
      return this.cpu.readByteForDma(internalAddress);
    } finally {
      this.performingDmaMemoryAccess = false;
    }
  }

  repeatHaltedCpuReadForDma(address: number): void {
    if (!this.timing.dmcDmaControllerReadGlitch && (address === 0x4016 || address === 0x4017)) {
      return;
    }
    this.synchronizePpuForAdvancedRead();
    this.performingDmaMemoryAccess = true;
    try {
      this.cpu.repeatHaltedReadForDma(address);
    } finally {
      this.performingDmaMemoryAccess = false;
    }
  }

  writeOamByteForDma(value: number): void {
    this.synchronizePpuForAdvancedWrite();
    this.ppu.writeOamDma(value);
  }

  completeDmcDmaByte(value: number): void {
    this.apu.completeDmcDmaByte(value);
  }

  private update(): number {
    this.cpuUpdateActive = true;
    this.clock.beginCpuUpdate(this.cpu.cpuCycles);
    if (this.dma.active && this.dma.canBeginDmcAt(this.cpu.cpuCycles + 1)) {
      this.dma.beginDmc(this.cpu.state.PC);
    }
    const dmaOwnsCycle =
      this.dma.ownsBusCycle || (this.dma.awaitingSpriteHalt && !this.cpu.hasActiveInstruction);
    const cpuCycle = dmaOwnsCycle ? this.cpu.clockDmaCycle() : this.cpu.clock();
    if (dmaOwnsCycle) {
      this.synchronizeApuWithCompletedCpuCycles();
      if (this.dma.active) this.dma.clock(this.cpu.cpuCycles, this);
    }
    this.commitControllerWrite();
    this.clock.commitCpuCycles(cpuCycle);
    this.clock.synchronizePpuCommittedInterruptSample(this.clockPpuDot);
    this.cpu.sampleNmiLine();
    this.clock.synchronizePpuCommitted(this.clockPpuDot);
    this.clock.synchronizeApuCommitted(() => this.apu.update());
    if (dmaOwnsCycle) this.cpu.finishDmaCycle();
    this.cpuUpdateActive = false;
    return cpuCycle;
  }

  /** Catches the APU up to the current instruction's final I/O bus cycle. */
  synchronizeApuWithCpu(): void {
    this.synchronizeApuTo(this.clock.currentCpuBusCycle(this.cpu.cpuCycles));
  }

  beginCpuRead(address: number): boolean {
    if (this.performingDmaMemoryAccess) return false;
    this.synchronizePpuForCurrentRead();
    if (address === 0x4015 || this.apu.mayRequestDmcDma) {
      this.synchronizeApuWithCpu();
    }
    if (this.dma.canBeginDmcAt(this.cpu.cpuCycles + 1)) this.dma.beginDmc(address);
    let dmaStalledRead = false;
    while (this.dma.active) {
      dmaStalledRead = true;
      if (this.dma.canBeginDmcAt(this.cpu.cpuCycles + 1)) this.dma.beginDmc(address);
      this.cpu.clockDmaCycle();
      this.synchronizeApuWithCompletedCpuCycles();
      if (this.dma.active) this.dma.clock(this.cpu.cpuCycles, this);
      this.commitControllerWrite();
      this.synchronizePpuForCompletedInterruptSample();
      this.cpu.sampleNmiLine();
      this.synchronizePpuToCompletedCpuCycles();
    }
    if (dmaStalledRead) this.synchronizePpuForCurrentRead();
    return dmaStalledRead;
  }

  beginCpuWrite(): void {
    if (!this.cpuUpdateActive) return;
    this.dma.missDmcHaltOnWrite(this.cpu.cpuCycles + 1);
    this.clock.synchronizePpuCurrentWrite(this.cpu.cpuCycles, this.clockPpuDot);
  }

  scheduleApuRegisterWrite(address: number, value: number): void {
    const channelWriteDelay =
      address <= 0x400f ? this.timing.apu.channelRegisterWriteDelayCycles : 0;
    const targetCpuCycle = this.clock.currentCpuBusCycle(this.cpu.cpuCycles) + channelWriteDelay;
    this.apu.scheduleRegisterWrite(
      address,
      value,
      Math.max(0, targetCpuCycle - this.clock.synchronizedApuCpuCycle),
    );
  }

  /** The RP2A03 OUT latch commits the latest $4016 value only on a PUT cycle. */
  scheduleControllerWrite(value: number): void {
    this.pendingControllerWrite = value & 0xff;
  }

  private synchronizeApuTo(targetCpuCycle: number): void {
    this.clock.synchronizeApuTo(targetCpuCycle, () => this.apu.update());
  }

  private commitControllerWrite(): void {
    const value = this.pendingControllerWrite;
    const completedCycle = this.cpu.cpuCycles - 1;
    if (value === undefined || this.dma.phaseAt(completedCycle) !== DmaBusPhase.Put) return;
    this.pendingControllerWrite = undefined;
    this.controller1.strobe = value;
    this.controller2.strobe = value;
  }

  private synchronizeApuWithCompletedCpuCycles(): void {
    this.synchronizeApuTo(this.clock.completedCpuCycles(this.cpu.cpuCycles));
  }

  private synchronizePpuForCurrentRead(): void {
    if (!this.cpuUpdateActive || !this.ppuReadSynchronizationRequired) return;
    this.clock.synchronizePpuCurrentRead(this.cpu.cpuCycles, this.clockPpuDot);
  }

  private synchronizePpuForAdvancedRead(): void {
    if (!this.cpuUpdateActive || !this.ppuReadSynchronizationRequired) return;
    this.clock.synchronizePpuAdvancedRead(this.cpu.cpuCycles, this.clockPpuDot);
  }

  private synchronizePpuForAdvancedWrite(): void {
    if (!this.cpuUpdateActive) return;
    this.clock.synchronizePpuAdvancedWrite(this.cpu.cpuCycles, this.clockPpuDot);
  }

  private synchronizePpuToCompletedCpuCycles(): void {
    if (!this.cpuUpdateActive) return;
    this.clock.synchronizePpuCompletedCpuCycles(this.cpu.cpuCycles, this.clockPpuDot);
  }

  private synchronizePpuForCompletedInterruptSample(): void {
    if (!this.cpuUpdateActive) return;
    this.clock.synchronizePpuCompletedInterruptSample(this.cpu.cpuCycles, this.clockPpuDot);
  }

  private readonly clockPpuDot = (): void => {
    this.ppu.update();
    if (this.mapper.observesPpuAddress) this.mapper.tickPpu();
  };

  private resetClockSynchronization(): void {
    this.clock.reset();
    this.performingDmaMemoryAccess = false;
    this.cpuUpdateActive = false;
    this.pendingControllerWrite = undefined;
  }

  updateFrame(): number {
    let cpuCycle = 0;
    const frame = this.ppu.frame;
    while (frame === this.ppu.frame) {
      cpuCycle += this.update();
    }
    return cpuCycle;
  }

  updateSeconds(seconds: number) {
    let cycles = this.timing.cpuFrequencyHz * seconds;
    while (cycles > 0) {
      cycles -= this.update();
    }
  }
}

function validateIRQSources(sources: readonly IRQSource[]): readonly IRQSource[] {
  const valid = new Set<IRQSource>([IRQSource.ApuDmc, IRQSource.ApuFrame, IRQSource.Mapper]);
  if (sources.some((source) => !valid.has(source)) || new Set(sources).size !== sources.length) {
    throw new RangeError("Bus save state contains invalid IRQ sources");
  }
  return sources;
}

export default Bus;
