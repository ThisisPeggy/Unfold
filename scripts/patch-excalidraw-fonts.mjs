import fs from "node:fs";
import path from "node:path";

const root = path.resolve("node_modules/@excalidraw/excalidraw/dist");
const viteRoot = path.resolve("node_modules/.vite/deps");

// Collect all JS files to patch
const files = [];

// Try Vite cache first (for local development)
if (fs.existsSync(viteRoot)) {
  const viteFiles = fs.readdirSync(viteRoot)
    .filter((name) => (name.startsWith("@excalidraw_excalidraw") || name.startsWith("chunk-")) && name.endsWith(".js"))
    .map((name) => path.join(viteRoot, name));
  files.push(...viteFiles);
}

// Add dev files if they exist (for Vercel builds)
const devDir = path.join(root, "dev");
if (fs.existsSync(devDir)) {
  files.push(
    ...fs.readdirSync(devDir)
      .filter((name) => name.endsWith(".js"))
      .map((name) => path.join(devDir, name)),
  );
}

// Add prod files (for production builds)
const prodDir = path.join(root, "prod");
if (fs.existsSync(prodDir)) {
  const prodFiles = fs.readdirSync(prodDir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(prodDir, name));
  files.push(...prodFiles);
}

for (const build of ["dev", "prod"]) {
  const localeDir = path.join(root, build, "locales");
  if (!fs.existsSync(localeDir)) continue;
  files.push(
    ...fs.readdirSync(localeDir)
      .filter((name) => name.startsWith("zh-CN-") && name.endsWith(".js"))
      .map((name) => path.join(localeDir, name)),
  );
}

if (files.length === 0) {
  console.warn("Warning: No Excalidraw dist files found to patch.");
  console.warn("This might be normal during initial install. Skipping patch.");
  process.exit(0);
}

const patches = [
  [
    `            /* @__PURE__ */ jsx70(
              DropdownMenu_default.Item,
              {
                onSelect: () => app.setActiveTool({ type: "laser" }),
                icon: laserPointerToolIcon,
                "data-testid": "toolbar-laser",
                selected: laserToolSelected,
                shortcut: KEYS.K.toLocaleUpperCase(),
                children: t("toolBar.laser")
              }
            ),
`,
    ``,
  ],
  [
    `        if (event.key === KEYS.K && !event.altKey && !event[KEYS.CTRL_OR_CMD]) {
          if (this.state.activeTool.type === "laser") {
            this.setActiveTool({ type: "selection" });
          } else {
            this.setActiveTool({ type: "laser" });
          }
          return;
        }
`,
    ``,
  ],
  [
    `                /* @__PURE__ */ jsx92(Shortcut, { label: t("toolBar.laser"), shortcuts: [KEYS.K] }),
`,
    ``,
  ],
  [
    `              isCollaborating && /* @__PURE__ */ jsx137(
                Island,
                {
                  style: {
                    marginLeft: 8,
                    alignSelf: "center",
                    height: "fit-content"
                  },
                  children: /* @__PURE__ */ jsx137(
                    LaserPointerButton,
                    {
                      title: t("toolBar.laser"),
                      checked: appState.activeTool.type === TOOL_TYPE.laser,
                      onChange: () => app.setActiveTool({ type: TOOL_TYPE.laser }),
                      isMobile: true
                    }
                  )
                }
              )
`,
    ``,
  ],
  [
    'Me(Ce.Item,{onSelect:()=>t.setActiveTool({type:"laser"}),icon:ql,"data-testid":"toolbar-laser",selected:l,shortcut:y.K.toLocaleUpperCase(),children:g("toolBar.laser")}),',
    '',
  ],
  [
    'if(t.key===y.K&&!t.altKey&&!t[y.CTRL_OR_CMD]){this.state.activeTool.type==="laser"?this.setActiveTool({type:"selection"}):this.setActiveTool({type:"laser"});return}',
    '',
  ],
  [
    'B(U,{label:g("toolBar.laser"),shortcuts:[y.K]}),',
    '',
  ],
  [
    'x&&Z(Qe,{style:{marginLeft:8,alignSelf:"center",height:"fit-content"},children:Z(X0,{title:g("toolBar.laser"),checked:o.activeTool.type===kt.laser,onChange:()=>b.setActiveTool({type:kt.laser}),isMobile:!0})})',
    '',
  ],
  [
    `\t\t\t\t\t/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenu_default.Item, {
\t\t\t\t\t\tonSelect: () => app.setActiveTool({ type: "laser" }),
\t\t\t\t\t\ticon: laserPointerToolIcon,
\t\t\t\t\t\t"data-testid": "toolbar-laser",
\t\t\t\t\t\tselected: laserToolSelected,
\t\t\t\t\t\tshortcut: KEYS.K.toLocaleUpperCase(),
\t\t\t\t\t\tchildren: t("toolBar.laser")
\t\t\t\t\t}),
`,
    ``,
  ],
  [
    `\t\t\tif (event.key === KEYS.K && !event.altKey && !event[KEYS.CTRL_OR_CMD]) {
\t\t\t\tif (this.state.activeTool.type === "laser") this.setActiveTool({ type: "selection" });
\t\t\t\telse this.setActiveTool({ type: "laser" });
\t\t\t\treturn;
\t\t\t}
`,
    ``,
  ],
  [
    `\t\t\t\t\t\t/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shortcut, {
\t\t\t\t\t\t\tlabel: t("toolBar.laser"),
\t\t\t\t\t\t\tshortcuts: [KEYS.K]
\t\t\t\t\t\t}),
`,
    ``,
  ],
  [
    `, isCollaborating && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Island, {
\t\t\t\t\t\t\t\t\tstyle: {
\t\t\t\t\t\t\t\t\t\tmarginLeft: 8,
\t\t\t\t\t\t\t\t\t\talignSelf: "center",
\t\t\t\t\t\t\t\t\t\theight: "fit-content"
\t\t\t\t\t\t\t\t\t},
\t\t\t\t\t\t\t\t\tchildren: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LaserPointerButton, {
\t\t\t\t\t\t\t\t\t\ttitle: t("toolBar.laser"),
\t\t\t\t\t\t\t\t\t\tchecked: appState.activeTool.type === TOOL_TYPE.laser,
\t\t\t\t\t\t\t\t\t\tonChange: () => app.setActiveTool({ type: TOOL_TYPE.laser }),
\t\t\t\t\t\t\t\t\t\tisMobile: true
\t\t\t\t\t\t\t\t\t})
\t\t\t\t\t\t\t\t})`,
    ``,
  ],
  [
    `, isCollaborating && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Island, {
						style: {
							marginLeft: 8,
							alignSelf: "center",
							height: "fit-content"
						},
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LaserPointerButton, {
							title: t("toolBar.laser"),
							checked: appState.activeTool.type === TOOL_TYPE.laser,
							onChange: () => app.setActiveTool({ type: TOOL_TYPE.laser }),
							isMobile: true
						})
					})`,
    ``,
  ],
  [
    `var DEFAULT_CANVAS_BACKGROUND_PICKS = [
  COLOR_PALETTE.white,
  // radix slate2
`,
    `var DEFAULT_CANVAS_BACKGROUND_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.white,
  // radix slate2
`,
  ],
  [
    `var DEFAULT_CANVAS_BACKGROUND_PICKS = [
	COLOR_PALETTE.white,
	"#f8f9fa",`,
    `var DEFAULT_CANVAS_BACKGROUND_PICKS = [
	COLOR_PALETTE.black,
	COLOR_PALETTE.white,
	"#f8f9fa",`,
  ],
  [
    'Q9=[Z.white,"#f8f9fa","#f5faff","#fffce8","#fdf8f6"]',
    'Q9=[Z.black,Z.white,"#f8f9fa","#f5faff","#fffce8","#fdf8f6"]',
  ],
  [
    'isCollaborating && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Island, {',
    'false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Island, {',
  ],
  [
    `var DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_STROKE_COLOR_INDEX]
];`,
    `var DEFAULT_ELEMENT_STROKE_PICKS = ["#37352f", "#d44c47", "#448361", "#337ea9", "#a56a3a"];`,
  ],
  [
    `var DEFAULT_ELEMENT_BACKGROUND_PICKS = [
  COLOR_PALETTE.transparent,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX]
];`,
    `var DEFAULT_ELEMENT_BACKGROUND_PICKS = ["transparent", "#fdebec", "#edf3ec", "#e7f3f8", "#fbf3db"];`,
  ],
  [
    'Z.black,Z.red[fo],Z.green[fo],Z.blue[fo],Z.yellow[fo]',
    '"#37352f","#d44c47","#448361","#337ea9","#a56a3a"',
  ],
  [
    'Z.transparent,Z.red[po],Z.green[po],Z.blue[po],Z.yellow[po]',
    '"transparent","#fdebec","#edf3ec","#e7f3f8","#fbf3db"',
  ],
  ['stroke: "\\u63CF\\u8FB9"', 'stroke: "\\u989C\\u8272"'],
  ['stroke:"\\u63CF\\u8FB9"', 'stroke:"\\u989C\\u8272"'],
  ['background: "\\u80CC\\u666F"', 'background: "\\u586B\\u5145\\u989C\\u8272"'],
  ['background:"\\u80CC\\u666F"', 'background:"\\u586B\\u5145\\u989C\\u8272"'],
  ['strokeWidth: "\\u63CF\\u8FB9\\u5BBD\\u5EA6"', 'strokeWidth: "\\u7EBF\\u6761\\u7C97\\u7EC6"'],
  ['strokeWidth:"\\u63CF\\u8FB9\\u5BBD\\u5EA6"', 'strokeWidth:"\\u7EBF\\u6761\\u7C97\\u7EC6"'],
  ['strokeStyle: "\\u8FB9\\u6846\\u6837\\u5F0F"', 'strokeStyle: "\\u7EBF\\u6761\\u6837\\u5F0F"'],
  ['strokeStyle:"\\u8FB9\\u6846\\u6837\\u5F0F"', 'strokeStyle:"\\u7EBF\\u6761\\u6837\\u5F0F"'],
  ['sloppiness: "\\u7EBF\\u6761\\u98CE\\u683C"', 'sloppiness: "\\u624B\\u7ED8\\u7A0B\\u5EA6"'],
  ['sloppiness:"\\u7EBF\\u6761\\u98CE\\u683C"', 'sloppiness:"\\u624B\\u7ED8\\u7A0B\\u5EA6"'],
  ['textAlign: "\\u6587\\u672C\\u5BF9\\u9F50"', 'textAlign: "\\u5BF9\\u9F50"'],
  ['textAlign:"\\u6587\\u672C\\u5BF9\\u9F50"', 'textAlign:"\\u5BF9\\u9F50"'],
  ['edges: "\\u8FB9\\u89D2"', 'edges: "\\u5706\\u89D2"'],
  ['edges:"\\u8FB9\\u89D2"', 'edges:"\\u5706\\u89D2"'],
  ['fontSize: "\\u5B57\\u4F53\\u5927\\u5C0F"', 'fontSize: "\\u5B57\\u53F7"'],
  ['fontSize:"\\u5B57\\u4F53\\u5927\\u5C0F"', 'fontSize:"\\u5B57\\u53F7"'],
  ['clearReset: "\\u91CD\\u7F6E\\u753B\\u5E03"', 'clearReset: "\\u6E05\\u7A7A\\u753B\\u5E03"'],
  ['clearReset:"\\u91CD\\u7F6E\\u753B\\u5E03"', 'clearReset:"\\u6E05\\u7A7A\\u753B\\u5E03"'],
  ['clearReset: "\\u6E05\\u7A7A\\u753B\\u5E03\\u2026"', 'clearReset: "\\u6E05\\u7A7A\\u753B\\u5E03"'],
  ['clearReset:"\\u6E05\\u7A7A\\u753B\\u5E03\\u2026"', 'clearReset:"\\u6E05\\u7A7A\\u753B\\u5E03"'],
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

const iconPatches = [
  ["M4.167 10h11.666", "M3 10h14"],
  ["M5 10h10", "M3 10h14"],
  ["M5 12h2", "M4 12h4"],
  ["M11 12h2", "M10 12h4"],
  ["M17 12h2", "M16 12h4"],
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
  for (const [before, after] of iconPatches) {
    if (!source.includes(before)) continue;
    source = source.replaceAll(before, after);
    applied += 1;
    changed = true;
  }
  for (const [before, after] of patches) {
    if (after && source.includes(after)) continue;
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
const propertyLabelsVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes("\\u624B\\u7ED8\\u7A0B\\u5EA6") &&
    source.includes("clearReset") &&
    source.includes("\\u6E05\\u7A7A\\u753B\\u5E03") &&
    !source.includes("\\u6E05\\u7A7A\\u753B\\u5E03\\u2026");
}).length;
const authoredPaletteVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes('"#37352f"') &&
    source.includes('"#fdebec"') &&
    source.includes('"#fbf3db"');
}).length;
const propertyIconsVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes("M3 10h14") &&
    source.includes("M4 12h4") &&
    source.includes("M16 12h4");
}).length;
const laserRemovedVerified = files.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes("toolBar.mermaidToExcalidraw") &&
    !source.includes('data-testid="toolbar-laser"') &&
    !source.includes('data-testid:`toolbar-laser`');
}).length;

// Verification - require at least 1 instance of each critical patch
const minRequired = {
  customFonts: 1,
  boldFont: 1,
  boldLabel: 1,
  boldIcon: 1,
  opentypeFormat: 1,
  localFontOrigin: 1,
  trueBold: 2,
  propertyLabels: 2,
  authoredPalette: 2,
  propertyIcons: 2,
  laserRemoved: 2,
};

const verificationResults = {
  customFonts: customFontsVerified,
  boldFont: boldFontVerified,
  boldLabel: boldLabelVerified,
  boldIcon: boldIconVerified,
  opentypeFormat: opentypeFormatVerified,
  localFontOrigin: localFontOriginVerified,
  trueBold: trueBoldVerified,
  propertyLabels: propertyLabelsVerified,
  authoredPalette: authoredPaletteVerified,
  propertyIcons: propertyIconsVerified,
  laserRemoved: laserRemovedVerified,
};

const failures = Object.entries(minRequired).filter(
  ([key, min]) => verificationResults[key] < min
);

if (failures.length > 0) {
  console.error("Excalidraw font patch verification failed:");
  console.error("Applied replacements:", applied);
  console.error("Verification results:", verificationResults);
  console.error("Failed checks:", failures.map(([key]) => key).join(", "));
  throw new Error(
    `Font patch verification failed. Missing: ${failures.map(([key]) => key).join(", ")}`
  );
}

console.log("✓ Excalidraw font patch applied successfully");
console.log("  Applied replacements:", applied);
console.log("  Verification:", Object.entries(verificationResults).map(([k, v]) => `${k}=${v}`).join(", "));
