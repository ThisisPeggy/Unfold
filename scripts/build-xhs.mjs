import fs from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import wawoff2 from "wawoff2";
import { zipSync } from "fflate";

await build({ mode: "xhs" });
const root = path.resolve("dist-xhs");
for (const name of ["LXGWWenKaiGBLite-Regular.ttf", "NotoSansCJKsc-Bold.otf"]) {
  const data = await fs.readFile(path.join(root, "fonts", name));
  await fs.writeFile(path.join(root, "fonts", name.replace(/\.(ttf|otf)$/, ".woff2")), await wawoff2.compress(data));
}
const allowed = new Set([".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".woff", ".woff2", ".json"]);
const files = {};
const issues = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(file); continue; }
    const relative = path.relative(root, file).split(path.sep).join("/");
    if (!allowed.has(path.extname(file))) continue;
    const bytes = await fs.readFile(file);
    files[relative] = bytes;
    if (file.endsWith(".js")) {
      const code = bytes.toString();
      for (const [name, pattern] of [
        ["network requests", /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b/],
        ["clipboard", /navigator\.clipboard|execCommand\(/],
        ["external windows", /window\.(open|prompt)\(/],
        ["worker/WASM", /new Worker\(|WebAssembly\./],
      ]) if (pattern.test(code)) issues.push(`${relative}: ${name}`);
    }
  }
}
await walk(root);
const html = files["index.html"].toString();
if (/type="module"/.test(html)) issues.push("module entry");
for (const [, ref] of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) {
  if (!files[ref]) issues.push(`missing resource: ${ref}`);
}
const zip = zipSync(files, { level: 9 });
if (zip.length > 10 * 1024 * 1024) issues.push(`ZIP exceeds 10 MiB: ${zip.length}`);
await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile("artifacts/xhs-audit.json", JSON.stringify({ bytes: zip.length, files: Object.keys(files), issues }, null, 2));
if (issues.length) throw new Error(`XHS release blocked; see artifacts/xhs-audit.json\n${issues.join("\n")}`);
await fs.writeFile("artifacts/unfold-xhs.zip", zip);
console.log(`Created artifacts/unfold-xhs.zip (${zip.length} bytes)`);
