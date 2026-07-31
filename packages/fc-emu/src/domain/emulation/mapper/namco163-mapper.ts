import type Cartridge from "../../model/cartridge.js";
import { isByte, isIntegerInRange } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { Namco163Audio } from "./namco163-audio.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const CIRAM_BANK_THRESHOLD = 0xe0;

export type Namco163AudioLevel = "mute" | "12db" | "16.5db" | "18.75db";

const AUDIO_GAIN: Readonly<Record<Namco163AudioLevel, number>> = Object.freeze({
  mute: 0,
  "12db": 0.594679822071084,
  "16.5db": 0.998350874789345,
  "18.75db": 1.293549947919034,
});

/** Namco 129/163 banking, dynamic CIRAM wiring, IRQ, WRAM protection and audio. */
export class Namco163Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private readonly writableChrBankCount: number;
  private readonly audio: Namco163Audio;
  private prgBanks = [0, 0, 0];
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private disableLowPatternCiram = false;
  private disableHighPatternCiram = false;
  private soundDisabled = false;
  private pinControl = 0;
  private wramControl = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly audioLevel: Namco163AudioLevel,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
    this.writableChrBankCount = cartridge.chrWritableBytes / CHR_BANK_SIZE;
    this.audio = new Namco163Audio(cartridge);
    this.powerOn();
  }

  powerOn(): void {
    this.prgBanks.fill(0);
    this.chrBanks.fill(0);
    this.disableLowPatternCiram = false;
    this.disableHighPatternCiram = false;
    this.soundDisabled = false;
    this.pinControl = 0;
    this.wramControl = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.audio.powerOn();
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Namco163,
      audioLevel: this.audioLevel,
      prgBanks: [...this.prgBanks],
      chrBanks: [...this.chrBanks],
      disableLowPatternCiram: this.disableLowPatternCiram,
      disableHighPatternCiram: this.disableHighPatternCiram,
      soundDisabled: this.soundDisabled,
      pinControl: this.pinControl,
      wramControl: this.wramControl,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      audio: this.audio.captureState(),
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Namco163) {
      throw new Error(`Cannot restore ${state.kind} state into Namco 163`);
    }
    if (
      state.audioLevel !== this.audioLevel ||
      !isFixedByteArray(state.prgBanks, 3) ||
      state.prgBanks.some((bank) => bank > 0x3f) ||
      !isFixedByteArray(state.chrBanks, 12) ||
      !areBooleans(
        state.disableLowPatternCiram,
        state.disableHighPatternCiram,
        state.soundDisabled,
        state.irqEnabled,
        state.irqPending,
      ) ||
      !isIntegerInRange(state.pinControl, 0, 0xc0) ||
      (state.pinControl & 0x3f) !== 0 ||
      !isByte(state.wramControl) ||
      !isIntegerInRange(state.irqCounter, 0, 0x7fff) ||
      typeof state.audio !== "object" ||
      state.audio === null ||
      state.audio.autoIncrement !== ((state.wramControl & 0x80) !== 0) ||
      (state.irqPending && (!state.irqEnabled || state.irqCounter !== 0x7fff))
    ) {
      throw new RangeError("Namco 163 save state contains invalid banking or IRQ state");
    }
    this.audio.restoreState(state.audio);
    this.prgBanks = [...state.prgBanks];
    this.chrBanks = [...state.chrBanks];
    this.disableLowPatternCiram = state.disableLowPatternCiram;
    this.disableHighPatternCiram = state.disableHighPatternCiram;
    this.soundDisabled = state.soundDisabled;
    this.pinControl = state.pinControl;
    this.wramControl = state.wramControl;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    this.audio.tick(this.soundDisabled);
    if (!this.irqEnabled || this.irqCounter >= 0x7fff) return;
    this.irqCounter++;
    if (this.irqCounter === 0x7fff) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
  }

  expansionAudioSample(): number {
    return this.audio.output(this.soundDisabled, AUDIO_GAIN[this.audioLevel]);
  }

  read(address: number): number {
    if (address < 0x2000) return this.readChrBank(this.patternBank(address), address);
    if (address >= 0x8000) {
      const slot = (address - 0x8000) >>> 13;
      const bank =
        slot === 3 ? this.prgBankCount - 1 : (this.prgBanks[slot] ?? 0) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x1fff)] ?? 0;
    }
    if (address >= 0x6000 && this.cartridge.prgWritableBytes > 0) {
      return this.cartridge.readPrgRam(address & 0x1fff);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x6000 && this.cartridge.prgWritableBytes > 0 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    value &= 0xff;
    if (address < 0x2000) {
      this.writeChrBank(this.patternBank(address), address, value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      if (this.wramWriteEnabled((address - 0x6000) >>> 11)) {
        this.cartridge.writePrgRam(address & 0x1fff, value);
      }
      return;
    }
    if (address < 0x8000) return;

    const register = (address - 0x8000) >>> 11;
    if (register < 12) {
      this.chrBanks[register] = value;
    } else if (register === 12) {
      this.prgBanks[0] = value & 0x3f;
      this.soundDisabled = (value & 0x40) !== 0;
    } else if (register === 13) {
      this.prgBanks[1] = value & 0x3f;
      this.disableLowPatternCiram = (value & 0x40) !== 0;
      this.disableHighPatternCiram = (value & 0x80) !== 0;
    } else if (register === 14) {
      this.prgBanks[2] = value & 0x3f;
      this.pinControl = value & 0xc0;
    } else {
      this.wramControl = value;
      this.audio.writeAddress(value);
    }
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (address >= 0x4800 && address < 0x5000) {
      return { value: this.audio.readData(), drivenMask: 0xff };
    }
    if (address >= 0x5000 && address < 0x5800) {
      return { value: this.irqCounter & 0xff, drivenMask: 0xff };
    }
    if (address >= 0x5800 && address < 0x6000) {
      return {
        value: (this.irqCounter >>> 8) | (this.irqEnabled ? 0x80 : 0),
        drivenMask: 0xff,
      };
    }
    return undefined;
  }

  writeCpuExpansion(address: number, value: number): void {
    value &= 0xff;
    if (address >= 0x4800 && address < 0x5000) {
      this.audio.writeData(value);
    } else if (address >= 0x5000 && address < 0x5800) {
      this.irqCounter = (this.irqCounter & 0x7f00) | value;
      this.acknowledgeIrq();
    } else if (address >= 0x5800 && address < 0x6000) {
      this.irqCounter = (this.irqCounter & 0xff) | ((value & 0x7f) << 8);
      this.irqEnabled = (value & 0x80) !== 0;
      this.acknowledgeIrq();
    }
  }

  mapPatternToCiramAddress(address: number): number | undefined {
    const slot = address >>> 10;
    const bank = this.chrBanks[slot] ?? 0;
    const substitutionDisabled =
      slot < 4 ? this.disableLowPatternCiram : this.disableHighPatternCiram;
    if (bank < CIRAM_BANK_THRESHOLD || substitutionDisabled) return undefined;
    return (bank & 1) * CHR_BANK_SIZE + (address & 0x03ff);
  }

  mapNametableAddress(address: number): number | undefined {
    const bank = this.nametableBank(address);
    if (bank < CIRAM_BANK_THRESHOLD) return undefined;
    return (bank & 1) * CHR_BANK_SIZE + (address & 0x03ff);
  }

  readNametable(address: number): number | undefined {
    const bank = this.nametableBank(address);
    return bank < CIRAM_BANK_THRESHOLD ? this.readChrBank(bank, address) : undefined;
  }

  writeNametable(address: number, value: number): boolean {
    const bank = this.nametableBank(address);
    if (bank >= CIRAM_BANK_THRESHOLD) return false;
    this.writeChrBank(bank, address, value);
    return true;
  }

  private patternBank(address: number): number {
    return this.chrBanks[address >>> 10] ?? 0;
  }

  private nametableBank(address: number): number {
    const slot = ((address - 0x2000) >>> 10) & 3;
    return this.chrBanks[8 + slot] ?? 0;
  }

  private readChrBank(bank: number, address: number): number {
    const offset = address & 0x03ff;
    if (
      this.cartridge.chrRom.byteLength > 0 &&
      this.writableChrBankCount > 0 &&
      bank >= CIRAM_BANK_THRESHOLD
    ) {
      const writableBank = (bank - CIRAM_BANK_THRESHOLD) % this.writableChrBankCount;
      return this.cartridge.readWritableChr(writableBank * CHR_BANK_SIZE + offset);
    }
    return this.cartridge.readChr((bank % this.chrBankCount) * CHR_BANK_SIZE + offset);
  }

  private writeChrBank(bank: number, address: number, value: number): void {
    const offset = address & 0x03ff;
    if (
      this.cartridge.chrRom.byteLength > 0 &&
      this.writableChrBankCount > 0 &&
      bank >= CIRAM_BANK_THRESHOLD
    ) {
      const writableBank = (bank - CIRAM_BANK_THRESHOLD) % this.writableChrBankCount;
      this.cartridge.writeWritableChr(writableBank * CHR_BANK_SIZE + offset, value);
      return;
    }
    this.cartridge.writeChr((bank % this.chrBankCount) * CHR_BANK_SIZE + offset, value);
  }

  private wramWriteEnabled(slot: number): boolean {
    return (
      this.cartridge.prgWritableBytes > 0 &&
      (this.wramControl & 0xf0) === 0x40 &&
      (this.wramControl & (1 << slot)) === 0
    );
  }

  private acknowledgeIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
