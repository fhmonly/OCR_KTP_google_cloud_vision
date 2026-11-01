import { median } from "../orientation/degree-utils.js";
import type { ProjectedBox } from "../types.js";

import type { LabelDefinition, MatchedLabel } from "./association-types.js";

interface RowGroup {
  centerV: number;
  boxes: ProjectedBox[];
}

interface LabelMatchCandidate {
  match: MatchedLabel;
  aliasLength: number;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeOcrText(text: string): string {
  return normalizeText(text);
}

function isPunctuation(text: string): boolean {
  return /^[\s:：,.;/\\-]+$/.test(text);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
    }

    [previous, current] = [current, previous];
  }

  return previous[b.length]!;
}

function calculateSimilarity(source: string, target: string): number {
  if (!source || !target) return 0;

  const distance = levenshteinDistance(source, target);

  return Math.max(0, 1 - distance / Math.max(source.length, target.length));
}

function groupBoxesByRow(
  boxes: ProjectedBox[],
  medianHeight: number,
  toleranceFactor = 0.75,
): RowGroup[] {
  const sorted = [...boxes].sort(
    (a, b) => a.centerV - b.centerV || a.uMin - b.uMin,
  );

  const tolerance = Math.max(medianHeight * toleranceFactor, 1);
  const rows: RowGroup[] = [];

  for (const box of sorted) {
    let bestRow: RowGroup | null = null;
    let bestDistance = Infinity;

    for (const row of rows) {
      const distance = Math.abs(box.centerV - row.centerV);

      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestRow = row;
      }
    }

    if (!bestRow) {
      rows.push({
        centerV: box.centerV,
        boxes: [box],
      });

      continue;
    }

    bestRow.boxes.push(box);

    bestRow.centerV =
      bestRow.boxes.reduce((sum, item) => sum + item.centerV, 0) /
      bestRow.boxes.length;
  }

  for (const row of rows) {
    row.boxes.sort((a, b) => a.uMin - b.uMin);
  }

  return rows;
}

function formatMatchedText(boxes: ProjectedBox[]): string {
  return boxes
    .map((box) => box.box.label?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchesInRow(
  row: RowGroup,
  definitions: LabelDefinition[],
  threshold: number,
  medianHeight: number,
  maxGapFactor: number,
): LabelMatchCandidate[] {
  const matches: LabelMatchCandidate[] = [];
  const maxGap = medianHeight * maxGapFactor;

  for (let start = 0; start < row.boxes.length; start++) {
    const firstBox = row.boxes[start]!;
    const firstText = firstBox.box.label?.trim() ?? "";

    if (!firstText || isPunctuation(firstText)) continue;

    for (const definition of definitions) {
      for (const alias of definition.aliases) {
        const normalizedAlias = normalizeText(alias);

        if (!normalizedAlias) continue;

        const allowedExtraLength = Math.max(
          2,
          Math.ceil(normalizedAlias.length * (1 - threshold)),
        );

        const maxLength = normalizedAlias.length + allowedExtraLength;

        const maxBoxes = Math.min(
          10,
          Math.max(5, alias.trim().split(/\s+/).length * 3 + 2),
        );

        const selected: ProjectedBox[] = [];
        let combinedText = "";
        let previousBox: ProjectedBox | null = null;

        for (
          let end = start;
          end < row.boxes.length && end < start + maxBoxes;
          end++
        ) {
          const currentBox = row.boxes[end]!;

          if (previousBox) {
            const gap = currentBox.uMin - previousBox.uMax;

            if (gap > maxGap) break;
          }

          const rawText = currentBox.box.label?.trim() ?? "";

          if (!rawText) break;

          selected.push(currentBox);
          combinedText += normalizeText(rawText);
          previousBox = currentBox;

          if (!combinedText) continue;

          const similarity = calculateSimilarity(combinedText, normalizedAlias);

          if (similarity >= threshold) {
            const contentBoxes = selected.filter((box) => {
              const text = box.box.label?.trim() ?? "";
              return !isPunctuation(text);
            });

            const anchorBox = contentBoxes[contentBoxes.length - 1];

            if (anchorBox) {
              matches.push({
                aliasLength: normalizedAlias.length,
                match: {
                  field: definition.field,
                  matchedText: formatMatchedText(contentBoxes),
                  matchedAlias: alias,
                  normalizedText: combinedText,
                  box: anchorBox,
                  boxes: [...contentBoxes],
                  similarity,
                },
              });
            }
          }

          if (combinedText === normalizedAlias) break;
          if (combinedText.length > maxLength) break;
        }
      }
    }
  }

  return matches;
}

function removeOverlappingMatches(
  candidates: LabelMatchCandidate[],
): MatchedLabel[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.match.boxes.length !== b.match.boxes.length) {
      return b.match.boxes.length - a.match.boxes.length;
    }

    if (a.match.similarity !== b.match.similarity) {
      return b.match.similarity - a.match.similarity;
    }

    return b.aliasLength - a.aliasLength;
  });

  const usedIndexes = new Set<number>();
  const result: MatchedLabel[] = [];

  for (const candidate of sorted) {
    const overlaps = candidate.match.boxes.some((box) =>
      usedIndexes.has(box.originalIndex),
    );

    if (overlaps) continue;

    result.push(candidate.match);

    for (const box of candidate.match.boxes) {
      usedIndexes.add(box.originalIndex);
    }
  }

  return result.sort(
    (a, b) => a.box.centerV - b.box.centerV || a.box.uMin - b.box.uMin,
  );
}

export function findLabelMatches(
  boxes: ProjectedBox[],
  definitions: LabelDefinition[],
  threshold = 0.65,
  options: {
    maxLabelGapFactor?: number;
  } = {},
): MatchedLabel[] {
  if (!boxes.length || !definitions.length) return [];

  const heights = boxes.map((box) => box.height).filter((height) => height > 0);

  const medianHeight = Math.max(median(heights), 1);
  const { maxLabelGapFactor = 3 } = options;

  const rows = groupBoxesByRow(boxes, medianHeight);
  const candidates: LabelMatchCandidate[] = [];

  for (const row of rows) {
    candidates.push(
      ...findMatchesInRow(
        row,
        definitions,
        threshold,
        medianHeight,
        maxLabelGapFactor,
      ),
    );
  }

  return removeOverlappingMatches(candidates);
}
