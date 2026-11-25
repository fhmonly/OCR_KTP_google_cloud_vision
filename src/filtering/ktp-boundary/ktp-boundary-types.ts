import type { ProjectedBox } from "../../types.js";

export interface KtpBoundary {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface KtpBoundaryOptions {
  labelThreshold?: number;
  maxLabelGapFactor?: number;
  minOverlapRatio?: number;
}

export interface KtpBoundaryDetectionResult {
  detected: boolean;
  boundary: KtpBoundary | null;
  anchorIndexes: {
    label: number[];
    province: number[];
    metadata: number[];
    validUntil: number[];
  };
  diagnostics: string[];
}

export interface KtpBoundaryFilterResult {
  boxes: ProjectedBox[];
  outsideBoxes: ProjectedBox[];
  outsideIndexes: number[];
}
