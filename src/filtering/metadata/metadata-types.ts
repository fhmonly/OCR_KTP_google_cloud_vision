import type { ProjectedBox } from "../../types.js";

export type MetadataType =
  | "place-made"
  | "date-made"
  | "place-date"
  | "signature-marker"
  | "signature"
  | "other";

export type MetadataClassification = "metadata-candidate" | "metadata";

export interface MetadataRegionConfig {
  /** ID region untuk diagnostic. */
  id?: string;

  /**
   * Rasio region terhadap projected bounds seluruh box.
   * Nilai harus berada dalam rentang 0–1.
   */
  uStartRatio: number;
  uEndRatio: number;
  vStartRatio: number;
  vEndRatio: number;
}

export interface MetadataDetectionOptions {
  /** Area bawah dokumen yang dipertimbangkan (0–1). */
  bottomRegionStartRatio?: number;

  /** Area kanan dokumen yang dipertimbangkan (0–1). */
  rightRegionStartRatio?: number;

  /** Maksimum jarak horizontal antarbox, dikalikan tinggi box tipikal. */
  maxPairGapFactor?: number;

  /** Toleransi perbedaan centerV antarbox. */
  rowToleranceFactor?: number;

  /** Confidence minimum untuk deteksi metadata lama. */
  minRemovalConfidence?: number;

  /** Region utama metadata. */
  metadataRegion?: MetadataRegionConfig;

  /** Sub-region tanda tangan, relatif terhadap projected bounds. */
  signatureRegion?: MetadataRegionConfig;

  /** Minimum overlap box dengan metadata region agar dihapus. */
  regionOverlapThreshold?: number;
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
  classification: MetadataClassification;
  confidence: number;
  groupId?: number;
  regionId?: string;
  overlapRatio?: number;
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
