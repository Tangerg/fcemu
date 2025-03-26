/**
 * Represents the header of an iNES format ROM file.
 * The iNES format is a standard container format for Nintendo Entertainment System ROMs.
 * It consists of a 16-byte header followed by the actual ROM data.
 */
class INESHeader {
    // Header fields as defined by iNES format specification
    private readonly signature: Uint8Array;   // Should match INES_SIGNATURE_BYTES
    public prgRomBanks: number;               // Number of 16KB PRG-ROM banks
    public chrRomBanks: number;               // Number of 8KB CHR-ROM banks
    private readonly flagByte1: number;       // Control bits for mapper, mirroring, and battery
    private readonly flagByte2: number;       // Additional mapper and system bits
    public ramBanks: number;                  // Number of 8KB RAM banks
    private readonly reserved: Uint8Array;    // 7 bytes reserved for future use

    // Standard iNES file signature bytes ("NES" followed by MS-DOS EOF)
    private static readonly INES_SIGNATURE_BYTES = new Uint8Array([0x4E, 0x45, 0x53, 0x1A]);
    // Standard iNES file header size
    public static readonly HEADER_SIZE = 16;
    // Default RAM size when not specified (8KB)
    private static readonly DEFAULT_RAM_SIZE = 1;

    /**
     * Checks if this ROM uses iNES 2.0 format
     * iNES 2.0 format is identified by checking specific bits in flag bytes
     */
    private get isINES2(): boolean {
        return ((this.flagByte1 >> 2) & 0x3) === 2 && ((this.flagByte2 >> 2) & 0x3) === 2;
    }

    /**
     * Parses an iNES header from the provided buffer.
     * @param buffer - Raw binary data containing the ROM header
     */
    constructor(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        let offset = 0;

        // Read signature bytes directly
        this.signature = new Uint8Array(buffer.slice(0, 4));
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

        // If RAM size is 0, use default
        if (this.ramBanks === 0) {
            this.ramBanks = INESHeader.DEFAULT_RAM_SIZE;
        }

        // Handle iNES 2.0 format for PRG and CHR ROM sizes
        if (this.isINES2) {
            // In iNES 2.0, if MSB is set in prgRomBanks or chrRomBanks,
            // the size is calculated differently using values from other bytes
            // This is a simplification; full iNES 2.0 would need more complex logic
            if ((this.flagByte2 & 0x0F) !== 0) {
                // PRG ROM size MSB in bits 0-3 of byte 9
                this.prgRomBanks |= (this.flagByte2 & 0x0F) << 8;
            }
            // Additional iNES 2.0 handling would go here
        }
    }

    /**
     * Returns the mapper number (0-255).
     * The mapper number identifies the hardware configuration of the cartridge.
     * It's stored across two flag bytes, with lower and upper nibbles.
     */
    get mapperNumber(): number {
        let mapper = (this.flagByte1 >> 4) | ((this.flagByte2 & 0xF0));

        // Additional mapper bits for iNES 2.0
        if (this.isINES2) {
            const extendedMapperBits = this.reserved[0] & 0x0F;
            mapper |= (extendedMapperBits << 8);
        }

        return mapper;
    }

    /**
     * Returns the mirroring mode for the name tables.
     * 0: horizontal mirroring
     * 1: vertical mirroring
     * 2: four-screen VRAM
     */
    get mirroringMode(): number {
        // Four-screen mirroring takes precedence
        if ((this.flagByte1 & 0x08) !== 0) {
            return 2; // Four-screen
        }

        // Bit 0 of flag byte 1 determines horizontal (0) or vertical (1) mirroring
        return this.flagByte1 & 0x01;
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
    get hasValidSignature(): boolean {
        if (this.signature.length !== INESHeader.INES_SIGNATURE_BYTES.length) {
            return false;
        }

        for (let i = 0; i < this.signature.length; i++) {
            if (this.signature[i] !== INESHeader.INES_SIGNATURE_BYTES[i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks if the ROM contains a 512-byte trainer.
     * Trainers were sometimes used to modify game behavior.
     */
    get hasTrainer(): boolean {
        return (this.flagByte1 & 0x04) === 0x04;
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
    usesChrRam: boolean;       // Whether the cartridge uses CHR-RAM instead of CHR-ROM

    // Standard iNES file trainer size
    public static readonly TRAINER_SIZE = 512;
    // prgRom 16KB per bank
    private static readonly PER_PRGROMBANK_SIZE = 16384;
    // chrRom 8KB per bank
    private static readonly PER_CHRROMBANK_SIZE = 8192;
    // Default 8KB of CHR-RAM when CHR-ROM is absent
    private static readonly DEFAULT_CHRRAM_SIZE = 8192;
    // 8KB of save RAM
    private static readonly SAVERAM_SIZE = 0x2000;

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
        if (arrayBuffer.byteLength < INESHeader.HEADER_SIZE) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (file too small)`);
        }

        // Parse and validate the iNES header
        const header = new INESHeader(arrayBuffer);
        if (!header.hasValidSignature) {
            throw new Error(`"${file.name}" is not a valid NES ROM file (invalid signature)`);
        }

        // Calculate data offsets, accounting for optional trainer
        let offset = INESHeader.HEADER_SIZE;
        if (header.hasTrainer) {
            offset += Cartridge.TRAINER_SIZE;
        }

        // Extract PRG ROM (program code)
        const prgRomSize = header.prgRomBanks * Cartridge.PER_PRGROMBANK_SIZE;
        if (offset + prgRomSize > arrayBuffer.byteLength) {
            throw new Error(`"${file.name}" contains incomplete PRG ROM data`);
        }
        const prgRom = new Uint8Array(arrayBuffer.slice(offset, offset + prgRomSize));
        offset += prgRomSize;

        // Extract CHR ROM (graphics data) or initialize CHR RAM if needed
        let chrRom: Uint8Array;
        let usesChrRam = false;

        if (header.chrRomBanks === 0) {
            // Game uses CHR-RAM instead of CHR-ROM
            chrRom = new Uint8Array(Cartridge.DEFAULT_CHRRAM_SIZE);
            usesChrRam = true;
        } else {
            const chrRomSize = header.chrRomBanks * Cartridge.PER_CHRROMBANK_SIZE;
            if (offset + chrRomSize > arrayBuffer.byteLength) {
                throw new Error(`"${file.name}" contains incomplete CHR ROM data`);
            }
            chrRom = new Uint8Array(arrayBuffer.slice(offset, offset + chrRomSize));
        }

        // Create and initialize the cartridge instance
        const cart = Object.create(Cartridge.prototype);
        cart.header = header;
        cart.prgRom = prgRom;
        cart.chrRom = chrRom;
        cart.saveRam = new Uint8Array(header.ramBanks * Cartridge.SAVERAM_SIZE);
        cart.mapperNumber = header.mapperNumber;
        cart.mirroringMode = header.mirroringMode;
        cart.hasBatteryBackup = header.hasBatteryBackedRam;
        cart.usesChrRam = usesChrRam;

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