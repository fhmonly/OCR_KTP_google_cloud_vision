import type { ProjectedBox } from "../types.js";

export interface LabelDefinition {
  field: string;
  aliases: string[];
}

export interface MatchedLabel {
  field: string;
  matchedText: string;
  matchedAlias: string;
  normalizedText: string;

  // Anchor box berada di bagian akhir label.
  box: ProjectedBox;

  // Semua box yang membentuk label.
  boxes: ProjectedBox[];

  similarity: number;
}

export interface ValueCandidate {
  box: ProjectedBox;
  score: number;
  horizontalDistance: number;
  verticalDistance: number;
}

export interface AssociatedField {
  field: string;
  label: string;
  value: string | null;

  labelBoxes: ProjectedBox[];
  valueBoxes: ProjectedBox[];

  confidence: number;
}

export interface CityFallbackMetadata {
  rowIndex: number;
  nikRowIndex: number;
  provinceRowIndex: number;
  distanceToNik: number;
  validation: "not-validated" | "passed";
}

export interface AssociationDiagnostic {
  field: string;
  candidateText: string;
  boxIndexes: number[];
  score: number;
  accepted: boolean;
  reason: string;
  metadata?: CityFallbackMetadata;
}

export interface AssociationOptions {
  labelThreshold?: number;

  maxForwardDistanceFactor?: number;
  maxVerticalDistanceFactor?: number;

  maxInterWordGapFactor?: number;
  maxWords?: number;

  verticalPenalty?: number;

  maxLabelGapFactor?: number;
  sameRowToleranceFactor?: number;
  colonSearchDistanceFactor?: number;
}

export interface LabelValueAssociationResult {
  fields: AssociatedField[];
  unmatchedLabels: MatchedLabel[];
  usedWordIndexes: number[];

  diagnostics?: AssociationDiagnostic[];
}
