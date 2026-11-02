import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./src/App.jsx", import.meta.url), "utf8");
const preview = fs.readFileSync(new URL("./src/components/StaticPreview.jsx", import.meta.url), "utf8");
const previewHtml = fs.readFileSync(new URL("./dist/index.html", import.meta.url), "utf8");
const previewCss = fs.readdirSync(new URL("./dist/assets/", import.meta.url))
  .filter((name) => name.endsWith(".css"))
  .map((name) => fs.readFileSync(new URL(`./dist/assets/${name}`, import.meta.url), "utf8"))
  .join("\n");

assert.match(app, /VITE_STATIC_PREVIEW/);
assert.match(app, /return STATIC_PREVIEW \? <StaticPreview \/> : <LiveApp \/>/);
assert.match(preview, /ВЫМЫШЛЕННЫЕ ДАННЫЕ/);
assert.doesNotMatch(preview, /\b(?:fetch|XMLHttpRequest|WebSocket|io)\s*\(/);
assert.match(preview, /ТОЛЬКО ПРОСМОТР/);
assert.doesNotMatch(previewHtml, /https?:\/\/|telegram\.org|fonts\.googleapis/i);
assert.doesNotMatch(previewCss, /@import|https?:\/\/|fonts\.googleapis/i);
console.log("static preview safety checks passed");
