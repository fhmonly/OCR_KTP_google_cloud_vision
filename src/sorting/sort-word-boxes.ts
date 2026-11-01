import type {
  SortWordBoxesResult,
  TransformedTextAnnotation,
} from "../types.js";

import { estimateMajorityDegree } from "../orientation/majority-degree.js";

import { createReadingAxes, projectWordBox } from "./coordinate-transform.js";

import { clusterRows } from "./row-clustering.js";

import { segmentHorizontalRows } from "./horizontal-segmentation.js";

interface SortWordBoxesOptions {
  degreeTolerance?: number;
  minClusterSize?: number;
  minSupportRatio?: number;

  rowToleranceFactor?: number;
  overlapThreshold?: number;

  allowUnreliableOrientation?: boolean;

  // Opsi baru.
  horizontalSegmentation?: {
    enabled?: boolean;
    heightFactor?: number;
    madFactor?: number;
  };
}

export function sortWordBoxes(
  boxes: TransformedTextAnnotation[],
  options: SortWordBoxesOptions = {},
): SortWordBoxesResult | null {
  const {
    degreeTolerance = 8,
    minClusterSize = 3,
    minSupportRatio = 0.35,

    rowToleranceFactor = 0.55,
    overlapThreshold = 0.3,

    allowUnreliableOrientation = false,
  } = options;

  const {
    enabled: segmentationEnabled = true,
    heightFactor = 2.5,
    madFactor = 3,
  } = options.horizontalSegmentation ?? {};

  // STEP 1: Deteksi majority degree.
  const orientation = estimateMajorityDegree(boxes, {
    degreeTolerance,
    minClusterSize,
    minSupportRatio,
  });

  if (!orientation) {
    return null;
  }

  if (!orientation.isReliable && !allowUnreliableOrientation) {
    return null;
  }

  // STEP 2: Buat sumbu pembacaan.
  const axes = createReadingAxes(orientation.degree);

  // STEP 3: Transformasi seluruh word box.
  const projected: any[] = [];
  let skipped = 0;

  boxes.forEach((box, index) => {
    const result = projectWordBox(box, index, axes);

    if (!result) {
      skipped++;
      return;
    }

    projected.push(result);
  });

  // STEP 4: Clustering berdasarkan baris.
  const { rows, rowTolerance } = clusterRows(projected, {
    toleranceFactor: rowToleranceFactor,
    overlapThreshold,
  });

  // STEP 5: Horizontal Gap Segmentation.
  const segments = segmentationEnabled
    ? segmentHorizontalRows(rows, {
        heightFactor,
        madFactor,
      })
    : [];

  // STEP 5: Flatten hasil sorting.
  const flat = rows.flatMap((row) => row.boxes.map((item) => item.box));

  return {
    orientation,
    rows,
    flat,
    projected,
    skipped,
    rowTolerance,
    segments,
  };
}
