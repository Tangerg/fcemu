import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Emulator } from "../dist/index.js";

const FRAMES = 1200;
const FIXTURE = "M34_P128K_CR8K_H.nes";
const FIXTURE_SHA256 = "cb00e7b0092000b272f1c5bc341038da45031d44993d1a1abde864b5eafb1d85";
const EXPECTED_FRAME_SHA256 = "a6c51ac1094541e0ac9987c94b7dd3ff27c67a73557e6978f1594797d6ac28b9";

const inputDirectory = process.argv[2];
if (!inputDirectory) {
  throw new Error("Usage: run-holy-mapper34.mjs /path/to/holy-mapperel-bin-0.02[/testroms]");
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
let frame;
for (let index = 0; index < FRAMES; index++) frame = emulator.runFrame().frame;
const frameSha256 = createHash("sha256").update(frame.toCanvasImageData()).digest("hex");
const completed = !emulator.diagnostics.cpuHalted && frameSha256 === EXPECTED_FRAME_SHA256;
process.stdout.write(
  `${JSON.stringify({
    fixture: FIXTURE,
    board: "BNROM",
    frames: FRAMES,
    fixtureSha256,
    frameSha256,
    expectedFrameSha256: EXPECTED_FRAME_SHA256,
    completed,
  })}\n`,
);
if (!completed) throw new Error("Holy Mapperel Mapper 34 BNROM regression failed");
process.stdout.write("Holy Mapperel Mapper 34: BNROM fixture passed\n");
