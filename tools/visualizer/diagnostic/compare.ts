import type {
  AssociationDiagnosticReport,
  BoxDiagnostic,
  Comparison,
  DetectorReport,
  DiagnosticReport,
  ExpectedCategory,
  ExpectedEntry,
  FieldReport,
  ItemVerdict,
  OrientationReport,
  RemovalSource,
  UnmatchedLabelReport,
} from "./types.js";
import { computeGeometry } from "./geometry.js";

/* ------------------------------------------------------------------ */
/* Bentuk longgar dari output KTPExtractor                            */
/* ------------------------------------------------------------------ */
/* Sengaja dibuat longgar + opsional: runner tetap jalan di branch yang
 * belum mengembalikan semua field (mis. `main` tanpa watermark/metadata). */

interface IndexedBox {
  originalIndex: number;
}

export interface ExtractorOutputLike {
  data?: Record<string, unknown>;
  boundingPoly?: {
    invalidIndexes?: number[];
    diagnostics?: unknown[];
  };
  orientation?: Partial<OrientationReport>;
  watermark?: {
    detected?: boolean;
    confidence?: number;
    candidateIndexes?: number[];
    removedIndexes?: number[];
    diagnostics?: {
      originalIndex: number;
      classification: string;
      confidence: number;
      relativeAngle: number;
      groupId?: number;
      reason: string;
    }[];
  };
  metadata?: {
    detected?: boolean;
    candidateIndexes?: number[];
    removedIndexes?: number[];
    groups?: unknown[];
    diagnostics?: {
      originalIndex: number;
      type: string;
      classification: string;
      confidence: number;
      groupId?: number;
      reason: string;
    }[];
  };
  association?: {
    fields?: {
      field: string;
      label: string;
      value: string | null;
      confidence: number;
      labelBoxes?: IndexedBox[];
      valueBoxes?: IndexedBox[];
    }[];
    unmatchedLabels?: {
      field: string;
      matchedText: string;
      matchedAlias: string;
      similarity: number;
      boxes?: IndexedBox[];
    }[];
    usedWordIndexes?: number[];
    diagnostics?: {
      field: string;
      candidateText: string;
      boxIndexes: number[];
      score: number;
      accepted: boolean;
      reason: string;
      metadata?: unknown;
    }[];
  };
}

export interface BuildReportInput {
  sourceName: string;
  /** Seluruh textAnnotations (termasuk index 0); index box = posisi pada slice(1). */
  textAnnotations: unknown[];
  expected: ExpectedEntry[];
  output: ExtractorOutputLike | null;
  error: unknown;
  durationMs: number;
  env: {
    gitBranch: string | null;
    gitCommit: string | null;
    gitDirty: boolean | null;
    nodeVersion: string;
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const sortedUnique = (values: Iterable<number>): number[] =>
  [...new Set(values)].sort((a, b) => a - b);

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function groupExpected(
  expected: ExpectedEntry[],
): Record<ExpectedCategory, number[]> {
  const result: Record<ExpectedCategory, number[]> = {
    watermark: [],
    metadata: [],
    unspecified: [],
  };
  for (const entry of expected) result[entry.category].push(entry.index);
  for (const key of Object.keys(result) as ExpectedCategory[]) {
    result[key] = sortedUnique(result[key]);
  }
  return result;
}

/** index -> sumber penghapusan. Urutan pipeline: bounding-poly, watermark, metadata. */
function collectRemovals(
  output: ExtractorOutputLike,
): Map<number, RemovalSource> {
  const removals = new Map<number, RemovalSource>();
  const add = (indexes: number[] | undefined, source: RemovalSource) => {
    for (const index of indexes ?? []) {
      if (!removals.has(index)) removals.set(index, source);
    }
  };
  add(output.boundingPoly?.invalidIndexes, "bounding-poly");
  add(output.watermark?.removedIndexes, "watermark");
  add(output.metadata?.removedIndexes, "metadata");
  return removals;
}

function judge(
  expected: ExpectedCategory | null,
  actual: RemovalSource | null,
): ItemVerdict | "kept" {
  if (expected && !actual) return "missing";
  if (!expected && actual) return "unexpected";
  if (!expected && !actual) return "kept";
  // Keduanya ada: cocok bila kategori tidak dispesifikkan atau sumbernya sama.
  if (expected === "unspecified" || expected === actual) return "ok";
  return "wrong-source";
}

function buildComparison(
  expected: ExpectedEntry[],
  removals: Map<number, RemovalSource>,
  categories: Record<ExpectedCategory, number[]>,
): Comparison {
  const expectedByIndex = new Map(
    expected.map((entry) => [entry.index, entry.category]),
  );
  const expectedIndexes = sortedUnique(expectedByIndex.keys());
  const actualIndexes = sortedUnique(removals.keys());

  const matched: number[] = [];
  const missing: number[] = [];
  const unexpected: number[] = [];
  const wrongSource: number[] = [];

  for (const index of sortedUnique([...expectedIndexes, ...actualIndexes])) {
    const verdict = judge(
      expectedByIndex.get(index) ?? null,
      removals.get(index) ?? null,
    );
    if (verdict === "ok") matched.push(index);
    else if (verdict === "missing") missing.push(index);
    else if (verdict === "unexpected") unexpected.push(index);
    else if (verdict === "wrong-source") wrongSource.push(index);
  }

  const bySource = {
    watermark: [] as number[],
    metadata: [] as number[],
    boundingPoly: [] as number[],
  };
  for (const [index, source] of removals) {
    if (source === "watermark") bySource.watermark.push(index);
    else if (source === "metadata") bySource.metadata.push(index);
    else bySource.boundingPoly.push(index);
  }
  for (const key of Object.keys(bySource) as (keyof typeof bySource)[]) {
    bySource[key] = sortedUnique(bySource[key]);
  }

  const correct = matched.length;
  return {
    expectedIndexes,
    actualIndexes,
    matched,
    missing,
    unexpected,
    wrongSource,
    precision: ratio(correct, actualIndexes.length),
    recall: ratio(correct, expectedIndexes.length),
    bySource,
    byExpectedCategory: categories,
  };
}

/* ------------------------------------------------------------------ */
/* Report                                                             */
/* ------------------------------------------------------------------ */

function errorInfo(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null };
  }
  return { message: String(error), stack: null };
}

export function buildReport(input: BuildReportInput): DiagnosticReport {
  const { output, expected } = input;
  const annotations = input.textAnnotations.slice(1);
  const labels = annotations.map((item) => {
    const description = (item as { description?: unknown } | null)?.description;
    return typeof description === "string" ? description.trim() : "";
  });
  const categories = groupExpected(expected);
  const expectedByIndex = new Map(
    expected.map((entry) => [entry.index, entry.category]),
  );

  const removals = output
    ? collectRemovals(output)
    : new Map<number, RemovalSource>();
  const comparison = output
    ? buildComparison(expected, removals, categories)
    : null;

  /* ---- Extraction ---- */
  const association = output?.association;

  const fields: FieldReport[] = (association?.fields ?? []).map((f) => ({
    field: f.field,
    label: f.label,
    value: f.value,
    confidence: f.confidence,
    labelIndexes: (f.labelBoxes ?? []).map((b) => b.originalIndex),
    valueIndexes: (f.valueBoxes ?? []).map((b) => b.originalIndex),
  }));

  const unmatchedLabels: UnmatchedLabelReport[] = (
    association?.unmatchedLabels ?? []
  ).map((l) => ({
    field: l.field,
    matchedText: l.matchedText,
    matchedAlias: l.matchedAlias,
    similarity: l.similarity,
    indexes: (l.boxes ?? []).map((b) => b.originalIndex),
  }));

  const associationDiagnostics: AssociationDiagnosticReport[] = (
    association?.diagnostics ?? []
  ).map((d) => ({
    field: d.field,
    candidateText: d.candidateText,
    boxIndexes: d.boxIndexes,
    score: d.score,
    accepted: d.accepted,
    reason: d.reason,
    metadata: d.metadata ?? null,
  }));

  /* ---- Per-box ---- */
  const usedBy = new Map<number, string[]>();
  const markUsed = (index: number, text: string) => {
    const list = usedBy.get(index) ?? [];
    list.push(text);
    usedBy.set(index, list);
  };
  for (const f of fields) {
    for (const i of f.labelIndexes) markUsed(i, `${f.field}:label`);
    for (const i of f.valueIndexes) markUsed(i, `${f.field}:value`);
  }

  const watermarkDiag = new Map(
    (output?.watermark?.diagnostics ?? []).map((d) => [d.originalIndex, d]),
  );
  const metadataDiag = new Map(
    (output?.metadata?.diagnostics ?? []).map((d) => [d.originalIndex, d]),
  );
  const polyReasons = new Map<number, string[]>();
  for (const raw of output?.boundingPoly?.diagnostics ?? []) {
    const d = raw as { originalIndex?: number; reasons?: string[] };
    if (typeof d.originalIndex === "number") {
      polyReasons.set(d.originalIndex, d.reasons ?? []);
    }
  }

  const boxes: BoxDiagnostic[] = labels.map((label, index) => {
    const expectedCategory = expectedByIndex.get(index) ?? null;
    const actual = removals.get(index) ?? null;
    const wm = watermarkDiag.get(index);
    const md = metadataDiag.get(index);
    return {
      index,
      label,
      geometry: computeGeometry(annotations[index]),
      expected: expectedCategory,
      actual,
      verdict: output ? judge(expectedCategory, actual) : "kept",
      watermark: wm
        ? {
            classification: wm.classification,
            confidence: wm.confidence,
            relativeAngle: wm.relativeAngle,
            groupId: wm.groupId ?? null,
            reason: wm.reason,
          }
        : null,
      metadata: md
        ? {
            type: md.type,
            classification: md.classification,
            confidence: md.confidence,
            groupId: md.groupId ?? null,
            reason: md.reason,
          }
        : null,
      boundingPolyReasons: polyReasons.get(index) ?? [],
      usedBy: usedBy.get(index) ?? [],
    };
  });

  const detector = (
    source:
      | NonNullable<ExtractorOutputLike["watermark"]>
      | NonNullable<ExtractorOutputLike["metadata"]>
      | undefined,
  ): DetectorReport | null =>
    source
      ? {
          detected: source.detected ?? false,
          confidence:
            "confidence" in source && typeof source.confidence === "number"
              ? source.confidence
              : null,
          candidateIndexes: source.candidateIndexes ?? [],
          removedIndexes: source.removedIndexes ?? [],
          groups: "groups" in source ? (source.groups ?? []) : [],
        }
      : null;

  const orientation = output?.orientation;

  let status: DiagnosticReport["status"];
  if (!comparison) status = "error";
  else if (
    comparison.missing.length ||
    comparison.unexpected.length ||
    comparison.wrongSource.length
  ) {
    status = "fail";
  } else status = "pass";

  return {
    schemaVersion: 1,
    status,
    error: input.error ? errorInfo(input.error) : null,
    meta: {
      generatedAt: new Date().toISOString(),
      sourceFile: input.sourceName,
      totalWords: labels.length,
      durationMs: input.durationMs,
      ...input.env,
    },
    expectation: {
      removedIndexes: sortedUnique(expectedByIndex.keys()),
      byCategory: categories,
    },
    comparison,
    extraction: output
      ? {
          data: output.data ?? {},
          fields,
          unmatchedLabels,
          usedWordIndexes: sortedUnique(association?.usedWordIndexes ?? []),
          associationDiagnostics,
        }
      : null,
    pipeline: {
      boundingPoly: output?.boundingPoly
        ? {
            invalidIndexes: output.boundingPoly.invalidIndexes ?? [],
            diagnostics: output.boundingPoly.diagnostics ?? [],
          }
        : null,
      orientation: orientation
        ? {
            degree: orientation.degree ?? 0,
            totalWords: orientation.totalWords ?? 0,
            validWords: orientation.validWords ?? 0,
            support: orientation.support ?? 0,
            supportRatio: orientation.supportRatio ?? 0,
            medianHeight: orientation.medianHeight ?? 0,
            deviation: orientation.deviation ?? 0,
            isReliable: orientation.isReliable ?? false,
            clusters: orientation.clusters ?? [],
            skippedProjection: orientation.skippedProjection ?? 0,
            rowCount: orientation.rowCount ?? 0,
          }
        : null,
      watermark: detector(output?.watermark),
      metadata: detector(output?.metadata),
    },
    boxes,
  };
}
