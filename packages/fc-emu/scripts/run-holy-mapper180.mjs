import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Emulator } from "../dist/index.js";

const FRAMES = 1200;
const FIXTURE = "M180_P128K_CR8K_H.nes";
const FIXTURE_SHA256 = "211c02ee86c90992fd89404874fa81c0c6c2091b98e81498275e7981d721521b";
const EXPECTED_FRAME_SHA256 = "3199bd375c198f1808702a7f39e30a2bf644bed04fbed52cd97d091d922b4061";

const inputDirectory = process.argv[2];
if (!inputDirectory) {
  throw new Error("Usage: run-holy-mapper180.mjs /path/to/holy-mapperel-bin-0.02[/testroms]");
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
  mapperNumber: 180,
  submapperNumber: 0,
  prgRomBytes: 128 * 1024,
  chrRomBytes: 0,
  chrRamBytes: 8 * 1024,
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
    board: "UNROM (7408)",
    frames: FRAMES,
    fixtureSha256,
    frameSha256,
    expectedFrameSha256: EXPECTED_FRAME_SHA256,
    detailedResult: "0000",
    completed,
  })}\n`,
);
if (!completed) throw new Error("Holy Mapperel Mapper 180 UNROM regression failed");
process.stdout.write("Holy Mapperel Mapper 180: UNROM (7408) fixture passed\n");
