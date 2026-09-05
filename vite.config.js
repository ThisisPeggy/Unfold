import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    target: mode === "xhs" ? ["es2017", "chrome61"] : "es2020",
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    outDir: mode === "xhs" ? "dist-xhs" : "dist",
    rolldownOptions: mode === "xhs" ? {
      output: {
        format: "iife",
        codeSplitting: false,
      },
    } : {},
  },
  plugins: mode === "xhs" ? [{
    name: "xhs-classic-entry",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html.replace(/<script type="module" crossorigin /g, "<script defer ");
      },
    },
    transform(code, id) {
      if (!id.includes("@excalidraw")) return;
      return code
        .replace(/globalThis\.location\.origin\s*\+\s*"\/fonts\/NotoSansCJKsc-Bold.otf"/g, '"./fonts/NotoSansCJKsc-Bold.woff2"')
        .replace(/globalThis\.location\.origin\s*\+\s*"\/fonts\/LXGWWenKaiGBLite-Regular.ttf"/g, '"./fonts/LXGWWenKaiGBLite-Regular.woff2"');
    },
  }] : [],
}));
