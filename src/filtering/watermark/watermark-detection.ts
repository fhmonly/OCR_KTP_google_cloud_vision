import type { ProjectedBox } from "../../types.js";

import { calculateWatermarkGeometry } from "./watermark-geometry.js";
import { groupWatermarkCandidates } from "./watermark-grouping.js";

import {
  estimateWatermarkOrientation,
  getRelativeLineAngle,
} from "./watermark-orientation.js";

import type {
  WatermarkBoxDiagnostic,
  WatermarkDetectionOptions,
  WatermarkDetectionResult,
} from "./watermark-types.js";

function normalizeLineAngle(angle: number): number {
  return ((((angle + 90) % 180) + 180) % 180) - 90;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function circularMean180(angles: number[]): number {
  if (angles.length === 0) return 0;

  let sinSum = 0;
  let cosSum = 0;

  for (const angle of angles) {
    const radians = (angle * 2 * Math.PI) / 180;
    sinSum += Math.sin(radians);
    cosSum += Math.cos(radians);
  }

  return normalizeLineAngle((Math.atan2(sinSum, cosSum) * 90) / Math.PI);
}

function calculateHorizontalExtent(boxes: ProjectedBox[]): number {
  if (boxes.length === 0) return 0;

  const minU = Math.min(...boxes.map((box) => box.uMin));
  const maxU = Math.max(...boxes.map((box) => box.uMax));

  return Math.max(0, maxU - minU);
}

interface Candidate {
  box: ProjectedBox;
  relativeAngle: number;
  angleError: number;
}

export function detectWatermarks(
  boxes: ProjectedBox[],
  orientationDegree: number,
  options: WatermarkDetectionOptions = {},
): WatermarkDetectionResult {
  const manualMode = options.targetAngle !== undefined;

  const angleTolerance = clamp(options.angleTolerance ?? 12, 1, 45);
  const minAngleDeviation = clamp(options.minAngleDeviation ?? 12, 1, 75);
  const maxAngleDeviation = clamp(
    options.maxAngleDeviation ?? 75,
    minAngleDeviation,
    89,
  );

  const orientation = manualMode
    ? null
    : estimateWatermarkOrientation(boxes, {
        angleTolerance: options.orientationAngleTolerance,
        minClusterSize: options.orientationMinClusterSize,
        minSupportRatio: options.orientationMinSupportRatio,
      });

  const baselineDegree =
    orientation?.degree ??
    (Number.isFinite(orientationDegree) ? orientationDegree : 0);

  const targetAngle = manualMode
    ? normalizeLineAngle(options.targetAngle ?? 0)
    : 0;

  const minCandidateCount = Math.max(
    1,
    Math.floor(options.minCandidateCount ?? (manualMode ? 4 : 2)),
  );

  const minCandidateRatio = clamp(
    options.minCandidateRatio ?? (manualMode ? 0.08 : 0.015),
    0,
    1,
  );

  const minExtentRatio = clamp(
    options.minExtentRatio ?? (manualMode ? 0.25 : 0.05),
    0,
    1,
  );

  const emptyResult = (): WatermarkDetectionResult => ({
    detected: false,
    orientationDegree: baselineDegree,
    targetAngle,
    angleTolerance,
    confidence: 0,
    candidateIndexes: [],
    watermarkIndexes: [],
    groups: [],
    diagnostics: [],
    orientation,
  });

  if (boxes.length === 0 || !Number.isFinite(baselineDegree)) {
    return emptyResult();
  }

  const candidates: Candidate[] = [];
  const diagnostics: WatermarkBoxDiagnostic[] = [];

  // STEP 1: Pilih kandidat berdasarkan penyimpangan sudut.
  for (const box of boxes) {
    const boxDegree = box.box.degree;

    if (!Number.isFinite(boxDegree)) continue;

    const relativeAngle = getRelativeLineAngle(boxDegree, baselineDegree);

    const deviation = Math.abs(relativeAngle);

    let isCandidate = false;
    let angleError = 0;

    if (manualMode) {
      angleError = normalizeLineAngle(relativeAngle - targetAngle);
      isCandidate = Math.abs(angleError) <= angleTolerance;
    } else {
      isCandidate =
        deviation >= minAngleDeviation && deviation <= maxAngleDeviation;
    }

    if (!isCandidate) continue;

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
      reason: manualMode
        ? "Sudut box sesuai konfigurasi sudut watermark manual."
        : "Sudut box menyimpang dari orientasi mayoritas; menunggu validasi spasial.",
    });
  }

  if (candidates.length === 0) {
    return {
      ...emptyResult(),
      diagnostics,
    };
  }

  const candidateBoxes = candidates.map((candidate) => candidate.box);
  const candidateIndexes = candidateBoxes.map((box) => box.originalIndex);

  // STEP 2: Tentukan arah dominan kandidat.
  const candidateDirection = manualMode
    ? targetAngle
    : circularMean180(candidates.map((candidate) => candidate.relativeAngle));

  // STEP 3: Validasi geometri dan grouping.
  const geometry = calculateWatermarkGeometry(
    candidateBoxes,
    candidateDirection,
  );

  const groups = groupWatermarkCandidates(geometry, {
    normalToleranceFactor:
      options.normalToleranceFactor ?? (manualMode ? 0.75 : 2),
    maxGapFactor: options.maxGapFactor ?? 1.5,
    minGroupSize: options.minGroupSize ?? (manualMode ? 3 : 2),
  });

  // STEP 4: Hitung dukungan kandidat.
  const candidateRatio = candidates.length / boxes.length;

  const documentExtent = calculateHorizontalExtent(boxes);
  const candidateExtent = calculateHorizontalExtent(candidateBoxes);

  const extentRatio = documentExtent > 0 ? candidateExtent / documentExtent : 0;

  const meanAngleDeviation =
    candidates.reduce(
      (sum, candidate) => sum + Math.abs(candidate.relativeAngle),
      0,
    ) / candidates.length;

  // STEP 5: Konfirmasi.
  // Kandidat tunggal tetap tercatat, tetapi tidak dihapus otomatis
  // tanpa dukungan kelompok spasial.
  const detected =
    candidates.length >= minCandidateCount &&
    candidateRatio >= minCandidateRatio &&
    extentRatio >= minExtentRatio &&
    groups.length > 0;

  let confidence = 0;

  if (detected) {
    const angleScore = manualMode
      ? 1 -
        Math.min(
          1,
          candidates.reduce(
            (sum, candidate) => sum + Math.abs(candidate.angleError),
            0,
          ) /
            candidates.length /
            angleTolerance,
        )
      : clamp(
          (meanAngleDeviation - minAngleDeviation) /
            Math.max(1, maxAngleDeviation - minAngleDeviation),
          0,
          1,
        );

    const supportScore = clamp(
      candidateRatio / Math.max(minCandidateRatio, 0.01),
      0,
      1,
    );

    const extentScore = clamp(
      extentRatio / Math.max(minExtentRatio, 0.01),
      0,
      1,
    );

    const spatialScore = Math.max(...groups.map((group) => group.continuity));

    confidence = clamp(
      angleScore * 0.35 +
        supportScore * 0.2 +
        extentScore * 0.2 +
        spatialScore * 0.25,
      0,
      1,
    );
  }

  // STEP 6: Diagnostics.
  const groupByIndex = new Map<number, number>();

  for (const group of groups) {
    for (const index of group.indexes) {
      groupByIndex.set(index, group.id);
    }
  }

  for (const diagnostic of diagnostics) {
    const groupId = groupByIndex.get(diagnostic.originalIndex);

    if (groupId !== undefined) {
      diagnostic.groupId = groupId;
    }

    if (detected) {
      diagnostic.classification = "watermark";
      diagnostic.confidence = confidence;
      diagnostic.reason =
        groupId !== undefined
          ? "Kandidat memenuhi dukungan sudut dan validasi spasial watermark."
          : "Kandidat berada pada arah sudut watermark yang terkonfirmasi.";
    } else {
      diagnostic.reason =
        "Kandidat belum memenuhi seluruh syarat konfirmasi; box dipertahankan.";
    }
  }

  return {
    detected,
    orientationDegree: baselineDegree,
    targetAngle: candidateDirection,
    angleTolerance,
    confidence,
    candidateIndexes,
    watermarkIndexes: detected ? [...candidateIndexes] : [],
    groups,
    diagnostics,
    orientation,
  };
}
