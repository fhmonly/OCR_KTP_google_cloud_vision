import type { ProjectedBox } from "../../types.js";
import type {
  MetadataDetectionResult,
  MetadataFilterResult,
} from "./metadata-types.js";

export function filterMetadataBoxes(
  boxes: ProjectedBox[],
  detection: MetadataDetectionResult,
): MetadataFilterResult {
  const metadataIndexes = new Set(detection.metadataIndexes);

  const filteredBoxes: ProjectedBox[] = [];
  const removedBoxes: ProjectedBox[] = [];

  for (const box of boxes) {
    if (metadataIndexes.has(box.originalIndex)) {
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
