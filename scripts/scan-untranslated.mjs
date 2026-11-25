#!/usr/bin/env node
// 漏翻深度扫描：把界面包里所有“像界面文案”的字符串交给真实翻译函数逐条判断。
//
// 旧版只认 `label:"..."` 这类字面量写法，会漏掉三种情况：
//   1. 先赋给变量再使用：S = cond ? "Switch to RTL text direction" : "...";  tooltip: S
//   2. 模板字符串：`Couldn't connect to ${host}`、`Enable Word Wrap${shortcut}`
//   3. JSX 拆段文本：createElement(..., "Clearing cookies and site data for ", host, "...")
// 新版不看属性名，直接扫描全部双引号、单引号和模板字面量，模板里的 ${...} 用样例值代入后再判断。
//
// 用法：
//   node scripts/scan-untranslated.mjs                 扫描本机已生成的界面包
//   node scripts/scan-untranslated.mjs --bundle <路径>  指定界面包
//   node scripts/scan-untranslated.mjs --all           不使用忽略清单（查看全部未覆盖）
//   node scripts/scan-untranslated.mjs --add-ignore    把本次全部未覆盖项加入忽略清单
//                                                      （只在逐条人工确认都不需要翻译之后使用）
// 输出：scripts/uncovered-ui.json（已加入 .gitignore），界面相关的排在前面。
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const bundlePath = argValue("--bundle") || path.join(appData, "Antigravity", "agy_zhcn_ui_main.js");
const ignorePath = path.join(root, "config", "scan-ignore.json");
const outPath = path.join(root, "scripts", "uncovered-ui.json");

if (!fs.existsSync(bundlePath)) {
  console.error(`找不到界面包：${bundlePath}\n先运行一次汉化（或 npm run hot-update），或用 --bundle 指定路径。`);
  process.exit(1);
}
const code = fs.readFileSync(bundlePath, "utf8");
const dict = JSON.parse(fs.readFileSync(path.join(root, "config", "dom-translations.json"), "utf8"));
const ignoreFile = fs.existsSync(ignorePath) ? JSON.parse(fs.readFileSync(ignorePath, "utf8")) : { strings: [] };
const ignored = new Set(args.includes("--all") ? [] : ignoreFile.strings);

// 用运行时同一套翻译逻辑（精确、正则句式、时长句式、大小写折叠）判断是否已覆盖
const { createRuntimeOverlay } = await import(pathToFileURL(path.join(root, "src", "lib", "translator.mjs")).href);
const sandbox = {
  document: { readyState: "loading", documentElement: { lang: "en" }, addEventListener() {} },
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
  MutationObserver: class { observe() {} },
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
vm.runInNewContext(createRuntimeOverlay({ exact: dict.exact, patterns: dict.patterns }), sandbox);
const translate = sandbox.__AGY_ZHCN_TRANSLATE_VALUE__;

const PLACEHOLDER = "\u0000";
// 模板里的变量依次代入几种常见样例，任一样例能翻译就算已覆盖
const SAMPLES = ["Sample", "3", "main.py", " (Alt+Z)", ""];
const isCovered = (text) => {
  if (!text.includes(PLACEHOLDER)) return translate(text) !== null;
  return SAMPLES.some((sample) => translate(text.split(PLACEHOLDER).join(sample).replace(/\s+/g, " ").trim()) !== null);
};

const LIBRARY_NOISE =
  /\b(colou?r|foreground|background|border|editor|minimap|scrollbar|gutter|ruler|merge-conflict|diff editor|token|bracket|indentation|cursor|selection|layout|graph|node|edge|port|spacing|hierarch|regex|lookahead|unicode|code point|KaTeX|ELK|Lexical|reducer|middleware|dispatch|iframe|sandbox|postMessage|polyomino|spanning tree|force model|Eades|scanline|hitbox|knot vector|quirks mode|React|Expected|expects?|must be|is not defined|Invalid|Unexpected|deprecated|not supported in this browser|Cannot|Uncaught|TypeError|safe area|BCP 47|IANA|bitmap|prewarm|render task|compaction|crossing minimi|layer(?:ing|er)|Immer|Ecore|Registry)\b/i;
const UI_HINT =
  /(tooltip|label|title|aria|placeholder|description|subtitle|message|text|content|heading|caption|children|createElement|toast|confirm|button|empty|status|header|hint|alt)\b[^;]{0,60}$|[?:]\s*$|,\s*$|\(\s*$/;
const LOG_HINT = /(console\.\w+|new Error|Error\(|throw |logger\.|\.(?:log|warn|error|debug)\(|reject\(|assert|invariant|recordError|reportError)[^;]{0,50}$/;

const looksLikeUiText = (text) => {
  const plain = text.split(PLACEHOLDER).join(" ").replace(/\s+/g, " ").trim();
  if (!/^[A-Z][a-z']/.test(plain)) return false;
  const words = plain.split(" ");
  if (words.length < 2 || words.length > 24) return false;
  if (!/^[A-Za-z0-9 ,.'’"“”:;!?()\-/&…·—–+%#@]+$/.test(plain)) return false;
  if (/[a-z][A-Z]|_[a-z]|\.(?:js|ts|tsx|json|md|css)\b|https?:|\\[nu]/.test(plain)) return false;
  return !LIBRARY_NOISE.test(plain);
};

const found = new Map(); // 文本 -> 前文片段
const remember = (text, index) => {
  text = text.replace(/^\s+|\s+$/g, "");
  if (!text || found.has(text) || ignored.has(text) || !looksLikeUiText(text)) return;
  found.set(text, code.slice(Math.max(0, index - 80), index).replace(/\s+/g, " "));
};

// 双引号、单引号字面量
for (const m of code.matchAll(/"((?:[^"\\\n]|\\.){3,220})"|'((?:[^'\\\n]|\\.){3,220})'/g)) {
  remember((m[1] ?? m[2]).replace(/\\u2026/g, "…").replace(/\\(["'])/g, "$1"), m.index);
}
// 模板字面量：${...} 换成占位符（支持一层嵌套花括号）
for (const m of code.matchAll(/`([^`]{3,260})`/g)) {
  const text = m[1]
    .replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, PLACEHOLDER)
    .replace(/\\u2026/g, "…");
  if (text.includes("${") || text.includes("\n")) continue;
  remember(text, m.index);
}

const results = [];
for (const [text, before] of found) {
  if (isCovered(text)) continue;
  const kind = LOG_HINT.test(before) ? "log" : UI_HINT.test(before) ? "ui" : "unknown";
  results.push({ text: text.split(PLACEHOLDER).join("${…}"), kind, before: before.slice(-60) });
}
const order = { ui: 0, unknown: 1, log: 2 };
results.sort((a, b) => order[a.kind] - order[b.kind] || a.text.localeCompare(b.text));

if (args.includes("--add-ignore")) {
  const merged = new Set([...(ignoreFile.strings || []), ...[...found.keys()].filter((t) => !isCovered(t))]);
  ignoreFile.strings = [...merged].sort();
  fs.writeFileSync(ignorePath, JSON.stringify(ignoreFile, null, 2) + "\n", "utf8");
  console.log(`已把 ${merged.size} 条写入忽略清单 ${path.relative(root, ignorePath)}`);
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n", "utf8");
const count = (k) => results.filter((r) => r.kind === k).length;
console.log(`界面包：${bundlePath}`);
console.log(`像界面文案的字符串 ${found.size} 条（已排除忽略清单 ${ignored.size} 条），未覆盖 ${results.length} 条：`);
console.log(`  界面 ${count("ui")} · 不确定 ${count("unknown")} · 日志/报错 ${count("log")}`);
console.log(`明细已写入 ${path.relative(root, outPath)}，前 40 条：`);
for (const r of results.slice(0, 40)) console.log(`  [${r.kind}] ${r.text}`);
