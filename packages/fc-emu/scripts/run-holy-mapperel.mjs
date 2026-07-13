import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Emulator } from "../dist/index.js";

const FRAMES = 1200;
const inputDirectory = process.argv[2];
if (!inputDirectory) {
  throw new Error("Usage: run-holy-mapperel.mjs /path/to/holy-mapperel-bin-0.02[/testroms]");
}
const romDirectory =
  basename(inputDirectory) === "testroms" ? inputDirectory : join(inputDirectory, "testroms");

const cases = [
  {
    board: "SKROM",
    file: "M1_P128K_C128K_W8K.nes",
    sha256: "8591b7083c4b67010a3e934d3862b0dff0c8eefc32f81bafb3a92b5002bfc1ef",
  },
  {
    board: "SGROM",
    file: "M1_P128K_CR8K.nes",
    sha256: "810b8a9c450cca5b997e5da55e2f103f9aba8c3200e33d55b19a47d29db7d73c",
  },
  {
    board: "SUROM",
    file: "M1_P512K_CR8K_S8K.nes",
    sha256: "2bb8c70322addff97edd3ad4aa8e78422d2ec7ee768c68d36156ac8cc386a479",
  },
  {
    board: "SXROM",
    file: "M1_P512K_CR8K_S32K.nes",
    sha256: "74601557d806e323e049bc9e3d260246a3e35bb85a78aded942c9155acbe91c7",
  },
  {
    board: "SNROM",
    file: "M1_P128K.nes",
    // Holy Mapperel 0.02 does not ship this W8K header combination. Mark the
    // zlib-licensed source as modified by declaring 8 KiB volatile PRG RAM.
    modifyHeader(bytes) {
      bytes[10] = 0x07;
    },
    sha256: "831f590d4b16018253f5d00aeeef9d31b0bf49a2aa6b39dabd5846db586e2ace",
  },
];

let passed = 0;
for (const fixture of cases) {
  const bytes = Uint8Array.from(await readFile(join(romDirectory, fixture.file)));
  fixture.modifyHeader?.(bytes);
  const emulator = Emulator.fromRom(bytes.buffer, `Holy Mapperel 0.02 ${fixture.board}`);
  let frame;
  for (let index = 0; index < FRAMES; index++) frame = emulator.runFrame().frame;
  const sha256 = createHash("sha256").update(frame.toCanvasImageData()).digest("hex");
  const completed = !emulator.diagnostics.cpuHalted && sha256 === fixture.sha256;
  if (completed) passed++;
  process.stdout.write(
    `${JSON.stringify({
      fixture: fixture.file,
      board: fixture.board,
      frames: FRAMES,
      sha256,
      expectedSha256: fixture.sha256,
      completed,
    })}\n`,
  );
}

if (passed !== cases.length) {
  throw new Error(`Holy Mapperel MMC1 regression: ${passed}/${cases.length} fixtures passed`);
}
process.stdout.write(`Holy Mapperel MMC1: ${passed}/${cases.length} fixtures passed\n`);
