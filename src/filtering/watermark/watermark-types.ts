import type { ProjectedBox } from "../../types.js";

export type WatermarkClassification =
  | "main-text"
  | "watermark-candidate"
  | "watermark"
  | "unknown";

export interface WatermarkDetectionOptions {
  /**
   * Sudut watermark relatif terhadap orientasi utama dokumen.
   * -45 berarti diagonal dari kiri bawah ke kanan atas.
   */
  targetAngle?: number;

  /**
   * Toleransi perbedaan sudut dalam derajat.
   */
  angleTolerance?: number;

  /**
   * Jumlah minimal box diagonal untuk mengonfirmasi watermark.
   */
  minCandidateCount?: number;

  /**
   * Proporsi minimal kandidat terhadap seluruh word boxes.
   */
  minCandidateRatio?: number;

  /**
   * Proporsi minimal rentang horizontal kandidat
   * terhadap rentang horizontal seluruh dokumen.
   */
  minExtentRatio?: number;
}

export interface WatermarkBoxDiagnostic {
  originalIndex: number;
  label: string;
  relativeAngle: number;
  classification: WatermarkClassification;
  confidence: number;
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

  diagnostics: WatermarkBoxDiagnostic[];
}

export interface WatermarkFilterResult {
  boxes: ProjectedBox[];
  removedBoxes: ProjectedBox[];
  removedIndexes: number[];
}
