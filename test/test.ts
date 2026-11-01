import { KTPExtractor } from "../src/KTPExtractor.js";
import visionResult from "./visionSource/90-right.json" with { type: "json" };

const ktpext = new KTPExtractor();

const result = ktpext.extractFromTextAnnotation(
  visionResult.textAnnotations.slice(1, visionResult.textAnnotations.length),
);

// console.log("result.association.fields");
// console.log(JSON.stringify(result?.association.fields));
// console.log("=====================================================");
// console.log("result.association.diagnostics");
// console.log(JSON.stringify(result?.association.diagnostics));
// console.log("=====================================================");
// console.log("result.association.unmatchedLabels");
// console.log(JSON.stringify(result?.association.unmatchedLabels));
// console.log("=====================================================");
// console.log("result.association.usedWordIndexes");
// console.log(JSON.stringify(result?.association.usedWordIndexes));

console.log(result?.data);
