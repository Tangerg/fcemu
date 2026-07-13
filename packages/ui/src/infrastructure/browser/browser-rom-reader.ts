import type { RomImage, RomReaderPort } from "../../application/ports.js";

export class BrowserRomReader implements RomReaderPort {
  async read(file: File): Promise<RomImage> {
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const id = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return { id, name: file.name, bytes };
  }
}
