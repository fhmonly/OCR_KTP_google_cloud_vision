import type { ProjectedBox } from "../../types.js";

export interface WatermarkCandidateGeometry {
  box: ProjectedBox;
  along: number;
  perpendicular: number;
  alongSize: number;
  perpendicularSize: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];

  if (upper === undefined) return 0;

  return sorted.length % 2 === 0 && lower !== undefined
    ? (lower + upper) / 2
    : upper;
}

export function calculateWatermarkGeometry(
  boxes: ProjectedBox[],
  targetAngle: number,
): WatermarkCandidateGeometry[] {
  const radians = (targetAngle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return boxes.map((box) => ({
    box,
    along: box.centerU * cos + box.centerV * sin,
    perpendicular: -box.centerU * sin + box.centerV * cos,
    alongSize: Math.abs(cos) * box.width + Math.abs(sin) * box.height,
    perpendicularSize: Math.abs(sin) * box.width + Math.abs(cos) * box.height,
  }));
}

export function getWatermarkGroupingThresholds(
  candidates: WatermarkCandidateGeometry[],
  normalToleranceFactor = 0.75,
  maxGapFactor = 1.5,
): { normalTolerance: number; maxAlongGap: number } {
  const normalSizes = candidates
    .map((candidate) => candidate.perpendicularSize)
    .filter((value) => Number.isFinite(value) && value > 0);

  const alongSizes = candidates
    .map((candidate) => candidate.alongSize)
    .filter((value) => Number.isFinite(value) && value > 0);

  const typicalNormalSize = median(normalSizes);
  const typicalAlongSize = median(alongSizes);

  return {
    normalTolerance: Math.max(2, typicalNormalSize * normalToleranceFactor),
    maxAlongGap: Math.max(4, typicalAlongSize * maxGapFactor),
  };
}
