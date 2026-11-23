import type { WatermarkGroup } from "./watermark-grouping.js";

export type WatermarkClassification =
  | "main-text"
  | "watermark-candidate"
  | "watermark"
  | "unknown";

export interface WatermarkDetectionOptions {
  targetAngle?: number;
  angleTolerance?: number;
  minCandidateCount?: number;
  minCandidateRatio?: number;
  minExtentRatio?: number;

  normalToleranceFactor?: number;
  maxGapFactor?: number;
  minGroupSize?: number;
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
}
