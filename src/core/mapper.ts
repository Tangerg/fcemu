import Cartridge from "./cartridge.ts";
import Bus from "./bus.ts";

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

export class Mapper4 implements Mapper {
    private cartridge: Cartridge;
    private bus: Bus;
    private register: number = 0;
    private registers: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    private prgMode: number = 0;
    private chrMode: number = 0;
    private prgOffsets: number[] = [0, 0, 0, 0];
    private chrOffsets: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    private reload: number = 0;
    private counter: number = 0;
    private irqEnable: boolean = false;

    constructor(bus: Bus, cartridge: Cartridge) {
        this.cartridge = cartridge;
        this.bus = bus;
        this.prgOffsets[0] = this.prgBankOffset(0);
        this.prgOffsets[1] = this.prgBankOffset(1);
        this.prgOffsets[2] = this.prgBankOffset(-2);
        this.prgOffsets[3] = this.prgBankOffset(-1);
    }

    update(): void {
        const ppu = this.bus.PPU;
        if (ppu.cycle !== 280) { // TODO: this *should* be 260
            return;
        }
        if (ppu.scanLine > 239 && ppu.scanLine < 261) {
            return;
        }
        if (ppu.flagShowBackground === 0 && ppu.flagShowSprites === 0) {
            return;
        }
        this.handleScanLine();
    }

    private handleScanLine(): void {
        if (this.counter === 0) {
            this.counter = this.reload;
        } else {
            this.counter--;
            if (this.counter === 0 && this.irqEnable) {
                this.bus.CPU.triggerIRQ();
            }
        }
    }

    read(address: number): number {
        if (address < 0x2000) {
            const bank = Math.floor(address / 0x0400);
            const offset = address % 0x0400;
            return this.cartridge.chrRom[this.chrOffsets[bank] + offset];
        } else if (address >= 0x8000) {
            address = address - 0x8000;
            const bank = Math.floor(address / 0x2000);
            const offset = address % 0x2000;
            return this.cartridge.prgRom[this.prgOffsets[bank] + offset];
        } else if (address >= 0x6000) {
            return this.cartridge.saveRam[address - 0x6000];
        } else {
            console.error(`Unhandled mapper4 read at address: 0x${address.toString(16).padStart(4, '0')}`);
            return 0;
        }
    }

    write(address: number, value: number): void {
        if (address < 0x2000) {
            const bank = Math.floor(address / 0x0400);
            const offset = address % 0x0400;
            this.cartridge.chrRom[this.chrOffsets[bank] + offset] = value;
        } else if (address >= 0x8000) {
            this.writeRegister(address, value);
        } else if (address >= 0x6000) {
            this.cartridge.saveRam[address - 0x6000] = value;
        } else {
            console.error(`Unhandled mapper4 write at address: 0x${address.toString(16).padStart(4, '0')}`);
        }
    }

    private writeRegister(address: number, value: number): void {
        if (address <= 0x9FFF && address % 2 === 0) {
            this.writeBankSelect(value);
        } else if (address <= 0x9FFF && address % 2 === 1) {
            this.writeBankData(value);
        } else if (address <= 0xBFFF && address % 2 === 0) {
            this.writeMirror(value);
        } else if (address <= 0xBFFF && address % 2 === 1) {
            this.writeProtect(value);
        } else if (address <= 0xDFFF && address % 2 === 0) {
            this.writeIRQLatch(value);
        } else if (address <= 0xDFFF && address % 2 === 1) {
            this.writeIRQReload(value);
        } else if (address <= 0xFFFF && address % 2 === 0) {
            this.writeIRQDisable(value);
        } else if (address <= 0xFFFF && address % 2 === 1) {
            this.writeIRQEnable(value);
        }
    }

    private writeBankSelect(value: number): void {
        this.prgMode = (value >> 6) & 1;
        this.chrMode = (value >> 7) & 1;
        this.register = value & 7;
        this.updateOffsets();
    }

    private writeBankData(value: number): void {
        this.registers[this.register] = value;
        this.updateOffsets();
    }

    private writeMirror(value: number): void {
        switch (value & 1) {
            case 0:
                this.cartridge.mirroringMode = MirrorType.MirrorVertical;
                break;
            case 1:
                this.cartridge.mirroringMode = MirrorType.MirrorHorizontal;
                break;
        }
    }

    private writeProtect(_: number): void {
        // No implementation in the original code
    }

    private writeIRQLatch(value: number): void {
        this.reload = value;
    }

    private writeIRQReload(_: number): void {
        this.counter = 0;
    }

    private writeIRQDisable(_: number): void {
        this.irqEnable = false;
    }

    private writeIRQEnable(_: number): void {
        this.irqEnable = true;
    }

    private prgBankOffset(index: number): number {
        if (index >= 0x80) {
            index -= 0x100;
        }
        index %= Math.floor(this.cartridge.prgRom.length / 0x2000);
        let offset = index * 0x2000;
        if (offset < 0) {
            offset += this.cartridge.prgRom.length;
        }
        return offset;
    }

    private chrBankOffset(index: number): number {
        if (index >= 0x80) {
            index -= 0x100;
        }
        index %= Math.floor(this.cartridge.chrRom.length / 0x0400);
        let offset = index * 0x0400;
        if (offset < 0) {
            offset += this.cartridge.chrRom.length;
        }
        return offset;
    }

    private updateOffsets(): void {
        switch (this.prgMode) {
            case 0:
                this.prgOffsets[0] = this.prgBankOffset(this.registers[6]);
                this.prgOffsets[1] = this.prgBankOffset(this.registers[7]);
                this.prgOffsets[2] = this.prgBankOffset(-2);
                this.prgOffsets[3] = this.prgBankOffset(-1);
                break;
            case 1:
                this.prgOffsets[0] = this.prgBankOffset(-2);
                this.prgOffsets[1] = this.prgBankOffset(this.registers[7]);
                this.prgOffsets[2] = this.prgBankOffset(this.registers[6]);
                this.prgOffsets[3] = this.prgBankOffset(-1);
                break;
        }

        switch (this.chrMode) {
            case 0:
                this.chrOffsets[0] = this.chrBankOffset(this.registers[0] & 0xFE);
                this.chrOffsets[1] = this.chrBankOffset(this.registers[0] | 0x01);
                this.chrOffsets[2] = this.chrBankOffset(this.registers[1] & 0xFE);
                this.chrOffsets[3] = this.chrBankOffset(this.registers[1] | 0x01);
                this.chrOffsets[4] = this.chrBankOffset(this.registers[2]);
                this.chrOffsets[5] = this.chrBankOffset(this.registers[3]);
                this.chrOffsets[6] = this.chrBankOffset(this.registers[4]);
                this.chrOffsets[7] = this.chrBankOffset(this.registers[5]);
                break;
            case 1:
                this.chrOffsets[0] = this.chrBankOffset(this.registers[2]);
                this.chrOffsets[1] = this.chrBankOffset(this.registers[3]);
                this.chrOffsets[2] = this.chrBankOffset(this.registers[4]);
                this.chrOffsets[3] = this.chrBankOffset(this.registers[5]);
                this.chrOffsets[4] = this.chrBankOffset(this.registers[0] & 0xFE);
                this.chrOffsets[5] = this.chrBankOffset(this.registers[0] | 0x01);
                this.chrOffsets[6] = this.chrBankOffset(this.registers[1] & 0xFE);
                this.chrOffsets[7] = this.chrBankOffset(this.registers[1] | 0x01);
                break;
        }
    }
}

enum MirrorType {
    MirrorHorizontal = 0,
    MirrorVertical = 1,
    MirrorSingle0 = 2,
    MirrorSingle1 = 3,
    MirrorFour = 4,
}