import type { DiagnosticReport } from "./types.js";

/* Pemformat teks laporan. Murni (tanpa DOM/Node) supaya mudah dites. */

const cell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
};

export function mdTable(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "_(none)_";
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

const list = (values: number[]): string =>
  values.length ? values.join(", ") : "-";

const pct = (value: number | null): string =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

const fixed = (value: number | null | undefined, digits = 3): string =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "-";

export const STATUS_LABEL: Record<DiagnosticReport["status"], string> = {
  pass: "PASS",
  fail: "FAIL",
  error: "ERROR",
};

export function formatJson(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatMarkdown(report: DiagnosticReport): string {
  const out: string[] = [];
  const { meta, comparison } = report;

  out.push("# KTP Extractor Diagnostic");
  out.push("");
  out.push(
    "> Index convention: every `#index` is a position in `textAnnotations.slice(1)` " +
      "(the full-text entry at textAnnotations[0] is dropped), identical to `KTPExtractor.extractFromTextAnnotation()`.",
  );
  out.push(
    "> \"Removed\" = box dropped from the pipeline before label/value association " +
      "(invalid bounding poly, watermark filter, or metadata filter).",
  );
  out.push("");

  /* ---- 1. Run info ---- */
  out.push("## 1. Run info");
  out.push("");
  out.push(
    mdTable(
      ["Key", "Value"],
      [
        ["Status", `**${STATUS_LABEL[report.status]}**`],
        ["Dataset", meta.sourceFile || "(unnamed)"],
        ["Words (after slice(1))", meta.totalWords],
        ["Generated at", meta.generatedAt],
        ["Duration", `${meta.durationMs} ms`],
        [
          "Git",
          [
            meta.gitBranch,
            meta.gitCommit,
            meta.gitDirty ? "(uncommitted changes)" : null,
          ]
            .filter(Boolean)
            .join(" ") || null,
        ],
        ["Node", meta.nodeVersion],
      ],
    ),
  );
  out.push("");

  if (report.error) {
    out.push("### Extractor error");
    out.push("");
    out.push(`\`${report.error.message}\``);
    if (report.error.stack) {
      out.push("");
      out.push("```text");
      out.push(report.error.stack);
      out.push("```");
    }
    out.push("");
  }

  /* ---- 2. Expected vs actual ---- */
  out.push("## 2. Expected vs actual removed indexes");
  out.push("");
  const exp = report.expectation;
  out.push(
    exp.removedIndexes.length
      ? `Expected removed (${exp.removedIndexes.length}): ${list(exp.removedIndexes)}`
      : "Expected removed: none (test expects that NO box is removed).",
  );
  out.push("");
  out.push(
    mdTable(
      ["Expected category", "Count", "Indexes"],
      (["watermark", "metadata", "unspecified"] as const).map((c) => [
        c,
        exp.byCategory[c].length,
        list(exp.byCategory[c]),
      ]),
    ),
  );
  out.push("");

  if (comparison) {
    out.push(
      mdTable(
        ["Result", "Count", "Indexes"],
        [
          ["Matched", comparison.matched.length, list(comparison.matched)],
          [
            "Missing (expected removed, but kept)",
            comparison.missing.length,
            list(comparison.missing),
          ],
          [
            "Unexpected (removed, but not expected)",
            comparison.unexpected.length,
            list(comparison.unexpected),
          ],
          [
            "Wrong source (removed by a different detector)",
            comparison.wrongSource.length,
            list(comparison.wrongSource),
          ],
        ],
      ),
    );
    out.push("");
    out.push(
      `Precision: ${pct(comparison.precision)} · Recall: ${pct(comparison.recall)}`,
    );
    out.push("");
    out.push(
      mdTable(
        ["Actually removed by", "Count", "Indexes"],
        [
          [
            "bounding-poly",
            comparison.bySource.boundingPoly.length,
            list(comparison.bySource.boundingPoly),
          ],
          [
            "watermark",
            comparison.bySource.watermark.length,
            list(comparison.bySource.watermark),
          ],
          [
            "metadata",
            comparison.bySource.metadata.length,
            list(comparison.bySource.metadata),
          ],
        ],
      ),
    );
    out.push("");

    /* ---- 3. Mismatch detail ---- */
    const problems = report.boxes.filter(
      (b) => b.verdict !== "ok" && b.verdict !== "kept",
    );
    out.push("## 3. Mismatch detail");
    out.push("");
    out.push(
      problems.length
        ? mdTable(
            [
              "#",
              "Label",
              "Verdict",
              "Expected",
              "Actual",
              "Watermark detector",
              "Metadata detector",
            ],
            problems.map((b) => [
              b.index,
              b.label,
              b.verdict.toUpperCase(),
              b.expected,
              b.actual,
              b.watermark
                ? `${b.watermark.classification} conf=${fixed(b.watermark.confidence)} angle=${fixed(b.watermark.relativeAngle, 1)} — ${b.watermark.reason}`
                : null,
              b.metadata
                ? `${b.metadata.classification}/${b.metadata.type} conf=${fixed(b.metadata.confidence)} — ${b.metadata.reason}`
                : null,
            ]),
          )
        : "No mismatch.",
    );
    out.push("");
  }

  /* ---- 4. Extraction ---- */
  out.push("## 4. Extraction result");
  out.push("");
  if (report.extraction) {
    const ex = report.extraction;
    out.push("### 4.1 Data");
    out.push("");
    out.push("```json");
    out.push(JSON.stringify(ex.data, null, 2));
    out.push("```");
    out.push("");
    out.push("### 4.2 Field association");
    out.push("");
    out.push(
      mdTable(
        ["Field", "Matched label", "Value", "Confidence", "Label #", "Value #"],
        ex.fields.map((f) => [
          f.field,
          f.label,
          f.value,
          fixed(f.confidence, 2),
          list(f.labelIndexes),
          list(f.valueIndexes),
        ]),
      ),
    );
    out.push("");
    out.push("### 4.3 Unmatched labels");
    out.push("");
    out.push(
      mdTable(
        ["Field", "Matched text", "Alias", "Similarity", "#"],
        ex.unmatchedLabels.map((l) => [
          l.field,
          l.matchedText,
          l.matchedAlias,
          fixed(l.similarity, 2),
          list(l.indexes),
        ]),
      ),
    );
    out.push("");
    out.push(`Used word indexes (${ex.usedWordIndexes.length}): ${list(ex.usedWordIndexes)}`);
    out.push("");
    out.push("### 4.4 Association diagnostics (candidates)");
    out.push("");
    out.push(
      mdTable(
        ["Field", "Candidate", "Accepted", "Score", "#", "Reason", "Metadata"],
        ex.associationDiagnostics.map((d) => [
          d.field,
          d.candidateText,
          d.accepted ? "yes" : "no",
          fixed(d.score),
          list(d.boxIndexes),
          d.reason,
          d.metadata,
        ]),
      ),
    );
    out.push("");
  } else {
    out.push("_Extraction did not complete (see error above)._");
    out.push("");
  }

  /* ---- 5. Pipeline ---- */
  out.push("## 5. Pipeline");
  out.push("");
  const p = report.pipeline;

  out.push("### 5.1 Bounding poly filter");
  out.push("");
  if (p.boundingPoly) {
    out.push(`Invalid indexes: ${list(p.boundingPoly.invalidIndexes)}`);
    if (p.boundingPoly.diagnostics.length) {
      out.push("");
      out.push("```json");
      out.push(JSON.stringify(p.boundingPoly.diagnostics, null, 2));
      out.push("```");
    }
  } else out.push("_Not reported by this extractor version._");
  out.push("");

  out.push("### 5.2 Orientation");
  out.push("");
  if (p.orientation) {
    const o = p.orientation;
    out.push(
      mdTable(
        ["Key", "Value"],
        [
          ["Degree", fixed(o.degree, 2)],
          ["Reliable", o.isReliable],
          ["Support", `${o.support}/${o.validWords} (${pct(o.supportRatio)})`],
          ["Total words", o.totalWords],
          ["Median height", fixed(o.medianHeight, 2)],
          ["Deviation", fixed(o.deviation, 2)],
          ["Skipped in projection", o.skippedProjection],
          ["Rows", o.rowCount],
        ],
      ),
    );
    out.push("");
    out.push(
      mdTable(
        ["Cluster degree", "Count", "Support", "Deviation"],
        o.clusters.map((c) => [
          fixed(c.degree, 2),
          c.count,
          pct(c.supportRatio),
          fixed(c.deviation, 2),
        ]),
      ),
    );
  } else out.push("_Not reported by this extractor version._");
  out.push("");

  for (const [title, key] of [
    ["5.3 Watermark detection", "watermark"],
    ["5.4 Metadata detection", "metadata"],
  ] as const) {
    out.push(`### ${title}`);
    out.push("");
    const d = p[key];
    if (!d) {
      out.push("_Not reported by this extractor version._");
    } else {
      out.push(
        `Detected: ${d.detected}` +
          (d.confidence !== null ? ` · Confidence: ${fixed(d.confidence)}` : ""),
      );
      out.push("");
      out.push(`Candidate indexes: ${list(d.candidateIndexes)}`);
      out.push("");
      out.push(`Removed indexes: ${list(d.removedIndexes)}`);
      if (d.groups.length) {
        out.push("");
        out.push("```json");
        out.push(JSON.stringify(d.groups, null, 2));
        out.push("```");
      }
    }
    out.push("");
  }

  /* ---- 6. Per box ---- */
  out.push("## 6. All boxes");
  out.push("");
  out.push(
    mdTable(
      [
        "#",
        "Label",
        "Expected",
        "Actual",
        "Verdict",
        "WM class",
        "WM conf",
        "WM angle",
        "Meta class",
        "Meta conf",
        "Used by",
      ],
      report.boxes.map((b) => [
        b.index,
        b.label,
        b.expected,
        b.actual,
        b.verdict,
        b.watermark?.classification,
        b.watermark ? fixed(b.watermark.confidence, 2) : null,
        b.watermark ? fixed(b.watermark.relativeAngle, 1) : null,
        b.metadata
          ? `${b.metadata.classification}/${b.metadata.type}`
          : null,
        b.metadata ? fixed(b.metadata.confidence, 2) : null,
        b.usedBy.join(", "),
      ]),
    ),
  );
  out.push("");

  return out.join("\n");
}
