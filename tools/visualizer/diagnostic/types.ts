/**
 * Tipe bersama untuk diagnostic test. Tidak boleh bergantung pada DOM maupun
 * Node supaya bisa dipakai oleh browser (UI) dan server (runner).
 *
 * Konvensi index: sama dengan KTPExtractor, yaitu index pada
 * `textAnnotations.slice(1)` (textAnnotations[0] = full text dibuang).
 */

export type ExpectedCategory = "watermark" | "metadata" | "unspecified";
export type RemovalSource = "watermark" | "metadata" | "bounding-poly";

export interface ExpectedEntry {
  index: number;
  category: ExpectedCategory;
}

export interface DiagnosticRequest {
  sourceName: string;
  /** Seluruh array textAnnotations dari Google Vision (termasuk index 0). */
  textAnnotations: unknown[];
  expected: ExpectedEntry[];
}

export interface Point {
  x: number;
  y: number;
}

/** Geometri box dari boundingPoly. Nilai x/y yang hilang dibaca 0 (perilaku Vision). */
export interface BoxGeometry {
  vertices: Point[];
  vertexCount: number;
  /** true bila ada vertex yang tidak punya x atau y di JSON asli. */
  hadMissingCoordinates: boolean;
  /** Sudut v0 -> v1 (-180..180), sama dengan degree di canvas. */
  degree: number | null;
  /** degree dinormalisasi ke 0..360. */
  degreeNormalized: number | null;
  /** Sudut v3 -> v2; bila beda jauh dari degree, box miring/skew. */
  bottomEdgeDegree: number | null;
  center: Point | null;
  /** Rata-rata panjang sisi atas dan bawah. */
  width: number | null;
  /** Rata-rata panjang sisi kiri dan kanan. */
  height: number | null;
  /** Bounding box sejajar sumbu (axis-aligned). */
  bbox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null;
  area: number | null;
}

export type ItemVerdict = "ok" | "missing" | "unexpected" | "wrong-source";

export interface BoxDiagnostic {
  index: number;
  label: string;
  geometry: BoxGeometry;
  expected: ExpectedCategory | null;
  actual: RemovalSource | null;
  /** "kept" = tidak diharapkan hilang dan memang tidak dihapus. */
  verdict: ItemVerdict | "kept";
  watermark: {
    classification: string;
    confidence: number;
    relativeAngle: number;
    groupId: number | null;
    reason: string;
  } | null;
  metadata: {
    type: string;
    classification: string;
    confidence: number;
    groupId: number | null;
    reason: string;
  } | null;
  boundingPolyReasons: string[];
  /** Contoh: "identity_number:value", "fullname:label". */
  usedBy: string[];
}

export interface FieldReport {
  field: string;
  label: string;
  value: string | null;
  confidence: number;
  labelIndexes: number[];
  valueIndexes: number[];
}

export interface UnmatchedLabelReport {
  field: string;
  matchedText: string;
  matchedAlias: string;
  similarity: number;
  indexes: number[];
}

export interface AssociationDiagnosticReport {
  field: string;
  candidateText: string;
  boxIndexes: number[];
  score: number;
  accepted: boolean;
  reason: string;
  metadata: unknown;
}

export interface Comparison {
  expectedIndexes: number[];
  actualIndexes: number[];
  matched: number[];
  /** Diharapkan hilang tetapi tidak dihapus oleh pipeline. */
  missing: number[];
  /** Dihapus pipeline tetapi tidak diharapkan hilang. */
  unexpected: number[];
  /** Dihapus, tetapi oleh detektor yang berbeda dari kategori expected. */
  wrongSource: number[];
  precision: number | null;
  recall: number | null;
  bySource: Record<"watermark" | "metadata" | "boundingPoly", number[]>;
  byExpectedCategory: Record<ExpectedCategory, number[]>;
}

export interface OrientationReport {
  degree: number;
  totalWords: number;
  validWords: number;
  support: number;
  supportRatio: number;
  medianHeight: number;
  deviation: number;
  isReliable: boolean;
  clusters: {
    degree: number;
    count: number;
    supportRatio: number;
    deviation: number;
  }[];
  skippedProjection: number;
  rowCount: number;
}

export interface DetectorReport {
  detected: boolean;
  confidence: number | null;
  candidateIndexes: number[];
  removedIndexes: number[];
  groups: unknown[];
}

export interface DiagnosticReport {
  schemaVersion: 1;
  status: "pass" | "fail" | "error";
  error: { message: string; stack: string | null } | null;
  meta: {
    generatedAt: string;
    sourceFile: string;
    totalWords: number;
    durationMs: number;
    gitBranch: string | null;
    gitCommit: string | null;
    gitDirty: boolean | null;
    nodeVersion: string;
  };
  expectation: {
    removedIndexes: number[];
    byCategory: Record<ExpectedCategory, number[]>;
  };
  /** null bila extractor melempar error. */
  comparison: Comparison | null;
  extraction: {
    data: Record<string, unknown>;
    fields: FieldReport[];
    unmatchedLabels: UnmatchedLabelReport[];
    usedWordIndexes: number[];
    associationDiagnostics: AssociationDiagnosticReport[];
  } | null;
  pipeline: {
    boundingPoly: {
      invalidIndexes: number[];
      diagnostics: unknown[];
    } | null;
    orientation: OrientationReport | null;
    watermark: DetectorReport | null;
    metadata: DetectorReport | null;
  };
  boxes: BoxDiagnostic[];
}
