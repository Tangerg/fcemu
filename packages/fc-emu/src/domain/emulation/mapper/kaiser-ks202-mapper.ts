import type Cartridge from "../../model/cartridge.js";
import { isWord } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperInterruptPort, MapperState } from "./mapper.js";
import { areBooleans, isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x2000;
const SWITCHABLE_PRG_BANKS = 4;

/** iNES mapper 142: Kaiser KS7032 board using the KS202 ASIC. */
export class KaiserKs202Mapper implements Mapper {
  private readonly prgBankCount: number;
  private selectedRegister = 0;
  private prgBanks = new Uint8Array(SWITCHABLE_PRG_BANKS);
  private irqReload = 0;
  private irqCounter = 0;
  private irqEnabled = false;
  private irqPending = false;

  constructor(
    private readonly interruptPort: MapperInterruptPort,
    private readonly cartridge: Cartridge,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.selectedRegister = 0;
    this.prgBanks.fill(0);
    this.irqReload = 0;
    this.irqCounter = 0;
    this.irqEnabled = false;
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.KaiserKs202142,
      selectedRegister: this.selectedRegister,
      prgBanks: [...this.prgBanks],
      irqReload: this.irqReload,
      irqCounter: this.irqCounter,
      irqEnabled: this.irqEnabled,
      irqPending: this.irqPending,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.KaiserKs202142) {
      throw new Error(`Cannot restore ${state.kind} state into Kaiser KS202 mapper 142`);
    }
    if (
      !Number.isInteger(state.selectedRegister) ||
      state.selectedRegister < 0 ||
      state.selectedRegister > 7 ||
      !isFixedByteArray(state.prgBanks, SWITCHABLE_PRG_BANKS) ||
      state.prgBanks.some((bank) => bank > 0x0f) ||
      !isWord(state.irqReload) ||
      !isWord(state.irqCounter) ||
      !areBooleans(state.irqEnabled, state.irqPending) ||
      (state.irqPending && state.irqEnabled)
    ) {
      throw new RangeError(
        "Kaiser KS202 mapper 142 save state contains invalid register or IRQ state",
      );
    }
    this.selectedRegister = state.selectedRegister;
    this.prgBanks = Uint8Array.from(state.prgBanks);
    this.irqReload = state.irqReload;
    this.irqCounter = state.irqCounter;
    this.irqEnabled = state.irqEnabled;
    this.irqPending = state.irqPending;
    this.interruptPort.setMapperIrq(this.irqPending);
  }

  observeCpuBusCycle(_write: boolean): void {
    if (!this.irqEnabled) return;
    this.irqCounter = (this.irqCounter + 1) & 0xffff;
    if (this.irqCounter !== 0) return;

    this.irqCounter = this.irqReload;
    this.irqEnabled = false;
    this.irqPending = true;
    this.interruptPort.setMapperIrq(true);
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) return this.cartridge.readChr(address);
    if (address < 0x6000) return 0;
    if (address < 0xe000) {
      const slot = address < 0x8000 ? 3 : (address - 0x8000) >>> 13;
      return this.readPrg(this.prgBanks[slot] ?? 0, address & 0x1fff);
    }
    return this.readPrg(this.prgBankCount - 1, address & 0x1fff);
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x6000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < CHR_BANK_SIZE) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (address < 0x8000) return;

    const register = address & 0xf000;
    if (register >= 0x8000 && register <= 0xb000) {
      const shift = ((register - 0x8000) >>> 12) * 4;
      this.irqReload = (this.irqReload & ~(0x0f << shift)) | ((value & 0x0f) << shift);
      return;
    }
    switch (register) {
      case 0xc000:
        this.clearIrq();
        this.irqEnabled = (value & 0x02) !== 0;
        if (this.irqEnabled) this.irqCounter = this.irqReload;
        break;
      case 0xd000:
        this.clearIrq();
        break;
      case 0xe000:
        this.selectedRegister = value & 0x07;
        break;
      case 0xf000:
        if (this.selectedRegister >= 1 && this.selectedRegister <= 4) {
          this.prgBanks[this.selectedRegister - 1] = value & 0x0f;
        }
        break;
    }
  }

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[(bank % this.prgBankCount) * PRG_BANK_SIZE + offset] ?? 0;
  }

  private clearIrq(): void {
    this.irqPending = false;
    this.interruptPort.setMapperIrq(false);
  }
}
