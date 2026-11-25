import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectedBox } from "../src/types.js";

import { detectKtpBoundary } from "../src/filtering/ktp-boundary/ktp-boundary-detection.js";
import { filterOutsideKtpBoxes } from "../src/filtering/ktp-boundary/ktp-boundary-filter.js";

import type { KtpBoundary } from "../src/filtering/ktp-boundary/ktp-boundary-types.js";

function createBox(
  originalIndex: number,
  label: string,
  uMin: number,
  uMax: number,
  vMin: number,
  vMax: number,
): ProjectedBox {
  return {
    originalIndex,
    box: {
      originalIndex,
      label,
      vertices: [],
      dimension: {
        w: uMax - uMin,
        h: vMax - vMin,
      },
      degree: 0,
    },
    centerU: (uMin + uMax) / 2,
    centerV: (vMin + vMax) / 2,
    uMin,
    uMax,
    vMin,
    vMax,
    width: uMax - uMin,
    height: vMax - vMin,
  };
}

function createDetectionFixture(): ProjectedBox[] {
  return [
    createBox(0, "Provinsi", 10, 30, 5, 15),
    createBox(1, "NIK", 10, 20, 25, 35),
    createBox(2, "Nama", 15, 30, 40, 50),
    createBox(3, "Berlaku Hingga", 15, 40, 75, 85),

    // Metadata di bagian kanan.
    createBox(90, "Made Place", 80, 110, 40, 50),

    // Metadata paling bawah.
    createBox(91, "Made Date", 80, 105, 90, 100),
  ];
}

const expectedBoundary: KtpBoundary = {
  left: 10,
  right: 110,
  top: 5,
  bottom: 100,
};

test("detects KTP boundary using the expected anchors", () => {
  const boxes = createDetectionFixture();

  const result = detectKtpBoundary(boxes, [90, 91]);

  assert.equal(result.detected, true);
  assert.deepEqual(result.boundary, expectedBoundary);
});

test("uses the leftmost recognized label as the left boundary", () => {
  const boxes = createDetectionFixture();

  boxes.push(createBox(4, "Alamat", 5, 25, 55, 65));

  const result = detectKtpBoundary(boxes, [90, 91]);

  assert.equal(result.detected, true);
  assert.equal(result.boundary?.left, 5);
});

test("uses the province label as the top boundary", () => {
  const boxes = createDetectionFixture();

  boxes.push(createBox(5, "Provinsi", 10, 30, 0, 10));

  const result = detectKtpBoundary(boxes, [90, 91]);

  assert.equal(result.detected, true);
  assert.equal(result.boundary?.top, 0);
});

test("uses the lowest metadata or valid-until label as the bottom boundary", () => {
  const boxes = createDetectionFixture();

  const result = detectKtpBoundary(boxes, [90]);

  assert.equal(result.detected, true);
  assert.equal(result.boundary?.bottom, 50);

  const boxesWithValidUntil = createDetectionFixture();

  const resultWithValidUntil = detectKtpBoundary(boxesWithValidUntil, [90]);

  assert.equal(resultWithValidUntil.detected, true);
  assert.equal(resultWithValidUntil.boundary?.bottom, 85);
});

test("returns undetected when no projected boxes are available", () => {
  const result = detectKtpBoundary([], []);

  assert.equal(result.detected, false);
  assert.equal(result.boundary, null);
});

test("returns undetected when province anchor is missing", () => {
  const boxes = createDetectionFixture().filter(
    (box) => box.box.label !== "Provinsi",
  );

  const result = detectKtpBoundary(boxes, [90, 91]);

  assert.equal(result.detected, false);
  assert.equal(result.boundary, null);
  assert.ok(
    result.diagnostics.some((message) =>
      message.includes("Province label not found"),
    ),
  );
});

test("returns undetected when metadata anchors are missing", () => {
  const result = detectKtpBoundary(createDetectionFixture(), []);

  assert.equal(result.detected, false);
  assert.equal(result.boundary, null);
});

test("returns undetected when boundary dimensions are invalid", () => {
  const boxes = [
    createBox(0, "Provinsi", 20, 30, 5, 15),
    createBox(1, "NIK", 20, 30, 25, 35),
    createBox(90, "Metadata", 5, 10, 40, 50),
  ];

  const result = detectKtpBoundary(boxes, [90]);

  assert.equal(result.detected, false);
  assert.equal(result.boundary, null);
  assert.ok(
    result.diagnostics.some((message) =>
      message.includes("Invalid KTP boundary dimensions"),
    ),
  );
});

test("reports the indexes used by each boundary anchor", () => {
  const result = detectKtpBoundary(createDetectionFixture(), [90, 91]);

  assert.deepEqual(result.anchorIndexes.label, [0, 1, 2, 3]);
  assert.deepEqual(result.anchorIndexes.province, [0]);
  assert.deepEqual(result.anchorIndexes.metadata, [90, 91]);
  assert.deepEqual(result.anchorIndexes.validUntil, [3]);
});

// --------------------------------------------------
// Outside box filtering
// --------------------------------------------------

test("removes boxes completely outside the KTP boundary", () => {
  const boxes = [
    createBox(0, "Inside", 20, 30, 20, 30),
    createBox(1, "Outside Left", -20, -10, 20, 30),
    createBox(2, "Outside Right", 120, 130, 20, 30),
    createBox(3, "Outside Top", 20, 30, -20, -10),
    createBox(4, "Outside Bottom", 20, 30, 110, 120),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary);

  logFilteredBoxes("OUTSIDE KTP BOXES", result.outsideBoxes);

  assert.deepEqual(
    result.boxes.map((box) => box.originalIndex),
    [0],
  );

  assert.deepEqual(result.outsideIndexes, [1, 2, 3, 4]);
});

test("preserves boxes that are completely inside the boundary", () => {
  const boxes = [
    createBox(0, "A", 20, 30, 20, 30),
    createBox(1, "B", 40, 50, 40, 50),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary);

  assert.equal(result.boxes.length, 2);
  assert.equal(result.outsideBoxes.length, 0);
});

test("preserves partially overlapping boxes that meet the overlap threshold", () => {
  const boxes = [
    // 50% dari area box berada di dalam boundary.
    createBox(0, "Partial", 0, 20, 20, 30),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary, 0.5);

  assert.deepEqual(
    result.boxes.map((box) => box.originalIndex),
    [0],
  );
  assert.deepEqual(result.outsideIndexes, []);
});

test("removes partially overlapping boxes below the overlap threshold", () => {
  const boxes = [
    // Hanya 25% area box berada di dalam boundary.
    createBox(0, "Partial", 5, 25, 20, 30),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary, 0.5);

  assert.deepEqual(result.boxes, []);
  assert.deepEqual(result.outsideIndexes, [0]);
});

test("preserves the original box order after filtering", () => {
  const boxes = [
    createBox(0, "A", 20, 30, 20, 30),
    createBox(1, "Outside", 120, 130, 20, 30),
    createBox(2, "B", 40, 50, 40, 50),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary);

  assert.deepEqual(
    result.boxes.map((box) => box.originalIndex),
    [0, 2],
  );
});

test("removes boxes with invalid dimensions", () => {
  const boxes = [
    createBox(0, "Invalid Width", 20, 20, 20, 30),
    createBox(1, "Invalid Height", 20, 30, 20, 20),
    createBox(2, "Valid", 30, 40, 30, 40),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary);

  assert.deepEqual(
    result.boxes.map((box) => box.originalIndex),
    [2],
  );

  assert.deepEqual(result.outsideIndexes, [0, 1]);
});

test("clamps overlap threshold to the range 0–1", () => {
  const boxes = [
    createBox(0, "Inside", 20, 30, 20, 30),
    createBox(1, "Outside", 120, 130, 20, 30),
  ];

  const result = filterOutsideKtpBoxes(boxes, expectedBoundary, 2);

  assert.deepEqual(result.boxes, []);
  assert.deepEqual(result.outsideIndexes, [0, 1]);
});

function logFilteredBoxes(title: string, boxes: ProjectedBox[]): void {
  console.log(`\n${title}`);

  if (boxes.length === 0) {
    console.log("Tidak ada box yang terfilter.");
    return;
  }

  for (const box of boxes) {
    console.log(`- Index: ${box.originalIndex} | Text: "${box.box.label}"`);
  }

  console.log(`Total: ${boxes.length} box terfilter`);
}
