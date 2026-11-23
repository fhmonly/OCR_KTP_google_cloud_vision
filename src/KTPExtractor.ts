import { ImageAnnotatorClient, type v1 } from "@google-cloud/vision";
import { applyCityFallback } from "./association/city-fallback.js";
import { associateLabelValues } from "./association/label-value-association.js";
import { KTP_LABELS } from "./extraction-config.js";
import { detectWatermarks } from "./filtering/watermark/watermark-detection.js";
import { sortWordBoxes } from "./sorting/sort-word-boxes.js";

import { filterValidBoundingPoly } from "./filtering/bounding-poly/bounding-poly-filter.js";
import { filterWatermarkBoxes } from "./filtering/watermark/watermark-filter.js";
import type { TransformedTextAnnotation } from "./types.js";

type ImageAnnotatorClientResponse = Awaited<
  ReturnType<v1.ImageAnnotatorClient["textDetection"]>
>[number];

export class KTPExtractor {
  private _client: v1.ImageAnnotatorClient | null = null;

  constructor(...args: ConstructorParameters<typeof v1.ImageAnnotatorClient>) {
    this._client = new ImageAnnotatorClient(...args);
  }

  public async getResponse(filepath: string) {
    const [response] = await this._client!.textDetection(filepath);
    return response;
  }

  // Euclidean distance antara dua titik
  private _calculateDistance(
    xA: number,
    yA: number,
    xB: number,
    yB: number,
  ): number {
    return Math.hypot(xB - xA, yB - yA);
  }

  private _calculateDegree(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    // Menghitung sudut sisi atas bounding box
    const dx = x2 - x1;
    const dy = y2 - y1;

    const radians = Math.atan2(dy, dx);
    const degrees = radians * (180 / Math.PI);

    return degrees;
  }

  private _transformTextAnnotation(
    obj: Awaited<ReturnType<typeof this.getResponse>>["textAnnotations"],
  ): TransformedTextAnnotation[] {
    return (
      obj?.map((item, index) => {
        const vertices: {
          x?: number | null;
          y?: number | null;
        }[] = item.boundingPoly?.vertices ?? [];

        const [v0, v1, v3] = vertices;

        const x1 = v0?.x ?? 0;
        const y1 = v0?.y ?? 0;

        const x2 = v1?.x ?? 0;
        const y2 = v1?.y ?? 0;

        const x4 = v3?.x ?? 0;
        const y4 = v3?.y ?? 0;

        return {
          originalIndex: index,
          label: item.description,
          vertices,
          dimension: {
            w: this._calculateDistance(x1, y1, x2, y2),
            h: this._calculateDistance(x1, y1, x4, y4),
          },
          degree: this._calculateDegree(x1, y1, x2, y2),
        };
      }) ?? []
    );
  }

  public extractFromTextAnnotation(
    textAnnotation: ImageAnnotatorClientResponse["textAnnotations"],
  ) {
    if (!textAnnotation?.length) {
      throw new Error("Missing or empty textAnnotation");
    }

    const words = this._transformTextAnnotation(
      textAnnotation.slice(1, textAnnotation.length),
    );

    // STEP 1: Validasi bounding polygon.
    const boundingPolyResult = filterValidBoundingPoly(words);

    // STEP 2: Sorting hanya menggunakan box valid.
    const result = sortWordBoxes(boundingPolyResult.validBoxes, {
      degreeTolerance: 8,
      minClusterSize: 3,
      minSupportRatio: 0.35,

      rowToleranceFactor: 0.55,
      overlapThreshold: 0.3,

      horizontalSegmentation: {
        enabled: true,
        heightFactor: 2.5,
        madFactor: 3,
      },
    });

    if (!result) {
      throw new Error("Orientation detection failed");
    }

    // STEP 1: Detect watermark.
    const watermarkDetection = detectWatermarks(
      result.projected,
      result.orientation.degree,
    );

    // STEP 2: Filter confirmed watermark boxes.
    const watermarkFiltering = filterWatermarkBoxes(
      result.projected,
      watermarkDetection,
    );

    // STEP 3: Use filtered boxes for association.
    const boxes = watermarkFiltering.boxes;

    // Filter rows as well because city fallback uses row data.
    const removedIndexes = new Set(watermarkFiltering.removedIndexes);

    const filteredRows = result.rows
      .map((row) => ({
        ...row,
        boxes: row.boxes.filter(
          (box) => !removedIndexes.has(box.originalIndex),
        ),
      }))
      .filter((row) => row.boxes.length > 0);

    const definitions = KTP_LABELS;
    const labelThreshold = 0.65;
    const options = {
      labelThreshold: 0.65,

      maxLabelGapFactor: 3,

      maxInterWordGapFactor: 2.5,

      maxVerticalDistanceFactor: 0.9,

      sameRowToleranceFactor: 0.75,

      maxWords: 12,
    };

    const association = associateLabelValues(
      boxes,
      definitions,
      labelThreshold,
      options,
    );

    const finalAssociation = applyCityFallback(
      filteredRows,
      association,
      definitions,
    );

    const data = Object.fromEntries(
      finalAssociation.fields.map((v) => [v.field, v.value]),
    );

    return {
      data,

      watermark: {
        detected: watermarkDetection.detected,
        confidence: watermarkDetection.confidence,
        candidateIndexes: watermarkDetection.candidateIndexes,
        removedIndexes: watermarkFiltering.removedIndexes,
        diagnostics: watermarkDetection.diagnostics,
      },

      association: finalAssociation,
    };
  }

  public async extractTextFromImagePath(path: string) {
    const res = await this.getResponse(path);
    const data = this.extractFromTextAnnotation(res.textAnnotations);
    return data;
  }
}
