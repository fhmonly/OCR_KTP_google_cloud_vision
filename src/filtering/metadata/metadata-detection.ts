import type { ProjectedBox } from "../../types.js";
import type {
  MetadataBoxDiagnostic,
  MetadataDetectionOptions,
  MetadataDetectionResult,
  MetadataGroup,
} from "./metadata-types.js";

interface Bounds {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

interface DateMatch {
  index: number;
  box: ProjectedBox;
  text: string;
}

const DATE_PATTERN = /\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{4}\b/;

const FIELD_LABEL_PATTERN =
  /^(?:NIK|NAMA|TEMPAT|TGL|TANGGAL|LAHIR|JENIS|KELAMIN|GOL|DARAH|ALAMAT|AGAMA|STATUS|PEKERJAAN|KEWARGANEGARAAN|BERLAKU|HINGGA|RT|RW|KECAMATAN|KEL|DESA|PROVINSI|KABUPATEN|KOTA)$/i;

const SIGNATURE_PATTERN = /^(?:TTD|TANDA\s*TANGAN|TANDA\s*TANGAN\s*PEMEGANG)$/i;

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];

  if (upper === undefined) return 0;

  if (sorted.length % 2 === 0 && lower !== undefined) {
    return (lower + upper) / 2;
  }

  return upper;
}

function getBounds(boxes: ProjectedBox[]): Bounds | null {
  if (boxes.length === 0) return null;

  const minU = Math.min(...boxes.map((box) => box.uMin));
  const maxU = Math.max(...boxes.map((box) => box.uMax));
  const minV = Math.min(...boxes.map((box) => box.vMin));
  const maxV = Math.max(...boxes.map((box) => box.vMax));

  if (![minU, maxU, minV, maxV].every(Number.isFinite)) {
    return null;
  }

  if (maxU <= minU || maxV <= minV) {
    return null;
  }

  return { minU, maxU, minV, maxV };
}

function isInBottomRight(
  box: ProjectedBox,
  bounds: Bounds,
  bottomRatio: number,
  rightRatio: number,
): boolean {
  const width = bounds.maxU - bounds.minU;
  const height = bounds.maxV - bounds.minV;

  if (width <= 0 || height <= 0) return false;

  const bottomStart = bounds.minV + height * bottomRatio;
  const rightStart = bounds.minU + width * rightRatio;

  return box.centerV >= bottomStart && box.centerU >= rightStart;
}

function isDateText(text: string): boolean {
  return DATE_PATTERN.test(normalizeText(text));
}

function isPlaceCandidate(box: ProjectedBox): boolean {
  const text = normalizeText(box.box.label ?? "")
    .replace(/[,:;.]$/g, "")
    .trim();

  if (text.length < 3) return false;
  if (isDateText(text)) return false;
  if (FIELD_LABEL_PATTERN.test(text)) return false;
  if (/^\d+$/.test(text)) return false;

  // Metadata place candidate should contain alphabetic characters.
  return /[A-ZÀ-Ý]/i.test(text);
}

function containsBirthContext(
  boxes: ProjectedBox[],
  dateBox: ProjectedBox,
  typicalHeight: number,
  rowToleranceFactor: number,
): boolean {
  const tolerance = Math.max(
    typicalHeight * rowToleranceFactor,
    dateBox.height * rowToleranceFactor,
  );

  return boxes.some((box) => {
    if (box.originalIndex === dateBox.originalIndex) return false;

    const text = normalizeText(box.box.label ?? "");
    if (!/\b(?:LAHIR|TEMPAT\/TGL|TGL LAHIR|TANGGAL LAHIR)\b/.test(text)) {
      return false;
    }

    const sameRow = Math.abs(box.centerV - dateBox.centerV) <= tolerance;
    const nearby =
      Math.abs(box.centerU - dateBox.centerU) <= typicalHeight * 12;

    return sameRow && nearby;
  });
}

function findPlaceBoxes(
  boxes: ProjectedBox[],
  dateBox: ProjectedBox,
  typicalHeight: number,
  maxGapFactor: number,
  rowToleranceFactor: number,
): ProjectedBox[] {
  const rowTolerance = Math.max(
    typicalHeight * rowToleranceFactor,
    dateBox.height * rowToleranceFactor,
  );

  const maxGap = Math.max(
    typicalHeight * maxGapFactor,
    dateBox.height * maxGapFactor,
  );

  const candidates = boxes
    .filter((box) => {
      if (box.originalIndex === dateBox.originalIndex) return false;
      if (!isPlaceCandidate(box)) return false;

      const sameRow = Math.abs(box.centerV - dateBox.centerV) <= rowTolerance;

      const gap = dateBox.uMin - box.uMax;

      return sameRow && gap >= -typicalHeight * 0.5 && gap <= maxGap;
    })
    .sort((a, b) => a.uMin - b.uMin);

  const selected: ProjectedBox[] = [];
  let boundary = dateBox.uMin;

  // Ambil maksimal 3 box tepat di sebelah kiri tanggal.
  for (
    let index = candidates.length - 1;
    index >= 0 && selected.length < 3;
    index--
  ) {
    const candidate = candidates[index];
    if (!candidate) continue;

    const gap = boundary - candidate.uMax;

    if (gap > maxGap) break;

    selected.push(candidate);
    boundary = candidate.uMin;
  }

  return selected;
}

function getDateMatches(
  boxes: ProjectedBox[],
  bounds: Bounds,
  bottomRatio: number,
  rightRatio: number,
): DateMatch[] {
  const matches: DateMatch[] = [];

  boxes.forEach((box, index) => {
    const text = normalizeText(box.box.label ?? "");

    if (!isDateText(text)) return;
    if (!isInBottomRight(box, bounds, bottomRatio, rightRatio)) return;

    matches.push({ index, box, text });
  });

  return matches;
}

export function detectMetadata(
  boxes: ProjectedBox[],
  options: MetadataDetectionOptions = {},
): MetadataDetectionResult {
  const emptyResult: MetadataDetectionResult = {
    detected: false,
    candidateIndexes: [],
    metadataIndexes: [],
    groups: [],
    diagnostics: [],
  };

  if (boxes.length === 0) return emptyResult;

  const bounds = getBounds(boxes);
  if (!bounds) return emptyResult;

  const bottomRatio = Math.min(
    0.95,
    Math.max(0.4, options.bottomRegionStartRatio ?? 0.68),
  );

  const rightRatio = Math.min(
    0.95,
    Math.max(0.25, options.rightRegionStartRatio ?? 0.55),
  );

  const maxPairGapFactor = Math.min(
    12,
    Math.max(1, options.maxPairGapFactor ?? 6),
  );

  const rowToleranceFactor = Math.min(
    3,
    Math.max(0.5, options.rowToleranceFactor ?? 1.5),
  );

  const minRemovalConfidence = Math.min(
    1,
    Math.max(0, options.minRemovalConfidence ?? 0.8),
  );

  const typicalHeight = median(
    boxes
      .map((box) => box.height)
      .filter((height) => Number.isFinite(height) && height > 0),
  );

  if (typicalHeight <= 0) return emptyResult;

  const dateMatches = getDateMatches(boxes, bounds, bottomRatio, rightRatio);

  const groups: MetadataGroup[] = [];
  const diagnostics: MetadataBoxDiagnostic[] = [];
  const candidateIndexes = new Set<number>();
  const metadataIndexes = new Set<number>();
  const diagnosticIndexes = new Set<number>();

  for (const dateMatch of dateMatches) {
    const dateBox = dateMatch.box;

    // Avoid removing a date that appears to belong to the birth field.
    if (
      containsBirthContext(boxes, dateBox, typicalHeight, rowToleranceFactor)
    ) {
      continue;
    }

    const placeBoxes = findPlaceBoxes(
      boxes,
      dateBox,
      typicalHeight,
      maxPairGapFactor,
      rowToleranceFactor,
    );

    if (placeBoxes.length === 0) {
      candidateIndexes.add(dateBox.originalIndex);

      diagnostics.push({
        originalIndex: dateBox.originalIndex,
        label: dateBox.box.label?.trim() ?? "",
        type: "date-made",
        classification: "metadata-candidate",
        confidence: 0.6,
        reason:
          "Tanggal berada di area kanan bawah, tetapi pasangan tempat belum ditemukan. Box tidak dihapus.",
      });

      diagnosticIndexes.add(dateBox.originalIndex);
      continue;
    }

    const groupIndexes = [
      ...placeBoxes.map((box) => box.originalIndex),
      dateBox.originalIndex,
    ];

    // Place + date pair in bottom-right region.
    const confidence = 0.86;

    const group: MetadataGroup = {
      id: groups.length,
      type: "place-date",
      indexes: groupIndexes,
      placeIndexes: placeBoxes.map((box) => box.originalIndex),
      dateIndexes: [dateBox.originalIndex],
      confidence,
    };

    groups.push(group);

    for (const placeBox of placeBoxes) {
      candidateIndexes.add(placeBox.originalIndex);
      diagnosticIndexes.add(placeBox.originalIndex);

      const confirmed = confidence >= minRemovalConfidence;

      diagnostics.push({
        originalIndex: placeBox.originalIndex,
        label: placeBox.box.label?.trim() ?? "",
        type: "place-made",
        classification: confirmed ? "metadata" : "metadata-candidate",
        confidence,
        groupId: group.id,
        reason: "Teks tempat berada tepat sebelum tanggal di area kanan bawah.",
      });

      if (confirmed) {
        metadataIndexes.add(placeBox.originalIndex);
      }
    }

    candidateIndexes.add(dateBox.originalIndex);
    diagnosticIndexes.add(dateBox.originalIndex);

    const confirmed = confidence >= minRemovalConfidence;

    diagnostics.push({
      originalIndex: dateBox.originalIndex,
      label: dateBox.box.label?.trim() ?? "",
      type: "date-made",
      classification: confirmed ? "metadata" : "metadata-candidate",
      confidence,
      groupId: group.id,
      reason: "Tanggal membentuk pasangan tempat/tanggal di area kanan bawah.",
    });

    if (confirmed) {
      metadataIndexes.add(dateBox.originalIndex);
    }
  }

  // Detect explicit signature markers only; don't infer handwritten
  // signature areas from OCR text alone.
  for (const box of boxes) {
    const text = normalizeText(box.box.label ?? "")
      .replace(/[.:,;]/g, "")
      .trim();

    if (!SIGNATURE_PATTERN.test(text)) continue;

    const inBottomRight = isInBottomRight(box, bounds, bottomRatio, rightRatio);

    const confidence = inBottomRight ? 0.9 : 0.55;
    const confirmed = confidence >= minRemovalConfidence;

    candidateIndexes.add(box.originalIndex);
    diagnosticIndexes.add(box.originalIndex);

    diagnostics.push({
      originalIndex: box.originalIndex,
      label: box.box.label?.trim() ?? "",
      type: "signature-marker",
      classification: confirmed ? "metadata" : "metadata-candidate",
      confidence,
      reason: inBottomRight
        ? "Marker tanda tangan berada di area kanan bawah."
        : "Marker tanda tangan ditemukan, tetapi posisinya belum cukup kuat.",
    });

    if (confirmed) {
      metadataIndexes.add(box.originalIndex);
    }
  }

  return {
    detected: metadataIndexes.size > 0,
    candidateIndexes: [...candidateIndexes],
    metadataIndexes: [...metadataIndexes],
    groups,
    diagnostics,
  };
}
