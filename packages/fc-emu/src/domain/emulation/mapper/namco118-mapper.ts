import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";
import { isFixedByteArray } from "./state-validation.js";

const PRG_BANK_SIZE = 0x2000;
const CHR_BANK_SIZE = 0x0400;
const REGISTER_MASKS = [0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x3f, 0x0f, 0x0f] as const;

/**
 * iNES mapper 206: Namco 118 / Nintendo DxROM, the discrete predecessor to MMC3.
 *
 * It shares MMC3's $8000/$8001 bank-select and bank-data ports but hardwires the
 * layout: two 2 KiB and four 1 KiB CHR windows, two switchable 8 KiB PRG banks
 * with the final two banks fixed. There is no IRQ, no PRG-RAM and no mirroring
 * register, so nametable mirroring stays hardwired from the header.
 */
export class Namco118Mapper implements Mapper {
  private readonly prgBankCount: number;
  private readonly chrBankCount: number;
  private register = 0;
  private registers = [0, 0, 0, 0, 0, 0, 0, 0];

  constructor(private readonly cartridge: Cartridge) {
    this.prgBankCount = cartridge.prgRom.byteLength / PRG_BANK_SIZE;
    this.chrBankCount = Math.max(1, cartridge.chrMemoryBytes / CHR_BANK_SIZE);
  }

  powerOn(): void {
    this.register = 0;
    this.registers.fill(0);
  }

  captureState(): MapperState {
    return { kind: MapperKind.Namco118, register: this.register, registers: [...this.registers] };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.Namco118)
      throw new Error(`Cannot restore ${state.kind} state into Namco 118`);
    if (
      !Number.isInteger(state.register) ||
      state.register < 0 ||
      state.register > 7 ||
      !isFixedByteArray(state.registers, 8)
    ) {
      throw new RangeError("Namco 118 save state contains invalid bank registers");
    }
    this.register = state.register;
    this.registers = [...state.registers];
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(this.chrOffset(address));
    if (address >= 0x8000) return this.cartridge.prgRom[this.prgOffset(address)] ?? 0;
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(this.chrOffset(address), value);
      return;
    }
    if (address < 0x8000 || address > 0x9fff) return;
    if (address % 2 === 0) this.register = value & 0x07;
    else this.registers[this.register] = value & REGISTER_MASKS[this.register];
  }

  private chrOffset(address: number): number {
    const bank = this.chrBankIndex(address) % this.chrBankCount;
    return bank * CHR_BANK_SIZE + (address & 0x03ff);
  }

  private chrBankIndex(address: number): number {
    switch (address >> 10) {
      case 0:
        return this.registers[0] & 0xfe; // PPU $0000-$03FF (2 KiB pair, low half)
      case 1:
        return this.registers[0] | 0x01; // PPU $0400-$07FF
      case 2:
        return this.registers[1] & 0xfe; // PPU $0800-$0BFF
      case 3:
        return this.registers[1] | 0x01; // PPU $0C00-$0FFF
      default:
        return this.registers[(address >> 10) - 2]; // PPU $1000-$1FFF -> R2..R5
    }
  }

  private prgOffset(address: number): number {
    const slot = (address - 0x8000) >> 13; // 0..3
    const bank =
      slot === 0
        ? this.registers[6]
        : slot === 1
          ? this.registers[7]
          : this.prgBankCount - (4 - slot);
    return (bank % this.prgBankCount) * PRG_BANK_SIZE + (address - 0x8000 - slot * PRG_BANK_SIZE);
  }
}
