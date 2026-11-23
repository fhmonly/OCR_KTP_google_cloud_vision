import type { ProjectedBox } from "../../types.js";
import type { WatermarkGroup } from "./watermark-grouping.js";
import type { WatermarkOrientationResult } from "./watermark-orientation.js";

export type WatermarkClassification =
  | "main-text"
  | "watermark-candidate"
  | "watermark"
  | "unknown";

export interface WatermarkDetectionOptions {
  /**
   * Jika diisi, gunakan deteksi sudut manual.
   * Jika tidak diisi, gunakan deteksi adaptif.
   */
  targetAngle?: number;

  angleTolerance?: number;
  minAngleDeviation?: number;
  maxAngleDeviation?: number;

  minCandidateCount?: number;
  minCandidateRatio?: number;
  minExtentRatio?: number;

  normalToleranceFactor?: number;
  maxGapFactor?: number;
  minGroupSize?: number;

  orientationAngleTolerance?: number;
  orientationMinClusterSize?: number;
  orientationMinSupportRatio?: number;
}

export interface WatermarkBoxDiagnostic {
  originalIndex: number;
  label: string;
  relativeAngle: number;
  classification: WatermarkClassification;
  confidence: number;
  groupId?: number;
  reason: string;
}

export interface WatermarkDetectionResult {
  detected: boolean;
  orientationDegree: number;
  targetAngle: number;
  angleTolerance: number;
  confidence: number;
  candidateIndexes: number[];
  watermarkIndexes: number[];
  groups: WatermarkGroup[];
  diagnostics: WatermarkBoxDiagnostic[];
  orientation: WatermarkOrientationResult | null;
}

export interface WatermarkFilterResult {
  boxes: ProjectedBox[];
  removedBoxes: ProjectedBox[];
  removedIndexes: number[];
}
