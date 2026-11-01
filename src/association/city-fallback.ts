import type { ProjectedBox, WordRow } from "../types.js";

import type {
  AssociatedField,
  AssociationDiagnostic,
  LabelDefinition,
  LabelValueAssociationResult,
} from "./association-types.js";

import { findLabelMatches, normalizeOcrText } from "./label-matcher.js";

export interface CityFallbackOptions {
  labelThreshold?: number;
  maxRowsBeforeNik?: number;
  minTextLength?: number;
  maxTextLength?: number;
  maxWords?: number;
  minConfidence?: number;

  /**
   * Optional strict validator.
   * Return true only when the text is a valid city/regency name.
   */
  validateCandidate?: (value: string) => boolean;
}

interface CityCandidate {
  rowIndex: number;
  boxes: ProjectedBox[];
  text: string;
  confidence: number;
  score: number;
  reason: string;
}

const DEFAULT_OPTIONS: Required<
  Omit<CityFallbackOptions, "validateCandidate">
> = {
  labelThreshold: 0.65,
  maxRowsBeforeNik: 8,
  minTextLength: 3,
  maxTextLength: 60,
  maxWords: 6,
  minConfidence: 0.58,
};

function getField(
  association: LabelValueAssociationResult,
  fieldName: string,
): AssociatedField | undefined {
  return association.fields.find((field) => field.field === fieldName);
}

function findRowIndex(rows: WordRow[], boxes: ProjectedBox[]): number | null {
  const indexes = new Set(boxes.map((box) => box.originalIndex));

  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.boxes.some((box) => indexes.has(box.originalIndex))) {
      return i;
    }
  }

  return null;
}

function getRecognizedLabelRows(
  rows: WordRow[],
  definitions: LabelDefinition[],
  threshold: number,
): Set<number> {
  const allBoxes = rows.flatMap((row) => row.boxes);

  const matches = findLabelMatches(allBoxes, definitions, threshold);

  const recognizedRows = new Set<number>();

  for (const match of matches) {
    const rowIndex = findRowIndex(rows, match.boxes);

    if (rowIndex !== null) {
      recognizedRows.add(rowIndex);
    }
  }

  return recognizedRows;
}

function normalizeCandidateText(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim();
}

function buildRowText(boxes: ProjectedBox[]): string {
  return [...boxes]
    .sort((a, b) => a.centerU - b.centerU)
    .map((item) => item.box.label?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function isPlausibleCityText(
  value: string,
  options: typeof DEFAULT_OPTIONS,
): boolean {
  const normalized = normalizeCandidateText(value);

  if (
    normalized.length < options.minTextLength ||
    normalized.length > options.maxTextLength
  ) {
    return false;
  }

  const words = normalized.split(/\s+/);

  if (words.length > options.maxWords) {
    return false;
  }

  // A city/regency candidate should primarily contain letters.
  if (!/^[A-ZÀ-ÖØ-Þ\s.'-]+$/u.test(normalized)) {
    return false;
  }

  // Reject punctuation-only or very short tokens.
  if (!words.every((word) => /[A-ZÀ-ÖØ-Þ]/u.test(word))) {
    return false;
  }

  // Reject common non-value OCR fragments.
  const compact = normalizeOcrText(normalized);

  if (
    compact === "NIK" ||
    compact === "PROVINSI" ||
    compact === "KABUPATEN" ||
    compact === "KOTA" ||
    compact === "NAMA"
  ) {
    return false;
  }

  return true;
}

function calculateCandidateConfidence(
  rowIndex: number,
  nikRowIndex: number,
  text: string,
  hasStrictValidation: boolean,
): number {
  const distance = nikRowIndex - rowIndex;

  const proximity = 1 / Math.max(1, distance);

  const normalizedProximity = Math.min(1, proximity * 2);

  const textQuality = text.trim().split(/\s+/).length >= 1 ? 1 : 0;

  if (hasStrictValidation) {
    return Math.min(0.95, 0.85 + normalizedProximity * 0.1);
  }

  // Without a regional dictionary, confidence is intentionally capped.
  return Math.min(0.68, 0.55 + normalizedProximity * 0.08 + textQuality * 0.05);
}

function findNikRowIndex(
  rows: WordRow[],
  association: LabelValueAssociationResult,
  definitions: LabelDefinition[],
  threshold: number,
): number | null {
  const identityField =
    getField(association, "identity_number") ?? getField(association, "nik");

  if (identityField?.labelBoxes.length) {
    return findRowIndex(rows, identityField.labelBoxes);
  }

  const allBoxes = rows.flatMap((row) => row.boxes);

  const matches = findLabelMatches(allBoxes, definitions, threshold);

  const nikMatch = matches.find(
    (match) =>
      match.field === "identity_number" ||
      match.field === "nik" ||
      normalizeOcrText(match.matchedAlias) === "NIK",
  );

  if (!nikMatch) {
    return null;
  }

  return findRowIndex(rows, nikMatch.boxes);
}

function findProvinceRowIndex(
  rows: WordRow[],
  association: LabelValueAssociationResult,
): number | null {
  const provinceField = getField(association, "province");

  if (!provinceField) {
    return null;
  }

  return findRowIndex(rows, [
    ...provinceField.labelBoxes,
    ...provinceField.valueBoxes,
  ]);
}

/**
 * Adds a city fallback only when the regular association
 * has not extracted a city value.
 *
 * This function does not mutate the original association result.
 */
export function applyCityFallback(
  rows: WordRow[],
  association: LabelValueAssociationResult,
  definitions: LabelDefinition[],
  options: CityFallbackOptions = {},
): LabelValueAssociationResult {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const existingCity = getField(association, "city");

  // Never overwrite an existing city value.
  if (existingCity?.value) {
    return association;
  }

  const nikRowIndex = findNikRowIndex(
    rows,
    association,
    definitions,
    config.labelThreshold,
  );

  const provinceRowIndex = findProvinceRowIndex(rows, association);

  // Both anchors are required to avoid searching unrelated rows.
  if (
    nikRowIndex === null ||
    provinceRowIndex === null ||
    provinceRowIndex >= nikRowIndex
  ) {
    return association;
  }

  const usedIndexes = new Set(association.usedWordIndexes);

  const recognizedLabelRows = getRecognizedLabelRows(
    rows,
    definitions,
    config.labelThreshold,
  );

  const startRowIndex = Math.max(
    provinceRowIndex + 1,
    nikRowIndex - config.maxRowsBeforeNik,
  );

  const candidates: CityCandidate[] = [];

  // Search backward from the row immediately before NIK.
  for (let rowIndex = nikRowIndex - 1; rowIndex >= startRowIndex; rowIndex--) {
    // Do not use rows containing recognized labels.
    if (recognizedLabelRows.has(rowIndex)) {
      continue;
    }

    const availableBoxes = rows[rowIndex]!.boxes.filter(
      (box) => !usedIndexes.has(box.originalIndex),
    );

    if (availableBoxes.length === 0) {
      continue;
    }

    const text = normalizeCandidateText(buildRowText(availableBoxes));

    if (!isPlausibleCityText(text, config)) {
      continue;
    }

    const strictValidation = options.validateCandidate?.(text);

    // If a strict validator exists, reject candidates it does not accept.
    if (options.validateCandidate && strictValidation !== true) {
      continue;
    }

    const confidence = calculateCandidateConfidence(
      rowIndex,
      nikRowIndex,
      text,
      options.validateCandidate !== undefined,
    );

    if (confidence < config.minConfidence) {
      continue;
    }

    candidates.push({
      rowIndex,
      boxes: availableBoxes,
      text,
      confidence,
      score: confidence,
      reason: options.validateCandidate
        ? "strict-validation"
        : "positional-heuristic",
    });
  }

  if (candidates.length === 0) {
    return association;
  }

  // The nearest eligible row to NIK has priority.
  candidates.sort((a, b) => b.score - a.score || b.rowIndex - a.rowIndex);

  const selected = candidates[0];

  const cityField: AssociatedField = {
    field: "city",
    label: "POSITION_FALLBACK",
    value: selected!.text,
    labelBoxes: [],
    valueBoxes: selected!.boxes,
    confidence: selected!.confidence,
  };

  const diagnostic: AssociationDiagnostic = {
    field: "city",
    candidateText: selected!.text,
    boxIndexes: selected!.boxes.map((box) => box.originalIndex),
    score: selected!.score,
    accepted: true,
    reason: selected!.reason,
    metadata: {
      // Indeks baris kandidat city
      rowIndex: selected!.rowIndex,
      // Indeks baris NIK
      nikRowIndex,
      // Indeks baris province
      provinceRowIndex,
      // Jarak dalam jumlah baris menuju NIK
      distanceToNik: nikRowIndex - selected!.rowIndex,
      // Apakah kandidat divalidasi menggunakan validator
      validation: options.validateCandidate ? "passed" : "not-validated",
    },
  };

  const fields = [...association.fields];

  if (existingCity) {
    const cityIndex = fields.findIndex((field) => field.field === "city");

    fields[cityIndex] = cityField;
  } else {
    fields.push(cityField);
  }

  return {
    ...association,
    fields,
    usedWordIndexes: [
      ...new Set([
        ...association.usedWordIndexes,
        ...selected!.boxes.map((box) => box.originalIndex),
      ]),
    ],
    diagnostics: [...(association.diagnostics ?? []), diagnostic],
  };
}
