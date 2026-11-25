import type { ProjectedBox } from "../../types.js";

import type {
  KtpBoundary,
  KtpBoundaryFilterResult,
} from "./ktp-boundary-types.js";

function calculateOverlapRatio(
  box: ProjectedBox,
  boundary: KtpBoundary,
): number {
  const width = box.uMax - box.uMin;
  const height = box.vMax - box.vMin;

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 0;
  }

  const intersectionWidth = Math.max(
    0,
    Math.min(box.uMax, boundary.right) - Math.max(box.uMin, boundary.left),
  );

  const intersectionHeight = Math.max(
    0,
    Math.min(box.vMax, boundary.bottom) - Math.max(box.vMin, boundary.top),
  );

  return Math.min(
    1,
    (intersectionWidth * intersectionHeight) / (width * height),
  );
}

export function filterOutsideKtpBoxes(
  boxes: ProjectedBox[],
  boundary: KtpBoundary,
  minOverlapRatio = 0.5,
): KtpBoundaryFilterResult {
  const safeThreshold = Math.min(1, Math.max(0, minOverlapRatio));

  const retained: ProjectedBox[] = [];
  const outside: ProjectedBox[] = [];

  for (const box of boxes) {
    const overlapRatio = calculateOverlapRatio(box, boundary);

    if (overlapRatio < safeThreshold) {
      outside.push(box);
    } else {
      retained.push(box);
    }
  }

  return {
    boxes: retained,
    outsideBoxes: outside,
    outsideIndexes: outside.map((box) => box.originalIndex),
  };
}
