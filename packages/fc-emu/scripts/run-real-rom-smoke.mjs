import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ControllerButton, Emulator } from "../dist/index.js";
import { REAL_ROM_PROFILES, validateRealRomProfiles } from "./real-rom-profiles.mjs";

const AUDIO_SAMPLE_RATE = 44_100;
const BUTTONS = Object.freeze({
  a: ControllerButton.A,
  b: ControllerButton.B,
  select: ControllerButton.Select,
  start: ControllerButton.Start,
  up: ControllerButton.Up,
  down: ControllerButton.Down,
  left: ControllerButton.Left,
  right: ControllerButton.Right,
});

validateRealRomProfiles(REAL_ROM_PROFILES, Object.keys(BUTTONS));

const profileArgument = process.argv[2];
const romArgument = process.argv[3];

if (profileArgument === "--list") {
  console.log(
    Object.entries(REAL_ROM_PROFILES)
      .map(([id, profile]) => `${id}\t${profile.fileName}\t${profile.title}`)
      .join("\n"),
  );
} else if (!profileArgument || !romArgument) {
  printUsage();
  process.exitCode = 2;
} else if (profileArgument === "all") {
  runAll(path.resolve(romArgument));
} else {
  const profile = REAL_ROM_PROFILES[profileArgument];
  if (!profile) {
    console.error(`Unknown real-ROM profile: ${profileArgument}`);
    printUsage();
    process.exitCode = 2;
  } else {
    runOne(profileArgument, profile, path.resolve(romArgument));
  }
}

function runAll(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`Real-ROM smoke path is not a directory: ${directory}`);
    process.exitCode = 2;
    return;
  }

  const results = Object.entries(REAL_ROM_PROFILES).map(([id, profile]) =>
    executeProfile(id, profile, path.join(directory, profile.fileName)),
  );
  printResults(results);
}

function runOne(id, profile, romPath) {
  printResults([executeProfile(id, profile, romPath)]);
}

function executeProfile(id, profile, romPath) {
  const failures = [];
  let bytes;
  try {
    bytes = fs.readFileSync(romPath);
  } catch (error) {
    return {
      id,
      title: profile.title,
      rom: romPath,
      passed: false,
      failures: [`Unable to read ROM: ${toErrorMessage(error)}`],
    };
  }

  const fixtureSha256 = sha256(bytes);
  if (fixtureSha256 !== profile.sha256) {
    return {
      id,
      title: profile.title,
      rom: romPath,
      sha256: fixtureSha256,
      passed: false,
      failures: [`fixture SHA-256: expected ${profile.sha256}, received ${fixtureSha256}`],
    };
  }

  const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const metadataEmulator = Emulator.fromRom(rom.slice(0), profile.fileName);
  for (const [name, expected] of Object.entries(profile.cartridge)) {
    checkEqual(failures, `cartridge.${name}`, metadataEmulator.cartridge[name], expected);
  }
  checkEqual(failures, "cpuHalted after boot", metadataEmulator.diagnostics.cpuHalted, false);

  const baseline = runScenario(
    rom,
    profile.fileName,
    profile.baseline.frames,
    [],
    [],
    false,
    Object.keys(profile.baseline.mapperCheckpoints ?? {}).map(Number),
  );
  checkMinimum(
    failures,
    "baseline distinct frames",
    baseline.distinctFrames,
    profile.baseline.minimumDistinctFrames,
  );
  checkEqual(
    failures,
    "baseline final frame SHA-256",
    baseline.finalFrameSha256,
    profile.baseline.finalFrameSha256,
  );
  checkEqual(
    failures,
    "baseline frame-sequence SHA-256",
    baseline.frameSequenceSha256,
    profile.baseline.frameSequenceSha256,
  );
  checkEqual(failures, "baseline CPU cycles", baseline.cpuCycles, profile.baseline.cpuCycles);
  checkMapperCheckpoints(
    failures,
    "baseline",
    baseline.mapperCheckpoints,
    profile.baseline.mapperCheckpoints,
  );

  const interactive = runScenario(
    rom,
    profile.fileName,
    profile.interactive.frames,
    profile.interactive.events,
    Object.keys(profile.interactive.checkpoints).map(Number),
    true,
    Object.keys(profile.interactive.mapperCheckpoints ?? {}).map(Number),
  );
  checkMinimum(
    failures,
    "interactive distinct frames",
    interactive.distinctFrames,
    profile.interactive.minimumDistinctFrames,
  );
  checkEqual(
    failures,
    "interactive final frame SHA-256",
    interactive.finalFrameSha256,
    profile.interactive.finalFrameSha256,
  );
  checkEqual(
    failures,
    "interactive frame-sequence SHA-256",
    interactive.frameSequenceSha256,
    profile.interactive.frameSequenceSha256,
  );
  checkEqual(
    failures,
    "interactive audio samples",
    interactive.audioSamples,
    profile.interactive.audioSamples,
  );
  checkEqual(
    failures,
    "interactive audio SHA-256",
    interactive.audioSha256,
    profile.interactive.audioSha256,
  );
  checkEqual(
    failures,
    "interactive CPU cycles",
    interactive.cpuCycles,
    profile.interactive.cpuCycles,
  );
  for (const [frame, expected] of Object.entries(profile.interactive.checkpoints)) {
    checkEqual(
      failures,
      `interactive frame ${frame} SHA-256`,
      interactive.checkpoints[frame],
      expected,
    );
  }
  checkMapperCheckpoints(
    failures,
    "interactive",
    interactive.mapperCheckpoints,
    profile.interactive.mapperCheckpoints,
  );

  const replay = runReplay(rom, profile.fileName, profile.interactive.events, profile.replay);
  checkEqual(
    failures,
    "replay frame-sequence SHA-256",
    replay.first.frameSequenceSha256,
    profile.replay.frameSequenceSha256,
  );
  checkEqual(
    failures,
    "replay audio samples",
    replay.first.audioSamples,
    profile.replay.audioSamples,
  );
  checkEqual(
    failures,
    "replay audio SHA-256",
    replay.first.audioSha256,
    profile.replay.audioSha256,
  );
  checkEqual(failures, "replay CPU cycles", replay.first.cpuCycles, profile.replay.cpuCycles);
  checkEqual(failures, "restored replay", replay.second, replay.first);

  return {
    id,
    title: profile.title,
    rom: romPath,
    sha256: fixtureSha256,
    cartridge: metadataEmulator.cartridge,
    baseline,
    interactive,
    replay: replay.first,
    passed: failures.length === 0,
    failures,
  };
}

function runScenario(
  rom,
  sourceName,
  frames,
  events,
  checkpointFrames = [],
  captureAudio = false,
  mapperCheckpointFrames = [],
) {
  const samples = [];
  const outputs = captureAudio
    ? { audio: { sampleRate: AUDIO_SAMPLE_RATE, writeSample: (sample) => samples.push(sample) } }
    : {};
  const emulator = Emulator.fromRom(rom.slice(0), sourceName, outputs);
  const frameSequence = crypto.createHash("sha256");
  const distinctFrames = new Set();
  const checkpoints = {};
  const mapperCheckpoints = {};
  let finalFrameSha256 = "";

  for (let frame = 1; frame <= frames; frame++) {
    applyInputEvents(emulator, events, frame);
    const execution = emulator.runFrame();
    const pixels = execution.frame.toCanvasImageData();
    finalFrameSha256 = sha256(pixels);
    distinctFrames.add(finalFrameSha256);
    frameSequence.update(pixels);
    if (checkpointFrames.includes(frame)) checkpoints[frame] = finalFrameSha256;
    if (mapperCheckpointFrames.includes(frame)) {
      mapperCheckpoints[frame] = emulator.captureSaveState().state.mapper;
    }
  }

  return {
    frames,
    distinctFrames: distinctFrames.size,
    finalFrameSha256,
    frameSequenceSha256: frameSequence.digest("hex"),
    audioSamples: samples.length,
    audioSha256: captureAudio ? hashAudio(samples) : undefined,
    cpuCycles: emulator.diagnostics.cpuCycles,
    checkpoints,
    mapperCheckpoints,
  };
}

function runReplay(rom, sourceName, events, replay) {
  let samples = [];
  const emulator = Emulator.fromRom(rom.slice(0), sourceName, {
    audio: { sampleRate: AUDIO_SAMPLE_RATE, writeSample: (sample) => samples.push(sample) },
  });
  for (let frame = 1; frame <= replay.checkpointFrame; frame++) {
    applyInputEvents(emulator, events, frame);
    emulator.runFrame();
  }

  const snapshot = emulator.captureSaveState();
  samples = [];
  const first = runReplaySegment(emulator, events, replay, samples);
  emulator.restoreSaveState(snapshot);
  samples = [];
  const second = runReplaySegment(emulator, events, replay, samples);
  return { first, second };
}

function runReplaySegment(emulator, events, replay, samples) {
  const frameSequence = crypto.createHash("sha256");
  let cpuCycles = 0;
  const finalFrame = replay.checkpointFrame + replay.frames;
  for (let frame = replay.checkpointFrame + 1; frame <= finalFrame; frame++) {
    applyInputEvents(emulator, events, frame);
    const execution = emulator.runFrame();
    cpuCycles += execution.cpuCycles;
    frameSequence.update(execution.frame.toCanvasImageData());
  }
  return {
    frames: replay.frames,
    frameSequenceSha256: frameSequence.digest("hex"),
    audioSamples: samples.length,
    audioSha256: hashAudio(samples),
    cpuCycles,
    diagnostics: emulator.diagnostics,
  };
}

function applyInputEvents(emulator, events, frame) {
  for (const event of events) {
    if (event.frame !== frame) continue;
    if (Object.hasOwn(event, "coin")) {
      emulator.insertCoin(event.coin);
      continue;
    }
    if (Object.hasOwn(event, "tablet")) {
      emulator.setOekaKidsTabletInput(event.tablet);
      continue;
    }
    emulator.setControllerButton(1, BUTTONS[event.button], event.pressed);
  }
}

function hashAudio(samples) {
  const bytes = Buffer.allocUnsafe(samples.length * Float64Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < samples.length; index++) {
    bytes.writeDoubleLE(samples[index] ?? 0, index * Float64Array.BYTES_PER_ELEMENT);
  }
  return sha256(bytes);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function checkEqual(failures, label, actual, expected) {
  if (typeof expected === "object" && expected !== null) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(
        `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
      );
    }
    return;
  }
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual}`);
}

function checkMinimum(failures, label, actual, expected) {
  if (actual < expected)
    failures.push(`${label}: expected at least ${expected}, received ${actual}`);
}

function checkMapperCheckpoints(failures, scenarioName, actual, expected = {}) {
  for (const [frame, state] of Object.entries(expected)) {
    checkEqual(failures, `${scenarioName} frame ${frame} mapper state`, actual[frame], state);
  }
}

function printResults(results) {
  const passed = results.every((result) => result.passed);
  console.log(JSON.stringify({ passed, results }, null, 2));
  if (!passed) process.exitCode = 1;
}

function printUsage() {
  const profileIds = Object.keys(REAL_ROM_PROFILES).join("|");
  console.error(
    `Usage: yarn smoke:real-rom -- <${profileIds}> /path/to/file.nes\n` +
      "       yarn smoke:real-rom -- all /path/to/rom-directory\n" +
      "       yarn smoke:real-rom -- --list",
  );
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown file error";
}
