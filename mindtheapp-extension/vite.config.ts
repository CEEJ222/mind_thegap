import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
  readdirSync,
} from "fs";
import { build as esbuild } from "esbuild";

/**
 * Multi-entry Vite build for a Chrome Manifest V3 extension.
 *
 * - Side panel (React HTML) and background service worker are produced by
 *   Vite's normal Rollup pipeline. The service worker is declared as
 *   `"type": "module"` in manifest.json, so ES-module output is fine.
 * - Content scripts are bundled as classic IIFE scripts via a direct
 *   esbuild invocation inside the finalize hook. MV3 content scripts are
 *   injected as classic scripts and must not contain ES-module syntax or
 *   cross-chunk imports, which Rollup's ES-format output can introduce
 *   even for "entry" files. Bundling them with esbuild's iife format
 *   guarantees a self-contained file.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "mindtheapp-finalize",
      async closeBundle() {
        const root = __dirname;
        const distDir = resolve(root, "dist");
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

        // Copy manifest.json into dist for loading unpacked / zipping.
        try {
          copyFileSync(
            resolve(root, "manifest.json"),
            resolve(distDir, "manifest.json"),
          );
        } catch {
          // ignore if missing during partial builds
        }

        // Copy icons if present.
        const iconSrcDir = resolve(root, "public/icons");
        if (existsSync(iconSrcDir)) {
          const iconDestDir = resolve(distDir, "icons");
          mkdirSync(iconDestDir, { recursive: true });
          for (const file of readdirSync(iconSrcDir)) {
            copyFileSync(
              resolve(iconSrcDir, file),
              resolve(iconDestDir, file),
            );
          }
        }

        // Vite places html entries at dist/<relative-path-from-root>, so
        // our side panel lands at dist/src/sidepanel/index.html. Move it
        // to the location the manifest expects.
        const builtHtml = resolve(distDir, "src/sidepanel/index.html");
        const targetHtml = resolve(distDir, "sidepanel/index.html");
        if (existsSync(builtHtml)) {
          mkdirSync(dirname(targetHtml), { recursive: true });
          renameSync(builtHtml, targetHtml);
          try {
            rmSync(resolve(distDir, "src"), {
              recursive: true,
              force: true,
            });
          } catch {
            /* ignore */
          }
        }

        // Bundle content scripts as classic IIFE files. Each entry is
        // built standalone so the output contains no import/export and
        // can be injected directly by Chrome.
        const contentOutDir = resolve(distDir, "content");
        mkdirSync(contentOutDir, { recursive: true });
        const contentEntries: Array<[string, string]> = [
          [resolve(root, "src/content/index.ts"), "content.js"],
          [resolve(root, "src/content/auth-bridge.ts"), "auth-bridge.js"],
        ];
        for (const [entry, outfile] of contentEntries) {
          await esbuild({
            entryPoints: [entry],
            bundle: true,
            format: "iife",
            target: "chrome110",
            platform: "browser",
            outfile: resolve(contentOutDir, outfile),
            minify: true,
            legalComments: "none",
            logLevel: "warning",
          });
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  // Absolute asset paths resolve from the extension root in MV3
  // (chrome-extension://<id>/assets/...), which works regardless of where
  // the HTML entry is physically located in dist.
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background/background.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        format: "es",
      },
    },
  },
});
