import type { ProjectedBox } from "../../types.js";

import type {
  WatermarkDetectionResult,
  WatermarkFilterResult,
} from "./watermark-types.js";

export function filterWatermarkBoxes(
  boxes: ProjectedBox[],
  detection: WatermarkDetectionResult,
): WatermarkFilterResult {
  const watermarkIndexes = new Set(detection.watermarkIndexes);

  const filteredBoxes: ProjectedBox[] = [];
  const removedBoxes: ProjectedBox[] = [];

  for (const box of boxes) {
    if (watermarkIndexes.has(box.originalIndex)) {
      removedBoxes.push(box);
    } else {
      filteredBoxes.push(box);
    }
  }

  return {
    boxes: filteredBoxes,
    removedBoxes,
    removedIndexes: removedBoxes.map((box) => box.originalIndex),
  };
}
