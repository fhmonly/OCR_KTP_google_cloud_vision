import type { ProjectedBox, WordRow, WordSegment } from "../types.js";

import { median } from "../orientation/degree-utils.js";

export interface HorizontalSegmentationOptions {
  /**
   * Faktor tinggi teks untuk menentukan minimum gap.
   *
   * Contoh:
   * medianHeight = 20
   * heightFactor = 2.5
   * minimum threshold = 50
   */
  heightFactor?: number;

  /**
   * Faktor MAD untuk mendeteksi gap yang terlalu jauh.
   */
  madFactor?: number;
}

/**
 * Menghitung Median Absolute Deviation.
 */
function calculateMAD(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const center = median(values);

  const deviations = values.map((value) => Math.abs(value - center));

  return median(deviations);
}

/**
 * Menghitung jarak horizontal antar dua word box.
 *
 * Nilai positif = terdapat jarak.
 * Nilai negatif = bounding box saling overlap.
 */
function calculateHorizontalGap(
  current: ProjectedBox,
  next: ProjectedBox,
): number {
  return next.uMin - current.uMax;
}

/**
 * Menghitung threshold pemisahan secara adaptif.
 */
function calculateGapThreshold(
  boxes: ProjectedBox[],
  heightFactor: number,
  madFactor: number,
): number {
  if (boxes.length < 2) {
    return Infinity;
  }

  const heights = boxes
    .map((box) => box.height)
    .filter((height) => Number.isFinite(height) && height > 0);

  const medianHeight = median(heights);

  if (medianHeight <= 0) {
    return Infinity;
  }

  const gaps: number[] = [];

  for (let i = 0; i < boxes.length - 1; i++) {
    const gap = calculateHorizontalGap(boxes[i]!, boxes[i + 1]!);

    if (Number.isFinite(gap)) {
      gaps.push(Math.max(0, gap));
    }
  }

  if (gaps.length === 0) {
    return Infinity;
  }

  const medianGap = median(gaps);
  const mad = calculateMAD(gaps);

  const heightThreshold = medianHeight * heightFactor;

  const statisticalThreshold = medianGap + madFactor * mad;

  return Math.max(heightThreshold, statisticalThreshold);
}

/**
 * Membuat segment dari kumpulan word box.
 */
function createSegment(
  boxes: ProjectedBox[],
  rowIndex: number,
  segmentIndex: number,
): WordSegment {
  const minU = Math.min(...boxes.map((box) => box.uMin));

  const maxU = Math.max(...boxes.map((box) => box.uMax));

  return {
    rowIndex,
    segmentIndex,

    centerU: (minU + maxU) / 2,
    minU,
    maxU,

    boxes,
  };
}

/**
 * Memisahkan satu row menjadi beberapa segment
 * berdasarkan jarak horizontal antarword.
 */
export function segmentHorizontalRow(
  row: WordRow,
  rowIndex: number,
  options: HorizontalSegmentationOptions = {},
): WordSegment[] {
  const { heightFactor = 2.5, madFactor = 3 } = options;

  if (row.boxes.length === 0) {
    return [];
  }

  if (row.boxes.length === 1) {
    return [createSegment([...row.boxes], rowIndex, 0)];
  }

  // Pastikan word sudah diurutkan berdasarkan U.
  const sortedBoxes = [...row.boxes].sort((a, b) => a.uMin - b.uMin);

  const threshold = calculateGapThreshold(sortedBoxes, heightFactor, madFactor);

  const segments: WordSegment[] = [];

  let currentSegment: ProjectedBox[] = [sortedBoxes[0]!];

  for (let i = 1; i < sortedBoxes.length; i++) {
    const previous = sortedBoxes[i - 1];
    const current = sortedBoxes[i];

    const gap = calculateHorizontalGap(previous!, current!);

    if (gap > threshold) {
      segments.push(createSegment(currentSegment, rowIndex, segments.length));

      currentSegment = [current!];
    } else {
      currentSegment.push(current!);
    }
  }

  // Simpan segment terakhir.
  if (currentSegment.length > 0) {
    segments.push(createSegment(currentSegment, rowIndex, segments.length));
  }

  return segments;
}

/**
 * Memisahkan seluruh rows menjadi segments.
 */
export function segmentHorizontalRows(
  rows: WordRow[],
  options: HorizontalSegmentationOptions = {},
): WordSegment[] {
  const result: WordSegment[] = [];

  rows.forEach((row, rowIndex) => {
    const segments = segmentHorizontalRow(row, rowIndex, options);

    result.push(...segments);
  });

  return result;
}
