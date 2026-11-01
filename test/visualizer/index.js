import textData from "../visionSource/original.json" with { type: "json" };
import { drawBoundingBoxes } from "./canvas/drawBoundingBox.js";
import { fixMabbOrientation } from "./canvas/fixMabbOrientation.js";
import { getMinimumBoundingBox } from "./canvas/mabb.js";
import { transformTextAnnotation } from "./helpers/transformJsonResult.js";

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvasBox");

  const transformed = transformTextAnnotation(
    textData.textAnnotations.splice(1, textData.textAnnotations.length - 1),
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

  const finalTextAnnotation = [...transformed, ...transformedMABB];

  drawBoundingBoxes(canvas, finalTextAnnotation, {
    showLabel: true,
  });
});
