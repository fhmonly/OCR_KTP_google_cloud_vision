import type {
  MajorityDegreeResult,
  OrientationCluster,
  TransformedTextAnnotation,
} from "../types.js";

import {
  circularMean,
  isValidDegree,
  median,
  normalizeDegree,
} from "./degree-utils.js";

interface DegreeEntry {
  index: number;
  degree: number;
  height: number;
}

interface MajorityDegreeOptions {
  degreeTolerance?: number;
  minClusterSize?: number;
  minSupportRatio?: number;
}

function getBoxHeight(box: TransformedTextAnnotation): number {
  const vertices = box.vertices;

  if (vertices.length !== 4) {
    return 0;
  }

  const points = vertices.map((vertex) => ({
    x: vertex.x,
    y: vertex.y,
  }));

  if (
    points.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    return 0;
  }

  const degree = normalizeDegree(box.degree);
  const radian = (degree * Math.PI) / 180;

  const perpendicularX = -Math.sin(radian);
  const perpendicularY = Math.cos(radian);

  const projections = points.map(
    (point) => point.x! * perpendicularX + point.y! * perpendicularY,
  );

  return Math.max(...projections) - Math.min(...projections);
}

function createDegreeClusters(
  entries: DegreeEntry[],
  tolerance: number,
): DegreeEntry[][] {
  if (entries.length === 0) {
    return [];
  }

  const sorted = [...entries].sort((a, b) => a.degree - b.degree);

  // Cari celah sudut terbesar pada lingkaran.
  let largestGap = -1;
  let startIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!.degree;

    const next =
      i === sorted.length - 1 ? sorted[0]!.degree + 360 : sorted[i + 1]!.degree;

    const gap = next - current;

    if (gap > largestGap) {
      largestGap = gap;
      startIndex = (i + 1) % sorted.length;
    }
  }

  // Ubah sudut circular menjadi urutan linear.
  const unwrapped: DegreeEntry[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[(startIndex + i) % sorted.length];

    let degree = entry!.degree;

    if (
      unwrapped.length > 0 &&
      degree < unwrapped[unwrapped.length - 1]!.degree
    ) {
      degree += 360;
    }

    unwrapped.push({
      ...entry,
      degree,
    } as DegreeEntry);
  }

  // Bentuk cluster tanpa overlap.
  const clusters: DegreeEntry[][] = [];

  let currentCluster: DegreeEntry[] = [];
  let clusterStart = 0;

  for (const entry of unwrapped) {
    if (
      currentCluster.length === 0 ||
      entry.degree - clusterStart <= tolerance
    ) {
      if (currentCluster.length === 0) {
        clusterStart = entry.degree;
      }

      currentCluster.push(entry);
    } else {
      clusters.push(currentCluster);

      currentCluster = [entry];
      clusterStart = entry.degree;
    }
  }

  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function calculateCluster(
  entries: DegreeEntry[],
  totalWords: number,
): OrientationCluster {
  const degrees = entries.map((entry) => normalizeDegree(entry.degree));

  const degree = circularMean(degrees);

  const deviations = degrees.map((value) => {
    const diff = Math.abs(value - degree);
    return Math.min(diff, 360 - diff);
  });

  const heights = entries
    .map((entry) => entry.height)
    .filter((height) => height > 0);

  const averageDeviation =
    deviations.reduce((sum, value) => sum + value, 0) / deviations.length;

  return {
    degree,
    count: entries.length,
    supportRatio: entries.length / totalWords,
    medianHeight: median(heights),
    deviation: averageDeviation,
    members: entries.map((entry) => entry.index),
  };
}

export function estimateMajorityDegree(
  boxes: TransformedTextAnnotation[],
  options: MajorityDegreeOptions = {},
): MajorityDegreeResult | null {
  const {
    degreeTolerance = 8,
    minClusterSize = 3,
    minSupportRatio = 0.35,
  } = options;

  const entries: DegreeEntry[] = [];

  boxes.forEach((box, index) => {
    if (!isValidDegree(box.degree)) {
      return;
    }

    const height = getBoxHeight(box);

    if (height <= 0) {
      return;
    }

    entries.push({
      index,
      degree: normalizeDegree(box.degree),
      height,
    });
  });

  if (entries.length < minClusterSize) {
    return null;
  }

  const rawClusters = createDegreeClusters(entries, degreeTolerance);

  const clusters = rawClusters
    .map((cluster) => calculateCluster(cluster, entries.length))
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }

      return a.deviation - b.deviation;
    });

  const selectedCluster = clusters[0];

  if (!selectedCluster) {
    return null;
  }

  const isReliable =
    selectedCluster.count >= minClusterSize &&
    selectedCluster.supportRatio >= minSupportRatio;

  return {
    degree: selectedCluster.degree,
    totalWords: boxes.length,
    validWords: entries.length,
    support: selectedCluster.count,
    supportRatio: selectedCluster.supportRatio,
    medianHeight: selectedCluster.medianHeight,
    deviation: selectedCluster.deviation,
    isReliable,
    clusters,
    selectedCluster,
  };
}
