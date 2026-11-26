import type { ProjectedBox } from "../types.js";

import { median } from "../orientation/degree-utils.js";

import { findLabelMatches } from "./label-matcher.js";
import { findValueCandidates } from "./value-candidate.js";

import type { AssociationOptions, MatchedLabel } from "./association-types.js";

export interface LabelValueRegion {
  field: string;

  labelIndexes: number[];
  valueIndexes: number[];

  startU: number;
  endU: number;
  centerV: number;
}

export interface LabelValueRegionDetectionResult {
  labels: MatchedLabel[];
  regions: LabelValueRegion[];

  labelIndexes: number[];
  valueIndexes: number[];
  unrelatedIndexes: number[];

  filteredBoxes: ProjectedBox[];
}

interface LabelBounds {
  minU: number;
  maxU: number;
  centerV: number;
}

function getLabelBounds(label: MatchedLabel): LabelBounds | null {
  if (!label.boxes.length) {
    return null;
  }

  let minU = Infinity;
  let maxU = -Infinity;
  let centerV = 0;

  for (const box of label.boxes) {
    minU = Math.min(minU, box.uMin);
    maxU = Math.max(maxU, box.uMax);
    centerV += box.centerV;
  }

  return {
    minU,
    maxU,
    centerV: centerV / label.boxes.length,
  };
}

/**
 * Mencari batas horizontal dari label berikutnya
 * yang berada pada baris yang sama.
 */
function findNextLabelBoundary(
  currentLabel: MatchedLabel,
  labels: MatchedLabel[],
  medianHeight: number,
  sameRowToleranceFactor: number,
): number {
  const currentBounds = getLabelBounds(currentLabel);

  if (!currentBounds) {
    return Infinity;
  }

  const sameRowTolerance = Math.max(medianHeight * sameRowToleranceFactor, 1);

  let nextBoundary = Infinity;

  for (const otherLabel of labels) {
    if (otherLabel === currentLabel) {
      continue;
    }

    const otherBounds = getLabelBounds(otherLabel);

    if (!otherBounds) {
      continue;
    }

    const verticalDistance = Math.abs(
      otherBounds.centerV - currentBounds.centerV,
    );

    if (verticalDistance > sameRowTolerance) {
      continue;
    }

    // Label berikutnya harus berada di sebelah kanan.
    if (otherBounds.minU <= currentBounds.maxU) {
      continue;
    }

    nextBoundary = Math.min(nextBoundary, otherBounds.minU);
  }

  return nextBoundary;
}

/**
 * Mendeteksi box yang termasuk label atau kandidat value.
 *
 * Box yang tidak termasuk keduanya dikategorikan unrelated.
 * Fungsi ini tidak mengubah input boxes.
 */
export function detectLabelValueRegions(
  boxes: ProjectedBox[],
  definitions: Parameters<typeof findLabelMatches>[1],
  labelThreshold = 0.65,
  options: AssociationOptions = {},
): LabelValueRegionDetectionResult {
  if (!boxes.length || !definitions.length) {
    return {
      labels: [],
      regions: [],
      labelIndexes: [],
      valueIndexes: [],
      unrelatedIndexes: boxes.map((box) => box.originalIndex),
      filteredBoxes: [],
    };
  }

  const validHeights = boxes
    .map((box) => box.height)
    .filter((height) => Number.isFinite(height) && height > 0);

  const medianHeight = Math.max(median(validHeights), 1);

  const labels = findLabelMatches(boxes, definitions, labelThreshold, {
    maxLabelGapFactor: options.maxLabelGapFactor ?? 3,
  });

  const labelIndexes = new Set<number>();
  const valueIndexes = new Set<number>();

  // Semua box label harus dikecualikan dari kandidat value.
  for (const label of labels) {
    for (const box of label.boxes) {
      labelIndexes.add(box.originalIndex);
    }
  }

  const regions: LabelValueRegion[] = [];

  const sameRowToleranceFactor = options.sameRowToleranceFactor ?? 0.9;

  for (const label of labels) {
    const bounds = getLabelBounds(label);

    if (!bounds) {
      continue;
    }

    const endU = findNextLabelBoundary(
      label,
      labels,
      medianHeight,
      sameRowToleranceFactor,
    );

    const candidates = findValueCandidates(
      {
        label,
        boxes,
        excludedIndexes: labelIndexes,
        medianHeight,
        startU: bounds.maxU,
        endU,
        anchorV: bounds.centerV,
      },
      options,
    );

    const regionValueIndexes: number[] = [];

    for (const candidate of candidates) {
      const index = candidate.box.originalIndex;

      valueIndexes.add(index);
      regionValueIndexes.push(index);
    }

    regions.push({
      field: label.field,
      labelIndexes: label.boxes.map((box) => box.originalIndex),
      valueIndexes: regionValueIndexes,
      startU: bounds.maxU,
      endU,
      centerV: bounds.centerV,
    });
  }

  const unrelatedIndexes = boxes
    .filter(
      (box) =>
        !labelIndexes.has(box.originalIndex) &&
        !valueIndexes.has(box.originalIndex),
    )
    .map((box) => box.originalIndex);

  const filteredBoxes = boxes.filter(
    (box) =>
      labelIndexes.has(box.originalIndex) ||
      valueIndexes.has(box.originalIndex),
  );

  return {
    labels,
    regions,

    labelIndexes: [...labelIndexes],
    valueIndexes: [...valueIndexes],
    unrelatedIndexes,

    filteredBoxes,
  };
}
