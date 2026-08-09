import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Emulator } from "../dist/index.js";

const FRAMES = 1200;
const FIXTURE = "M78.3_P128K_C64K.nes";
const FIXTURE_SHA256 = "459f50efc839872599091e3b66c48b972716df773342b42f4f6e0cbd94c232f0";
const EXPECTED_FRAME_SHA256 = "84a69b34e5a3b0ded7b4278a2ea1f1ff17bbe8270acc99a4e798ac6a4e237f23";

const inputDirectory = process.argv[2];
if (!inputDirectory) {
  throw new Error("Usage: run-holy-mapper78.mjs /path/to/holy-mapperel-bin-0.02[/testroms]");
}
const romDirectory =
  basename(inputDirectory) === "testroms" ? inputDirectory : join(inputDirectory, "testroms");
const bytes = await readFile(join(romDirectory, FIXTURE));
const fixtureSha256 = createHash("sha256").update(bytes).digest("hex");
if (fixtureSha256 !== FIXTURE_SHA256) {
  throw new Error(`Unexpected ${FIXTURE} SHA-256: ${fixtureSha256}`);
}

const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const emulator = Emulator.fromRom(rom, `Holy Mapperel 0.02 ${FIXTURE}`);
const cartridge = emulator.cartridge;
const expectedCartridge = {
  mapperNumber: 78,
  submapperNumber: 3,
  prgRomBytes: 128 * 1024,
  chrRomBytes: 64 * 1024,
  prgRamBytes: 0,
  prgNvRamBytes: 0,
};
for (const [field, expected] of Object.entries(expectedCartridge)) {
  if (cartridge[field] !== expected) {
    throw new Error(`Unexpected ${field}: ${cartridge[field]}; expected ${expected}`);
  }
}

let frame;
for (let index = 0; index < FRAMES; index++) frame = emulator.runFrame().frame;
const frameSha256 = createHash("sha256").update(frame.toCanvasImageData()).digest("hex");
const completed = !emulator.diagnostics.cpuHalted && frameSha256 === EXPECTED_FRAME_SHA256;
process.stdout.write(
  `${JSON.stringify({
    fixture: FIXTURE,
    board: "IREM IF-12",
    frames: FRAMES,
    fixtureSha256,
    frameSha256,
    expectedFrameSha256: EXPECTED_FRAME_SHA256,
    detailedResult: "0000",
    completed,
  })}\n`,
);
if (!completed) throw new Error("Holy Mapperel Mapper 78.3 IF-12 regression failed");
process.stdout.write("Holy Mapperel Mapper 78.3: IF-12 fixture passed\n");
