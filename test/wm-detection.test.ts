import { detectWatermarks } from "../src/filtering/watermark/watermark-detection";
import { sortWordBoxes } from "../src/sorting/sort-word-boxes";
import { TransformedTextAnnotation, Vertex } from "../src/types";
import visionFixture from "./visionSource/real-90-right.json" with { type: "json" };

interface VisionAnnotation {
  description?: string;
  boundingPoly?: {
    vertices?: Vertex[];
  };
}

function transformAnnotations(
  annotations: VisionAnnotation[],
): TransformedTextAnnotation[] {
  return annotations.map((annotation, index) => {
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

      originalIndex: index,

      vertices,

      dimension: {
        w: Math.hypot(x2 - x1, y2 - y1),
        h: Math.hypot(x4 - x1, y4 - y1),
      },

      degree: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
    };
  });
}

const fixture = visionFixture as unknown as {
  textAnnotations: VisionAnnotation[];
};

const words = transformAnnotations(fixture.textAnnotations.slice(1));

const sorted = sortWordBoxes(words);

if (!sorted) throw new Error("Failed while sorting word boxes.");

const detection = detectWatermarks(sorted.projected, sorted.orientation.degree);

const expectedIndexes = [65, 71, 66, 72];

console.log("DETECTION SUMMARY:", {
  detected: detection.detected,
  orientationDegree: detection.orientationDegree,
  targetAngle: detection.targetAngle,
  candidateIndexes: detection.candidateIndexes,
  watermarkIndexes: detection.watermarkIndexes,
});

console.log("EXPECTED INDEX BOXES:");

console.table(
  sorted.projected
    .filter((box) => expectedIndexes.includes(box.originalIndex))
    .map((box) => ({
      index: box.originalIndex,
      label: box.box.label,
      degree: box.box.degree,
      centerU: box.centerU,
      centerV: box.centerV,
    })),
);

console.log("EXPECTED INDEX DIAGNOSTICS:");

console.dir(
  detection.diagnostics.filter((item) =>
    expectedIndexes.includes(item.originalIndex),
  ),
  { depth: null },
);

if (detection.detected) {
  console.log("Watermark detected");

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
} else {
  console.log("Watermark not found!");
}

const wmFree = sorted.projected
  .filter((v) => !detection.watermarkIndexes.includes(v.originalIndex))
  .map((box) => box.originalIndex);

console.log("valid Index without watermark");
console.log(wmFree);
