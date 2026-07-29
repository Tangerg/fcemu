import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const PRG_BANK_SIZE = 0x4000;

/**
 * iNES mapper 71: Codemasters/Camerica BF909x board.
 *
 * A UNROM-style register at $C000-$FFFF selects the 16 KiB PRG bank at
 * $8000-$BFFF; $C000-$FFFF stays fixed to the final bank. The BF9097 variant
 * (submapper 1, e.g. Fire Hawk) adds single-screen mirroring control at
 * $9000-$9FFF bit 4. The board has no bus conflicts.
 */
export class CodemastersMapper implements Mapper {
  readonly observesPpuAddress = false;

  private readonly prgBankCount: number;
  private readonly fixedPrgBank: number;
  private selectedPrgBank = 0;

  constructor(
    private readonly cartridge: Cartridge,
    private readonly hasMirroringControl = false,
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.fixedPrgBank = this.prgBankCount - 1;
  }

  powerOn(): void {
    this.selectedPrgBank = 0;
    if (this.hasMirroringControl) {
      this.cartridge.mirroringMode = NametableMirroring.SingleScreenLower;
    }
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.Codemasters,
      selectedPrgBank: this.selectedPrgBank,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Codemasters)
      throw new Error(`Cannot restore ${state.kind} state into Codemasters`);
    if (
      !Number.isInteger(state.selectedPrgBank) ||
      state.selectedPrgBank < 0 ||
      state.selectedPrgBank >= this.prgBankCount
    ) {
      throw new RangeError("Codemasters save state contains an invalid PRG bank");
    }
    if (!Object.values(NametableMirroring).includes(state.mirroring as NametableMirroring)) {
      throw new RangeError("Codemasters save state contains invalid mirroring");
    }
    this.selectedPrgBank = state.selectedPrgBank;
    if (this.hasMirroringControl) {
      this.cartridge.mirroringMode = state.mirroring as NametableMirroring;
    }
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0xc000) return this.readPrg(this.fixedPrgBank, address - 0xc000);
    if (address >= 0x8000) return this.readPrg(this.selectedPrgBank, address - 0x8000);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
      return;
    }
    if (this.hasMirroringControl && address >= 0x9000 && address <= 0x9fff) {
      this.cartridge.mirroringMode =
        (value & 0x10) === 0
          ? NametableMirroring.SingleScreenLower
          : NametableMirroring.SingleScreenUpper;
      return;
    }
    if (address >= 0xc000) {
      this.selectedPrgBank = (value & 0x0f) % this.prgBankCount;
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private readPrg(bank: number, offset: number): number {
    return this.cartridge.prgRom[bank * PRG_BANK_SIZE + offset] ?? 0;
  }
}
