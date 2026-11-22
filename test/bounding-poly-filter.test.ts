import assert from "node:assert/strict";
import test from "node:test";

import type { TransformedTextAnnotation } from "../src/types.js";

import { filterValidBoundingPoly } from "../src/filtering/bounding-poly/bounding-poly-filter.js";

function createBox(
  vertices: TransformedTextAnnotation["vertices"],
  originalIndex = 0,
): TransformedTextAnnotation {
  return {
    originalIndex,
    label: "TEST",
    vertices,
    dimension: { w: 100, h: 30 },
    degree: 0,
  };
}

test("accept valid quadrilateral", () => {
  const result = filterValidBoundingPoly([
    createBox([
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 40 },
      { x: 10, y: 40 },
    ]),
  ]);

  assert.equal(result.validBoxes.length, 1);
  assert.equal(result.invalidBoxes.length, 0);
  assert.deepEqual(result.validIndexes, [0]);
});

test("reject polygon with only three vertices", () => {
  const result = filterValidBoundingPoly([
    createBox([
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 40 },
    ]),
  ]);

  assert.equal(result.validBoxes.length, 0);
  assert.equal(result.invalidBoxes.length, 1);

  assert.deepEqual(result.diagnostics[0].reasons, ["invalid-vertex-count"]);
});

test("reject invalid coordinates", () => {
  const result = filterValidBoundingPoly([
    createBox([
      { x: 10, y: 10 },
      { x: Number.NaN, y: 10 },
      { x: 110, y: 40 },
      { x: 10, y: 40 },
    ]),
  ]);

  assert.equal(result.validBoxes.length, 0);

  assert.deepEqual(result.diagnostics[0].reasons, ["invalid-coordinate"]);
});

test("reject duplicate vertices", () => {
  const result = filterValidBoundingPoly([
    createBox([
      { x: 10, y: 10 },
      { x: 110, y: 10 },
      { x: 110, y: 10 },
      { x: 10, y: 40 },
    ]),
  ]);

  assert.equal(result.validBoxes.length, 0);

  assert.deepEqual(result.diagnostics[0].reasons, ["duplicate-vertex"]);
});

test("reject self-intersecting polygon", () => {
  const result = filterValidBoundingPoly([
    createBox([
      { x: 10, y: 10 },
      { x: 110, y: 40 },
      { x: 110, y: 10 },
      { x: 10, y: 40 },
    ]),
  ]);

  assert.equal(result.validBoxes.length, 0);
  assert.ok(result.diagnostics[0].reasons.includes("degenerate-polygon"));
});

test("preserve original indexes after filtering", () => {
  const result = filterValidBoundingPoly([
    createBox(
      [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 40 },
        { x: 10, y: 40 },
      ],
      5,
    ),
    createBox(
      [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 40 },
      ],
      6,
    ),
    createBox(
      [
        { x: 20, y: 20 },
        { x: 120, y: 20 },
        { x: 120, y: 50 },
        { x: 20, y: 50 },
      ],
      7,
    ),
  ]);

  assert.deepEqual(result.validIndexes, [5, 7]);
  assert.deepEqual(result.invalidIndexes, [6]);

  assert.equal(result.validBoxes.length, 2);
  assert.equal(result.invalidBoxes.length, 1);
});
