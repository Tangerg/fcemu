import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const CHR_BANK_SIZE = 0x2000;

/**
 * iNES mapper 87: Jaleco/Konami discrete CHR-latch board.
 *
 * A latch at $6000-$7FFF selects the 8 KiB CHR bank while PRG ROM stays fixed as
 * an NROM-style window. The two register bits are wired in reverse: value bit 1
 * drives CHR line 0 and value bit 0 drives CHR line 1. There are no bus conflicts
 * because the latch sits in the otherwise-unmapped $6000-$7FFF space.
 */
export class JalecoMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly chrBankCount: number;
  private selectedChrBank = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
  }

  powerOn(): void {
    this.selectedChrBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.Jaleco87, selectedChrBank: this.selectedChrBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Jaleco87)
      throw new Error(`Cannot restore ${state.kind} state into Jaleco 87`);
    if (
      !Number.isInteger(state.selectedChrBank) ||
      state.selectedChrBank < 0 ||
      state.selectedChrBank >= this.chrBankCount
    ) {
      throw new RangeError("Jaleco 87 save state contains an invalid CHR bank");
    }
    this.selectedChrBank = state.selectedChrBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      return this.cartridge.readChr(this.selectedChrBank * CHR_BANK_SIZE + address);
    }
    if (address >= 0x8000) {
      return this.cartridge.prgRom[(address - 0x8000) % this.cartridge.prgRom.length] ?? 0;
    }
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.selectedChrBank * CHR_BANK_SIZE + address, value);
      return;
    }
    if (address >= 0x6000 && address < 0x8000) {
      const bank = ((value & 0x02) >> 1) | ((value & 0x01) << 1);
      this.selectedChrBank = bank % this.chrBankCount;
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}
}
