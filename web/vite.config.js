import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isStaticPreview = loadEnv(mode, process.cwd(), "VITE_").VITE_STATIC_PREVIEW === "true";

  return {
    base: isStaticPreview ? "/Bot-watch2gether/" : "/",
    plugins: [
      react(),
      ...(isStaticPreview
        ? [{
            name: "static-preview-no-external-resources",
            enforce: "pre",
            transformIndexHtml(html) {
              return html
                .replace(/\s*<link rel="preconnect"[^>]*>\s*/gi, "")
                .replace(/\s*<link[^>]+href=["']https:\/\/fonts\.googleapis\.com[^>]*>\s*/gi, "")
                .replace(/<script(?![^>]*type=["']module["'])[^>]*>[\s\S]*?<\/script>/gi, "");
            },
            transform(code, id) {
              if (id.replaceAll("\\", "/").endsWith("/src/styles.css")) {
                return code.replace(/^\uFEFF?@import url\([^;]+\);\s*/m, "");
              }
              return null;
            },
          }]
        : []),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": "http://127.0.0.1:3000",
        "/socket.io": {
          target: "http://127.0.0.1:3000",
          ws: true,
        },
      },
    },
  };
});
