import { performance } from "node:perf_hooks";
import { Emulator } from "../dist/index.js";

const WARMUP_FRAMES = 30;
const MEASURED_FRAMES = 300;
const emulator = Emulator.fromRom(createRenderingRom(), "benchmark.nes");

for (let frame = 0; frame < WARMUP_FRAMES; frame++) emulator.runFrame();
const start = performance.now();
for (let frame = 0; frame < MEASURED_FRAMES; frame++) emulator.runFrame();
const milliseconds = performance.now() - start;

process.stdout.write(
  `${JSON.stringify({
    benchmark: "emulator-frame",
    frames: MEASURED_FRAMES,
    milliseconds: Number(milliseconds.toFixed(3)),
    framesPerSecond: Number(((MEASURED_FRAMES * 1000) / milliseconds).toFixed(1)),
    cpuCycles: emulator.diagnostics.cpuCycles,
  })}\n`,
);

function createRenderingRom() {
  const headerBytes = 16;
  const prgBytes = 16_384;
  const bytes = new Uint8Array(headerBytes + prgBytes);
  bytes.set([0x4e, 0x45, 0x53, 0x1a, 1, 0]);
  bytes.set(
    [
      0xa9,
      0x08, // LDA #$08
      0x8d,
      0x01,
      0x20, // STA $2001 — enable background rendering
      0x4c,
      0x05,
      0x80, // JMP $8005
    ],
    headerBytes,
  );
  const vectors = bytes.byteLength - 6;
  bytes.set([0x00, 0x80, 0x00, 0x80, 0x00, 0x80], vectors);
  return bytes.buffer;
}
