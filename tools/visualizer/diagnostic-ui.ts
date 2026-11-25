import { formatJson, formatMarkdown, STATUS_LABEL } from "./diagnostic/format.js";
import type {
  BoxDiagnostic,
  DiagnosticReport,
  DiagnosticRequest,
  ExpectedCategory,
  ExpectedEntry,
} from "./diagnostic/types.js";

/* ------------------------------------------------------------------ */
/* Kontrak dengan main.ts                                             */
/* ------------------------------------------------------------------ */

export type MarkKind = "missing" | "unexpected" | "wrong-source";

export interface DiagnosticHost {
  getDataset(): {
    sourceName: string;
    textAnnotations: unknown[];
    total: number;
  } | null;
  getExpected(): ExpectedEntry[];
  /** Mengganti expected di visualizer dengan isi file expected.json. */
  applyExpected(entries: ExpectedEntry[], totalAnnotations: number | null): void;
  selectIndex(index: number): void;
  requestRender(): void;
  notify(text: string, error?: boolean): void;
}

export interface DiagnosticUi {
  onDatasetChanged(): void;
  onExpectedChanged(): void;
  /** Index yang perlu disorot di canvas, atau null bila overlay mati. */
  getMarks(): Map<number, MarkKind> | null;
  /** Baris teks (plain) tentang satu index untuk panel "Selected box". */
  describeIndex(index: number): string[];
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

function esc(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}

const dash = '<span class="muted">–</span>';
const show = (value: unknown): string =>
  value === null || value === undefined || value === "" ? dash : esc(value);
const fx = (value: number | null | undefined, digits = 3): string =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "–";
const pct = (value: number | null): string =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const list = (values: number[]): string =>
  values.length ? values.join(", ") : "–";

function table(
  headers: string[],
  rows: string[][],
  options: { clickable?: number[] } = {},
): string {
  if (rows.length === 0) return '<p class="muted">None.</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map((cells, i) => {
      const index = options.clickable?.[i];
      const attr =
        index === undefined ? "" : ` class="row-link" data-index="${index}"`;
      return `<tr${attr}>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<div class="table-wrap"><table class="diag-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function keyValues(rows: [string, string][]): string {
  return `<dl class="kv">${rows
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`)
    .join("")}</dl>`;
}

function badge(text: string, kind: string): string {
  return `<span class="badge badge--${kind}">${esc(text)}</span>`;
}

const VERDICT_KIND: Record<string, string> = {
  ok: "ok",
  kept: "muted",
  missing: "bad",
  unexpected: "warn",
  "wrong-source": "info",
};

/* ------------------------------------------------------------------ */
/* UI                                                                 */
/* ------------------------------------------------------------------ */

export function initDiagnosticUi(host: DiagnosticHost): DiagnosticUi {
  const runButton = $<HTMLButtonElement>("run-test");
  const expectedInput = $<HTMLInputElement>("expected-file");
  const statusNode = $("diag-status");
  const hintNode = $("diag-hint");
  const resultNode = $("diag-result");
  const verdictNode = $("diag-verdict");
  const staleNode = $("diag-stale");
  const overlayToggle = $<HTMLInputElement>("show-test-overlay");
  const reportText = $<HTMLTextAreaElement>("report-text");
  const boxFilter = $<HTMLSelectElement>("box-filter");
  const boxesTable = $("boxes-table");
  const tabButtons = [
    ...document.querySelectorAll<HTMLButtonElement>("[data-tab]"),
  ];
  const panes = {
    summary: $("pane-summary"),
    removed: $("pane-removed"),
    extraction: $("pane-extraction"),
    pipeline: $("pane-pipeline"),
    boxes: $("pane-boxes"),
    report: $("pane-report"),
  } as const;
  type TabName = keyof typeof panes;

  let report: DiagnosticReport | null = null;
  let reportExpectedKey = "";
  let serverReady = false;
  let running = false;

  /* ---- Expected summary ---- */

  const expectedKey = (entries: ExpectedEntry[]): string =>
    JSON.stringify(
      [...entries]
        .sort((a, b) => a.index - b.index)
        .map((e) => [e.index, e.category]),
    );

  function updateControls(): void {
    const dataset = host.getDataset();
    runButton.disabled = !dataset || !serverReady || running;

    const expected = host.getExpected();
    const count = (c: ExpectedCategory) =>
      expected.filter((e) => e.category === c).length;
    hintNode.textContent = !dataset
      ? "Load a Vision JSON first."
      : expected.length === 0
        ? "No expected indexes marked: the test will expect that NO box is removed."
        : `Expected removed: ${expected.length} ` +
          `(watermark ${count("watermark")} · metadata ${count("metadata")} · unspecified ${count("unspecified")})`;
  }

  function setStatus(text: string, error = false): void {
    statusNode.textContent = text;
    statusNode.classList.toggle("error", error);
  }

  function updateStale(): void {
    const stale =
      report !== null && reportExpectedKey !== expectedKey(host.getExpected());
    staleNode.hidden = !stale;
  }

  /* ---- Rendering of the result ---- */

  function renderSummary(r: DiagnosticReport): string {
    const parts: string[] = [];
    const c = r.comparison;

    if (r.error) {
      parts.push(
        `<div class="callout callout--bad"><b>Extractor error:</b> ${esc(r.error.message)}` +
          (r.error.stack ? `<pre>${esc(r.error.stack)}</pre>` : "") +
          "</div>",
      );
    }

    if (c) {
      const stat = (label: string, value: string, kind = "") =>
        `<div class="stat ${kind}"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
      parts.push(
        '<div class="stat-grid">' +
          stat("Expected removed", String(c.expectedIndexes.length)) +
          stat("Actually removed", String(c.actualIndexes.length)) +
          stat("Matched", String(c.matched.length), "good") +
          stat("Missing", String(c.missing.length), c.missing.length ? "bad" : "") +
          stat(
            "Unexpected",
            String(c.unexpected.length),
            c.unexpected.length ? "warn" : "",
          ) +
          stat(
            "Wrong source",
            String(c.wrongSource.length),
            c.wrongSource.length ? "info" : "",
          ) +
          stat("Precision", pct(c.precision)) +
          stat("Recall", pct(c.recall)) +
          "</div>",
      );

      parts.push("<h4>Expected vs actual</h4>");
      parts.push(
        table(
          ["", "Count", "Indexes"],
          [
            [
              "Expected · watermark",
              String(r.expectation.byCategory.watermark.length),
              esc(list(r.expectation.byCategory.watermark)),
            ],
            [
              "Expected · metadata",
              String(r.expectation.byCategory.metadata.length),
              esc(list(r.expectation.byCategory.metadata)),
            ],
            [
              "Expected · unspecified",
              String(r.expectation.byCategory.unspecified.length),
              esc(list(r.expectation.byCategory.unspecified)),
            ],
            [
              "Actual · bounding-poly",
              String(c.bySource.boundingPoly.length),
              esc(list(c.bySource.boundingPoly)),
            ],
            [
              "Actual · watermark",
              String(c.bySource.watermark.length),
              esc(list(c.bySource.watermark)),
            ],
            [
              "Actual · metadata",
              String(c.bySource.metadata.length),
              esc(list(c.bySource.metadata)),
            ],
          ],
        ),
      );

      const problems = r.boxes.filter(
        (b) => b.verdict !== "ok" && b.verdict !== "kept",
      );
      parts.push(`<h4>Mismatches (${problems.length})</h4>`);
      parts.push(
        problems.length
          ? table(
              ["#", "Label", "Verdict", "Expected", "Actual", "Detector says"],
              problems.map((b) => [
                `<b>${b.index}</b>`,
                esc(b.label),
                badge(b.verdict.toUpperCase(), VERDICT_KIND[b.verdict] ?? "muted"),
                show(b.expected),
                show(b.actual),
                detectorSummary(b),
              ]),
              { clickable: problems.map((b) => b.index) },
            )
          : '<p class="muted">No mismatch — actual removal equals expected.</p>',
      );
    }
    return parts.join("");
  }

  function detectorSummary(b: BoxDiagnostic): string {
    const lines: string[] = [];
    if (b.watermark) {
      lines.push(
        `<b>watermark</b> ${esc(b.watermark.classification)} · conf ${fx(b.watermark.confidence, 2)} · angle ${fx(b.watermark.relativeAngle, 1)}° — ${esc(b.watermark.reason)}`,
      );
    }
    if (b.metadata) {
      lines.push(
        `<b>metadata</b> ${esc(b.metadata.classification)}/${esc(b.metadata.type)} · conf ${fx(b.metadata.confidence, 2)} — ${esc(b.metadata.reason)}`,
      );
    }
    if (b.boundingPolyReasons.length) {
      lines.push(`<b>bounding-poly</b> ${esc(b.boundingPolyReasons.join(", "))}`);
    }
    return lines.length ? lines.join("<br>") : '<span class="muted">no detector info</span>';
  }

  const GEOMETRY_HEADERS = [
    "Degree v0>v1",
    "Bottom edge v3>v2",
    "Center",
    "Size WxH",
    "Area",
    "BBox",
    "Vertices (v0..)",
  ];

  function geometryCells(b: BoxDiagnostic): string[] {
    const g = b.geometry;
    const vertices = g.vertices.length
      ? g.vertices.map((v) => `(${v.x}, ${v.y})`).join("<br>") +
        (g.hadMissingCoordinates
          ? '<br><span class="muted">missing x/y read as 0</span>'
          : "")
      : dash;
    return [
      g.degree === null
        ? dash
        : `${fx(g.degree, 2)}°<br><span class="muted">${fx(g.degreeNormalized, 2)}° norm</span>`,
      g.bottomEdgeDegree === null ? dash : `${fx(g.bottomEdgeDegree, 2)}°`,
      g.center ? `(${g.center.x}, ${g.center.y})` : dash,
      g.width === null ? dash : `${fx(g.width, 1)} × ${fx(g.height, 1)}`,
      g.area === null ? dash : String(g.area),
      g.bbox
        ? `(${g.bbox.minX}, ${g.bbox.minY})<br>(${g.bbox.maxX}, ${g.bbox.maxY})<br><span class="muted">${g.bbox.width} × ${g.bbox.height}</span>`
        : dash,
      `<span class="vertices">${vertices}</span>`,
    ];
  }

  function renderRemoved(r: DiagnosticReport): string {
    const parts: string[] = [];
    const expectedBoxes = r.boxes.filter((b) => b.expected !== null);
    const actualBoxes = r.boxes.filter((b) => b.actual !== null);

    parts.push(
      '<p class="muted">Geometry from <code>boundingPoly.vertices</code> ' +
        "(v0 top-left, v1 top-right, v2 bottom-right, v3 bottom-left in the text frame). " +
        "Degree = angle v0&gt;v1, same as the canvas. Click a row to select the box.</p>",
    );

    parts.push(`<h4>Expected removed (${expectedBoxes.length})</h4>`);
    parts.push(
      table(
        ["#", "Label", "Expected", "Actually", "Verdict", ...GEOMETRY_HEADERS],
        expectedBoxes.map((b) => [
          `<b>${b.index}</b>`,
          esc(b.label),
          show(b.expected),
          b.actual
            ? esc(`removed by ${b.actual}`)
            : r.comparison
              ? badge("kept", "muted")
              : dash,
          badge(b.verdict, VERDICT_KIND[b.verdict] ?? "muted"),
          ...geometryCells(b),
        ]),
        { clickable: expectedBoxes.map((b) => b.index) },
      ),
    );

    parts.push(`<h4>Actual removed (${actualBoxes.length})</h4>`);
    parts.push(
      r.comparison
        ? table(
            [
              "#",
              "Label",
              "Removed by",
              "Expected",
              "Verdict",
              ...GEOMETRY_HEADERS,
              "Detector info",
            ],
            actualBoxes.map((b) => [
              `<b>${b.index}</b>`,
              esc(b.label),
              show(b.actual),
              b.expected ? esc(b.expected) : badge("not expected", "warn"),
              badge(b.verdict, VERDICT_KIND[b.verdict] ?? "muted"),
              ...geometryCells(b),
              detectorSummary(b),
            ]),
            { clickable: actualBoxes.map((b) => b.index) },
          )
        : '<p class="muted">Extraction did not complete, so the actual removal is unknown.</p>',
    );
    return parts.join("");
  }

  function renderExtraction(r: DiagnosticReport): string {
    const ex = r.extraction;
    if (!ex) return '<p class="muted">Extraction did not complete.</p>';
    const parts: string[] = [];

    parts.push("<h4>Data</h4>");
    parts.push(
      table(
        ["Field", "Value"],
        Object.entries(ex.data).map(([k, v]) => [
          `<code>${esc(k)}</code>`,
          show(v),
        ]),
      ),
    );

    parts.push("<h4>Field association</h4>");
    parts.push(
      table(
        ["Field", "Matched label", "Value", "Conf.", "Label #", "Value #"],
        ex.fields.map((f) => [
          `<code>${esc(f.field)}</code>`,
          show(f.label),
          f.value === null ? badge("null", "warn") : esc(f.value),
          fx(f.confidence, 2),
          esc(list(f.labelIndexes)),
          esc(list(f.valueIndexes)),
        ]),
      ),
    );

    parts.push(`<h4>Unmatched labels (${ex.unmatchedLabels.length})</h4>`);
    parts.push(
      table(
        ["Field", "Matched text", "Alias", "Similarity", "#"],
        ex.unmatchedLabels.map((l) => [
          `<code>${esc(l.field)}</code>`,
          show(l.matchedText),
          show(l.matchedAlias),
          fx(l.similarity, 2),
          esc(list(l.indexes)),
        ]),
      ),
    );

    parts.push(
      `<p class="muted">Used word indexes (${ex.usedWordIndexes.length}): ${esc(list(ex.usedWordIndexes))}</p>`,
    );

    parts.push(
      `<details><summary>Association candidates (${ex.associationDiagnostics.length})</summary>` +
        table(
          ["Field", "Candidate", "Accepted", "Score", "#", "Reason"],
          ex.associationDiagnostics.map((d) => [
            `<code>${esc(d.field)}</code>`,
            show(d.candidateText),
            d.accepted ? badge("yes", "ok") : badge("no", "muted"),
            fx(d.score),
            esc(list(d.boxIndexes)),
            show(d.reason),
          ]),
        ) +
        "</details>",
    );
    return parts.join("");
  }

  function renderPipeline(r: DiagnosticReport): string {
    const p = r.pipeline;
    const parts: string[] = [];
    const missing = '<p class="muted">Not reported by this extractor version.</p>';

    parts.push("<h4>Bounding poly filter</h4>");
    parts.push(
      p.boundingPoly
        ? `<p>Invalid indexes: ${esc(list(p.boundingPoly.invalidIndexes))}</p>` +
            (p.boundingPoly.diagnostics.length
              ? `<pre>${esc(JSON.stringify(p.boundingPoly.diagnostics, null, 2))}</pre>`
              : "")
        : missing,
    );

    parts.push("<h4>Orientation</h4>");
    if (p.orientation) {
      const o = p.orientation;
      parts.push(
        keyValues([
          ["Degree", fx(o.degree, 2)],
          ["Reliable", badge(String(o.isReliable), o.isReliable ? "ok" : "bad")],
          ["Support", `${o.support}/${o.validWords} (${pct(o.supportRatio)})`],
          ["Total words", String(o.totalWords)],
          ["Median height", fx(o.medianHeight, 2)],
          ["Deviation", fx(o.deviation, 2)],
          ["Skipped in projection", String(o.skippedProjection)],
          ["Rows", String(o.rowCount)],
        ]),
      );
      parts.push(
        table(
          ["Cluster degree", "Count", "Support", "Deviation"],
          o.clusters.map((c) => [
            fx(c.degree, 2),
            String(c.count),
            pct(c.supportRatio),
            fx(c.deviation, 2),
          ]),
        ),
      );
    } else parts.push(missing);

    for (const [title, key] of [
      ["Watermark detection", "watermark"],
      ["Metadata detection", "metadata"],
    ] as const) {
      parts.push(`<h4>${title}</h4>`);
      const d = p[key];
      if (!d) {
        parts.push(missing);
        continue;
      }
      parts.push(
        keyValues([
          ["Detected", badge(String(d.detected), d.detected ? "info" : "muted")],
          ...(d.confidence !== null
            ? ([["Confidence", fx(d.confidence)]] as [string, string][])
            : []),
          ["Candidate indexes", esc(list(d.candidateIndexes))],
          ["Removed indexes", esc(list(d.removedIndexes))],
        ]),
      );
      if (d.groups.length) {
        parts.push(
          `<details><summary>Groups (${d.groups.length})</summary><pre>${esc(JSON.stringify(d.groups, null, 2))}</pre></details>`,
        );
      }
    }
    return parts.join("");
  }

  function renderBoxes(r: DiagnosticReport): string {
    const filter = boxFilter.value;
    const rows = r.boxes.filter((b) => {
      switch (filter) {
        case "mismatch":
          return b.verdict !== "ok" && b.verdict !== "kept";
        case "removed":
          return b.actual !== null;
        case "expected":
          return b.expected !== null;
        case "detector":
          return b.watermark !== null || b.metadata !== null;
        default:
          return true;
      }
    });
    return table(
      [
        "#",
        "Label",
        "Degree",
        "Center",
        "Expected",
        "Actual",
        "Verdict",
        "Watermark",
        "Metadata",
        "Used by",
      ],
      rows.map((b) => [
        `<b>${b.index}</b>`,
        esc(b.label),
        b.geometry.degree === null ? dash : `${fx(b.geometry.degree, 2)}°`,
        b.geometry.center
          ? `(${b.geometry.center.x}, ${b.geometry.center.y})`
          : dash,
        show(b.expected),
        show(b.actual),
        badge(b.verdict, VERDICT_KIND[b.verdict] ?? "muted"),
        b.watermark
          ? `${esc(b.watermark.classification)} · ${fx(b.watermark.confidence, 2)} · ${fx(b.watermark.relativeAngle, 1)}°`
          : dash,
        b.metadata
          ? `${esc(b.metadata.classification)}/${esc(b.metadata.type)} · ${fx(b.metadata.confidence, 2)}`
          : dash,
        b.usedBy.length ? esc(b.usedBy.join(", ")) : dash,
      ]),
      { clickable: rows.map((b) => b.index) },
    );
  }

  function renderResult(): void {
    if (!report) {
      resultNode.hidden = true;
      return;
    }
    resultNode.hidden = false;
    const kind =
      report.status === "pass" ? "ok" : report.status === "fail" ? "bad" : "warn";
    verdictNode.innerHTML =
      badge(STATUS_LABEL[report.status], kind) +
      ` <span class="muted">${esc(report.meta.sourceFile)} · ${report.meta.durationMs} ms` +
      (report.meta.gitCommit
        ? ` · ${esc(report.meta.gitBranch ?? "")}@${esc(report.meta.gitCommit)}`
        : "") +
      "</span>";

    panes.summary.innerHTML = renderSummary(report);
    panes.removed.innerHTML = renderRemoved(report);
    panes.extraction.innerHTML = renderExtraction(report);
    panes.pipeline.innerHTML = renderPipeline(report);
    boxesTable.innerHTML = renderBoxes(report);
    reportText.value = formatMarkdown(report);
    updateStale();
  }

  function showTab(name: TabName): void {
    for (const button of tabButtons) {
      button.classList.toggle("active", button.dataset.tab === name);
    }
    for (const [key, node] of Object.entries(panes)) {
      node.hidden = key !== name;
    }
  }

  /* ---- Actions ---- */

  async function runTest(): Promise<void> {
    const dataset = host.getDataset();
    if (!dataset || running) return;

    running = true;
    updateControls();
    setStatus("Running KTPExtractor…");

    const request: DiagnosticRequest = {
      sourceName: dataset.sourceName,
      textAnnotations: dataset.textAnnotations,
      expected: host.getExpected(),
    };

    try {
      const response = await fetch("/__diagnostic/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          (payload as { error?: string } | null)?.error ??
          `HTTP ${response.status}`;
        throw new Error(message);
      }
      report = payload as DiagnosticReport;
      reportExpectedKey = expectedKey(request.expected);
      renderResult();
      showTab("summary");
      host.requestRender();
      setStatus(
        report.status === "error"
          ? "Extractor threw an error — see Summary."
          : `Done: ${STATUS_LABEL[report.status]}.`,
        report.status === "error",
      );
    } catch (error) {
      setStatus(
        `Test failed to run: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    } finally {
      running = false;
      updateControls();
    }
  }

  async function copyText(value: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied to clipboard.`);
    } catch {
      // Fallback untuk konteks tanpa Clipboard API.
      reportText.focus();
      reportText.select();
      const ok = document.execCommand("copy");
      setStatus(
        ok
          ? `${label} copied to clipboard.`
          : "Clipboard unavailable — select the text in the Report tab and copy manually.",
        !ok,
      );
    }
  }

  function download(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const baseName = (): string =>
    (report?.meta.sourceFile ?? "dataset").replace(/\.json$/i, "") || "dataset";

  async function loadExpectedFile(file: File): Promise<void> {
    const parsed: unknown = JSON.parse(await file.text());
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Expected JSON must be an object.");
    }
    const data = parsed as {
      removedIndexes?: unknown;
      removedByCategory?: Partial<Record<ExpectedCategory, unknown>>;
      totalAnnotations?: unknown;
    };
    if (!Array.isArray(data.removedIndexes)) {
      throw new Error("Expected JSON must contain removedIndexes.");
    }
    const categoryOf = new Map<number, ExpectedCategory>();
    for (const category of ["watermark", "metadata", "unspecified"] as const) {
      const values = data.removedByCategory?.[category];
      if (Array.isArray(values)) {
        for (const v of values) {
          if (typeof v === "number") categoryOf.set(v, category);
        }
      }
    }
    const entries: ExpectedEntry[] = [];
    for (const value of data.removedIndexes) {
      if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`Invalid index in removedIndexes: ${String(value)}`);
      }
      entries.push({
        index: value as number,
        category: categoryOf.get(value as number) ?? "unspecified",
      });
    }
    host.applyExpected(
      entries,
      typeof data.totalAnnotations === "number" ? data.totalAnnotations : null,
    );
  }

  /* ---- Events ---- */

  runButton.addEventListener("click", () => void runTest());

  expectedInput.addEventListener("change", () => {
    const file = expectedInput.files?.[0];
    if (!file) return;
    void loadExpectedFile(file)
      .catch((error: unknown) =>
        host.notify(
          error instanceof Error ? error.message : "Failed to read expected JSON.",
          true,
        ),
      )
      .finally(() => {
        expectedInput.value = "";
      });
  });

  for (const button of tabButtons) {
    button.addEventListener("click", () => showTab(button.dataset.tab as TabName));
  }

  overlayToggle.addEventListener("change", () => host.requestRender());
  boxFilter.addEventListener("change", () => {
    if (report) boxesTable.innerHTML = renderBoxes(report);
  });

  resultNode.addEventListener("click", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (!row) return;
    const index = Number(row.dataset.index);
    if (Number.isInteger(index)) host.selectIndex(index);
  });

  $("copy-md").addEventListener("click", () => {
    if (report) void copyText(formatMarkdown(report), "Diagnostic (Markdown)");
  });
  $("copy-json").addEventListener("click", () => {
    if (report) void copyText(formatJson(report), "Diagnostic (JSON)");
  });
  $("copy-md-inline").addEventListener("click", () => {
    if (report) void copyText(formatMarkdown(report), "Diagnostic (Markdown)");
  });
  $("download-md").addEventListener("click", () => {
    if (report) {
      download(`${baseName()}.diagnostic.md`, formatMarkdown(report), "text/markdown");
    }
  });
  $("download-json").addEventListener("click", () => {
    if (report) {
      download(`${baseName()}.diagnostic.json`, formatJson(report), "application/json");
    }
  });

  /* ---- Server availability ---- */

  void fetch("/__diagnostic/health", { cache: "no-store" })
    .then((response) => {
      serverReady = response.ok;
    })
    .catch(() => {
      serverReady = false;
    })
    .finally(() => {
      if (!serverReady) {
        setStatus(
          "Diagnostic server not available. Start the tool with `pnpm visualizer` (the test runs through the Vite dev server).",
          true,
        );
      }
      updateControls();
    });

  showTab("summary");
  updateControls();

  /* ---- Public API ---- */

  return {
    onDatasetChanged() {
      report = null;
      reportExpectedKey = "";
      setStatus("");
      renderResult();
      updateControls();
    },
    onExpectedChanged() {
      updateControls();
      updateStale();
    },
    getMarks() {
      if (!report || !overlayToggle.checked || !report.comparison) return null;
      const marks = new Map<number, MarkKind>();
      for (const box of report.boxes) {
        if (
          box.verdict === "missing" ||
          box.verdict === "unexpected" ||
          box.verdict === "wrong-source"
        ) {
          marks.set(box.index, box.verdict);
        }
      }
      return marks;
    },
    describeIndex(index) {
      const box = report?.boxes[index];
      if (!box || !report) return [];
      const lines = [
        `Test verdict: ${box.verdict}` +
          (box.expected ? ` · expected ${box.expected}` : "") +
          (box.actual ? ` · removed by ${box.actual}` : ""),
      ];
      if (box.watermark) {
        lines.push(
          `Watermark: ${box.watermark.classification} (conf ${fx(box.watermark.confidence, 2)}, angle ${fx(box.watermark.relativeAngle, 1)}°) — ${box.watermark.reason}`,
        );
      }
      if (box.metadata) {
        lines.push(
          `Metadata: ${box.metadata.classification}/${box.metadata.type} (conf ${fx(box.metadata.confidence, 2)}) — ${box.metadata.reason}`,
        );
      }
      if (box.usedBy.length) lines.push(`Used by: ${box.usedBy.join(", ")}`);
      const g = box.geometry;
      if (g.center) {
        lines.push(
          `Center: (${g.center.x}, ${g.center.y}) · size ${fx(g.width, 1)} × ${fx(g.height, 1)} · bottom edge ${fx(g.bottomEdgeDegree, 2)}°`,
        );
      }
      return lines;
    },
  };
}
