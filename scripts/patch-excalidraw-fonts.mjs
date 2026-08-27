import fs from "node:fs";
import path from "node:path";

const root = path.resolve("node_modules/@excalidraw/excalidraw/dist");
const files = [
  path.join(root, "dev/index.js"),
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
  [
    'value: FONT_FAMILY.Nunito,\n    icon: FontFamilyNormalIcon,\n    text: t("labels.normal"),\n    testId: "font-family-normal"',
    'value: FONT_FAMILY.Nunito,\n    icon: FontFamilyNormalIcon,\n    text: "粗体",\n    testId: "font-family-bold"',
  ],
  [
    'value:Kr.Nunito,icon:Xl,text:g("labels.normal"),testId:"font-family-normal"',
    'value:Kr.Nunito,icon:Xl,text:"粗体",testId:"font-family-bold"',
  ],
  [
    'init("Nunito", ...NunitoFontFaces);',
    'init("Nunito", { uri: "/fonts/NotoSansCJKsc-Bold.otf", descriptors: {} });',
  ],
  [
    'n("Nunito",...xc)',
    'n("Nunito",{uri:"/fonts/NotoSansCJKsc-Bold.otf",descriptors:{}})',
  ],
  [
    'children: /* @__PURE__ */ jsx("path", { d: "M5.833 16.667v-10a3.333 3.333 0 0 1 3.334-3.334h1.666a3.333 3.333 0 0 1 3.334 3.334v10M5.833 10.833h8.334" })',
    'children: /* @__PURE__ */ jsx("path", { d: "M5 2h6a5 5 0 0 1 3.7 8.4A5 5 0 0 1 11 19H5V2Zm3 3v4h3a2 2 0 0 0 0-4H8Zm0 7v4h3a2 2 0 0 0 0-4H8Z", fill: "currentColor", stroke: "none" })',
  ],
  [
    'children:f("path",{d:"M5.833 16.667v-10a3.333 3.333 0 0 1 3.334-3.334h1.666a3.333 3.333 0 0 1 3.334 3.334v10M5.833 10.833h8.334"})',
    'children:f("path",{d:"M5 2h6a5 5 0 0 1 3.7 8.4A5 5 0 0 1 11 19H5V2Zm3 3v4h3a2 2 0 0 0 0-4H8Zm0 7v4h3a2 2 0 0 0 0-4H8Z",fill:"currentColor",stroke:"none"})',
  ],
  [
    "return `format('${parts.pop()}')`;",
    "const extension = parts.pop();\n      return `format('${extension === \"otf\" ? \"opentype\" : extension}')`;",
  ],
  [
    'try{let n=new URL(t).pathname.split(".");return n.length===1?"":`format(\'${n.pop()}\')`}catch',
    'try{let n=new URL(t).pathname.split(".");if(n.length===1)return"";let r=n.pop();return`format(\'${r==="otf"?"opentype":r}\')`}catch',
  ],
  [
    'uri: "/fonts/NotoSansCJKsc-Bold.otf"',
    'uri: globalThis.location.origin + "/fonts/NotoSansCJKsc-Bold.otf"',
  ],
  [
    'uri:"/fonts/NotoSansCJKsc-Bold.otf"',
    'uri:globalThis.location.origin+"/fonts/NotoSansCJKsc-Bold.otf"',
  ],
  [
    'uri: "/fonts/LXGWWenKaiGBLite-Regular.ttf"',
    'uri: globalThis.location.origin + "/fonts/LXGWWenKaiGBLite-Regular.ttf"',
  ],
  [
    'uri:"/fonts/LXGWWenKaiGBLite-Regular.ttf"',
    'uri:globalThis.location.origin+"/fonts/LXGWWenKaiGBLite-Regular.ttf"',
  ],
  [
    'var getFontString = ({\n  fontSize,\n  fontFamily\n}) => {\n  return `${fontSize}px ${getFontFamilyString({ fontFamily })}`;\n};',
    'var getFontString = ({\n  fontSize,\n  fontFamily,\n  customData\n}) => {\n  return `${customData?.unfoldBold ? "700 " : ""}${fontSize}px ${getFontFamilyString({ fontFamily })}`;\n};',
  ],
  [
    'Ee=({fontSize:e,fontFamily:t})=>`${e}px ${ea({fontFamily:t})}`',
    'Ee=({fontSize:e,fontFamily:t,customData:n})=>`${n?.unfoldBold?"700 ":""}${e}px ${ea({fontFamily:t})}`',
  ],
  [
    'text.setAttribute("font-family", getFontFamilyString(element));\n          text.setAttribute("font-size", `${element.fontSize}px`);',
    'text.setAttribute("font-family", getFontFamilyString(element));\n          text.setAttribute("font-size", `${element.fontSize}px`);\n          element.customData?.unfoldBold && text.setAttribute("font-weight", "700");',
  ],
  [
    '_.setAttribute("font-family",ea(e)),_.setAttribute("font-size",`${e.fontSize}px`)',
    '_.setAttribute("font-family",ea(e)),_.setAttribute("font-size",`${e.fontSize}px`),e.customData?.unfoldBold&&_.setAttribute("font-weight","700")',
  ],
  [
    'if (`${updatedTextElement.fontSize}px` !== editable2.style.fontSize) {\n      return true;\n    }\n    return false;',
    'if (`${updatedTextElement.fontSize}px` !== editable2.style.fontSize) {\n      return true;\n    }\n    return (editable2.style.fontWeight === "700") !== Boolean(updatedTextElement.customData?.unfoldBold);',
  ],
  [
    'return Xr({fontFamily:F.fontFamily})!==j||`${F.fontSize}px`!==O.style.fontSize',
    'return Xr({fontFamily:F.fontFamily})!==j||`${F.fontSize}px`!==O.style.fontSize||(O.style.fontWeight==="700")!==!!F.customData?.unfoldBold',
  ],
];

const migrations = [
  [
    'const onSelectCallback = useCallback3(\n      (value) => {\n        if (value) {\n          onSelect(value === FONT_FAMILY.Nunito && selectedFontFamily === value ? FONT_FAMILY.Helvetica : value);\n        }\n      },\n      [onSelect, selectedFontFamily]\n    );',
    'const onSelectCallback = useCallback3(\n      (value) => {\n        if (value) {\n          onSelect(value);\n        }\n      },\n      [onSelect]\n    );',
  ],
  [
    'let l=R2(()=>Uy,[]),s=P2(c=>{c&&r(c===Kr.Nunito&&o===c?Kr.Helvetica:c)},[r,o]);',
    'let l=R2(()=>Uy,[]),s=P2(c=>{c&&r(c)},[r]);',
  ],
  [
    'fontFamily: nextFontFamily,\n                  lineHeight: getLineHeight(nextFontFamily),\n                  ...(nextFontFamily === FONT_FAMILY.Nunito && oldElement.fontFamily !== nextFontFamily && oldElement.autoResize ? { autoResize: false, customData: { ...oldElement.customData, unfoldBoldAutoResize: true } } : oldElement.fontFamily === FONT_FAMILY.Nunito && nextFontFamily !== FONT_FAMILY.Nunito && oldElement.customData?.unfoldBoldAutoResize ? { autoResize: true, customData: { ...oldElement.customData, unfoldBoldAutoResize: undefined } } : {})',
    'fontFamily: nextFontFamily,\n                  lineHeight: getLineHeight(nextFontFamily)',
  ],
  [
    '{fontFamily:d,lineHeight:$o(d),...d===Kr.Nunito&&S.fontFamily!==d&&S.autoResize?{autoResize:!1,customData:{...S.customData,unfoldBoldAutoResize:!0}}:S.fontFamily===Kr.Nunito&&d!==Kr.Nunito&&S.customData?.unfoldBoldAutoResize?{autoResize:!0,customData:{...S.customData,unfoldBoldAutoResize:void 0}}:{}}',
    '{fontFamily:d,lineHeight:$o(d)}',
  ],
];

let applied = 0;
for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [before, after] of migrations) {
    if (!source.includes(before)) continue;
    source = source.replace(before, after);
    changed = true;
  }
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
const customFontsVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes('"小赖字体"') &&
    source.includes('"霞鹜文楷 GB"') &&
    source.includes("/fonts/LXGWWenKaiGBLite-Regular.ttf");
}).length;

const boldFontVerified = files.filter((file) =>
  fs.readFileSync(file, "utf8").includes('/fonts/NotoSansCJKsc-Bold.otf'),
).length;
const boldLabelVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes('testId: "font-family-bold"') || source.includes('testId:"font-family-bold"');
}).length;
const boldIconVerified = files.filter((file) =>
  fs.readFileSync(file, "utf8").includes("M5 2h6a5 5 0 0 1 3.7 8.4"),
).length;
const opentypeFormatVerified = files.filter((file) =>
  fs.readFileSync(file, "utf8").includes('"opentype"'),
).length;
const localFontOriginVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes('location.origin + "/fonts/NotoSansCJKsc-Bold.otf"') ||
    source.includes('location.origin+"/fonts/NotoSansCJKsc-Bold.otf"');
}).length;
const trueBoldVerified = files.filter((file) =>
  fs.readFileSync(file, "utf8").includes("unfoldBold"),
).length;

if (customFontsVerified !== 2 || boldFontVerified !== 2 || boldLabelVerified !== 2 || boldIconVerified !== 2 || opentypeFormatVerified !== 2 || localFontOriginVerified !== 2 || trueBoldVerified !== 4) {
  throw new Error(`Excalidraw font patch verification failed (${applied} replacements applied)`);
}
