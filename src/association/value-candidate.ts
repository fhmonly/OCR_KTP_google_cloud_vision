import type { ProjectedBox } from "../types.js";

import type {
  AssociationOptions,
  MatchedLabel,
  ValueCandidate,
} from "./association-types.js";

export interface CandidateSearchContext {
  label: MatchedLabel;
  boxes: ProjectedBox[];
  excludedIndexes: Set<number>;
  medianHeight: number;

  startU?: number;
  endU?: number;
  anchorV?: number;
}

function isPunctuation(text: string): boolean {
  return /^[\s:：,.;/\\-]+$/.test(text);
}

export function findValueCandidates(
  context: CandidateSearchContext,
  options: AssociationOptions = {},
): ValueCandidate[] {
  const {
    maxForwardDistanceFactor = 25,
    maxVerticalDistanceFactor = 0.9,
    verticalPenalty = 1.5,
  } = options;

  const { label, boxes, excludedIndexes, medianHeight } = context;

  const safeHeight = Math.max(medianHeight, 1);

  const startU = context.startU ?? label.box.uMax;
  const endU = context.endU ?? Infinity;
  const anchorV = context.anchorV ?? label.box.centerV;

  const maxForwardDistance = safeHeight * maxForwardDistanceFactor;

  const maxVerticalDistance = safeHeight * maxVerticalDistanceFactor;

  const overlapTolerance = safeHeight * 0.15;

  const candidates: ValueCandidate[] = [];

  for (const box of boxes) {
    if (excludedIndexes.has(box.originalIndex)) continue;

    const text = box.box.label?.trim() ?? "";

    if (!text || isPunctuation(text)) continue;

    const horizontalDistance = box.uMin - startU;
    const verticalDistance = Math.abs(box.centerV - anchorV);

    if (horizontalDistance < -overlapTolerance) continue;

    if (horizontalDistance > maxForwardDistance) continue;

    // Tolak box yang mulai atau berakhir melewati batas field.
    if (box.uMin >= endU) continue;
    if (box.uMax > endU + overlapTolerance) continue;

    if (verticalDistance > maxVerticalDistance) continue;

    const normalizedHorizontal = Math.max(0, horizontalDistance) / safeHeight;

    const normalizedVertical = verticalDistance / safeHeight;

    const score = normalizedHorizontal + normalizedVertical * verticalPenalty;

    candidates.push({
      box,
      score,
      horizontalDistance,
      verticalDistance,
    });
  }

  return candidates.sort((a, b) => a.score - b.score);
}
