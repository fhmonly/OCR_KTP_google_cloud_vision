import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { runDiagnostic, validateRequest } from "./run-diagnostic.js";

const MAX_BODY_BYTES = 64 * 1024 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

/**
 * Dev-only endpoint:
 *   GET  /__diagnostic/health
 *   POST /__diagnostic/run   { sourceName, textAnnotations, expected }
 * Menjalankan KTPExtractor asli di Node (bukan di browser, karena extractor
 * bergantung pada @google-cloud/vision).
 */
export function diagnosticPlugin(): Plugin {
  let repoRoot = process.cwd();

  return {
    name: "ktp-diagnostic",
    apply: "serve",
    configResolved(config) {
      // root = tools/visualizer -> repo root dua tingkat di atasnya.
      repoRoot = resolve(config.root, "..", "..");
    },
    configureServer(server) {
      server.middlewares.use("/__diagnostic/health", (_req, res) => {
        sendJson(res, 200, { ok: true });
      });

      server.middlewares.use("/__diagnostic/run", (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Use POST." });
          return;
        }
        void (async () => {
          try {
            const request = validateRequest(JSON.parse(await readBody(req)));
            const report = await runDiagnostic(request, { repoRoot });
            sendJson(res, 200, report);
          } catch (error) {
            sendJson(res, 400, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })();
      });
    },
  };
}
