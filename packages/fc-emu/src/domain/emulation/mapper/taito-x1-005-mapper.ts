import type Cartridge from "../../model/cartridge.js";
import { NametableMirroring } from "../../model/cartridge.js";
import { isByte } from "../numeric-range.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";
import { TaitoX1Banking } from "./taito-x1-banking.js";

/** iNES mapper 80: Taito X1-005 with 128 bytes of protected internal RAM. */
export class TaitoX1005Mapper implements Mapper {
  private readonly banking: TaitoX1Banking;
  private readonly powerOnMirroring: NametableMirroring;
  private chrRegisters = [0, 0, 0, 0, 0, 0];
  private ramPermission = 0;

  constructor(private readonly cartridge: Cartridge) {
    this.banking = new TaitoX1Banking(cartridge);
    this.powerOnMirroring = cartridge.mirroringMode;
    this.powerOn();
  }

  powerOn(): void {
    this.banking.powerOn();
    this.chrRegisters.fill(0);
    this.ramPermission = 0;
    this.cartridge.mirroringMode = this.powerOnMirroring;
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.TaitoX1005,
      prgBanks: this.banking.capturePrgBanks(),
      chrRegisters: [...this.chrRegisters],
      ramPermission: this.ramPermission,
      mirroring: this.cartridge.mirroringMode,
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.TaitoX1005) {
      throw new Error(`Cannot restore ${state.kind} state into Taito X1-005`);
    }
    this.banking.validatePrgBanks(state.prgBanks, "Taito X1-005");
    if (
      !isFixedByteArray(state.chrRegisters, 6) ||
      !isByte(state.ramPermission) ||
      (state.mirroring !== NametableMirroring.Horizontal &&
        state.mirroring !== NametableMirroring.Vertical)
    ) {
      throw new RangeError("Taito X1-005 save state contains invalid register state");
    }
    this.banking.powerOn();
    this.banking.restorePrgBanks(state.prgBanks, "Taito X1-005");
    this.chrRegisters = [...state.chrRegisters];
    this.updateChrBanks();
    this.ramPermission = state.ramPermission;
    this.cartridge.mirroringMode = state.mirroring;
  }

  read(address: number): number {
    if (address >= 0x7f00 && address <= 0x7fff) {
      return this.ramEnabled ? this.cartridge.readPrgRam(address & 0x7f) : 0;
    }
    return this.banking.read(address);
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return address >= 0x7f00 && address <= 0x7fff && this.ramEnabled ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) return;
    if (address >= 0x7f00 && address <= 0x7fff) {
      if (this.ramEnabled) this.cartridge.writePrgRam(address & 0x7f, value);
      return;
    }
    if ((address & 0xff70) !== 0x7e70) return;
    const register = (address | 0x80) & 0xffff;
    if (register <= 0x7ef5) {
      this.chrRegisters[register - 0x7ef0] = value;
      this.updateChrBanks();
      return;
    }
    if (register <= 0x7ef7) {
      this.cartridge.mirroringMode =
        (value & 1) === 0 ? NametableMirroring.Horizontal : NametableMirroring.Vertical;
      return;
    }
    if (register <= 0x7ef9) {
      this.ramPermission = value;
      return;
    }
    const slot = ((register - 0x7efa) >>> 1) as 0 | 1 | 2;
    this.banking.selectPrg(slot, value);
  }

  private get ramEnabled(): boolean {
    return this.ramPermission === 0xa3;
  }

  private updateChrBanks(): void {
    this.banking.selectChrPair(0, this.chrRegisters[0] ?? 0, false);
    this.banking.selectChrPair(2, this.chrRegisters[1] ?? 0, false);
    for (let register = 2; register < 6; register++) {
      this.banking.selectChr((register + 2) as 4 | 5 | 6 | 7, this.chrRegisters[register] ?? 0);
    }
  }
}
