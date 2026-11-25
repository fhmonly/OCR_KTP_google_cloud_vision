# KTP OCR Visualizer & Diagnostic Tool

Web tool for inspecting Google Vision `textAnnotations`, marking which boxes
**should** disappear (watermark / metadata) and checking that against what the
real `KTPExtractor` actually does — without touching the terminal.

## Run

From the repository root:

```bash
pnpm install
pnpm visualizer
```

Open `http://127.0.0.1:4173` if the browser does not open automatically.

> The diagnostic test runs through the Vite **dev server** (`pnpm visualizer`).
> `KTPExtractor` depends on `@google-cloud/vision` (Node only), so it is executed
> on the server side, not in the browser. No Google credentials are needed and no
> network call is made: only `extractFromTextAnnotation()` is used.

## Workflow

1. **Choose Vision JSON** — a Google Vision response containing `textAnnotations`.
   Optionally add the KTP image as canvas background.
2. **Mark expected removed indexes** — enter the indexes that should be removed and
   pick *Removed by* (`Watermark detection`, `Metadata detection`, or
   `Not specified`), then press **Remove**. Or press **Load expected JSON** to load
   an existing `*.expected.json` (also loads categories if present).
3. **Run test** — the server loads the *current* `src/KTPExtractor.ts` (edits in
   `src/` are picked up on every run, no restart) and runs it on the JSON from step 1.
4. **Read the result**
   - **Summary** — PASS / FAIL, expected vs actual, precision / recall and a
     mismatch table (click a row to select that box on the canvas).
   - **Extraction** — extracted data, field association, unmatched labels,
     candidate scoring.
   - **Pipeline** — bounding-poly filter, orientation, watermark and metadata
     detection.
   - **All boxes** — one row per box: expected, actual, verdict, detector
     confidence/reason, and which field used it.
   - **Full report (copy)** — the complete Markdown report.
5. **Send to an AI** — `Copy diagnostic (Markdown)` (or `Copy JSON`,
   `Download .md/.json`). The report states the index convention, so it can be
   pasted into a chat as-is.

With **Highlight on canvas** on, mismatches are drawn on the canvas:
`MISSING` (expected removed, but kept), `EXTRA` (removed, but not expected) and
`WRONG SRC` (removed by a different detector than expected).

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `ok` | Expected and actually removed (and, if a category was given, by that detector). |
| `missing` | Expected removed, but the pipeline kept it. |
| `unexpected` | Removed by the pipeline, but not expected. |
| `wrong-source` | Removed, but by a different detector than the expected category. |
| `kept` | Not expected and not removed. |

The test passes only when there is no `missing`, `unexpected` or `wrong-source`.
If no index is marked, the test expects that **no** box is removed.

"Actually removed" = bounding-poly filter ∪ watermark filter ∪ metadata filter.

## Index convention

`textAnnotations.slice(1)` is used before assigning `originalIndex`, matching
`KTPExtractor.extractFromTextAnnotation()`. Always pass the **full**
`textAnnotations` array to the extractor; it drops index 0 itself.

## Expected JSON

```json
{
  "schemaVersion": 1,
  "sourceFile": "example.json",
  "totalAnnotations": 75,
  "removedIndexes": [16, 58, 71, 72],
  "remainingIndexes": [],
  "removedByCategory": {
    "watermark": [58],
    "metadata": [71, 72],
    "unspecified": [16]
  }
}
```

`removedByCategory` is optional (older files without it still load; their
indexes are treated as `unspecified`).

## Layout

```text
tools/visualizer/
  main.ts                  canvas, zoom/pan, expected indexes
  diagnostic-ui.ts         Run test button, result tabs, copy/download
  diagnostic/types.ts      shared report types
  diagnostic/compare.ts    expected vs actual + report builder (pure)
  diagnostic/format.ts     Markdown / JSON formatter (pure)
  server/run-diagnostic.ts loads and runs the real KTPExtractor (Node)
  server/diagnostic-plugin.ts  Vite dev-server endpoints /__diagnostic/*
```

## Privacy

The report contains the extracted KTP values (NIK, name, address, ...) and the
OCR word text. Review it before pasting it anywhere, or use anonymised datasets.

## Type check

```bash
pnpm typecheck:visualizer
```
