export const REAL_ROM_PROFILES = Object.freeze({
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
        720: "44dd2a230d41e2cec6dfec1a49bf083e59d32fbfc3c06897d1bc50ebfc76bd3b",
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
  super42: {
    title: "Super 42-in-1",
    fileName: "Super_42-in-1.nes",
    sha256: "927d2738e57ca5a6bd54c6eb1c2223c0332a9018249272779bcea968d5f4aabb",
    cartridge: {
      format: "ines",
      mapperNumber: 226,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      hasBatteryBackup: false,
      prgRomBytes: 1_048_576,
      chrRomBytes: 0,
      prgRamBytes: 8192,
      chrRamBytes: 8192,
      hasWritableChrMemory: true,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 3,
      finalFrameSha256: "ccb46686f2e0e6d7075dca8c6cbf7a4fdea3041329b692034cd58064bd25ef8f",
      frameSequenceSha256: "94f30699ffc8428d265772bd4e46211dd2a0d8abfb8988b233ad33cce3b2fe27",
      cpuCycles: 17_840_908,
    },
    interactive: {
      frames: 1800,
      minimumDistinctFrames: 300,
      events: [
        { frame: 120, button: "select", pressed: true },
        { frame: 128, button: "select", pressed: false },
        { frame: 360, button: "down", pressed: true },
        { frame: 368, button: "down", pressed: false },
        { frame: 384, button: "down", pressed: true },
        { frame: 392, button: "down", pressed: false },
        { frame: 408, button: "down", pressed: true },
        { frame: 416, button: "down", pressed: false },
        { frame: 432, button: "down", pressed: true },
        { frame: 440, button: "down", pressed: false },
        { frame: 456, button: "down", pressed: true },
        { frame: 464, button: "down", pressed: false },
        { frame: 480, button: "down", pressed: true },
        { frame: 488, button: "down", pressed: false },
        { frame: 504, button: "down", pressed: true },
        { frame: 512, button: "down", pressed: false },
        { frame: 528, button: "down", pressed: true },
        { frame: 536, button: "down", pressed: false },
        { frame: 552, button: "down", pressed: true },
        { frame: 560, button: "down", pressed: false },
        { frame: 576, button: "down", pressed: true },
        { frame: 584, button: "down", pressed: false },
        { frame: 840, button: "a", pressed: true },
        { frame: 848, button: "a", pressed: false },
        { frame: 960, button: "start", pressed: true },
        { frame: 968, button: "start", pressed: false },
        { frame: 1080, button: "left", pressed: true },
        { frame: 1140, button: "a", pressed: true },
        { frame: 1200, button: "b", pressed: true },
        { frame: 1208, button: "b", pressed: false },
        { frame: 1260, button: "a", pressed: false },
        { frame: 1320, button: "left", pressed: false },
        { frame: 1380, button: "right", pressed: true },
        { frame: 1500, button: "right", pressed: false },
        { frame: 1560, button: "a", pressed: true },
        { frame: 1568, button: "a", pressed: false },
        { frame: 1680, button: "b", pressed: true },
        { frame: 1688, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "ccb46686f2e0e6d7075dca8c6cbf7a4fdea3041329b692034cd58064bd25ef8f",
        240: "29c3faebaa5593046e1513c2f76e98bf1a691fd61252931f45a4fe83d18f95a5",
        360: "29c3faebaa5593046e1513c2f76e98bf1a691fd61252931f45a4fe83d18f95a5",
        480: "cd25957f3345ba06a9a625462b61b2b45fff7f775f4afdd0464e6822fc301101",
        600: "e8240ba8e5a98a6344defbea33ca5a4990267b0d4b1a6eccb3ff6ccf41d753a9",
        720: "e8240ba8e5a98a6344defbea33ca5a4990267b0d4b1a6eccb3ff6ccf41d753a9",
        840: "e8240ba8e5a98a6344defbea33ca5a4990267b0d4b1a6eccb3ff6ccf41d753a9",
        960: "86c9d69b4f1cfe8550db746218f5c652deaea5d157e5c57f15e71860e85fca31",
        1080: "0ba70aa5bf86eb0f8291fbe6c991f4b8e1b6392ef2db73246e82ec7640e0713a",
        1200: "93971ceb54574771fc8b9c41858c423ddae9e378c6b5653278fb8bf2b2905df0",
        1320: "dec4c768bde3892036f449d979cacf6595e79e9a14513005bb36de3c467b0d35",
        1440: "9366280afa43073f92a424877815975730835d75d5daa69c1081ea219a355131",
        1560: "4330781952ff5bf69c0c2ce8362d3261fb4dd5fb7d730fe60087eaf06260e761",
        1680: "bb4b215d72724b80a684e22133792050dc9f2fa4cb8a2e268c350c029292d961",
        1800: "098466b398235ac527237c7d356185ff98fe7f2ff70be39a7f56a7367cc750db",
      },
      finalFrameSha256: "098466b398235ac527237c7d356185ff98fe7f2ff70be39a7f56a7367cc750db",
      frameSequenceSha256: "d69cdbb273e92ae0bace1a1ee6b35a38dafe3eb6d5b719b75868a1b218bfea0a",
      audioSamples: 1_320_150,
      audioSha256: "f6ec368d0abfcd4dc778c05af76e84be84cd985316dc04f2f57ac3b22d0cac6e",
      cpuCycles: 53_577_529,
    },
    replay: {
      checkpointFrame: 1320,
      frames: 120,
      frameSequenceSha256: "774942ef3b27417dc2c3ae6b0a04aece2e319c927ded031df862f04d5c4e614a",
      audioSamples: 88_055,
      audioSha256: "d8568d99504b19b82449d2e9d51838f1aeda66c3d661158a0231dea872794e4b",
      cpuCycles: 3_573_660,
    },
  },
  genke: {
    title: "Jing Ke Xin Zhuan",
    fileName: "Gen Ke Le Zhuan (C).nes",
    sha256: "3ea31a72b1f3ea26dfca4ed3b8642e51db81d551be384056da31c6d16ab8b966",
    cartridge: {
      format: "ines",
      mapperNumber: 240,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      hasBatteryBackup: true,
      prgRomBytes: 131_072,
      chrRomBytes: 131_072,
      prgRamBytes: 0,
      prgNvRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 100,
      finalFrameSha256: "fd6f61e83ef54bdb5a5343ed64a25121fe1913d68c3a8029959150721bcf5b8b",
      frameSequenceSha256: "e4fa816f3a2885d81fdad5360f00f6882f884af9c62e1fbc776b4ebb6a74a453",
      cpuCycles: 17_840_909,
    },
    interactive: {
      frames: 1800,
      minimumDistinctFrames: 300,
      events: [
        { frame: 120, button: "start", pressed: true },
        { frame: 122, button: "start", pressed: false },
        { frame: 300, button: "up", pressed: true },
        { frame: 420, button: "up", pressed: false },
        { frame: 480, button: "right", pressed: true },
        { frame: 600, button: "right", pressed: false },
        { frame: 660, button: "a", pressed: true },
        { frame: 666, button: "a", pressed: false },
        { frame: 780, button: "down", pressed: true },
        { frame: 790, button: "down", pressed: false },
        { frame: 900, button: "b", pressed: true },
        { frame: 906, button: "b", pressed: false },
        { frame: 960, button: "down", pressed: true },
        { frame: 1080, button: "down", pressed: false },
        { frame: 1140, button: "left", pressed: true },
        { frame: 1260, button: "left", pressed: false },
        { frame: 1320, button: "a", pressed: true },
        { frame: 1326, button: "a", pressed: false },
        { frame: 1460, button: "b", pressed: true },
        { frame: 1466, button: "b", pressed: false },
        { frame: 1500, button: "up", pressed: true },
        { frame: 1620, button: "up", pressed: false },
        { frame: 1680, button: "right", pressed: true },
        { frame: 1800, button: "right", pressed: false },
      ],
      checkpoints: {
        120: "c88d21983d5d901239fe927e48038ea06d03320f088f809faa56c39cbb7e4a06",
        240: "82141092bc85dbfffa6165541484d994ab6181fdf6bbdcfb66a10fd18893e92b",
        360: "bd6176f3007ababe1a9a972fd25efd88f9a06c847db8d8725d0229e7ee56f20d",
        480: "d6228d53639399402c50a115800886c974b7e957292c9f7bfc58b6507e5cfded",
        600: "9ce5396913a08654b248bbc4d4f07dd2b43c70916ef9bf0e0bb41fd1c857e76c",
        720: "418d54196dfde0883af3e69a52fb3fafc08d5cb55749ef0d65753c7cf1e85509",
        840: "d5c1b4d1eb901e196e17b679b0a3a58b2fd208fc28612694c76e0632be273e28",
        960: "9ce5396913a08654b248bbc4d4f07dd2b43c70916ef9bf0e0bb41fd1c857e76c",
        1080: "ec608f76a196e857ef899ee28fcad77e5b7521150933a584b872984ce6a1c204",
        1200: "e550d7a5263c75d0b86d80ce124437e2cca6cee0278f03f6fcd776f8d80a172e",
        1320: "5b9e9d986defb7957b643c3804694beace13c0fd7dc9914b873320987c18b908",
        1440: "e326468c50a3b9d122ce4583c57453e6b4bacae5923aad5425b58dcc8ed1bba2",
        1560: "53633092ad1b3989802b1f5d30ef9d73362d45aca2b4a39372c4a5f917db30ce",
        1680: "d6228d53639399402c50a115800886c974b7e957292c9f7bfc58b6507e5cfded",
        1800: "9ce5396913a08654b248bbc4d4f07dd2b43c70916ef9bf0e0bb41fd1c857e76c",
      },
      finalFrameSha256: "9ce5396913a08654b248bbc4d4f07dd2b43c70916ef9bf0e0bb41fd1c857e76c",
      frameSequenceSha256: "ca1ed8d41774ff8a1a26b740e250802aa94418a428fc26f02b724d25b8609d80",
      audioSamples: 1_320_150,
      audioSha256: "4cf1ad79522ea456cb555441c0f6b00730d9332cb587d333c4f0b5ceefc6dc2a",
      cpuCycles: 53_577_531,
    },
    replay: {
      checkpointFrame: 1440,
      frames: 120,
      frameSequenceSha256: "853f01f4c055ca485a99f2b120e45c8baa4f9bc0216bdd95bf86cf3e0fc54f2e",
      audioSamples: 88_055,
      audioSha256: "5d2d69984810ac13e88f883db9e23be9da892b18ca62ebc0e73ea9f4a374c1de",
      cpuCycles: 3_573_660,
    },
  },
  waixin: {
    title: "Wai Xin Zhan Shi",
    fileName: "Wai Xin Zhan Shi.nes",
    sha256: "efa36c857d4c46d522570437f18dbdb8c0f9675bd0d9dc9b6b1e63e566a87490",
    cartridge: {
      format: "ines",
      mapperNumber: 242,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 1,
      hasBatteryBackup: true,
      prgRomBytes: 524_288,
      chrRomBytes: 0,
      prgRamBytes: 0,
      prgNvRamBytes: 8192,
      chrRamBytes: 8192,
      hasWritableChrMemory: true,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 120,
      finalFrameSha256: "a805294299b44a7011c3e22ac7c727912a5652b82d92ddb99b9cde7918b6a302",
      frameSequenceSha256: "581679de38d83f5cdb50e03f366ff091df3b06d46d8c0ca8b7c1a5b7552c7c1f",
      cpuCycles: 17_840_914,
    },
    interactive: {
      frames: 1200,
      minimumDistinctFrames: 400,
      events: [
        { frame: 300, button: "start", pressed: true },
        { frame: 302, button: "start", pressed: false },
        { frame: 480, button: "start", pressed: true },
        { frame: 482, button: "start", pressed: false },
        { frame: 600, button: "right", pressed: true },
        { frame: 660, button: "a", pressed: true },
        { frame: 666, button: "a", pressed: false },
        { frame: 720, button: "right", pressed: false },
        { frame: 840, button: "down", pressed: true },
        { frame: 850, button: "down", pressed: false },
        { frame: 900, button: "a", pressed: true },
        { frame: 906, button: "a", pressed: false },
        { frame: 1080, button: "b", pressed: true },
        { frame: 1086, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "119f55e46e83fc10e1cac1f96477dd1f1c21fb37b44234e9b8c106bd2e698d77",
        240: "de90a5c9686cc1106690861c28e3d4999ebcfb2408d244b7bbad0296d68df38f",
        300: "8d88afd53947c49a4514234951f87e39593f7777daec1a8d332c9f3e25e1b293",
        360: "49ef9cef2b1ab49da8d56deb720936ffd7806f67c82a25104f25f337045b383d",
        480: "fc021b1baf1ad3e84dd53b1f0c011166111d391f36eaac7afce2f527dffa83d4",
        600: "a805294299b44a7011c3e22ac7c727912a5652b82d92ddb99b9cde7918b6a302",
        720: "2759f436302e35d9d6f94233b7521ce47e0ad4cf89aafec1a79c1709fbe07f19",
        840: "a4a5143233acd8f4b839ba256982f20d8be7396848aa5fc9ef77b1a61e42d0d8",
        960: "4e0d096f10186e0424dc94343ad97039448a79bcb5d1226b0454df9cd3d90c41",
        1080: "a879e9156f0d1ba01567f901caacf677deb9ccf1ef884bec156c2f3566ea9929",
        1200: "59dee5e6f4d80e4b4aa064052301a9b3d3dece0a5bfdd662efe295688a0a1dfb",
      },
      finalFrameSha256: "59dee5e6f4d80e4b4aa064052301a9b3d3dece0a5bfdd662efe295688a0a1dfb",
      frameSequenceSha256: "a676855a3b54b001499bd789f4d55d023883af25c20b26258d5a6c4cfa1b9b49",
      audioSamples: 879_874,
      audioSha256: "a003cc9746d6160d4b2e94789e2c4e71c319b57c29f190026eafc4c15fc5593d",
      cpuCycles: 35_709_214,
    },
    replay: {
      checkpointFrame: 840,
      frames: 120,
      frameSequenceSha256: "f4f0f530778e3e87d4141ae82b44fd1e35e94b636fd4bd47768ffa3296e1cead",
      audioSamples: 88_055,
      audioSha256: "22de61312f18895d418d205669fa6d400a8a5dc7a58e0db4c5d29903eb302d73",
      cpuCycles: 3_573_660,
    },
  },
  decathlon: {
    title: "Decathlon (C&E)",
    fileName: "Cecathlon (C).nes",
    sha256: "b51a894b0e478bc16f88fb1940dad05109ad1f23897b778506349dda26adae24",
    cartridge: {
      format: "ines",
      mapperNumber: 244,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 1,
      prgRomBytes: 131_072,
      chrRomBytes: 65_536,
      prgRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 5,
      finalFrameSha256: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
      frameSequenceSha256: "a6343c367a13aca339b39d3316f0477f4df9ffcfeaaf510bec250e10cda529a2",
      cpuCycles: 17_840_909,
    },
    interactive: {
      frames: 2200,
      minimumDistinctFrames: 200,
      events: [
        { frame: 600, button: "start", pressed: true },
        { frame: 602, button: "start", pressed: false },
        { frame: 840, button: "start", pressed: true },
        { frame: 842, button: "start", pressed: false },
        { frame: 1200, button: "right", pressed: true },
        { frame: 1260, button: "a", pressed: true },
        { frame: 1266, button: "a", pressed: false },
        { frame: 1320, button: "right", pressed: false },
        { frame: 1500, button: "down", pressed: true },
        { frame: 1510, button: "down", pressed: false },
        { frame: 1560, button: "a", pressed: true },
        { frame: 1566, button: "a", pressed: false },
        { frame: 1800, button: "b", pressed: true },
        { frame: 1806, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
        240: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
        360: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
        480: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
        600: "add118be3daf7bf790d0a10f6c91a92b8da8828ee40ebaab78a91dd8d5988e0c",
        840: "af5de540ecf045f48458630db51d3cdf9a8c26946cb36917ed3ce2a3f5ae9e89",
        1200: "de2db07faf64778b247537ccc27c56303a41ab69a1f0826481336aa580b796d0",
        1500: "599dc691b8de26f8f3d051cb4359a662c9ea18bf2fbc7eba224a3e204f7f2396",
        1800: "cf9801c35cc67fb8abf140cb57ba3f2f94998f7963a1d9d39d029502620c6870",
        2100: "5b7f01f0afc15c071bdc6468746efbc8a240a76ee60ce147d68393a43b0da2bc",
        2200: "c960706efefda3b3f73bf84601b065d1e8e8efd163d6379693b8c6d5d8944db5",
      },
      finalFrameSha256: "c960706efefda3b3f73bf84601b065d1e8e8efd163d6379693b8c6d5d8944db5",
      frameSequenceSha256: "834deee6378d48a16fe43d32651bfc0f381779a3f4d61e76d7b1ce985efe9b0e",
      audioSamples: 1_613_666,
      audioSha256: "584fcaa9856e059ee3701c37b6c56d37d71523557a478084be0240f7eaf31f92",
      cpuCycles: 65_489_712,
    },
    replay: {
      checkpointFrame: 2100,
      frames: 100,
      frameSequenceSha256: "ed9d84d2127d87264255dc505d3b78bada3d890597339ec5f2c185bf37d3192c",
      audioSamples: 73_379,
      audioSha256: "ac3958fff117bc9429de58cfb0051c33a5e43f9a3c3efde6eb6e83c11ba83586",
      cpuCycles: 2_978_050,
    },
  },
  dragonquest7: {
    title: "Dragon Quest VII (Chinese)",
    fileName: "勇者斗恶龙7(中文).nes",
    sha256: "7075d99f763e8512c0d55f4e0d2761ffb035ba887be04e124579345e91ba346d",
    cartridge: {
      format: "ines",
      mapperNumber: 245,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 1,
      hasBatteryBackup: true,
      prgRomBytes: 1_048_576,
      chrRomBytes: 0,
      prgRamBytes: 0,
      prgNvRamBytes: 8192,
      chrRamBytes: 8192,
      hasWritableChrMemory: true,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 3,
      finalFrameSha256: "b306a95b6c62466091369abf7aae4ac2216191a117aa7e888afa2d9e14b2af1b",
      frameSequenceSha256: "1e29f643993cf2c390eaae1f0346ebbcccd8af55f97a92f5454e8b70aaab10cb",
      cpuCycles: 17_840_909,
    },
    interactive: {
      frames: 1600,
      minimumDistinctFrames: 40,
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
        120: "b306a95b6c62466091369abf7aae4ac2216191a117aa7e888afa2d9e14b2af1b",
        240: "b306a95b6c62466091369abf7aae4ac2216191a117aa7e888afa2d9e14b2af1b",
        360: "b306a95b6c62466091369abf7aae4ac2216191a117aa7e888afa2d9e14b2af1b",
        480: "b306a95b6c62466091369abf7aae4ac2216191a117aa7e888afa2d9e14b2af1b",
        600: "3051cbc9f5efc918a1766716e1eb2dbff8f062a565368d327cb6c132e06f0b4a",
        720: "3051cbc9f5efc918a1766716e1eb2dbff8f062a565368d327cb6c132e06f0b4a",
        840: "9aca79e22b38d0f125e37e34d74f8295f1730ad9754a69427ff8fbc0196d4d23",
        960: "64caf5baa53014e84d16e47bc30779f4e93549184045bbf8a424fafa73ad5a5e",
        1080: "71a45512449c8db6a4edb8221bf830d1f77999479ce622d6c3f2264a3f5046cd",
        1200: "36822b6350236c716eadb931da7e5c9f82893d690d352637bb7b89b1d39a421c",
        1320: "559396efdd1544b79c3f98816811cd448ba9530e3648f51deb3bf8405faf6047",
        1440: "559396efdd1544b79c3f98816811cd448ba9530e3648f51deb3bf8405faf6047",
        1600: "559396efdd1544b79c3f98816811cd448ba9530e3648f51deb3bf8405faf6047",
      },
      finalFrameSha256: "559396efdd1544b79c3f98816811cd448ba9530e3648f51deb3bf8405faf6047",
      frameSequenceSha256: "16ec31902e0785b0bbb11090cf14e76545d8ea98316837f83da58193b07a6b2c",
      audioSamples: 1_173_391,
      audioSha256: "f475b6149867daeb7e5f3d5b2c96bd7472341ee292b831cc221aafd8eb9718dc",
      cpuCycles: 47_621_411,
    },
    replay: {
      checkpointFrame: 1200,
      frames: 120,
      frameSequenceSha256: "4450566e48421ec4ac4aa85f8b3cdc938c3bb2a17101e606b67a43749361eec6",
      audioSamples: 88_055,
      audioSha256: "3259b5914ba695e9a9c94042041373a537d43d1d1200dbc78f4cd2ec0b8ed918",
      cpuCycles: 3_573_660,
    },
  },
  fengshenbang: {
    title: "Feng Shen Bang",
    fileName: "封神榜.nes",
    sha256: "f3596ffda5c1b83821e58d15827a3a2fbc94c85352b7a5b834c1039e70509a25",
    cartridge: {
      format: "ines",
      mapperNumber: 246,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      hasBatteryBackup: true,
      prgRomBytes: 524_288,
      chrRomBytes: 524_288,
      prgRamBytes: 0,
      prgNvRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 75,
      finalFrameSha256: "6f9b396f8154408c0afd1bfb5a340ceaf5211a04c8bf3be38d99839c063f61ef",
      frameSequenceSha256: "453ec096635f852346f872731927000ca22aa9eaa3924a52ff835f35fa0ce5be",
      cpuCycles: 17_840_908,
    },
    interactive: {
      frames: 2200,
      minimumDistinctFrames: 350,
      events: [
        { frame: 600, button: "start", pressed: true },
        { frame: 602, button: "start", pressed: false },
        { frame: 840, button: "start", pressed: true },
        { frame: 842, button: "start", pressed: false },
        { frame: 1200, button: "right", pressed: true },
        { frame: 1260, button: "a", pressed: true },
        { frame: 1266, button: "a", pressed: false },
        { frame: 1320, button: "right", pressed: false },
        { frame: 1500, button: "down", pressed: true },
        { frame: 1510, button: "down", pressed: false },
        { frame: 1560, button: "a", pressed: true },
        { frame: 1566, button: "a", pressed: false },
        { frame: 1800, button: "b", pressed: true },
        { frame: 1806, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "f9c19f5c9147e5255700c2f9a737788062a09b42e2663645d7a27668e74670dc",
        240: "a976e30645bca06ac9aaddd00b647848b0f761611bc4f8649913a38cfc33b86b",
        360: "a976e30645bca06ac9aaddd00b647848b0f761611bc4f8649913a38cfc33b86b",
        480: "46c654a6486c1b3171fa5d742cc4b27c26db1eab69b10fdac1ff2952b61649cf",
        600: "6f9b396f8154408c0afd1bfb5a340ceaf5211a04c8bf3be38d99839c063f61ef",
        840: "04a34153d85bbb8e1afa1a072fc16105261c63990a85e72b1b5466777530f61b",
        1200: "371b8491c439cbd5a5a228a7344c5003739805b64fe66a761216d4ab9f2e4383",
        1500: "3d7bc775142360f79bfa85828c6cb3d705c432c63d28372fe997f850580d2fdc",
        1800: "96aca1a05ef49b03fc66e29cb653c4825ac5552ea53f3f2f5b3ae15426ac7de8",
        1980: "0bffdb16e402e4497d265c5f855a68583d413ccd440585b61e0d9eb48ca846fb",
        2100: "ca32d6bfec37c1e49b985d47e03a3c79eb725516aa6a85479578dfe233fa14a3",
        2200: "df0b38941812a4894d1fb56858a356f34de70875a30698f7fc0f87b007315bb7",
      },
      finalFrameSha256: "df0b38941812a4894d1fb56858a356f34de70875a30698f7fc0f87b007315bb7",
      frameSequenceSha256: "0f24905e0d05d8a648e50ed8b378ec54c5633f28c65307bf6868620d312c0439",
      audioSamples: 1_613_666,
      audioSha256: "c36e56bb5ec53136541f9cffcb12aea7605c5723fd83731b3fa3ed4bc3f3b653",
      cpuCycles: 65_489_710,
    },
    replay: {
      checkpointFrame: 1980,
      frames: 120,
      frameSequenceSha256: "e1eec15950a7980ac3b83ee4e2f9521f73967042f6a350a212449ba567efb723",
      audioSamples: 88_055,
      audioSha256: "4ebcba95c6bec7a39cc573e1af44a0592887f48ce3e5df6d837181df737b8c98",
      cpuCycles: 3_573_660,
    },
  },
  baoqingtian: {
    title: "Bao Qing Tian",
    fileName: "Bao Qing Tian (C).nes",
    sha256: "4a4f0fa02305ea403464ec8f3a009aa567e191d6069e2d1edd568d5bdff005f7",
    cartridge: {
      format: "ines",
      mapperNumber: 248,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      hasBatteryBackup: false,
      prgRomBytes: 262_144,
      chrRomBytes: 262_144,
      prgRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 50,
      finalFrameSha256: "813cfd95027f3bd48e9b8198e4546f6c16f0ce664d65d164a6c8cd22475d6e9a",
      frameSequenceSha256: "349d69005b41ae155c9b17c5ffb681c2367b8aab2cd406148aacd3703083acf7",
      cpuCycles: 17_840_908,
    },
    interactive: {
      frames: 1800,
      minimumDistinctFrames: 500,
      events: [
        { frame: 300, button: "start", pressed: true },
        { frame: 302, button: "start", pressed: false },
        { frame: 480, button: "start", pressed: true },
        { frame: 482, button: "start", pressed: false },
        { frame: 620, button: "a", pressed: true },
        { frame: 626, button: "a", pressed: false },
        { frame: 960, button: "start", pressed: true },
        { frame: 962, button: "start", pressed: false },
        { frame: 1080, button: "right", pressed: true },
        { frame: 1140, button: "a", pressed: true },
        { frame: 1146, button: "a", pressed: false },
        { frame: 1200, button: "b", pressed: true },
        { frame: 1206, button: "b", pressed: false },
        { frame: 1320, button: "right", pressed: false },
        { frame: 1380, button: "left", pressed: true },
        { frame: 1500, button: "left", pressed: false },
        { frame: 1560, button: "a", pressed: true },
        { frame: 1566, button: "a", pressed: false },
        { frame: 1680, button: "b", pressed: true },
        { frame: 1686, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "2a20e1cbcb7314f3b9a0bcb7e1c731864d7902eea586fa94da55b6170d4da863",
        240: "cbf75f4844043d2317cc018701a4d3e54d791c5eb096e75fe9fc512eb08702a3",
        360: "788b604a4fe841668f484df77fa48dd7584095ae2d66627df128eb6f41e3983f",
        480: "b3482ad52b79bcb8fbe0a5f4908080f77e73c296aa7356e48ffdc43e0b068ba4",
        600: "46e895db61217f8bc2317cec85eec4cc640dfe13b0599a7e00ce631c25ea8723",
        720: "bfd0f47d0a794d7a076c1c6d484bc797f45eedc0096bb5f5ae406d16ed55c5a2",
        840: "389a9f404267178e91ec8dadea88eb05097cef0887ba8bd7c40dcc7ebdfc351b",
        960: "389a9f404267178e91ec8dadea88eb05097cef0887ba8bd7c40dcc7ebdfc351b",
        1080: "08d991952feea11c80e85be430ef7d375d27d81bf7d06fdaf81cdeecedf4caec",
        1200: "aed5ae7e5e351d024445302ef254a9901f40dde310400eee3088ab4229259369",
        1320: "c3fccab4db333d16c92cc90a6faf0b94be68f5aed72711e70d11642627901436",
        1440: "91c5dcc61518e1f7ab5da044be87c1fba8b6c41915bf1b6c8d6d492d70cb0a02",
        1560: "682d89122d28f237bd42893200f27e9e30db4cf240d8c2d775a6b0d678ddb8ee",
        1680: "fca0779836d279a3024b0ae6108f1673c74aec8ac66fd75c55db617bf7e521a6",
        1800: "4ac0e08b7f12f99da829b3c88addabe3b759932b715131b49c86e5a413e8f807",
      },
      finalFrameSha256: "4ac0e08b7f12f99da829b3c88addabe3b759932b715131b49c86e5a413e8f807",
      frameSequenceSha256: "ad5d60f256f900cd7ae4bf8fce73440013675e25274a80934c2d1942f1c1271c",
      audioSamples: 1_320_149,
      audioSha256: "c389fe13ada7c19bff5f39479a4abe5d807feabdedd5ff38bf766e33629f7f4e",
      cpuCycles: 53_577_510,
    },
    replay: {
      checkpointFrame: 1320,
      frames: 120,
      frameSequenceSha256: "3d7ca2b81e129cacc7bc82387a3a4f527c2a97049f5a9661102c281b40958c9b",
      audioSamples: 88_055,
      audioSha256: "92db6648a6bcbb74a05267e24020cfde4d09e883fa170d14e053632148a65250",
      cpuCycles: 3_573_660,
    },
  },
  timediver: {
    title: "Time Diver Avenger",
    fileName: "Time Diver Avenger (C).nes",
    sha256: "36bec12c4caccc958a70634e56eb18f6ec1e92c5e6d1a88afcfd1cd52050b54e",
    cartridge: {
      format: "ines",
      mapperNumber: 250,
      submapperNumber: 0,
      consoleRegion: "ntsc",
      mirroringMode: 0,
      prgRomBytes: 131_072,
      chrRomBytes: 131_072,
      prgRamBytes: 8192,
      hasWritableChrMemory: false,
    },
    baseline: {
      frames: 600,
      minimumDistinctFrames: 5,
      finalFrameSha256: "2f5aea2b9d721e9cac6ee912816b4f521d68870b263ba99477aa069e9f5e1701",
      frameSequenceSha256: "17a3c80f8b426dc57f04262f8042f205ce10b7597e9a177f531a6872fc71a413",
      cpuCycles: 17_840_908,
    },
    interactive: {
      frames: 2200,
      minimumDistinctFrames: 350,
      events: [
        { frame: 600, button: "start", pressed: true },
        { frame: 602, button: "start", pressed: false },
        { frame: 840, button: "start", pressed: true },
        { frame: 842, button: "start", pressed: false },
        { frame: 1200, button: "right", pressed: true },
        { frame: 1260, button: "a", pressed: true },
        { frame: 1266, button: "a", pressed: false },
        { frame: 1320, button: "right", pressed: false },
        { frame: 1500, button: "down", pressed: true },
        { frame: 1510, button: "down", pressed: false },
        { frame: 1560, button: "a", pressed: true },
        { frame: 1566, button: "a", pressed: false },
        { frame: 1800, button: "b", pressed: true },
        { frame: 1806, button: "b", pressed: false },
      ],
      checkpoints: {
        120: "a829a08763580e8d3b89f96bd70799d109f09cbea24d57edcaef6cfb0287e465",
        240: "2f5aea2b9d721e9cac6ee912816b4f521d68870b263ba99477aa069e9f5e1701",
        360: "2f5aea2b9d721e9cac6ee912816b4f521d68870b263ba99477aa069e9f5e1701",
        480: "2f5aea2b9d721e9cac6ee912816b4f521d68870b263ba99477aa069e9f5e1701",
        600: "2f5aea2b9d721e9cac6ee912816b4f521d68870b263ba99477aa069e9f5e1701",
        840: "1aeb8ae5910100d06f74ff6e15960a27cf1626bc160c6912f4c1dd42f8b22330",
        1200: "b13d59a20a3ab59044dbd136cd9bf8be2a0d5ebc26cd56210a341cbb78a6c778",
        1500: "f3f08a797135524d30932e3a495594ccdbdc7be62c18224941495710cab0bfa4",
        1800: "9a8f96316731d8a15aac3f5ae800ddc11b5bc879f0540afd6c99fbac1a445125",
        1980: "9a8f96316731d8a15aac3f5ae800ddc11b5bc879f0540afd6c99fbac1a445125",
        2100: "9a8f96316731d8a15aac3f5ae800ddc11b5bc879f0540afd6c99fbac1a445125",
        2200: "9a8f96316731d8a15aac3f5ae800ddc11b5bc879f0540afd6c99fbac1a445125",
      },
      finalFrameSha256: "9a8f96316731d8a15aac3f5ae800ddc11b5bc879f0540afd6c99fbac1a445125",
      frameSequenceSha256: "d05f30574e102a444370a14e804ebb52b33fc4a33cad5bd91a789a64a1ea356e",
      audioSamples: 1_613_666,
      audioSha256: "eadc407f082be52a439563a7c1bbbe63b6a940f64089d48599117e60eb7ee834",
      cpuCycles: 65_489_714,
    },
    replay: {
      checkpointFrame: 1980,
      frames: 120,
      frameSequenceSha256: "aa1589366d3860c82322fa300790c3dbffcce8f5f16775e07b6e4786a1915cf0",
      audioSamples: 88_055,
      audioSha256: "aea5684e61c55d4d53d4de380d022eec58aabc2d6263d36d631c94665fcd2f3f",
      cpuCycles: 3_573_660,
    },
  },
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REQUIRED_CARTRIDGE_FIELDS = Object.freeze([
  "format",
  "mapperNumber",
  "submapperNumber",
  "consoleRegion",
  "hasWritableChrMemory",
  "prgRomBytes",
  "chrRomBytes",
]);

export function validateRealRomProfiles(profiles, buttonNames) {
  if (!isRecord(profiles) || Object.keys(profiles).length === 0) {
    throw new TypeError("Real-ROM profiles must be a non-empty object");
  }
  const validButtons = new Set(buttonNames);
  const fileNames = new Set();

  for (const [id, profile] of Object.entries(profiles)) {
    if (!/^[a-z0-9-]+$/.test(id)) fail(id, "has an invalid profile ID");
    if (!isRecord(profile)) fail(id, "must be an object");
    requireText(id, "title", profile.title);
    requireText(id, "fileName", profile.fileName);
    if (/[\\/]/.test(profile.fileName)) fail(id, "fileName must not contain a path");
    if (fileNames.has(profile.fileName)) fail(id, `duplicates fileName ${profile.fileName}`);
    fileNames.add(profile.fileName);
    requireSha256(id, "sha256", profile.sha256);
    validateCartridge(id, profile.cartridge);

    validateScenario(id, "baseline", profile.baseline, false);
    validateScenario(id, "interactive", profile.interactive, true);
    validateEvents(id, profile.interactive, validButtons);
    validateReplay(id, profile.replay, profile.interactive);
  }
}

function validateCartridge(id, cartridge) {
  if (!isRecord(cartridge)) fail(id, "cartridge must be an object");
  for (const field of REQUIRED_CARTRIDGE_FIELDS) {
    if (!Object.hasOwn(cartridge, field)) fail(id, `cartridge is missing required field ${field}`);
  }

  for (const [field, value] of Object.entries(cartridge)) {
    const path = `cartridge.${field}`;
    switch (field) {
      case "format":
        requireOneOf(id, path, value, ["ines", "nes2"]);
        break;
      case "mapperNumber":
        requireIntegerBetween(id, path, value, 0, 0x0fff);
        break;
      case "submapperNumber":
        requireIntegerBetween(id, path, value, 0, 0x0f);
        break;
      case "timingMode":
        requireIntegerBetween(id, path, value, 0, 3);
        break;
      case "consoleType":
        requireIntegerBetween(id, path, value, 0, 1);
        break;
      case "vsPpuType":
      case "vsHardwareType":
        requireIntegerBetween(id, path, value, 0, 0x0f);
        break;
      case "consoleRegion":
        requireOneOf(id, path, value, ["ntsc", "pal", "dendy"]);
        break;
      case "mirroringMode":
        requireIntegerBetween(id, path, value, 0, 4);
        break;
      case "hasBatteryBackup":
      case "hasWritableChrMemory":
        requireBoolean(id, path, value);
        break;
      case "prgRomBytes":
        requireInteger(id, path, value, 1);
        break;
      case "chrRomBytes":
      case "prgRamBytes":
      case "prgNvRamBytes":
      case "chrRamBytes":
      case "chrNvRamBytes":
      case "mapperRamBytes":
      case "mapperNvRamBytes":
        requireInteger(id, path, value, 0);
        break;
      default:
        fail(id, `cartridge contains unknown field ${field}`);
    }
  }
}

function validateScenario(id, name, scenario, includesAudio) {
  if (!isRecord(scenario)) fail(id, `${name} must be an object`);
  requireInteger(id, `${name}.frames`, scenario.frames, 1);
  requireInteger(id, `${name}.minimumDistinctFrames`, scenario.minimumDistinctFrames, 1);
  if (scenario.minimumDistinctFrames > scenario.frames) {
    fail(id, `${name}.minimumDistinctFrames exceeds its frame count`);
  }
  requireSha256(id, `${name}.finalFrameSha256`, scenario.finalFrameSha256);
  requireSha256(id, `${name}.frameSequenceSha256`, scenario.frameSequenceSha256);
  requireInteger(id, `${name}.cpuCycles`, scenario.cpuCycles, 1);
  if (!includesAudio) return;

  requireInteger(id, `${name}.audioSamples`, scenario.audioSamples, 0);
  requireSha256(id, `${name}.audioSha256`, scenario.audioSha256);
  if (!isRecord(scenario.checkpoints) || Object.keys(scenario.checkpoints).length === 0) {
    fail(id, `${name}.checkpoints must be a non-empty object`);
  }
  for (const [frameText, hash] of Object.entries(scenario.checkpoints)) {
    const frame = Number(frameText);
    if (
      !Number.isInteger(frame) ||
      String(frame) !== frameText ||
      frame < 1 ||
      frame > scenario.frames
    ) {
      fail(id, `${name}.checkpoints contains invalid frame ${frameText}`);
    }
    requireSha256(id, `${name}.checkpoints.${frameText}`, hash);
  }
  if (scenario.checkpoints[scenario.frames] !== scenario.finalFrameSha256) {
    fail(id, `${name} final checkpoint must match finalFrameSha256`);
  }
}

function validateEvents(id, scenario, validButtons) {
  if (!Array.isArray(scenario.events) || scenario.events.length === 0) {
    fail(id, "interactive.events must be a non-empty array");
  }
  let previousFrame = 0;
  for (const [index, event] of scenario.events.entries()) {
    const path = `interactive.events.${index}`;
    if (!isRecord(event)) fail(id, `${path} must be an object`);
    requireInteger(id, `${path}.frame`, event.frame, 1);
    if (event.frame > scenario.frames) fail(id, `${path}.frame exceeds the scenario`);
    if (event.frame < previousFrame) fail(id, "interactive.events must be sorted by frame");
    previousFrame = event.frame;
    if (!validButtons.has(event.button)) fail(id, `${path}.button is unknown`);
    if (typeof event.pressed !== "boolean") fail(id, `${path}.pressed must be boolean`);
  }
}

function validateReplay(id, replay, interactive) {
  if (!isRecord(replay)) fail(id, "replay must be an object");
  requireInteger(id, "replay.checkpointFrame", replay.checkpointFrame, 1);
  requireInteger(id, "replay.frames", replay.frames, 1);
  if (replay.checkpointFrame + replay.frames > interactive.frames) {
    fail(id, "replay segment exceeds the interactive scenario");
  }
  if (!(replay.checkpointFrame in interactive.checkpoints)) {
    fail(id, "replay checkpoint is missing from interactive checkpoints");
  }
  requireSha256(id, "replay.frameSequenceSha256", replay.frameSequenceSha256);
  requireInteger(id, "replay.audioSamples", replay.audioSamples, 0);
  requireSha256(id, "replay.audioSha256", replay.audioSha256);
  requireInteger(id, "replay.cpuCycles", replay.cpuCycles, 1);
}

function requireText(id, path, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(id, `${path} must be a non-empty string`);
  }
}

function requireSha256(id, path, value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(id, `${path} must be a lowercase SHA-256`);
  }
}

function requireInteger(id, path, value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(id, `${path} must be an integer greater than or equal to ${minimum}`);
  }
}

function requireIntegerBetween(id, path, value, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(id, `${path} must be an integer between ${minimum} and ${maximum}`);
  }
}

function requireOneOf(id, path, value, allowedValues) {
  if (!allowedValues.includes(value)) {
    fail(id, `${path} must be one of ${allowedValues.join(", ")}`);
  }
}

function requireBoolean(id, path, value) {
  if (typeof value !== "boolean") fail(id, `${path} must be boolean`);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(id, message) {
  throw new TypeError(`Real-ROM profile "${id}" ${message}`);
}
