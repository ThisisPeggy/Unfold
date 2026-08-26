import fs from "node:fs";
import path from "node:path";

const root = path.resolve("node_modules/@excalidraw/excalidraw/dist");
const files = [
  path.join(root, "dev/chunk-4FTI6OG3.js"),
  ...fs.readdirSync(path.join(root, "prod"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(root, "prod", name)),
];

const patches = [
  [
    '"Liberation Sans": 9\n};',
    '"Liberation Sans": 9,\n  "小赖字体": 10,\n  "霞鹜文楷 GB": 11\n};',
  ],
  [
    '[FONT_FAMILY_FALLBACKS.Xiaolai]: {',
    '[FONT_FAMILY["小赖字体"]]: {\n    metrics: { unitsPerEm: 1e3, ascender: 880, descender: -144, lineHeight: 1.15 },\n    icon: FreedrawIcon\n  },\n  [FONT_FAMILY["霞鹜文楷 GB"]]: {\n    metrics: { unitsPerEm: 1e3, ascender: 880, descender: -120, lineHeight: 1.15 },\n    icon: FreedrawIcon\n  },\n  [FONT_FAMILY_FALLBACKS.Xiaolai]: {',
  ],
  [
    'init("Virgil", ...VirgilFontFaces);\n    init(CJK_HAND_DRAWN_FALLBACK_FONT, ...XiaolaiFontFaces);',
    'init("Virgil", ...VirgilFontFaces);\n    init("小赖字体", ...XiaolaiFontFaces);\n    init("霞鹜文楷 GB", { uri: "/fonts/LXGWWenKaiGBLite-Regular.ttf", descriptors: {} });\n    init(CJK_HAND_DRAWN_FALLBACK_FONT, ...XiaolaiFontFaces);',
  ],
  [
    '"Liberation Sans":9}',
    '"Liberation Sans":9,"小赖字体":10,"霞鹜文楷 GB":11}',
  ],
  [
    '[Un.Xiaolai]:{metrics:',
    '[Ie["小赖字体"]]:{metrics:{unitsPerEm:1e3,ascender:880,descender:-144,lineHeight:1.15},icon:Nr},[Ie["霞鹜文楷 GB"]]:{metrics:{unitsPerEm:1e3,ascender:880,descender:-120,lineHeight:1.15},icon:Nr},[Un.Xiaolai]:{metrics:',
  ],
  [
    'n("Virgil",...yc),n(Mn,...b1)',
    'n("Virgil",...yc),n("小赖字体",...b1),n("霞鹜文楷 GB",{uri:"/fonts/LXGWWenKaiGBLite-Regular.ttf",descriptors:{}}),n(Mn,...b1)',
  ],
];

let applied = 0;
for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [before, after] of patches) {
    if (source.includes(after)) continue;
    if (!source.includes(before)) continue;
    source = source.replace(before, after);
    applied += 1;
    changed = true;
  }
  if (changed) fs.writeFileSync(file, source);
}

// ponytail: pinned bundle patch; delete when Excalidraw exposes custom font registration.
const verified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes('"小赖字体"') &&
    source.includes('"霞鹜文楷 GB"') &&
    source.includes("/fonts/LXGWWenKaiGBLite-Regular.ttf");
}).length;

if ((applied !== 6 && applied !== 0) || verified !== 2) {
  throw new Error(`Excalidraw font patch was only partially applied (${applied}/6)`);
}
