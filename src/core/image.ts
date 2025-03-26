export class Image {
    private readonly width: number;
    private readonly height: number;
    private readonly pixels: number[][];

    /**
     * Creates a new image
     * @param width Image width
     * @param height Image height
     * @param fillColor Initial fill color, defaults to 0
     */
    constructor(width: number, height: number, fillColor: number = 0) {
        if (width <= 0 || height <= 0) {
            throw new Error("Width and height must be greater than 0");
        }
        this.width = width;
        this.height = height;

        // Initialize the 2D pixel array with the fill color
        this.pixels = new Array(width);
        for (let x = 0; x < width; x++) {
            this.pixels[x] = new Array(height).fill(fillColor);
        }
    }

    /**
     * Validates if coordinates are within valid range
     */
    private validateCoordinates(x: number, y: number): void {
        if (x < 0 || x >= this.width) {
            throw new Error(`X coordinate must be between 0 and ${this.width - 1}`);
        }
        if (y < 0 || y >= this.height) {
            throw new Error(`Y coordinate must be between 0 and ${this.height - 1}`);
        }
    }

    /**
     * Sets the RGBA color value for a pixel
     * @param x X coordinate
     * @param y Y coordinate
     * @param rgba Color value
     */
    public setRGBA(x: number, y: number, rgba: number): void {
        this.validateCoordinates(x, y);
        this.pixels[x][y] = rgba;
    }

    /**
     * Gets the RGBA color value of a pixel
     * @param x X coordinate
     * @param y Y coordinate
     * @returns Color value
     */
    public getRGBA(x: number, y: number): number {
        this.validateCoordinates(x, y);
        return this.pixels[x][y];
    }

    /**
     * Creates an RGBA color value
     * @param r Red component (0-255)
     * @param g Green component (0-255)
     * @param b Blue component (0-255)
     * @param a Alpha component (0-255)
     * @returns 32-bit RGBA color value
     */
    public static createRGBA(r: number, g: number, b: number, a: number = 255): number {
        // Combine individual components into a single 32-bit integer
        return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
    }

    /**
     * Decomposes color value into RGBA components
     * @param rgba 32-bit RGBA color value
     * @returns Object containing RGBA components
     */
    public static extractRGBA(rgba: number): { r: number, g: number, b: number, a: number } {
        return {
            r: rgba & 0xff,               // Extract red component (lowest 8 bits)
            g: (rgba >> 8) & 0xff,        // Extract green component (bits 8-15)
            b: (rgba >> 16) & 0xff,       // Extract blue component (bits 16-23)
            a: (rgba >> 24) & 0xff        // Extract alpha component (bits 24-31)
        };
    }

    /**
     * Fills the entire image with specified color
     * @param rgba 32-bit RGBA color value
     */
    public fill(rgba: number): void {
        // Update all pixels with the new color
        for (let x = 0; x < this.width; x++) {
            this.pixels[x].fill(rgba);
        }
    }

    /**
     * Calculates the sum of all pixel values in the image
     * @returns Sum of pixel values
     */
    public value(): number {
        let sum = 0;
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                sum += this.pixels[x][y];
            }
        }
        return sum;
    }

    /**
     * Gets the image width
     */
    public getWidth(): number {
        return this.width;
    }

    /**
     * Gets the image height
     */
    public getHeight(): number {
        return this.height;
    }

    /**
     * Clones the image
     * @returns New Image instance with identical content
     */
    public clone(): Image {
        const newImage = new Image(this.width, this.height);
        // Copy each pixel value to the new image
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                newImage.pixels[x][y] = this.pixels[x][y];
            }
        }
        return newImage;
    }

    /**
     * Exports image data as Uint8ClampedArray (for Canvas)
     * @returns Image data in Uint8ClampedArray format
     */
    public toCanvasImageData(): Uint8ClampedArray {
        const data = new Uint8ClampedArray(this.width * this.height * 4);

        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const rgba = this.pixels[x][y];
                const offset = (y * this.width + x) * 4;

                // Convert from 32-bit packed format to individual bytes in array
                data[offset] = rgba & 0xff;           // R
                data[offset + 1] = (rgba >> 8) & 0xff;  // G
                data[offset + 2] = (rgba >> 16) & 0xff; // B
                data[offset + 3] = (rgba >> 24) & 0xff; // A
            }
        }

        return data;
    }
}