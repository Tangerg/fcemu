import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(scriptDirectory, "..", "test-roms", "external", "nes-test-roms");

const tasks = [
  { name: "nestest CPU trace", script: "run-nestest.mjs", arguments: [] },
  { name: "CPU timing screen", script: "run-cpu-timing-test.mjs", arguments: [] },
  blarggTask("official instructions", "instr_test-v5/official_only.nes", 3600),
  blarggTask("all instructions", "instr_test-v5/all_instrs.nes", 3600),
  blarggTask("PPU VBL/NMI", "ppu_vbl_nmi/ppu_vbl_nmi.nes", 3600),
  blarggTask("APU", "apu_test/apu_test.nes", 3600),
  blarggTask("Sprite/DMC DMA", "sprdma_and_dmc_dma/sprdma_and_dmc_dma.nes", 1800),
  blarggTask("Sprite/DMC DMA 512", "sprdma_and_dmc_dma/sprdma_and_dmc_dma_512.nes", 1800),
  { name: "VRC6 CHR/nametable matrix", script: "run-vrc6-test.mjs", arguments: [] },
];

let completed = 0;
let failure;
for (const task of tasks) {
  process.stdout.write(`[conformance:fixtures] ${task.name}\n`);
  const result = spawnSync(
    process.execPath,
    [path.join(scriptDirectory, task.script), ...task.arguments],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    failure = { name: task.name, status: result.status, signal: result.signal };
    break;
  }
  completed++;
}

process.stdout.write(
  `${JSON.stringify(
    {
      fixtureRoot,
      completed,
      total: tasks.length,
      passed: failure === undefined,
      failure,
    },
    null,
    2,
  )}\n`,
);
if (failure) process.exitCode = failure.status ?? 1;

function blarggTask(name, relativePath, maxFrames) {
  return {
    name,
    script: "run-blargg-rom.mjs",
    arguments: [path.join(fixtureRoot, relativePath), `${maxFrames}`, "ntsc", "blargg"],
  };
}
