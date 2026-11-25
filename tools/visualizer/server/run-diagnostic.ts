import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildReport,
  type ExtractorOutputLike,
} from "../diagnostic/compare.js";
import type { DiagnosticReport, DiagnosticRequest } from "../diagnostic/types.js";

interface ExtractorModule {
  KTPExtractor: new () => {
    extractFromTextAnnotation(annotations: unknown[]): unknown;
  };
}

function git(repoRoot: string, ...args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function gitInfo(repoRoot: string) {
  const status = git(repoRoot, "status", "--porcelain");
  return {
    gitBranch: git(repoRoot, "rev-parse", "--abbrev-ref", "HEAD"),
    gitCommit: git(repoRoot, "rev-parse", "--short", "HEAD"),
    gitDirty: status === null ? null : status.length > 0,
    nodeVersion: process.version,
  };
}

/**
 * Memuat src/KTPExtractor.ts yang TERBARU di setiap run (tsx men-namespace
 * setiap tsImport), jadi perubahan di src/ langsung terpakai tanpa restart.
 */
async function loadExtractor(repoRoot: string): Promise<ExtractorModule> {
  const { tsImport } = await import("tsx/esm/api");
  const target = pathToFileURL(join(repoRoot, "src", "KTPExtractor.ts")).href;
  const parent = pathToFileURL(join(repoRoot, "/")).href;
  return (await tsImport(target, parent)) as ExtractorModule;
}

export function validateRequest(body: unknown): DiagnosticRequest {
  if (typeof body !== "object" || body === null) {
    throw new Error("Request body must be a JSON object.");
  }
  const request = body as Partial<DiagnosticRequest>;
  if (!Array.isArray(request.textAnnotations)) {
    throw new Error("textAnnotations must be an array.");
  }
  const expected = Array.isArray(request.expected) ? request.expected : [];
  for (const entry of expected) {
    if (
      !entry ||
      !Number.isSafeInteger(entry.index) ||
      !["watermark", "metadata", "unspecified"].includes(entry.category)
    ) {
      throw new Error(`Invalid expected entry: ${JSON.stringify(entry)}`);
    }
  }
  return {
    sourceName: typeof request.sourceName === "string" ? request.sourceName : "",
    textAnnotations: request.textAnnotations,
    expected,
  };
}

export async function runDiagnostic(
  request: DiagnosticRequest,
  options: { repoRoot: string },
): Promise<DiagnosticReport> {
  const { repoRoot } = options;

  // Label per index, sama dengan konvensi extractor: slice(1).
  const labels = request.textAnnotations.slice(1).map((item) => {
    const description = (item as { description?: unknown } | null)?.description;
    return typeof description === "string" ? description.trim() : "";
  });

  const started = performance.now();
  let output: ExtractorOutputLike | null = null;
  let error: unknown = null;

  try {
    const { KTPExtractor } = await loadExtractor(repoRoot);
    // Tanpa kredensial: instance dibuat hanya untuk memakai
    // extractFromTextAnnotation(); tidak ada panggilan jaringan ke Vision.
    const extractor = new KTPExtractor();
    output = extractor.extractFromTextAnnotation(
      request.textAnnotations,
    ) as ExtractorOutputLike;
  } catch (caught) {
    error = caught;
  }

  return buildReport({
    sourceName: request.sourceName,
    labels,
    expected: request.expected,
    output,
    error,
    durationMs: Math.round(performance.now() - started),
    env: gitInfo(repoRoot),
  });
}
