# Mapper domain module

This directory is the cartridge-hardware submodule of the Emulation bounded context.

## Boundary

- `mapper.ts` defines the address-space contract and the narrow interrupt capability.
- `create-mapper.ts` is the only mapper-number selection point.
- Each board implementation owns its banking, mirroring, RAM protection and IRQ behavior.
- Mappers select logical `CartridgeMemory` banks; volatile/battery ownership stays in the model.
- `index.ts` exposes only the contract, factory and unsupported-mapper error to the rest of core.
- A mapper must not depend on `Bus`, CPU, PPU, browser APIs or UI concepts.

## Adding a mapper

1. Add one implementation file named after the board family, not only its numeric identifier.
2. Register its iNES mapper number in `create-mapper.ts`.
3. Add focused unit tests for PRG, CHR, mirroring, RAM and IRQ behavior that the board supports.
4. Add an external conformance ROM result when a suitable test exists; never commit commercial ROMs.
5. Update `docs/mapper-compatibility.md` with evidence and remaining limitations.

ROM title lists help choose compatibility targets, but they are not hardware specifications. Board
behavior must come from technical documentation and executable conformance evidence.
