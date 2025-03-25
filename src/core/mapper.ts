import Cartridge from "./cartridge.ts";

export interface Mapper {
    read(address: number): number

    write(address: number, value: number): void

    update(): void
}


export class Mapper2 implements Mapper {
    private readonly cartridge: Cartridge
    private readonly prgBanks: number
    private prgBank1: number
    private readonly prgBank2: number

    constructor(cartridge: Cartridge) {
        this.cartridge = cartridge
        this.prgBanks = cartridge.prgRom.length / 0x4000
        this.prgBank1 = 0
        this.prgBank2 = this.prgBanks - 1
    }

    read(address: number): number {
        if (address < 0x2000) {
            return this.cartridge.chrRom[address]
        }
        if (address >= 0xC000) {
            const index = this.prgBank2 * 0x4000 + (address - 0xC000)
            return this.cartridge.prgRom[index]
        }
        if (address >= 0x8000) {
            const index = this.prgBank1 * 0x4000 + (address - 0x8000)
            return this.cartridge.prgRom[index]
        }
        if (address >= 0x6000) {
            const index = (address) - 0x6000
            return this.cartridge.saveRam[index]
        }
        return 0
    }

    write(address: number, value: number): void {
        if (address < 0x2000) {
            this.cartridge.chrRom[address] = value
            return
        }
        if (address >= 0x8000) {
            this.prgBank1 = (value) % this.prgBanks
            return;
        }
        if (address >= 0x6000) {
            const index = (address) - 0x6000
            this.cartridge.saveRam[index] = value
            return;
        }
    }

    update(): void {
    }
}