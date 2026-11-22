import type { TransformedTextAnnotation } from "../../types.js";

export type BoundingPolyInvalidReason =
  | "invalid-vertex-count"
  | "invalid-coordinate"
  | "duplicate-vertex"
  | "degenerate-polygon"
  | "invalid-dimensions"
  | "invalid-degree";

export interface BoundingPolyDiagnostic {
  originalIndex: number;
  label: string;
  valid: boolean;
  reasons: BoundingPolyInvalidReason[];
  area: number | null;
}

export interface BoundingPolyFilterResult {
  validBoxes: TransformedTextAnnotation[];
  invalidBoxes: TransformedTextAnnotation[];
  validIndexes: number[];
  invalidIndexes: number[];
  diagnostics: BoundingPolyDiagnostic[];
}

export interface BoundingPolyFilterOptions {
  /** Toleransi numerik untuk koordinat dan luas polygon. */
  epsilon?: number;
}
