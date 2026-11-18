/// <reference types="vitest/config" />
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { chooseDeckFile, SAVE_DECK_MAPPING_PATH } from "./src/lib/saveMapping.ts";

const DECKS_DIR = "public/decks";
const MAX_BODY = 10 * 1024 * 1024;

/**
 * Dev server only: lets Save mapping overwrite a deck in public/decks/ instead of downloading a
 * copy. The file is never one the page names: it is the one file there that holds a deck with the
 * same name (see chooseDeckFile). It is only for a page on this same server.
 */
function saveDeckMapping(): Plugin {
  return {
    name: "save-deck-mapping",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(SAVE_DECK_MAPPING_PATH, (req, res) => {
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
          const folder = resolve(server.config.root, DECKS_DIR);
          let files: { file: string; text: string }[] = [];
          try {
            files = readdirSync(folder)
              .filter((file) => file.endsWith(".mapping.json"))
              .map((file) => ({ file, text: readFileSync(join(folder, file), "utf8") }));
          } catch {
            files = [];
          }
          const choice = chooseDeckFile(files, incoming);
          if ("reason" in choice) return reply(409, { saved: false, reason: choice.reason });
          writeFileSync(join(folder, choice.file), incoming.endsWith("\n") ? incoming : `${incoming}\n`);
          reply(200, { saved: true, path: `${DECKS_DIR}/${choice.file}` });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveDeckMapping()],
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
