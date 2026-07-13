import type Cartridge from "../../model/cartridge.js";
import type { Mapper, MapperState } from "./mapper.js";

/** iNES mapper 0: fixed PRG/CHR layout (NROM). */
export class NromMapper implements Mapper {
  readonly observesPpuAddress = false;

  constructor(private readonly cartridge: Cartridge) {}

  powerOn(): void {}

  captureState(): MapperState {
    return { kind: "nrom" };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== "nrom") throw new Error(`Cannot restore ${state.kind} state into NROM`);
  }

  read(address: number): number {
    if (address < 0x2000) return this.cartridge.readChr(address);
    if (address >= 0x8000) {
      return this.cartridge.prgRom[(address - 0x8000) % this.cartridge.prgRom.length] ?? 0;
    }
    if (address >= 0x6000) return this.readPrgRam(address);
    return 0;
  }

  write(address: number, value: number): void {
    if (address < 0x2000) {
      this.cartridge.writeChr(address, value);
    } else if (address >= 0x6000 && address < 0x8000) {
      this.writePrgRam(address, value);
    }
  }

  observePpuAddress(_: number): void {}

  tickPpu(): void {}

  private readPrgRam(address: number): number {
    const bytes = this.cartridge.prgWritableBytes;
    return bytes === 0 ? 0 : this.cartridge.readPrgRam((address - 0x6000) % bytes);
  }

  private writePrgRam(address: number, value: number): void {
    const bytes = this.cartridge.prgWritableBytes;
    if (bytes > 0) this.cartridge.writePrgRam((address - 0x6000) % bytes, value);
  }
}
