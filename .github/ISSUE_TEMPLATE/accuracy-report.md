---
name: Accuracy report
about: Report a source-backed CPU, PPU, APU, DMA, cartridge or mapper discrepancy
title: "accuracy: "
labels: accuracy
assignees: ""
---

# Accuracy report

> Do not attach, upload or link to a commercial ROM. A title behaving differently is a symptom, not
> by itself a hardware specification.

## Hardware claim

State the chip, signal, register, cycle, board or submapper whose modeled behavior is incorrect.

## Evidence

Link the strongest available source and identify the exact section:

- Visual 2A03/2C02 result or logic-level measurement:
- NESdev Wiki or forum post with measurements:
- Redistributable conformance ROM, upstream revision and checksum:
- Independent emulator/source implementation, if no stronger evidence exists:

Explain whether the result is measured, source-backed or inferred. Follow the hierarchy in
[Hardware evidence policy](../../docs/hardware-reference.md).

## Current behavior

Describe the smallest observable incorrect state transition, including region and relevant
CPU-cycle/PPU-dot ordering.

## Expected behavior

Describe the expected transition and how the cited evidence establishes it.

## Reproduction

Provide one of:

- a minimal synthetic unit/integration case;
- a redistributable homebrew fixture and checksum-pinned acquisition instructions;
- steps using a local commercial ROM without sharing or linking to the ROM.

Include mapper/submapper and cartridge geometry when relevant.

## Regression scope

List neighboring behavior that may share the same clock, bus or signal boundary. Do not propose a
ROM-title-specific exception.
