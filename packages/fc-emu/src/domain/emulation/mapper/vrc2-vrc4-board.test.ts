import { describe, expect, it } from "vitest";
import { findVrc24Board, translateVrc24Port } from "./vrc2-vrc4-board.js";

describe("VRC2/VRC4 board wiring", () => {
  it.each([
    { mapper: 21, submapper: 1, id: "vrc4a", addresses: [0x8000, 0x8002, 0x8004, 0x8006] },
    { mapper: 21, submapper: 2, id: "vrc4c", addresses: [0x8000, 0x8040, 0x8080, 0x80c0] },
    { mapper: 22, submapper: 0, id: "vrc2a", addresses: [0x8000, 0x8002, 0x8001, 0x8003] },
    { mapper: 23, submapper: 1, id: "vrc4f", addresses: [0x8000, 0x8001, 0x8002, 0x8003] },
    { mapper: 23, submapper: 2, id: "vrc4e", addresses: [0x8000, 0x8004, 0x8008, 0x800c] },
    { mapper: 23, submapper: 3, id: "vrc2b", addresses: [0x8000, 0x8001, 0x8002, 0x8003] },
    { mapper: 25, submapper: 1, id: "vrc4b", addresses: [0x8000, 0x8002, 0x8001, 0x8003] },
    { mapper: 25, submapper: 2, id: "vrc4d", addresses: [0x8000, 0x8008, 0x8004, 0x800c] },
    { mapper: 25, submapper: 3, id: "vrc2c", addresses: [0x8000, 0x8002, 0x8001, 0x8003] },
  ])("routes mapper $mapper submapper $submapper ($id)", ({ mapper, submapper, id, addresses }) => {
    const board = findVrc24Board(mapper, submapper);
    expect(board?.id).toBe(id);
    if (!board) throw new Error("Expected allocated VRC board");
    expect(addresses.map((address) => translateVrc24Port(board, address))).toEqual([0, 1, 2, 3]);
  });

  it.each([
    {
      mapper: 21,
      primary: [0x8000, 0x8002, 0x8004, 0x8006],
      alternate: [0x8000, 0x8040, 0x8080, 0x80c0],
    },
    {
      mapper: 23,
      primary: [0x8000, 0x8001, 0x8002, 0x8003],
      alternate: [0x8000, 0x8004, 0x8008, 0x800c],
    },
    {
      mapper: 25,
      primary: [0x8000, 0x8002, 0x8001, 0x8003],
      alternate: [0x8000, 0x8008, 0x8004, 0x800c],
    },
  ])(
    "keeps mapper $mapper submapper 0 compatible with both historical address schemes",
    ({ mapper, primary, alternate }) => {
      const board = findVrc24Board(mapper, 0);
      if (!board) throw new Error("Expected compatibility VRC board");
      expect(primary.map((address) => translateVrc24Port(board, address))).toEqual([0, 1, 2, 3]);
      expect(alternate.map((address) => translateVrc24Port(board, address))).toEqual([0, 1, 2, 3]);
    },
  );

  it.each([
    [21, 3],
    [21, 4],
    [22, 1],
    [23, 4],
    [25, 4],
    [24, 0],
  ])("does not invent mapper %i submapper %i boards", (mapper, submapper) => {
    expect(findVrc24Board(mapper, submapper)).toBeUndefined();
  });
});
