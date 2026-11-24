import assert from "node:assert/strict";
import test from "node:test";

import visionFixture from "../datasets/semirealis-normal.json" with { type: "json" };

import { sortWordBoxes } from "../src/sorting/sort-word-boxes.js";
import type { TransformedTextAnnotation } from "../src/types.js";

import { detectMetadata } from "../src/filtering/metadata/metadata-detection.js";
import { filterMetadataBoxes } from "../src/filtering/metadata/metadata-filter.js";

function transformAnnotations(): TransformedTextAnnotation[] {
  return visionFixture.textAnnotations.slice(1).flatMap((annotation, index) => {
    const vertices = annotation.boundingPoly?.vertices;

    if (
      vertices === undefined ||
      vertices.length !== 4 ||
      vertices.some(
        (vertex) => vertex.x === undefined || vertex.y === undefined,
      )
    ) {
      return [];
    }

    const first = vertices[0];
    const second = vertices[1];
    const fourth = vertices[3];

    if (
      first?.x === undefined ||
      first.y === undefined ||
      second?.x === undefined ||
      second.y === undefined ||
      fourth?.x === undefined ||
      fourth.y === undefined
    ) {
      return [];
    }

    const width = Math.hypot(second.x - first.x, second.y - first.y);

    const height = Math.hypot(fourth.x - first.x, fourth.y - first.y);

    const degree =
      (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;

    return [
      {
        originalIndex: index,
        label: annotation.description ?? "",
        vertices: vertices.map((vertex) => ({
          x: vertex.x ?? 0,
          y: vertex.y ?? 0,
        })),
        dimension: {
          w: width,
          h: height,
        },
        degree,
      },
    ];
  });
}

function createMetadataResult() {
  const words = transformAnnotations();
  const sorted = sortWordBoxes(words);

  if (!sorted) return;

  const detection = detectMetadata(sorted.projected, {
    bottomRegionStartRatio: 0.68,
    rightRegionStartRatio: 0.55,
    maxPairGapFactor: 6,
    rowToleranceFactor: 1.5,
    minRemovalConfidence: 0.8,
  });

  const targetIndexes = new Set([71, 72, 73]);

  // console.log(
  //   "TARGET METADATA:",
  //   sorted.projected
  //     .filter((box) => targetIndexes.has(box.originalIndex))
  //     .map((box) => ({
  //       originalIndex: box.originalIndex,
  //       label: box.box.label,
  //       centerU: box.centerU,
  //       centerV: box.centerV,
  //       uMin: box.uMin,
  //       uMax: box.uMax,
  //       vMin: box.vMin,
  //       vMax: box.vMax,
  //     })),
  // );

  // console.log("DETECTION:", {
  //   candidateIndexes: detection.candidateIndexes,
  //   metadataIndexes: detection.metadataIndexes,
  //   groups: detection.groups,
  //   diagnostics: detection.diagnostics,
  // });

  const metadataStrings = sorted.projected
    .filter((v) => detection.metadataIndexes.includes(v.originalIndex))
    .map((v) => v.box.label)
    .join(" ");

  console.log("Metadata string");
  console.log(metadataStrings);

  const filtering = filterMetadataBoxes(sorted.projected, detection);

  return {
    words,
    sorted,
    detection,
    filtering,
  };
}

test("detects metadata from original.json", () => {
  const metadataResult = createMetadataResult();
  if (!metadataResult) return;

  const { detection } = metadataResult;

  assert.equal(detection.detected, true);
  assert.ok(detection.candidateIndexes.length > 0);
  assert.ok(detection.metadataIndexes.length > 0);
});

test("filters detected metadata boxes", () => {
  const metadataResult = createMetadataResult();
  if (!metadataResult) return;

  const { detection, filtering } = metadataResult;

  for (const index of detection.metadataIndexes) {
    assert.ok(
      filtering.removedIndexes.includes(index),
      `Metadata index ${index} should be removed`,
    );
  }

  for (const index of filtering.removedIndexes) {
    assert.ok(
      detection.metadataIndexes.includes(index),
      `Unexpected removed index: ${index}`,
    );
  }
});

test("preserves boxes that are not classified as metadata", () => {
  const metadataResult = createMetadataResult();
  if (!metadataResult) return;

  const { sorted, detection, filtering } = metadataResult;

  const removedIndexes = new Set(filtering.removedIndexes);

  const expectedRemaining = sorted.projected
    .filter((box) => !removedIndexes.has(box.originalIndex))
    .map((box) => box.originalIndex);

  const actualRemaining = filtering.boxes.map((box) => box.originalIndex);

  assert.deepEqual(actualRemaining, expectedRemaining);
});
