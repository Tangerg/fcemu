import { performance } from "node:perf_hooks";
import { FrameBuffer } from "../dist/domain/model/frame-buffer.js";

const WIDTH = 256;
const HEIGHT = 240;
const FRAMES = 120;

for (let index = 0; index < 3; index += 1) run(10);
const result = run(FRAMES);
process.stdout.write(
  `${JSON.stringify({ benchmark: "frame-buffer", width: WIDTH, height: HEIGHT, ...result })}\n`,
);

function run(frames) {
  const frame = new FrameBuffer(WIDTH, HEIGHT);
  let checksum = 0;
  const start = performance.now();
  for (let frameNumber = 0; frameNumber < frames; frameNumber += 1) {
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        frame.setRGBA(x, y, (0xff000000 | (frameNumber << 8) | x) >>> 0);
      }
    }
    checksum += frame.toCanvasImageData()[frameNumber % (WIDTH * HEIGHT * 4)] ?? 0;
  }
  const milliseconds = performance.now() - start;
  return {
    frames,
    milliseconds: Number(milliseconds.toFixed(3)),
    framesPerSecond: Number(((frames * 1000) / milliseconds).toFixed(1)),
    checksum,
  };
}
