import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const manifestPath = path.join(packageRoot, "test-support", "test-rom-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const destinationRoot = path.resolve(packageRoot, manifest.destination);

let cached = 0;
let downloaded = 0;
const upstreams = new Set();
for (const fixture of manifest.files) {
  const upstream = fixture.upstream ?? manifest.upstream;
  upstreams.add(`${upstream.repository}@${upstream.revision}`);
  const destination = resolveWithin(destinationRoot, fixture.path);
  const existing = await readFile(destination).catch(() => undefined);
  if (existing) {
    validateFixture(existing, fixture, destination);
    cached++;
    continue;
  }

  const baseUrl = `${upstream.repository.replace("github.com", "raw.githubusercontent.com")}/${upstream.revision}`;
  const source = new URL(fixture.upstreamPath, `${baseUrl}/`);
  if (source.protocol !== "https:" || source.hostname !== "raw.githubusercontent.com") {
    throw new Error(`Refusing untrusted test-ROM source: ${source}`);
  }
  const response = await fetch(source, { redirect: "error" });
  if (!response.ok) throw new Error(`Failed to fetch ${fixture.id}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  validateFixture(bytes, fixture, source.toString());
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  downloaded++;
}

const totalBytes = (
  await Promise.all(
    manifest.files.map(
      async (fixture) => (await stat(resolveWithin(destinationRoot, fixture.path))).size,
    ),
  )
).reduce((sum, size) => sum + size, 0);

process.stdout.write(
  `${JSON.stringify(
    {
      destination: destinationRoot,
      upstreams: [...upstreams].sort(),
      fixtures: manifest.files.length,
      downloaded,
      cached,
      totalBytes,
      verified: true,
    },
    null,
    2,
  )}\n`,
);

function resolveWithin(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Manifest path escapes the test-ROM root: ${relativePath}`);
  }
  return resolved;
}

function validateFixture(bytes, fixture, source) {
  if (bytes.byteLength !== fixture.byteLength) {
    throw new Error(
      `${fixture.id} from ${source} has ${bytes.byteLength} bytes; expected ${fixture.byteLength}`,
    );
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== fixture.sha256) {
    throw new Error(`${fixture.id} from ${source} has unexpected SHA-256 ${digest}`);
  }
}
