import textData from "../visionSource/real-90-right.json" with { type: "json" };
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

  const finalTextAnnotation = [
    ...transformed,
    // .filter(
    //   (v, i) =>
    //     ![16, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 73, 74].includes(
    //       i,
    //     ),
    // )
    ...transformedMABB,
  ];

  drawBoundingBoxes(canvas, finalTextAnnotation, {
    showLabel: true,
  });
});
