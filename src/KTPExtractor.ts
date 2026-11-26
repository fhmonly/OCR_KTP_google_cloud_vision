import { ImageAnnotatorClient, type v1 } from "@google-cloud/vision";
import { associateLabelValues } from "./association/label-value-association.js";
import { sortWordBoxes } from "./sorting/sort-word-boxes.js";

import { detectKtpHeader } from "./association/header-detector.js";
import { KTP_BODY_LABELS } from "./extraction-config.js";

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
  ) {
    return (
      obj?.map((item) => {
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
    if (!textAnnotation?.length) return null;

    const words = this._transformTextAnnotation(
      textAnnotation.slice(1, textAnnotation.length),
    );

    const result = sortWordBoxes(words, {
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

    const boxes = result.projected;

    const labelThreshold = 0.65;

    const options = {
      labelThreshold: 0.65,
      maxLabelGapFactor: 3,
      maxInterWordGapFactor: 2.5,
      maxVerticalDistanceFactor: 0.9,
      sameRowToleranceFactor: 0.75,
      maxWords: 12,
    };

    // 1. Header detection independen.
    const headerResult = detectKtpHeader(boxes, {
      labelThreshold,
      maxLabelGapFactor: 3,
      maxInterWordGapFactor: 2.5,
      maxVerticalDistanceFactor: 0.9,
      sameRowToleranceFactor: 0.75,
      maxWords: 12,
    });

    // 2. Batasi body search mulai dari baris NIK.
    // Jika anchor NIK tidak ditemukan, gunakan seluruh box
    // agar extraction body tetap memiliki fallback.
    const nikAnchor = boxes.find(
      (box) => box.originalIndex === headerResult.anchorIndex,
    );

    const bodyBoxes = nikAnchor
      ? boxes.filter((box) => box.centerV >= nikAnchor.centerV)
      : boxes;

    // 3. Body association hanya menggunakan label body.
    const bodyAssociation = associateLabelValues(
      bodyBoxes,
      KTP_BODY_LABELS,
      labelThreshold,
      options,
    );

    // 4. Gabungkan hasil header dan body sebelum city fallback.
    // City fallback membutuhkan province dan NIK sebagai anchor.
    const mergedAssociation = {
      fields: [...headerResult.association.fields, ...bodyAssociation.fields],
      unmatchedLabels: [
        ...headerResult.association.unmatchedLabels,
        ...bodyAssociation.unmatchedLabels,
      ],
      usedWordIndexes: [
        ...new Set([
          ...headerResult.association.usedWordIndexes,
          ...bodyAssociation.usedWordIndexes,
        ]),
      ],
      diagnostics: [
        ...(headerResult.association.diagnostics ?? []),
        ...(bodyAssociation.diagnostics ?? []),
      ],
    };

    const finalAssociation = mergedAssociation;

    const data = Object.fromEntries(
      finalAssociation.fields.map((field) => [field.field, field.value]),
    );

    return {
      data,
      association: finalAssociation,
      header: {
        detected: headerResult.detected,
        anchorIndex: headerResult.anchorIndex,
        candidateIndexes: headerResult.candidateIndexes,
        acceptedIndexes: headerResult.acceptedIndexes,
        rejectedIndexes: headerResult.rejectedIndexes,
        association: headerResult.association,
      },
    };
  }

  public async extractTextFromImagePath(path: string) {
    const res = await this.getResponse(path);
    const data = this.extractFromTextAnnotation(res.textAnnotations);
    return data;
  }
}
