import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { diagnosticPlugin } from "./server/diagnostic-plugin.js";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [diagnosticPlugin()],
  server: { host: "127.0.0.1", port: 4173, strictPort: true, open: true },
});
