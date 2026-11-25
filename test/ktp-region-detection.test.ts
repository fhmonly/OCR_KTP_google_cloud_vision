import assert from "node:assert/strict";
import test from "node:test";

import clockwiseFixture from "../datasets/45-clockwise.json" with { type: "json" };
import counterClockwiseFixture from "../datasets/45-counter-clockwise.json" with { type: "json" };
import leftFixture from "../datasets/90-left.json" with { type: "json" };
import rightFixture from "../datasets/90-right.json" with { type: "json" };
import illustrationFixture from "../datasets/illustration-with-wm.json" with { type: "json" };
import ktpRealNormalFixture from "../datasets/ktp-real-normal.json" with { type: "json" };
import originalFixture from "../datasets/original.json" with { type: "json" };
import realHolded45Fixture from "../datasets/real-holded-45deg.json" with { type: "json" };
import upsideDownFixture from "../datasets/upside-down.json" with { type: "json" };

import { filterValidBoundingPoly } from "../src/filtering/bounding-poly/bounding-poly-filter.js";
import { detectKtpTextRegion } from "../src/filtering/ktp-region/ktp-region-detection.js";
import { filterKtpRegionBoxes } from "../src/filtering/ktp-region/ktp-region-filter.js";
import { sortWordBoxes } from "../src/sorting/sort-word-boxes.js";

import type { TransformedTextAnnotation } from "../src/types.js";

const fixtures = [
  { name: "original", data: originalFixture },
  { name: "real-holded-45deg", data: realHolded45Fixture },
  { name: "ktp-real-normal", data: ktpRealNormalFixture },
  { name: "illustration-with-wm", data: illustrationFixture },
  { name: "45-clockwise", data: clockwiseFixture },
  { name: "45-counter-clockwise", data: counterClockwiseFixture },
  { name: "90-right", data: rightFixture },
  { name: "90-left", data: leftFixture },
  { name: "upside-down", data: upsideDownFixture },
];

function transformAnnotations(
  annotations: typeof originalFixture.textAnnotations,
): TransformedTextAnnotation[] {
  return annotations.slice(1).flatMap((annotation, index) => {
    const vertices = annotation.boundingPoly?.vertices;

    if (
      vertices === undefined ||
      vertices.length !== 4 ||
      vertices.some(
        (vertex) =>
          typeof vertex.x !== "number" || typeof vertex.y !== "number",
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

function runKtpRegionDetection(
  annotations: typeof originalFixture.textAnnotations,
) {
  const transformed = transformAnnotations(annotations);

  const boundingPolyResult = filterValidBoundingPoly(transformed);

  const sorted = sortWordBoxes(boundingPolyResult.validBoxes, {
    degreeTolerance: 8,
    minClusterSize: 3,
    minSupportRatio: 0.35,
    rowToleranceFactor: 0.55,
    overlapThreshold: 0.3,
    horizontalSegmentation: {
      enabled: true,
      heightFactor: 2.5,
      madFactor: 3,
    },
  });

  if (!sorted) {
    throw new Error("Orientation detection failed");
  }

  const detection = detectKtpTextRegion(sorted.projected, {
    minComponentSize: 8,
    minSupportRatio: 0.35,
    maxNeighborDistanceFactor: 8,
    minOverlapRatio: 0.5,
  });

  const filtering = filterKtpRegionBoxes(sorted.projected, detection);

  return {
    transformed,
    sorted,
    detection,
    filtering,
  };
}

// Uji semua fixture JSON.
for (const fixture of fixtures) {
  test(`detects KTP region from ${fixture.name}.json`, () => {
    const result = runKtpRegionDetection(fixture.data.textAnnotations);

    assert.equal(
      result.detection.detected,
      true,
      "KTP region should be detected",
    );

    assert.ok(
      result.detection.confidence > 0,
      "Detection confidence should be greater than zero",
    );

    assert.ok(
      result.detection.bounds !== null,
      "Detected region should have bounds",
    );

    assert.ok(
      result.detection.insideIndexes.length > 0,
      "KTP region should contain boxes",
    );
  });
}

// Pastikan filtering hanya menghapus box yang diklasifikasikan outside.
for (const fixture of fixtures) {
  test(`filters only outside boxes from ${fixture.name}.json`, () => {
    const result = runKtpRegionDetection(fixture.data.textAnnotations);

    const expectedRemoved = new Set(result.detection.outsideIndexes);

    assert.deepEqual(
      [...result.filtering.removedIndexes].sort((a, b) => a - b),
      [...expectedRemoved].sort((a, b) => a - b),
    );

    for (const box of result.filtering.boxes) {
      assert.ok(
        !expectedRemoved.has(box.originalIndex),
        `Outside box ${box.originalIndex} should not be retained`,
      );
    }
  });
}

// Pastikan box partial dan unknown tidak dihapus.
for (const fixture of fixtures) {
  test(`preserves partial and unknown boxes from ${fixture.name}.json`, () => {
    const result = runKtpRegionDetection(fixture.data.textAnnotations);

    console.log(fixture.name + " = " + result.detection.outsideIndexes);

    const retainedIndexes = new Set(
      result.filtering.boxes.map((box) => box.originalIndex),
    );

    for (const index of [
      ...result.detection.partialIndexes,
      ...result.detection.unknownIndexes,
    ]) {
      assert.ok(retainedIndexes.has(index), `Box ${index} should be preserved`);
    }
  });
}
