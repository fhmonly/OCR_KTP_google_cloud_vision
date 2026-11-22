import type { ProjectedBox } from "../../types.js";

import type {
  WatermarkBoxDiagnostic,
  WatermarkDetectionOptions,
  WatermarkDetectionResult,
} from "./watermark-types.js";

/**
 * Normalisasi sudut garis ke rentang [-90, 90).
 *
 * Orientasi garis 0 dan 180 dianggap sama.
 */
function normalizeLineAngle(angle: number): number {
  return ((((angle + 90) % 180) + 180) % 180) - 90;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

interface Candidate {
  box: ProjectedBox;
  relativeAngle: number;
  angleError: number;
}

function calculateHorizontalExtent(boxes: ProjectedBox[]): number {
  if (boxes.length === 0) {
    return 0;
  }

  const minU = Math.min(...boxes.map((box) => box.uMin));
  const maxU = Math.max(...boxes.map((box) => box.uMax));

  return Math.max(0, maxU - minU);
}

export function detectWatermarks(
  boxes: ProjectedBox[],
  orientationDegree: number,
  options: WatermarkDetectionOptions = {},
): WatermarkDetectionResult {
  const targetAngle = normalizeLineAngle(options.targetAngle ?? -45);

  const angleTolerance = clamp(options.angleTolerance ?? 12, 1, 45);

  const minCandidateCount = Math.max(
    2,
    Math.floor(options.minCandidateCount ?? 4),
  );

  const minCandidateRatio = clamp(options.minCandidateRatio ?? 0.08, 0, 1);

  const minExtentRatio = clamp(options.minExtentRatio ?? 0.25, 0, 1);

  const candidates: Candidate[] = [];

  const diagnostics: WatermarkBoxDiagnostic[] = [];

  if (!Number.isFinite(orientationDegree) || boxes.length === 0) {
    return {
      detected: false,
      orientationDegree,
      targetAngle,
      angleTolerance,
      confidence: 0,
      candidateIndexes: [],
      watermarkIndexes: [],
      diagnostics: [],
    };
  }

  // STEP 1: Cari box dengan orientasi diagonal yang sesuai.
  for (const box of boxes) {
    const boxDegree = box.box.degree;

    if (!Number.isFinite(boxDegree)) {
      continue;
    }

    const relativeAngle = normalizeLineAngle(boxDegree - orientationDegree);

    const angleError = normalizeLineAngle(relativeAngle - targetAngle);

    if (Math.abs(angleError) > angleTolerance) {
      continue;
    }

    candidates.push({
      box,
      relativeAngle,
      angleError,
    });

    diagnostics.push({
      originalIndex: box.originalIndex,
      label: box.box.label?.trim() ?? "",
      relativeAngle,
      classification: "watermark-candidate",
      confidence: 0,
      reason: "Orientasi box sesuai pola diagonal watermark.",
    });
  }

  const candidateBoxes = candidates.map((candidate) => candidate.box);

  const candidateIndexes = candidateBoxes.map((box) => box.originalIndex);

  // STEP 2: Evaluasi dukungan kandidat.
  const candidateRatio = candidates.length / boxes.length;

  const documentExtent = calculateHorizontalExtent(boxes);

  const candidateExtent = calculateHorizontalExtent(candidateBoxes);

  const extentRatio = documentExtent > 0 ? candidateExtent / documentExtent : 0;

  const meanAngleError =
    candidates.length > 0
      ? candidates.reduce(
          (sum, candidate) => sum + Math.abs(candidate.angleError),
          0,
        ) / candidates.length
      : Infinity;

  // STEP 3: Konfirmasi watermark.
  const detected =
    candidates.length >= minCandidateCount &&
    candidateRatio >= minCandidateRatio &&
    extentRatio >= minExtentRatio;

  let confidence = 0;

  if (detected) {
    const angleScore = 1 - Math.min(1, meanAngleError / angleTolerance);

    const supportScore = Math.min(
      1,
      candidateRatio / Math.max(minCandidateRatio, 0.01),
    );

    const extentScore = Math.min(
      1,
      extentRatio / Math.max(minExtentRatio, 0.01),
    );

    confidence = clamp(
      angleScore * 0.5 + supportScore * 0.25 + extentScore * 0.25,
      0,
      1,
    );

    // STEP 4: Naikkan klasifikasi kandidat menjadi watermark.
    for (const diagnostic of diagnostics) {
      diagnostic.classification = "watermark";
      diagnostic.confidence = confidence;
      diagnostic.reason =
        "Termasuk kelompok teks diagonal yang memenuhi kriteria watermark.";
    }
  }

  return {
    detected,

    orientationDegree,
    targetAngle,
    angleTolerance,

    confidence,

    candidateIndexes,

    watermarkIndexes: detected ? [...candidateIndexes] : [],

    diagnostics,
  };
}
