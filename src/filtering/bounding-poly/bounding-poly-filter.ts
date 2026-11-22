import type { TransformedTextAnnotation, Vertex } from "../../types.js";

import type {
  BoundingPolyDiagnostic,
  BoundingPolyFilterOptions,
  BoundingPolyFilterResult,
  BoundingPolyInvalidReason,
} from "./bounding-poly-types.js";

interface Point {
  x: number;
  y: number;
}

interface PolygonValidation {
  valid: boolean;
  area: number | null;
  reasons: BoundingPolyInvalidReason[];
}

function isValidPoint(vertex: Vertex): vertex is {
  x: number;
  y: number;
} {
  return (
    typeof vertex.x === "number" &&
    typeof vertex.y === "number" &&
    Number.isFinite(vertex.x) &&
    Number.isFinite(vertex.y)
  );
}

function crossProduct(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function calculatePolygonArea(points: Point[]): number {
  let twiceArea = 0;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];

    if (!current || !next) continue;

    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) / 2;
}

function validatePolygon(
  vertices: Vertex[],
  epsilon: number,
): PolygonValidation {
  const reasons: BoundingPolyInvalidReason[] = [];

  if (vertices.length !== 4) {
    return {
      valid: false,
      area: null,
      reasons: ["invalid-vertex-count"],
    };
  }

  if (!vertices.every(isValidPoint)) {
    return {
      valid: false,
      area: null,
      reasons: ["invalid-coordinate"],
    };
  }

  const points: Point[] = vertices.map((vertex) => ({
    x: vertex.x,
    y: vertex.y,
  }));

  // Setiap titik harus unik.
  for (let i = 0; i < points.length; i++) {
    const pointA = points[i];
    if (!pointA) continue;

    for (let j = i + 1; j < points.length; j++) {
      const pointB = points[j];
      if (!pointB) continue;

      const distance = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);

      if (distance <= epsilon) {
        reasons.push("duplicate-vertex");
        return { valid: false, area: null, reasons };
      }
    }
  }

  const area = calculatePolygonArea(points);

  if (!Number.isFinite(area) || area <= epsilon) {
    reasons.push("degenerate-polygon");
    return { valid: false, area, reasons };
  }

  // Memastikan polygon convex dan tidak berpotongan sendiri.
  let previousSign = 0;

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];

    if (!a || !b || !c) continue;

    const cross = crossProduct(a, b, c);

    if (Math.abs(cross) <= epsilon) {
      reasons.push("degenerate-polygon");
      return { valid: false, area, reasons };
    }

    const currentSign = Math.sign(cross);

    if (previousSign !== 0 && currentSign !== previousSign) {
      reasons.push("degenerate-polygon");
      return { valid: false, area, reasons };
    }

    previousSign = currentSign;
  }

  return {
    valid: true,
    area,
    reasons,
  };
}

function validateAnnotation(
  box: TransformedTextAnnotation,
  epsilon: number,
): PolygonValidation {
  const polygon = validatePolygon(box.vertices, epsilon);

  if (!polygon.valid) {
    return polygon;
  }

  if (
    !Number.isFinite(box.dimension.w) ||
    !Number.isFinite(box.dimension.h) ||
    box.dimension.w <= epsilon ||
    box.dimension.h <= epsilon
  ) {
    return {
      valid: false,
      area: polygon.area,
      reasons: ["invalid-dimensions"],
    };
  }

  if (!Number.isFinite(box.degree)) {
    return {
      valid: false,
      area: polygon.area,
      reasons: ["invalid-degree"],
    };
  }

  return polygon;
}

export function filterValidBoundingPoly(
  boxes: TransformedTextAnnotation[],
  options: BoundingPolyFilterOptions = {},
): BoundingPolyFilterResult {
  const epsilon = Math.max(options.epsilon ?? 1e-8, 0);

  const validBoxes: TransformedTextAnnotation[] = [];
  const invalidBoxes: TransformedTextAnnotation[] = [];

  const validIndexes: number[] = [];
  const invalidIndexes: number[] = [];

  const diagnostics: BoundingPolyDiagnostic[] = [];

  boxes.forEach((box, index) => {
    const originalIndex = box.originalIndex ?? index;

    const validation = validateAnnotation(box, epsilon);

    if (validation.valid) {
      validBoxes.push(box);
      validIndexes.push(originalIndex);
    } else {
      invalidBoxes.push(box);
      invalidIndexes.push(originalIndex);
    }

    diagnostics.push({
      originalIndex,
      label: box.label?.trim() ?? "",
      valid: validation.valid,
      reasons: validation.reasons,
      area: validation.area,
    });
  });

  return {
    validBoxes,
    invalidBoxes,
    validIndexes,
    invalidIndexes,
    diagnostics,
  };
}
