import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { Eeprom24c02 } from "./eeprom24c02.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x4000;
const CHR_BANK_SIZE = 0x0400;

export type BandaiFcgBoard = "auto" | "fcg-1-2" | "lz93d50";

/** Mapper 16 Bandai FCG family with address-specific ASIC and optional 24C02 wiring. */
export class BandaiFcgMapper implements Mapper {
  private chrBanks = [0, 0, 0, 0, 0, 0, 0, 0];
  private prgBank = 0;
  private irqReload = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqPending = false;
  private readonly eeprom: Eeprom24c02 | undefined;
  private readonly powerOnMirroring: NametableMirroring;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
    private readonly board: BandaiFcgBoard,
  ) {
    this.eeprom = cartridge.prgNvRamBytes === 0x100 ? new Eeprom24c02(cartridge) : undefined;
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.chrBanks.fill(0);
    this.prgBank = 0;
    this.irqReload = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.eeprom?.powerOn();
    this.cartridge.mirroringMode = this.powerOnMirroring;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.BandaiFcg,
      board: this.board,
      chrBanks: [...this.chrBanks],
      prgBank: this.prgBank,
      irqReload: this.irqReload,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
      mirroring: this.cartridge.mirroringMode,
      eeprom: this.eeprom?.captureState() ?? null,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.BandaiFcg) {
      throw new Error(`Cannot restore ${state.kind} state into Bandai FCG`);
    }
    if (
      state.board !== this.board ||
      !isFixedByteArray(state.chrBanks, 8) ||
      !Number.isInteger(state.prgBank) ||
      state.prgBank < 0 ||
      state.prgBank > 0x0f ||
      !isWord(state.irqReload) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqEnabled, state.irqPending) ||
      (state.irqPending && !state.irqEnabled) ||
      !this.isMirroring(state.mirroring) ||
      (this.board === "fcg-1-2" && state.irqReload !== 0) ||
      (this.eeprom === undefined) !== (state.eeprom === null)
    ) {
      throw new RangeError("Bandai FCG save state contains invalid board or register state");
    }
    if (this.eeprom && state.eeprom) this.eeprom.validateState(state.eeprom);

    this.chrBanks = [...state.chrBanks];
    this.prgBank = state.prgBank;
    this.irqReload = state.irqReload;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.cartridge.mirroringMode = state.mirroring;
    if (this.eeprom && state.eeprom) this.eeprom.restoreState(state.eeprom);
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_: boolean): void {
    if (!this.irqEnabled) return;
    if (this.irqCounter === 0 && !this.irqPending) {
      this.irqPending = true;
      this.interruptPort.setMapperIrq(true);
    }
    this.irqCounter = (this.irqCounter - 1) & 0xffff;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const slot = address >>> 10;
      const bank = (this.chrBanks[slot] ?? 0) % (this.cartridge.chrMemoryBytes / CHR_BANK_SIZE);
      return this.cartridge.readChr(bank * CHR_BANK_SIZE + (address & 0x03ff));
    }
    if (address >= 0x8000) {
      const bankCount = this.cartridge.prgRom.byteLength / PRG_BANK_SIZE;
      const bank = address < 0xc000 ? this.prgBank % bankCount : bankCount - 1;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + (address & 0x3fff)] ?? 0;
    }
    return this.eeprom ? this.eeprom.readOutput() << 4 : 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return this.eeprom && address >= 0x6000 ? 0x10 : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000 && !this.decodesLowRegisters(address)) return;
    if (address >= 0x8000 && !this.decodesHighRegisters()) return;
    const latchedIrq = this.board === "lz93d50" || (this.board === "auto" && address >= 0x8000);

    switch (address & 0x0f) {
      case 0:
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
      case 6:
      case 7:
        this.chrBanks[address & 7] = value;
        break;
      case 8:
        this.prgBank = value & 0x0f;
        break;
      case 9:
        this.cartridge.mirroringMode = [
          NametableMirroring.Vertical,
          NametableMirroring.Horizontal,
          NametableMirroring.SingleScreenLower,
          NametableMirroring.SingleScreenUpper,
        ][value & 3];
        break;
      case 10:
        this.irqEnabled = (value & 1) !== 0;
        if (latchedIrq) this.irqCounter = this.irqReload;
        this.irqPending = false;
        this.interruptPort.setMapperIrq(false);
        break;
      case 11:
        if (latchedIrq) this.irqReload = (this.irqReload & 0xff00) | value;
        else this.irqCounter = (this.irqCounter & 0xff00) | value;
        break;
      case 12:
        if (latchedIrq) this.irqReload = (this.irqReload & 0x00ff) | (value << 8);
        else this.irqCounter = (this.irqCounter & 0x00ff) | (value << 8);
        break;
      case 13:
        this.eeprom?.write((value >>> 5) & 1, (value >>> 6) & 1);
        break;
    }
  }

  private decodesLowRegisters(address: number): boolean {
    return address >= 0x6000 && this.board !== "lz93d50";
  }

  private decodesHighRegisters(): boolean {
    return this.board !== "fcg-1-2";
  }

  private isMirroring(value: number): value is NametableMirroring {
    return (
      value === NametableMirroring.Vertical ||
      value === NametableMirroring.Horizontal ||
      value === NametableMirroring.SingleScreenLower ||
      value === NametableMirroring.SingleScreenUpper
    );
  }
}
