import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Bus from "../dist/domain/emulation/bus.js";
import Cartridge from "../dist/domain/model/cartridge.js";

const ROM_SHA256 = "f67d55fd6b3cf0bad1cc85f1df0d739c65b53e79cecb7fea8f77ec0eadab0004";
const LOG_SHA256 = "442c4dd5539c7e88b3fd73c7b732a7eadbd22b47c2cd9e58397ef147f64f6f8f";
const INITIAL_CYCLE_OFFSET = 7;
const INITIAL_REGISTERS = Object.freeze({ A: 0, X: 0, Y: 0, P: 0x24, SP: 0xfd, PC: 0xc000 });
const LOG_LINE =
  /^([0-9A-F]{4}).* A:([0-9A-F]{2}) X:([0-9A-F]{2}) Y:([0-9A-F]{2}) P:([0-9A-F]{2}) SP:([0-9A-F]{2}) PPU:\s*(\d+),\s*(\d+) CYC:(\d+)$/;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..", "test-roms", "external", "nes-test-roms");
const romPath = path.resolve(process.argv[2] ?? path.join(defaultRoot, "other", "nestest.nes"));
const logPath = path.resolve(process.argv[3] ?? path.join(defaultRoot, "other", "nestest.log"));
const romBytes = await readPinnedFile(romPath, ROM_SHA256);
const logBytes = await readPinnedFile(logPath, LOG_SHA256);
const lines = new TextDecoder().decode(logBytes).trim().split(/\r?\n/);
const rom = romBytes.buffer.slice(romBytes.byteOffset, romBytes.byteOffset + romBytes.byteLength);
const bus = new Bus(Cartridge.fromArrayBuffer(rom, path.basename(romPath)));
bus.CPU.state = INITIAL_REGISTERS;

for (const [index, line] of lines.entries()) {
  const expected = parseLine(line, index + 1);
  const actual = { ...bus.CPU.state, CYC: bus.CPU.cpuCycles + INITIAL_CYCLE_OFFSET };
  for (const register of ["PC", "A", "X", "Y", "P", "SP", "CYC"]) {
    if (actual[register] !== expected[register]) {
      process.stdout.write(
        `${JSON.stringify(
          {
            completed: false,
            checkedInstructions: index,
            mismatchLine: index + 1,
            field: register,
            expected,
            actual,
          },
          null,
          2,
        )}\n`,
      );
      process.exit(1);
    }
  }
  bus.update();
  while (bus.CPU.hasActiveInstruction) bus.update();
}

process.stdout.write(
  `${JSON.stringify(
    {
      rom: romPath,
      log: logPath,
      romSha256: ROM_SHA256,
      logSha256: LOG_SHA256,
      checkedInstructions: lines.length,
      finalCpuCycle: bus.CPU.cpuCycles + INITIAL_CYCLE_OFFSET,
      completed: true,
    },
    null,
    2,
  )}\n`,
);

function parseLine(line, lineNumber) {
  const match = line.match(LOG_LINE);
  if (!match) throw new Error(`Invalid nestest.log line ${lineNumber}`);
  return {
    PC: Number.parseInt(match[1], 16),
    A: Number.parseInt(match[2], 16),
    X: Number.parseInt(match[3], 16),
    Y: Number.parseInt(match[4], 16),
    P: Number.parseInt(match[5], 16),
    SP: Number.parseInt(match[6], 16),
    PPU: { scanline: Number(match[7]), dot: Number(match[8]) },
    CYC: Number(match[9]),
  };
}

async function readPinnedFile(filePath, expectedSha256) {
  const bytes = await readFile(filePath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedSha256) {
    throw new Error(`Unexpected SHA-256 for ${filePath}: ${digest}`);
  }
  return bytes;
}
