import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x8000;
const CHR_BANK_SIZE = 0x2000;
const REGISTER_COUNT = 8;

/** Physical connection selected by the SA-015 board's ASIC-pin-14 solder pad. */
export type SachenSa015Pin14 = "cpu-d2" | "vcc";

/** iNES mapper 150: Sachen SA-015/SA-630 with the 74LS374N-marked ASIC. */
export class SachenSa015Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private selectedRegister = 0;
  private registers = new Uint8Array(REGISTER_COUNT);

  constructor(
    private readonly cartridge: Cartridge,
    private readonly pin14: SachenSa015Pin14 = "cpu-d2",
  ) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = cartridge.chrRom.byteLength / CHR_BANK_SIZE;
  }

  powerOn(): void {
    this.selectedRegister = 0;
    this.registers.fill(0);
  }

  captureState(): MapperState {
    return {
      kind: MapperKind.SachenSa015150,
      selectedRegister: this.selectedRegister,
      registers: [...this.registers],
    };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.SachenSa015150) {
      throw new Error(`Cannot restore ${state.kind} state into Sachen SA-015 mapper 150`);
    }
    if (
      !Number.isInteger(state.selectedRegister) ||
      state.selectedRegister < 0 ||
      state.selectedRegister >= REGISTER_COUNT ||
      !isFixedByteArray(state.registers, REGISTER_COUNT) ||
      state.registers.some((value) => value > 0x07)
    ) {
      throw new RangeError("Sachen SA-015 mapper 150 save state contains invalid registers");
    }
    this.selectedRegister = state.selectedRegister;
    this.registers = Uint8Array.from(state.registers);
  }

  read(address: number): number {
    if (address < CHR_BANK_SIZE) {
      return this.cartridge.readChr(this.selectedChrBank() * CHR_BANK_SIZE + address);
    }
    if (address < 0x8000) {
      return isRegisterDataAddress(address) ? this.readRegisterValue() : 0;
    }
    return this.cartridge.prgRom[this.selectedPrgBank() * PRG_BANK_SIZE + address - 0x8000] ?? 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return 0xff;
    return isRegisterDataAddress(address) ? this.registerDriveMask() : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x6000 && address < 0x8000) this.writeRegister(address, value);
  }

  readCpuExpansion(
    address: number,
  ): { readonly value: number; readonly drivenMask: number } | undefined {
    if (!isRegisterDataAddress(address)) return undefined;
    return { value: this.readRegisterValue(), drivenMask: this.registerDriveMask() };
  }

  writeCpuExpansion(address: number, value: number): void {
    this.writeRegister(address, value);
  }

  mapNametableAddress(address: number): number {
    const offset = (address - 0x2000) & 0x0fff;
    const slot = offset >>> 10;
    const mode = ((this.registers[7] ?? 0) >>> 1) & 0x03;
    let page: number;
    switch (mode) {
      case 0:
        page = slot === 3 ? 1 : 0;
        break;
      case 1:
        page = slot >>> 1;
        break;
      case 2:
        page = slot & 1;
        break;
      default:
        page = 1;
        break;
    }
    return page * 0x0400 + (offset & 0x03ff);
  }

  private writeRegister(address: number, value: number): void {
    const input = this.pin14 === "vcc" ? value | 0x04 : value;
    switch (address & 0xc101) {
      case 0x4100:
        this.selectedRegister = input & 0x07;
        break;
      case 0x4101:
        this.registers[this.selectedRegister] = input & 0x07;
        break;
    }
  }

  private readRegisterValue(): number {
    return (this.registers[this.selectedRegister] ?? 0) & this.registerDriveMask();
  }

  private registerDriveMask(): number {
    return this.pin14 === "vcc" ? 0x03 : 0x07;
  }

  private selectedPrgBank(): number {
    return ((this.registers[5] ?? 0) & 0x03) % this.prgBankCount;
  }

  private selectedChrBank(): number {
    const bank = (((this.registers[4] ?? 0) & 1) << 2) | ((this.registers[6] ?? 0) & 3);
    return bank % this.chrBankCount;
  }
}

function isRegisterDataAddress(address: number): boolean {
  return (address & 0xc101) === 0x4101;
}
