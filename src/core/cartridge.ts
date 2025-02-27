/**
 * Represents the header of an iNES format ROM file.
 * The iNES format is a standard container format for Nintendo Entertainment System ROMs.
 * It consists of a 16-byte header followed by the actual ROM data.
 */
class INESHeader {
    // Standard iNES file signature ("NES" followed by MS-DOS EOF)
    private static readonly INES_SIGNATURE = 0x1a53454e;

    // Header fields as defined by iNES format specification
    signature: number;       // Should match INES_SIGNATURE
    prgRomBanks: number;     // Number of 16KB PRG-ROM banks
    chrRomBanks: number;     // Number of 8KB CHR-ROM banks
    flagByte1: number;       // Control bits for mapper, mirroring, and battery
    flagByte2: number;       // Additional mapper and system bits
    ramBanks: number;        // Number of 8KB RAM banks
    reserved: Uint8Array;    // 7 bytes reserved for future use

    /**
     * Parses an iNES header from the provided buffer.
     * @param buffer - Raw binary data containing the ROM header
     */
    constructor(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        let offset = 0;

        // Read header fields sequentially from the buffer
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
     * Returns the mapper number (0-255).
     * The mapper number identifies the hardware configuration of the cartridge.
     * It's stored across two flag bytes, with lower and upper nibbles.
     */
    get mapperNumber(): number {
        const lowerNibble = this.flagByte1 >> 4;
        const upperNibble = this.flagByte2 >> 4;
        return lowerNibble | (upperNibble << 4);
    }

    /**
     * Returns the mirroring mode for the name tables.
     * 0: horizontal mirroring
     * 1: vertical mirroring
     * 2: four-screen VRAM
     */
    get mirroringMode(): number {
        const horizontalBit = this.flagByte1 & 1;
        const fourScreenBit = (this.flagByte2 >> 3) & 1;
        return horizontalBit | (fourScreenBit << 1);
    }

    /**
     * Returns whether the cartridge has battery-backed RAM.
     * Battery-backed RAM allows games to save progress even when powered off.
     */
    get hasBatteryBackedRam(): boolean {
        return ((this.flagByte1 >> 1) & 1) === 1;
    }

    /**
     * Checks if the file has a valid iNES signature.
     * Valid ROMs start with the bytes corresponding to "NES" followed by MS-DOS EOF.
     */
    hasValidSignature(): boolean {
        return this.signature === INESHeader.INES_SIGNATURE;
    }

    /**
     * Checks if the ROM contains a 512-byte trainer.
     * Trainers were sometimes used to modify game behavior.
     */
    hasTrainer(): boolean {
        return (this.flagByte1 & 4) === 4;
    }
}

/**
 * Represents a loaded NES cartridge with its ROM and RAM data.
 * Handles parsing and storing the various components of an NES ROM file.
 */
class Cartridge {
    header: INESHeader;        // Parsed iNES header
    prgRom: Uint8Array;        // Program ROM data
    chrRom: Uint8Array;        // Character ROM data
    saveRam: Uint8Array;       // Battery-backed save RAM
    mapperNumber: number;      // Cartridge mapper type
    mirroringMode: number;     // Name table mirroring mode
    hasBatteryBackup: boolean; // Whether cartridge supports saves

    /**
     * Loads an NES ROM file and returns a Cartridge instance.
     * Performs validation and extracts ROM data from the file.
     *
     * @param file - The ROM file to load
     * @returns Promise resolving to a new Cartridge instance
     * @throws Error if the file is invalid or incomplete
     */
    public static async load(file: File): Promise<Cartridge> {
        const arrayBuffer = await file.arrayBuffer();

        // Verify minimum file size for header
        if (arrayBuffer.byteLength < 16) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (file too small)`);
        }

        // Parse and validate the iNES header
        const header = new INESHeader(arrayBuffer);
        if (!header.hasValidSignature()) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (invalid signature)`);
        }

        // Calculate data offsets, accounting for optional trainer
        let offset = 16; // Header size
        if (header.hasTrainer()) {
            offset += 512;
        }

        // Extract PRG ROM (program code)
        const prgRomSize = header.prgRomBanks * 16384; // 16KB per bank
        if (offset + prgRomSize > arrayBuffer.byteLength) {
            throw new Error(`"${file.name}" contains incomplete PRG ROM data`);
        }
        const prgRom = new Uint8Array(arrayBuffer.slice(offset, offset + prgRomSize));
        offset += prgRomSize;

        // Extract CHR ROM (graphics data)
        const chrRomSize = header.chrRomBanks * 8192; // 8KB per bank
        if (offset + chrRomSize > arrayBuffer.byteLength) {
            throw new Error(`"${file.name}" contains incomplete CHR ROM data`);
        }
        const chrRom = new Uint8Array(arrayBuffer.slice(offset, offset + chrRomSize));

        // Create and initialize the cartridge instance
        const cart = Object.create(Cartridge.prototype);
        cart.header = header;
        cart.prgRom = prgRom;
        cart.chrRom = chrRom;
        cart.saveRam = new Uint8Array(0x2000); // 8KB of save RAM
        cart.mapperNumber = header.mapperNumber;
        cart.mirroringMode = header.mirroringMode;
        cart.hasBatteryBackup = header.hasBatteryBackedRam;

        return cart;
    }

    /**
     * Private constructor - use Cartridge.load() instead.
     * Prevents direct instantiation of the class.
     */
    private constructor() {
        throw new Error("Use Cartridge.load() to create a new cartridge instance");
    }
}

export default Cartridge;