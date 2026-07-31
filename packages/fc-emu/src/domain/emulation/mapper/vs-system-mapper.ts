import type Cartridge from "../../model/cartridge.js";
import { MapperKind } from "./mapper-kind.js";
import type { Mapper, MapperState } from "./mapper.js";

const BANK_SIZE = 0x2000;
const SHARED_RAM_SIZE = 0x0800;

/** iNES mapper 99: Vs. mainboard PRG/CHR sockets selected by CPU OUT2. */
export class VsSystemMapper implements Mapper {
  private selectedBank = 0;

  constructor(private readonly cartridge: Cartridge) {}

  powerOn(): void {
    this.selectedBank = 0;
  }

  reset(): void {
    this.selectedBank = 0;
  }

  captureState(): MapperState {
    return { kind: MapperKind.VsSystem, selectedBank: this.selectedBank };
  }

  restoreState(state: MapperState): void {
    if (state.kind !== MapperKind.VsSystem) {
      throw new Error(`Cannot restore ${state.kind} state into Vs. System mapper`);
    }
    if (state.selectedBank !== 0 && state.selectedBank !== 1) {
      throw new RangeError("Vs. System mapper save state contains an invalid bank");
    }
    this.selectedBank = state.selectedBank;
  }

  read(address: number): number {
    if (address < 0x2000) {
      const offset = this.selectedBank * BANK_SIZE + address;
      return this.cartridge.chrRom[offset] ?? 0;
    }
    if (address >= 0x8000) {
      const offset = this.prgOffset(address);
      return offset === undefined ? 0 : (this.cartridge.prgRom[offset] ?? 0);
    }
    if (address >= 0x6000) {
      return this.cartridge.readPrgRam((address - 0x6000) % SHARED_RAM_SIZE);
    }
    return 0;
  }

  cpuReadDriveMask(address: number): number {
    if (address >= 0x8000) return this.prgOffset(address) === undefined ? 0 : 0xff;
    return address >= 0x6000 ? 0xff : 0;
  }

  ppuReadDriveMask(address: number): number {
    return this.selectedBank * BANK_SIZE + address < this.cartridge.chrRom.byteLength ? 0xff : 0;
  }

  write(address: number, value: number): void {
    if (address >= 0x6000 && address < 0x8000) {
      this.cartridge.writePrgRam((address - 0x6000) % SHARED_RAM_SIZE, value);
    }
  }

  writeControllerLatch(value: number): void {
    this.selectedBank = (value >>> 2) & 1;
  }

  private prgOffset(address: number): number | undefined {
    const socket =
      address < 0xa000 ? (this.selectedBank === 0 ? 0 : 4) : 1 + ((address - 0xa000) >>> 13);
    const offset = socket * BANK_SIZE + (address & 0x1fff);
    return offset < this.cartridge.prgRom.byteLength ? offset : undefined;
  }
}
