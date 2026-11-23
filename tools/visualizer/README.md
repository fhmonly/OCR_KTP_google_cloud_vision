# KTP OCR Visualizer

## Install

From the repository root:

```bash
pnpm add -D vite
```

Add these scripts to the existing `package.json` without removing existing scripts:

```json
{
  "visualizer": "vite --config tools/visualizer/vite.config.ts",
  "typecheck:visualizer": "tsc --noEmit --project tools/visualizer/tsconfig.json"
}
```

Merge the entries into the existing `scripts` object; do not replace the whole object.

## Run

```bash
pnpm visualizer
```

Open `http://127.0.0.1:4173` if the browser does not open automatically.

## Manual workflow

1. Choose a Google Vision JSON response containing `textAnnotations`.
2. Optionally load the original KTP image as a canvas background.
3. Enter indexes to remove, separated by commas, spaces, or new lines.
4. Restore selected indexes or restore all removed indexes.
5. Toggle label, index, and degree overlays.
6. Export the expected result JSON. Use its `removedIndexes` and `remainingIndexes` as the expected output in automated tests.

## Index convention

The visualizer deliberately uses `textAnnotations.slice(1)` before assigning `originalIndex`, matching `KTPExtractor.extractFromTextAnnotation()` in the current repository.

## Scope

This is a manual annotation visualizer. It does not run bounding-poly validation, sorting, or watermark detection. It visualizes the raw word annotations and lets the tester manually mark indexes. The automated test should invoke the real package pipeline and compare its output with the exported expected indexes.
