import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Bus from "../dist/domain/emulation/bus.js";
import Cartridge from "../dist/domain/model/cartridge.js";

const EXPECTED_SHA256 = "898aedd850fb220cb5a915322b3077e260bd7819a87cef84d149df171329b5c1";
const OPEN_BUS_RESULT = 0x0408;
const INTERNAL_BUS_RESULT = 0x0490;
const SUDDENLY_RESIZE_SPRITE_RESULT = 0x0489;
const CONTROLLER_STROBING_RESULT = 0x045f;
const INC_OAM_DMA_RESULT = 0x0480;
const DMA_PPUSTATUS_READ_RESULT = 0x0488;
const DMC_DMA_BUS_CONFLICT_RESULT = 0x046b;
const INTERRUPT_FLAG_LATENCY_RESULT = 0x0461;
const UNSTABLE_STORE_TESTS = [
  { name: "shaIndirectY", row: 0, resultAddress: 0x0446 },
  { name: "shaAbsoluteY", row: 1, resultAddress: 0x0447 },
  { name: "shsAbsoluteY", row: 2, resultAddress: 0x0448 },
  { name: "shyAbsoluteX", row: 3, resultAddress: 0x0449 },
  { name: "shxAbsoluteY", row: 4, resultAddress: 0x044a },
  { name: "laeAbsoluteY", row: 5, resultAddress: 0x044b },
];
const PASS = 1;
const IN_PROGRESS = 3;
const BOOT_FRAMES = 120;
const RESULT_FRAME_LIMIT = 3000;
const BUTTON_A = 0;
const BUTTON_DOWN = 5;
const BUTTON_LEFT = 6;

const romArgument = process.argv[2];
if (!romArgument) {
  console.error("Usage: yarn conformance:accuracy-coin /path/to/AccuracyCoin.nes");
  process.exitCode = 2;
} else {
  run(path.resolve(romArgument));
}

function run(romPath) {
  const bytes = fs.readFileSync(romPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== EXPECTED_SHA256) {
    console.error(`Unsupported AccuracyCoin fixture SHA-256: ${sha256}`);
    process.exitCode = 2;
    return;
  }
  const rom = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const openBus = createBus(rom, romPath);
  boot(openBus);
  tap(openBus, BUTTON_A);
  const openBusResult = waitForResult(openBus, OPEN_BUS_RESULT);

  const internalBus = createBus(rom, romPath);
  selectTest(internalBus, 1, 4);
  const internalBusResult = waitForResult(internalBus, INTERNAL_BUS_RESULT);

  const suddenlyResizeSprite = createBus(rom, romPath);
  selectTest(suddenlyResizeSprite, 3, 3);
  const suddenlyResizeSpriteResult = waitForResult(
    suddenlyResizeSprite,
    SUDDENLY_RESIZE_SPRITE_RESULT,
  );

  const controllerStrobing = createBus(rom, romPath);
  selectTest(controllerStrobing, 7, 7);
  const controllerStrobingResult = waitForResult(controllerStrobing, CONTROLLER_STROBING_RESULT);

  const incOamDma = createBus(rom, romPath);
  selectTest(incOamDma, 3, 8);
  const incOamDmaResult = waitForResult(incOamDma, INC_OAM_DMA_RESULT);

  const dmaPpuStatusRead = createBus(rom, romPath);
  selectTest(dmaPpuStatusRead, 8, 1);
  const dmaPpuStatusReadResult = waitForResult(dmaPpuStatusRead, DMA_PPUSTATUS_READ_RESULT);

  const dmcDmaBusConflict = createBus(rom, romPath);
  selectTest(dmcDmaBusConflict, 8, 6);
  const dmcDmaBusConflictResult = waitForResult(dmcDmaBusConflict, DMC_DMA_BUS_CONFLICT_RESULT);

  const interruptFlagLatency = createBus(rom, romPath);
  selectTest(interruptFlagLatency, 9, 0);
  const interruptFlagLatencyResult = waitForResult(
    interruptFlagLatency,
    INTERRUPT_FLAG_LATENCY_RESULT,
  );

  const unstableStores = Object.fromEntries(
    UNSTABLE_STORE_TESTS.map(({ name, row, resultAddress }) => {
      const bus = createBus(rom, romPath);
      selectTest(bus, 11, row);
      const result = waitForResult(bus, resultAddress);
      return [name, { ...result, passed: isPassingResult(result.result) }];
    }),
  );

  const testResults = [
    openBusResult,
    internalBusResult,
    suddenlyResizeSpriteResult,
    controllerStrobingResult,
    incOamDmaResult,
    dmaPpuStatusReadResult,
    dmcDmaBusConflictResult,
    interruptFlagLatencyResult,
    ...Object.values(unstableStores),
  ];
  const complete = testResults.every(({ result }) => result !== 0 && result !== IN_PROGRESS);
  const passed = complete && testResults.every(({ result }) => isPassingResult(result));
  console.log(
    JSON.stringify(
      {
        rom: romPath,
        sha256,
        openBus: { ...openBusResult, passed: openBusResult.result === PASS },
        internalBus: { ...internalBusResult, passed: internalBusResult.result === PASS },
        suddenlyResizeSprite: {
          ...suddenlyResizeSpriteResult,
          passed: suddenlyResizeSpriteResult.result === PASS,
        },
        controllerStrobing: {
          ...controllerStrobingResult,
          passed: controllerStrobingResult.result === PASS,
        },
        incOamDma: {
          ...incOamDmaResult,
          passed: incOamDmaResult.result === PASS,
        },
        dmaPpuStatusRead: {
          ...dmaPpuStatusReadResult,
          passed: isPassingResult(dmaPpuStatusReadResult.result),
        },
        dmcDmaBusConflict: {
          ...dmcDmaBusConflictResult,
          passed: isPassingResult(dmcDmaBusConflictResult.result),
        },
        interruptFlagLatency: {
          ...interruptFlagLatencyResult,
          passed: interruptFlagLatencyResult.result === PASS,
        },
        unstableStores,
        passed,
      },
      null,
      2,
    ),
  );
  if (!complete) process.exitCode = 2;
  else if (!passed) process.exitCode = 1;
}

function isPassingResult(result) {
  return result !== IN_PROGRESS && (result & 1) === PASS;
}

function createBus(rom, romPath) {
  return new Bus(Cartridge.fromArrayBuffer(rom.slice(0), path.basename(romPath)));
}

function boot(bus) {
  advanceFrames(bus, BOOT_FRAMES);
}

function selectTest(bus, pagesLeft, row) {
  boot(bus);
  for (let page = 0; page < pagesLeft; page++) {
    tap(bus, BUTTON_LEFT);
    advanceFrames(bus, 4);
  }
  for (let move = 0; move <= row; move++) tap(bus, BUTTON_DOWN);
  const expectedPage = 20 - pagesLeft;
  if (bus.RAM[0x14] !== expectedPage || bus.RAM[0x16] !== row) {
    throw new Error("AccuracyCoin menu layout does not match the pinned fixture");
  }
  tap(bus, BUTTON_A);
}

function advanceFrames(bus, count) {
  for (let frame = 0; frame < count; frame++) bus.updateFrame();
}

function tap(bus, button) {
  const state = Array(8).fill(false);
  state[button] = true;
  bus.Controller1.buttonsState = state;
  bus.updateFrame();
  bus.Controller1.buttonsState = Array(8).fill(false);
  bus.updateFrame();
}

function waitForResult(bus, address) {
  for (let frames = 0; frames < RESULT_FRAME_LIMIT; frames++) {
    const result = bus.RAM[address];
    if (result !== 0 && result !== IN_PROGRESS) {
      return { result, frames, errorCode: bus.RAM[0x10] };
    }
    bus.updateFrame();
  }
  return { result: bus.RAM[address], frames: RESULT_FRAME_LIMIT, errorCode: bus.RAM[0x10] };
}
