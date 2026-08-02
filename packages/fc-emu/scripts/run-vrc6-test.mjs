import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Bus from "../dist/domain/emulation/bus.js";
import Cartridge from "../dist/domain/model/cartridge.js";

const MAX_FRAMES = 600;
const SETTLE_FRAMES = 3;
const COMPLETION_ADDRESS = 0x07fa;
const FAILURE_ADDRESS = 0x07fe;
const EXPECTED_FRAME_SHA256 = "4a6fbec27c2056ba7a0c7057108b01cf2166557675fd57e6e2c1fb7e8154b1eb";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(
  scriptDirectory,
  "..",
  "test-roms",
  "external",
  "nes-test-roms",
  "vrc6test",
);

const fixtures = [
  {
    fileName: "vrc6test24.nes",
    sha256: "184987c024be2c88065fdfe6932cf59d57910ee1d00720a8bb36055727e4fd03",
    mapperNumber: 24,
    board: "vrc6a",
    prgRamBytes: 0,
  },
  {
    fileName: "vrc6test26.nes",
    sha256: "c4c5517c08ee0072d0a7a2e5a446e03c4ef681980264a86fdc95f835a3330c31",
    mapperNumber: 26,
    board: "vrc6b",
    prgRamBytes: 8192,
  },
];

const results = fixtures.map(runFixture);
const passed = results.every((result) => result.passed);
console.log(JSON.stringify({ passed, results }, null, 2));
if (!passed) process.exitCode = 1;

function runFixture(fixture) {
  const romPath = path.join(fixtureDirectory, fixture.fileName);
  const bytes = fs.readFileSync(romPath);
  const fixtureSha256 = sha256(bytes);
  if (fixtureSha256 !== fixture.sha256) {
    throw new Error(
      `${fixture.fileName} SHA-256 changed: expected ${fixture.sha256}, received ${fixtureSha256}`,
    );
  }

  const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const cartridge = Cartridge.fromArrayBuffer(rom, fixture.fileName);
  const bus = new Bus(cartridge);
  let frames = 0;
  while (frames < MAX_FRAMES && bus.CPU.readByte(COMPLETION_ADDRESS) !== 0x40) {
    bus.updateFrame();
    frames++;
  }
  const completed = bus.CPU.readByte(COMPLETION_ADDRESS) === 0x40;
  if (completed) {
    for (let frame = 0; frame < SETTLE_FRAMES; frame++) {
      bus.updateFrame();
      frames++;
    }
  }

  const failure = bus.CPU.readByte(FAILURE_ADDRESS);
  const frameSha256 = sha256(bus.PPU.front.toCanvasImageData());
  const mapperState = bus.Mapper.captureState();
  const passed =
    completed &&
    failure === 0 &&
    frameSha256 === EXPECTED_FRAME_SHA256 &&
    cartridge.mapperNumber === fixture.mapperNumber &&
    cartridge.prgRamBytes === fixture.prgRamBytes &&
    mapperState.kind === "vrc6" &&
    mapperState.board === fixture.board &&
    JSON.stringify(mapperState.chrBanks) === JSON.stringify([16, 17, 18, 19, 20, 21, 22, 23]) &&
    mapperState.ppuMode === 0x20;

  return {
    fileName: fixture.fileName,
    fixtureSha256,
    mapperNumber: cartridge.mapperNumber,
    board: mapperState.kind === "vrc6" ? mapperState.board : mapperState.kind,
    prgRamBytes: cartridge.prgRamBytes,
    frames,
    completed,
    failure,
    failureDetails:
      failure === 0
        ? undefined
        : {
            ppuMode: bus.CPU.readByte(0x07fd),
            ppuBank: bus.CPU.readByte(0x07fc),
            expected: bus.CPU.readByte(0x07f7),
            received: bus.CPU.readByte(0x07f6),
          },
    frameSha256,
    expectedFrameSha256: EXPECTED_FRAME_SHA256,
    mapperState,
    passed,
  };
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
