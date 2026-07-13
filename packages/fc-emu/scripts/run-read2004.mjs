import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Emulator } from "../dist/index.js";

const FIXTURE_SHA256 = "91eb7535c03f112170653d62e43338c5eec92e0485557729ef69ef3522ee6def";
const DEFAULT_FRAMES = 300;
const TIMED_READ_BYTES = 252;
const romArgument = process.argv[2];
const frames = Number.parseInt(process.argv[3] ?? `${DEFAULT_FRAMES}`, 10);

function run(romPath, frameLimit) {
  const bytes = fs.readFileSync(romPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== FIXTURE_SHA256) {
    throw new Error(`Expected Quietust read2004.nes SHA-256 ${FIXTURE_SHA256}, received ${sha256}`);
  }

  const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const emulator = Emulator.fromRom(rom, path.basename(romPath));
  for (let frame = 0; frame < frameLimit; frame++) emulator.runFrame();

  const actual = decodeOutput(emulator.captureSaveState().state.ppu.nameTableData);
  const exact = countMismatches(EXPECTED_OUTPUT, actual, 0);
  const candidates = Array.from({ length: 25 }, (_, index) => index - 12).map((shift) => ({
    shift,
    ...countTimedReadMismatches(EXPECTED_OUTPUT, actual, shift),
  }));
  candidates.sort((left, right) => left.mismatches - right.mismatches);
  const best = candidates[0];

  console.log(
    JSON.stringify(
      {
        rom: romPath,
        sha256,
        frames: frameLimit,
        exact: exact.mismatches === 0,
        exactMismatches: exact.mismatches,
        bestPhaseShiftDots: best.shift,
        phaseAlignedComparedBytes: best.compared,
        phaseAlignedMismatches: best.mismatches,
        stackBytesMatch: EXPECTED_OUTPUT.slice(TIMED_READ_BYTES).every(
          (value, index) => value === actual[TIMED_READ_BYTES + index],
        ),
      },
      null,
      2,
    ),
  );

  if (exact.mismatches !== 0) process.exitCode = 1;
}

function decodeOutput(nameTableData) {
  const output = [];
  for (let index = 0; index < 256; index++) {
    const row = 2 + Math.floor(index / 10);
    const column = (index % 10) * 3 + 1;
    const offset = row * 32 + column;
    output.push(
      (((nameTableData[offset] - 0x10) & 0x0f) << 4) | ((nameTableData[offset + 1] - 0x10) & 0x0f),
    );
  }
  return output;
}

function countMismatches(expected, actual, shift) {
  let compared = 0;
  let mismatches = 0;
  for (let index = 0; index < expected.length; index++) {
    const actualIndex = index + shift;
    if (actualIndex < 0 || actualIndex >= actual.length) continue;
    compared++;
    if (expected[index] !== actual[actualIndex]) mismatches++;
  }
  return { compared, mismatches };
}

function countTimedReadMismatches(expected, actual, shift) {
  let compared = 0;
  let mismatches = 0;
  for (let index = 0; index < TIMED_READ_BYTES; index++) {
    const actualIndex = index + shift;
    if (actualIndex < 0 || actualIndex >= TIMED_READ_BYTES) continue;
    compared++;
    if (expected[index] !== actual[actualIndex]) mismatches++;
  }
  return { compared, mismatches };
}

// RP2C02G output published by Quietust. The ROM transposes 252 timed
// $2004 reads plus four stack bytes into this 26-line screen.
const EXPECTED_OUTPUT = `
FF FF FF FF AA AA 01 01 10 10
01 01 00 00 00 00 20 20 01 01
01 01 00 00 30 30 01 01 02 02
00 00 40 40 02 02 03 03 00 00
50 50 02 02 04 04 00 00 60 60
02 02 05 05 00 00 70 70 03 03
06 06 00 00 80 80 03 03 07 07
05 01 A0 01 41 01 0B 01 05 01
E0 01 81 01 0F 01 05 01 F3 01
00 01 12 01 05 01 F5 01 05 01
05 01 05 01 05 01 05 01 05 01
06 01 06 01 06 01 06 01 06 01
06 01 06 01 06 01 07 01 07 01
07 01 08 01 09 01 0A 01 0A 01
0B 01 0C 01 0D 01 0E 01 0F 01
0F 01 0F 01 0F 01 0F 01 0F 01
0F 01 0F 01 0F 01 0F 01 0F 01
0F 01 0F 01 0F 01 0F 01 0F 01
0F 01 0F 01 10 01 AA 01 01 01
00 01 00 01 00 01 01 10 01 00
00 00 00 00 00 20 01 01 01 01
01 01 00 30 01 02 02 02 02 02
00 40 02 03 03 03 03 03 00 50
02 04 04 04 04 04 00 60 02 05
05 05 05 05 00 70 03 06 06 06
06 06 00 00 00 00
`
  .trim()
  .split(/\s+/)
  .map((value) => Number.parseInt(value, 16));

if (!romArgument) {
  console.error("Usage: run-read2004.mjs /path/to/read2004.nes [frames]");
  process.exitCode = 2;
} else if (!Number.isSafeInteger(frames) || frames <= 0) {
  console.error("frames must be a positive integer");
  process.exitCode = 2;
} else {
  run(path.resolve(romArgument), frames);
}
