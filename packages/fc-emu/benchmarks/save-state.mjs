import { performance } from "node:perf_hooks";
import { Emulator } from "../dist/index.js";

const CAPTURES = 40;
const RESTORES = 200;
const emulator = Emulator.fromRom(createRenderingRom(), "save-state-benchmark.nes");
for (let frame = 0; frame < 30; frame++) emulator.runFrame();

let snapshot = emulator.captureSaveState();
const captureStart = performance.now();
for (let iteration = 0; iteration < CAPTURES; iteration++) snapshot = emulator.captureSaveState();
const captureMilliseconds = performance.now() - captureStart;

const restoreStart = performance.now();
for (let iteration = 0; iteration < RESTORES; iteration++) emulator.restoreSaveState(snapshot);
const restoreMilliseconds = performance.now() - restoreStart;

process.stdout.write(
  `${JSON.stringify({
    benchmark: "save-state",
    bytes: countTypedArrayBytes(snapshot),
    captures: CAPTURES,
    captureMilliseconds: Number(captureMilliseconds.toFixed(3)),
    captureMillisecondsEach: Number((captureMilliseconds / CAPTURES).toFixed(3)),
    restores: RESTORES,
    restoreMilliseconds: Number(restoreMilliseconds.toFixed(3)),
    restoreMillisecondsEach: Number((restoreMilliseconds / RESTORES).toFixed(3)),
  })}\n`,
);

function countTypedArrayBytes(value, visited = new Set()) {
  if (!value || typeof value !== "object" || visited.has(value)) return 0;
  visited.add(value);
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return Object.values(value).reduce(
    (total, nested) => total + countTypedArrayBytes(nested, visited),
    0,
  );
}

function createRenderingRom() {
  const headerBytes = 16;
  const prgBytes = 16_384;
  const bytes = new Uint8Array(headerBytes + prgBytes);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, 1, 0]);
  bytes.set([0xa9, 0x08, 0x8d, 0x01, 0x20, 0x4c, 0x05, 0x80], headerBytes);
  bytes.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], bytes.byteLength - 6);
  return bytes.buffer;
}
