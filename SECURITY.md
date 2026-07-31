# Security policy

FC Emu parses untrusted ROM bytes and uses browser storage, audio and input APIs. A crash caused by a
malformed ROM is normally a correctness bug; arbitrary code execution, sandbox escape, persistent
cross-ROM data exposure or unintended network/file access is a security issue.

## Supported versions

FC Emu is pre-1.0 and has no supported release line. Security fixes target the current `master`
branch. Older commits and locally modified builds are not maintained.

## Report a vulnerability

Use GitHub's private vulnerability-reporting feature for
[Tangerg/fcemu](https://github.com/Tangerg/fcemu/security/advisories/new). Do not open a public issue
with exploit details.

Include:

- affected commit;
- browser, operating system and runtime versions;
- impact and preconditions;
- minimal reproduction using synthetic or redistributable data;
- whether persistent browser data is involved.

Do not send commercial ROMs. If the problem requires a particular byte layout, provide a minimal
homebrew fixture or a generator.

The maintainer will acknowledge a complete report, reproduce it, assess affected boundaries and
coordinate disclosure after a fix is available. No fixed response-time SLA is promised during the
pre-1.0 phase.

## Scope

Examples in scope:

- escaping the browser security model through crafted emulator input;
- reading or overwriting another ROM's battery/quick-save data;
- unbounded resource consumption that remains after the emulation session stops;
- dependency or build-pipeline compromise.

Examples generally handled as public correctness bugs:

- inaccurate emulation;
- a rejected valid header or accepted unsupported mapper;
- deterministic crashes contained to the emulator tab without a security boundary impact.
