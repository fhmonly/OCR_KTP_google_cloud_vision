import type { ProjectedBox } from "../../types.js";

export type MetadataType =
  | "place-made"
  | "date-made"
  | "place-date"
  | "signature-marker";

export interface MetadataDetectionOptions {
  /** Area bawah dokumen yang dipertimbangkan (0–1). */
  bottomRegionStartRatio?: number;

  /** Area kanan dokumen yang dipertimbangkan (0–1). */
  rightRegionStartRatio?: number;

  /** Maksimum jarak horizontal antarbox, dikalikan tinggi box tipikal. */
  maxPairGapFactor?: number;

  /** Toleransi perbedaan centerV antarbox. */
  rowToleranceFactor?: number;

  /** Confidence minimum agar box dihapus oleh filter. */
  minRemovalConfidence?: number;
}

export interface MetadataGroup {
  id: number;
  type: "place-date";
  indexes: number[];
  placeIndexes: number[];
  dateIndexes: number[];
  confidence: number;
}

export interface MetadataBoxDiagnostic {
  originalIndex: number;
  label: string;
  type: MetadataType;
  classification: "metadata-candidate" | "metadata";
  confidence: number;
  groupId?: number;
  reason: string;
}

export interface MetadataDetectionResult {
  detected: boolean;
  candidateIndexes: number[];
  metadataIndexes: number[];
  groups: MetadataGroup[];
  diagnostics: MetadataBoxDiagnostic[];
}

export interface MetadataFilterResult {
  boxes: ProjectedBox[];
  removedBoxes: ProjectedBox[];
  removedIndexes: number[];
}
