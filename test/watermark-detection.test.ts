import assert from "node:assert/strict";
import test from "node:test";

import visionFixture from "./visionSource/illustration-with-wm.json" with { type: "json" };

import type { TransformedTextAnnotation, Vertex } from "../src/types.js";

import { sortWordBoxes } from "../src/sorting/sort-word-boxes.js";

import { detectWatermarks } from "../src/filtering/watermark/watermark-detection.js";

import { filterWatermarkBoxes } from "../src/filtering/watermark/watermark-filter.js";

interface VisionAnnotation {
  description?: string;
  boundingPoly?: {
    vertices?: Vertex[];
  };
}

function transformAnnotations(
  annotations: VisionAnnotation[],
): TransformedTextAnnotation[] {
  return annotations.map((annotation) => {
    const vertices = annotation.boundingPoly?.vertices ?? [];

    const [topLeft, topRight, , bottomLeft] = vertices;

    const x1 = topLeft?.x ?? 0;
    const y1 = topLeft?.y ?? 0;

    const x2 = topRight?.x ?? 0;
    const y2 = topRight?.y ?? 0;

    const x4 = bottomLeft?.x ?? 0;
    const y4 = bottomLeft?.y ?? 0;

    return {
      label: annotation.description,

      vertices,

      dimension: {
        w: Math.hypot(x2 - x1, y2 - y1),
        h: Math.hypot(x4 - x1, y4 - y1),
      },

      degree: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
    };
  });
}

test("detect and filter diagonal watermark from illustration fixture", () => {
  const fixture = visionFixture as unknown as {
    textAnnotations: VisionAnnotation[];
  };

  const words = transformAnnotations(fixture.textAnnotations.slice(1));

  const sorted = sortWordBoxes(words);

  assert.ok(sorted, "Sorting should succeed.");

  const detection = detectWatermarks(
    sorted.projected,
    sorted.orientation.degree,
  );

  assert.equal(detection.detected, true);

  const wmText = sorted.projected
    .filter((box) => detection.watermarkIndexes.includes(box.originalIndex))
    .map((box) => box.box.label)
    .join(" ");
  const wmIndexes = sorted.projected
    .filter((box) => detection.watermarkIndexes.includes(box.originalIndex))
    .map((box) => box.originalIndex);

  console.log("=========================");
  console.log(wmText + "\n", wmIndexes);
  console.log("=========================");

  // assert.deepEqual(
  //   detection.watermarkIndexes,
  //   [16, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 73, 74],
  // );

  const filtered = filterWatermarkBoxes(sorted.projected, detection);

  assert.equal(filtered.removedBoxes.length, 15);

  assert.equal(
    filtered.boxes.length + filtered.removedBoxes.length,
    sorted.projected.length,
  );
});

test("do not remove watermark candidates if support is insufficient", () => {
  const fixture = visionFixture as unknown as {
    textAnnotations: VisionAnnotation[];
  };

  const words = transformAnnotations(fixture.textAnnotations.slice(1));

  const sorted = sortWordBoxes(words);

  assert.ok(sorted);

  const selectedIndexes = new Set([58, 59, 60]);

  const limitedBoxes = sorted.projected.filter((box) =>
    selectedIndexes.has(box.originalIndex),
  );

  assert.equal(limitedBoxes.length, 3);

  const detection = detectWatermarks(limitedBoxes, sorted.orientation.degree);

  assert.equal(detection.detected, false);
  assert.deepEqual(detection.watermarkIndexes, []);
});
