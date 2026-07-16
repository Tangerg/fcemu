import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ControllerButton, Emulator } from "../dist/index.js";

const AUDIO_SAMPLE_RATE = 44_100;
const BUTTONS = Object.freeze({
  a: ControllerButton.A,
  b: ControllerButton.B,
  start: ControllerButton.Start,
  right: ControllerButton.Right,
});

const PROFILES = Object.freeze({
  mario: {
    title: "Super Mario Bros.",
    fileName: "MARIO.NES",
    sha256: "e9d2cc78600d4b765eca41b87eaa2b8f593d5bad5d71d2f3d6b43c5092e5705b",
    cartridge: {
      format: "ines",
      mapperNumber: 0,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      prgRomBytes: 32_768,
      chrRomBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 300,
      minimumDistinctFrames: 5,
      finalFrameSha256: "b4c7057486daed529336c7fe1dd25aced70dc52d69e2a03ed5c719fd1263776f",
      frameSequenceSha256: "2c6ace828b77c3db039128cf89d86582983d983f306581e3139c7ce8a19bd3f6",
      cpuCycles: 8_906_762,
    },
    interactive: {
      frames: 600,
      minimumDistinctFrames: 200,
      events: [
        { frame: 121, button: "start", pressed: true },
        { frame: 123, button: "start", pressed: false },
        { frame: 360, button: "right", pressed: true },
        { frame: 380, button: "b", pressed: true },
        { frame: 400, button: "a", pressed: true },
        { frame: 405, button: "a", pressed: false },
        { frame: 460, button: "b", pressed: false },
        { frame: 500, button: "right", pressed: false },
      ],
      checkpoints: {
        180: "1c752ddfb0a65ff9d0182f3c025ea405f1aaded5cdb5d7d966e0574542b9fa5f",
        360: "cc6f2144c95953301bbc04e2af347cca6e32e5ec3ccd886486afc057ff6a5afc",
        480: "56ecac0439c2b4172108813c625d639739e16665f944a255a38c8899b1108e21",
        600: "b8b92e568cc24128f7e22e737d7bc23127ec21a814e8154d19c5861fe3b56589",
      },
      finalFrameSha256: "b8b92e568cc24128f7e22e737d7bc23127ec21a814e8154d19c5861fe3b56589",
      frameSequenceSha256: "f06f9d2a24e439b4d6248536650c85c5aaad6160235630b68fb041e4b5dc3fb6",
      audioSamples: 439_600,
      audioSha256: "1223eb22c160441e2ebf31b5f439619736101cfad238b11604e662e38e9c6c41",
      cpuCycles: 17_840_916,
    },
    replay: {
      checkpointFrame: 360,
      frames: 120,
      frameSequenceSha256: "5ed0edb432c786c4ed09fa094ade4b5f11216b184c21a9248702c76d901b0589",
      audioSamples: 88_055,
      audioSha256: "b225ec47786768d39cf723faa656d0adeb602ab7fe76f9eed57ecac92b993114",
      cpuCycles: 3_573_660,
    },
  },
  contra: {
    title: "Contra",
    fileName: "CONTRA.NES",
    sha256: "26541a5550ee22deeb3d5484e4a96130219b58cff74d068fb1eb6567fa5e5519",
    cartridge: {
      format: "ines",
      mapperNumber: 2,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      prgRomBytes: 131_072,
      chrRomBytes: 0,
      hasWritableChrMemory: true,
    },
    baseline: {
      frames: 300,
      minimumDistinctFrames: 200,
      finalFrameSha256: "afc7b953c0ad2c909a9fbf260c271132349b6f108ddc6e4732b06f75e91c0ff3",
      frameSequenceSha256: "c6ad3c38442b03afcd954f74ce3a852c95f861ea76092e0396ddf2adb49ce416",
      cpuCycles: 8_906_759,
    },
    interactive: {
      frames: 720,
      minimumDistinctFrames: 220,
      events: [
        { frame: 301, button: "start", pressed: true },
        { frame: 303, button: "start", pressed: false },
        { frame: 480, button: "right", pressed: true },
        { frame: 500, button: "b", pressed: true },
        { frame: 510, button: "b", pressed: false },
        { frame: 520, button: "a", pressed: true },
        { frame: 525, button: "a", pressed: false },
        { frame: 580, button: "right", pressed: false },
      ],
      checkpoints: {
        300: "afc7b953c0ad2c909a9fbf260c271132349b6f108ddc6e4732b06f75e91c0ff3",
        420: "de1cf642a7d5eda9f6132d8acf6f3c739821e7aecdb446ac3a350e4cbd18af90",
        480: "0c134ad93c9cdb7116b05d58013f215cbcf72afc5dc94c1077e9ee87cea2778e",
        600: "44dd2a230d41e2cec6dfec1a49bf083e59d32fbfc3c06897d1bc50ebfc76bd3b",
      },
      finalFrameSha256: "44dd2a230d41e2cec6dfec1a49bf083e59d32fbfc3c06897d1bc50ebfc76bd3b",
      frameSequenceSha256: "149651da830584fbd34fd71c18accfc4fde2f06a68b3b12f765f1c3ba415d5e1",
      audioSamples: 527_654,
      audioSha256: "893606d1dd8e44bf2fd64b9f024ad642ce79c99ef24edb9e5eeed12dcc900a53",
      cpuCycles: 21_414_570,
    },
    replay: {
      checkpointFrame: 480,
      frames: 120,
      frameSequenceSha256: "ba8509c1b2cdb8cd804bb3a3cae194f9af3a557a938b113f3778568c3fb31957",
      audioSamples: 88_055,
      audioSha256: "4ac1bc6bc55150b70605c7c6bdbbe86124501fa270c9519e7bb4357290c12064",
      cpuCycles: 3_573_661,
    },
  },
});

const profileArgument = process.argv[2];
const romArgument = process.argv[3];

if (profileArgument === "--list") {
  console.log(
    Object.entries(PROFILES)
      .map(([id, profile]) => `${id}\t${profile.fileName}\t${profile.title}`)
      .join("\n"),
  );
} else if (!profileArgument || !romArgument) {
  printUsage();
  process.exitCode = 2;
} else if (profileArgument === "all") {
  runAll(path.resolve(romArgument));
} else {
  const profile = PROFILES[profileArgument];
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

  const results = Object.entries(PROFILES).map(([id, profile]) =>
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

  const baseline = runScenario(rom, profile.fileName, profile.baseline.frames, []);
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

  const interactive = runScenario(
    rom,
    profile.fileName,
    profile.interactive.frames,
    profile.interactive.events,
    Object.keys(profile.interactive.checkpoints).map(Number),
    true,
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

function runScenario(rom, sourceName, frames, events, checkpointFrames = [], captureAudio = false) {
  const samples = [];
  const outputs = captureAudio
    ? { audio: { sampleRate: AUDIO_SAMPLE_RATE, writeSample: (sample) => samples.push(sample) } }
    : {};
  const emulator = Emulator.fromRom(rom.slice(0), sourceName, outputs);
  const frameSequence = crypto.createHash("sha256");
  const distinctFrames = new Set();
  const checkpoints = {};
  let finalFrameSha256 = "";

  for (let frame = 1; frame <= frames; frame++) {
    applyInputEvents(emulator, events, frame);
    const execution = emulator.runFrame();
    const pixels = execution.frame.toCanvasImageData();
    finalFrameSha256 = sha256(pixels);
    distinctFrames.add(finalFrameSha256);
    frameSequence.update(pixels);
    if (checkpointFrames.includes(frame)) checkpoints[frame] = finalFrameSha256;
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

function printResults(results) {
  const passed = results.every((result) => result.passed);
  console.log(JSON.stringify({ passed, results }, null, 2));
  if (!passed) process.exitCode = 1;
}

function printUsage() {
  console.error(
    "Usage: yarn smoke:real-rom -- <mario|contra> /path/to/file.nes\n" +
      "       yarn smoke:real-rom -- all /path/to/rom-directory\n" +
      "       yarn smoke:real-rom -- --list",
  );
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown file error";
}
