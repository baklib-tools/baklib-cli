#!/usr/bin/env node

import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

async function build() {
  await esbuild.build({
    entryPoints: [join(rootDir, "src", "index.js")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: join(rootDir, "dist", "index.js"),
    banner: {
      js: "#!/usr/bin/env node",
    },
    minify: false,
    sourcemap: false,
    external: [
      "commander",
      "cfonts",
      "form-data",
      "vite",
      "@vitejs/plugin-react",
      "react",
      "react-dom",
      "liquidjs",
    ],
  });

  console.log("✅ Build successful: dist/index.js");
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
