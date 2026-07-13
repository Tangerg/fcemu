import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [join(root, "packages/fc-emu/src"), join(root, "packages/ui/src")]
  .flatMap(walk)
  .filter((file) => /\.[tj]sx?$/.test(file) && !/\.test\.[tj]sx?$/.test(file));
const fileSet = new Set(files);
const graph = new Map(files.map((file) => [file, dependencies(file)]));
const visiting = new Set();
const visited = new Set();
const cycles = [];

for (const file of files) visit(file, []);

if (cycles.length) {
  console.error(`[check-circular] Found ${cycles.length} runtime cycle(s):`);
  cycles.forEach((cycle) =>
    console.error(`  ${cycle.map((file) => relative(root, file)).join(" -> ")}`),
  );
  process.exit(1);
}

console.log("[check-circular] OK — no runtime import cycles.");

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function dependencies(file) {
  const source = readFileSync(file, "utf8");
  const matches = source.matchAll(/import\s+(?!type\b)[\s\S]*?\s+from\s+["'](\.[^"']+)["']/g);
  return [...matches]
    .map((match) => resolveImport(file, match[1]))
    .filter((dependency) => dependency && fileSet.has(dependency));
}

function resolveImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
}

function visit(file, stack) {
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    cycles.push([...stack.slice(start), file]);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
