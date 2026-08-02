import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const markdownFiles = collectMarkdownFiles(root);
const failures = [];
const headingCache = new Map();

for (const file of markdownFiles) {
  const source = fs.readFileSync(file, "utf8");
  validateHeadings(file, source);
  validateLinks(file, source);
}

validateDocumentationIndex();
validateMapperCatalog();
validateSaveStateVersion();
await validateEvidenceCatalog();

if (failures.length > 0) {
  console.error(`[check-docs] Found ${failures.length} documentation problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `[check-docs] OK — ${markdownFiles.length} Markdown files, mapper/evidence catalogs and the save-state version are consistent.`,
  );
}

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files.sort();
}

function validateHeadings(file, source) {
  const headings = parseHeadings(source);
  const topLevel = headings.filter((heading) => heading.level === 1);
  if (topLevel.length !== 1) {
    fail(file, `expected exactly one H1, found ${topLevel.length}`);
  }

  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0 && heading.level > previousLevel + 1) {
      fail(file, `line ${heading.line}: heading jumps from H${previousLevel} to H${heading.level}`);
    }
    previousLevel = heading.level;
  }
}

function validateLinks(file, source) {
  const linkPattern =
    /!?\[[^\]]*]\((<[^>\n]+>|[^)\s\n]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    let destination = match[1];
    if (!destination) continue;
    if (destination.startsWith("<") && destination.endsWith(">")) {
      destination = destination.slice(1, -1);
    }

    if (destination.startsWith("#") || /^(?:https?:|mailto:|data:)/i.test(destination)) {
      if (destination.startsWith("#")) validateAnchor(file, destination.slice(1), file);
      continue;
    }
    if (
      destination.startsWith("file:") ||
      destination.startsWith("/Users/") ||
      destination.startsWith("/home/") ||
      /^[A-Za-z]:[\\/]/.test(destination)
    ) {
      fail(file, `machine-specific link is not portable: ${destination}`);
      continue;
    }

    const [encodedTarget, encodedAnchor = ""] = destination.split("#", 2);
    let target;
    try {
      target = decodeURIComponent(encodedTarget.split("?", 1)[0] ?? "");
    } catch {
      fail(file, `link has invalid percent encoding: ${destination}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), target);
    if (!isInsideRoot(resolved)) {
      fail(file, `link escapes the repository: ${destination}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      fail(file, `missing local link target: ${destination}`);
      continue;
    }
    if (encodedAnchor && fs.statSync(resolved).isFile() && resolved.endsWith(".md")) {
      validateAnchor(file, encodedAnchor, resolved);
    }
  }
}

function validateAnchor(sourceFile, encodedAnchor, targetFile) {
  let anchor;
  try {
    anchor = decodeURIComponent(encodedAnchor).toLowerCase();
  } catch {
    fail(sourceFile, `link has invalid anchor encoding: #${encodedAnchor}`);
    return;
  }
  const anchors = headingsFor(targetFile);
  if (!anchors.has(anchor)) {
    fail(
      sourceFile,
      `missing heading anchor #${encodedAnchor} in ${path.relative(root, targetFile)}`,
    );
  }
}

function headingsFor(file) {
  const cached = headingCache.get(file);
  if (cached) return cached;
  const counts = new Map();
  const anchors = new Set();
  for (const heading of parseHeadings(fs.readFileSync(file, "utf8"))) {
    const base = githubHeadingSlug(heading.text);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  headingCache.set(file, anchors);
  return anchors;
}

function parseHeadings(source) {
  const headings = [];
  let inFence = false;
  let fenceMarker = "";
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = fence[1]?.[0] ?? "";
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    headings.push({
      level: match[1]?.length ?? 0,
      text: match[2] ?? "",
      line: index + 1,
    });
  }
  return headings;
}

function githubHeadingSlug(value) {
  return value
    .replace(/!\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function validateDocumentationIndex() {
  const index = fs.readFileSync(path.join(root, "docs", "README.md"), "utf8");
  const documented = new Set(
    [...index.matchAll(/\]\((\.\/[^)#]+\.md)(?:#[^)]+)?\)/g)].map((match) =>
      path.normalize(match[1]?.slice(2) ?? ""),
    ),
  );
  const docsRoot = path.join(root, "docs");
  for (const file of markdownFiles) {
    if (!file.startsWith(`${docsRoot}${path.sep}`) || file === path.join(docsRoot, "README.md")) {
      continue;
    }
    const relative = path.relative(docsRoot, file);
    if (!documented.has(relative)) {
      fail(file, "is not linked from docs/README.md");
    }
  }
}

function validateMapperCatalog() {
  const factoryFile = path.join(
    root,
    "packages",
    "fc-emu",
    "src",
    "domain",
    "emulation",
    "mapper",
    "create-mapper.ts",
  );
  const readmeFile = path.join(root, "README.md");
  const compatibilityFile = path.join(root, "docs", "mapper-compatibility.md");
  const referenceFile = path.join(root, "docs", "mappers", "README.md");
  const factoryMappers = mapperCases(factoryFile);
  const readmeSource = fs.readFileSync(readmeFile, "utf8");
  const readmeMatch = /Implemented mapper IDs:\s+\*\*([\s\S]*?)\*\*\./.exec(readmeSource);
  const readmeMappers = readmeMatch
    ? [...(readmeMatch[1] ?? "").matchAll(/\d+/g)].map((match) => Number(match[0]))
    : [];
  const compatibilitySource = fs.readFileSync(compatibilityFile, "utf8");
  const tableMappers = [
    ...compatibilitySource.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*(?:Implemented|Verified)\s*\|/gm),
  ].map((match) => Number(match[1]));
  const referenceMappers = [
    ...fs.readFileSync(referenceFile, "utf8").matchAll(/^## .+\(([\d,\s]+)\)\s*$/gm),
  ].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter(Number.isInteger),
  );

  if (!readmeMatch) fail(readmeFile, "cannot locate the implemented mapper ID list");
  else compareMapperSets(factoryMappers, readmeMappers, readmeFile, "implemented mapper ID list");
  compareMapperSets(factoryMappers, tableMappers, compatibilityFile, "compatibility table");
  compareMapperSets(factoryMappers, referenceMappers, referenceFile, "board reference headings");
  validateMapperList(factoryMappers, factoryFile, "factory mapper switch", false);
  validateMapperList(readmeMappers, readmeFile, "implemented mapper ID list", true);
  validateMapperList(tableMappers, compatibilityFile, "compatibility table", true);
  validateMapperList(referenceMappers, referenceFile, "board reference headings", false);
}

function validateSaveStateVersion() {
  const implementationFile = path.join(
    root,
    "packages",
    "fc-emu",
    "src",
    "application",
    "emulator.ts",
  );
  const version = numericConstant(implementationFile, "SAVE_STATE_VERSION");
  if (version === undefined) return;

  const claims = [
    {
      file: path.join(root, "docs", "architecture.md"),
      pattern: /core save-state envelope is version (\d+)/i,
    },
    {
      file: path.join(root, "docs", "core-api.md"),
      pattern: /Schema\s+version (\d+) is intentionally exact/i,
    },
    {
      file: path.join(root, "docs", "engineering-roadmap.md"),
      pattern: /Transactional version-(\d+) save states/i,
    },
    {
      file: path.join(root, "docs", "subsystems", "apu.md"),
      pattern: /console's current version (\d+) save-state envelope/i,
    },
    {
      file: path.join(root, "docs", "subsystems", "clock-and-timing.md"),
      pattern: /current `SAVE_STATE_VERSION = (\d+)`/,
    },
    {
      file: path.join(root, "docs", "subsystems", "ppu.md"),
      pattern: /public save-state envelope is version (\d+)/i,
    },
  ];

  for (const claim of claims) {
    const match = claim.pattern.exec(fs.readFileSync(claim.file, "utf8"));
    if (!match) {
      fail(claim.file, "cannot locate the current save-state version statement");
      continue;
    }
    const documentedVersion = Number(match[1]);
    if (documentedVersion !== version) {
      fail(
        claim.file,
        `documents save-state version ${documentedVersion}; implementation uses ${version}`,
      );
    }
  }
}

async function validateEvidenceCatalog() {
  const compatibilityFile = path.join(root, "docs", "mapper-compatibility.md");
  const roadmapFile = path.join(root, "docs", "engineering-roadmap.md");
  const realRomsFile = path.join(root, "packages", "fc-emu", "test-support", "real-roms.md");
  const profileFile = path.join(root, "packages", "fc-emu", "scripts", "real-rom-profiles.mjs");
  const compatibilitySource = fs.readFileSync(compatibilityFile, "utf8");
  const statusRows = [
    ...compatibilitySource.matchAll(/^\|\s*(\d+)\s*\|\s*[^|]+\|\s*(Implemented|Verified)\s*\|/gm),
  ].map((match) => ({ mapper: Number(match[1]), status: match[2] }));
  const verifiedMappers = statusRows
    .filter((row) => row.status === "Verified")
    .map((row) => row.mapper);
  const pendingMappers = statusRows
    .filter((row) => row.status === "Implemented")
    .map((row) => row.mapper);

  const roadmapSource = fs.readFileSync(roadmapFile, "utf8");
  const mapperCountClaim =
    /- (\d+) implemented mapper IDs; (\d+) mapper IDs currently have reproducible external or pinned/.exec(
      roadmapSource,
    );
  if (!mapperCountClaim) {
    fail(roadmapFile, "cannot locate the implemented/verified mapper count statement");
  } else {
    checkDocumentedCount(
      roadmapFile,
      "implemented mapper count",
      Number(mapperCountClaim[1]),
      statusRows.length,
    );
    checkDocumentedCount(
      roadmapFile,
      "verified mapper count",
      Number(mapperCountClaim[2]),
      verifiedMappers.length,
    );
  }

  const pendingClaim =
    /The largest compatibility risk[^.]+\.\s+Mappers ([^.]+)\s+are implemented but do not yet have executable external verification\./.exec(
      roadmapSource,
    );
  if (!pendingClaim) {
    fail(roadmapFile, "cannot locate the implemented-without-verification mapper list");
  } else {
    const documentedPending = [...(pendingClaim[1] ?? "").matchAll(/\d+/g)].map((match) =>
      Number(match[0]),
    );
    compareMapperSets(
      pendingMappers,
      documentedPending,
      roadmapFile,
      "implemented-without-verification mapper list",
    );
    validateMapperList(
      documentedPending,
      roadmapFile,
      "implemented-without-verification mapper list",
      true,
    );
  }

  const { REAL_ROM_PROFILES: profiles } = await import(pathToFileURL(profileFile).href);
  const profileIds = Object.keys(profiles);
  const realRomsSource = fs.readFileSync(realRomsFile, "utf8");
  const documentedProfileIds = [...realRomsSource.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map(
    (match) => match[1],
  );
  compareTextSets(profileIds, documentedProfileIds, realRomsFile, "real-ROM profile table");

  const realRomsCountClaim = /The current profiles cover (\d+) files/.exec(realRomsSource);
  if (!realRomsCountClaim) {
    fail(realRomsFile, "cannot locate the real-ROM profile count statement");
  } else {
    checkDocumentedCount(
      realRomsFile,
      "real-ROM profile count",
      Number(realRomsCountClaim[1]),
      profileIds.length,
    );
  }

  const roadmapProfileClaim = /and (\d+) local real-ROM smoke profiles\./.exec(roadmapSource);
  if (!roadmapProfileClaim) {
    fail(roadmapFile, "cannot locate the local real-ROM profile count statement");
  } else {
    checkDocumentedCount(
      roadmapFile,
      "local real-ROM profile count",
      Number(roadmapProfileClaim[1]),
      profileIds.length,
    );
  }
}

function checkDocumentedCount(file, label, documented, actual) {
  if (documented !== actual) fail(file, `${label} is ${documented}; current catalog has ${actual}`);
}

function compareTextSets(expected, actual, file, label) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = [...expectedSet].filter((value) => !actualSet.has(value));
  const extra = [...actualSet].filter((value) => !expectedSet.has(value));
  if (missing.length > 0) fail(file, `${label} is missing: ${missing.join(", ")}`);
  if (extra.length > 0) fail(file, `${label} lists unknown entries: ${extra.join(", ")}`);
  if (actualSet.size !== actual.length) fail(file, `${label} repeats a profile ID`);
}

function numericConstant(file, name) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isNumericLiteral(declaration.initializer)
      ) {
        return Number(declaration.initializer.text);
      }
    }
  }
  fail(file, `cannot locate numeric constant ${name}`);
  return undefined;
}

function mapperCases(file) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const factory = sourceFile.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "createMapper",
  );
  const selection = factory?.body?.statements.find(
    (statement) =>
      ts.isSwitchStatement(statement) &&
      statement.expression.getText(sourceFile) === "cartridge.mapperNumber",
  );
  if (!selection) {
    fail(file, "cannot locate createMapper's mapper-number switch");
    return [];
  }
  return selection.caseBlock.clauses.flatMap((clause) =>
    ts.isCaseClause(clause) && ts.isNumericLiteral(clause.expression)
      ? [Number(clause.expression.text)]
      : [],
  );
}

function compareMapperSets(expected, actual, file, label) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = [...expectedSet].filter((mapper) => !actualSet.has(mapper));
  const extra = [...actualSet].filter((mapper) => !expectedSet.has(mapper));
  if (missing.length > 0) fail(file, `${label} is missing mapper(s): ${missing.join(", ")}`);
  if (extra.length > 0) fail(file, `${label} lists unregistered mapper(s): ${extra.join(", ")}`);
}

function validateMapperList(values, file, label, requireAscendingOrder) {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    fail(file, `${label} repeats mapper(s): ${[...new Set(duplicates)].join(", ")}`);
  }
  if (
    requireAscendingOrder &&
    values.some((value, index) => index > 0 && value < values[index - 1])
  ) {
    fail(file, `${label} must be ordered by mapper number`);
  }
}

function isInsideRoot(file) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function fail(file, message) {
  failures.push(`${path.relative(root, file)}: ${message}`);
}
