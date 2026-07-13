import { describe, expect, it } from "vitest";
import { SpriteDma, type SpriteDmaCycle, type SpriteDmaPort } from "./sprite-dma.js";

describe("SpriteDma", () => {
  it("copies one page after its halt cycle when granted matching bus phases", () => {
    const source = Uint8Array.from({ length: 0x100 }, (_, index) => index ^ 0xa5);
    const destination: number[] = [];
    const reads: number[] = [];
    const port: SpriteDmaPort = {
      readCpuByteForDma(address) {
        reads.push(address);
        return source[address & 0xff] ?? 0;
      },
      writeOamByteForDma(value) {
        destination.push(value);
      },
    };
    const dma = new SpriteDma();
    const phases: SpriteDmaCycle[] = [];

    dma.start(0x02);
    while (dma.active) phases.push(dma.clock(port));

    expect(phases).toHaveLength(513);
    expect(phases.slice(0, 3)).toEqual(["halt", "get", "put"]);
    expect(reads).toHaveLength(0x100);
    expect(reads[0]).toBe(0x0200);
    expect(reads.at(-1)).toBe(0x02ff);
    expect(destination).toEqual([...source]);
  });

  it("uses the most recent $4014 page written before the CPU is halted", () => {
    const reads: number[] = [];
    const dma = new SpriteDma();
    dma.start(0x02);
    dma.start(0x03);

    dma.clock({
      readCpuByteForDma(address) {
        reads.push(address);
        return 0;
      },
      writeOamByteForDma() {},
    });
    dma.clock({
      readCpuByteForDma(address) {
        reads.push(address);
        return 0;
      },
      writeOamByteForDma() {},
    });

    expect(reads).toEqual([0x0300]);
  });

  it("cancels an in-flight transfer on reset", () => {
    const dma = new SpriteDma();
    dma.start(0x02);
    dma.reset();
    expect(dma.active).toBe(false);
  });
});
