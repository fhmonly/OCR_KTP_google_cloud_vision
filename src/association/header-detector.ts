import type { ProjectedBox } from "../types.js";
import type {
  AssociatedField,
  AssociationDiagnostic,
  LabelDefinition,
  LabelValueAssociationResult,
} from "./association-types.js";

import { findLabelMatches, normalizeOcrText } from "./label-matcher.js";
import { associateLabelValues } from "./label-value-association.js";

const HEADER_LABELS: LabelDefinition[] = [
  {
    field: "province",
    aliases: ["Provinsi"],
  },
  {
    field: "city",
    aliases: ["Kota", "Kabupaten"],
  },
];

const NIK_LABEL: LabelDefinition[] = [
  {
    field: "identity_number",
    aliases: ["NIK"],
  },
];

export interface HeaderDetectionOptions {
  labelThreshold?: number;
  maxLabelGapFactor?: number;
  maxInterWordGapFactor?: number;
  maxVerticalDistanceFactor?: number;
  sameRowToleranceFactor?: number;
  maxWords?: number;
  minValueLength?: number;
  maxValueLength?: number;
}

export interface HeaderDetectionResult {
  detected: boolean;
  anchorIndex: number | null;
  candidateIndexes: number[];
  acceptedIndexes: number[];
  rejectedIndexes: number[];
  association: LabelValueAssociationResult;
}

const DEFAULT_OPTIONS: Required<HeaderDetectionOptions> = {
  labelThreshold: 0.65,
  maxLabelGapFactor: 3,
  maxInterWordGapFactor: 2.5,
  maxVerticalDistanceFactor: 0.9,
  sameRowToleranceFactor: 0.75,
  maxWords: 12,
  minValueLength: 2,
  maxValueLength: 80,
};

function findNikAnchor(
  boxes: ProjectedBox[],
  threshold: number,
): ProjectedBox | null {
  const matches = findLabelMatches(boxes, NIK_LABEL, threshold);

  const nikMatch = matches.find(
    (match) =>
      match.field === "identity_number" &&
      normalizeOcrText(match.matchedAlias) === "NIK",
  );

  return nikMatch?.box ?? null;
}

function isPlausibleHeaderValue(
  field: string,
  value: string,
  options: Required<HeaderDetectionOptions>,
): boolean {
  const normalized = value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized.length < options.minValueLength ||
    normalized.length > options.maxValueLength
  ) {
    return false;
  }

  // Header value harus berupa teks, bukan angka atau noise campuran.
  if (!/^[A-ZÀ-ÖØ-Þ\s.'-]+$/u.test(normalized)) {
    return false;
  }

  const compact = normalizeOcrText(normalized);

  if (
    compact === "PROVINSI" ||
    compact === "KOTA" ||
    compact === "KABUPATEN" ||
    compact === "NIK" ||
    compact === "NAMA"
  ) {
    return false;
  }

  // Tolak value yang hanya terdiri dari satu karakter alfabet.
  if (!/[A-ZÀ-ÖØ-Þ]{2,}/u.test(normalized)) {
    return false;
  }

  // Field tetap dipisahkan agar validasi khusus bisa ditambahkan.
  switch (field) {
    case "province":
    case "city":
      return true;

    default:
      return false;
  }
}

function createEmptyAssociation(): LabelValueAssociationResult {
  return {
    fields: [],
    unmatchedLabels: [],
    usedWordIndexes: [],
    diagnostics: [],
  };
}

function validateHeaderAssociation(
  association: LabelValueAssociationResult,
  options: Required<HeaderDetectionOptions>,
): {
  association: LabelValueAssociationResult;
  acceptedIndexes: number[];
  rejectedIndexes: number[];
} {
  const acceptedIndexes = new Set<number>();
  const rejectedIndexes = new Set<number>();
  const diagnostics: AssociationDiagnostic[] = [
    ...(association.diagnostics ?? []),
  ];

  const fields: AssociatedField[] = association.fields.map((field) => {
    if (!field.value || field.valueBoxes.length === 0) {
      return field;
    }

    const valid = isPlausibleHeaderValue(field.field, field.value, options);

    for (const box of field.valueBoxes) {
      if (valid) {
        acceptedIndexes.add(box.originalIndex);
      } else {
        rejectedIndexes.add(box.originalIndex);
      }
    }

    if (!valid) {
      diagnostics.push({
        field: field.field,
        candidateText: field.value,
        boxIndexes: field.valueBoxes.map((box) => box.originalIndex),
        score: 0,
        accepted: false,
        reason: "Header value ditolak oleh validasi teks.",
      });

      return {
        ...field,
        value: null,
        valueBoxes: [],
        confidence: 0,
      };
    }

    return field;
  });

  return {
    association: {
      ...association,
      fields,
      usedWordIndexes: [...acceptedIndexes],
      diagnostics,
    },
    acceptedIndexes: [...acceptedIndexes],
    rejectedIndexes: [...rejectedIndexes],
  };
}

export function detectKtpHeader(
  boxes: ProjectedBox[],
  options: HeaderDetectionOptions = {},
): HeaderDetectionResult {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const emptyResult: HeaderDetectionResult = {
    detected: false,
    anchorIndex: null,
    candidateIndexes: [],
    acceptedIndexes: [],
    rejectedIndexes: [],
    association: createEmptyAssociation(),
  };

  if (boxes.length === 0) {
    return emptyResult;
  }

  const nikAnchor = findNikAnchor(boxes, config.labelThreshold);

  // Tanpa NIK, batas header belum dapat ditentukan secara aman.
  if (!nikAnchor) {
    return emptyResult;
  }

  // Semua box pada baris sebelum NIK menjadi kandidat header.
  const candidateBoxes = boxes.filter((box) => box.centerV < nikAnchor.centerV);

  const candidateIndexes = candidateBoxes.map((box) => box.originalIndex);

  if (candidateBoxes.length === 0) {
    return {
      ...emptyResult,
      anchorIndex: nikAnchor.originalIndex,
    };
  }

  const association = associateLabelValues(
    candidateBoxes,
    HEADER_LABELS,
    config.labelThreshold,
    {
      maxLabelGapFactor: config.maxLabelGapFactor,
      maxInterWordGapFactor: config.maxInterWordGapFactor,
      maxVerticalDistanceFactor: config.maxVerticalDistanceFactor,
      sameRowToleranceFactor: config.sameRowToleranceFactor,
      maxWords: config.maxWords,
    },
  );

  const validated = validateHeaderAssociation(association, config);

  const detected = validated.association.fields.some(
    (field) => field.value !== null,
  );

  return {
    detected,
    anchorIndex: nikAnchor.originalIndex,
    candidateIndexes,
    acceptedIndexes: validated.acceptedIndexes,
    rejectedIndexes: validated.rejectedIndexes,
    association: validated.association,
  };
}
