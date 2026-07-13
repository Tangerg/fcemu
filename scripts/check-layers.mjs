import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = [join(root, "packages/fc-emu/src"), join(root, "packages/ui/src")];
const files = sourceRoots.flatMap(walk).filter((file) => /\.[tj]sx?$/.test(file));
const violations = [];
const coreBrowserIdentifiers = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "HTMLElement",
  "HTMLCanvasElement",
  "AudioContext",
  "AudioNode",
  "ImageData",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "Blob",
  "File",
]);
const innerUiBrowserIdentifiers = new Set([
  "window",
  "document",
  "HTMLCanvasElement",
  "AudioContext",
  "requestAnimationFrame",
  "File",
]);

for (const file of files) {
  if (/\.test\.[tj]sx?$/.test(file)) continue;
  const source = readFileSync(file, "utf8");
  const packageName = file.includes("/packages/fc-emu/") ? "core" : "ui";
  const sourceRelative = relative(
    join(root, `packages/${packageName === "core" ? "fc-emu" : "ui"}/src`),
    file,
  );
  const fromLayer = layerOf(packageName, sourceRelative);

  for (const specifier of importsOf(source)) {
    if (specifier.startsWith("@fcemu/core")) {
      if (packageName !== "ui" || specifier !== "@fcemu/core") {
        violations.push(`${relative(root, file)} bypasses the @fcemu/core public entry`);
      }
      if (packageName === "ui" && fromLayer !== "infrastructure") {
        violations.push(
          `${relative(root, file)} couples ${fromLayer} directly to the core adapter`,
        );
      }
      continue;
    }
    if (!specifier.startsWith(".")) continue;
    const target = normalize(join(dirname(file), specifier.replace(/\.js$/, ".ts")));
    const packageRoot = join(root, `packages/${packageName === "core" ? "fc-emu" : "ui"}/src`);
    if (!target.startsWith(packageRoot)) {
      violations.push(`${relative(root, file)} imports outside its package: ${specifier}`);
      continue;
    }
    const toLayer = layerOf(packageName, relative(packageRoot, target));
    if (!allowedLayers(packageName, fromLayer).includes(toLayer)) {
      violations.push(
        `${relative(root, file)} has an outward dependency: ${fromLayer} -> ${toLayer}`,
      );
    }
  }

  const identifiers = identifiersOf(source);
  if (packageName === "core" && hasAny(identifiers, coreBrowserIdentifiers)) {
    violations.push(`${relative(root, file)} couples the emulator core to a browser API`);
  }
  if (
    packageName === "ui" &&
    (fromLayer === "domain" || fromLayer === "application") &&
    hasAny(identifiers, innerUiBrowserIdentifiers)
  ) {
    violations.push(`${relative(root, file)} couples an inner UI layer to a browser API`);
  }
}

if (violations.length) {
  console.error(`[check-layers] Found ${violations.length} architecture violation(s):`);
  violations.forEach((violation) => console.error(`  ${violation}`));
  process.exit(1);
}

console.log("[check-layers] OK — package and clean-architecture boundaries are intact.");

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function importsOf(source) {
  return [
    ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g),
  ].map((match) => match[1]);
}

function identifiersOf(source) {
  const identifiers = new Set();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.Identifier) identifiers.add(scanner.getTokenText());
  }
  return identifiers;
}

function hasAny(actual, forbidden) {
  return [...forbidden].some((identifier) => actual.has(identifier));
}

function layerOf(packageName, path) {
  const first = path.split("/")[0];
  if (packageName === "core") return first === "index.ts" ? "public" : first;
  return ["domain", "application", "infrastructure", "presentation", "app"].includes(first)
    ? first
    : "entry";
}

function allowedLayers(packageName, layer) {
  if (packageName === "core") {
    return (
      {
        domain: ["domain"],
        application: ["domain", "application"],
        public: ["domain", "application", "public"],
      }[layer] ?? [layer]
    );
  }
  return (
    {
      domain: ["domain"],
      application: ["domain", "application"],
      infrastructure: ["domain", "application", "infrastructure"],
      presentation: ["domain", "application", "presentation"],
      app: ["domain", "application", "infrastructure", "presentation", "app"],
      entry: ["app", "presentation", "entry"],
    }[layer] ?? [layer]
  );
}
