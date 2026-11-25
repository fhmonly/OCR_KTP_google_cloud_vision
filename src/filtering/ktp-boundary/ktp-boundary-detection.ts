import { findLabelMatches } from "../../association/label-matcher.js";
import { KTP_LABELS } from "../../extraction-config.js";
import type { ProjectedBox } from "../../types.js";

import type {
  KtpBoundary,
  KtpBoundaryDetectionResult,
  KtpBoundaryOptions,
} from "./ktp-boundary-types.js";

function getExtreme(values: number[], direction: "min" | "max"): number | null {
  const validValues = values.filter(Number.isFinite);

  if (validValues.length === 0) return null;

  return direction === "min"
    ? Math.min(...validValues)
    : Math.max(...validValues);
}

export function detectKtpBoundary(
  boxes: ProjectedBox[],
  metadataIndexes: number[],
  options: KtpBoundaryOptions = {},
): KtpBoundaryDetectionResult {
  const diagnostics: string[] = [];

  const emptyResult: KtpBoundaryDetectionResult = {
    detected: false,
    boundary: null,
    anchorIndexes: {
      label: [],
      province: [],
      metadata: [],
      validUntil: [],
    },
    diagnostics,
  };

  if (boxes.length === 0) {
    diagnostics.push("No projected boxes available.");
    return emptyResult;
  }

  const labels = findLabelMatches(
    boxes,
    KTP_LABELS,
    options.labelThreshold ?? 0.65,
    {
      maxLabelGapFactor: options.maxLabelGapFactor ?? 3,
    },
  );

  // Semua box label yang berhasil dikenali.
  const labelBoxes = labels.flatMap((label) => label.boxes);

  // Anchor provinsi.
  const provinceLabel = labels.filter((label) => label.field === "province");

  const provinceBoxes = provinceLabel.flatMap((label) => label.boxes);

  // Anchor berlaku hingga.
  const validUntilLabels = labels.filter(
    (label) => label.field === "expired_date",
  );

  const validUntilBoxes = validUntilLabels.flatMap((label) => label.boxes);

  const metadataSet = new Set(metadataIndexes);

  const metadataBoxes = boxes.filter((box) =>
    metadataSet.has(box.originalIndex),
  );

  if (labelBoxes.length === 0) {
    diagnostics.push("No recognized KTP labels.");
  }

  if (provinceBoxes.length === 0) {
    diagnostics.push("Province label not found.");
  }

  if (metadataBoxes.length === 0) {
    diagnostics.push("No confirmed metadata boxes.");
  }

  // Batas kiri: bagian paling kiri dari seluruh label.
  const left = getExtreme(
    labelBoxes.map((box) => box.uMin),
    "min",
  );

  // Batas kanan: bagian paling kanan dari metadata.
  const right = getExtreme(
    metadataBoxes.map((box) => box.uMax),
    "max",
  );

  // Batas atas: bagian paling atas dari provinsi.
  const top = getExtreme(
    provinceBoxes.map((box) => box.vMin),
    "min",
  );

  // Batas bawah: metadata atau label berlaku hingga.
  const bottom = getExtreme(
    [
      ...metadataBoxes.map((box) => box.vMax),
      ...validUntilBoxes.map((box) => box.vMax),
    ],
    "max",
  );

  if (left === null || right === null || top === null || bottom === null) {
    diagnostics.push("Insufficient anchors to calculate KTP boundary.");
    return {
      ...emptyResult,
      anchorIndexes: {
        label: labelBoxes.map((box) => box.originalIndex),
        province: provinceBoxes.map((box) => box.originalIndex),
        metadata: metadataBoxes.map((box) => box.originalIndex),
        validUntil: validUntilBoxes.map((box) => box.originalIndex),
      },
    };
  }

  if (right <= left || bottom <= top) {
    diagnostics.push("Invalid KTP boundary dimensions.");
    return {
      ...emptyResult,
      anchorIndexes: {
        label: labelBoxes.map((box) => box.originalIndex),
        province: provinceBoxes.map((box) => box.originalIndex),
        metadata: metadataBoxes.map((box) => box.originalIndex),
        validUntil: validUntilBoxes.map((box) => box.originalIndex),
      },
    };
  }

  const boundary: KtpBoundary = {
    left,
    right,
    top,
    bottom,
  };

  return {
    detected: true,
    boundary,
    anchorIndexes: {
      label: labelBoxes.map((box) => box.originalIndex),
      province: provinceBoxes.map((box) => box.originalIndex),
      metadata: metadataBoxes.map((box) => box.originalIndex),
      validUntil: validUntilBoxes.map((box) => box.originalIndex),
    },
    diagnostics,
  };
}
