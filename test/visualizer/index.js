import textData from "../visionSource/illustration-with-wm.json" with { type: "json" };
import { drawBoundingBoxes } from "./canvas/drawBoundingBox.js";
import { fixMabbOrientation } from "./canvas/fixMabbOrientation.js";
import { getMinimumBoundingBox } from "./canvas/mabb.js";
import { transformTextAnnotation } from "./helpers/transformJsonResult.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvasBox");

  const transformed = transformTextAnnotation(
    textData.textAnnotations.slice(1, textData.textAnnotations.length),
  );

  const flatData = transformed.map((v) => v.vertices).flat();
  const MABB = getMinimumBoundingBox(flatData);
  const textAnnotationMABB = [
    {
      boundingPoly: {
        vertices: MABB.corners,
      },
      description: "MABB",
    },
  ];
  const refElement = transformed[0];
  textAnnotationMABB[0].boundingPoly.vertices = fixMabbOrientation(
    MABB.corners,
    refElement.vertices,
  );
  const transformedMABB = transformTextAnnotation(textAnnotationMABB);

  const removeWatermark = false;

  const validIndex = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
    40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
    59, 60, 61, 62, 63, 64, 67, 68, 69, 70,
  ];

  const finalTextAnnotation = removeWatermark
    ? [
        ...transformed.filter((v, i) => validIndex.includes(i)),
        ...transformedMABB,
      ]
    : [...transformed, ...transformedMABB];

  drawBoundingBoxes(canvas, finalTextAnnotation, {
    showLabel: true,
    showIdx: true,
  });
});
