import visionFixture from "../datasets/real-90-right.json" with { type: "json" };
import { KTPExtractor } from "../src/KTPExtractor";

const { textAnnotations } = visionFixture;
const ktpExt = new KTPExtractor();
const extraction = ktpExt.extractFromTextAnnotation(textAnnotations);

if (extraction) {
  const { header } = extraction;

  console.log(
    "Header Indexes = ",
    header.association.fields.map((v) => v.label).join(","),
  );
  console.log(
    "Header Indexes = ",
    header.association.fields.map((v) => v.field),
  );
}
