import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Bus from "../dist/domain/emulation/bus.js";
import Cartridge from "../dist/domain/model/cartridge.js";

const RESULT_ADDRESS = 0x6000;
const SIGNATURE = [0xde, 0xb0, 0x61];
const MESSAGE_ADDRESS = 0x6004;
const DEFAULT_MAX_FRAMES = 3600;

const romArgument = process.argv[2];
const maxFrames = Number.parseInt(process.argv[3] ?? `${DEFAULT_MAX_FRAMES}`, 10);
const consoleRegion = process.argv[4];
const protocol = process.argv[5] ?? "blargg";
const validRegions = new Set(["ntsc", "pal", "dendy"]);
const validProtocols = new Set(["blargg", "zero-page"]);

if (!romArgument) {
  console.error(
    "Usage: yarn conformance:rom <rom.nes> [max-frames] [ntsc|pal|dendy] [blargg|zero-page]",
  );
  process.exitCode = 2;
} else if (!Number.isSafeInteger(maxFrames) || maxFrames <= 0) {
  console.error("max-frames must be a positive integer");
  process.exitCode = 2;
} else if (consoleRegion !== undefined && !validRegions.has(consoleRegion)) {
  console.error("region must be ntsc, pal or dendy");
  process.exitCode = 2;
} else if (!validProtocols.has(protocol)) {
  console.error("protocol must be blargg or zero-page");
  process.exitCode = 2;
} else {
  run(path.resolve(romArgument), maxFrames, consoleRegion, protocol);
}

function run(romPath, frameLimit, region, resultProtocol) {
  const bytes = fs.readFileSync(romPath);
  const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const bus = new Bus(Cartridge.fromArrayBuffer(rom, path.basename(romPath)), 44_100, region);

  if (resultProtocol === "zero-page") {
    runZeroPageProtocol(bus, romPath, frameLimit);
    return;
  }

  let frame = 0;
  let hasSignature = false;
  let status = 0x80;
  let resetRequestedAt;
  let resetHandledForRequest = false;
  let resets = 0;
  for (; frame < frameLimit; frame++) {
    bus.updateFrame();
    hasSignature = SIGNATURE.every(
      (expected, index) => bus.Mapper.read(RESULT_ADDRESS + index + 1) === expected,
    );
    status = bus.Mapper.read(RESULT_ADDRESS);
    if (hasSignature && status === 0x81) {
      if (resetHandledForRequest) continue;
      resetRequestedAt ??= frame;
      if (frame - resetRequestedAt >= 6) {
        bus.reset();
        resetRequestedAt = undefined;
        resetHandledForRequest = true;
        resets++;
      }
      continue;
    }
    resetHandledForRequest = false;
    if (hasSignature && status < 0x80) break;
  }

  const message = hasSignature ? readZeroTerminatedText(bus, MESSAGE_ADDRESS) : "";
  console.log(
    JSON.stringify(
      {
        rom: romPath,
        region: bus.Timing.region,
        frames: frame,
        resets,
        status,
        message,
        completed: hasSignature && status < 0x80,
      },
      null,
      2,
    ),
  );

  if (!hasSignature || status >= 0x80) process.exitCode = 2;
  else if (status !== 0) process.exitCode = 1;
}

function runZeroPageProtocol(bus, romPath, frameLimit) {
  for (let frame = 0; frame < frameLimit; frame++) bus.updateFrame();
  const status = bus.CPU.readByte(0x00f8);
  console.log(
    JSON.stringify(
      {
        rom: romPath,
        region: bus.Timing.region,
        frames: frameLimit,
        status,
        completed: status !== 0,
      },
      null,
      2,
    ),
  );
  if (status === 0) process.exitCode = 2;
  else if (status !== 1) process.exitCode = 1;
}

function readZeroTerminatedText(bus, startAddress) {
  const bytes = [];
  for (let address = startAddress; address <= 0x7fff; address++) {
    const value = bus.Mapper.read(address);
    if (value === 0) break;
    bytes.push(value);
  }
  return new TextDecoder().decode(Uint8Array.from(bytes)).trim();
}
