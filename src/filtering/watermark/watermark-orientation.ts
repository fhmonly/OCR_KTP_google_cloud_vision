import type { ProjectedBox } from "../../types.js";

export interface WatermarkOrientationOptions {
  angleTolerance?: number | undefined;
  minClusterSize?: number | undefined;
  minSupportRatio?: number | undefined;
}

export interface WatermarkOrientationResult {
  degree: number;
  totalBoxes: number;
  validBoxes: number;
  support: number;
  supportRatio: number;
  deviation: number;
  isReliable: boolean;
  memberIndexes: number[];
}

interface AngleEntry {
  box: ProjectedBox;
  angle: number;
}

function normalizeLineAngle(angle: number): number {
  return ((((angle + 90) % 180) + 180) % 180) - 90;
}

function angularDistance(a: number, b: number): number {
  return Math.abs(normalizeLineAngle(a - b));
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

function calculateDeviation(angles: number[], center: number): number {
  if (angles.length === 0) return Infinity;

  const total = angles.reduce(
    (sum, angle) => sum + angularDistance(angle, center),
    0,
  );

  return total / angles.length;
}

export function estimateWatermarkOrientation(
  boxes: ProjectedBox[],
  options: WatermarkOrientationOptions = {},
): WatermarkOrientationResult | null {
  const angleTolerance = Math.max(1, Math.min(45, options.angleTolerance ?? 8));

  const minClusterSize = Math.max(1, Math.floor(options.minClusterSize ?? 3));

  const minSupportRatio = Math.max(
    0,
    Math.min(1, options.minSupportRatio ?? 0.35),
  );

  const entries: AngleEntry[] = boxes
    .filter((box) => Number.isFinite(box.box.degree))
    .map((box) => ({
      box,
      angle: normalizeLineAngle(box.box.degree),
    }));

  if (entries.length === 0) return null;

  // Cari cluster dengan dukungan terbesar.
  let bestCluster: AngleEntry[] = [];
  let bestDeviation = Infinity;

  for (const anchor of entries) {
    const cluster = entries.filter(
      (entry) => angularDistance(entry.angle, anchor.angle) <= angleTolerance,
    );

    const center = circularMean180(cluster.map((entry) => entry.angle));

    const deviation = calculateDeviation(
      cluster.map((entry) => entry.angle),
      center,
    );

    if (
      cluster.length > bestCluster.length ||
      (cluster.length === bestCluster.length && deviation < bestDeviation)
    ) {
      bestCluster = cluster;
      bestDeviation = deviation;
    }
  }

  if (bestCluster.length === 0) return null;

  const degree = circularMean180(bestCluster.map((entry) => entry.angle));

  const supportRatio = bestCluster.length / entries.length;

  return {
    degree,
    totalBoxes: boxes.length,
    validBoxes: entries.length,
    support: bestCluster.length,
    supportRatio,
    deviation: calculateDeviation(
      bestCluster.map((entry) => entry.angle),
      degree,
    ),
    isReliable:
      bestCluster.length >= minClusterSize && supportRatio >= minSupportRatio,
    memberIndexes: bestCluster.map((entry) => entry.box.originalIndex),
  };
}

export function getRelativeLineAngle(
  boxDegree: number,
  orientationDegree: number,
): number {
  return normalizeLineAngle(boxDegree - orientationDegree);
}
