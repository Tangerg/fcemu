/**
 * Represents the header of an iNES format ROM file
 */
class NESFileHeader {
    // Standard iNES file signature ("NES" followed by MS-DOS EOF)
    static readonly INES_SIGNATURE = 0x1a53454e;

    signature: number;
    prgRomBanks: number;
    chrRomBanks: number;
    flagByte1: number;
    flagByte2: number;
    ramBanks: number;
    reserved: Uint8Array;

    constructor(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        let offset = 0;

        this.signature = view.getUint32(offset, true);
        offset += 4;
        this.prgRomBanks = view.getUint8(offset);
        offset += 1;
        this.chrRomBanks = view.getUint8(offset);
        offset += 1;
        this.flagByte1 = view.getUint8(offset);
        offset += 1;
        this.flagByte2 = view.getUint8(offset);
        offset += 1;
        this.ramBanks = view.getUint8(offset);
        offset += 1;
        this.reserved = new Uint8Array(buffer.slice(offset, offset + 7));
    }

    /**
     * Returns the mapper number (0-255)
     */
    get mapperNumber(): number {
        const lowerNibble = this.flagByte1 >> 4;
        const upperNibble = this.flagByte2 >> 4;
        return lowerNibble | (upperNibble << 4);
    }

    /**
     * Returns the mirroring mode
     * 0: horizontal, 1: vertical, 2: four-screen
     */
    get mirroringMode(): number {
        const horizontalBit = this.flagByte1 & 1;
        const fourScreenBit = (this.flagByte2 >> 3) & 1;
        return horizontalBit | (fourScreenBit << 1);
    }

    /**
     * Returns whether the cartridge has battery-backed RAM
     */
    get hasBatteryBackedRam(): boolean {
        return ((this.flagByte1 >> 1) & 1) === 1;
    }

    /**
     * Checks if the file has a valid iNES signature
     */
    hasValidSignature(): boolean {
        return this.signature === NESFileHeader.INES_SIGNATURE;
    }

    /**
     * Checks if the ROM contains a 512-byte trainer
     */
    hasTrainer(): boolean {
        return (this.flagByte1 & 4) === 4;
    }
}

/**
 * Represents a loaded NES cartridge with its ROM and RAM data
 */
class Cartridge {
    prgRom: Uint8Array;
    chrRom: Uint8Array;
    saveRam: Uint8Array;
    mapperNumber: number;
    mirroringMode: number;
    hasBatteryBackup: boolean;

    /**
     * Loads an NES ROM file and returns a Cartridge instance
     * @param file The ROM file to load
     */
    public static async load(file: File): Promise<Cartridge> {
        const arrayBuffer = await file.arrayBuffer();

        // Verify minimum file size for header
        if (arrayBuffer.byteLength < 16) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (file too small)`);
        }

        // Parse header
        const header = new NESFileHeader(arrayBuffer);
        if (!header.hasValidSignature()) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (invalid signature)`);
        }

        // Calculate data offsets
        let offset = 16; // Header size
        if (header.hasTrainer()) {
            offset += 512;
        }

        // Load PRG ROM
        const prgRomSize = header.prgRomBanks * 16384; // 16KB per bank
        if (offset + prgRomSize > arrayBuffer.byteLength) {
            throw new Error(`"${file.name}" contains incomplete PRG ROM data`);
        }
        const prgRom = new Uint8Array(arrayBuffer.slice(offset, offset + prgRomSize));
        offset += prgRomSize;

        // Load CHR ROM
        const chrRomSize = header.chrRomBanks * 8192; // 8KB per bank
        if (offset + chrRomSize > arrayBuffer.byteLength) {
            throw new Error(`"${file.name}" contains incomplete CHR ROM data`);
        }
        const chrRom = new Uint8Array(arrayBuffer.slice(offset, offset + chrRomSize));

        // Create and return the cartridge
        const cart = Object.create(Cartridge.prototype);
        cart.prgRom = prgRom;
        cart.chrRom = chrRom;
        cart.saveRam = new Uint8Array(0x2000); // 8KB of save RAM
        cart.mapperNumber = header.mapperNumber;
        cart.mirroringMode = header.mirroringMode;
        cart.hasBatteryBackup = header.hasBatteryBackedRam;

        return cart;
    }

    /**
     * Private constructor - use Cartridge.load() instead
     */
    private constructor() {
        throw new Error("Use Cartridge.load() to create a new cartridge instance");
    }
}

export default Cartridge;