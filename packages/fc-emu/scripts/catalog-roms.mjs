import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Emulator } from "../dist/index.js";
import { parseCartridgeHeader } from "../dist/domain/model/cartridge-header.js";

const CATALOG_DIRECTORY = "_catalog";
const NES_SIGNATURE = Buffer.from([0x4e, 0x45, 0x53, 0x1a]);

const options = parseArguments(process.argv.slice(2));
const root = path.resolve(options.root);
const rootStats = await stat(root).catch(() => undefined);
if (!rootStats?.isDirectory()) throw new Error(`ROM root is not a directory: ${root}`);

const sourcePaths = await findRomFiles(root);
if (sourcePaths.length === 0) throw new Error(`No .nes files found under ${root}`);

const entries = [];
for (const [index, sourcePath] of sourcePaths.entries()) {
  entries.push(await inspectRom(root, sourcePath));
  if ((index + 1) % 250 === 0) {
    process.stderr.write(`Inspected ${index + 1}/${sourcePaths.length} ROMs\n`);
  }
}

assignCanonicalEntries(entries);
assignTargets(entries);

if (options.apply) {
  await applyMoves(root, entries);
  refreshDuplicateTargets(entries);
  await writeReports(root, entries);
}

const summary = createSummary(entries);
process.stdout.write(
  `${JSON.stringify({ mode: options.apply ? "apply" : "dry-run", root, ...summary }, null, 2)}\n`,
);
if (!options.apply) {
  process.stdout.write(
    `Dry run only. Re-run with --apply to organize files and write ${CATALOG_DIRECTORY}/.\n`,
  );
}

function parseArguments(args) {
  const apply = args.includes("--apply");
  const unknown = args.filter((argument) => argument.startsWith("--") && argument !== "--apply");
  const positional = args.filter((argument) => !argument.startsWith("--"));
  if (unknown.length > 0 || positional.length !== 1) {
    throw new Error("Usage: catalog-roms.mjs /absolute/path/to/roms [--apply]");
  }
  return { apply, root: positional[0] };
}

async function findRomFiles(directory) {
  const directoryEntries = await readdir(directory, { recursive: true, withFileTypes: true });
  return directoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".nes") &&
        !path.relative(directory, entry.parentPath).split(path.sep).includes(CATALOG_DIRECTORY),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((left, right) => left.localeCompare(right, "en"));
}

async function inspectRom(rootDirectory, sourcePath) {
  const bytes = await readFile(sourcePath);
  const originalPath = normalizeRelativePath(path.relative(rootDirectory, sourcePath));
  const fileSha256 = sha256(bytes);
  const base = {
    originalPath,
    path: originalPath,
    byteLength: bytes.byteLength,
    fileSha256,
  };

  if (bytes.byteLength < 16 || !bytes.subarray(0, 4).equals(NES_SIGNATURE)) {
    return {
      ...base,
      inspection: "invalid-header",
      error: bytes.byteLength < 16 ? "FILE_TOO_SMALL" : "INVALID_SIGNATURE",
      payloadSha256: fileSha256,
      expectedByteLength: undefined,
      trailingBytes: 0,
      dirtyReservedHeader: false,
    };
  }

  try {
    const arrayBuffer = toArrayBuffer(bytes);
    const header = parseCartridgeHeader(arrayBuffer, originalPath);
    const expectedByteLength =
      16 + (header.hasTrainer ? 512 : 0) + header.prgRomSize + header.chrRomSize;
    const trailingBytes = Math.max(0, bytes.byteLength - expectedByteLength);
    const truncated = bytes.byteLength < expectedByteLength;
    const dirtyReservedHeader =
      header.format === "ines" && bytes.subarray(12, 16).some((value) => value !== 0);
    const payloadSha256 = sha256(bytes.subarray(0, Math.min(bytes.byteLength, expectedByteLength)));
    const load = inspectLoadability(arrayBuffer, originalPath);

    return {
      ...base,
      inspection: truncated
        ? "truncated"
        : dirtyReservedHeader
          ? "dirty-header"
          : trailingBytes > 0
            ? "trailing-data"
            : load.status,
      format: header.format,
      mapper: header.mapperNumber,
      submapper: header.submapperNumber,
      consoleType: header.consoleType,
      timingMode: header.timingMode,
      hasTrainer: header.hasTrainer,
      hasBattery: header.hasBatteryFlag,
      prgRomBytes: header.prgRomSize,
      chrRomBytes: header.chrRomSize,
      expectedByteLength,
      trailingBytes,
      dirtyReservedHeader,
      payloadSha256,
      loadStatus: load.status,
      error: load.error,
    };
  } catch (error) {
    return {
      ...base,
      inspection: "invalid-header",
      error: formatError(error),
      payloadSha256: fileSha256,
      expectedByteLength: undefined,
      trailingBytes: 0,
      dirtyReservedHeader: false,
    };
  }
}

function inspectLoadability(arrayBuffer, sourceName) {
  try {
    Emulator.fromRom(arrayBuffer, sourceName);
    return { status: "loadable", error: undefined };
  } catch (error) {
    if (error?.name === "UnsupportedMapperError") {
      return { status: "unsupported-mapper", error: formatError(error) };
    }
    return { status: "incompatible", error: formatError(error) };
  }
}

function assignCanonicalEntries(entries) {
  const groups = Map.groupBy(entries, (entry) => entry.payloadSha256);
  for (const group of groups.values()) {
    group.sort(compareCanonicalPreference);
    const canonical = group[0];
    for (const duplicate of group.slice(1)) duplicate.duplicateOfSha256 = canonical.payloadSha256;
  }
}

function compareCanonicalPreference(left, right) {
  const scoreDifference = canonicalScore(right) - canonicalScore(left);
  return scoreDifference || left.originalPath.localeCompare(right.originalPath, "en");
}

function canonicalScore(entry) {
  let score = 0;
  if (entry.inspection === "loadable") score += 100;
  if (entry.trailingBytes === 0) score += 20;
  if (!entry.dirtyReservedHeader) score += 10;
  if (entry.originalPath.startsWith("classified/")) score += 5;
  if (entry.originalPath.startsWith("duplicates/")) score -= 100;
  return score;
}

function assignTargets(entries) {
  const canonicalByPayload = new Map(
    entries
      .filter((entry) => !entry.duplicateOfSha256)
      .map((entry) => [entry.payloadSha256, entry]),
  );
  for (const entry of entries) {
    const mapperDirectory =
      entry.mapper === undefined
        ? "unknown-mapper"
        : `mapper-${String(entry.mapper).padStart(3, "0")}`;
    const submapperDirectory =
      entry.format === "nes2" && entry.submapper > 0
        ? `submapper-${String(entry.submapper).padStart(2, "0")}`
        : undefined;
    const boardPath = submapperDirectory
      ? path.join(mapperDirectory, submapperDirectory)
      : mapperDirectory;

    if (entry.duplicateOfSha256) {
      const canonical = canonicalByPayload.get(entry.duplicateOfSha256);
      entry.duplicateOf = canonical?.originalPath;
      entry.targetDirectory = path.join("duplicates", boardPath);
    } else {
      entry.targetDirectory = categoryDirectory(entry, boardPath);
    }
    entry.targetPath = normalizeRelativePath(
      path.join(entry.targetDirectory, path.basename(entry.originalPath)),
    );
  }
  for (const entry of entries) {
    if (!entry.duplicateOfSha256) continue;
    entry.duplicateOf = canonicalByPayload.get(entry.duplicateOfSha256)?.targetPath;
  }
}

function categoryDirectory(entry, boardPath) {
  switch (entry.inspection) {
    case "loadable":
      return path.join("classified", "loadable", boardPath);
    case "unsupported-mapper":
      return path.join("classified", "unsupported", boardPath);
    case "dirty-header":
      return path.join("review", "dirty-header", boardPath);
    case "trailing-data":
      return path.join("review", "trailing-data", boardPath);
    case "incompatible":
      return path.join("review", "incompatible", boardPath);
    case "truncated":
      return path.join("quarantine", "truncated", boardPath);
    default:
      return path.join("quarantine", "invalid-header", boardPath);
  }
}

async function applyMoves(rootDirectory, entries) {
  const occupiedTargets = new Set();
  for (const entry of entries) {
    const sourcePath = path.join(rootDirectory, entry.originalPath);
    let relativeTarget = entry.targetPath;
    let targetPath = path.join(rootDirectory, relativeTarget);
    if (path.resolve(sourcePath) === path.resolve(targetPath)) {
      occupiedTargets.add(relativeTarget);
      entry.path = relativeTarget;
      continue;
    }

    relativeTarget = await findAvailableTarget(
      rootDirectory,
      relativeTarget,
      entry.payloadSha256,
      occupiedTargets,
    );
    targetPath = path.join(rootDirectory, relativeTarget);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rename(sourcePath, targetPath);
    occupiedTargets.add(relativeTarget);
    entry.path = relativeTarget;
    entry.targetPath = relativeTarget;
  }
}

function refreshDuplicateTargets(entries) {
  const canonicalByPayload = new Map(
    entries
      .filter((entry) => !entry.duplicateOfSha256)
      .map((entry) => [entry.payloadSha256, entry]),
  );
  for (const entry of entries) {
    if (!entry.duplicateOfSha256) continue;
    entry.duplicateOf = canonicalByPayload.get(entry.duplicateOfSha256)?.path;
  }
}

async function findAvailableTarget(rootDirectory, relativeTarget, payloadSha256, occupiedTargets) {
  if (
    !occupiedTargets.has(relativeTarget) &&
    !(await pathExists(path.join(rootDirectory, relativeTarget)))
  ) {
    return relativeTarget;
  }

  const extension = path.extname(relativeTarget);
  const stem = relativeTarget.slice(0, -extension.length);
  const suffix = payloadSha256.slice(0, 12);
  for (let attempt = 1; ; attempt++) {
    const discriminator = attempt === 1 ? suffix : `${suffix}-${attempt}`;
    const candidate = `${stem} [${discriminator}]${extension}`;
    if (
      !occupiedTargets.has(candidate) &&
      !(await pathExists(path.join(rootDirectory, candidate)))
    ) {
      return candidate;
    }
  }
}

async function writeReports(rootDirectory, entries) {
  const catalogDirectory = path.join(rootDirectory, CATALOG_DIRECTORY);
  await mkdir(catalogDirectory, { recursive: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
  const summary = createSummary(sortedEntries);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    root: rootDirectory,
    summary,
    roms: sortedEntries.map(publicEntry),
  };
  await writeFile(path.join(catalogDirectory, "roms.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(
    path.join(catalogDirectory, "mapper-coverage.csv"),
    createCoverageCsv(sortedEntries),
  );
  await writeFile(path.join(catalogDirectory, "README.md"), createLocalReadme(summary));
}

function publicEntry(entry) {
  const { targetDirectory: _, targetPath: __, ...publicFields } = entry;
  return publicFields;
}

function createSummary(entries) {
  const inspections = countBy(entries, (entry) => entry.inspection);
  const canonicalEntries = entries.filter((entry) => !entry.duplicateOfSha256);
  const mapperIds = new Set(
    entries.flatMap((entry) => (entry.mapper === undefined ? [] : [entry.mapper])),
  );
  const loadableMapperIds = [
    ...new Set(
      canonicalEntries.flatMap((entry) => (entry.loadStatus === "loadable" ? [entry.mapper] : [])),
    ),
  ].sort((left, right) => left - right);
  return {
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
    canonicalFiles: canonicalEntries.length,
    duplicateFiles: entries.length - canonicalEntries.length,
    mapperCount: mapperIds.size,
    loadableMapperCount: loadableMapperIds.length,
    loadableMapperIds,
    inspections,
  };
}

function createCoverageCsv(entries) {
  const byMapper = Map.groupBy(entries, (entry) =>
    entry.mapper === undefined ? "unknown" : String(entry.mapper),
  );
  const rows = [
    [
      "mapper",
      "files",
      "canonical_files",
      "duplicates",
      "loadable",
      "unsupported_mapper",
      "incompatible",
      "dirty_header",
      "trailing_data",
      "truncated",
      "invalid_header",
    ],
  ];
  for (const [mapper, mapperEntries] of [...byMapper].sort(compareMapperKeys)) {
    const inspections = countBy(mapperEntries, (entry) => entry.inspection);
    const canonicalFiles = mapperEntries.filter((entry) => !entry.duplicateOfSha256).length;
    rows.push([
      mapper,
      mapperEntries.length,
      canonicalFiles,
      mapperEntries.length - canonicalFiles,
      inspections.loadable ?? 0,
      inspections["unsupported-mapper"] ?? 0,
      inspections.incompatible ?? 0,
      inspections["dirty-header"] ?? 0,
      inspections["trailing-data"] ?? 0,
      inspections.truncated ?? 0,
      inspections["invalid-header"] ?? 0,
    ]);
  }
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

function compareMapperKeys([left], [right]) {
  if (left === "unknown") return 1;
  if (right === "unknown") return -1;
  return Number(left) - Number(right);
}

function createLocalReadme(summary) {
  return `# Local ROM catalog

Generated by \`yarn catalog:roms -- ${root} --apply\`.

- No ROM was deleted, patched or normalized.
- \`classified/loadable\` contains images accepted by the current public emulator facade.
- \`classified/unsupported\` contains valid headers whose mapper is not implemented.
- \`review\` contains dirty headers, trailing bytes or implemented boards with incompatible metadata.
- \`quarantine\` contains incomplete or invalid images.
- \`duplicates\` preserves non-canonical copies grouped by parsed mapper.
- \`roms.json\` records SHA-256, header metadata, warnings and the resulting path.
- \`mapper-coverage.csv\` is an aggregate only; filenames are identities only after checksum review.

Current summary: ${summary.files} files, ${summary.canonicalFiles} canonical payloads, ${summary.duplicateFiles} duplicates and ${summary.loadableMapperCount} loadable mapper IDs.
`;
}

function countBy(values, keyOf) {
  const counts = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function toArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function formatError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function pathExists(filePath) {
  return Boolean(await stat(filePath).catch(() => undefined));
}
