import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { baklibPreviewPlugin } from "./vite-plugin-preview.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** 强制解析到唯一物理包，避免与仓库根目录 node_modules 各装一份 React 时出现 Invalid hook call。 */
function pkgRoot(pkg: string) {
  return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [__dirname] }))
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), baklibPreviewPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: pkgRoot("react"),
      "react-dom": pkgRoot("react-dom"),
    },
  },
})
