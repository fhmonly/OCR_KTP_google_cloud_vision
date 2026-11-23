import type { WatermarkCandidateGeometry } from "./watermark-geometry.js";
import { getWatermarkGroupingThresholds } from "./watermark-geometry.js";

export interface WatermarkGroup {
  id: number;
  candidates: WatermarkCandidateGeometry[];
  indexes: number[];
  alongStart: number;
  alongEnd: number;
  perpendicularCenter: number;
  maxPerpendicularDeviation: number;
  continuity: number;
}

export interface WatermarkGroupingOptions {
  normalToleranceFactor?: number | undefined;
  maxGapFactor?: number | undefined;
  minGroupSize?: number | undefined;
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

export function groupWatermarkCandidates(
  candidates: WatermarkCandidateGeometry[],
  options: WatermarkGroupingOptions = {},
): WatermarkGroup[] {
  const minGroupSize = Math.max(2, Math.floor(options.minGroupSize ?? 3));

  if (candidates.length < minGroupSize) return [];

  const { normalTolerance, maxAlongGap } = getWatermarkGroupingThresholds(
    candidates,
    options.normalToleranceFactor ?? 0.75,
    options.maxGapFactor ?? 1.5,
  );

  const sorted = [...candidates].sort((a, b) => a.along - b.along);

  const visited = new Set<number>();
  const groups: WatermarkGroup[] = [];

  for (let start = 0; start < sorted.length; start++) {
    if (visited.has(start)) continue;

    const queue = [start];
    const component: WatermarkCandidateGeometry[] = [];

    visited.add(start);

    while (queue.length > 0) {
      const currentIndex = queue.pop();
      if (currentIndex === undefined) continue;

      const current = sorted[currentIndex];
      if (!current) continue;

      component.push(current);

      for (let nextIndex = 0; nextIndex < sorted.length; nextIndex++) {
        if (visited.has(nextIndex)) continue;

        const next = sorted[nextIndex];
        if (!next) continue;

        const alongGap = Math.abs(next.along - current.along);

        const normalGap = Math.abs(next.perpendicular - current.perpendicular);

        if (alongGap <= maxAlongGap && normalGap <= normalTolerance) {
          visited.add(nextIndex);
          queue.push(nextIndex);
        }
      }
    }

    if (component.length < minGroupSize) continue;

    const alongValues = component.map((candidate) => candidate.along);

    const perpendicularValues = component.map(
      (candidate) => candidate.perpendicular,
    );

    const perpendicularCenter = median(perpendicularValues);

    const maxPerpendicularDeviation = Math.max(
      ...perpendicularValues.map((value) =>
        Math.abs(value - perpendicularCenter),
      ),
    );

    const orderedAlong = [...alongValues].sort((a, b) => a - b);

    let connectedGaps = 0;

    for (let index = 1; index < orderedAlong.length; index++) {
      const previous = orderedAlong[index - 1];
      const current = orderedAlong[index];

      if (
        previous !== undefined &&
        current !== undefined &&
        current - previous <= maxAlongGap
      ) {
        connectedGaps++;
      }
    }

    groups.push({
      id: groups.length,
      candidates: component,
      indexes: component.map((candidate) => candidate.box.originalIndex),
      alongStart: Math.min(...alongValues),
      alongEnd: Math.max(...alongValues),
      perpendicularCenter,
      maxPerpendicularDeviation,
      continuity:
        component.length > 1 ? connectedGaps / (component.length - 1) : 0,
    });
  }

  return groups.sort((a, b) => a.alongStart - b.alongStart);
}

export function getWatermarkGroupIndexes(
  groups: WatermarkGroup[],
): Set<number> {
  const indexes = new Set<number>();

  for (const group of groups) {
    for (const index of group.indexes) {
      indexes.add(index);
    }
  }

  return indexes;
}
