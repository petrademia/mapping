/// <reference types="vitest/config" />
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { decideSave, SAVE_DEFAULT_MAPPING_PATH } from "./src/lib/saveMapping.ts";

const DEFAULT_MAPPING = "public/default.mapping.json";
const MAX_BODY = 10 * 1024 * 1024;

/**
 * Dev server only: lets Save mapping overwrite public/default.mapping.json instead of
 * downloading a copy. It writes that one fixed path, never one the page names, only
 * for a page on this same server, and only when the deck has the same name as the
 * deck already in the file (see decideSave).
 */
function saveDefaultMapping(): Plugin {
  return {
    name: "save-default-mapping",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_DEFAULT_MAPPING_PATH, (req, res) => {
        const reply = (status: number, body: Record<string, unknown>) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { saved: false, reason: "Use POST." });
        const origin = req.headers.origin;
        if (origin !== undefined) {
          let sameServer = false;
          try {
            sameServer = new URL(origin).host === req.headers.host;
          } catch {
            sameServer = false;
          }
          if (!sameServer) return reply(403, { saved: false, reason: "Not from this page." });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_BODY) chunks.push(chunk);
        });
        req.on("end", () => {
          if (size > MAX_BODY) return reply(413, { saved: false, reason: "That file is too large." });
          const incoming = Buffer.concat(chunks).toString("utf8");
          const target = resolve(server.config.root, DEFAULT_MAPPING);
          const existing = existsSync(target) ? readFileSync(target, "utf8") : null;
          const decision = decideSave(existing, incoming);
          if (!decision.ok) return reply(409, { saved: false, reason: decision.reason });
          writeFileSync(target, incoming.endsWith("\n") ? incoming : `${incoming}\n`);
          reply(200, { saved: true, path: DEFAULT_MAPPING });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveDefaultMapping()],
  server: {
    port: 51173,
    strictPort: true,
  },
  preview: {
    port: 51173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
