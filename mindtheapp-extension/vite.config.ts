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

/**
 * Multi-entry Vite build for a Chrome Manifest V3 extension.
 *
 * We run Vite twice via separate build configs, but to keep a single
 * command we use a single config with multi-entry rollup input for the
 * side panel HTML plus a plugin that invokes separate builds for the
 * content script and service worker as IIFE bundles.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "mindtheapp-finalize",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

        // Copy manifest.json into dist for zipping / loading unpacked.
        try {
          copyFileSync(
            resolve(__dirname, "manifest.json"),
            resolve(distDir, "manifest.json"),
          );
        } catch {
          // ignore if missing during partial builds
        }

        // Copy icons if present.
        const iconSrcDir = resolve(__dirname, "public/icons");
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

        // Vite places html entries at dist/<relative-path-from-root>, so our
        // sidepanel lands at dist/src/sidepanel/index.html. Move it to the
        // location the manifest expects.
        const builtHtml = resolve(distDir, "src/sidepanel/index.html");
        const targetHtml = resolve(distDir, "sidepanel/index.html");
        if (existsSync(builtHtml)) {
          mkdirSync(dirname(targetHtml), { recursive: true });
          renameSync(builtHtml, targetHtml);
          // Clean up the now-empty dist/src tree.
          try {
            rmSync(resolve(distDir, "src"), {
              recursive: true,
              force: true,
            });
          } catch {
            /* ignore */
          }
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
        content: resolve(__dirname, "src/content/index.ts"),
        "auth-bridge": resolve(__dirname, "src/content/auth-bridge.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background/background.js";
          if (chunk.name === "content") return "content/content.js";
          if (chunk.name === "auth-bridge") return "content/auth-bridge.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (asset) => {
          if (asset.name && asset.name.endsWith(".css")) {
            return "assets/[name]-[hash][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
        format: "es",
        inlineDynamicImports: false,
      },
    },
  },
});
