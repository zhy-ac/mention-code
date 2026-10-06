import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync } from "node:fs";
import { resolve } from "node:path";

const copyLegacyAssets = {
  name: "copy-legacy-assets",
  closeBundle() {
    for (const directory of ["assets", "libs", "languages"]) {
      cpSync(
        resolve(process.cwd(), "src", directory),
        resolve(process.cwd(), "dist", directory),
        { recursive: true }
      );
    }
  }
};

export default defineConfig({
  root: "./src",
  base: "./",
  plugins: [react(), copyLegacyAssets],
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
