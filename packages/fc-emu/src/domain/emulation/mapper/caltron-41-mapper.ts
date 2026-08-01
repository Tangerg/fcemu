import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;

/** iNES mapper 41: Caltron 6-in-1 address latch and gated CNROM-style inner latch. */
export class Caltron41Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private outerLatch = 0;
  private innerChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
    this.powerOn();
  }

  powerOn(): void {
    this.clearLatches();
  }

  reset(): void {
    this.clearLatches();
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Caltron41,
      outerLatch: this.outerLatch,
      innerChrBank: this.innerChrBank,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Caltron41) {
      throw new Error(`Cannot restore ${state.kind} state into Caltron mapper 41`);
    }
    if (
      !Number.isInteger(state.outerLatch) ||
      state.outerLatch < 0 ||
      state.outerLatch > 0x3f ||
      !Number.isInteger(state.innerChrBank) ||
      state.innerChrBank < 0 ||
      state.innerChrBank > 0x03
    ) {
      throw new RangeError("Caltron mapper 41 state contains an invalid address or CHR latch");
    }
    this.outerLatch = state.outerLatch;
    this.innerChrBank = state.innerChrBank;
    this.applyMirroring();
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      const bank = (this.outerLatch & 0x07) % this.prgBankCount;
      return this.cartridge.prgRom[bank * PRG_BANK_SIZE + address - 0x8000] ?? 0;
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x6000 && address <= 0x67ff) {
      this.outerLatch = address & 0x3f;
      this.applyMirroring();
      return;
    }
    if (address < 0x8000 || (this.outerLatch & 0x04) === 0) return;
    const effectiveValue = value & this.read(address);
    this.innerChrBank = effectiveValue & 0x03;
  }

  private get selectedChrBank(): number {
    const bank = ((this.outerLatch >>> 1) & 0x0c) | this.innerChrBank;
    return bank % this.chrBankCount;
  }

  private clearLatches(): void {
    this.outerLatch = 0;
    this.innerChrBank = 0;
    this.applyMirroring();
  }

  private applyMirroring(): void {
    this.cartridge.mirroringMode =
      (this.outerLatch & 0x20) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
  }
}
