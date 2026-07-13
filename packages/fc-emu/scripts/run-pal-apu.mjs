import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Emulator } from "../dist/index.js";

const FRAME_COUNT = 60;
const FIXTURES = new Map([
  ["01.len_ctr.nes", "J7Qmo/zCVHk9hQEFUKIrIaNEscQ="],
  ["02.len_table.nes", "YYNbRYfPQ8bXRE0qXGUEpxhyL/A="],
  ["03.irq_flag.nes", "hpmSdSrqu2RaJqUtUX6YhLElS7A="],
  ["04.clock_jitter.nes", "8K9j42uw1+dG5fiCEriRgXEzzpM="],
  ["05.len_timing_mode0.nes", "StnSc2hykQj/eMlPdD/OKQhR12w="],
  ["06.len_timing_mode1.nes", "yW85SWbEG6tWwmP7rV//7UiXbkM="],
  ["07.irq_flag_timing.nes", "MsUTruXhQCR5IZ3nVgmMG1US5k8="],
  ["08.irq_timing.nes", "dNMYZL2dKE6NnmYhk5xuz4r40JE="],
  ["10.len_halt_timing.nes", "3ZbITvYr1b+bFycu3BuSl76Krrc="],
  ["11.len_reload_timing.nes", "/aZjf/fDkthoN9deucmLl/WicMo="],
]);

const fixtureDirectory = process.argv[2];
if (!fixtureDirectory) {
  console.error("Usage: yarn conformance:pal-apu /path/to/pal_apu_tests");
  process.exitCode = 2;
} else {
  run(path.resolve(fixtureDirectory));
}

function run(directory) {
  const results = [];
  let passed = true;
  for (const [filename, expectedSha1] of FIXTURES) {
    const romPath = path.join(directory, filename);
    if (!fs.existsSync(romPath)) {
      results.push({ filename, error: "missing fixture" });
      passed = false;
      continue;
    }

    const bytes = fs.readFileSync(romPath);
    const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const emulator = Emulator.fromRom(rom, filename, {}, { consoleRegion: "pal" });
    let execution;
    for (let frame = 0; frame < FRAME_COUNT; frame++) execution = emulator.runFrame();
    const actualSha1 = crypto
      .createHash("sha1")
      .update(execution.frame.toCanvasImageData())
      .digest("base64");
    const matches = actualSha1 === expectedSha1;
    results.push({ filename, frames: FRAME_COUNT, expectedSha1, actualSha1, matches });
    passed &&= matches;
  }

  console.log(JSON.stringify({ directory, region: "pal", passed, results }, null, 2));
  if (!passed) process.exitCode = 1;
}
