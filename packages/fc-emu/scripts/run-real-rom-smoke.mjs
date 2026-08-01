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
  up: ControllerButton.Up,
  down: ControllerButton.Down,
  left: ControllerButton.Left,
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
  kage: {
    title: "The Legend of Kage",
    fileName: "KAGE.NES",
    sha256: "72fce2a76b602d96268a4800e2b981f8d44c761fb7bf2d83f1dd486d17dc075f",
    cartridge: {
      format: "ines",
      mapperNumber: 3,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      prgRomBytes: 32_768,
      chrRomBytes: 16_384,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 360,
      minimumDistinctFrames: 200,
      finalFrameSha256: "aa51739dda43b3e3b2172c5a0e0c909e021294df97b15065558e256fa5061a02",
      frameSequenceSha256: "b594c4eedea8dff218e360335464e0f8bd910f46b62df0926ffc043f50fc32a8",
      cpuCycles: 10_693_588,
    },
    interactive: {
      frames: 900,
      minimumDistinctFrames: 500,
      events: [
        { frame: 300, button: "start", pressed: true },
        { frame: 302, button: "start", pressed: false },
        { frame: 420, button: "right", pressed: true },
        { frame: 540, button: "right", pressed: false },
      ],
      checkpoints: {
        240: "726f642183ce5975f245c0447c1c3bbba2a97535d37d99bcae3717c1c2edc002",
        300: "abd1dcba683910ce245dd1c822d2ae97e229c85f7392e2e30b9d9126a0e9b30f",
        360: "eba1e560dea38ece703a834f256427a0e3c5493bcba5f7f40413655e52366e6e",
        420: "9767a38e7cd49900f0d45cfe47586868a708acdd404a47e67260b39c3fac116f",
        480: "cfa183906bc3c0750c0e6c1459d8278689077b7446ab75e1c5ee79df59d5b1f1",
        600: "6fa0b260b3e860f25fe3ed6ce32b19203da8c7ed2838844aa271f20119763f59",
        900: "60230877dd3a45e696e01db07645a7a28448c1e9f9c752cb4ed6f2db154b164f",
      },
      finalFrameSha256: "60230877dd3a45e696e01db07645a7a28448c1e9f9c752cb4ed6f2db154b164f",
      frameSequenceSha256: "afe1172fa1fa6c047449c94a48c1bd470975049486aa10911842a3ac97a79ceb",
      audioSamples: 659_737,
      audioSha256: "62b14e5d71a72a256f2f49b3419e340c6b83137ca101bfe9402dd1e2cfd6d590",
      cpuCycles: 26_775_058,
    },
    replay: {
      checkpointFrame: 480,
      frames: 120,
      frameSequenceSha256: "d3eed93fe024078a67436efb06867b21c3235cc4006c322fed0636d20e8a7384",
      audioSamples: 88_055,
      audioSha256: "39f7a0e79c04ebb1d2de92f3296e3d144b0f9255ae3e08ac40272bc3fe0678f8",
      cpuCycles: 3_573_660,
    },
  },
  smb3: {
    title: "Super Mario Bros. 3 (Japan)",
    fileName: "SMB3-J.NES",
    sha256: "2dbff658378216b3d4e59fdb38926d0bddabd9e78d75e8819e3824d5554daed8",
    cartridge: {
      format: "ines",
      mapperNumber: 4,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      prgRomBytes: 262_144,
      chrRomBytes: 131_072,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 900,
      minimumDistinctFrames: 700,
      finalFrameSha256: "4c72a17c83f4a293bd16ca06f715922da65f16bc67acbdd4ec002e7886c8dedd",
      frameSequenceSha256: "c76be87146eac60044893a9171040b506533d25434c7d7471208d35415ccb762",
      cpuCycles: 26_775_059,
    },
    interactive: {
      frames: 2160,
      minimumDistinctFrames: 1300,
      events: [
        { frame: 840, button: "start", pressed: true },
        { frame: 842, button: "start", pressed: false },
        { frame: 960, button: "start", pressed: true },
        { frame: 962, button: "start", pressed: false },
        { frame: 1440, button: "right", pressed: true },
        { frame: 1460, button: "right", pressed: false },
        { frame: 1500, button: "up", pressed: true },
        { frame: 1520, button: "up", pressed: false },
        { frame: 1620, button: "a", pressed: true },
        { frame: 1626, button: "a", pressed: false },
        { frame: 1800, button: "right", pressed: true },
        { frame: 1800, button: "b", pressed: true },
        { frame: 1890, button: "a", pressed: true },
        { frame: 1896, button: "a", pressed: false },
        { frame: 2040, button: "b", pressed: false },
        { frame: 2040, button: "right", pressed: false },
      ],
      checkpoints: {
        900: "385b93044be7be1b0815d71ab1d3430165184ca514fc20954e58eddcbe4a169e",
        1080: "d7f4ccfc5af17e1eec0c8451498812e7dfdee7551ff67c1269c451ebeedf56ad",
        1320: "7078ad8b9d4aed00dd9be1f9b6721ac02af0db0f124d54dfa62c1b3e0947236f",
        1560: "927344f9c2822444cb8af88e7795174d6c3cf91f79f3c871c80bae1656fd6c0f",
        1680: "43f1599f8fd67b027bae7a481030d503f4616cbe16f38737c3c29454f268d8d0",
        1740: "4b2a3cff26996bfb267c60ac0d5903ed68b7d288900a5bd253ae1a8cbcb447d4",
        1800: "ab31e2d5cece5b8fbf5cc9f92480f9dd1043a779c8aadc735e1f15269a1df9f7",
        1890: "6f41e59a0d08e554f29023e43a05a9dd969332641196aa29092a2ae4f5b0d2f2",
        2040: "6cd92d5a34fb2b1470d11d3618a08b20c916865878bd65a657108c60e3a921c9",
        2160: "7c1d5c4a2263fd33908437c34e064af6a686290c4a8711a8906f99a4039c5469",
      },
      finalFrameSha256: "7c1d5c4a2263fd33908437c34e064af6a686290c4a8711a8906f99a4039c5469",
      frameSequenceSha256: "000d01238a57d674e87bdfd84315c0c4725ca8419dabc00447a70dc0791a36ce",
      audioSamples: 1_584_314,
      audioSha256: "0003f668aff7b684ca9ab67182f3244631f48e34170ac8cf6c0e2036d2f0c0ef",
      cpuCycles: 64_298_495,
    },
    replay: {
      checkpointFrame: 1800,
      frames: 120,
      frameSequenceSha256: "fca3632c911afd01980cd1390df469941347a8809c2cbf054b1d6f8ba304c0c5",
      audioSamples: 88_055,
      audioSha256: "52fcee6b2e6730cb3e6d96b18971282bd659a81d20ff24089b5f0387c95e5ad9",
      cpuCycles: 3_573_660,
    },
  },
  punchout: {
    title: "Punch-Out!! (Japan)",
    fileName: "PUNCHOUT-J.NES",
    sha256: "137a2f258d13367238f352d6471f0f62682dadfa4764e848b5bc96145fe789c0",
    cartridge: {
      format: "ines",
      mapperNumber: 9,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      prgRomBytes: 131_072,
      chrRomBytes: 131_072,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 1200,
      minimumDistinctFrames: 75,
      finalFrameSha256: "f399d0be9a3a6122606771f667cadf45b47d9d94057c433777333d5b1b20738b",
      frameSequenceSha256: "2de90b90a656052238ff2e485712e5b086e5ac4e633529a83832b88c3a56d011",
      cpuCycles: 35_709_243,
    },
    interactive: {
      frames: 2280,
      minimumDistinctFrames: 550,
      events: [
        { frame: 240, button: "start", pressed: true },
        { frame: 246, button: "start", pressed: false },
        { frame: 720, button: "start", pressed: true },
        { frame: 726, button: "start", pressed: false },
        { frame: 1830, button: "a", pressed: true },
        { frame: 1836, button: "a", pressed: false },
        { frame: 1860, button: "b", pressed: true },
        { frame: 1866, button: "b", pressed: false },
        { frame: 1920, button: "up", pressed: true },
        { frame: 1920, button: "a", pressed: true },
        { frame: 1926, button: "a", pressed: false },
        { frame: 1930, button: "up", pressed: false },
        { frame: 1980, button: "left", pressed: true },
        { frame: 1990, button: "left", pressed: false },
        { frame: 2040, button: "right", pressed: true },
        { frame: 2050, button: "right", pressed: false },
      ],
      checkpoints: {
        240: "8d39127a04aaa209a1c4d476e70a59395559595aeb3b4020379a6831ff4bfb6e",
        480: "2aaa133dc4eb9550ba83c578fa70160e7a7e1675d454660b9ff3c1ab2cb337a5",
        720: "f44d0c2b88344c48cc525365f3cb7d00f0ea5f5a6ed10745d9bff5da02bcaeac",
        840: "b7b9aa8715faf5e546e6628c69c5ee92aa0e660b45c704d6165afaaa8c674376",
        960: "92cf78ed869f67b6317651d0b545f78a20f3b3f5073c6d2fd5934568b165bd9e",
        1440: "ea2cf56631a4903dc0f8b35f9d1541223b37606fe1cb5dce884d5019c5a9fb9b",
        1680: "51305e2ea5911067b4292fe6b78cbce7bae3ed7fe080a3fe86d8c9ca4e732f05",
        1800: "d2e488d548dfab0ca3807b9fcab9841404b4a63ee1a72f7d7675fa33a395c647",
        1860: "b62127eec7b024346e9b23e50e6af604363a9e1b3449893d2a2b55f05247e158",
        1920: "d241e8d03f6c8fd923a8bb51c5a10348c95bac6b87cbabe5622b7e295a66be96",
        1980: "dd3fdf307b8b3df6a8cc2e3a95725efa289b67e411c69a37345c5af641fe122c",
        2160: "b3b945f78cae8a6f0cc5c39e4d79e0d499ae63ce5650bd221236d4e35d2431a9",
        2280: "89d5ace8d74cf1549f1e1862e033f782a019d491e9c9387e257d73bfe5565428",
      },
      finalFrameSha256: "89d5ace8d74cf1549f1e1862e033f782a019d491e9c9387e257d73bfe5565428",
      frameSequenceSha256: "0f66aa3a639da5921d187ed494d8f0ae8d1afe6bfb938ceeeabbbc0703e67225",
      audioSamples: 1_672_370,
      audioSha256: "0dbccc8cf17c07556954b5f50711c6a235a4016bea82c0afde68fbb52c08c1bc",
      cpuCycles: 67_872_185,
    },
    replay: {
      checkpointFrame: 1920,
      frames: 120,
      frameSequenceSha256: "a832fab61d28ff259121022fd2ed55b462fa1be5905f3d29219a74d877f59864",
      audioSamples: 88_055,
      audioSha256: "78b4d373565156ee6532e5bb2d99c716c3088fbf46c21d4e5daf8b29c3a4a24c",
      cpuCycles: 3_573_660,
    },
  },
  dbz5: {
    title: "Dragon Ball Z 5 (Chinese)",
    fileName: "dbz5cn.nes",
    sha256: "4e8d261a023aa4bd6a4c43a88200f63bd2a0ae9437a5216e016ba4d6713d9cc8",
    cartridge: {
      format: "ines",
      mapperNumber: 12,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      prgRomBytes: 262_144,
      chrRomBytes: 524_288,
      prgRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 400,
      finalFrameSha256: "84d66ee732472f77aeb4fafe7805a5ef1ecc4c20a137f6ef8ddd9685a595e6cb",
      frameSequenceSha256: "4e0b93991ac0cead1757054bb3d73b2e3dcd305c70b8b7fad90dd40cd653b4d6",
      cpuCycles: 17_840_908,
    },
    interactive: {
      frames: 1200,
      minimumDistinctFrames: 550,
      events: [
        { frame: 600, button: "start", pressed: true },
        { frame: 602, button: "start", pressed: false },
        { frame: 840, button: "start", pressed: true },
        { frame: 842, button: "start", pressed: false },
        { frame: 960, button: "right", pressed: true },
        { frame: 1020, button: "a", pressed: true },
        { frame: 1026, button: "a", pressed: false },
        { frame: 1080, button: "b", pressed: true },
        { frame: 1086, button: "b", pressed: false },
        { frame: 1140, button: "right", pressed: false },
      ],
      checkpoints: {
        120: "5a3f1d11969a48903f816c352099e1dcf7db411c05b2d9add79888154b400b03",
        240: "aa15357eabf1d8250bb509cb6ad1a0db16e0a93d305e5273a61a37d6fa767a49",
        360: "3eee7f613f758e3859c0ae9665b6b22f9427079bcab27678e40d71db904f9b9f",
        480: "10cf8fb2d6aa5f131eb8a9505e44dc3861e2496600023a46f9934ef6383eda24",
        600: "84d66ee732472f77aeb4fafe7805a5ef1ecc4c20a137f6ef8ddd9685a595e6cb",
        720: "6fd9657195b7b3f6ff9211db08d861fe8c4eb258d3b0a63e62161742240c1cc0",
        840: "afe994aae0c311e7ddefd4fe2f29cb4b6f370bee6ca233c588dd85077d7c4451",
        960: "c96fc561477f51f1fd938ecffdc44abf117a2a549c77618fc2ac751ac5e2a6c4",
        1080: "2c335930bd55d9b1bbf48f8cc871cd170d889dde9137b1265505cd007e4eda18",
        1200: "62b19453cff16a9fa852919211483bfe59392ce755cce94ea573fb696a02300c",
      },
      finalFrameSha256: "62b19453cff16a9fa852919211483bfe59392ce755cce94ea573fb696a02300c",
      frameSequenceSha256: "0c74eb08873f6eff3c657885d1bbd5c48e0bb41bd0ac55a2a3dcffaf2b6ef3b8",
      audioSamples: 879_874,
      audioSha256: "151a1d51a1a674024b819c4fdcd65fe2dc6031357a84852d1796de29c9900551",
      cpuCycles: 35_709_209,
    },
    replay: {
      checkpointFrame: 960,
      frames: 120,
      frameSequenceSha256: "7dc821e6db87143a3d6cc3c21bf1d7fbbd765b262b68b8e914baf0e269b17ae2",
      audioSamples: 88_055,
      audioSha256: "cb92b6e9ecc0c602de0c41e900608ead20f25cc9ae589cb6db61c79d42d935d3",
      cpuCycles: 3_573_660,
    },
  },
  sango4: {
    title: "San Guo Zhi IV: Chi Bi Feng Yun",
    fileName: "sango4.nes",
    sha256: "dee4d95f36a621b85cfba3e7ecba7a83cda3814bb0d96f76b6502f616f21c25f",
    cartridge: {
      format: "ines",
      mapperNumber: 117,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 1,
      prgRomBytes: 262_144,
      chrRomBytes: 262_144,
      prgRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 50,
      finalFrameSha256: "104a8ef5137566f11d56c43a906400cb09940f57c3c52a769180f33ae75050ce",
      frameSequenceSha256: "86745568bdad9e71050c2ceac6db4286b0f9be00f9c29a7f059a5aafe38eafbd",
      cpuCycles: 17_840_910,
    },
    interactive: {
      frames: 1320,
      minimumDistinctFrames: 100,
      events: [
        { frame: 480, button: "start", pressed: true },
        { frame: 482, button: "start", pressed: false },
        { frame: 720, button: "start", pressed: true },
        { frame: 722, button: "start", pressed: false },
        { frame: 840, button: "right", pressed: true },
        { frame: 900, button: "a", pressed: true },
        { frame: 906, button: "a", pressed: false },
        { frame: 930, button: "right", pressed: false },
        { frame: 1020, button: "down", pressed: true },
        { frame: 1030, button: "down", pressed: false },
        { frame: 1080, button: "a", pressed: true },
        { frame: 1086, button: "a", pressed: false },
        { frame: 1200, button: "b", pressed: true },
        { frame: 1206, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "dc11fa6e7734ece8ed00a5111db0267ae37465b4fca5fdf566dabcf78b276303",
        240: "de43f74de79a45d57fc51b56a40bd684836c5c2ea3b65b221fb29a53b62605a0",
        360: "a606e35c382056a38558b4c431ad4d12bbbdc714ec89fc73eefb2d935c425e20",
        480: "ac24a7927cf66566e756c3cf99e094d399ed0ba2f344ae26cb04c723e4a6cd91",
        600: "0e702b4d10dff6e3b728feb694a16a78e76fa171cb4b4d148c88861c0d77e3af",
        720: "6355c889fc338a7de6aa9f0ca37bd928903669be7dc29a3639edb7c35a180f4b",
        840: "086900b587ac48a3ce392c914b3cd4667de6defdc429ad7e996fb6621527cf76",
        960: "5654b514a70d4fef70b2702ac0b33397b1944400d72fadd4cf96dada052d40f5",
        1080: "bea1a7ad1872ca45ab335ccd7b378e2e3a3938b76fd0bfe04b07a33484dac76d",
        1200: "a0d33c19916b79f47f01914f3488360752b97efc57d7b0542499ba09c954bbff",
        1320: "382a80b3fffa583950cea9bd7524f9cc220201c5348cf3da30044212440877b2",
      },
      finalFrameSha256: "382a80b3fffa583950cea9bd7524f9cc220201c5348cf3da30044212440877b2",
      frameSequenceSha256: "c7f28fc172d38c423c7b979a72d8a7f0729fa2e8209a66c77048c16b577c4b13",
      audioSamples: 967_929,
      audioSha256: "d61875dfc314a471470c21c0ec1311f719e90886f133824cef0d8c89a5c890fe",
      cpuCycles: 39_282_871,
    },
    replay: {
      checkpointFrame: 960,
      frames: 120,
      frameSequenceSha256: "0bab63b5a2b178c2d7f47e6c52f874816df7fcfc498afa520070a5c5f55f14ad",
      audioSamples: 88_055,
      audioSha256: "5c910263016d4648d31ad237edaf4d9733af5465ed2511f24a70ec3e03b3b225",
      cpuCycles: 3_573_660,
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
  const profileIds = Object.keys(PROFILES).join("|");
  console.error(
    `Usage: yarn smoke:real-rom -- <${profileIds}> /path/to/file.nes\n` +
      "       yarn smoke:real-rom -- all /path/to/rom-directory\n" +
      "       yarn smoke:real-rom -- --list",
  );
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown file error";
}
