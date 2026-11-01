import type { ProjectedBox } from "../types.js";

import { median } from "../orientation/degree-utils.js";

import { findLabelMatches } from "./label-matcher.js";

import { findValueCandidates } from "./value-candidate.js";

import type {
  AssociatedField,
  AssociationDiagnostic,
  AssociationOptions,
  LabelDefinition,
  LabelValueAssociationResult,
  MatchedLabel,
} from "./association-types.js";

interface FieldBoundary {
  startU: number;
  endU: number;
  centerV: number;
  separator: ProjectedBox | null;
}

interface ValidationResult {
  score: number;
  reason: string;
}

interface ValueSequenceCandidate {
  boxes: ProjectedBox[];
  text: string;
  score: number;
  validationScore: number;
  validationReason: string;
}

interface LabelCandidateGroup {
  label: MatchedLabel;
  boundary: FieldBoundary;
  candidates: ValueSequenceCandidate[];
}

function isPunctuation(text: string): boolean {
  return /^[\s:：,.;/\\-]+$/.test(text);
}

function isColon(text: string): boolean {
  return /^[:：]+$/.test(text.trim());
}

function getLabelBounds(label: MatchedLabel): {
  minU: number;
  maxU: number;
  centerV: number;
} {
  const boxes = label.boxes;

  return {
    minU: Math.min(...boxes.map((box) => box.uMin)),
    maxU: Math.max(...boxes.map((box) => box.uMax)),
    centerV: boxes.reduce((sum, box) => sum + box.centerV, 0) / boxes.length,
  };
}

function joinOcrTokens(boxes: ProjectedBox[]): string {
  return boxes
    .map((box) => box.box.label?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeFieldValue(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isSameRow(
  a: ProjectedBox,
  b: ProjectedBox,
  medianHeight: number,
  toleranceFactor: number,
): boolean {
  return (
    Math.abs(a.centerV - b.centerV) <=
    Math.max(medianHeight * toleranceFactor, 1)
  );
}

function findNextLabelBoundary(
  label: MatchedLabel,
  labels: MatchedLabel[],
  medianHeight: number,
  toleranceFactor: number,
): number {
  const current = getLabelBounds(label);

  let nextBoundary = Infinity;

  for (const otherLabel of labels) {
    if (otherLabel === label) continue;

    const other = getLabelBounds(otherLabel);

    if (
      Math.abs(other.centerV - current.centerV) >
      medianHeight * toleranceFactor
    ) {
      continue;
    }

    // Hanya label yang berada di sebelah kanan label sekarang.
    if (other.minU <= current.maxU) continue;

    nextBoundary = Math.min(nextBoundary, other.minU);
  }

  return nextBoundary;
}

function findColonSeparator(
  label: MatchedLabel,
  boxes: ProjectedBox[],
  medianHeight: number,
  endU: number,
  options: AssociationOptions,
): ProjectedBox | null {
  const bounds = getLabelBounds(label);

  const maxDistance = medianHeight * (options.colonSearchDistanceFactor ?? 8);

  const sameRowTolerance =
    medianHeight * (options.sameRowToleranceFactor ?? 0.9);

  const candidates = boxes.filter((box) => {
    const text = box.box.label?.trim() ?? "";

    if (!isColon(text)) return false;

    if (box.uMin < bounds.maxU - medianHeight * 0.15) {
      return false;
    }

    if (box.uMin >= endU) return false;

    if (box.uMin - bounds.maxU > maxDistance) {
      return false;
    }

    if (Math.abs(box.centerV - bounds.centerV) > sameRowTolerance) {
      return false;
    }

    return true;
  });

  candidates.sort(
    (a, b) => Math.abs(a.uMin - bounds.maxU) - Math.abs(b.uMin - bounds.maxU),
  );

  return candidates[0] ?? null;
}

function buildFieldBoundary(
  label: MatchedLabel,
  labels: MatchedLabel[],
  boxes: ProjectedBox[],
  medianHeight: number,
  options: AssociationOptions,
): FieldBoundary {
  const bounds = getLabelBounds(label);

  const endU = findNextLabelBoundary(
    label,
    labels,
    medianHeight,
    options.sameRowToleranceFactor ?? 0.9,
  );

  const separator = findColonSeparator(
    label,
    boxes,
    medianHeight,
    endU,
    options,
  );

  return {
    startU: separator ? separator.uMax : bounds.maxU,
    endU,
    centerV: bounds.centerV,
    separator,
  };
}

function validateValue(field: string, value: string): ValidationResult {
  const normalizedField = normalizeFieldName(field);
  const normalizedValue = normalizeFieldValue(value);

  if (!normalizedValue) {
    return {
      score: 0,
      reason: "Value kosong.",
    };
  }

  switch (normalizedField) {
    case "identitynumber":
    case "nik": {
      const valid = /^\d{16}$/.test(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "NIK memiliki 16 digit."
          : "NIK harus terdiri dari 16 digit.",
      };
    }

    case "birthdate":
    case "expireddate": {
      const valid =
        /^(0[1-9]|[12]\d|3[01])[-/](0[1-9]|1[0-2])[-/](19|20)\d{2}$/.test(
          value.trim(),
        ) || normalizedValue === "SEUMURHIDUP";

      return {
        score: valid ? 1 : 0.2,
        reason: valid
          ? "Format tanggal atau masa berlaku dikenali."
          : "Format tanggal tidak dikenali.",
      };
    }

    case "gender": {
      const valid = /^(LAKILAKI|PEREMPUAN)$/.test(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "Jenis kelamin dikenali."
          : "Value tidak sesuai pola jenis kelamin.",
      };
    }

    case "bloodtype": {
      const valid = /^(A|B|AB|O)$/.test(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "Golongan darah dikenali."
          : "Value bukan golongan darah yang dikenal.",
      };
    }

    case "religion": {
      const religions = [
        "ISLAM",
        "KRISTEN",
        "KATOLIK",
        "HINDU",
        "BUDDHA",
        "BUDHA",
        "KONGHUCU",
      ];

      const valid = religions.includes(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "Agama dikenali."
          : "Value tidak ditemukan dalam daftar agama.",
      };
    }

    case "maritalstatus": {
      const statuses = ["BELUMKAWIN", "KAWIN", "CERAIHIDUP", "CERAIMATI"];

      const valid = statuses.includes(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "Status perkawinan dikenali."
          : "Status perkawinan tidak dikenali.",
      };
    }

    case "nationality": {
      const valid = ["WNI", "WNA"].includes(normalizedValue);

      return {
        score: valid ? 1 : 0,
        reason: valid
          ? "Kewarganegaraan dikenali."
          : "Kewarganegaraan tidak dikenali.",
      };
    }

    default:
      return {
        score: 0.5,
        reason: "Tidak ada validasi khusus untuk field ini.",
      };
  }
}

function isCompositeBirthLabel(label: MatchedLabel): boolean {
  const field = normalizeFieldName(label.field);

  return (
    field === "birthplace" ||
    field === "birthdate" ||
    /TEMPAT.*TGL.*LAHIR/i.test(label.matchedAlias)
  );
}

function splitBirthValue(value: string): {
  birthPlace: string | null;
  birthDate: string | null;
} {
  const dateRegex = /\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/;

  const match = value.match(dateRegex);

  if (!match || match.index === undefined) {
    return {
      birthPlace: value.trim() || null,
      birthDate: null,
    };
  }

  const birthPlace = value
    .slice(0, match.index)
    .replace(/[,\s]+$/, "")
    .trim();

  return {
    birthPlace: birthPlace || null,
    birthDate: match[0],
  };
}

function buildValueSequence(
  candidates: ReturnType<typeof findValueCandidates>,
  medianHeight: number,
  boundary: FieldBoundary,
  options: AssociationOptions,
): ValueSequenceCandidate[] {
  const safeHeight = Math.max(medianHeight, 1);

  const maxInterWordGap = safeHeight * (options.maxInterWordGapFactor ?? 2.5);

  const maxWords = options.maxWords ?? 12;

  const sameRowTolerance = safeHeight * (options.sameRowToleranceFactor ?? 0.9);

  const sorted = [...candidates].sort((a, b) => a.box.uMin - b.box.uMin);

  const results: ValueSequenceCandidate[] = [];

  for (let start = 0; start < sorted.length; start++) {
    const selected = [sorted[start]!];

    let totalGapPenalty = 0;

    for (
      let end = start + 1;
      end < sorted.length && selected.length < maxWords;
      end++
    ) {
      const current = sorted[end]!;
      const previous = selected[selected.length - 1]!;

      const gap = current.box.uMin - previous.box.uMax;

      // Rangkaian berhenti jika jarak terlalu jauh.
      if (gap > maxInterWordGap) break;

      // Jangan menggabungkan kata dari baris berbeda.
      const verticalDifference = Math.abs(
        current.box.centerV - boundary.centerV,
      );

      if (verticalDifference > sameRowTolerance) {
        break;
      }

      // Hindari box yang bertumpang tindih.
      if (current.box.uMin < previous.box.uMax) {
        continue;
      }

      // Tambahkan penalti berdasarkan jarak antar-kata.
      const normalizedGap = Math.max(0, gap) / safeHeight;

      totalGapPenalty += normalizedGap * 0.25;

      selected.push(current);

      const sequenceBoxes = selected.map((item) => item.box);

      const text = joinOcrTokens(sequenceBoxes);

      if (!text) continue;

      /*
       * Skor menggunakan jarak kata pertama terhadap label.
       * Jarak kata berikutnya dihitung terhadap kata sebelumnya,
       * bukan terhadap label.
       */
      const firstWordScore = selected[0]!.score;

      const continuationReward = (selected.length - 1) * 0.8;

      const score = firstWordScore + totalGapPenalty - continuationReward;

      results.push({
        boxes: sequenceBoxes,
        text,
        score,
        validationScore: 0,
        validationReason: "",
      });
    }

    // Kandidat satu kata tetap disimpan.
    const first = selected[0]!;

    const firstText = joinOcrTokens([first.box]);

    if (firstText) {
      results.push({
        boxes: [first.box],
        text: firstText,
        score: first.score,
        validationScore: 0,
        validationReason: "",
      });
    }
  }

  return results;
}

function calculateConfidence(
  label: MatchedLabel,
  candidate: ValueSequenceCandidate,
  medianHeight: number,
): number {
  const labelConfidence = Math.max(0, Math.min(1, label.similarity));

  const geometryConfidence = Math.exp(
    -Math.max(0, candidate.score) /
      Math.max(5, medianHeight / Math.max(medianHeight, 1)),
  );

  const validationConfidence = candidate.validationScore;

  const wordCountConfidence = candidate.boxes.length > 0 ? 1 : 0;

  const confidence =
    labelConfidence * 0.3 +
    geometryConfidence * 0.2 +
    validationConfidence * 0.4 +
    wordCountConfidence * 0.1;

  return Math.max(0, Math.min(1, confidence));
}

function findSequenceCandidates(
  label: MatchedLabel,
  boxes: ProjectedBox[],
  excludedIndexes: Set<number>,
  medianHeight: number,
  boundary: FieldBoundary,
  options: AssociationOptions,
): ValueSequenceCandidate[] {
  const candidates = findValueCandidates(
    {
      label,
      boxes,
      excludedIndexes,
      medianHeight,
      startU: boundary.startU,
      endU: boundary.endU,
      anchorV: boundary.centerV,
    },
    options,
  );

  const sequences = buildValueSequence(
    candidates,
    medianHeight,
    boundary,
    options,
  );

  for (const candidate of sequences) {
    const validation = validateValue(label.field, candidate.text);

    candidate.validationScore = validation.score;
    candidate.validationReason = validation.reason;
  }

  return sequences.sort((a, b) => {
    const scoreA = a.score - a.validationScore * 3;

    const scoreB = b.score - b.validationScore * 3;

    return scoreA - scoreB;
  });
}

function createDiagnostic(
  field: string,
  candidate: ValueSequenceCandidate,
  accepted: boolean,
  reason: string,
): AssociationDiagnostic {
  return {
    field,
    candidateText: candidate.text,
    boxIndexes: candidate.boxes.map((box) => box.originalIndex),
    score: candidate.score - candidate.validationScore * 3,
    accepted,
    reason,
  };
}

function createAssociatedField(
  label: MatchedLabel,
  value: string | null,
  valueBoxes: ProjectedBox[],
  confidence: number,
): AssociatedField {
  return {
    field: label.field,
    label: label.matchedText,
    value,
    labelBoxes: label.boxes,
    valueBoxes,
    confidence,
  };
}

export function associateLabelValues(
  boxes: ProjectedBox[],
  definitions: LabelDefinition[],
  labelThreshold = 0.65,
  options: AssociationOptions = {},
): LabelValueAssociationResult {
  if (!boxes.length || !definitions.length) {
    return {
      fields: [],
      unmatchedLabels: [],
      usedWordIndexes: [],
      diagnostics: [],
    };
  }

  const heights = boxes.map((box) => box.height).filter((height) => height > 0);

  const medianHeight = Math.max(median(heights), 1);

  const labels = findLabelMatches(boxes, definitions, labelThreshold, {
    maxLabelGapFactor: options.maxLabelGapFactor ?? 3,
  });

  const excludedIndexes = new Set<number>();

  // Semua label harus dikecualikan sebelum pencarian value dimulai.
  for (const label of labels) {
    for (const box of label.boxes) {
      excludedIndexes.add(box.originalIndex);
    }
  }

  const groups: LabelCandidateGroup[] = [];

  for (const label of labels) {
    const boundary = buildFieldBoundary(
      label,
      labels,
      boxes,
      medianHeight,
      options,
    );

    // Separator bukan bagian label maupun value.
    if (boundary.separator) {
      excludedIndexes.add(boundary.separator.originalIndex);
    }

    const candidates = findSequenceCandidates(
      label,
      boxes,
      excludedIndexes,
      medianHeight,
      boundary,
      options,
    );

    groups.push({
      label,
      boundary,
      candidates,
    });
  }

  const diagnostics: AssociationDiagnostic[] = [];
  const unmatchedLabels: MatchedLabel[] = [];

  const selected = new Map<MatchedLabel, ValueSequenceCandidate>();

  const assignments: {
    label: MatchedLabel;
    candidate: ValueSequenceCandidate;
    rank: number;
  }[] = [];

  for (const group of groups) {
    if (!group.candidates.length) {
      unmatchedLabels.push(group.label);
      continue;
    }

    const best = group.candidates[0]!;

    assignments.push({
      label: group.label,
      candidate: best,
      rank:
        best.score - best.validationScore * 3 - group.label.similarity * 0.5,
    });

    for (const candidate of group.candidates.slice(0, 5)) {
      diagnostics.push(
        createDiagnostic(
          group.label.field,
          candidate,
          candidate === best,
          candidate === best
            ? `Kandidat utama. ${candidate.validationReason}`
            : `Kandidat alternatif. ${candidate.validationReason}`,
        ),
      );
    }
  }

  // Pemilihan global: satu box tidak boleh digunakan oleh dua field.
  assignments.sort((a, b) => a.rank - b.rank);

  const globallyUsedIndexes = new Set<number>();

  for (const assignment of assignments) {
    const overlaps = assignment.candidate.boxes.some((box) =>
      globallyUsedIndexes.has(box.originalIndex),
    );

    if (overlaps) {
      unmatchedLabels.push(assignment.label);

      diagnostics.push(
        createDiagnostic(
          assignment.label.field,
          assignment.candidate,
          false,
          "Ditolak karena box sudah digunakan field lain.",
        ),
      );

      continue;
    }

    selected.set(assignment.label, assignment.candidate);

    for (const box of assignment.candidate.boxes) {
      globallyUsedIndexes.add(box.originalIndex);
    }
  }

  const fields: AssociatedField[] = [];

  for (const label of labels) {
    const candidate = selected.get(label);

    if (!candidate) {
      fields.push(createAssociatedField(label, null, [], 0));

      continue;
    }

    const confidence = calculateConfidence(label, candidate, medianHeight);

    if (isCompositeBirthLabel(label)) {
      const split = splitBirthValue(candidate.text);

      const birthPlaceLabel: MatchedLabel = {
        ...label,
        field: "birth_place",
      };

      const birthDateLabel: MatchedLabel = {
        ...label,
        field: "birth_date",
      };

      const dateRegex = /\d{1,2}[-/]\d{1,2}[-/]\d{4}/;

      const dateStartIndex = candidate.boxes.findIndex((box) =>
        dateRegex.test(box.box.label ?? ""),
      );

      const dateBoxes =
        dateStartIndex >= 0 ? candidate.boxes.slice(dateStartIndex) : [];

      const placeBoxes =
        dateStartIndex >= 0
          ? candidate.boxes.slice(0, dateStartIndex)
          : candidate.boxes;

      const placeConfidence = split.birthPlace ? confidence : 0;

      const dateConfidence = split.birthDate ? confidence : 0;

      fields.push(
        createAssociatedField(
          birthPlaceLabel,
          split.birthPlace,
          placeBoxes,
          placeConfidence,
        ),
      );

      fields.push(
        createAssociatedField(
          birthDateLabel,
          split.birthDate,
          dateBoxes,
          dateConfidence,
        ),
      );

      continue;
    }

    fields.push(
      createAssociatedField(label, candidate.text, candidate.boxes, confidence),
    );
  }

  // Separator dan label tidak termasuk usedWordIndexes.
  for (const index of globallyUsedIndexes) {
    excludedIndexes.add(index);
  }

  return {
    fields,
    unmatchedLabels,
    usedWordIndexes: [...globallyUsedIndexes],
    diagnostics,
  };
}
