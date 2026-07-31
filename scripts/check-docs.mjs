import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

if (failures.length > 0) {
  console.error(`[check-docs] Found ${failures.length} documentation problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `[check-docs] OK — ${markdownFiles.length} Markdown files have valid structure and local links.`,
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

function isInsideRoot(file) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function fail(file, message) {
  failures.push(`${path.relative(root, file)}: ${message}`);
}
