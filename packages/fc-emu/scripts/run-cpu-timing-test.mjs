import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ControllerButton, Emulator } from "../dist/index.js";

const ROM_SHA256 = "6ab4fe8af23b12ca0dfccfc030de3d4069bf2498e3ef20ddcf1ca75555065b85";
const EXPECTED_FRAME_SHA256 = "a08218390a9a6c7d21fa8563f184bab0503596322fa6b489e78fef4ff1f0dd02";
const FRAMES = 1500;
const BUTTON_RELEASE_FRAME = 30;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRom = path.resolve(
  scriptDirectory,
  "..",
  "test-roms",
  "external",
  "nes-test-roms",
  "cpu_timing_test6",
  "cpu_timing_test.nes",
);
const romPath = path.resolve(process.argv[2] ?? defaultRom);
const bytes = await readFile(romPath);
const fixtureSha256 = createHash("sha256").update(bytes).digest("hex");
if (fixtureSha256 !== ROM_SHA256) {
  throw new Error(`Unexpected SHA-256 for ${romPath}: ${fixtureSha256}`);
}

const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const emulator = Emulator.fromRom(rom, path.basename(romPath));
emulator.setControllerButton(1, ControllerButton.B, true);
let frame;
for (let index = 0; index < FRAMES; index++) {
  if (index === BUTTON_RELEASE_FRAME) {
    emulator.setControllerButton(1, ControllerButton.B, false);
  }
  frame = emulator.runFrame().frame;
}
const frameSha256 = createHash("sha256").update(frame.toCanvasImageData()).digest("hex");
const completed = frameSha256 === EXPECTED_FRAME_SHA256;
process.stdout.write(
  `${JSON.stringify(
    {
      rom: romPath,
      mode: "official and all unofficial instructions except branches and halt opcodes",
      frames: FRAMES,
      fixtureSha256,
      frameSha256,
      expectedFrameSha256: EXPECTED_FRAME_SHA256,
      completed,
    },
    null,
    2,
  )}\n`,
);
if (!completed) process.exitCode = 1;
