import type { ProjectedBox, WordRow } from "../types.js";

import { median } from "../orientation/degree-utils.js";

interface RowClusteringOptions {
  toleranceFactor?: number;
  overlapThreshold?: number;
}

function calculateOverlapRatio(a: ProjectedBox, b: ProjectedBox): number {
  const intersection = Math.max(
    0,
    Math.min(a.vMax, b.vMax) - Math.max(a.vMin, b.vMin),
  );

  const minimumHeight = Math.min(a.height, b.height);

  if (minimumHeight <= 0) {
    return 0;
  }

  return intersection / minimumHeight;
}

function calculateRowHeight(boxes: ProjectedBox[]): number {
  return median(boxes.map((box) => box.height));
}

function calculateRowCenter(boxes: ProjectedBox[]): number {
  return median(boxes.map((box) => box.centerV));
}

export function clusterRows(
  projected: ProjectedBox[],
  options: RowClusteringOptions = {},
): {
  rows: WordRow[];
  rowTolerance: number;
} {
  const { toleranceFactor = 0.55, overlapThreshold = 0.3 } = options;

  if (projected.length === 0) {
    return {
      rows: [],
      rowTolerance: 0,
    };
  }

  const globalMedianHeight = median(projected.map((box) => box.height));

  const rowTolerance = globalMedianHeight * toleranceFactor;

  const sorted = [...projected].sort((a, b) => a.centerV - b.centerV);

  const rows: WordRow[] = [];

  for (const box of sorted) {
    let bestRow: WordRow | null = null;
    let bestScore = -Infinity;

    for (const row of rows) {
      const centerDistance = Math.abs(box.centerV - row.centerV);

      const overlap = row.boxes.reduce(
        (maxOverlap, existing) =>
          Math.max(maxOverlap, calculateOverlapRatio(box, existing)),
        0,
      );

      const adaptiveTolerance = Math.max(
        row.height * toleranceFactor,
        Math.min(box.height, row.height) * 0.45,
      );

      const isSameRow =
        overlap >= overlapThreshold || centerDistance <= adaptiveTolerance;

      if (!isSameRow) {
        continue;
      }

      const distanceScore = 1 - centerDistance / Math.max(adaptiveTolerance, 1);

      const score = overlap * 0.7 + distanceScore * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    if (bestRow) {
      bestRow.boxes.push(box);

      bestRow.centerV = calculateRowCenter(bestRow.boxes);

      bestRow.height = calculateRowHeight(bestRow.boxes);
    } else {
      rows.push({
        centerV: box.centerV,
        height: box.height,
        boxes: [box],
      });
    }
  }

  // Urutkan baris berdasarkan arah V.
  rows.sort((a, b) => a.centerV - b.centerV);

  // Urutkan word dalam setiap baris berdasarkan arah U.
  for (const row of rows) {
    row.boxes.sort((a, b) => a.centerU - b.centerU);
  }

  return {
    rows,
    rowTolerance,
  };
}
