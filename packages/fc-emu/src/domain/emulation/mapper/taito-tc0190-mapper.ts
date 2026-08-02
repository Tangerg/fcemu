import { NametableMirroring } from "../../model/cartridge.js";
import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { TaitoTc0x90Banking } from "./taito-tc0x90-banking.js";

/**
 * iNES mapper 33: Taito TC0190.
 *
 * Two 8 KiB PRG registers precede two fixed tail banks. CHR is split into two 2 KiB and four
 * 1 KiB windows; unlike MMC3, the 2 KiB register value is already expressed in 2 KiB units.
 */
export class TaitoTc0190Mapper implements Mapper {
  private readonly banking: TaitoTc0x90Banking;

  constructor(private readonly cartridge: Cartridge) {
    this.banking = new TaitoTc0x90Banking(cartridge);
  }

  powerOn(): void {
    this.banking.powerOn();
    this.cartridge.mirroringMode = NametableMirroring.Vertical;
  }

  captureState(): MapperState {
    const banks = this.banking.captureState();
    return {
      kind: MapperKind.TaitoTc0190,
      ...banks,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TaitoTc0190) {
      throw new Error(`Cannot restore ${state.kind} state into Taito TC0190`);
    }
    this.banking.validateState(state, "Taito TC0190");
    if (
      state.mirroring !== NametableMirroring.Horizontal &&
      state.mirroring !== NametableMirroring.Vertical
    ) {
      throw new RangeError("Taito TC0190 save state contains invalid mirroring");
    }
    this.banking.restoreState(state, "Taito TC0190");
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    return this.banking.read(address);
  }

  cpuReadDriveMask(address: number): number {
    return address >= 0x8000 ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x8000 || address > 0xbfff) return;
    switch (address & 0xa003) {
      case 0x8000:
        this.banking.selectPrg(0, value);
        this.cartridge.mirroringMode =
          (value & 0x40) === 0 ? NametableMirroring.Vertical : NametableMirroring.Horizontal;
        break;
      case 0x8001:
        this.banking.selectPrg(1, value);
        break;
      case 0x8002:
      case 0x8003:
        this.banking.selectLargeChr((address & 1) as 0 | 1, value);
        break;
      case 0xa000:
      case 0xa001:
      case 0xa002:
      case 0xa003:
        this.banking.selectSmallChr((address & 3) as 0 | 1 | 2 | 3, value);
        break;
    }
  }
}
