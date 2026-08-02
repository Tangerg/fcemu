import type { OekaKidsTabletInput } from "../application/ports.js";

const FRAME_WIDTH = 256;
const FRAME_HEIGHT = 240;
const TABLET_WIDTH = 240;
const TABLET_HEIGHT = 256;

type ElementBounds = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** Maps a pointer over an object-fit: contain NES canvas to tablet-native coordinates. */
export function mapOekaKidsTabletPointer(
  bounds: ElementBounds,
  clientX: number,
  clientY: number,
  contact: boolean,
  clicked: boolean,
): OekaKidsTabletInput {
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height, clientX, clientY].every(
      Number.isFinite,
    ) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new RangeError("Oeka Kids pointer mapping requires finite, positive canvas bounds");
  }

  const scale = Math.min(bounds.width / FRAME_WIDTH, bounds.height / FRAME_HEIGHT);
  const contentWidth = FRAME_WIDTH * scale;
  const contentHeight = FRAME_HEIGHT * scale;
  const contentLeft = bounds.left + (bounds.width - contentWidth) / 2;
  const contentTop = bounds.top + (bounds.height - contentHeight) / 2;
  const localX = clientX - contentLeft;
  const localY = clientY - contentTop;
  const inside = localX >= 0 && localX <= contentWidth && localY >= 0 && localY <= contentHeight;

  return {
    x: scaleCoordinate(localX, contentWidth, TABLET_WIDTH),
    y: scaleCoordinate(localY, contentHeight, TABLET_HEIGHT),
    touching: contact && inside,
    clicked: clicked && contact && inside,
  };
}

function scaleCoordinate(value: number, sourceExtent: number, targetExtent: number): number {
  const scaled = Math.floor((value / sourceExtent) * targetExtent);
  return Math.max(0, Math.min(targetExtent - 1, scaled));
}
