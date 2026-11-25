import visionFixture from "../datasets/real-holded-45deg.json" with { type: "json" };
import { KTPExtractor } from "../src/KTPExtractor";

const { textAnnotations } = visionFixture;
const ktpExt = new KTPExtractor();
const extraction = ktpExt.extractFromTextAnnotation(textAnnotations);

const removedIdx = [
  ...extraction.metadata.removedIndexes,
  ...extraction.watermark.removedIndexes,
];

console.log("======= Metadata ======");
console.log("Metadata are detected = ", extraction.metadata.detected);
console.log("Metadata idx = ", extraction.metadata.removedIndexes);
console.log(
  "Metadata text = ",
  extraction.metadata.diagnostics
    .filter((v) => v.classification === "metadata")
    .map(({ label, originalIndex }) => `${label}(id:${originalIndex})`)
    .join("|"),
);

console.log("======= Watermark ======");
console.log("Watermark are detected = ", extraction.watermark.detected);
console.log("Watermark idx = ", extraction.watermark.removedIndexes);
console.log(
  "Watermark text = ",
  extraction.watermark.diagnostics
    .filter((v) => v.classification === "watermark")
    .map(({ label, originalIndex }) => `${label}(id:${originalIndex})`)
    .join("|"),
);

console.log("======= Outside box ======");
console.log(
  "Text Outside box are detected = ",
  !!extraction.ktpBoundary.outsideIndexes.length,
);
console.log("Text Outside box idx = ", extraction.ktpBoundary.outsideIndexes);
console.log(
  "Text Outside box text = ",
  textAnnotations
    .slice(1, textAnnotations.length)
    .filter((v, i) => extraction.ktpBoundary.outsideIndexes.includes(i))
    .map((v) => v.description)
    .join("|"),
);
