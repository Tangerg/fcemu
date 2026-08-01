const expectedRuntimeExports = [
  "CartridgeConsoleType",
  "CartridgeFormatError",
  "CartridgeTimingMode",
  "ControllerButton",
  "Emulator",
  "NametableMirroring",
  "UnsupportedMapperConfigurationError",
  "UnsupportedMapperError",
  "UnsupportedMapperVariantError",
].sort();

const core = await import("@fcemu/core");
const actualRuntimeExports = Object.keys(core).sort();
if (JSON.stringify(actualRuntimeExports) !== JSON.stringify(expectedRuntimeExports)) {
  throw new Error(
    `@fcemu/core runtime exports changed:\nexpected ${expectedRuntimeExports.join(", ")}\nreceived ${actualRuntimeExports.join(", ")}`,
  );
}

let deepImportBlocked = false;
try {
  await import("@fcemu/core/dist/application/emulator.js");
} catch (error) {
  if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") throw error;
  deepImportBlocked = true;
}
if (!deepImportBlocked) throw new Error("@fcemu/core exposes unsupported dist subpaths");

console.log(
  `[check-core-package] OK — ${actualRuntimeExports.length} runtime exports and the root-only package boundary are intact.`,
);
