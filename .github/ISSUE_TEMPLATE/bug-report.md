---
name: Bug report
about: Report a reproducible emulator, workbench or build defect
title: "bug: "
labels: bug
assignees: ""
---

# Bug report

> Do not attach, upload or link to a commercial ROM. Security issues belong in
> [SECURITY.md](../../SECURITY.md), not a public issue.

## Summary

Describe the observable failure and why it is a defect.

## Environment

- FC Emu commit:
- Browser and version:
- Operating system:
- Node.js and Yarn versions, if this is a development/build issue:

## Cartridge identity

Omit this section when the issue is unrelated to emulation.

- Title:
- Format (`iNES` or `NES 2.0`):
- Mapper and submapper:
- Execution region:
- ROM SHA-256, if you are legally permitted to disclose it:

Do not provide the ROM itself. Prefer a minimal homebrew or generated fixture when the byte layout
is relevant.

## Reproduction

1. Start from:
2. Perform:
3. Observe:

State whether the failure reproduces after a power cycle and with browser storage disabled or
cleared.

## Expected behavior

Describe the expected output or state transition. For an accuracy issue, link the hardware source or
known-good redistributable test.

## Diagnostics

Paste the workbench diagnostics and concise console output. Remove local paths, credentials and
unrelated browser data.

## Additional context

Include screenshots only when they show information that cannot be represented as text. Do not
include copyrighted game data beyond what is necessary to identify the issue.
