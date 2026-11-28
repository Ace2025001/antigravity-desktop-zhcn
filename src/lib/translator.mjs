import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";
import { languageFile } from "./language-pack.mjs";
import { KEEP_ORIGINAL_NAMES } from "./auto-learned-dict.mjs";
import { readMaxCompatibleAppVersion } from "./self-update.mjs";

const DEFAULT_PACK_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    return typeof pkg?.version === "string" && pkg.version.trim() ? pkg.version.trim() : "3.1.7";
  } catch {
    return "3.1.7";
  }
})();

const DEFAULT_MAX_APP_VERSION = readMaxCompatibleAppVersion() || "";

export async function loadDomTranslations() {
  const filePath = languageFile("dom-translations.json");
  const data = JSON.parse(await readFile(filePath, "utf8"));
  if (
    data.schemaVersion !== 2 ||
    !data.exact ||
    typeof data.exact !== "object" ||
    !Array.isArray(data.patterns)
  ) {
    throw new Error("DOM 翻译词典格式无效。");
  }
  for (const pattern of data.patterns) {
    if (
      !pattern ||
      typeof pattern.source !== "string" ||
      typeof pattern.target !== "string" ||
      typeof pattern.flags !== "string"
    ) {
      throw new Error("DOM 动态翻译规则格式无效。");
    }
    try {
      new RegExp(pattern.source, pattern.flags);
    } catch {
      throw new Error(`DOM 动态翻译规则无效：${pattern.source}`);
    }
  }
  return data;
}

function normalizePatternTarget(target) {
  return typeof target === "string" ? target.replace(/\\(\d)/g, "$$$1") : target;
}

function compilePatternTranslations(dictionary) {
  return (dictionary.patterns ?? []).map(({ source, target, flags = "u" }) => ({
    regex: new RegExp(source, flags),
    target: normalizePatternTarget(target),
  }));
}

function fastAnchorReplace(source, anchor, regex, replacement) {
  if (!source.includes(anchor)) return source;
  if (source.length < 65536) return source.replace(regex, replacement);
  const isGlobal = regex.global;
  const singleRegex = isGlobal ? new RegExp(regex.source, regex.flags.replace("g", "")) : regex;
  let result = "";
  let cursor = 0;
  let searchPos = 0;
  while (true) {
    const hit = source.indexOf(anchor, searchPos);
    if (hit === -1) {
      result += source.slice(cursor);
      break;
    }
    let winStart = Math.max(cursor, hit - 600);
    while (winStart > cursor && /[a-zA-Z0-9_$]/.test(source[winStart - 1])) {
      winStart--;
    }
    let winEnd = Math.min(source.length, hit + anchor.length + 6000);
    while (winEnd < source.length && /[a-zA-Z0-9_$]/.test(source[winEnd])) {
      winEnd++;
    }
    const slice = source.slice(winStart, winEnd);
    const m = singleRegex.exec(slice);
    if (m) {
      const absStart = winStart + m.index;
      const absEnd = absStart + m[0].length;
      const repPiece = m[0].replace(singleRegex, replacement);
      result += source.slice(cursor, absStart) + repPiece;
      cursor = absEnd;
      searchPos = Math.max(absEnd, hit + 1);
      if (!isGlobal) {
        result += source.slice(cursor);
        break;
      }
    } else {
      searchPos = hit + 1;
    }
  }
  return result;
}

export function formatPlanTermsToChinese(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\bUltra and paid Pro\b/gi, "Ultra 及付费 Pro")
    .replace(/\bpaid Pro and Ultra\b/gi, "付费 Pro 及 Ultra")
    .replace(/\bPro and Ultra\b/gi, "Pro 及 Ultra")
    .replace(/\bUltra and Pro\b/gi, "Ultra 及 Pro")
    .replace(/\bpaid Pro\b/gi, "付费 Pro")
    .replace(/\bpaid Ultra\b/gi, "付费 Ultra")
    .replace(/\bFree users and Google AI Plus\b/gi, "免费用户与 Google AI Plus")
    .replace(/\bFree and Google AI Plus\b/gi, "免费与 Google AI Plus")
    .replace(/\bGoogle AI Plus and Free\b/gi, "Google AI Plus 与免费")
    .replace(/\bFree users\b/gi, "免费用户")
    .replace(/\bFree user\b/gi, "免费用户")
    .replace(/\bor above\b/gi, "或更高方案")
    .replace(/\bor higher\b/gi, "或更高方案");
}

export function formatEnglishDateToChinese(str) {
  if (typeof str !== "string") return str;
  const monthMap = {
    January: "1", February: "2", March: "3", April: "4",
    May: "5", June: "6", July: "7", August: "8",
    September: "9", October: "10", November: "11", December: "12",
    Jan: "1", Feb: "2", Mar: "3", Apr: "4",
    Jun: "6", Jul: "7", Aug: "8", Sep: "9", Sept: "9", Oct: "10", Nov: "11", Dec: "12"
  };
  let result = str.replace(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})\b/gi,
    function(_, month, day, year) {
      const m = monthMap[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()] || month;
      return year + " 年 " + m + " 月 " + day + " 日";
    }
  ).replace(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec),?\s*(\d{4})\b/gi,
    function(_, day, month, year) {
      const m = monthMap[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()] || month;
      return year + " 年 " + m + " 月 " + day + " 日";
    }
  ).replace(/(\d+ 日)\s+(起|从|前|后)/g, "$1$2");
  return formatPlanTermsToChinese(result);
}

export function formatDurationToChinese(dur) {
  if (typeof dur !== "string") return String(dur ?? "");
  var s = dur.trim().replace(/[。.]+$/, "").trim();
  if (/^<\s*1\s*m(?:ins?|inutes?)?$/i.test(s)) return "1 分钟内";
  if (/^<\s*1\s*s(?:ecs?|econds?)?$/i.test(s)) return "1 秒内";
  return s
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*ms(?![A-Za-z])/gi, "$1 毫秒")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*mo(?:nths?)?(?![A-Za-z])/gi, "$1 个月")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*y(?:(?:ea)?rs?)?(?![A-Za-z])/gi, "$1 年")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*w(?:(?:ee)?ks?)?(?![A-Za-z])/gi, "$1 周")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*d(?:ays?)?(?![A-Za-z])/gi, "$1 天")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*h(?:(?:ou)?rs?)?(?![A-Za-z])/gi, "$1 小时")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*m(?:ins?|inutes?)?(?![A-Za-z])/gi, "$1 分钟")
    .replace(/(?<![A-Za-z])(\d+(?:\.\d+)?)\s*s(?:ecs?|econds?)?(?![A-Za-z])/gi, "$1 秒")
    .replace(/(\d+)(毫秒|个月|年|周|天|小时|分钟|秒)/g, "$1 $2")
    .replace(/(毫秒|个月|年|周|天|小时|分钟|秒)(?:[,，]\s*|\s*)(?=\d)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

export function translateDynamicDurationText(normalizedCore, lookupFn) {
  var lookup = typeof lookupFn === "function" ? lookupFn : function () { return null; };
  var m = normalizedCore.match(/^Individual quota reached\.\s+Please upgrade your subscription to increase your limits\.\s+Resets in\s+(.+?)\.?$/i);
  if (m) {
    var d1 = formatDurationToChinese(m[1]);
    return "已达到个人配额上限。请升级订阅以提高配额。配额将于 " + d1 + (d1.endsWith("内") ? "重置。" : "后重置。");
  }
  m = normalizedCore.match(/^You have used (some|all) of your (.+?) limit, it will fully refresh in\s+(.+?)\.?$/i);
  if (m) {
    var d2 = formatDurationToChinese(m[3]);
    var kindRaw = m[2].trim();
    var kind = /^weekly$/i.test(kindRaw)
      ? "每周"
      : " " + kindRaw.replace(/^(\d+)-hour$/i, "$1 小时");
    var verb = m[1].toLowerCase() === "all" ? "你已用尽所有" : "你已使用部分";
    return (verb + kind + "配额，将在 " + d2 + (d2.endsWith("内") ? "完全恢复。" : "后完全恢复。")).replace(/\s{2,}/g, " ");
  }
  m = normalizedCore.match(/^(?:Worked for|工作耗时)\s+(.+?)\s*(?:\u00b7|·)\s*(\d+)\s*(?:updates?|条(?:进度)?更新)$/i);
  if (m) return "工作耗时 " + formatDurationToChinese(m[1]) + " · " + m[2] + " 条进度更新";
  m = normalizedCore.match(/^(?:Stopped after|耗时后停止)\s+(.+?)\s*(?:\u00b7|·)\s*(\d+)\s*(?:updates?|条(?:进度)?更新)$/i);
  if (m) return "耗时 " + formatDurationToChinese(m[1]) + "后停止 · " + m[2] + " 条进度更新";
  m = normalizedCore.match(/^Worked for\s+(.+)$/i);
  if (m) return "工作耗时 " + formatDurationToChinese(m[1]);
  m = normalizedCore.match(/^Stopped after\s+(.+)$/i);
  if (m) return "耗时 " + formatDurationToChinese(m[1]) + "后停止";
  m = normalizedCore.match(/^Model unavailable, retrying in\s+(.+?)(\.{3}|…)?$/i);
  if (m && /(?:\d|<)/.test(m[1])) {
    var d3 = formatDurationToChinese(m[1]);
    return "模型暂不可用，将在 " + d3 + (d3.endsWith("内") ? "重试" : "后重试") + (m[2] || "");
  }
  m = normalizedCore.match(/^(.+?)[,，]\s*[Rr]esets in\s*(.+?)\.?$/);
  if (m && /(?:\d|<)/.test(m[2])) {
    var prefixZh = lookup(m[1].trim());
    var prefix = prefixZh !== null ? prefixZh : m[1].trim();
    var d4 = formatDurationToChinese(m[2]);
    return prefix + "，将在 " + d4 + (d4.endsWith("内") ? "重置" : "后重置");
  }
  m = normalizedCore.match(/^[Rr]esets in\s*(.+?)\.?$/);
  if (m && /(?:\d|<)/.test(m[1])) {
    var d5 = formatDurationToChinese(m[1]);
    return "将在 " + d5 + (d5.endsWith("内") ? "重置" : "后重置");
  }
  m = normalizedCore.match(/^(Fully\s+)?[Rr]efreshes in\s+(.+?)\.?$/);
  if (m && /(?:\d|<)/.test(m[2])) {
    var d6 = formatDurationToChinese(m[2]);
    return "将在 " + d6 + (d6.endsWith("内") ? "" : "后") + (m[1] ? "完全恢复" : "刷新");
  }
  m = normalizedCore.match(/^Expires\s+in\s+(.+?)\.?$/i);
  if (m && /(?:\d|<)/.test(m[1])) {
    var d7 = formatDurationToChinese(m[1]);
    return d7 + (d7.endsWith("内") ? "过期" : "后过期");
  }
  m = normalizedCore.match(/^Waiting for (.+?) timer,\s*(\d+)\s*tasks?\s*running$/i);
  if (m && /\d/.test(m[1])) {
    return "正在等待 " + formatDurationToChinese(m[1]) + "定时器，" + m[2] + " 个任务运行中";
  }
  m = normalizedCore.match(/^Waiting for (.+?) timer\s*(?:\u00b7|·)\s*(.+?)\s+left$/i);
  if (m && /\d/.test(m[1]) && /\d/.test(m[2])) {
    return "正在等待 " + formatDurationToChinese(m[1]) + "定时器 · 剩余 " + formatDurationToChinese(m[2]);
  }
  m = normalizedCore.match(/^(.+?) timer:\s*Timer has expired$/i);
  if (m && /\d/.test(m[1])) {
    return formatDurationToChinese(m[1]) + "定时器：定时器已到期";
  }
  m = normalizedCore.match(/^No more older messages,\s*showing\s*(\d+)\s*of\s*(\d+)$/i);
  if (m) {
    return "没有更多早期消息，已显示 " + m[1] + " / " + m[2] + " 条";
  }
  m = normalizedCore.match(/^Select (project|model), current:\s*(.+)$/);
  if (m) {
    var cur = m[2];
    var curZh = lookup(cur);
    if (curZh === null && (cur === "No Project" || cur === "No project selected")) curZh = "未选择项目";
    var label = m[1] === "project" ? "选择项目，当前：" : "选择模型，当前：";
    return label + (curZh !== null ? curZh : cur);
  }
  return null;
}

const __caseFoldCache = new WeakMap();

function isCaseFoldKeyEligible(text) {
  return (
    typeof text === "string" &&
    text.length >= 4 &&
    text.length <= 240 &&
    !/[\r\n]/.test(text) &&
    /\s/.test(text) &&
    /^[A-Za-z]/.test(text) &&
    /[a-z]/.test(text)
  );
}

function getLowerMultiWordIndex(exactDict) {
  if (!exactDict || typeof exactDict !== "object") return null;
  let index = __caseFoldCache.get(exactDict);
  if (index) return index;
  index = new Map();
  for (const [k, v] of Object.entries(exactDict)) {
    if (typeof v === "string" && isCaseFoldKeyEligible(k)) {
      const lk = k.toLowerCase();
      if (!index.has(lk)) index.set(lk, v);
    }
  }
  __caseFoldCache.set(exactDict, index);
  return index;
}

function lookupCaseInsensitiveMultiWord(indexMap, normalizedCore) {
  if (
    !indexMap ||
    !/^[A-Z]/.test(normalizedCore) ||
    !isCaseFoldKeyEligible(normalizedCore)
  ) {
    return null;
  }
  const hit = indexMap.get(normalizedCore.toLowerCase());
  return hit !== undefined ? hit : null;
}

export function translateDictionaryValue(value, dictionary) {
  if (typeof value !== "string" || value.length === 0) return null;
  const leading = value.match(/^\s*/u)?.[0] ?? "";
  const trailing = value.match(/\s*$/u)?.[0] ?? "";
  const coreEnd = value.length - trailing.length;
  const core = value.slice(leading.length, coreEnd);
  let exact = dictionary?.exact?.[core];
  if (exact !== undefined) return leading + exact + trailing;

  const normalizedCore = core.replace(/\s+/g, " ");
  if (normalizedCore !== core) {
    exact = dictionary?.exact?.[normalizedCore];
    if (exact !== undefined) return leading + exact + trailing;
  }

  const durHit = translateDynamicDurationText(normalizedCore, (k) => {
    const v = dictionary?.exact?.[k];
    return v !== undefined ? v : null;
  });
  if (durHit !== null) return leading + durHit + trailing;

  for (const { regex, target } of compilePatternTranslations(dictionary)) {
    regex.lastIndex = 0;
    if (regex.test(core)) {
      regex.lastIndex = 0;
      return leading + formatEnglishDateToChinese(core.replace(regex, target)) + trailing;
    }
    if (normalizedCore !== core && regex.test(normalizedCore)) {
      regex.lastIndex = 0;
      return leading + formatEnglishDateToChinese(normalizedCore.replace(regex, target)) + trailing;
    }
  }

  const caseFoldHit = lookupCaseInsensitiveMultiWord(
    getLowerMultiWordIndex(dictionary?.exact),
    normalizedCore,
  );
  if (caseFoldHit !== null) return leading + caseFoldHit + trailing;

  return null;
}

export function countBundleDictionaryHits(bundleText, dictionary) {
  let hits = 0;
  for (const source of Object.keys(dictionary.exact)) {
    if (bundleText.includes(source)) {
      hits += 1;
    }
  }
  return {
    hits,
    total: Object.keys(dictionary.exact).length,
  };
}

export function createRuntimeOverlay(dictionary) {
  const packVersion = (typeof dictionary?.packVersion === "string" && dictionary.packVersion.trim()) || DEFAULT_PACK_VERSION;
  const maxAppVersion = (typeof dictionary?.maxAppVersion === "string" && dictionary.maxAppVersion.trim()) || DEFAULT_MAX_APP_VERSION;
  const serialized = JSON.stringify(dictionary.exact);
  const patternsList = dictionary.patterns ?? dictionary.dynamic ?? [];
  const normalizedPatterns = patternsList.map((p) => ({
    ...p,
    target: normalizePatternTarget(p.target),
  }));
  const serializedPatterns = JSON.stringify(normalizedPatterns);
  return `
;(() => {
  "use strict";
  const exactTranslations = new Map(Object.entries(${serialized}));
  const lowerMultiWordTranslations = new Map();
  for (const [k, v] of exactTranslations.entries()) {
    if (
      typeof k === "string" &&
      typeof v === "string" &&
      k.length >= 4 &&
      k.length <= 240 &&
      !/[\\r\\n]/.test(k) &&
      /\\s/.test(k) &&
      /^[A-Za-z]/.test(k) &&
      /[a-z]/.test(k)
    ) {
      const lk = k.toLowerCase();
      if (!lowerMultiWordTranslations.has(lk)) lowerMultiWordTranslations.set(lk, v);
    }
  }
  function __lookupCaseFoldMultiWord(text) {
    if (
      typeof text !== "string" ||
      text.length < 4 ||
      text.length > 240 ||
      /[\\r\\n]/.test(text) ||
      !/\\s/.test(text) ||
      !/^[A-Z]/.test(text) ||
      !/[a-z]/.test(text)
    ) {
      return null;
    }
    const hit = lowerMultiWordTranslations.get(text.toLowerCase());
    return hit !== undefined ? hit : null;
  }
  const patternTranslations = ${serializedPatterns}.map(({ source, target, flags }) => ({
    regex: new RegExp(source, flags),
    target
  }));
  const blockedSelector = [
    "script",
    "style",
    "code",
    "pre",
    "textarea",
    "input",
    "[contenteditable='true']",
    "[data-lexical-editor='true']",
    ".monaco-editor",
    "[data-model-selector-badge]",
    "[data-model-selector-list]",
    "[data-testid='model-selector-item']"
  ].join(",");
  const blockedAttributeSelector = [
    "script",
    "style",
    "code",
    "pre",
    ".monaco-editor",
    "[data-model-selector-badge]",
    "[data-model-selector-list]",
    "[data-testid='model-selector-item']"
  ].join(",");
  const translatedAttributes = ["aria-label", "title", "placeholder", "data-tooltip", "data-title"];
  const pendingRoots = new Set();
  let scheduled = false;
  const stats = {
    dictionarySize: exactTranslations.size,
    patternCount: patternTranslations.length,
    translatedTextNodes: 0,
    translatedAttributes: 0
  };
  const dynamicSelector = "p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th";
  const dynamicBlockedSelector = [
    "button",
    "a",
    "nav",
    "[role='button']",
    "[contenteditable='true']",
    "code",
    "pre",
    ".monaco-editor"
  ].join(",");

  const __monthMap = {
    January: "1", February: "2", March: "3", April: "4",
    May: "5", June: "6", July: "7", August: "8",
    September: "9", October: "10", November: "11", December: "12",
    Jan: "1", Feb: "2", Mar: "3", Apr: "4",
    Jun: "6", Jul: "7", Aug: "8", Sep: "9", Sept: "9", Oct: "10", Nov: "11", Dec: "12"
  };
  function __fmtEnDate(str) {
    if (typeof str !== "string") return str;
    var res = str.replace(
      /\\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})\\b/gi,
      function(_, month, day, year) {
        var m = __monthMap[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()] || month;
        return year + " 年 " + m + " 月 " + day + " 日";
      }
    ).replace(
      /\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec),?\\s*(\\d{4})\\b/gi,
      function(_, day, month, year) {
        var m = __monthMap[month.charAt(0).toUpperCase() + month.slice(1).toLowerCase()] || month;
        return year + " 年 " + m + " 月 " + day + " 日";
      }
    ).replace(/(\\d+ 日)\\s+(起|从|前|后)/g, "$1$2");
    return res
      .replace(/\\bUltra and paid Pro\\b/gi, "Ultra 及付费 Pro")
      .replace(/\\bpaid Pro and Ultra\\b/gi, "付费 Pro 及 Ultra")
      .replace(/\\bPro and Ultra\\b/gi, "Pro 及 Ultra")
      .replace(/\\bUltra and Pro\\b/gi, "Ultra 及 Pro")
      .replace(/\\bpaid Pro\\b/gi, "付费 Pro")
      .replace(/\\bpaid Ultra\\b/gi, "付费 Ultra")
      .replace(/\\bFree users and Google AI Plus\\b/gi, "免费用户与 Google AI Plus")
      .replace(/\\bFree and Google AI Plus\\b/gi, "免费与 Google AI Plus")
      .replace(/\\bGoogle AI Plus and Free\\b/gi, "Google AI Plus 与免费")
      .replace(/\\bFree users\\b/gi, "免费用户")
      .replace(/\\bFree user\\b/gi, "免费用户")
      .replace(/\\bor above\\b/gi, "或更高方案")
      .replace(/\\bor higher\\b/gi, "或更高方案");
  }

  ${formatDurationToChinese.toString()}
  ${translateDynamicDurationText.toString()}
  const __fmtDurToZh = formatDurationToChinese;

  const __planNameMap = {
    "Antigravity Starter Quota": "Antigravity 入门版配额",
    "Antigravity Pro Quota": "Antigravity 专业版配额",
    "Antigravity Ultra Quota": "Antigravity 旗舰版配额",
    "Antigravity Free Quota": "Antigravity 免费配额",
    "Antigravity Plus Quota": "Antigravity Plus 配额",
    "Antigravity Base Quota": "Antigravity 基础配额",
    "Antigravity Enterprise Quota": "Antigravity 企业版配额",
    "Starter Quota": "入门版配额",
    "Pro Quota": "专业版配额",
    "Ultra Quota": "旗舰版配额",
    "Free Quota": "免费配额",
    "Plus Quota": "Plus 配额",
    "Base Quota": "基础配额",
    "Enterprise Quota": "企业版配额",
    "Google AI Plus": "Google AI Plus",
    "Google AI Pro": "Google AI Pro",
    "Google AI Ultra": "Google AI Ultra",
    "Free Tier": "免费版",
    "Free": "免费版",
    "Enterprise Gateway": "企业网关"
  };

  function __translatePlanName(name) {
    if (typeof name !== "string" || !name.trim()) return name;
    var trimmed = name.trim();
    if (__planNameMap[trimmed]) return __planNameMap[trimmed];
    var dictHit = exactTranslations.get(trimmed);
    if (dictHit !== undefined && !/Pro\\s+配额|Ultra\\s+配额|限额/.test(dictHit)) return dictHit;
    return trimmed
      .replace(/\\bStarter Quota\\b/gi, "入门版配额")
      .replace(/\\bPro Quota\\b/gi, "专业版配额")
      .replace(/\\bUltra Quota\\b/gi, "旗舰版配额")
      .replace(/\\bFree Quota\\b/gi, "免费配额")
      .replace(/\\bPlus Quota\\b/gi, "Plus 配额")
      .replace(/\\bBase Quota\\b/gi, "基础配额")
      .replace(/\\bEnterprise Quota\\b/gi, "企业版配额")
      .replace(/\\bFree Tier\\b/gi, "免费版")
      .replace(/\\bQuota\\b/gi, "配额");
  }

  function __translatePlanSentence(t) {
    if (!t) return "";
    var exact = exactTranslations.get(t);
    if (exact !== undefined && !/限制|限额/.test(exact)) return exact;
    var m1 = t.match(/^(Free users(?: and Google AI (?:Plus|Pro)(?: users)?)?|Google AI (?:Plus|Pro|Ultra) users) (?:receive|get|have|enjoy) (?:the )?(minimum base(?:line)?|base(?:line)?|higher|higher model|priority|expanded|increased|generous)?\\s*(?:rate )?(?:limits|quota) on Antigravity\\.?$/i);
    if (m1) {
      var who = m1[1]
        .replace(/Free users and Google AI Plus(?: users)?/i, "免费用户与 Google AI Plus 用户")
        .replace(/Free users and Google AI Pro(?: users)?/i, "免费用户与 Google AI Pro 用户")
        .replace(/Free users/i, "免费用户")
        .replace(/Google AI Plus users/i, "Google AI Plus 用户")
        .replace(/Google AI Pro users/i, "Google AI Pro 用户")
        .replace(/Google AI Ultra users/i, "Google AI Ultra 用户");
      var tierMap = {
        "minimum base": "最低基础配额",
        "minimum baseline": "最低基础配额",
        "base": "基础配额",
        "baseline": "基础配额",
        "higher": "更高配额",
        "higher model": "更高的模型配额",
        "priority": "优先配额",
        "expanded": "扩展配额",
        "increased": "更高配额",
        "generous": "充裕配额"
      };
      var tier = tierMap[(m1[2] || "base").toLowerCase()] || "基础配额";
      return who + "在 Antigravity 上享有" + tier + "。";
    }
    var m2 = t.match(/^(?:You can\\s+)?(?:upgrade|switch) to (?:the |a |an )?(.+?)(?:\\s+(or above|or higher))?\\s*(?:plans?\\s*)?(?:for|to (?:receive|get|unlock|access|enjoy))\\s+(higher|priority|expanded|increased|unlimited|more)\\s+(?:model\\s+)?(?:rate\\s+)?(?:limits|quota)\\.?$/i);
    if (m2) {
      var targetPlan = m2[1].trim()
        .replace(/\\s+(?:plans?|tier)$/i, "")
        .replace(/\\bor\\b/gi, "或");
      var suffix = (/[\\u4e00-\\u9fff]$/.test(targetPlan) ? "" : " ") + (m2[2] ? "或更高方案" : "方案");
      return "你可以升级至 " + targetPlan + suffix + "以获取更高配额。";
    }
    var m3 = t.match(/^(?:Upgrade|Switch) to (?:a |an )?(.+?)(?:\\s+(or above|or higher))?\\s*(?:plan)?\\s*(?:for|to get|to receive)\\s+(?:higher|more)\\s+(?:rate\\s+)?(?:limits|quota)\\.?$/i);
    if (m3) {
      var p3 = m3[1].trim().replace(/\\s+plans?$/i, "");
      var s3 = (/[\\u4e00-\\u9fff]$/.test(p3) ? "" : " ") + (m3[2] ? "或更高方案" : "方案");
      return "你可以升级至 " + p3 + s3 + "以获取更高配额。";
    }
    var tr = translateValue(t);
    if (tr !== null && !/限额|速率限制|最高限制|最低基础限制|更高额度限制/.test(tr)) return tr;
    return null;
  }

  function __translatePlanDesc(desc) {
    if (typeof desc !== "string" || !desc.trim()) return desc;
    var t = desc.trim();
    var direct = __translatePlanSentence(t);
    if (direct !== null) return direct;
    var combined = t.match(/^(.*?(?:rate )?(?:limits|quota) on Antigravity\\.)\\s*(You can upgrade.*)$/i);
    if (combined) {
      var p1 = __translatePlanSentence(combined[1].trim());
      var p2 = __translatePlanSentence(combined[2].trim());
      if (p1 && p2) return p1 + p2;
    }
    var parts = t.split(/(?<=\\.)\\s+/);
    if (parts.length > 1) {
      var out = [];
      var allOk = true;
      for (var i = 0; i < parts.length; i++) {
        var seg = __translatePlanSentence(parts[i].trim());
        if (seg === null) {
          allOk = false;
          break;
        }
        out.push(seg);
      }
      if (allOk) return out.join("");
    }
    var tr = translateValue(desc);
    if (tr !== null) {
      return tr
        .replace(/最低基础限制/g, "最低基础配额")
        .replace(/更高额度限制/g, "更高配额")
        .replace(/更高的速率限制/g, "更高配额")
        .replace(/速率限制/g, "配额")
        .replace(/限额/g, "配额");
    }
    return t;
  }

  const __chapterExactMap = {
    "Fixing localization and UI bugs": "修复本地化与界面问题",
    "Refining Antigravity desktop Chinese localization": "优化 Antigravity 桌面端中文本地化",
    "Refining Antigravity desktop Chinese localization": "优化 Antigravity 桌面端中文本地化",
    "Fixing missed code fragments during debugging": "修复调试期间遗漏的代码片段",
    "Synchronizing local and GitHub repositories": "同步本地与 GitHub 仓库",
    "Resolving bilingual interface text issues": "解决界面双语文本问题",
    "Debugging Antigravity UI localization issues": "调试 Antigravity 界面本地化问题",
    "Verifying localization package and build integrity": "验证汉化包与构建完整性",
    "Updating Chinese language pack for 2.31.0": "更新适用于 2.31.0 的中文语言包",
    "Analyzing software localization and promotion strategies": "分析软件本地化与推广策略",
    "Auditing and localizing desktop app": "审查并本地化桌面应用",
    "Comparing translation pack projects": "对比汉化包项目",
    "Completing localization and debugging of Antigravity": "完成 Antigravity 本地化与问题调试",
    "Completing UI localization and rules adjustment": "完成界面本地化与规则调整",
    "Continuing translation and reviewing improvements": "继续汉化并审查改进",
    "Fixing and releasing software localization": "修复并发布软件本地化",
    "Fixing the desktop app localization": "修复桌面应用本地化",
    "Fixing translation and UI bug": "修复汉化与界面问题",
    "Iterating software localization and UI translations": "迭代软件本地化与界面汉化",
    "Locating missing desktop shortcut": "查找丢失的桌面快捷方式",
    "Optimizing app localization and rules": "优化应用本地化与规则",
    "Publishing and updating the localization project": "发布与更新本地化项目",
    "Publishing new antigravity localization release": "发布 Antigravity 汉化新版本",
    "Refining UI localization and error messages": "优化界面汉化与错误提示",
    "Releasing v1.0.0 and finalizing localization": "发布 v1.0.0 并定稿本地化",
    "Setting up and fixing Antigravity GitHub repository": "配置并修复 Antigravity GitHub 仓库",
    "Translating context menu and tooltips": "汉化右键菜单与提示气泡",
    "Translating missing UI elements and tooltips": "汉化遗漏的界面元素与提示",
    "Translating remaining untranslated error messages": "汉化剩余未翻译的错误提示",
    "Translating the user interface": "汉化用户界面",
    "Understanding the antigravity hot reload update": "解析 Antigravity 热重载更新机制",
    "Updating and uploading localization files": "更新与上传本地化文件",
    "Using Chrome to Open Doubao": "使用 Chrome 打开豆包",
    "Using Chrome to Open Douyin": "使用 Chrome 打开抖音",
    "Google Superiority Video Script": "谷歌优势对比视频剧本",
    "Google Superiority Video Script Review": "谷歌优势对比视频脚本评审"
  };

  function __translateChapterTitle(title) {
    if (typeof title !== "string" || !title.trim()) return title;
    var t = title.trim();
    if (__chapterExactMap[t]) return __chapterExactMap[t];
    var dictHit = exactTranslations.get(t);
    if (dictHit !== undefined) return dictHit;
    if (/[\u4e00-\u9fff]/.test(t)) return title;
    var mUsing = t.match(/^Using\s+(.+?)\s+to\s+[Oo]pen\s+(.+)$/i);
    if (mUsing) {
      var targetSite = mUsing[2].replace(/^Doubao$/i, "豆包").replace(/^Douyin$/i, "抖音");
      return "使用 " + mUsing[1] + " 打开" + (/[\u4e00-\u9fff]/.test(targetSite[0]) ? "" : " ") + targetSite;
    }
    var s = t;
    var verbMap = [
      [/^Fixing and releasing\\s+/i, "修复并发布 "],
      [/^Updating and uploading\\s+/i, "更新与上传 "],
      [/^Publishing and updating\\s+/i, "发布与更新 "],
      [/^Auditing and localizing\\s+/i, "审查并本地化 "],
      [/^Auditing and fixing\\s+/i, "审查并修复 "],
      [/^Checking and fixing\\s+/i, "检查并修复 "],
      [/^Continuing translation and reviewing\\s+/i, "继续汉化并审查 "],
      [/^Setting up and fixing\\s+/i, "配置并修复 "],
      [/^Cleaning up\\s+/i, "清理 "],
      [/^Setting up\\s+/i, "配置 "],
      [/^Synchronizing\\s+/i, "同步 "],
      [/^Completing\\s+/i, "完成 "],
      [/^Refining\\s+/i, "优化 "],
      [/^Optimizing\\s+/i, "优化 "],
      [/^Improving\\s+/i, "改进 "],
      [/^Resolving\\s+/i, "解决 "],
      [/^Inspecting\\s+/i, "检查 "],
      [/^Checking\\s+/i, "检查 "],
      [/^Verifying\\s+/i, "验证 "],
      [/^Investigating\\s+/i, "排查 "],
      [/^Troubleshooting\\s+/i, "排查 "],
      [/^Rebuilding\\s+/i, "重建 "],
      [/^Reviewing\\s+/i, "审查 "],
      [/^Implementing\\s+/i, "实现 "],
      [/^Adding\\s+/i, "新增 "],
      [/^Removing\\s+/i, "移除 "],
      [/^Fixing\\s+/i, "修复 "],
      [/^Updating\\s+/i, "更新 "],
      [/^Publishing\\s+/i, "发布 "],
      [/^Releasing\\s+/i, "发布 "],
      [/^Comparing\\s+/i, "对比 "],
      [/^Building\\s+/i, "构建 "],
      [/^Testing\\s+/i, "测试 "],
      [/^Preparing\\s+/i, "准备 "],
      [/^Summarizing\\s+/i, "汇总 "],
      [/^Creating\\s+/i, "创建 "],
      [/^Configuring\\s+/i, "配置 "],
      [/^Deploying\\s+/i, "部署 "],
      [/^Analyzing\\s+/i, "分析 "],
      [/^Exploring\\s+/i, "探索 "],
      [/^Iterating\\s+/i, "迭代 "],
      [/^Locating\\s+/i, "查找 "],
      [/^Translating\\s+/i, "汉化 "],
      [/^Debugging\\s+/i, "调试 "]
    ];
    var mv = "";
    for (var vi = 0; vi < verbMap.length; vi++) {
      if (verbMap[vi][0].test(s)) {
        mv = verbMap[vi][1];
        s = s.replace(verbMap[vi][0], "");
        break;
      }
    }
    var timePrefix = "";
    if (/\\s+during debugging$/i.test(s)) {
      timePrefix = "调试期间的";
      s = s.replace(/\\s+during debugging$/i, "");
    } else if (/\\s+after update$/i.test(s)) {
      timePrefix = "更新后的";
      s = s.replace(/\\s+after update$/i, "");
    } else if (/\\s+before release$/i.test(s)) {
      timePrefix = "发布前的";
      s = s.replace(/\\s+before release$/i, "");
    }
    var phraseMap = [
      [/\\b(?:UI|interface) and localization (?:bugs?|issues?)\\b/gi, "界面与本地化问题"],
      [/\\blocalization and (?:UI|interface) (?:bugs?|issues?)\\b/gi, "本地化与界面问题"],
      [/\\b(?:UI|interface) (?:bugs?|issues?)\\b/gi, "界面问题"],
      [/\\bbilingual (?:UI|interface) (?:bugs?|issues?)\\b/gi, "双语界面问题"],
      [/\\bdesktop Chinese localization\\b/gi, "桌面端中文本地化"],
      [/\\bUI\\b/gi, "界面"],
      [/\\b(?:UI|interface) and localization (?:bugs?|issues?)\\b/gi, "界面与本地化问题"],
      [/\\blocalization and (?:UI|interface) (?:bugs?|issues?)\\b/gi, "本地化与界面问题"],
      [/\\b(?:UI|interface) (?:bugs?|issues?)\\b/gi, "界面问题"],
      [/\\bbilingual (?:UI|interface) (?:bugs?|issues?)\\b/gi, "双语界面问题"],
      [/\\bdesktop Chinese localization\\b/gi, "桌面端中文本地化"],
      [/\\bUI\\b/gi, "界面"],
      [/\\bmissed code fragments during debugging\\b/gi, "调试期间遗漏的代码片段"],
      [/\\bduring debugging\\b/gi, "调试期间的"],
      [/\\bafter update\\b/gi, "更新后的"],
      [/\\bbefore release\\b/gi, "发布前的"],
      [/\\bAntigravity desktop Chinese localization\\b/gi, "Antigravity 桌面端中文本地化"],
      [/\\bdesktop Chinese localization\\b/gi, "桌面端中文本地化"],
      [/\\bChinese localization\\b/gi, "中文本地化"],
      [/\\bChinese language pack\\b/gi, "中文语言包"],
      [/\\bmissed code fragments\\b/gi, "遗漏的代码片段"],
      [/\\bcode fragments\\b/gi, "代码片段"],
      [/\\bthe desktop app localization\\b/gi, "桌面应用本地化"],
      [/\\bdesktop app localization\\b/gi, "桌面应用本地化"],
      [/\\bdesktop app\\b/gi, "桌面应用"],
      [/\\bsoftware localization\\b/gi, "软件本地化"],
      [/\\blocalization files\\b/gi, "本地化文件"],
      [/\\bthe localization project\\b/gi, "本地化项目"],
      [/\\blocalization project\\b/gi, "本地化项目"],
      [/\\blocalization package\\b/gi, "汉化包"],
      [/\\btranslation pack projects\\b/gi, "汉化包项目"],
      [/\\btranslation pack\\b/gi, "汉化包"],
      [/\\bUI localization issues\\b/gi, "界面本地化问题"],
      [/\\bUI localization\\b/gi, "界面本地化"],
      [/\\bUI translations\\b/gi, "界面汉化"],
      [/\\bbilingual (?:UI|interface) text issues\\b/gi, "双语界面文本问题"],
      [/\\b(?:UI|interface) text issues\\b/gi, "界面文本问题"],
      [/\\b(?:UI|interface) text\\b/gi, "界面文本"],
      [/\\b(?:UI|interface) layout\\b/gi, "界面布局"],
      [/\\btext truncation\\b/gi, "文本截断问题"],
      [/\\bthe user interface\\b/gi, "用户界面"],
      [/\\buser interface\\b/gi, "用户界面"],
      [/\\bbuild integrity\\b/gi, "构建完整性"],
      [/\\brules adjustment\\b/gi, "规则调整"],
      [/\\bapp localization and rules\\b/gi, "应用本地化与规则"],
      [/\\blocalization and debugging of Antigravity\\b/gi, "Antigravity 本地化与调试"],
      [/\\bdebugging of Antigravity\\b/gi, "Antigravity 调试"],
      [/\\berror messages\\b/gi, "错误提示"],
      [/\\bcontext menu and tooltips\\b/gi, "右键菜单与提示气泡"],
      [/\\bcontext menu\\b/gi, "右键菜单"],
      [/\\bmissing UI elements and tooltips\\b/gi, "遗漏的界面元素与提示气泡"],
      [/\\bUI elements\\b/gi, "界面元素"],
      [/\\bAntigravity GitHub repository\\b/gi, "Antigravity GitHub 仓库"],
      [/\\blocal and GitHub repositories\\b/gi, "本地与 GitHub 仓库"],
      [/\\bGitHub repositories\\b/gi, "GitHub 仓库"],
      [/\\bGitHub repository\\b/gi, "GitHub 仓库"],
      [/\\blocal repositories\\b/gi, "本地仓库"],
      [/\\blocal repository\\b/gi, "本地仓库"],
      [/\\bpermission policies\\b/gi, "权限策略"],
      [/\\brepository localization\\b/gi, "仓库本地化"],
      [/\\bpopup dialogs\\b/gi, "弹出窗口"],
      [/\\bsubmenus\\b/gi, "子菜单"],
      [/\\bsettings panel\\b/gi, "设置面板"],
      [/\\bmodel selector\\b/gi, "模型选择器"],
      [/\\bplugin details\\b/gi, "插件详情"],
      [/\\bhot reload\\b/gi, "热重载"],
      [/\\brelease package\\b/gi, "发布包"],
      [/\\bremaining\\b/gi, "剩余"],
      [/\\buntranslated\\b/gi, "未翻译的"],
      [/\\bbilingual\\b/gi, "双语"],
      [/\\bmissing\\b/gi, "遗漏的"],
      [/\\blocalization\\b/gi, "本地化"],
      [/\\btranslations\\b/gi, "译文"],
      [/\\btranslation\\b/gi, "翻译"],
      [/\\brepositories\\b/gi, "仓库"],
      [/\\brepository\\b/gi, "仓库"],
      [/\\bfragments\\b/gi, "片段"],
      [/\\bissues\\b/gi, "问题"],
      [/\\bbugs?\\b/gi, "问题"],
      [/\\binterface\\b/gi, "界面"],
      [/\\blayout\\b/gi, "布局"],
      [/\\btext\\b/gi, "文本"],
      [/\\bplugins?\\b/gi, "插件"],
      [/\\bquota\\b/gi, "配额"],
      [/\\bsettings\\b/gi, "设置"],
      [/\\bpermissions?\\b/gi, "权限"],
      [/\\bsubagents?\\b/gi, "子智能体"],
      [/\\bautomations?\\b/gi, "自动化"],
      [/\\bextensions?\\b/gi, "扩展"],
      [/\\bmessages?\\b/gi, "消息"],
      [/\\berrors?\\b/gi, "错误"],
      [/\\bprompts?\\b/gi, "提示词"],
      [/\\brules?\\b/gi, "规则"],
      [/\\bmenus?\\b/gi, "菜单"],
      [/\\bpanels?\\b/gi, "面板"],
      [/\\b(?:dialogs?|modals?)\\b/gi, "弹窗"],
      [/\\bcomponents?\\b/gi, "组件"],
      [/\\bbuttons?\\b/gi, "按钮"],
      [/\\btooltips?\\b/gi, "提示气泡"],
      [/\\bpackage\\b/gi, "压缩包"],
      [/\\bdesktop\\b/gi, "桌面端"],
      [/\\blocal\\b/gi, "本地"],
      [/\\bworkspaces?\\b/gi, "工作区"],
      [/\\bprojects?\\b/gi, "项目"],
      [/\\bfiles?\\b/gi, "文件"],
      [/\\bcode\\b/gi, "代码"],
      [/\\bmodels?\\b/gi, "模型"],
      [/\\bthemes?\\b/gi, "主题"],
      [/\\bsearch\\b/gi, "搜索"],
      [/\\bsidebar\\b/gi, "侧边栏"],
      [/\\bterminal\\b/gi, "终端"],
      [/\\bbrowser\\b/gi, "浏览器"],
      [/\\bvalidation\\b/gi, "验证"],
      [/\\bcompatibility\\b/gi, "兼容性"],
      [/\\bperformance\\b/gi, "性能"],
      [/\\btesting\\b/gi, "测试"],
      [/\\bapp\\b/gi, "应用"]
    ];
    for (var pi = 0; pi < phraseMap.length; pi++) {
      s = s.replace(phraseMap[pi][0], phraseMap[pi][1]);
    }
    s = s
      .replace(/\\s+(?:and|&)\\s+/gi, "与")
      .replace(/\\s+for\\s+/gi, "的")
      .replace(/([\\u4e00-\\u9fff])\\s+(?=[\\u4e00-\\u9fff])/g, "$1")
      .replace(/\\s+/g, " ")
      .trim();
    var allowedEn = new Set(["Antigravity", "GitHub", "UI", "API", "MCP", "AI", "CSS", "DOM", "JSON", "URL"]);
    var leftovers = s.match(/[A-Za-z]+/g) || [];
    var hasBadEn = leftovers.some(function(w) { return !allowedEn.has(w) && !/^v\\d+$/.test(w); });
    if (!hasBadEn && /[\\u4e00-\\u9fff]/.test(s)) {
      var combined = (timePrefix + s).trim();
      return mv ? (mv.trim() + (/^[A-Za-z0-9]/.test(combined) ? " " : "") + combined).trim() : combined;
    }
    return t;
  }

  
  function __translatePluginSubject(subj) {
    if (!subj) return "";
    var s = subj.trim();
    var dictHit = exactTranslations.get(s);
    if (dictHit !== undefined) return dictHit;
    return s
      .replace(/\bLLM provider credentials\b/gi, "大语言模型提供商凭据")
      .replace(/\bLLM provider cred(?:entials)?\b/gi, "大模型提供商凭据")
      .replace(/\bLLM observability\b/gi, "大语言模型可观测性")
      .replace(/\bLLM prompts\b/gi, "大语言模型提示词")
      .replace(/\bLLM app\b/gi, "大语言模型应用")
      .replace(/\bLLM\b/gi, "大语言模型")
      .replace(/\bAI agent\b/gi, "AI 智能体")
      .replace(/\bAI agents\b/gi, "AI 智能体")
      .replace(/\bAPI keys\b/gi, "API 密钥")
      .replace(/\bAPI key\b/gi, "API 密钥")
      .replace(/\bannotation configs\b/gi, "标注配置")
      .replace(/\bdatasets and examples\b/gi, "数据集与示例")
      .replace(/\bdatasets\b/gi, "数据集")
      .replace(/\bexperiments\b/gi, "实验")
      .replace(/\btracing\b/gi, "链路追踪")
      .replace(/\btraces\b/gi, "链路追踪")
      .replace(/\bspans\b/gi, "跨度链路")
      .replace(/\bproduction trace data\b/gi, "生产环境链路追踪数据")
      .replace(/\bevaluations\b/gi, "评估指标")
      .replace(/\bevaluators\b/gi, "评估器")
      .replace(/\bprompts\b/gi, "提示词")
      .replace(/\bprompt\b/gi, "提示词")
      .replace(/\bworkflows\b/gi, "工作流")
      .replace(/\bworkflow\b/gi, "工作流");
  }

  function __translatePluginDesc(desc) {
    if (typeof desc !== "string" || !desc.trim()) return desc;
    var trimmed = desc.trim();
    var hit = exactTranslations.get(trimmed);
    if (hit !== undefined) return hit;

    var deEllipsis = trimmed.replace(/(?:\.\.\.|\u2026|\s)+$/g, "").trim();
    if (deEllipsis) {
      var hit2 = exactTranslations.get(deEllipsis) ?? exactTranslations.get(deEllipsis + ".");
      if (hit2 !== undefined) return hit2;
    }

    var skillNameMap = {
      "mcp-app-development": "MCP 应用开发",
      "swarm": "Swarm 蜂群协作",
      "swarm_monitor": "Swarm 蜂群监视器",
      "swarm_narrator": "Swarm 协调叙述者",
      "UI Extension": "UI 扩展",
      "Swarm": "Swarm 蜂群协作",
      "a11y-debugging": "无障碍调试",
      "chrome-devtools": "Chrome DevTools",
      "cookie-debugging": "Cookie 调试",
      "debug-optimize-lcp": "LCP 性能调优",
      "memory-leak-debugging": "内存泄漏排查",
      "troubleshooting": "连接与故障排查"
    };
    if (skillNameMap[trimmed]) return skillNameMap[trimmed];

    var prefixRules = [
      [/^Manages Arize users/i, "管理 Arize 用户、组织、空间、项目、角色、角色绑定、资源限制与 API 密钥等。"],
      [/^Creates,\s*reads,\s*updates,\s*and deletes Arize AI/i, "创建、读取、更新并删除用于存储大语言模型 (LLM) 服务商凭证的 Arize AI 集成。"],
      [/^Creates and manages annotation configs/i, "创建并管理标注配置（类别型、连续型、自由格式标签体系）及人工标注流程。"],
      [/^INVOKE THIS SKILL when auditing an AI agent/i, "在审查 AI 智能体或 LLM 应用的合规性与监管标准时调用此技能，涵盖主流全球 AI 法规与合规框架。"],
      [/^Creates,\s*manages,\s*and queries Arize datasets/i, "创建、管理并查询 Arize 数据集与测试用例，支持数据集增删改查、追加样本以及数据导出。"],
      [/^Handles LLM-as-judge and code evaluator/i, "处理 Arize 上的 LLM 评审与代码评估器工作流，支持创建、测试和持续更新评估逻辑。"],
      [/^Creates,\s*runs,\s*and analyzes Arize experiments/i, "创建、运行并深入分析 Arize 实验，用于评估和对比不同模型的性能表现。"],
      [/^Adds Arize AX tracing to an LLM application/i, "首次为 LLM 应用程序添加 Arize AX 链路追踪。智能检测技术栈、接入对应埋点并验证链路数据。"],
      [/^Audits instrumentation health of existing Arize traces/i, "审计现有 Arize 链路追踪健康状态，对链路结构、属性与报错状态执行确定性校验。"],
      [/^Generates deep links to the Arize UI/i, "为项目、链路、Span、会话、数据集、实验及标注队列生成直达 Arize 控制台的深度链接。"],
      [/^Migrates LLM observability from Braintrust/i, "将 LLM 可观测性数据从 Braintrust 迁移至 Arize AX——支持通过 OTLP 导入历史链路、数据集和提示词。"],
      [/^Migrates LLM observability from Langfuse/i, "将 LLM 可观测性数据从 Langfuse 迁移至 Arize AX——支持通过 OTLP 导入历史链路（Span、会话与元数据）。"],
      [/^Migrates LLM observability from LangSmith/i, "将 LLM 可观测性数据从 LangSmith 迁移至 Arize AX——支持通过 OTLP 导入历史链路、运行记录与用户反馈。"],
      [/^Migrate existing Phoenix \(PX\) traces/i, "将现有 Phoenix (PX) 链路、数据集、实验及存储的评估结果完整平滑迁移至 Arize AX。"],
      [/^Optimizes,\s*improves,\s*and debugs LLM prompts/i, "结合线上生产链路数据、自动化评估与人工标注，优化、改进并调试大模型提示词。"],
      [/^INVOKE THIS SKILL for Arize Prompt Hub/i, "在进行 Arize 提示词中心与 'ax prompts' 工作流时调用此技能：编写或导入模板并部署版本。"],
      [/^Use when one Python service must send each agent/i, "当单个 Python 服务必须将各智能体、租户、团队或请求的 Span 链路分流发送到对应的 Arize 空间和项目时使用。"],
      [/^Exports,\s*views,\s*and debugs Arize AX traces/i, "通过 ax 命令行工具导出、查看并调试 Arize AX 链路追踪、Span 和会话。"],
      [/^Call the Gemini API from the shell/i, "通过终端使用 gemini-api 命令行调用 Gemini API。适用于媒体生成（图像、TTS、音乐、视频）、本地文件与 YouTube 分析、音视频转录、深度研究及沙箱智能体。"],
      [/^Build,\s*package,\s*and debug MCP Apps/i, "为 Antigravity 构建、打包并调试 MCP 应用程序：MCP 服务端工具可将其结果在对话中作为交互式 UI、在侧面板中或以侧面板整页形式呈现。在为 MCP 工具添加 UI、构建或定制应用主题、将其打包为插件，或调试未按预期渲染或运行的应用时使用此技能。"],
      [/^Live view of the native swarm board/i, "实时查看当前会话 Swarm 智能体群组的原生消息看板、成员花名册与 @提及关系图。"],
      [/^Swarm Live view of the native swarm board/i, "Swarm 实时查看当前会话 Swarm 智能体群组的原生消息看板、成员花名册与 @提及关系图。"],
      [/^ONLY for the native-swarm worker whose brief says it is the narrator/i, "仅供任务摘要指明为叙述者的原生蜂群工作人员使用。负责监视消息板并实时更新用户概览（view.json）背后的事实信息。协调员和其他工作人员请勿加载此技能。"]
    ];

    for (var i = 0; i < prefixRules.length; i++) {
      if (prefixRules[i][0].test(trimmed)) return prefixRules[i][1];
    }

    var m;
    m = trimmed.match(/^Manages\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "管理 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^Creates,\s*reads,\s*updates,\s*and\s*deletes\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "创建、读取、更新并删除 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^Creates\s*and\s*manages\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "创建并管理 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^Creates,\s*manages,\s*and\s*queries\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "创建、管理并查询 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^Creates,\s*runs,\s*and\s*analyzes\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "创建、运行并分析 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^Optimizes,\s*improves,\s*and\s*debugs\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "优化、改进并调试 " + __translatePluginSubject(m[1]) + "。";

    m = trimmed.match(/^INVOKE\s+THIS\s+SKILL\s+when\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "在 " + __translatePluginSubject(m[1]) + " 时调用此技能。";

    m = trimmed.match(/^Handles\s+(.+?)\s+workflows\s+on\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "处理 " + m[2].trim() + " 上的 " + __translatePluginSubject(m[1]) + " 工作流。";

    m = trimmed.match(/^Adds\s+(.+?)\s+tracing\s+to\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "为 " + m[2].trim() + " 添加 " + __translatePluginSubject(m[1]) + " 链路追踪。";

    m = trimmed.match(/^Audits\s+(.+?)\s+health\s+of\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "审计 " + m[2].trim() + " 的 " + __translatePluginSubject(m[1]) + " 健康状态。";

    m = trimmed.match(/^Generates\s+deep\s+links\s+to\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "生成指向 " + __translatePluginSubject(m[1]) + " 的深层链接。";

    m = trimmed.match(/^Migrates?\s+(.+?)\s+from\s+(.+?)\s+into\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "将 " + __translatePluginSubject(m[1]) + " 从 " + m[2].trim() + " 迁移至 " + m[3].trim() + "。";

    m = trimmed.match(/^Migrate\s+existing\s+(.+?)\s+into\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "将现有的 " + __translatePluginSubject(m[1]) + " 迁移至 " + m[2].trim() + "。";

    m = trimmed.match(/^Use\s+when\s+(.+?)(?:\.\.\.|\u2026|\.)?$/i);
    if (m) return "当 " + __translatePluginSubject(m[1]) + " 时使用。";

    for (var pi = 0; pi < patternTranslations.length; pi++) {
      var patEntry = patternTranslations[pi];
      patEntry.regex.lastIndex = 0;
      if (patEntry.regex.test(trimmed)) {
        patEntry.regex.lastIndex = 0;
        return trimmed.replace(patEntry.regex, patEntry.target);
      }
    }

    return trimmed;
  }

  
  function __translatePluginHeading(h) {
    if (!h) return null;
    var ht = h.trim();
    var hit = exactTranslations.get(ht);
    if (hit !== undefined) return hit;
    var map = {
      "Setup": "安装与设置",
      "Releasing": "发布版本",
      "License": "许可证",
      "Feedback": "意见反馈",
      "Prerequisites": "前提条件",
      "What's included": "包含内容",
      "What's Included": "包含内容",
      "What you get": "包含内容",
      "Skills": "技能",
      "Commands": "命令",
      "MCP server": "MCP 服务器",
      "MCP servers": "MCP 服务器",
      "Tools": "工具",
      "Example prompts": "示例提示词",
      "Resources": "相关资源",
      "Usage": "使用方法",
      "Authentication": "身份验证",
      "Configuration": "配置指南",
      "Installation": "安装指南",
      "Available Tools": "可用工具",
      "Version Pinning": "版本锁定"
    };
    if (map[ht]) return map[ht];
    if (ht.endsWith(" MCP")) return ht.replace(/\s+MCP$/, "") + " MCP 服务器";
    return null;
  }

  function __translateModelTagDesc(desc) {
    if (typeof desc !== "string" || !desc.trim()) return desc;
    var t = desc.trim();
    var hit = exactTranslations.get(t);
    if (hit !== undefined) return hit;
    var mOffload = t.match(/^([A-Za-z0-9 .+-]+)\s+that\s+may\s+offload\s+routine\s+steps\s+to\s+([A-Za-z0-9 .+-]+)\.\s*Same\s+([A-Za-z0-9 .+-]+)-level\s+quality,\s*fewer\s+tokens\s+used\.?$/i);
    if (mOffload) {
      return "可将常规步骤交由 " + mOffload[2].trim() + " 分担执行的 " + mOffload[1].trim() + " 模型。保持同等的 " + mOffload[3].trim() + " 级质量，消耗更少 Token。";
    }
    if (/^Our most advanced model yet[!.]?$/i.test(t)) {
      return "迄今为止我们最先进的模型" + (t.endsWith("!") ? "！" : t.endsWith(".") ? "。" : "");
    }
    if (/^Our daily driver for rapid coding and dependable agentic execution[!.]?$/i.test(t)) {
      return "专为快速编码与可靠智能体执行打造的日常主力模型" + (t.endsWith("!") ? "！" : t.endsWith(".") ? "。" : "");
    }
    var mLeaving = t.match(/^Use\\s+(.+?)\\s+for\\s+better\\s+quality\\s+with\\s+lower\\s+quota\\s+usage\\.\\s*Leaving(?:\\s+on)?\\s+([A-Za-z]+\\s+\\d{1,2}(?:,\\s*\\d{4})?|\\d{4}-\\d{2}-\\d{2})\\.?$/i);
    if (mLeaving) {
      return "建议使用 " + mLeaving[1].trim() + "，模型质量更优且配额消耗更低。此模型将于 " + __fmtEnDate(mLeaving[2].trim()) + " 下线。";
    }
    var mPaidPlan = t.match(/^Available\\s+on\\s+paid\\s+(.+?)\\s+plans?\\.\\s*Not\\s+included\\s+with\\s+your\\s+current\\s+plan\\.?$/i);
    if (mPaidPlan) {
      return "仅限付费 " + mPaidPlan[1].trim() + " 方案使用。当前方案不包含此模型。";
    }
    var tr = translateValue(desc);
    if (tr !== null) return tr;
    return desc;
  }

  globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__ = __translatePluginDesc;
  globalThis.__AGY_ZHCN_TRANSLATE_PLAN__ = __translatePlanName;
  globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__ = __translatePlanDesc;
  globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__ = __translateChapterTitle;
  globalThis.__AGY_ZHCN_TRANSLATE_DUR__ = __fmtDurToZh;
  globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__ = __translateModelTagDesc;
  globalThis.__AGY_ZHCN_PACK_VERSION__ = ${JSON.stringify(packVersion)};
  globalThis.__AGY_ZHCN_MAX_APP_VERSION__ = ${JSON.stringify(maxAppVersion)};
  let __packCheckBusy = false;
  let __packSaveBusy = false;
  let __packPanelState = {
    cur: ${JSON.stringify(packVersion)},
    maxApp: ${JSON.stringify(maxAppVersion)},
    releaseUrl: "https://github.com/Ace2025001/antigravity-desktop-zhcn",
    latestVer: "",
    notes: "",
    statusText: "",
    statusKind: "idle",
    hasHook: false,
    hot: true,
    platform: "",
    writable: false,
    settingsLoaded: false,
    settingsMsg: "",
    settingsMsgOk: false,
    lastCheckAt: 0,
    lastCheckMs: 0,
    lastCheckTimeStr: "",
    diagOpen: false,
    diagMsg: "",
    settings: { packAutoUpdate: "auto", autoFollow: "auto", onlineTranslate: false, titleAutoTranslate: true },
  };
  let __packUiRefs = null;
  const __fmtTimeNow = () => {
    try {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    } catch {
      return "";
    }
  };
  const __renderPackPanel = () => {
    if (!__packUiRefs) return;
    const r = __packUiRefs;
    const st = __packPanelState;
    r.verLine.textContent = st.maxApp
      ? ("当前版本：v" + (st.cur || "未知") + "  ·  已适配最高客户端：" + st.maxApp)
      : ("当前版本：v" + (st.cur || "未知"));
    r.statusLine.textContent = st.statusText;
    r.statusLine.style.color = st.statusKind === "latest" || st.statusKind === "updated"
      ? "#16a34a"
      : (st.statusKind === "error" ? "#dc2626" : "inherit");
    if (st.notes && st.statusKind === "available") {
      r.notesBox.style.display = "block";
      r.notesBox.textContent = st.notes;
    } else {
      r.notesBox.style.display = "none";
      r.notesBox.textContent = "";
    }
    const cBusy = __packCheckBusy;
    const sBusy = __packSaveBusy;
    r.btnCheck.style.display = (st.statusKind === "legacy" || st.statusKind === "updating") ? "none" : "inline-flex";
    r.btnCheck.disabled = cBusy;
    r.btnCheck.style.opacity = cBusy ? "0.62" : "1";
    r.btnCheck.style.cursor = cBusy ? "wait" : "pointer";
    r.btnCheck.textContent = cBusy
      ? "⟳ 检查中…"
      : (st.statusKind === "idle" ? "检查更新" : "重新检查");
    const showAvail = st.statusKind === "available" && st.hasHook;
    r.btnApply.style.display = showAvail ? "inline-flex" : "none";
    r.btnApply.disabled = cBusy;
    r.btnApply.style.opacity = cBusy ? "0.62" : "1";
    r.btnApply.style.cursor = cBusy ? "wait" : "pointer";
    r.btnSkip.style.display = showAvail ? "inline-flex" : "none";
    r.btnSkip.disabled = cBusy;
    r.btnSkip.style.opacity = cBusy ? "0.62" : "1";
    r.btnSkip.style.cursor = cBusy ? "wait" : "pointer";
    r.btnReload.style.display = (st.statusKind === "updated" && st.hot) ? "inline-flex" : "none";
    r.linkRelease.href = "https://github.com/Ace2025001/antigravity-desktop-zhcn";

    if (!st.settingsLoaded) {
      r.settingsTip.textContent = "正在读取设置…";
      r.settingsTip.style.color = "inherit";
    } else if (st.settingsMsg) {
      r.settingsTip.textContent = st.settingsMsg;
      r.settingsTip.style.color = st.settingsMsgOk ? "#16a34a" : "#dc2626";
    } else {
      r.settingsTip.textContent = st.writable ? "点击即可保存生效" : "只读预览（更新并重启后可改）";
      r.settingsTip.style.color = "inherit";
    }
    const isWin = !st.platform || st.platform === "win32";
    r.rowAutoFollow.style.display = isWin ? "flex" : "none";
    for (const grp of r.settingButtons) {
      const active = st.settings[grp.key] === grp.val;
      grp.btn.disabled = !st.writable || sBusy;
      grp.btn.style.opacity = !st.writable ? "0.55" : (sBusy ? "0.7" : "1");
      grp.btn.style.cursor = !st.writable ? "default" : (sBusy ? "wait" : "pointer");
      grp.btn.style.background = active ? "var(--primary,#2563eb)" : "transparent";
      grp.btn.style.color = active ? "#ffffff" : "inherit";
      grp.btn.style.borderColor = active ? "var(--primary,#2563eb)" : "var(--border,rgba(127,127,127,.28))";
    }
    if (r.diagToggle && r.diagBody) {
      r.diagToggle.textContent = (st.diagOpen ? "▾ " : "▸ ") + "运行状态与诊断";
      r.diagBody.style.display = st.diagOpen ? "block" : "none";
      if (st.diagOpen && r.diagText) {
        r.diagText.textContent =
          "核心词库：" + exactTranslations.size + " 条精确 + " + patternTranslations.length + " 条动态\\n" +
          "本页已汉化：" + stats.translatedTextNodes + " 处文本 / " + stats.translatedAttributes + " 处属性\\n" +
          "智能缓存：界面补充 " + __learnedUiTranslations.size + " 条 · 标题翻译 " + __learnedTitleTranslations.size + " 条 · 手动保留 " + __manualTitleIds.size + " 个";
      }
      if (r.diagMsg) r.diagMsg.textContent = st.diagMsg || "";
    }
    if (r.hideTipIfTargetHidden) r.hideTipIfTargetHidden();
  };
  const __ensurePackPanel = () => {
    try {
      if (!document?.body) return null;
      const existing = document.querySelector("[data-agy-zhcn-pack-toast]");
      if (existing && __packUiRefs && __packUiRefs.wrap === existing) return __packUiRefs;
      if (existing) existing.remove();
      const wrap = document.createElement("div");
      wrap.setAttribute("data-agy-zhcn-pack-toast", "1");
      wrap.setAttribute("data-agy-zhcn-pack-panel", "1");
      wrap.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:396px;max-width:calc(100vw - 32px);padding:14px 16px;border-radius:12px;border:1px solid var(--border,rgba(127,127,127,.28));background:var(--background,#ffffff);color:var(--foreground,#18181b);box-shadow:0 12px 34px rgba(0,0,0,.22);font-size:13px;line-height:1.5;user-select:none;";

      const tipBox = document.createElement("div");
      tipBox.setAttribute("data-agy-zhcn-pack-tooltip", "1");
      tipBox.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;display:none;max-width:260px;padding:6px 10px;border-radius:8px;border:1px solid var(--border,rgba(127,127,127,.28));background:var(--foreground,#18181b);color:var(--background,#ffffff);box-shadow:0 8px 22px rgba(0,0,0,.22);font-size:11.5px;line-height:1.45;white-space:normal;pointer-events:none;";
      tipBox.style.display = "none";
      let __tipTarget = null;
      const __hidePackTip = () => {
        __tipTarget = null;
        tipBox.style.display = "none";
        tipBox.textContent = "";
      };
      const __showPackTip = (el, tipText) => {
        if (!tipText) {
          __hidePackTip();
          return;
        }
        __tipTarget = el;
        tipBox.textContent = tipText;
        tipBox.style.display = "block";
        try {
          const r = el.getBoundingClientRect?.();
          if (!r || (!r.width && !r.height)) return;
          const tr = tipBox.getBoundingClientRect?.() || { width: 220, height: 36 };
          const vw = globalThis.innerWidth || document.documentElement?.clientWidth || 1280;
          const vh = globalThis.innerHeight || document.documentElement?.clientHeight || 800;
          const tipW = tr.width || 220;
          const tipH = tr.height || 36;
          let left = r.left + r.width / 2 - tipW / 2;
          left = Math.max(8, Math.min(left, vw - tipW - 8));
          let top = r.top - tipH - 8;
          if (top < 8) top = Math.min(vh - tipH - 8, r.bottom + 8);
          tipBox.style.left = Math.round(left) + "px";
          tipBox.style.top = Math.round(top) + "px";
        } catch {}
      };
      const __bindPackTip = (el, tipTextOrFn, onHoverChange) => {
        const getTip = () => {
          const t = typeof tipTextOrFn === "function" ? tipTextOrFn() : tipTextOrFn;
          return typeof t === "string" ? t.trim() : "";
        };
        const syncMeta = () => {
          const t = getTip();
          if (!t) return "";
          el.setAttribute("data-agy-tip", t);
          el.setAttribute("aria-label", t);
          return t;
        };
        syncMeta();
        el.onmouseenter = () => {
          if (typeof onHoverChange === "function") onHoverChange(true);
          const t = syncMeta();
          if (t) __showPackTip(el, t);
        };
        el.onmouseleave = () => {
          if (typeof onHoverChange === "function") onHoverChange(false);
          if (__tipTarget === el) __hidePackTip();
        };
        el.onfocus = () => {
          const t = syncMeta();
          if (t) __showPackTip(el, t);
        };
        el.onblur = () => {
          if (typeof onHoverChange === "function") onHoverChange(false);
          if (__tipTarget === el) __hidePackTip();
        };
      };
      const __bindBtnPress = (el, primary = false, isActiveFn = null) => {
        el.style.transition = "background .14s ease, transform .08s ease, opacity .14s ease, border-color .14s ease, filter .14s ease";
        const onHover = (entered) => {
          if (el.disabled) return;
          if (primary) {
            el.style.filter = entered ? "brightness(1.08)" : "";
          } else {
            const active = typeof isActiveFn === "function" && isActiveFn();
            if (!active) el.style.background = entered ? "rgba(127,127,127,0.12)" : "transparent";
          }
        };
        el.onmousedown = () => {
          if (!el.disabled) el.style.transform = "scale(0.97)";
        };
        el.onmouseup = () => {
          el.style.transform = "";
        };
        return onHover;
      };
      wrap.onmouseleave = __hidePackTip;

      let __cleanupGlobal = () => {};
      const __closePanel = () => {
        __cleanupGlobal();
        __hidePackTip();
        wrap.remove();
        __packUiRefs = null;
      };

      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;cursor:move;";
      const title = document.createElement("div");
      title.style.cssText = "font-weight:600;font-size:14px;";
      title.textContent = "Antigravity 汉化中心";
      const headActions = document.createElement("div");
      headActions.style.cssText = "display:flex;align-items:center;gap:6px;cursor:default;";
      const btnHeadReload = document.createElement("button");
      btnHeadReload.type = "button";
      btnHeadReload.textContent = "刷新界面";
      btnHeadReload.style.cssText = "padding:2px 7px;border-radius:5px;border:1px solid var(--border,rgba(127,127,127,.28));background:transparent;color:inherit;font-size:11px;cursor:pointer;opacity:.85;";
      __bindPackTip(btnHeadReload, "立即刷新当前客户端窗口（Ctrl+R），使配置与词库改动生效", __bindBtnPress(btnHeadReload, false));
      btnHeadReload.onclick = (ev) => { try { ev?.stopPropagation?.(); location.reload(); } catch {} };
      const btnClose = document.createElement("button");
      btnClose.type = "button";
      btnClose.textContent = "×";
      btnClose.style.cssText = "border:none;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7;padding:0 4px;border-radius:4px;";
      __bindPackTip(btnClose, "关闭汉化中心面板（Esc）", __bindBtnPress(btnClose, false));
      btnClose.onclick = (ev) => { ev?.stopPropagation?.(); __closePanel(); };
      headActions.appendChild(btnHeadReload);
      headActions.appendChild(btnClose);
      head.appendChild(title);
      head.appendChild(headActions);

      const verLine = document.createElement("div");
      verLine.style.cssText = "font-size:12px;opacity:.82;margin-bottom:10px;";

      const updCard = document.createElement("div");
      updCard.style.cssText = "padding:10px 12px;border-radius:8px;border:1px solid var(--border,rgba(127,127,127,.22));margin-bottom:10px;transition:border-color .25s ease, background .25s ease;";
      const statusLine = document.createElement("div");
      statusLine.style.cssText = "font-size:12.5px;white-space:pre-line;transition:color .2s ease;";
      const notesBox = document.createElement("div");
      notesBox.style.cssText = "display:none;margin-top:8px;padding:6px 8px;border-radius:6px;border:1px solid var(--border,rgba(127,127,127,.18));font-size:11.5px;opacity:.85;max-height:96px;overflow-y:auto;white-space:pre-wrap;";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;";

      const mkBtn = (label, primary = false, tip = "") => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText = primary
          ? "display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;border:1px solid var(--primary,#2563eb);background:var(--primary,#2563eb);color:#ffffff;cursor:pointer;font-size:12px;"
          : "display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;border:1px solid var(--border,rgba(127,127,127,.28));background:transparent;color:inherit;cursor:pointer;font-size:12px;";
        const hoverCb = __bindBtnPress(b, primary);
        if (tip) __bindPackTip(b, tip, hoverCb);
        else {
          b.onmouseenter = () => hoverCb(true);
          b.onmouseleave = () => hoverCb(false);
        }
        return b;
      };
      const btnCheck = mkBtn("检查更新", false, "联网核对 GitHub 最新汉化包版本与适配说明");
      const btnApply = mkBtn("立即更新（校验）", true, "从 GitHub 下载最新汉化包并校验 SHA-256 后自动更新");
      const btnSkip = mkBtn("跳过此版本", false, "忽略当前新版本提醒，之后打开不再提示此版本，仍可随时手动检查");
      const btnReload = mkBtn("立即刷新生效", true, "重新加载当前窗口界面，使新版汉化文案立刻生效");
      const linkRelease = document.createElement("a");
      linkRelease.target = "_blank";
      linkRelease.rel = "noreferrer";
      linkRelease.textContent = "GitHub 主页";
      linkRelease.style.cssText = "color:var(--link,#2563eb);text-decoration:none;font-size:12px;margin-left:auto;";
      __bindPackTip(linkRelease, "在浏览器打开项目 GitHub 主页，查看完整说明与安装包");
      actions.appendChild(btnCheck);
      actions.appendChild(btnApply);
      actions.appendChild(btnSkip);
      actions.appendChild(btnReload);
      actions.appendChild(linkRelease);
      updCard.appendChild(statusLine);
      updCard.appendChild(notesBox);
      updCard.appendChild(actions);

      const setBox = document.createElement("div");
      setBox.style.cssText = "padding-top:4px;";
      const setHead = document.createElement("div");
      setHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
      const setTitle = document.createElement("div");
      setTitle.style.cssText = "font-weight:600;font-size:12.5px;";
      setTitle.textContent = "汉化设置";
      const settingsTip = document.createElement("div");
      settingsTip.style.cssText = "font-size:11px;opacity:.78;transition:color .2s ease;";
      setHead.appendChild(setTitle);
      setHead.appendChild(settingsTip);
      setBox.appendChild(setHead);

      const settingButtons = [];
      const mkRow = (labelText, labelTip, key, opts) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;";
        const lbl = document.createElement("span");
        lbl.style.cssText = "font-size:12px;opacity:.9;cursor:help;";
        lbl.textContent = labelText;
        if (labelTip) __bindPackTip(lbl, labelTip);
        const grp = document.createElement("div");
        grp.style.cssText = "display:flex;gap:4px;";
        for (const [val, txt, btnTip] of opts) {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = txt;
          b.setAttribute("data-setting-key", key);
          b.setAttribute("data-setting-val", String(val));
          b.style.cssText = "padding:2px 7px;border-radius:5px;border:1px solid var(--border,rgba(127,127,127,.28));background:transparent;color:inherit;font-size:11.5px;cursor:pointer;";
          const hoverCb = __bindBtnPress(b, false, () => __packPanelState.settings[key] === val);
          if (btnTip) __bindPackTip(b, btnTip, hoverCb);
          b.onclick = () => __savePackSetting(key, val, txt);
          grp.appendChild(b);
          settingButtons.push({ key, val, btn: b });
        }
        row.appendChild(lbl);
        row.appendChild(grp);
        setBox.appendChild(row);
        return row;
      };
      mkRow(
        "汉化包自动更新",
        "控制打开或退出客户端时是否联网核对并更新汉化包",
        "packAutoUpdate",
        [
          ["auto", "自动", "发现新版本汉化包时自动下载、校验 SHA-256 并更新（推荐）"],
          ["ask", "询问", "检查到新版本汉化包时先弹窗询问，由你确认后再下载更新"],
          ["off", "关闭", "不自动联网检查汉化包更新，仅在点击检查更新时手动核对"],
        ],
      );
      const rowAutoFollow = mkRow(
        "客户端更新后",
        "设置 Antigravity 客户端自身升级后如何重新应用中文",
        "autoFollow",
        [
          ["auto", "自动", "Antigravity 客户端更新覆盖回英文后，自动重新应用中文（推荐）"],
          ["ask", "询问", "检测到客户端更新并恢复英文后，弹窗询问是否一键重新汉化"],
          ["off", "不处理", "客户端更新后不做自动处理，需要时可自行双击“启动中文”"],
        ],
      );
      mkRow(
        "界面联网补充",
        "客户端出现词典尚未收录的新英文界面文字时是否临时联网补充中文",
        "onlineTranslate",
        [
          [true, "开启", "遇到尚未收录的新增按钮或菜单时自动联网补充中文，不上传对话与代码（推荐）"],
          [false, "关闭", "仅使用本地人工校对词库，尚未收录的新增英文界面文字保持英文"],
        ],
      );
      mkRow(
        "对话标题翻译",
        "控制是否把右侧或列表中的纯英文新对话标题自动译为中文展示",
        "titleAutoTranslate",
        [
          [true, "开启", "自动把纯英文新对话标题译成中文显示，手动改过名的对话保留原名（推荐）"],
          [false, "关闭", "保持所有对话标题的原始显示，不自动翻译"],
        ],
      );

      const diagWrap = document.createElement("div");
      diagWrap.style.cssText = "margin-top:10px;padding-top:8px;border-top:1px solid var(--border,rgba(127,127,127,.18));";
      const diagHead = document.createElement("div");
      diagHead.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
      const diagToggle = document.createElement("button");
      diagToggle.type = "button";
      diagToggle.textContent = "▸ 运行状态与诊断";
      diagToggle.style.cssText = "border:none;background:transparent;color:inherit;font-size:11.5px;opacity:.78;cursor:pointer;padding:2px 4px;border-radius:4px;";
      __bindPackTip(diagToggle, "展开或收起词库数量、本页汉化计数及快速操作", __bindBtnPress(diagToggle, false));
      diagToggle.onclick = () => {
        __packPanelState.diagOpen = !__packPanelState.diagOpen;
        __packPanelState.diagMsg = "";
        __renderPackPanel();
      };
      const diagMsg = document.createElement("span");
      diagMsg.style.cssText = "font-size:11px;color:#16a34a;";
      diagHead.appendChild(diagToggle);
      diagHead.appendChild(diagMsg);

      const diagBody = document.createElement("div");
      diagBody.style.cssText = "display:none;margin-top:6px;padding:8px 10px;border-radius:8px;border:1px solid var(--border,rgba(127,127,127,.18));font-size:11.5px;line-height:1.55;";
      const diagText = document.createElement("div");
      diagText.style.cssText = "white-space:pre-line;opacity:.88;";
      const diagActions = document.createElement("div");
      diagActions.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:7px;";
      const btnRescan = mkBtn("重扫本页", false, "重新扫描当前页面 DOM 与对话标题列表，并刷新上方计数");
      btnRescan.style.fontSize = "11.5px";
      btnRescan.style.padding = "2px 8px";
      btnRescan.onclick = () => {
        const prev = stats.translatedTextNodes + stats.translatedAttributes;
        try { if (typeof document !== "undefined" && document.documentElement) translateTree(document.documentElement); } catch {}
        try { if (typeof __rescanConvTitlesFn === "function") __rescanConvTitlesFn(); } catch {}
        const diff = (stats.translatedTextNodes + stats.translatedAttributes) - prev;
        __packPanelState.diagMsg = diff > 0 ? ("已重扫，新处理 " + diff + " 处") : "已重扫本页";
        __renderPackPanel();
      };
      const btnCopyDiag = mkBtn("复制诊断", false, "复制版本、设置与当前覆盖统计到剪贴板，方便排查问题");
      btnCopyDiag.style.fontSize = "11.5px";
      btnCopyDiag.style.padding = "2px 8px";
      btnCopyDiag.onclick = async () => {
        const info = [
          "Antigravity 汉化包：v" + (__packPanelState.cur || "未知") + "（适配 " + (__packPanelState.maxApp || "未知") + "）",
          "系统平台：" + (__packPanelState.platform || "未知"),
          "词库规模：" + exactTranslations.size + " 条精确 + " + patternTranslations.length + " 条动态",
          "本页替换：" + stats.translatedTextNodes + " 文本 / " + stats.translatedAttributes + " 属性",
          "缓存统计：UI=" + __learnedUiTranslations.size + ", 标题=" + __learnedTitleTranslations.size + ", 手动保留=" + __manualTitleIds.size,
          "设置状态：" + JSON.stringify(__packPanelState.settings),
        ].join("\\n");
        try {
          if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(info);
            __packPanelState.diagMsg = "已复制诊断信息";
          } else {
            __packPanelState.diagMsg = "当前环境不支持剪贴板写入";
          }
        } catch {
          __packPanelState.diagMsg = "复制失败";
        }
        __renderPackPanel();
      };
      diagActions.appendChild(btnRescan);
      diagActions.appendChild(btnCopyDiag);
      diagBody.appendChild(diagText);
      diagBody.appendChild(diagActions);
      diagWrap.appendChild(diagHead);
      diagWrap.appendChild(diagBody);

      wrap.appendChild(head);
      wrap.appendChild(verLine);
      wrap.appendChild(updCard);
      wrap.appendChild(setBox);
      wrap.appendChild(diagWrap);
      wrap.appendChild(tipBox);
      document.body.appendChild(wrap);

      try {
        wrap.animate?.(
          [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 130, easing: "ease-out" },
        );
      } catch {}

      let dragging = false;
      let dragOffX = 0;
      let dragOffY = 0;
      head.onmousedown = (ev) => {
        if (!ev || ev.button !== 0) return;
        const t = ev.target;
        if (t && typeof t.closest === "function" && t.closest("button, a")) return;
        const rect = wrap.getBoundingClientRect?.();
        if (!rect) return;
        dragging = true;
        dragOffX = ev.clientX - rect.left;
        dragOffY = ev.clientY - rect.top;
        wrap.style.left = Math.round(rect.left) + "px";
        wrap.style.top = Math.round(rect.top) + "px";
        wrap.style.right = "auto";
        wrap.style.bottom = "auto";
        __hidePackTip();
        ev.preventDefault?.();
      };

      const onDocMouseMove = (ev) => {
        if (!dragging || !ev) return;
        const rect = wrap.getBoundingClientRect?.();
        const w = rect?.width || 396;
        const h = rect?.height || 300;
        const vw = globalThis.innerWidth || document.documentElement?.clientWidth || 1280;
        const vh = globalThis.innerHeight || document.documentElement?.clientHeight || 800;
        const nx = Math.max(8, Math.min(ev.clientX - dragOffX, vw - w - 8));
        const ny = Math.max(8, Math.min(ev.clientY - dragOffY, vh - h - 8));
        wrap.style.left = Math.round(nx) + "px";
        wrap.style.top = Math.round(ny) + "px";
      };
      const onDocMouseUp = () => { dragging = false; };
      const onDocKeyDown = (ev) => {
        if (ev?.key !== "Escape") return;
        const ae = document.activeElement;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
        __closePanel();
      };
      let ignoreInitialOutside = true;
      setTimeout(() => { ignoreInitialOutside = false; }, 0);
      const onDocMouseDownOutside = (ev) => {
        if (ignoreInitialOutside || !ev?.target) return;
        if (typeof wrap.contains === "function" && !wrap.contains(ev.target)) {
          __closePanel();
        }
      };
      if (typeof document.addEventListener === "function") {
        document.addEventListener("mousemove", onDocMouseMove);
        document.addEventListener("mouseup", onDocMouseUp);
        document.addEventListener("keydown", onDocKeyDown);
        document.addEventListener("mousedown", onDocMouseDownOutside);
      }
      __cleanupGlobal = () => {
        dragging = false;
        if (typeof document.removeEventListener === "function") {
          document.removeEventListener("mousemove", onDocMouseMove);
          document.removeEventListener("mouseup", onDocMouseUp);
          document.removeEventListener("keydown", onDocKeyDown);
          document.removeEventListener("mousedown", onDocMouseDownOutside);
        }
      };

      btnCheck.onclick = () => __runPanelCheck();
      btnApply.onclick = () => __runPanelApply();
      btnSkip.onclick = () => __runPanelSkip();
      btnReload.onclick = () => { try { location.reload(); } catch {} };

      __packUiRefs = {
        wrap, verLine, updCard, statusLine, notesBox, btnCheck, btnApply, btnSkip, btnReload, linkRelease,
        settingsTip, rowAutoFollow, settingButtons, tipBox, diagToggle, diagBody, diagText, diagMsg,
        flashCard: (color = "var(--primary,#2563eb)") => {
          try {
            if (typeof updCard.animate !== "function") return;
            updCard.style.borderColor = color;
            updCard.animate(
              [{ backgroundColor: "rgba(37,99,235,0.08)" }, { backgroundColor: "transparent" }],
              { duration: 520, easing: "ease-out" },
            );
            setTimeout(() => {
              if (__packUiRefs?.updCard === updCard) {
                updCard.style.borderColor = "var(--border,rgba(127,127,127,.22))";
              }
            }, 560);
          } catch {}
        },
        hideTipIfTargetHidden: () => {
          if (__tipTarget && (__tipTarget.style?.display === "none" || __tipTarget.disabled)) __hidePackTip();
        },
      };
      return __packUiRefs;
    } catch {
      return null;
    }
  };
  const __loadPackSettings = async () => {
    try {
      const resp = await fetch("agy-zhcn://settings");
      const ct = resp?.headers?.get?.("content-type") || "";
      if (!ct.includes("application/json")) return;
      const data = await resp.json().catch(() => null);
      if (!data || typeof data !== "object") return;
      __packPanelState.settingsLoaded = true;
      __packPanelState.writable = Boolean(data.writable);
      if (data.platform) __packPanelState.platform = data.platform;
      if (typeof data.hasHook === "boolean") __packPanelState.hasHook = data.hasHook;
      __packPanelState.settings = {
        packAutoUpdate: data.packAutoUpdate || "auto",
        autoFollow: data.autoFollow || "auto",
        onlineTranslate: Boolean(data.onlineTranslate),
        titleAutoTranslate: data.titleAutoTranslate !== false,
      };
    } catch {}
    __renderPackPanel();
  };
  const __savePackSetting = async (key, val, txt) => {
    if (__packSaveBusy || !__packPanelState.writable) return;
    __packSaveBusy = true;
    __packPanelState.settingsMsgOk = true;
    __packPanelState.settingsMsg = "正在保存…";
    __renderPackPanel();
    try {
      const payload = {};
      payload[key] = val;
      const resp = await fetch("agy-zhcn://settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => null);
      if (data && data.ok) {
        __packPanelState.settings[key] = val;
        __packPanelState.settingsMsgOk = true;
        __packPanelState.settingsMsg = (key === "onlineTranslate" || key === "titleAutoTranslate")
          ? ("✓ 已设为「" + txt + "」（部分已开页面可点右上角“刷新界面”生效）")
          : ("✓ 已保存：「" + txt + "」");
      } else {
        __packPanelState.settingsMsgOk = false;
        __packPanelState.settingsMsg = "保存失败，请重新打开客户端后再试";
      }
    } catch {
      __packPanelState.settingsMsgOk = false;
      __packPanelState.settingsMsg = "保存失败，请重新打开客户端后再试";
    } finally {
      __packSaveBusy = false;
      __renderPackPanel();
    }
  };
  const __runPanelCheck = async () => {
    if (__packCheckBusy) return;
    __packCheckBusy = true;
    const t0 = Date.now();
    __packPanelState.statusKind = "checking";
    __packPanelState.statusText = "正在连接 GitHub 检查最新版本…";
    __packPanelState.notes = "";
    __renderPackPanel();
    try {
      const cur = __packPanelState.cur || globalThis.__AGY_ZHCN_PACK_VERSION__ || "";
      const resp = await fetch("agy-zhcn://pack-update-check?mode=panel&current=" + encodeURIComponent(cur), { method: "POST" });
      const ct = resp?.headers?.get?.("content-type") || "";
      if (!ct.includes("application/json")) {
        __packPanelState.statusKind = "legacy";
        __packPanelState.statusText = "当前运行着旧版汉化文件，面板内的检查与改设置功能将在重新运行“启动中文”更新后启用，也可前往 GitHub 主页下载。";
        return;
      }
      const data = await resp.json().catch(() => null);
      if (!data || !data.handled) {
        __packPanelState.statusKind = "error";
        __packPanelState.statusText = "未能完成更新检查，请稍后重试或点右侧 GitHub 主页查看。";
        return;
      }
      const elapsedSec = Math.max(0.1, (Date.now() - t0) / 1000).toFixed(1);
      const timeStr = __fmtTimeNow();
      if (data.currentVersion) {
        __packPanelState.cur = data.currentVersion;
        globalThis.__AGY_ZHCN_PACK_VERSION__ = data.currentVersion;
      }
      if (data.maxAppVersion) {
        __packPanelState.maxApp = data.maxAppVersion;
        globalThis.__AGY_ZHCN_MAX_APP_VERSION__ = data.maxAppVersion;
      }
      if (data.releaseUrl) __packPanelState.releaseUrl = data.releaseUrl;
      if (typeof data.hasHook === "boolean") __packPanelState.hasHook = data.hasHook;
      if (data.platform) __packPanelState.platform = data.platform;
      if (data.status === "up-to-date") {
        __packPanelState.lastCheckAt = Date.now();
        __packPanelState.lastCheckMs = Date.now() - t0;
        __packPanelState.lastCheckTimeStr = timeStr;
        __packPanelState.statusKind = "latest";
        __packPanelState.statusText = "✓ 当前汉化包已是最新版本 v" + (__packPanelState.cur || data.latestVersion) + "（" + timeStr + " 已核对，用时 " + elapsedSec + " 秒）";
        __packUiRefs?.flashCard?.("#16a34a");
      } else if (data.status === "update-available") {
        __packPanelState.lastCheckAt = Date.now();
        __packPanelState.lastCheckMs = Date.now() - t0;
        __packPanelState.lastCheckTimeStr = timeStr;
        __packPanelState.statusKind = "available";
        __packPanelState.latestVer = data.latestVersion || "";
        __packPanelState.notes = data.notes || "";
        __packPanelState.statusText = data.hasHook
          ? ("发现新版本 v" + data.latestVersion + "（" + timeStr + " 核对），可点击下方按钮下载校验并更新。")
          : ("发现新版本 v" + data.latestVersion + "（" + timeStr + " 核对，请点右侧 GitHub 主页下载新版覆盖）。");
        __packUiRefs?.flashCard?.("var(--primary,#2563eb)");
      } else {
        __packPanelState.statusKind = "error";
        __packPanelState.statusText = "暂时无法获取最新版本（" + (data.reason || "网络异常") + "，" + timeStr + " 尝试），请稍后重试。";
        __packUiRefs?.flashCard?.("#dc2626");
      }
    } catch {
      __packPanelState.statusKind = "legacy";
      __packPanelState.statusText = "暂时无法在当前窗口检查更新，请重新运行“启动中文”或点右侧 GitHub 主页查看。";
    } finally {
      __packCheckBusy = false;
      __renderPackPanel();
    }
  };
  const __runPanelApply = async () => {
    if (__packCheckBusy) return;
    __packCheckBusy = true;
    __packPanelState.statusKind = "updating";
    __packPanelState.statusText = "正在下载并校验 SHA-256，请勿关闭窗口…";
    __renderPackPanel();
    try {
      const resp = await fetch("agy-zhcn://pack-update-apply", { method: "POST" });
      const data = await resp.json().catch(() => null);
      if (data && data.ok && data.status === "updated") {
        if (data.currentVersion) {
          __packPanelState.cur = data.currentVersion;
          globalThis.__AGY_ZHCN_PACK_VERSION__ = data.currentVersion;
        }
        if (data.maxAppVersion) {
          __packPanelState.maxApp = data.maxAppVersion;
          globalThis.__AGY_ZHCN_MAX_APP_VERSION__ = data.maxAppVersion;
        }
        __packPanelState.hot = Boolean(data.hot);
        __packPanelState.statusKind = "updated";
        __packPanelState.statusText = data.hot
          ? ("✓ 已更新至 v" + (__packPanelState.cur || "") + "！中文界面已更新，点下方按钮立即刷新（其余部分在下次退出客户端时自动完成）。")
          : ("✓ 已更新至 v" + (__packPanelState.cur || "") + "！已完成 SHA-256 校验，按 ⌘Q 退出后，重新打开一次“启动中文.command”即可完成更新。");
        __packUiRefs?.flashCard?.("#16a34a");
      } else {
        __packPanelState.statusKind = "error";
        __packPanelState.statusText = "这次更新没有完成，可以运行“启动中文”重试，或点右侧 GitHub 主页下载。";
      }
    } catch {
      __packPanelState.statusKind = "error";
      __packPanelState.statusText = "更新请求异常，可以运行“启动中文”重试，或点右侧 GitHub 主页下载。";
    } finally {
      __packCheckBusy = false;
      __renderPackPanel();
    }
  };
  const __runPanelSkip = async () => {
    if (__packCheckBusy || !__packPanelState.latestVer) return;
    __packCheckBusy = true;
    try {
      await fetch("agy-zhcn://pack-update-skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: __packPanelState.latestVer }),
      });
      __packPanelState.statusKind = "idle";
      __packPanelState.notes = "";
      __packPanelState.lastCheckAt = 0;
      __packPanelState.statusText = "已跳过 v" + __packPanelState.latestVer + "（启动时不再提醒此版本，你随时可点下方重新检查）。";
    } catch {} finally {
      __packCheckBusy = false;
      __renderPackPanel();
    }
  };
  const __openPackControlPanel = async () => {
    if (!__ensurePackPanel()) return;
    __packPanelState.cur = globalThis.__AGY_ZHCN_PACK_VERSION__ || __packPanelState.cur;
    __packPanelState.maxApp = globalThis.__AGY_ZHCN_MAX_APP_VERSION__ || __packPanelState.maxApp;
    __packPanelState.settingsMsg = "";
    __packPanelState.diagMsg = "";
    const recentlyChecked = __packPanelState.lastCheckAt > 0 && (Date.now() - __packPanelState.lastCheckAt) < 180000;
    if (!__packCheckBusy && !recentlyChecked) {
      __packPanelState.statusKind = "idle";
      __packPanelState.notes = "";
      __packPanelState.statusText = "正在读取设置与版本状态…";
    }
    __renderPackPanel();
    await __loadPackSettings();
    if (__packPanelState.settings.packAutoUpdate === "off") {
      if (!__packCheckBusy && __packPanelState.statusKind === "idle") {
        __packPanelState.statusText = "已关闭自动检查更新，可点击下方“检查更新”手动核对，或直接在下方调整汉化设置。";
        __renderPackPanel();
      }
      return;
    }
    if (recentlyChecked || __packPanelState.statusKind === "updated") return;
    await __runPanelCheck();
  };
  globalThis.__AGY_ZHCN_OPEN_PACK_PANEL__ = __openPackControlPanel;
  globalThis.__AGY_ZHCN_CHECK_PACK_UPDATE__ = () => __openPackControlPanel();

  const collectorRecords = [];
  const collector = {
    enabled: Boolean(globalThis.__AGY_ZHCN_COLLECTOR__?.enabled),
    dump() {
      return [...collectorRecords];
    },
    clear() {
      collectorRecords.length = 0;
    },
    record(entry) {
      if (!this.enabled || !entry || typeof entry.text !== "string") return;
      collectorRecords.push(entry);
    }
  };

  function isBlocked(element) {
    return Boolean(element?.closest?.(blockedSelector));
  }

  function isAttributeBlocked(element) {
    return Boolean(element?.closest?.(blockedAttributeSelector));
  }

  function translateValue(value) {
    if (typeof value !== "string" || value.length === 0) return null;
    const leading = value.match(/^\\s*/u)?.[0] ?? "";
    const trailing = value.match(/\\s*$/u)?.[0] ?? "";
    const coreEnd = value.length - trailing.length;
    const core = value.slice(leading.length, coreEnd);
    let exact = exactTranslations.get(core);
    if (exact !== undefined) return leading + exact + trailing;

    const normalizedCore = core.replace(/\\s+/g, " ");
    if (normalizedCore !== core) {
      exact = exactTranslations.get(normalizedCore);
      if (exact !== undefined) return leading + exact + trailing;
    }

    let m = normalizedCore.match(/^Your Plan:\\s*(.+)$/i);
    if (m) return leading + "你的方案：" + __translatePlanName(m[1]) + trailing;
    m = normalizedCore.match(/^Available AI Credits:\\s*(.+)$/i);
    if (m) return leading + "可用 AI 点数：" + m[1] + trailing;
    const __durLookup = (s) => {
      const v = exactTranslations.get(s);
      return v !== undefined ? v : null;
    };
    const __durTranslated = translateDynamicDurationText(normalizedCore, __durLookup);
    if (__durTranslated !== null) return leading + __durTranslated + trailing;
    m = normalizedCore.match(/^(\\d+)\\s*updates?$/i);
    if (m) return leading + m[1] + " 条进度更新" + trailing;
    m = normalizedCore.match(/^(\\d+)\\s*turns?$/i);
    if (m) return leading + m[1] + " 轮对话" + trailing;
    m = normalizedCore.match(/^Turn\\s+(\\d+)$/i);
    if (m) return leading + "第 " + m[1] + " 轮" + trailing;
    m = normalizedCore.match(/^Turns\\s+(\\d+)[\\u2013-](\\d+)$/i);
    if (m) return leading + "第 " + m[1] + "–" + m[2] + " 轮" + trailing;

    // Composite labels built from a variable (key combo, plugin name, command
    // label, conversation title): translate the variable via the dictionary
    // and wrap it, instead of leaving the whole label to machine translation.
    const __lookup = (s) => {
      const v = exactTranslations.get(s);
      return v !== undefined ? v : __lookupCaseFoldMultiWord(s);
    };
    m = normalizedCore.match(/^(Remove shortcut|Shortcut)\\s+(\\S+)\\s+for\\s+(.+)$/);
    if (m) {
      const action = __lookup(m[3]);
      if (action !== null) return leading + (m[1] === "Shortcut" ? "“" + action + "”的快捷键 " + m[2] : "删除“" + action + "”的快捷键 " + m[2]) + trailing;
    }
    m = normalizedCore.match(/^Add shortcut\\s+for\\s+(.+)$/);
    if (m) {
      const action = __lookup(m[1]);
      if (action !== null) return leading + "为“" + action + "”添加快捷键" + trailing;
    }
    m = normalizedCore.match(/^Adding\\.\\.\\.\\s+([A-Z0-9][A-Za-z0-9 .+-]{1,40})$/);
    if (m && !/[.]/.test(m[1])) {
      const nameZh = __PROTECTED_BRAND_SET.has(m[1]) ? m[1] : (__lookup(m[1]) ?? m[1]);
      return leading + "正在添加 " + nameZh + "..." + trailing;
    }
    m = normalizedCore.match(/^Added\\s+(Chrome DevTools|[A-Z][A-Za-z0-9 .+-]{1,40})$/);
    if (m && !/[.]/.test(m[1])) {
      const nameZh = __PROTECTED_BRAND_SET.has(m[1]) ? m[1] : (__lookup(m[1]) ?? m[1]);
      return leading + "已添加 " + nameZh + trailing;
    }
    m = normalizedCore.match(/^Plugin installed:\\s+(.{1,48})$/);
    if (m && !/[\\\\/]/.test(m[1])) {
      const pName = m[1].trim();
      const nameZh = __PROTECTED_BRAND_SET.has(pName) ? pName : (__lookup(pName) ?? pName);
      return leading + "已安装插件：" + nameZh + trailing;
    }
    m = normalizedCore.match(/^(.+?)\\s*\\(disabled by admin\\)$/);
    if (m) {
      const optZh = __lookup(m[1]);
      return leading + (optZh ?? m[1]) + "（已被管理员禁用）" + trailing;
    }
    m = normalizedCore.match(/^(Disable|Enable)\\s+(.+?)\\s+tool\\s+for\\s+(.+)$/);
    if (m) {
      return leading + (m[1] === "Disable" ? "禁用 " : "启用 ") + m[3] + " 中的 " + m[2] + " 工具" + trailing;
    }
    m = normalizedCore.match(/^failed to get load code assist response:\\s*error getting token source:\\s*You are not logged into Antigravity\\.?$/i);
    if (m) return leading + "获取代码辅助响应失败：无法获取令牌来源——你尚未登录 Antigravity。" + trailing;
    m = normalizedCore.match(/^Reset\\s+(.+?)\\s+to\\s+default$/);
    if (m) {
      const label = __lookup(m[1]);
      if (label !== null) return leading + "将“" + label + "”恢复为默认值" + trailing;
    }
    m = normalizedCore.match(/^Install\\s+((?:[A-Z0-9][\\w.+-]*|[a-z0-9]+\\.[a-z]{2,})(?:\\s+[A-Z0-9][\\w.+-]*){0,4})$/);
    if (m) return leading + "安装 " + m[1] + trailing;
    m = normalizedCore.match(/^(.+),\\s+(\\d+)\\s+turns?$/);
    if (m) {
      const title = __lookup(m[1]);
      if (title !== null) return leading + title + "，" + m[2] + " 轮对话" + trailing;
    }

    for (const { regex, target } of patternTranslations) {
      regex.lastIndex = 0;
      if (regex.test(core)) {
        regex.lastIndex = 0;
        return leading + __fmtEnDate(core.replace(regex, target)) + trailing;
      }
      if (normalizedCore !== core && regex.test(normalizedCore)) {
        regex.lastIndex = 0;
        return leading + __fmtEnDate(normalizedCore.replace(regex, target)) + trailing;
      }
    }

    const caseFoldHit = __lookupCaseFoldMultiWord(normalizedCore);
    if (caseFoldHit !== null) return leading + caseFoldHit + trailing;

    return null;
  }

  // =========================================================================
  // 三层漏斗智能兜底引擎：四道防机翻护栏 + 硬盘级永久自学习词库 + 对话标题持久化
  // =========================================================================
  const __autoPendingKeys = new Set();
  const __autoFailedRetryAt = new Map();
  const __AUTO_RETRY_COOLDOWN_MS = 15000;
  const __autoNodeSubscribers = new Map();
  let __autoPersistQueue = {};
  let __titlePersistQueue = {};
  let __autoPersistTimer = null;
  let __supportsTitleBucket = false;
  let __autoDictChecked = false;
  const __LOCAL_STORAGE_DICT_KEY = "__agy_zhcn_auto_learned_v1__";

  const __PROTECTED_BRAND_PHRASES = [
    "Google Workspace", "Google Cloud", "Google Docs", "Google Sheets", "Google Slides",
    "Google Drive", "Google Calendar", "Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen",
    "Gemini 3.8 Flash", "Claude Sonnet", "Claude Opus", "GPT-OSS", "Antigravity", "BigQuery",
    "Looker", "GitHub", "GitLab", "Bitbucket", "Linear", "Notion", "Figma", "Canva", "Vercel",
    "Netlify", "Railway", "Dropbox", "Databricks", "Auth0", "Arize AX", "Arize",
    "Orchestrator", "Gemini", "Claude", "Carbon", "Argon", "Hydrogen", "Tokens", "Token", "OAuth", "RBAC",
    "MCP", "SSO", "PAT", "CLI", "IDE", "SDK", "API", "WSL", "SSH", "JSON", "YAML", "HTML", "CSS",
    "Google AI Pro", "Google AI Plus", "Google AI Ultra", "Google AI Free", "Thinking effort",
    // Plugin marketplace / service names (src/lib/auto-learned-dict.mjs): keep as-is.
    ...${JSON.stringify(KEEP_ORIGINAL_NAMES)}
  ];
  const __PROTECTED_BRAND_SET = new Set(__PROTECTED_BRAND_PHRASES);

  const __PRE_ANCHOR_TERMS = [
    [/\\bglobal permissions\\b/gi, "全局权限"],
    [/\\bcontext windows?\\b/gi, "上下文窗口"],
    [/\\bsubagents?\\b/gi, "子智能体"],
    [/\\bagents?\\b/gi, "智能体"],
    [/\\bworkspaces?\\b/gi, "工作区"],
    [/\\bartifacts?\\b/gi, "工件"],
    [/\\bprompts?\\b/gi, "提示词"],
    [/\\bhooks?\\b/gi, "钩子"],
    [/\\bworktrees?\\b/gi, "工作树"],
    [/\\bswarms?\\b/gi, "蜂群"],
    [/\\bDoubao\\b/gi, "豆包"],
    [/\\bDouyin\\b/gi, "抖音"],
    [/\\bXiaohongshu\\b/gi, "小红书"],
    [/\\bFeishu\\b/gi, "飞书"],
    [/\\bWeChat\\b/gi, "微信"],
    [/\\bBilibili\\b/gi, "B站"]
  ];

  // Containers whose text must never be sent for online translation.
  // data-testid values are NOT matched as substrings: many ids carry a variable
  // part (e.g. "shortcut-row-" + commandId gives "shortcut-row-terminalSelectAll"),
  // and ids such as "bottom-terminal-panel-empty" are UI chrome, not content.
  const __CONTENT_CONTAINER_SELECTOR = [
    ".xterm",
    ".monaco-editor",
    "pre",
    "code",
    "[data-model-selector-list]",
    "[data-testid='model-selector-item']",
    "[data-testid*='account']",
    "[data-testid*='profile']",
    "[data-testid*='user']",
    "[data-testid='agent-response']",
    "[data-testid='artifact-view']",
    "[data-testid='side-question-answer']",
    "[data-testid='side-question-question']",
    "[data-testid='side-question-followup-user']",
    "[data-testid='subagent-tab-conversation']",
    "[data-testid='side-question-tab-conversation']",
    "[data-testid='comment-card-text']",
    "[data-testid='pill-comment-anchor-text']",
    "[data-testid='markdown-frontmatter']",
    "[data-testid='automation-instructions-markdown']",
    "[data-testid='background-task-command']",
    "[data-testid='setup-script-output']",
    "[data-testid='mcp-tool-step']",
    "[data-testid='vcs-commit-message']",
    "[data-testid='step-plan-item']"
  ].join(",");
  // Editable fields: their typed text is never translated, but their own
  // placeholder / aria-label / title are UI and may be.
  const __EDITABLE_SELECTOR = "textarea,input,[contenteditable='true'],[data-lexical-editor='true']";
  // Known conversation / transcript / terminal-output containers (prefix match).
  const __CONTENT_TESTID_EXPLICIT = /^(?:user-message(?!-actions)|live-transcript|live-agent-turn|live-user-turn|turn-cards-container|conversation-navigator-turn|transcript-line-text|transcript-work-line|voice-transcript-(?:card|summary)|pending-user-messages|queued-messages-card|webview-prompt-message|terminal(?:-tab)?-surface|standalone-terminal-view)/;
  // Fallback for ids added by future client versions: a whole token must be a
  // content word, and the id must not be a settings/shortcut scope or UI chrome.
  const __CONTENT_TESTID_WORDS = new Set(["turn", "turns", "message", "messages", "thinking", "thought", "thoughts", "terminal", "terminals", "transcript", "transcripts"]);
  const __CHROME_TESTID_FIRST = new Set(["shortcut", "shortcuts", "keybinding", "keybindings", "setting", "settings", "filter", "palette", "menu", "option", "nav", "navigation"]);
  const __CHROME_TESTID_TOKENS = new Set(["empty", "menu", "title", "button", "btn", "toggle", "resize", "handle", "sidebar", "warning", "nux", "starting", "creating", "connecting", "actions", "action", "expand", "copy", "error", "errors", "dismiss", "allow", "kill", "split", "delete", "glyph", "row", "item", "group", "tab", "tabs", "active", "divider", "header", "label", "badge", "icon", "tooltip", "status", "toolbar", "speaker", "timestamp", "blocked", "password", "diff", "cwd", "new", "and", "tasks", "panel"]);

  function __isContentTestId(id) {
    if (typeof id !== "string" || !id) return false;
    if (__CONTENT_TESTID_EXPLICIT.test(id)) return true;
    const tokens = id.toLowerCase().split(/[-_.:\\s]+/).filter(Boolean);
    if (!tokens.length || __CHROME_TESTID_FIRST.has(tokens[0])) return false;
    if (!tokens.some((x) => __CONTENT_TESTID_WORDS.has(x))) return false;
    return !tokens.some((x) => __CHROME_TESTID_TOKENS.has(x));
  }

  function __isInsideUserContent(el, isAttribute) {
    if (!el || typeof el.closest !== "function") return false;
    if (el.closest(__CONTENT_CONTAINER_SELECTOR)) return true;
    if (!isAttribute && el.closest(__EDITABLE_SELECTOR)) return true;
    if (isAttribute && el.parentElement && typeof el.parentElement.closest === "function" && el.parentElement.closest("[contenteditable='true'],[data-lexical-editor='true']")) return true;
    if (el.closest("[data-testid='changed-files-card']") && !el.closest("[data-testid='changed-files-card-header']")) return true;
    // Account and user profile cards: never send personal names / account info to online translator
    const card = el.closest(".flex-col, button, [role='button'], div");
    if (card && card.querySelector && card.querySelector(".rounded-full, [class*='avatar'], [data-tooltip-id*='account']")) {
      const text = card.textContent || "";
      if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) return true;
    }
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const id = node.getAttribute && node.getAttribute("data-testid");
      if (id && __isContentTestId(id)) return true;
    }
    return false;
  }

  const __PROJECT_SELECTOR_PLACEHOLDERS = new Set([
    "Select Project", "Select Workspace", "No project selected", "No Project",
    "选择项目", "选择工作区", "未选择项目", "无项目", "新建工作区"
  ]);
  const __SIDECAR_PROJECT_PLACEHOLDERS = new Set([
    "Project", "项目", "No projects created", "尚未创建项目",
    "Create a project first.", "请先创建一个项目。",
    "Select workspace", "Select Workspace", "Select project", "Select Project",
    "选择工作区", "选择项目"
  ]);
  const __LOCATION_PLACEHOLDERS = new Set([
    "This Computer", "Remote", "Local", "此计算机", "这台电脑", "本机", "远程", "本地"
  ]);
  const __PROTECTED_NATIVE_SELECTOR = [
    "[data-testid='project-header']",
    "[data-testid='project-selector-item']",
    "[data-testid='project-selector-github-repo-item']",
    "[data-testid='sidecar-project-link']",
    "[data-testid='jj-worktree-selector-label']",
    "[data-testid='jj-previous-worktree-option']",
    "[data-testid='declared-permissions-arg-folder']",
    "[data-testid='gcp-project-combobox-trigger']",
    "[data-testid='gcp-project-combobox-list']",
    "[data-testid='plugin-detail'] h1",
    "[data-testid='bundle-detail'] h1",
    "[data-testid='plugin-view-title-bar-title']",
    "[data-testid='mobile-plugin-view-title']",
    "[data-testid='plugin-detail-footer-author']",
    "[data-testid='plugin-detail-footer-version']",
    "[data-testid='plugins-submenu-item']",
    "[data-testid='plugins-submenu-mcp-app-item']",
    "[data-testid='mcp-config-variable'] label",
    "[data-testid='automation-name']",
    "[data-testid='coordinator-card-title']",
    "[data-testid='coordinator-hover-card-title']",
    "[data-testid='voice-picker-name']",
    "[data-testid='file-title-name']",
    "[data-testid='webview-download-filename']",
    "[data-testid='builtin-browser-download-dir-value']",
    "[data-testid='entity-pill']",
    "[data-testid='attached-context-pill']",
    "[data-testid='branch-pill-label']",
    "[data-testid='branch-option']",
    "[data-testid='branch-repo-label']",
    "[data-testid='permission-trigger-command'] .font-mono",
    "[data-testid='declared-permissions-arg'] label",
    "[data-testid='external-link-confirm-uri']",
    "[data-testid='url-security-host']",
    "[data-testid='browser-url-bar']",
    "[data-testid='browser-url-display']",
    "[data-testid='browser-site-data-site']",
    "[data-testid='webview-prompt-origin']",
    "[data-testid='ssh-host-label']",
    "[data-testid='ssh-connect-host-option']",
    "[data-testid='ssh-host-project-item']",
    "[data-testid='sidebar-wsl-label']",
    "[data-testid='side-question-origin']"
  ].join(",");

  function __hasPrevSiblingTestId(el, id) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const prev = node.previousElementSibling;
      if (prev && prev.getAttribute && prev.getAttribute("data-testid") === id) return true;
      if (node.getAttribute && node.getAttribute("data-testid") === "tab-file-tree-sidebar") break;
    }
    return false;
  }

  // Regions displaying local folder/file names, repos, branches, third-party
  // plugin/MCP names, commands, hosts or URLs: never translate via dictionary OR online MT.
  function __isProtectedNativeIdentifier(el, isAttribute = false, rawValue = "") {
    if (!el || typeof el.closest !== "function") return false;
    if (el.closest("[data-testid='project-selector-item-settings'], [data-testid='attached-context-pill-remove'], [data-testid='input-attachment-remove']")) {
      return false;
    }
    if (el.closest(__PROTECTED_NATIVE_SELECTOR)) return true;
    if (__hasPrevSiblingTestId(el, "file-tree-node-icon")) return true;

    const card = el.closest("[data-testid='customization-card']");
    if (card && Boolean(el.closest(".font-medium")) && !el.closest(".text-muted-foreground")) return true;

    const mcpRow = el.closest("[data-testid='mcp-server-row']");
    if (mcpRow && Boolean(el.closest(".font-medium")) && !el.closest("button, [role='button']")) return true;

    const sidecarRow = el.closest("[data-testid='sidecar-row']");
    if (sidecarRow && Boolean(el.closest("span.text-foreground"))) return true;

    const settingsNav = el.closest("[data-testid^='settings-nav-item-']");
    if (settingsNav) {
      const rowWrap = settingsNav.parentElement;
      const listWrap = rowWrap && rowWrap.parentElement;
      const prevBlock = listWrap && listWrap.previousElementSibling;
      const heading = prevBlock && (prevBlock.textContent || "").trim();
      if (heading === "Projects" || heading === "项目") return true;
    }

    const wsOpt = el.closest("[data-testid='project-customizations-workspace-filter'] option");
    if (wsOpt && (typeof wsOpt.getAttribute !== "function" ? wsOpt.value : wsOpt.getAttribute("value")) !== "all") return true;

    const textSample = (typeof rawValue === "string" && rawValue.trim() ? rawValue : (el.textContent || "")).trim();
    if (!isAttribute && el.closest("[data-testid='project-selector-trigger']")) {
      return Boolean(textSample) && !__PROJECT_SELECTOR_PLACEHOLDERS.has(textSample);
    }
    if (!isAttribute && el.closest("[data-testid='new-sidecar-project']")) {
      return Boolean(textSample) && !__SIDECAR_PROJECT_PLACEHOLDERS.has(textSample);
    }
    if (el.closest("[data-testid='input-attachment']")) {
      return !isAttribute || !el.closest("[data-testid='input-attachment-open']");
    }
    if (el.closest("[data-testid='voice-settings-name']")) {
      return Boolean(textSample) && textSample !== "Not set" && textSample !== "未设置";
    }
    if (el.closest("[data-testid='ssh-config-file-name']")) {
      return Boolean(textSample) && textSample !== "~/.ssh/config (default)" && textSample !== "~/.ssh/config（默认）";
    }
    if (el.closest("[data-testid='location-selector-trigger']") || (el.closest("[data-testid='location-local']") && !el.closest("span.block"))) {
      return Boolean(textSample) && !__LOCATION_PLACEHOLDERS.has(textSample);
    }
    const convRow = el.closest("[data-testid^='conversation-row-'][data-cascade-id]");
    if (convRow && textSample && !el.closest(".agy-row-actions, .agy-row-status, [data-testid='conversation-row-status'], button")) {
      const cid = typeof convRow.getAttribute === "function" ? convRow.getAttribute("data-cascade-id") : "";
      const isRowTitle = Boolean(el.closest(".truncate") || (isAttribute && el.tagName === "A"));
      if (isRowTitle && ((cid && __manualTitleIds.has(cid)) || __manualTitleTexts.has(textSample) || (!__isTitleAutoTranslateEnabled(__zhcnSettings) && __observedNonTranslatedTitles.has(textSample)))) {
        return true;
      }
    }
    if (textSample && (el.closest("[data-testid='breadcrumb-segment'], [data-testid='fast-pick-viewport']"))) {
      if (__manualTitleTexts.has(textSample) || (!__isTitleAutoTranslateEnabled(__zhcnSettings) && __observedNonTranslatedTitles.has(textSample))) {
        return true;
      }
    }
    return false;
  }

  // User switches from “汉化设置”, served by the patched main process.
  let __zhcnSettings = null;
  let __rescanConvTitlesFn = null;
  const __manualTitleIds = new Set();
  const __manualTitleTexts = new Set();
  const __observedNonTranslatedTitles = new Set();
  const __learnedTitleTranslations = new Map();
  // Machine translations of UI strings not yet in the curated dictionary (onlineTranslate).
  const __learnedUiTranslations = new Map();
  function __isUiOnlineTranslateEnabled(settings = __zhcnSettings) {
    return Boolean(settings && typeof settings === "object" && settings.onlineTranslate === true);
  }
  function __lookupLearnedUi(value) {
    if (typeof value !== "string" || value.length === 0) return null;
    const leading = value.match(/^\\s*/u)?.[0] ?? "";
    const trailing = value.match(/\\s*$/u)?.[0] ?? "";
    const core = value.slice(leading.length, value.length - trailing.length).replace(/\\s+/g, " ");
    const hit = core ? __learnedUiTranslations.get(core) : undefined;
    return typeof hit === "string" && hit !== core ? leading + hit + trailing : null;
  }
  function __isTitleAutoTranslateEnabled(settings = __zhcnSettings) {
    if (!settings || typeof settings !== "object") return false;
    if (typeof settings.titleAutoTranslate === "boolean") return settings.titleAutoTranslate;
    return settings.onlineTranslate === true && settings.autoTranslateTitles !== false;
  }
  function __isConversationTitleElement(el, isAttribute = false) {
    if (!el || typeof el.closest !== "function") return false;
    const convRow = el.closest("[data-testid^='conversation-row-'][data-cascade-id]");
    if (convRow && !el.closest(".agy-row-actions, .agy-row-status, [data-testid='conversation-row-status'], button")) {
      if (el.closest(".truncate") || (isAttribute && (el.tagName === "A" || el.tagName === "DIV" || el.tagName === "SPAN"))) {
        return true;
      }
    }
    if (el.closest("[data-testid='breadcrumb-segment'], [data-testid='fast-pick-viewport'], [data-testid='conversation-title']")) {
      return true;
    }
    if (el.closest("[data-testid='conversation-navigator-group-card-header']") && el.closest("[data-titled='true']")) {
      return true;
    }
    if (!isAttribute && el.tagName === "SPAN" && el.classList?.contains?.("truncate") && el.classList?.contains?.("text-secondary-foreground")) {
      const listBox = el.closest(".overflow-y-auto");
      const headingText = listBox?.parentElement?.firstElementChild?.textContent?.trim();
      if (headingText === "对话历史" || headingText === "Conversation History" || el.closest("[data-testid='recent-conversation-list']")) {
        return true;
      }
    }
    return false;
  }
  function __lookupLearnedTitle(value) {
    if (typeof value !== "string" || value.length === 0) return null;
    const leading = value.match(/^\\s*/u)?.[0] ?? "";
    const trailing = value.match(/\\s*$/u)?.[0] ?? "";
    const core = value.slice(leading.length, value.length - trailing.length);
    if (!core || __manualTitleTexts.has(core)) return null;
    const hit = __learnedTitleTranslations.get(core) ?? __learnedUiTranslations.get(core);
    return typeof hit === "string" && hit !== core ? leading + hit + trailing : null;
  }
  async function __loadZhcnSettings({ rescan = true } = {}) {
    try {
      if (typeof fetch === "function") {
        const [resp, manualResp] = await Promise.all([
          fetch("agy-zhcn://settings").catch(() => null),
          fetch("agy-zhcn://manual-titles").catch(() => null)
        ]);
        if (resp && resp.ok) __zhcnSettings = await resp.json().catch(() => null);
        if (manualResp && manualResp.ok) {
          const manualData = await manualResp.json().catch(() => null);
          if (manualData && Array.isArray(manualData.ids)) {
            for (const id of manualData.ids) if (typeof id === "string" && id.trim()) __manualTitleIds.add(id.trim());
          }
          if (manualData && Array.isArray(manualData.titles)) {
            for (const t of manualData.titles) if (typeof t === "string" && t.trim()) __manualTitleTexts.add(t.trim());
          }
        }
      }
    } catch (_) {}
    if (!__zhcnSettings || typeof __zhcnSettings !== "object") {
      __zhcnSettings = { onlineTranslate: false, titleAutoTranslate: false, titleWriteBack: false };
    }
    if (rescan && __isTitleAutoTranslateEnabled(__zhcnSettings) && typeof __rescanConvTitlesFn === "function") {
      try { __rescanConvTitlesFn(); } catch (_) {}
    }
    return __zhcnSettings;
  }
  // kind: "title" (conversation titles, titleAutoTranslate) or "ui" (UI fill-in, onlineTranslate).
  function __canAutoTranslateRuntime(kind = "title") {
    if (globalThis.__AGY_ZHCN_DISABLE_AUTO_TRANSLATE__ === true) return false;
    const enabled = kind === "ui" ? __isUiOnlineTranslateEnabled : __isTitleAutoTranslateEnabled;
    if (typeof globalThis.__AGY_ZHCN_CUSTOM_TRANSLATE_FETCH__ === "function") {
      if (__zhcnSettings && !enabled(__zhcnSettings)) return false;
      return true;
    }
    if (!enabled(__zhcnSettings)) return false;
    if (typeof window === "undefined" || typeof fetch !== "function") return false;
    const proto = window.location?.protocol || "";
    return proto === "https:" || proto === "http:" || proto === "agy-zhcn:" || proto === "file:";
  }
  function __canAutoTranslateTitlesRuntime() {
    return __canAutoTranslateRuntime("title");
  }

  function __isAccountCardElement(el) {
    if (!el || typeof el.closest !== "function") return false;
    const card = el.closest(".flex-col, button, [role='button'], div");
    if (card && card.querySelector && card.querySelector(".rounded-full, [class*='avatar'], [data-tooltip-id*='account']")) {
      const text = card.textContent || "";
      if (/[^\\s@]+@[^\\s@]+\\.[^\\s@]+/.test(text)) return true;
    }
    return false;
  }

  // 对话标题独立规则：只看标题本身开关与手动重命名，不与界面防误翻的后缀/域名/产品名限制混用。
  function __isEligibleTitleForAutoTranslate(core, parentEl = null) {
    if (typeof core !== "string") return false;
    const t = core.trim();
    if (t.length < 2 || t.length > 300) return false;
    if (!/[A-Za-z]/.test(t) || /[\\u4e00-\\u9fff]/.test(t)) return false;
    if (/^Conversation\\s+[0-9a-f]{6,}$/i.test(t) || /^[0-9a-f]{8}-[0-9a-f-]{12,}$/i.test(t)) return false;
    if (__manualTitleTexts.has(t)) return false;
    if (parentEl && (__isInsideUserContent(parentEl, false) || __isAccountCardElement(parentEl) || (typeof parentEl.closest === "function" && parentEl.closest("[data-testid='customization-card']")))) return false;
    return true;
  }

  function __isEligibleForAutoTranslate(core, parentEl, isTitle, isAttribute = false) {
    if (isTitle === true) return __isEligibleTitleForAutoTranslate(core, parentEl);
    if (typeof core !== "string") return false;
    // The main-process proxy rejects queries over 200 characters.
    if (core.trim().length > 200) return false;
    const t = core.trim();
    if (t.length < 6 || t.length > 600) return false;
    if (!/[A-Za-z]/.test(t) || /[\\u4e00-\\u9fff]/.test(t)) return false;
    if (!/[A-Za-z]{2,}[\\s\\-/]+[A-Za-z]{2,}/.test(t)) return false;
    if (/^Conversation\\s+[0-9a-f]{6,}$/i.test(t)) return false;
    if (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(t)) return false;
    if (/^(?:https?|file|agy|ws|wss|vscode|chrome-extension):\\/\\//i.test(t)) return false;
    if (/^[a-zA-Z]:[\\\\/]|^\\/[a-zA-Z0-9_\\-.]+|^\\.\\.?[\\\\/]/.test(t)) return false;
    if (/\\.(?:exe|dll|asar|js|mjs|cjs|json|md|py|sh|ps1|log|png|jpg|jpeg|svg|css|html|ts|tsx|db|pbtxt)$/i.test(t)) return false;
    if (/=>|\\bfunction\\s*\\(|[{}[\\]|\\\\<>=]|===|!==/.test(t)) return false;
    if (/^[0-9a-fA-F-]{16,64}$/.test(t)) return false;
    if (/(?:^@[a-z0-9_.-]+[/][a-z0-9_.-]+$|^[a-z0-9]+(?:[-_][a-z0-9]+)+$)/.test(t)) return false;
    if (/^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+$/.test(t)) return false;
    if (/^--[a-z0-9-]+$/i.test(t) || /^[.#][A-Za-z0-9_-]+(?:\\s+[.#]?[A-Za-z0-9_-]+)*$/.test(t) || /^["'].*["']$/.test(t)) return false;
    if (/[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+#\\d+/.test(t)) return false;
    if (/^Searching\\s+(?:marketplace\\s+for\\s+|github\\s+|["'\\x60])/i.test(t) || /^Searching\\s+.*(?:"|\\bOR\\b)/i.test(t)) return false;
    if (/^(?:application|text|image|audio|video|font|multipart)\\/[a-z0-9.+-]+$/i.test(t)) return false;
    if (/(?:width|height|max-width|min-width|display|grid-template|margin|padding|border-radius|gap)\\s*:/i.test(t) || /^(?=.*;)[a-z-]+:[^;]+(?:;[a-z-]+:[^;]*)+$/i.test(t)) return false;
    if (/\\b(?:Set|Get|Remove|New|Add|Clear|Copy|Move|Test|Invoke|Start|Stop|Write|Read)-[A-Z][A-Za-z0-9]+\\b|\\bEnv:[A-Za-z0-9_]+\\b/.test(t)) return false;
    if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+\\s+[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(t) || /^[（(][A-Za-z0-9\\s_-]+$/u.test(t)) return false;
    if (__PROTECTED_BRAND_SET.has(t)) return false;
    // Anything carrying a file name, link, path or inline code is (or quotes)
    // user content: never send it, wherever it appears in the string.
    if (/[a-z][a-z0-9+.-]*:\\/\\/|\\x60|(?:^|[\\s(])(?:~|\\.{1,2})?\\/[\\w.-]|[A-Za-z]:\\\\/i.test(t)) return false;
    if (/[\\w-]+\\.(?:[a-z]{1,4}\\d?|json|yaml|toml|lock|tsx|jsx|mjs|cjs|vbs|bat|cmd|ps1|txt|md|log|csv|pdf|png|jpe?g|gif|webp|svg|zip|exe|dll|asar|pbtxt)\\b(?![\\w-])/.test(t) && !/\\b(?:e\\.g|i\\.e|etc|vs)\\./i.test(t)) return false;
    if (/^(?:Gemini|Claude|GPT-OSS|Google|Antigravity|Orchestrator)\\s+[0-9A-Za-z.\\s()-]+$/i.test(t) && t.split(/\\s+/).length <= 4) return false;
    if (parentEl && (__isInsideUserContent(parentEl, isAttribute) || __isProtectedNativeIdentifier(parentEl, isAttribute, t))) return false;
    // Customization cards list the user's own skills, rules and plugins: their titles and
    // descriptions are user content. Official ones are covered by the curated dictionary.
    if (parentEl && typeof parentEl.closest === "function" && parentEl.closest("[data-testid='customization-card']")) return false;
    return true;
  }

  function __prepareAntiMtPayload(core, isTitle = false) {
    const placeholders = [];
    const putToken = (val) => {
      const idx = placeholders.length;
      placeholders.push(val);
      return "⟦" + idx + "⟧";
    };
    let text = core;
    text = text.replace(/\\x60[^\\x60]+\\x60/g, (m) => putToken(m));
    if (isTitle) {
      text = text.replace(/https?:\\/\\/[^\\s)）\\]]+/gi, (m) => putToken(m));
      text = text.replace(/\\b[A-Za-z0-9_.-]+\\.(?:txt|md|log|json|ya?ml|toml|lock|vbs|bat|cmd|ps1|sh|py|js|mjs|cjs|ts|tsx|jsx|csv|pdf|png|jpe?g|gif|webp|svg|zip|exe|dll|asar|pbtxt)\\b/gi, (m) => putToken(m));
      text = text.replace(/\\b[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.(?:com|org|net|io|dev|ai|cn)\\b/gi, (m) => putToken(m));
    }
    text = text.replace(/(?:^|\\s)(\\/[a-z][a-z0-9_-]*)/g, (m, cmd) => m.slice(0, m.length - cmd.length) + putToken(cmd));
    text = text.replace(/\\bv\\d+\\.\\d+(?:\\.\\d+)?(?:-[0-9A-Za-z.-]+)?\\b/g, (m) => putToken(m));

    for (let i = 0; i < __PROTECTED_BRAND_PHRASES.length; i++) {
      const phrase = __PROTECTED_BRAND_PHRASES[i];
      const escaped = phrase.replace(/[.*+?^{}$()|[\\]\\\\]/g, "\\\\$&");
      const reg = new RegExp("\\\\b" + escaped + "\\\\b", "g");
      text = text.replace(reg, (m) => putToken(m));
    }

    for (let i = 0; i < __PRE_ANCHOR_TERMS.length; i++) {
      text = text.replace(__PRE_ANCHOR_TERMS[i][0], __PRE_ANCHOR_TERMS[i][1]);
    }
    return { prepared: text, placeholders };
  }

  function __polishTranslatedZh(zhRaw, originalCore, placeholders, isTitle) {
    if (typeof zhRaw !== "string" || !zhRaw.trim()) return null;
    let out = zhRaw.trim();
    out = out.replace(/⟦\\s*(\\d+)\\s*⟧/g, (_, idxStr) => {
      const idx = Number(idxStr);
      return idx >= 0 && idx < placeholders.length ? placeholders[idx] : _;
    });
    if (/⟦\\s*\\d+\\s*⟧/.test(out)) return null;

    out = out
      .replace(/[\\u200b-\\u200d\\ufeff]/g, "")
      .replace(/您的/g, "你的")
      .replace(/您/g, "你")
      .replace(/工作空间/g, "工作区")
      .replace(/人工制品/g, "工件")
      .replace(/代理程序/g, "智能体")
      .replace(/([\\u4e00-\\u9fff])([A-Za-z0-9])/g, "$1 $2")
      .replace(/([A-Za-z0-9])([\\u4e00-\\u9fff])/g, "$1 $2")
      .replace(/\\s{2,}/g, " ")
      .trim();

    const turnSuffix = originalCore.trim().match(/,\\s+(\\d+)\\s+turns?$/);
    if (turnSuffix) {
      out = out.replace(/[，,]?\\s*\\d+\\s*(?:个)?(?:回合|轮(?:对话)?|转|圈|次|轮次)$/, "") + "，" + turnSuffix[1] + " 轮对话";
    }

    if (isTitle || !/[.!?]$/.test(originalCore.trim())) {
      out = out.replace(/[。.]+$/, "").trim();
    }
    if (!/[\\u4e00-\\u9fff]/.test(out)) return null;
    return out;
  }

  async function __requestRemoteTranslate(preparedText, kind = "title") {
    if (typeof globalThis.__AGY_ZHCN_CUSTOM_TRANSLATE_FETCH__ === "function") {
      return await globalThis.__AGY_ZHCN_CUSTOM_TRANSLATE_FETCH__(preparedText, kind);
    }
    const makeTimeoutOpts = () => (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") ? { signal: AbortSignal.timeout(8000) } : {};
    try {
      const proxyResp = await fetch("agy-zhcn://translate?kind=" + (kind === "ui" ? "ui" : "title") + "&q=" + encodeURIComponent(preparedText), makeTimeoutOpts());
      if (proxyResp && proxyResp.ok) {
        const proxyJson = await proxyResp.json();
        if (proxyJson && proxyJson.ok && typeof proxyJson.translated === "string") {
          return proxyJson.translated;
        }
      }
    } catch (_) {}

    // No direct request from the page: the main-process proxy is the single
    // network exit and it enforces the user's online-translation switch.
    return null;
  }

  function __persistAutoLearnedEntry(enKey, zhVal, isTitle = true) {
    (isTitle ? __learnedTitleTranslations : __learnedUiTranslations).set(enKey, zhVal);
    // The on-disk dictionary (agy-zhcn://auto-dict) is the only store, so entries
    // removed or filtered there cannot come back from a browser-side copy.
    if (isTitle) __titlePersistQueue[enKey] = zhVal;
    else __autoPersistQueue[enKey] = zhVal;
    if (!__autoPersistTimer) {
      __autoPersistTimer = setTimeout(async () => {
        const uiBatch = __autoPersistQueue;
        const titleBatch = __titlePersistQueue;
        __autoPersistQueue = {};
        __titlePersistQueue = {};
        __autoPersistTimer = null;
        try {
          if (typeof globalThis.__AGY_ZHCN_ON_PERSIST_DICT__ === "function") {
            await globalThis.__AGY_ZHCN_ON_PERSIST_DICT__({ ...uiBatch, ...titleBatch }, { entries: uiBatch, titles: titleBatch });
          } else if (typeof fetch === "function") {
            if (!__autoDictChecked) {
              __autoDictChecked = true;
              const probeResp = await fetch("agy-zhcn://auto-dict").catch(() => null);
              if (probeResp && probeResp.ok) {
                const probeData = await probeResp.json().catch(() => null);
                if (probeData && (probeData.supportsTitleBucket === true || (probeData.titles && typeof probeData.titles === "object"))) {
                  __supportsTitleBucket = true;
                }
              }
            }
            const payload = __supportsTitleBucket
              ? { entries: uiBatch, titles: titleBatch }
              : { entries: { ...uiBatch, ...titleBatch }, titles: titleBatch };
            await fetch("agy-zhcn://auto-dict", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }).catch(() => {});
          }
        } catch (_) {}
      }, 300);
    }
  }

  // Keep in sync with OBSOLETE_LEARNED_KEY_PATTERNS in auto-learned-dict.mjs.
  const __OBSOLETE_LEARNED_KEY_PATTERNS = [
    /^Thinking\\s+effort$/i,
    /^GitHub\\s+Release\\s+/i,
    /^Load(?:ing)?\\s+older\\s+messages/i,
    /^Plan,\\s*\\d+\\s+of\\s+\\d+\\s+steps?\\s+done$/i,
    /^\\d+[/]\\d+\\s+steps?/i,
    /^Leaving\\s+Soon$/i,
    /\\bLeaving\\s+on\\s+[A-Za-z]+\\s+\\d/i,
    /^Model:.*Model cannot be changed/i,
    /^Extra\\s+High$/i,
    /^Available on paid\\b/i,
    /^Paid\\s+(?:Plus|Pro|Ultra)$/i,
    /^Toggle\\s+Swarm$/i,
    /(?:^@[a-z0-9_.-]+[/][a-z0-9_.-]+$|^[a-z0-9]+(?:[-_][a-z0-9]+)+$)/,
    /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+$/,
    /^--[a-z0-9-]+$/i,
    /^[.#][A-Za-z0-9_-]+(?:\\s+[.#]?[A-Za-z0-9_-]+)*$/,
    /^["'\\x60].*["'\\x60]$/,
    /[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+#\\d+/,
    /^Searching\\s+(?:marketplace\\s+for\\s+|github\\s+|["'\\x60])/i,
    /^Searching\\s+.*(?:"|\\bOR\\b)/i,
    /^(?:Remove shortcut|Shortcut)\\s+\\S+\\s+for\\s+/,
    /^Add\\s+shortcut\\s+for\\s+/,
    /^Install\\s+\\S/,
    /^Reset\\s+.+\\s+to\\s+default$/,
    /,\\s+\\d+\\s+turns?$/,
    /^Waiting\\s+for\\s+.+?\\s+timer(?:,|\\s*\\u00b7|\\s*·)/i,
    /^.+?\\s+timer:\\s*Timer\\s+has\\s+expired$/i,
    /^No\\s+more\\s+older\\s+messages,\\s*showing\\s+\\d+\\s+of\\s+\\d+$/i,
    /^(?:Adding\\.\\.\\.\\s+\\S|Plugin\\s+installed:\\s+\\S)/,
    /^Added\\s+(?:Chrome DevTools|[A-Z][A-Za-z0-9 .+-]{1,40})$/,
    /^(?:failed to get load code assist response:|This service has been disabled in this account for violation of Terms of Service)/i,
    /(?:width|height|max-width|min-width|display|grid-template|margin|padding|border-radius|gap)\\s*:/i,
    /^(?:application|text|image|audio|video|font|multipart)\\/[a-z0-9.+-]+$/i,
    /\\b(?:Set|Get|Remove|New|Add|Clear|Copy|Move|Test|Invoke|Start|Stop|Write|Read)-[A-Z][A-Za-z0-9]+\\b|\\bEnv:[A-Za-z0-9_]+\\b/,
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+\\s+[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/,
    /^[（(][A-Za-z0-9\\s_-]+$/u,
    /[a-z][a-z0-9+.-]*:\\/\\/|\\x60|(?:^|[\\s(])(?:~|\\.{1,2})?\\/[\\w.-]|[A-Za-z]:\\\\/i,
    /[\\w-]+\\.(?:txt|md|log|json|ya?ml|toml|lock|vbs|bat|cmd|ps1|sh|py|js|mjs|cjs|ts|tsx|jsx|csv|pdf|png|jpe?g|gif|webp|svg|zip|exe|dll|asar|pbtxt)\\b/i
  ];
  function __isObsoleteLearnedKey(k) {
    if (typeof k !== "string" || __PROTECTED_BRAND_SET.has(k) || __OBSOLETE_LEARNED_KEY_PATTERNS.some((re) => re.test(k))) return true;
    // A curated pattern rule wins over an earlier machine translation.
    return patternTranslations.some(({ regex }) => { regex.lastIndex = 0; return regex.test(k); });
  }

  async function __loadPersistedAutoDict() {
    let loadedAny = false;
    // Older versions mirrored learned entries in localStorage; drop that copy.
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(__LOCAL_STORAGE_DICT_KEY);
    } catch (_) {}

    try {
      if (typeof fetch === "function" && typeof window !== "undefined") {
        const resp = await fetch("agy-zhcn://auto-dict").catch(() => null);
        if (resp && resp.ok) {
          __autoDictChecked = true;
          const data = await resp.json().catch(() => null);
          if (data && typeof data === "object") {
            if (data.supportsTitleBucket === true || (data.titles && typeof data.titles === "object")) {
              __supportsTitleBucket = true;
            }
            const titlesOn = __isTitleAutoTranslateEnabled(__zhcnSettings);
            const uiOn = __isUiOnlineTranslateEnabled(__zhcnSettings);
            if (titlesOn && data.titles && typeof data.titles === "object") {
              for (const [k, v] of Object.entries(data.titles)) {
                if (typeof k !== "string" || typeof v !== "string" || exactTranslations.has(k) || __manualTitleTexts.has(k)) continue;
                if (__isEligibleTitleForAutoTranslate(k)) {
                  __learnedTitleTranslations.set(k, v);
                  loadedAny = true;
                }
              }
            }
            if (data.exact && typeof data.exact === "object") {
              for (const [k, v] of Object.entries(data.exact)) {
                if (
                  typeof k !== "string" ||
                  typeof v !== "string" ||
                  exactTranslations.has(k) ||
                  __manualTitleTexts.has(k) ||
                  __isObsoleteLearnedKey(k)
                ) continue;
                if (uiOn && __isEligibleForAutoTranslate(k, null, false)) {
                  __learnedUiTranslations.set(k, v);
                  loadedAny = true;
                }
                if (titlesOn && !__learnedTitleTranslations.has(k) && __isEligibleTitleForAutoTranslate(k)) {
                  __learnedTitleTranslations.set(k, v);
                  loadedAny = true;
                }
              }
            }
          }
        }
      }
    } catch (_) {}

    if (loadedAny && typeof document !== "undefined" && document.documentElement) {
      translateTree(document.documentElement);
    }
  }

  async function __translateAndLearnAsync(core, { isTitle = false } = {}) {
    const kind = isTitle === true ? "title" : "ui";
    const learned = kind === "title" ? __learnedTitleTranslations : __learnedUiTranslations;
    const normalized = core.trim().replace(/\\s+/g, " ");
    if (exactTranslations.has(normalized)) return exactTranslations.get(normalized);
    if (learned.has(normalized)) return learned.get(normalized);
    if (kind === "title" && __learnedUiTranslations.has(normalized) && !__manualTitleTexts.has(normalized)) {
      const reused = __learnedUiTranslations.get(normalized);
      __learnedTitleTranslations.set(normalized, reused);
      return reused;
    }
    const retryAt = __autoFailedRetryAt.get(normalized);
    if (!__canAutoTranslateRuntime(kind) || (retryAt && Date.now() < retryAt)) return null;
    if (__autoPendingKeys.has(normalized)) {
      return new Promise((resolve) => {
        const list = __autoNodeSubscribers.get(normalized) || [];
        list.push(resolve);
        __autoNodeSubscribers.set(normalized, list);
      });
    }
    __autoPendingKeys.add(normalized);
    try {
      const { prepared, placeholders } = __prepareAntiMtPayload(normalized, isTitle === true);
      const rawTranslated = await __requestRemoteTranslate(prepared, kind);
      const polished = __polishTranslatedZh(rawTranslated, normalized, placeholders, isTitle);
      if (polished && polished !== normalized) {
        __autoFailedRetryAt.delete(normalized);
        __persistAutoLearnedEntry(normalized, polished, kind === "title");
        if (core.trim() !== normalized) {
          __persistAutoLearnedEntry(core.trim(), polished, kind === "title");
        }
        const waiters = __autoNodeSubscribers.get(normalized) || [];
        __autoNodeSubscribers.delete(normalized);
        for (const fn of waiters) fn(polished);
        return polished;
      }
      __autoFailedRetryAt.set(normalized, Date.now() + __AUTO_RETRY_COOLDOWN_MS);
    } catch (_) {
      __autoFailedRetryAt.set(normalized, Date.now() + __AUTO_RETRY_COOLDOWN_MS);
    } finally {
      __autoPendingKeys.delete(normalized);
      const waiters = __autoNodeSubscribers.get(normalized);
      if (waiters) {
        __autoNodeSubscribers.delete(normalized);
        for (const fn of waiters) fn(null);
      }
    }
    return null;
  }

  globalThis.__AGY_ZHCN_AUTO_TRANSLATE__ = __translateAndLearnAsync;
  globalThis.__AGY_ZHCN_LOAD_SETTINGS__ = __loadZhcnSettings;
  globalThis.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__ = __isEligibleForAutoTranslate;
  globalThis.__AGY_ZHCN_IS_TITLE_ELIGIBLE__ = __isEligibleTitleForAutoTranslate;
  globalThis.__AGY_ZHCN_IS_PROTECTED_ELEMENT__ = __isProtectedNativeIdentifier;
  globalThis.__AGY_ZHCN_TRANSLATE_VALUE__ = translateValue;
  globalThis.__AGY_ZHCN_LOOKUP__ = (text) => exactTranslations.get(text) ?? __learnedTitleTranslations.get(text) ?? __learnedUiTranslations.get(text);
  globalThis.__AGY_ZHCN_PREPARE_ANTI_MT__ = __prepareAntiMtPayload;
  globalThis.__AGY_ZHCN_POLISH_ZH__ = __polishTranslatedZh;

  let __titleWatcherBoundStore = null;
  const __processedConvTitleMap = new Map();
  const __titleInFlightSet = new Set();
  let __titleRefreshTimer = null;
  function __scheduleTitleRefresh() {
    if (__titleRefreshTimer || typeof document === "undefined") return;
    __titleRefreshTimer = setTimeout(() => {
      __titleRefreshTimer = null;
      try {
        if (document.documentElement) translateTree(document.documentElement);
      } catch (_) {}
    }, 200);
  }
  globalThis.__AGY_ZHCN_RECORD_MANUAL_TITLE__ = function(cascadeId, title) {
    const cid = typeof cascadeId === "string" ? cascadeId.trim() : "";
    const txt = typeof title === "string" ? title.trim() : "";
    if (cid) __manualTitleIds.add(cid);
    if (txt) {
      __manualTitleTexts.add(txt);
      __observedNonTranslatedTitles.add(txt);
      if (__learnedTitleTranslations.has(txt)) __learnedTitleTranslations.delete(txt);
    }
    if (cid || txt) {
      try {
        if (typeof fetch === "function" && typeof window !== "undefined") {
          fetch("agy-zhcn://manual-titles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cascadeId: cid, title: txt })
          }).catch(() => {});
        }
      } catch (_) {}
    }
  };
  globalThis.__AGY_ZHCN_BIND_TITLE_WATCHER__ = function(store, updateAnnotationsFn) {
    if (!store || typeof store.getState !== "function" || typeof store.subscribe !== "function") return;
    if (__titleWatcherBoundStore === store) return;
    __titleWatcherBoundStore = store;

    const scanSummaries = () => {
      try {
        const st = store.getState();
        const buckets = [st?.trajectorySummaries?.summaries, st?.trajectorySummaries?.externalSummaries];
        for (const summaries of buckets) {
          if (!summaries || typeof summaries !== "object") continue;
          for (const [cascadeId, item] of Object.entries(summaries)) {
            if (!item) continue;
            const rawTitle = (item.annotations?.title?.trim() || item.summary?.trim() || "");
            if (!rawTitle || /[\\u4e00-\\u9fff]/.test(rawTitle)) continue;
            if (__manualTitleIds.has(cascadeId) || (__zhcnSettings && !__isTitleAutoTranslateEnabled(__zhcnSettings))) {
              __observedNonTranslatedTitles.add(rawTitle);
              continue;
            }
            if (__processedConvTitleMap.get(cascadeId) === rawTitle) continue;
            if (!__isEligibleTitleForAutoTranslate(rawTitle)) continue;

            const localTry = exactTranslations.get(rawTitle) || __translateChapterTitle(rawTitle);
            const applyTitle = (zhTitle) => {
              if (!zhTitle || !/[\\u4e00-\\u9fff]/.test(zhTitle) || zhTitle === rawTitle) return;
              if (__manualTitleIds.has(cascadeId) || (__zhcnSettings && !__isTitleAutoTranslateEnabled(__zhcnSettings))) return;
              __processedConvTitleMap.set(cascadeId, rawTitle);
              if (!__zhcnSettings || __zhcnSettings.titleWriteBack !== true) {
                // Default: display only. The stored conversation title is untouched,
                // so restoring English brings the original title back.
                __learnedTitleTranslations.set(rawTitle, zhTitle);
                __scheduleTitleRefresh();
                return;
              }
              try {
                const helpers = globalThis.__AGY_ZHCN_ANNOT_HELPERS__;
                if (helpers && typeof helpers.localAction === "function") {
                  store.dispatch(helpers.localAction({ cascadeId, annotations: { title: zhTitle } }));
                }
                if (typeof updateAnnotationsFn === "function" && helpers && typeof helpers.makeProto === "function") {
                  updateAnnotationsFn(cascadeId, helpers.makeProto({ title: zhTitle }), true).catch?.(() => {});
                }
              } catch (_) {}
            };

            if (localTry && localTry !== rawTitle && !/[A-Za-z]{4,}/.test(localTry.replace(/\\b(?:Chrome|Google|Gemini|Claude|Antigravity|GitHub|Swarm|MCP|Remotion|CAD|PPT|YouTube|AI|UI|CLI|IDE)\\b/gi, ""))) {
              applyTitle(localTry);
            } else if (__canAutoTranslateTitlesRuntime()) {
              const flightKey = cascadeId + "::" + rawTitle;
              if (__titleInFlightSet.has(flightKey)) continue;
              __titleInFlightSet.add(flightKey);
              __translateAndLearnAsync(rawTitle, { isTitle: true }).then((zhTitle) => {
                if (zhTitle) applyTitle(zhTitle);
              }).finally(() => {
                __titleInFlightSet.delete(flightKey);
              });
            }
          }
        }
      } catch (_) {}
    };

    __rescanConvTitlesFn = scanSummaries;
    scanSummaries();
    let debounceTimer = null;
    store.subscribe(() => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        scanSummaries();
      }, 300);
    });
  };

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || isBlocked(parent)) return;
    const rawVal = node.nodeValue;

    // 自动化与定时任务页面空状态及新建按钮靶向拦截
    if (typeof parent.closest === "function") {
      const sidecarEmpty = parent.closest("[data-testid='sidecar-list-empty']");
      if (sidecarEmpty) {
        const p = parent.tagName === "P" ? parent : parent.closest("p");
        if (p) {
          const txt = (p.textContent || "").trim();
          if (txt === "No automations yet") {
            p.textContent = "暂无自动化";
            stats.translatedTextNodes += 1;
            return;
          }
          if (txt === "No scheduled tasks yet") {
            p.textContent = "暂无定时任务";
            stats.translatedTextNodes += 1;
            return;
          }
        }
      }
      const sidecarBtn = parent.closest("[data-testid='sidecar-new-button']");
      if (sidecarBtn) {
        if (rawVal && rawVal.trim() === "New") {
          node.nodeValue = rawVal.replace("New", "新建");
          stats.translatedTextNodes += 1;
          return;
        }
      }
      const swarmEmptyBody = parent.closest("[data-testid='swarm-empty-body']");
      if (swarmEmptyBody) {
        const txt = (swarmEmptyBody.textContent || "").replace(/\\s+/g, " ").trim();
        if (/^Swarms started in this conversation appear here automatically\\b/.test(txt)) {
          swarmEmptyBody.innerHTML = "在此对话中启动的蜂群会自动显示在这里，包含留言板、成员与 @提及关系图。使用 <code>/swarm</code> 启动。";
          stats.translatedTextNodes += 1;
          return;
        }
        if (/^Open this pane from a conversation to see its swarm\\./.test(txt)) {
          swarmEmptyBody.innerHTML = "请从某个对话中打开此面板以查看对应的蜂群。在对话中启动的蜂群会自动显示在这里；使用 <code>/swarm</code> 启动。";
          stats.translatedTextNodes += 1;
          return;
        }
      }
      if (parent.closest("#ov-notice, #replay-label, #ov-ack")) {
        const fmtSwarmDur = (s) => String(s || "")
          .replace(/(\\d+)h\\s*(\\d+)m/g, "$1 小时 $2 分")
          .replace(/(\\d+)m\\s*(\\d+)s/g, "$1 分 $2 秒")
          .replace(/(\\d+)s\\b/g, "$1 秒");
        if (parent.closest("#ov-notice")) {
          if (/^The narrator \\($/.test(rawVal)) {
            node.nodeValue = "旁白员 (";
            stats.translatedTextNodes += 1;
            return;
          }
          if (/^\\) was stopped\\. Ask the coordinator to add a new one \\($/.test(rawVal)) {
            node.nodeValue = ") 已停止。请让协调者新增一个 (";
            stats.translatedTextNodes += 1;
            return;
          }
        }
        if (parent.closest("#replay-label")) {
          const overMatch = rawVal.match(/^\\s*over\\s+(.+)$/);
          if (overMatch) {
            node.nodeValue = "，历时 " + fmtSwarmDur(overMatch[1]);
            stats.translatedTextNodes += 1;
            return;
          }
          const ofMatch = rawVal.match(/^\\s*of\\s+(\\d+)\\s*·\\s*(#\\d+)\\s+at\\s+(.+?)\\s*\\(\\+([^)]+)\\)$/);
          if (ofMatch) {
            node.nodeValue = " / " + ofMatch[1] + " · " + ofMatch[2] + " 于 " + ofMatch[3] + " (+" + fmtSwarmDur(ofMatch[4]) + ")";
            stats.translatedTextNodes += 1;
            return;
          }
          const ofSimple = rawVal.match(/^\\s*of\\s+(\\d+)$/);
          if (ofSimple) {
            node.nodeValue = " / " + ofSimple[1];
            stats.translatedTextNodes += 1;
            return;
          }
        }
        if (parent.closest("#ov-ack")) {
          const ackMatch = rawVal.match(/^Last change:\\s*(.+)$/);
          if (ackMatch) {
            node.nodeValue = "最近修改：" + ackMatch[1];
            stats.translatedTextNodes += 1;
            return;
          }
        }
      }
      if ((rawVal || "").trim() === "Now" && ((parent.tagName === "SPAN" && parent.parentElement?.classList?.contains?.("o2-thn")) || parent.classList?.contains?.("o2-rtag"))) {
        node.nodeValue = rawVal.replace("Now", "当前");
        stats.translatedTextNodes += 1;
        return;
      }
      const effortTarget = parent.closest("[data-testid='model-selector-effort-option'], [data-effort], [data-testid='model-selector-trigger'], [data-testid='model-selector-effort-group']");
      const isEffortBadge = !effortTarget && (parent.classList?.contains?.("opacity-70") && parent.parentElement?.closest?.("[data-testid='model-selector-trigger'], [data-testid='model-selector-item'], div[role='menuitem']"));
      if (effortTarget || isEffortBadge) {
        const effortMap = { Low: "低", Medium: "中", High: "高", Extra: "超高", "Extra High": "超高", Max: "极高", low: "低", medium: "中", high: "高", extra: "超高", "extra high": "超高", max: "极高" };
        const trimmed = (rawVal || "").trim();
        if (effortMap[trimmed]) {
          node.nodeValue = rawVal.replace(trimmed, effortMap[trimmed]);
          stats.translatedTextNodes += 1;
          return;
        }
      }
      const effortHeader = parent.closest("[data-testid='model-selector-effort-header']");
      if (effortHeader) {
        const trimmed = (rawVal || "").trim();
        if (trimmed === "Thinking effort" || trimmed === "思考努力") {
          node.nodeValue = rawVal.replace(trimmed, "思考程度");
          stats.translatedTextNodes += 1;
          return;
        }
      }
      const stepPlanChip = parent.closest("[data-testid='step-plan-chip']");
      if (stepPlanChip && rawVal) {
        const chipTranslated = translateValue(rawVal);
        if (chipTranslated !== null && chipTranslated !== rawVal) {
          node.nodeValue = chipTranslated;
          stats.translatedTextNodes += 1;
          return;
        }
      }
    }

    if (__isProtectedNativeIdentifier(parent, false, rawVal)) return;

    const translated = translateValue(rawVal);
    if (translated !== null && translated !== rawVal) {
      node.nodeValue = translated;
      stats.translatedTextNodes += 1;
    } else if (translated === null && rawVal?.trim()) {
      if (collector.enabled) {
        collector.record({
          text: rawVal.trim(),
          tagName: parent.tagName,
          role: parent.getAttribute("role") || "",
          attributeName: ""
        });
      }
      if (__isTitleAutoTranslateEnabled(__zhcnSettings) && __isConversationTitleElement(parent, false)) {
        const titleHit = __lookupLearnedTitle(rawVal);
        if (titleHit !== null && titleHit !== rawVal) {
          node.nodeValue = titleHit;
          stats.translatedTextNodes += 1;
        } else if (
          titleHit === null &&
          __canAutoTranslateTitlesRuntime() &&
          __isEligibleTitleForAutoTranslate(rawVal, parent)
        ) {
          const leading = rawVal.match(/^\\s*/u)?.[0] ?? "";
          const trailing = rawVal.match(/\\s*$/u)?.[0] ?? "";
          const core = rawVal.slice(leading.length, rawVal.length - trailing.length);
          __translateAndLearnAsync(core, { isTitle: true }).then((zh) => {
            if (zh && node.nodeValue === rawVal) {
              node.nodeValue = leading + zh + trailing;
              stats.translatedTextNodes += 1;
            }
          });
        }
        return;
      }
      // UI fill-in for strings the curated dictionary does not cover yet.
      if (__isUiOnlineTranslateEnabled(__zhcnSettings) && !__isConversationTitleElement(parent, false)) {
        const uiHit = __lookupLearnedUi(rawVal);
        if (uiHit !== null && uiHit !== rawVal) {
          node.nodeValue = uiHit;
          stats.translatedTextNodes += 1;
        } else if (uiHit === null && __canAutoTranslateRuntime("ui") && __isEligibleForAutoTranslate(rawVal, parent, false)) {
          const leading = rawVal.match(/^\\s*/u)?.[0] ?? "";
          const trailing = rawVal.match(/\\s*$/u)?.[0] ?? "";
          const core = rawVal.slice(leading.length, rawVal.length - trailing.length);
          __translateAndLearnAsync(core, { isTitle: false }).then((zh) => {
            if (zh && node.nodeValue === rawVal) {
              node.nodeValue = leading + zh + trailing;
              stats.translatedTextNodes += 1;
            }
          });
        }
      }
    }
  }

  const coordinatorIconLabels = {
    Hub: "枢纽",
    Sliders: "滑块",
    "Terminal window": "终端窗口",
    "Command prompt": "命令提示符",
    Code: "代码",
    Sparkles: "星光",
    Wrench: "扳手",
    Shield: "盾牌",
    Speedometer: "速度表",
    Gauge: "仪表盘",
    Eye: "眼睛",
    Flask: "烧瓶",
    Radar: "雷达",
    Bot: "机器人",
  };
  const coordinatorColorLabels = {
    Blue: "蓝色",
    Purple: "紫色",
    Teal: "青色",
    Green: "绿色",
    Amber: "琥珀色",
    Orange: "橙色",
    Red: "红色",
    Indigo: "靛蓝色",
  };

  function translateSwarmTooltipLines(value) {
    if (typeof value !== "string" || !value.includes("\\n")) return null;
    const lines = value.split("\\n");
    let changed = false;
    const next = lines.map((line) => {
      const hit = translateValue(line);
      if (hit !== null && hit !== line) {
        changed = true;
        return hit;
      }
      return line;
    });
    return changed ? next.join("\\n") : null;
  }

  function translateElementAttributes(element) {
    if (isAttributeBlocked(element)) return;
    const elTestId = element.getAttribute?.("data-testid") || "";
    if (element.tagName === "IMG" && elTestId === "swarm-gif-modal-img" && element.getAttribute?.("alt") === "Exported swarm graph replay") {
      element.setAttribute("alt", "导出的蜂群关系图回放");
      stats.translatedAttributes += 1;
    }
    const isSwarmScopedEl =
      elTestId.startsWith("swarm-") ||
      Boolean(element.classList?.contains?.("hv-bee") || element.classList?.contains?.("hv-cell"));
    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      if (attribute === "aria-label" && elTestId.startsWith("coordinator-icon-option-")) {
        const iconZh = coordinatorIconLabels[(current || "").trim()];
        if (iconZh && iconZh !== current) {
          element.setAttribute(attribute, iconZh);
          stats.translatedAttributes += 1;
        }
        continue;
      }
      if (attribute === "aria-label" && elTestId.startsWith("coordinator-color-option-")) {
        const colorZh = coordinatorColorLabels[(current || "").trim()];
        if (colorZh && colorZh !== current) {
          element.setAttribute(attribute, colorZh);
          stats.translatedAttributes += 1;
        }
        continue;
      }
      if (
        __isProtectedNativeIdentifier(element, true, current) &&
        !(attribute === "aria-label" && /^(?:Select project|Select model), current:\\s*.+$/i.test((current || "").trim()))
      ) {
        continue;
      }
      let translated = translateValue(current);
      if ((translated === null || translated === current) && attribute === "title" && isSwarmScopedEl) {
        translated = translateSwarmTooltipLines(current);
      }
      if (translated !== null && translated !== current) {
        element.setAttribute(attribute, translated);
        stats.translatedAttributes += 1;
      } else if (translated === null && current?.trim()) {
        if (collector.enabled) {
          collector.record({
            text: current.trim(),
            tagName: element.tagName,
            role: element.getAttribute("role") || "",
            attributeName: attribute
          });
        }
        if (__isTitleAutoTranslateEnabled(__zhcnSettings) && __isConversationTitleElement(element, true)) {
          const titleHit = __lookupLearnedTitle(current);
          if (titleHit !== null && titleHit !== current) {
            element.setAttribute(attribute, titleHit);
            stats.translatedAttributes += 1;
          }
        } else if (__isUiOnlineTranslateEnabled(__zhcnSettings) && !__isConversationTitleElement(element, true)) {
          const uiHit = __lookupLearnedUi(current);
          if (uiHit !== null && uiHit !== current) {
            element.setAttribute(attribute, uiHit);
            stats.translatedAttributes += 1;
          } else if (uiHit === null && __canAutoTranslateRuntime("ui") && __isEligibleForAutoTranslate(current, element, false, true)) {
            __translateAndLearnAsync(current, { isTitle: false }).then((zh) => {
              if (zh && element.getAttribute(attribute) === current) {
                element.setAttribute(attribute, zh);
                stats.translatedAttributes += 1;
              }
            });
          }
        }
      }
    }
  }

  async function translateDynamicElement(element) {
    const thoughtContext = element?.closest?.("[data-testid*='thinking'], [data-testid*='thought']");
    if (
      (!element?.matches?.(dynamicSelector) && !thoughtContext) ||
      element.dataset.agyZhcnDynamic ||
      element.closest(dynamicBlockedSelector) ||
      element.parentElement?.querySelector("[contenteditable='true'], [data-lexical-editor='true']") ||
      element.querySelector(dynamicSelector)
    ) return;
    const source = element.textContent?.trim();
    if (
      !source || source.length < 18 || source.length > 8000 ||
      !/[A-Za-z]{3,}/.test(source) ||
      (source.match(/[\u4e00-\u9fff]/g) || []).length > 8
    ) return;
    // The original prototype posted paragraph text (including model thinking)
    // to a local translator on 127.0.0.1:45831 that was never shipped. That
    // request is removed: page text must not leave the page except through the
    // main-process proxy, which honours the user's online-translation switch.
    element.dataset.agyZhcnDynamic = "done";
  }

  function __ensurePackMenuEntry(root) {
    if (typeof document === "undefined") return;
    const scope = (root && root.nodeType === 1 && typeof root.querySelectorAll === "function") ? root : document;
    const popups = [];
    const seenPopups = new Set();
    const addPopup = (popup) => {
      if (popup && !seenPopups.has(popup)) {
        seenPopups.add(popup);
        popups.push(popup);
      }
    };
    try {
      if (root && root.nodeType === 1 && typeof root.closest === "function") {
        const selfOpt = root.matches?.("[data-testid='title-menu-bar-option'], [role='menuitem']")
          ? root
          : root.querySelector?.("[data-testid='title-menu-bar-option'], [role='menuitem']");
        if (selfOpt) addPopup(selfOpt.closest?.("div.absolute, [role='menu'], [data-browser-occluder]") || selfOpt.parentElement?.parentElement);
      }
      const candidates = scope.querySelectorAll("[data-testid='title-menu-bar-option'], [data-testid='title-menu-bar'] button, [role='menu'] [role='menuitem']");
      for (const btn of candidates) {
        addPopup(btn.closest?.("div.absolute, [role='menu'], [data-browser-occluder]") || btn.parentElement?.parentElement);
      }
    } catch (_) {}
    for (const popup of popups) {
      try {
        const buttons = [...popup.querySelectorAll("button, [role='menuitem']")];
        if (!buttons.length) continue;
        if (popup.querySelector("[data-agy-zhcn-pack-menu]") || buttons.some((b) => (b.textContent || "").trim().startsWith("汉化中心"))) {
          continue;
        }
        const isAppDropdown = buttons.some((b) => {
          const txt = (b.textContent || "").trim();
          return /^(?:Version|版本)\s+\S/i.test(txt) || /^(?:Check for Updates|检查更新)$/i.test(txt);
        });
        if (!isAppDropdown) continue;
        const lastBtn = buttons[buttons.length - 1];
        const label = "汉化中心";
        const row = (lastBtn.parentElement && lastBtn.parentElement !== popup)
          ? lastBtn.parentElement.cloneNode(true)
          : lastBtn.cloneNode(true);
        const newBtn = (row.matches && row.matches("button, [role='menuitem']"))
          ? row
          : row.querySelector("button, [role='menuitem']");
        if (!newBtn) continue;
        newBtn.removeAttribute("tabindex");
        newBtn.setAttribute("data-agy-zhcn-pack-menu", "1");
        if (typeof newBtn.className === "string") {
          newBtn.className = newBtn.className.replace(/\\bpointer-events-none\\b/g, "hover:bg-secondary");
        }
        const spans = newBtn.querySelectorAll("span");
        if (spans.length > 0) {
          spans[0].textContent = label;
          for (let si = 1; si < spans.length; si += 1) spans[si].remove();
        } else {
          newBtn.textContent = label;
        }
        newBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          } catch (_) {}
          try {
            globalThis.__AGY_ZHCN_OPEN_PACK_PANEL__?.();
          } catch (_) {}
        });
        popup.appendChild(row);
      } catch (_) {}
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
      return;
    }
    __ensurePackMenuEntry(root);
    if (root.nodeType === Node.ELEMENT_NODE) {
      translateElementAttributes(root);
      translateDynamicElement(root);
    }
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
    );
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        translateTextNode(current);
      } else {
        translateElementAttributes(current);
        translateDynamicElement(current);
      }
    }
  }

  function flush() {
    scheduled = false;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    for (const root of roots) translateTree(root);
  }

  function enqueue(root) {
    pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  }

  globalThis.__AGY_ZHCN_TRANSLATE__ = translateValue;
  function translateMarkdownText(md) {
    if (typeof md !== "string" || !md.trim()) return md;
    const FENCE = String.fromCharCode(96).repeat(3);
    const NL = String.fromCharCode(10);
    const direct = exactTranslations.get(md.trim());
    if (direct !== undefined) return direct;
    const singleLine = md.trim().replace(/\\s+/g, " ");
    if (!md.includes(NL + "#") && !md.includes(FENCE) && !md.startsWith("---")) {
      const sl = exactTranslations.get(singleLine);
      if (sl !== undefined) return sl;
    }
    let frontmatter = "";
    let body = md;
    const fmMatch = md.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---(\\r?\\n|$)/);
    if (fmMatch) {
      frontmatter = fmMatch[0];
      body = md.slice(frontmatter.length);
      const bodyDirect = exactTranslations.get(body.trim());
      if (bodyDirect !== undefined) return frontmatter + bodyDirect;
    }
    const fenceRegex = new RegExp("(" + FENCE + "[\\\\s\\\\S]*?" + FENCE + ")", "g");
    const parts = body.split(fenceRegex);
    const translatedParts = parts.map((part) => {
      if (part.startsWith(FENCE)) return part;
      const blocks = part.split(/(\\r?\\n\\s*\\r?\\n)/);
      return blocks.map((block) => {
        if (/^\\s*$/.test(block)) return block;
        const trimmedBlock = block.trim();
        const exactBlock = exactTranslations.get(trimmedBlock) ?? exactTranslations.get(trimmedBlock.replace(/\\s+/g, " "));
        if (exactBlock !== undefined) return exactBlock;
        const lines = block.split(/\\r?\\n/);
        let allLinesTranslated = true;
        const outLines = lines.map((line) => {
          const tLine = line.trim();
          if (!tLine) return line;
          const directLine = exactTranslations.get(tLine);
          if (directLine !== undefined) {
            const indent = line.match(/^\\s*/)?.[0] ?? "";
            return indent + directLine;
          }
          const hm = line.match(/^(\\s*#{1,6}\\s+)(.+)$/);
          if (hm) {
            const th = translateValue(hm[2].trim());
            if (th !== null) return hm[1] + th;
          }
          const lm = line.match(/^(\\s*(?:[-*+]|\\d+\\.)\\s+)(.+)$/);
          if (lm) {
            const tl = exactTranslations.get(lm[2].trim()) ?? translateValue(lm[2].trim());
            if (tl !== null && tl !== undefined) return lm[1] + tl;
          }
          const qm = line.match(/^(\\s*>+\\s*)(.+)$/);
          if (qm) {
            const tq = exactTranslations.get(qm[2].trim()) ?? translateValue(qm[2].trim());
            if (tq !== null && tq !== undefined) return qm[1] + tq;
          }
          if (tLine.startsWith("|") && tLine.endsWith("|") && !/^\\|[\\s:|-]+\\|$/.test(tLine)) {
            const cells = line.split("|");
            let cellChanged = false;
            const newCells = cells.map((cell) => {
              const tc = cell.trim();
              if (!tc) return cell;
              const tr = exactTranslations.get(tc) ?? translateValue(tc);
              if (tr !== null && tr !== undefined) {
                cellChanged = true;
                return " " + tr + " ";
              }
              return cell;
            });
            if (cellChanged) return newCells.join("|");
          }
          allLinesTranslated = false;
          return line;
        });
        if (!allLinesTranslated && !trimmedBlock.startsWith("#") && !trimmedBlock.startsWith("-") && !trimmedBlock.startsWith("*") && !trimmedBlock.startsWith("|")) {
          if (trimmedBlock.startsWith(">")) {
            const qClean = trimmedBlock.replace(/^>\\s?/gm, "").replace(/\\s+/g, " ").trim();
            const qTr = exactTranslations.get(qClean) ?? translateValue(qClean);
            if (qTr) return "> " + qTr;
          } else {
            const pTr = translateValue(trimmedBlock.replace(/\\s+/g, " "));
            if (pTr !== null) return pTr;
          }
        }
        return outLines.join(NL);
      }).join("");
    });
    return frontmatter + translatedParts.join("");
  }
  globalThis.__AGY_ZHCN_TRANSLATE_MD__ = translateMarkdownText;
  function translateMenuItems(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item) => {
      if (!item || typeof item !== "object") return item;
      const next = { ...item };
      if (typeof next.label === "string") {
        const t = translateValue(next.label);
        if (t !== null) next.label = t;
      }
      if (Array.isArray(next.submenu)) {
        next.submenu = translateMenuItems(next.submenu);
      }
      return next;
    });
  }
  function hookNativeContextMenu() {
    try {
      const en = globalThis.window?.electronNative || globalThis.electronNative;
      if (en && typeof en.showContextMenu === "function" && !en.showContextMenu.__agyZhcnWrapped) {
        const origShow = en.showContextMenu.bind(en);
        const wrappedShow = function(items, ...rest) {
          return origShow(translateMenuItems(items), ...rest);
        };
        wrappedShow.__agyZhcnWrapped = true;
        en.showContextMenu = wrappedShow;
      }
    } catch (_) {}
  }

  function start() {
    document.documentElement.lang = "zh-CN";
    hookNativeContextMenu();
    translateTree(document.documentElement);
    // Persisted title translations are only applied while title auto-translation is on.
    // Wait for persisted dictionary before rescanning DOM and summaries so cached titles
    // apply immediately without duplicate remote translation requests.
    __loadZhcnSettings({ rescan: false }).then(async (settings) => {
      if (__isTitleAutoTranslateEnabled(settings) || __isUiOnlineTranslateEnabled(settings)) {
        await __loadPersistedAutoDict();
      }
      if (typeof document !== "undefined" && document.documentElement) {
        translateTree(document.documentElement);
      }
      if (__isTitleAutoTranslateEnabled(settings) && typeof __rescanConvTitlesFn === "function") {
        try { __rescanConvTitlesFn(); } catch (_) {}
      }
    });
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          enqueue(mutation.target);
        } else if (mutation.type === "attributes") {
          enqueue(mutation.target);
        } else {
          for (const node of mutation.addedNodes) enqueue(node);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes
    });
    globalThis.__AGY_ZHCN_COLLECTOR__ = collector;
    globalThis.__AGY_ZHCN__ = Object.freeze({
      version: "0.1.1",
      strategy: "dom-overlay",
      stats,
      collector
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
`;
}

export function createLocalizedBundle(sourceBuffer, dictionary, { skipCoverage = false } = {}) {
  let sourceText = sourceBuffer.toString("utf8");
  const resolvedPackVersion = (typeof dictionary?.packVersion === "string" && dictionary.packVersion.trim()) || DEFAULT_PACK_VERSION;

  // 左上角 Antigravity 下拉菜单：版本、检查更新、汉化中心（不带版本号，避免热更新或自动更新后与右下角面板版本显示不一致）
  sourceText = fastAnchorReplace(
    sourceText,
    '"Check for Updates"',
    /([a-zA-Z0-9_$]+)\?\.appVersion&&([a-zA-Z0-9_$]+)\.push\(\{label:`Version \$\{\1\.appVersion\}`[\s\r\n]*,[\s\r\n]*onClick:\(\)=>[\s\r\n]*\{\},[\s\r\n]*nonSelectable:!0\}\);[\s\r\n]*\1\?\.checkForUpdates&&\2\.push\(\{label:"Check for Updates"[\s\r\n]*,[\s\r\n]*onClick:\(\)=>\{[\s\r\n]*\1\.checkForUpdates\?\.\(\)[\s\r\n]*\}\}\);[\s\r\n]*return \2/g,
    (_, objVar, arrVar) =>
      `${objVar}?.appVersion&&${arrVar}.push({label:\`版本 \${${objVar}.appVersion}\`,onClick:()=>{},nonSelectable:!0});` +
      `${objVar}?.checkForUpdates&&${arrVar}.push({label:"检查更新",onClick:()=>{${objVar}.checkForUpdates?.()}});` +
      `${arrVar}.push({label:"汉化中心",onClick:()=>{globalThis.__AGY_ZHCN_OPEN_PACK_PANEL__?.()}});` +
      `return ${arrVar}`
  );

  // =========================================================================
  // 9. Antigravity 2.31.0 全端与 1–4 级子页面、悬浮窗、菜单深度原生本地化
  //    （严守红线：不改动任何首页 BXc 与外层滚动区布局样式类名与 flexBasis）
  // =========================================================================

  // 9.1 图 1：首页纯文案（问候语、公告栏与市场卡片，绝不改容器样式）
  sourceText = sourceText.replace(
    'const R6=[{named:a=>`Hey ${a}, what should we build today?`,unnamed:"Hey there, what should we build today?"},{named:a=>`Welcome back, ${a}. Where should we pick up?`,unnamed:"Welcome back. Where should we pick up?"},{named:a=>`Good to see you, ${a}. What\'s next?`,unnamed:"Good to see you. What\'s next?"}];',
    'const R6=[{named:a=>`嘿 ${a}，今天想一起打造些什么？`,unnamed:"嘿，今天想一起打造些什么？"},{named:a=>`欢迎回来，${a}。我们从哪里继续？`,unnamed:"欢迎回来，我们从哪里继续？"},{named:a=>`很高兴见到你，${a}。接下来做什么？`,unnamed:"很高兴见到你，接下来做什么？"}];'
  );
  sourceText = sourceText.replaceAll('B.createElement(ql,null,"Card "),m+1," of ",l', 'B.createElement(ql,null,"卡片 "),m+1," / ",l');
  sourceText = sourceText.replaceAll('"aria-label":"Previous card"', '"aria-label":"上一张卡片"');
  sourceText = sourceText.replaceAll('"aria-label":"Next card"', '"aria-label":"下一张卡片"');
  sourceText = sourceText.replaceAll('{label:"Announcements and tips"}', '{label:"公告与技巧"}');
  sourceText = sourceText.replaceAll('children:"Browse the Marketplace"', 'children:"浏览插件市场"');
  sourceText = sourceText.replaceAll('title:"Explore the plugin marketplace"', 'title:"探索插件市场"');
  sourceText = sourceText.replaceAll(
    '"Find plugins - bundles of skills, agents, MCP servers, UI extensions and more, and install them in one click."',
    '"探索精选插件——集成技能、智能体、MCP 服务器、UI 扩展等能力，支持一键安装。"'
  );
  sourceText = sourceText.replaceAll('title:"New models have been enabled for you!"', 'title:"新模型已为你启用！"');
  sourceText = sourceText.replaceAll('c?`Select model with ${c}`:"Select a model in the model selector"', 'c?`使用快捷键 ${c} 选择模型`:"请在模型选择器中选择模型"');
  sourceText = sourceText.replaceAll('"Dismiss Tip"', '"关闭提示"');

  // 9.2 图 10：进度更新、工作耗时、时间分隔线与步骤汇总 (Xyc/Pyc/AQb/WQb/Dyc/Eyc/zzc/oQc/思考计时)
  sourceText = sourceText.replace(
    'v=`${v} ${v===1?"update":"updates"}`;t=t>0?`Worked for ${Is(t)} \\u00b7 ${v}`:v;',
    'v=`${v} 条进度更新`;t=t>0?`工作耗时 ${Is(t)} \\u00b7 ${v}`:v;'
  );
  sourceText = sourceText.replaceAll('headerText:`Worked for ${Is(a)}`', 'headerText:`工作耗时 ${Is(a)}`');
  sourceText = sourceText.replace(
    'subtitle:P?"Killed":N?void 0:L?"Working...":l?.createdAtMs&&l?.lastModifiedAtMs?`Worked for ${Is(l.lastModifiedAtMs-l.createdAtMs)}`:""',
    'subtitle:P?"已终止":N?void 0:L?"处理中...":l?.createdAtMs&&l?.lastModifiedAtMs?`工作耗时 ${Is(l.lastModifiedAtMs-l.createdAtMs)}`:""'
  );
  sourceText = sourceText.replace(
    'function AQb(a){return a.active?"Working":a.durationMs!==void 0&&a.durationMs>0?`Worked for ${Is(a.durationMs)}`:"Worked"}',
    'function AQb(a){return a.active?"处理中":a.durationMs!==void 0&&a.durationMs>0?`工作耗时 ${Is(a.durationMs)}`:"已完成"}'
  );
  sourceText = sourceText.replace(
    'ha?w.startTimeMs?`Running for ${Is(oa.getTime()-Number(w.startTimeMs))}`:"Starting":"Paused."',
    'ha?w.startTimeMs?`已运行 ${Is(oa.getTime()-Number(w.startTimeMs))}`:"正在启动":"已暂停。"'
  );
  sourceText = sourceText.replace(
    'a.startTimeMs?`Up ${Is(g.getTime()-Number(a.startTimeMs))}`:"Running"',
    'a.startTimeMs?`已运行 ${Is(g.getTime()-Number(a.startTimeMs))}`:"运行中"'
  );
  sourceText = sourceText.replaceAll('w.lastError||"Could not start."', 'w.lastError||"无法启动。"');
  sourceText = sourceText.replace(
    'switch(a){case "expiring_soon":return b?`Credentials expire in ${b}. Refresh credentials to keep this automation running`:"Credentials expiring soon. Refresh credentials to keep this automation running";case "expired":return"Credentials expired. This automation will not run until credentials are refreshed"}',
    'switch(a){case "expiring_soon":return b?`凭证将于 ${b} 后过期，请刷新凭证以保持此自动化正常运行`:"凭证即将过期，请刷新凭证以保持此自动化正常运行";case "expired":return"凭证已过期，刷新凭证前此自动化将不会运行"}'
  );
  sourceText = sourceText.replaceAll('M.exitCode===-1?"Validation timed out.":L||`Exited with code ${M.exitCode}.`', 'M.exitCode===-1?"验证超时。":L||`已退出，退出码 ${M.exitCode}。`');
  sourceText = sourceText.replace(
    'const vzc=new Intl.DateTimeFormat(void 0,{timeStyle:"short"}),wzc=new Intl.DateTimeFormat(void 0,{weekday:"long"}),xzc=new Intl.DateTimeFormat(void 0,{weekday:"short",month:"short",day:"numeric"}),yzc=new Intl.DateTimeFormat(void 0,{weekday:"short",month:"short",day:"numeric",year:"numeric"});var zzc=({date:a})=>{{var b=new Date;let g=vzc.format(a);if(us(a,b))a={dayPart:"Today",timePart:g};else{var c=new Date(b);c.setDate(b.getDate()-1);a=us(a,c)?{dayPart:"Yesterday",timePart:g}:Math.abs(zKa(b,a))<7?{dayPart:wzc.format(a),timePart:g}:{dayPart:a.getFullYear()===b.getFullYear()?xzc.format(a):yzc.format(a),timePart:`at ${g}`}}}',
    'const vzc=new Intl.DateTimeFormat("zh-CN",{timeStyle:"short"}),wzc=new Intl.DateTimeFormat("zh-CN",{weekday:"long"}),xzc=new Intl.DateTimeFormat("zh-CN",{weekday:"short",month:"short",day:"numeric"}),yzc=new Intl.DateTimeFormat("zh-CN",{weekday:"short",month:"short",day:"numeric",year:"numeric"});var zzc=({date:a})=>{{var b=new Date;let g=vzc.format(a);if(us(a,b))a={dayPart:"今天",timePart:g};else{var c=new Date(b);c.setDate(b.getDate()-1);a=us(a,c)?{dayPart:"昨天",timePart:g}:Math.abs(zKa(b,a))<7?{dayPart:wzc.format(a),timePart:g}:{dayPart:a.getFullYear()===b.getFullYear()?xzc.format(a):yzc.format(a),timePart:g}}}'
  );
  sourceText = sourceText.replace(
    'return c>0?c+d===1?"file":"files":d>0?d===1?"artifact":"artifacts":""',
    // No count is rendered next to this noun ("Edited files"), so no measure word.
    'return c>0?"文件":d>0?"工件":""'
  );
  sourceText = sourceText.replace(
    'return a?/^running\\b/i.test(a)?a.replace(/^running\\b/i,"Running"):`Running ${dea(a)}`:"Running command"}',
    'return a?/^running\\b/i.test(a)?a.replace(/^running\\b/i,"正在运行"):`正在运行 ${dea(a)}`:"正在运行命令"}'
  );
  sourceText = sourceText.replace(
    'return c?c:d==="edit"?`Editing ${WQb([a],b)}`:"Exploring"}',
    'return c?c:d==="edit"?`正在编辑 ${WQb([a],b)}`:"正在探索"}'
  );
  sourceText = sourceText.replace(
    'return c?`Editing ${c}`:void 0;if(b.step.case==="viewFile"||a.metadata?.toolCall?.name==="read_file"||gg(a)?.aggregationKey==="files")return c?`Reading ${c}`:void 0;if(b.step.case==="listDirectory")return(a=jg(b.step.value.directoryPathUri))?`Listing ${a}`:void 0;',
    'return c?`正在编辑 ${c}`:void 0;if(b.step.case==="viewFile"||a.metadata?.toolCall?.name==="read_file"||gg(a)?.aggregationKey==="files")return c?`正在读取 ${c}`:void 0;if(b.step.case==="listDirectory")return(a=jg(b.step.value.directoryPathUri))?`正在列出 ${a}`:void 0;'
  );
  sourceText = sourceText.replace('return a?`Searching ${a}`:void 0}', 'return a?`正在搜索 ${a}`:void 0}');
  sourceText = sourceText.replace(
    'b||!a||a.error||xf(a)!=="plannerResponse"?(d=b??d[d.length-1])?Dyc(d,c):"Working":"Thinking";b=d.filter(g=>WU(g)==="other");a=d.filter(g=>WU(g)==="terminal");var f=d.filter(g=>WU(g)==="edit");d=[];b.length>0&&(b=WQb(b,c),d.push(b?`Explored ${b}`:"Explored"));a.length>0&&d.push(`${d.length===0?"Ran":"ran"} ${a.length===1?"command":"commands"}`);\nf.length>0&&(c=WQb(f,c),d.push(`${d.length===0?"Edited":"edited"} ${c}`));',
    'b||!a||a.error||xf(a)!=="plannerResponse"?(d=b??d[d.length-1])?Dyc(d,c):"处理中":"思考中";b=d.filter(g=>WU(g)==="other");a=d.filter(g=>WU(g)==="terminal");var f=d.filter(g=>WU(g)==="edit");d=[];b.length>0&&(b=WQb(b,c),d.push(b?`已探索 ${b}`:"已探索"));a.length>0&&d.push(`已运行 ${a.length} 条命令`);\nf.length>0&&(c=WQb(f,c),d.push(`已编辑 ${c}`));'
  );
  sourceText = sourceText.replaceAll('var p=b?`Thought for ${Math.max(1,Number(b.seconds))}s`:"Thought Process"', 'var p=b?`思考耗时 ${Math.max(1,Number(b.seconds))} 秒`:"思考过程"');
  sourceText = sourceText.replaceAll('?q?`Thought for ${Math.max(1,Number(q.seconds))}s`:"Thought Process":"Thinking..."', '?q?`思考耗时 ${Math.max(1,Number(q.seconds))} 秒`:"思考过程":"正在思考..."');
  sourceText = sourceText.replaceAll(')?`Thought for ${Math.max(1,Number(T.seconds))}s`:"Thought Process"', ')?`思考耗时 ${Math.max(1,Number(T.seconds))} 秒`:"思考过程"');

  // 9.3 图 7 / 8 / 9：时间轴章节标题与轮次 (IVc/CVc/EVc/navigator)
  sourceText = sourceText.replace(
    'B.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"font-medium leading-snug text-foreground"},d??DVc(a,b))',
    'B.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"font-medium leading-snug text-foreground"},(d?(globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__?globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__(d):d):d)??DVc(a,b))'
  );
  sourceText = sourceText.replaceAll('yl(`Turn ${T+\n1} of ${u.current.turns?.length}`,"polite")', 'yl(`第 ${T+1} 轮，共 ${u.current.turns?.length} 轮`,"polite")');
  sourceText = sourceText.replaceAll('"aria-label":`Turn ${a+1} of ${b}`', '"aria-label":`第 ${a+1} 轮，共 ${b} 轮`');

  // 9.4 图 5：首次引导最后一步弹窗（Welcome Modal，严格保留服务条款与隐私权政策链接）
  sourceText = sourceText.replace(
    'B.createElement("h2",{className:q},"One last thing before getting started\\u2026"),B.createElement("p",{className:n?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"},"A few things to know, and a couple settings to review.")),B.createElement("ul",{className:"list-none p-0 m-0 flex flex-col gap-4"},B.createElement("li",null,B.createElement(iqc,{title:"Optimized for you"},\n"Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\\u2019t show you ads or let advertisers influence what ",a," says.")),B.createElement("li",null,B.createElement(iqc,{title:"Built to help, not hurt"},"Automated safeguards help to protect your conversations from insecure or unsafe content. That being said, users should be aware of potential agentic risks, including data exfiltration.")),B.createElement("li",null,B.createElement(iqc,{title:"You are in control"},\na,"\\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent."))),B.createElement("hr",{className:"border-t border-border my-4"}),h?B.createElement("p",{className:"text-sm text-muted-foreground leading-normal"},"For ",k,", ",a," does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts)."):B.createElement("div",\n{className:"flex flex-col gap-3"},B.createElement(tz,{checked:b,onChange:c,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:`Help us improve ${a}.`},"Allow Google to collect and use your Interactions data, subject to the"," ",B.createElement("a",{href:"https://antigravity.google/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google ",a," Terms of Service")," ","and"," ",B.createElement("a",{href:"https://policies.google.com/privacy",className:"text-link hover:underline",\ntarget:"_blank",rel:"noreferrer"},"Google Privacy Policy"),". You can control this from your settings at any point.")}),B.createElement(tz,{checked:d,onChange:f,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:"Stay up to date."},"Sign up for newsletters, tips and tricks, and other notifications about ",a,".")}))',
    'B.createElement("h2",{className:q},"开始使用前，还有最后几项确认…"),B.createElement("p",{className:n?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"},"请了解以下说明，并确认相关偏好设置。")),B.createElement("ul",{className:"list-none p-0 m-0 flex flex-col gap-4"},B.createElement("li",null,B.createElement(iqc,{title:"专属定制优化"},\n"你可以通过设置与插件市场，自由定制智能体、插件与整体产品体验。我们绝不向你展示广告，也不会允许任何广告商影响 ",a," 的回复。")),B.createElement("li",null,B.createElement(iqc,{title:"秉持安全设计，赋能开发"},"内置自动安全防护机制有助于保护你的对话免受不安全或风险内容影响。尽管如此，请依然留意智能体操作潜在的安全风险（包括数据泄露）。")),B.createElement("li",null,B.createElement(iqc,{title:"一切由你掌控"},\na," 的智能体功能强大，可助你更快、更出色地完成任务，但请务必仔细核实智能体执行的操作。"))),B.createElement("hr",{className:"border-t border-border my-4"}),h?B.createElement("p",{className:"text-sm text-muted-foreground leading-normal"},"对于 ",k,"，",a," 不会收集你的提示词、代码内容或模型回复，但仍会收集常规使用模式（例如功能启用情况与活跃用户数）。"):B.createElement("div",\n{className:"flex flex-col gap-3"},B.createElement(tz,{checked:b,onChange:c,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:`帮助改进 ${a}。`},"允许 Google 依据 ",B.createElement("a",{href:"https://antigravity.google/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google ",a," 服务条款")," 与 ",B.createElement("a",{href:"https://policies.google.com/privacy",className:"text-link hover:underline",\ntarget:"_blank",rel:"noreferrer"},"Google 隐私权政策")," 收集并使用你的交互数据。你随时可以在设置中管理此选项。")}),B.createElement(tz,{checked:d,onChange:f,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:"订阅最新资讯。"},"订阅关于 ",a," 的产品动态、实用技巧及其他通知邮件。")}))'
  );

  // 9.5 图 4 & 6：账户、模型与用量、配额提示与错误提示 (Account / Models & Usage / Q9b / R9b)
  sourceText = sourceText.replace(
    'B.createElement(VP,{title:"Account"},B.createElement(TP,\nnull,P&&B.createElement(UP,{label:B.createElement("div",{className:"font-medium"},F?`Your Plan: ${F}`:"Your Plan",C&&" (ADC)"),description:d?"Authenticated via Enterprise Gateway":g&&h?B.createElement(B.Fragment,null,B.createElement("span",{className:"text-foreground"},"Project ID: ",h),G&&B.createElement(B.Fragment,null,B.createElement("br",null),G)):G,rightElement:d||x?void 0:w&&g?B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{z(!0)}},"Manage"):c?.userTier?.upgradeSubscriptionUri?\nB.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_SETTINGS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},c.userTier?.upgradeButtonText||"Upgrade"):void 0}),H&&B.createElement(UP,{label:"Google One Referral",description:"Share your referral link with friends",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",\n"data-testid":"g1-referral-invite-button",onClick:()=>{u(H)}},"Invite a Friend")}),J&&B.createElement(UP,{label:B.createElement("div",{className:"font-medium"},f==="projectPicker"?"Project Required":"License Required"),description:f==="projectPicker"?"A Google Cloud project is required to use Antigravity.":"A license or project selection is required to use Antigravity.",rightElement:B.createElement(Uy,{variant:"primary",size:"sm",onClick:()=>{z(!0)}},f==="projectPicker"?"Select Project":"Manage License")}),\nl.settings.isVisible("antigravity.section.authChange")&&(d?B.createElement(UP,{label:"Email",description:"Managed by Enterprise Gateway"}):K?B.createElement(UP,{label:"Email",description:c?.email,rightElement:B.createElement("span",{"data-tooltip-id":v,tabIndex:n?0:void 0},B.createElement(Uy,{variant:"secondary",size:"sm",disabled:!!n||A,onClick:async()=>{var O=e,Q=e;try{D(!0);try{Q(await O(a.logout()))}finally{Q(),D(!1)}}finally{O()}}},A?"Signing Out...":"Sign Out"),B.createElement(Sy,{id:v,content:n}))}):\nB.createElement(UP,{label:"Not Signed In",description:t?`Sign in from the ${wQ} panel.`:`Sign in to use ${wQ}!`,rightElement:t?B.createElement(Uy,{variant:"primary",size:"sm",onClick:()',
    'B.createElement(VP,{title:"账户"},B.createElement(TP,\nnull,P&&B.createElement(UP,{label:B.createElement("div",{className:"font-medium"},F?`你的方案：${globalThis.__AGY_ZHCN_TRANSLATE_PLAN__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN__(F):F}`:"你的方案",C&&" (ADC)"),description:d?"已通过企业网关验证":g&&h?B.createElement(B.Fragment,null,B.createElement("span",{className:"text-foreground"},"项目 ID：",h),G&&B.createElement(B.Fragment,null,B.createElement("br",null),(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(G):G))):G&&(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(G):G),rightElement:d||x?void 0:w&&g?B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{z(!0)}},"管理"):c?.userTier?.upgradeSubscriptionUri?\nB.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_SETTINGS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},({"Upgrade":"升级","Manage":"管理"}[c.userTier?.upgradeButtonText]||c.userTier?.upgradeButtonText||"升级")):void 0}),H&&B.createElement(UP,{label:"Google One 推荐",description:"与好友分享你的推荐链接",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",\n"data-testid":"g1-referral-invite-button",onClick:()=>{u(H)}},"邀请好友")}),J&&B.createElement(UP,{label:B.createElement("div",{className:"font-medium"},f==="projectPicker"?"需要关联项目":"需要许可证"),description:f==="projectPicker"?"使用 Antigravity 需要关联 Google Cloud 项目。":"使用 Antigravity 需要配置许可证或选择项目。",rightElement:B.createElement(Uy,{variant:"primary",size:"sm",onClick:()=>{z(!0)}},f==="projectPicker"?"选择项目":"管理许可证")}),\nl.settings.isVisible("antigravity.section.authChange")&&(d?B.createElement(UP,{label:"邮箱",description:"由企业网关统一管理"}):K?B.createElement(UP,{label:"邮箱",description:c?.email,rightElement:B.createElement("span",{"data-tooltip-id":v,tabIndex:n?0:void 0},B.createElement(Uy,{variant:"secondary",size:"sm",disabled:!!n||A,onClick:async()=>{var O=e,Q=e;try{D(!0);try{Q(await O(a.logout()))}finally{Q(),D(!1)}}finally{O()}}},A?"正在退出登录...":"退出登录"),B.createElement(Sy,{id:v,content:n}))}):\nB.createElement(UP,{label:"未登录",description:t?`请在 ${wQ} 面板中登录。`:`登录后即可使用 ${wQ}！`,rightElement:t?B.createElement(Uy,{variant:"primary",size:"sm",onClick:()'
  );
  sourceText = sourceText.replace(
    'B.createElement(RP,{title:B.createElement("div",\n{className:"flex items-center gap-1.5"},B.createElement("span",null,"Models & Usage"),B.createElement(Uy,{variant:"ghost",size:"icon-lg",onClick:w,disabled:n===void 0,title:"Refresh quota and credits data","aria-label":"Refresh quota and credits data"},B.createElement(dq,{name:"refresh",size:20,className:n===void 0?"animate-spin":""}))),description:"Manage your model quota and credits."},h==="signedIn"&&l&&B.createElement(VP,{title:"Plan"},B.createElement(TP,null,B.createElement(UP,{label:B.createElement("div",\n{className:"font-medium"},"Your Plan: ",l),description:m,rightElement:c?.userTier?.upgradeSubscriptionUri&&B.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_MODELS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},c.userTier.upgradeButtonText||"Upgrade")}))),y!==void 0&&B.createElement(VP,{title:"Model Credits"},B.createElement(TP,\nnull,B.createElement(wIb,{label:"Enable AI Credit Overages",description:`When toggled on, ${g} will use your AI credits to fulfill model requests once you\'re out of model quota. ${g} will always use your model quota first before using AI credits.`,isSwitchOn:x,pushUpdate:A}),x&&B.createElement(UP,{label:`Available AI Credits: ${y??"0"}`,',
    'B.createElement(RP,{title:B.createElement("div",\n{className:"flex items-center gap-1.5"},B.createElement("span",null,"模型与用量"),B.createElement(Uy,{variant:"ghost",size:"icon-lg",onClick:w,disabled:n===void 0,title:"刷新配额与点数数据","aria-label":"刷新配额与点数数据"},B.createElement(dq,{name:"refresh",size:20,className:n===void 0?"animate-spin":""}))),description:"管理你的模型配额与 AI 点数。"},h==="signedIn"&&l&&B.createElement(VP,{title:"订阅方案"},B.createElement(TP,null,B.createElement(UP,{label:B.createElement("div",\n{className:"font-medium"},"你的方案：",globalThis.__AGY_ZHCN_TRANSLATE_PLAN__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN__(l):l),description:(m&&(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(m):m)),rightElement:c?.userTier?.upgradeSubscriptionUri&&B.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_MODELS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},({"Upgrade":"升级","Manage":"管理"}[c.userTier.upgradeButtonText]||c.userTier.upgradeButtonText||"升级"))}))),y!==void 0&&B.createElement(VP,{title:"模型点数"},B.createElement(TP,\nnull,B.createElement(wIb,{label:"启用 AI 点数超额使用",description:`开启后，当模型配额用尽时，${g} 将自动使用你的 AI 点数继续处理请求。系统始终优先消耗模型配额。`,isSwitchOn:x,pushUpdate:A}),x&&B.createElement(UP,{label:`可用 AI 点数：${y??"0"}`,'
  );
  sourceText = sourceText.replaceAll('{title:"Model Quota",subtitle:q}', '{title:"模型配额",subtitle:q}');
  sourceText = sourceText.replaceAll(',"See Activity")', ',"查看活动记录")');
  sourceText = sourceText.replaceAll(',"Get More AI Credits")', ',"获取更多 AI 点数")');
  sourceText = sourceText.replace(
    '{className:"text-secondary-foreground py-2 px-3"},"For Antigravity Business consumption options, see"," ",B.createElement("a",{href:"https://antigravity.google/docs/enterprise",className:"text-link hover:underline",target:"_blank",rel:"noopener noreferrer"},"documentation"),".")',
    '{className:"text-secondary-foreground py-2 px-3"},"如需了解 Antigravity 企业版用量选项，请参阅"," ",B.createElement("a",{href:"https://antigravity.google/docs/enterprise",className:"text-link hover:underline",target:"_blank",rel:"noopener noreferrer"},"说明文档"),"。")'
  );
  sourceText = sourceText.replace(
    'Q9b=(a,b,c,d,f,g)=>{if(g)return a=a||"this model",b&&(b=new Date(b),!Number.isNaN(b.getTime()))?`Your quota for ${a} will reset on ${b.toLocaleString()}. Switch to another available model to continue.`:`Your quota for ${a} has been reached. Switch to another available model to continue.`;g="";var h=d!==void 0;h&&c&&(f===void 0||d<f)&&(g=`You need ${f?"at least "+f:"more"} AI Credits to send messages. To continue using ${a||"this model"} now, purchase more AI Credits.`);if(b)try{let k=(new Date(b)).toLocaleString();\ng+=` Your plan\'s baseline quota will refresh on ${k}.`}catch(k){console.warn("Failed to parse quota reset timestamp",k)}h&&!c&&(g+=" To continue using this model now, enable AI Credit overages.");return g};',
    'Q9b=(a,b,c,d,f,g)=>{if(g)return a=a||"此模型",b&&(b=new Date(b),!Number.isNaN(b.getTime()))?`你的 ${a} 配额将于 ${b.toLocaleString()} 重置。请切换到其他可用模型以继续。`:`你的 ${a} 配额已达上限。请切换到其他可用模型以继续。`;g="";var h=d!==void 0;h&&c&&(f===void 0||d<f)&&(g=`你还需要 ${f?"至少 "+f:"更多"} AI 点数才能继续发送消息。若要立即继续使用${a||"此模型"}，请购买更多 AI 点数。`);if(b)try{let k=(new Date(b)).toLocaleString();\ng+=` 你的方案基线配额将于 ${k} 刷新。`}catch(k){console.warn("Failed to parse quota reset timestamp",k)}h&&!c&&(g+=" 若要立即继续使用此模型，请启用 AI 点数超额使用。");return g};'
  );
  sourceText = sourceText.replaceAll('message:"Too many requests, please try again in a bit!"', 'message:"请求过于频繁，请稍后再试！"');

  // 9.6 图 2：插件详情页、/gmail 命令列表、与 1–4 级子弹窗全量注入 (LAc/K4/RBc/DBc/TBc/UAc/VAc/RAc/uBc/bBc/cBc/dBc/qBc/pBc/oBc/V4/zBc/ABc/J4)
  sourceText = sourceText.replace(
    'function LAc({name:a,titleId:b,logo:c,badges:d,subtitle:f,actions:g,description:h,layout:k="page"}){',
    'function LAc({name:a,titleId:b,logo:c,badges:d,subtitle:f,actions:g,description:h,layout:k="page"}){var _h=h&&(globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(h)||globalThis.__AGY_ZHCN_TRANSLATE__?.(h));if(_h)h=_h;'
  );
  sourceText = sourceText.replace(
    'function K4({title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n}){',
    'function K4({title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n}){var _d=d&&(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?.(d)??globalThis.__AGY_ZHCN_TRANSLATE__?.(d)??globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(d));if(_d)d=_d;var _f=f&&globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(f);if(_f)f=_f;'
  );
  sourceText = sourceText.replace(
    'const RBc=[{id:"overview",label:"Overview"},{id:"accounts",label:"Accounts"},{id:"skills",label:"Skills"},{id:"mcp",label:"MCP"},{id:"agents",label:"Agents"},{id:"hooks",label:"Hooks"},{id:"rules",label:"Rules"},{id:"uiExtensions",label:"UI Extensions"},{id:"sidecars",label:"Automations"},{id:"context-providers",label:"Context Providers"}];',
    'const RBc=[{id:"overview",label:"概览"},{id:"accounts",label:"账户"},{id:"skills",label:"技能"},{id:"mcp",label:"MCP"},{id:"agents",label:"智能体"},{id:"hooks",label:"钩子"},{id:"rules",label:"规则"},{id:"uiExtensions",label:"UI 扩展"},{id:"sidecars",label:"自动化"},{id:"context-providers",label:"上下文提供程序"}];'
  );
  sourceText = sourceText.replaceAll('{title:"Commands",count:n.length}', '{title:"命令",count:n.length}');
  sourceText = sourceText.replaceAll('{title:"Skills",count:p.length}', '{title:"技能",count:p.length}');
  sourceText = sourceText.replaceAll('{title:"Agents",\ncount:a.agents.length}', '{title:"智能体",\ncount:a.agents.length}');
  sourceText = sourceText.replaceAll('{title:"MCP servers",count:a.mcpServers.length}', '{title:"MCP 服务器",count:a.mcpServers.length}');
  sourceText = sourceText.replaceAll('{title:"Rules",count:a.rules.length}', '{title:"规则",count:a.rules.length}');
  sourceText = sourceText.replaceAll('{title:"Hooks",count:q}', '{title:"钩子",count:q}');
  sourceText = sourceText.replaceAll('{title:"UI extensions",\ncount:b.length}', '{title:"UI 扩展",\ncount:b.length}');
  sourceText = sourceText.replaceAll('{title:"Automations",count:c.length}', '{title:"自动化",count:c.length}');
  sourceText = sourceText.replaceAll('{title:"Context Providers",count:d.length}', '{title:"上下文提供程序",count:d.length}');
  sourceText = sourceText.replaceAll('{title:"Themes",count:a.themes.length}', '{title:"主题",count:a.themes.length}');
  sourceText = sourceText.replace(
    'function Y4({markdown:a,className:b,baseDirUri:c}){',
    'function Y4({markdown:a,className:b,baseDirUri:c}){a=globalThis.__AGY_ZHCN_TRANSLATE_MD__?globalThis.__AGY_ZHCN_TRANSLATE_MD__(a):a;'
  );
  sourceText = sourceText.replaceAll('"Setup required"', '"需要配置"');
  sourceText = sourceText.replaceAll('"This server needs you to sign in before the agent can use its tools."', '"此服务器需要你先登录，智能体才能使用其工具。"');
  sourceText = sourceText.replaceAll('"These servers need you to sign in before the agent can use their tools."', '"这些服务器需要你先登录，智能体才能使用它们的工具。"');
  sourceText = sourceText.replaceAll('"Accounts tab"', '"“账户”标签页"');
  sourceText = sourceText.replaceAll('"Pick one of these themes under Preset in Settings > Appearance."', '"在“设置 > 外观 > 预设”中选择其中一款主题。"');
  sourceText = sourceText.replaceAll('"Open Appearance"', '"打开外观设置"');
  sourceText = sourceText.replaceAll('"Developer"),B.createElement("dd"', '"开发者"),B.createElement("dd"');
  sourceText = sourceText.replaceAll('"Version"),B.createElement("dd"', '"版本"),B.createElement("dd"');
  sourceText = sourceText.replaceAll('"Links"),B.createElement("dd"', '"链接"),B.createElement("dd"');
  sourceText = sourceText.replaceAll('"Removing...":Fb?"Enabling...":"Adding..."', '"正在移除...":Fb?"正在启用...":"正在添加..."');
  sourceText = sourceText.replaceAll('busyLabel:L?"Uninstalling', 'busyLabel:L?"正在卸载');
  sourceText = sourceText.replaceAll('"Signed in as ",h.label,". To use another account, add it in the"," ",g," and make it the default."', '"当前已登录为 ",h.label,"。如需切换其他账号，请前往 ",g," 添加并将其设为默认。"');
  sourceText = sourceText.replaceAll('"Signed in as"," ",B.createElement(OQ', '"当前登录账号"," ",B.createElement(OQ');
  sourceText = sourceText.replaceAll('"Couldn\'t switch accounts: ",d', '"无法切换账号：",d');
  sourceText = sourceText.replaceAll('"Blocked by organization policy"', '"已被组织策略阻止"');
  sourceText = sourceText.replaceAll('"Configuration parameters are required before this server can be started"', '"启动此服务器前，必须先配置所需参数"');
  sourceText = sourceText.replaceAll('`MCP server ${G} requires authentication: sign in to "${G}" in the Accounts section of plugin "${a.spec.pluginName}"`:`MCP server ${G} requires authentication`', '`MCP 服务器 ${G} 需要身份验证：请在插件“${a.spec.pluginName}”的“账户”部分登录 "${G}"`:`MCP 服务器 ${G} 需要身份验证`');
  sourceText = sourceText.replaceAll('"Plugin: ",a.spec.pluginName', '"插件：",a.spec.pluginName');
  sourceText = sourceText.replaceAll('"Unknown Server"', '"未知服务器"');
  sourceText = sourceText.replaceAll('"Configure")', '"配置")');
  sourceText = sourceText.replaceAll('"Authenticate")', '"身份验证")');
  sourceText = sourceText.replaceAll('case 1:return{label:"Ready"', 'case 1:return{label:"就绪"');

  sourceText = sourceText.replace(
    'const PBc={starting:"Starting...",stopping:"Stopping...",disabled:"Disabled",idle:void 0};',
    'const PBc={starting:"正在启动...",stopping:"正在停止...",disabled:"已禁用",idle:void 0};'
  );
  sourceText = sourceText.replace(
    'ic.length>0&&B.createElement("div",{className:"mb-2 px-3 font-semibold text-foreground"},\n"Configured servers")',
    'ic.length>0&&B.createElement("div",{className:"mb-2 px-3 font-semibold text-foreground"},\n"已配置的服务器")'
  );

  sourceText = sourceText.replaceAll('case 2:return{label:"Unauthenticated"', 'case 2:return{label:"未认证"');
  sourceText = sourceText.replaceAll('case 3:return{label:"App update required"', 'case 3:return{label:"需要更新应用"');
  sourceText = sourceText.replaceAll('case 4:return{label:"Plugin update required"', 'case 4:return{label:"需要更新插件"');
  sourceText = sourceText.replaceAll('case 5:return{label:"Error"', 'case 5:return{label:"错误"');
  sourceText = sourceText.replaceAll('{label:"Disabled"', '{label:"已禁用"');
  sourceText = sourceText.replaceAll(':{label:"Ready"', ':{label:"就绪"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm text-muted-foreground font-medium"},"Event:")', 'B.createElement("span",{className:"text-sm text-muted-foreground font-medium"},"触发事件：")');
  sourceText = sourceText.replaceAll('B.createElement("span",\n{className:"text-sm text-muted-foreground font-medium"},"Target Tools:")', 'B.createElement("span",\n{className:"text-sm text-muted-foreground font-medium"},"目标工具：")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm text-muted-foreground font-medium"},"Command:")', 'B.createElement("span",{className:"text-sm text-muted-foreground font-medium"},"执行命令：")');
  sourceText = sourceText.replaceAll('c==="extension"?`UI Extension ${l+1}`:`Automation ${l+1}`', 'c==="extension"?`UI 扩展 ${l+1}`:`自动化 ${l+1}`');
  sourceText = sourceText.replaceAll('"UI Extension (SidePanel)"', '"UI 扩展（侧面板）"');
  sourceText = sourceText.replaceAll('"Scheduled Task"', '"定时任务"');
  sourceText = sourceText.replaceAll(':"Automation"', ':"自动化"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.RUNNING:return{label:"Running"', 'case I.SidecarStatus.RUNNING:return{label:"运行中"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.STARTING:return{label:"Starting"', 'case I.SidecarStatus.STARTING:return{label:"启动中"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.STOPPED:return{label:"Stopped"', 'case I.SidecarStatus.STOPPED:return{label:"已停止"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.ERRORED:return{label:"Error"', 'case I.SidecarStatus.ERRORED:return{label:"错误"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.BACKOFF:return{label:"Backoff"', 'case I.SidecarStatus.BACKOFF:return{label:"重试等待"');
  sourceText = sourceText.replaceAll('default:return{label:"Unknown"', 'default:return{label:"未知"');
  sourceText = sourceText.replaceAll('"Side Pane UI Available"', '"侧面板界面可用"');
  sourceText = sourceText.replaceAll('"Stream and control ",q," directly in the side pane."', '"直接在侧面板中实时查看并控制 ",q,"。"');
  sourceText = sourceText.replaceAll('"Open in Side Pane"', '"在侧面板中打开"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-muted-foreground"},"Managed by plugin"', 'B.createElement("span",{className:"text-muted-foreground"},"由插件托管"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Recent Events")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"近期事件")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-muted-foreground shrink-0"},"Host Endpoint")', 'B.createElement("span",{className:"text-muted-foreground shrink-0"},"主机端点")');
  sourceText = sourceText.replaceAll('B.createElement("h2",{className:"text-xl font-semibold text-foreground"},"Task Logs")', 'B.createElement("h2",{className:"text-xl font-semibold text-foreground"},"任务日志")');
  sourceText = sourceText.replaceAll('function J4({path:a,label:b="Copy Path"', 'function J4({path:a,label:b="复制路径"');
  sourceText = sourceText.replaceAll('b=g?"Copied":b', 'b=g?"已复制":b');

  // 9.7 图 3：设置、危险区域/删除项目 2 级弹窗、权限配置 1–4 级、预设、GitHub 4 级与界面布局
  sourceText = sourceText.replaceAll('Ra?"No resources added yet.":"No folders added yet."', 'Ra?"尚未添加资源。":"尚未添加文件夹。"');
  sourceText = sourceText.replaceAll('B.createElement(VP,{title:"Danger Zone"}', 'B.createElement(VP,{title:"危险区域"}');
  sourceText = sourceText.replaceAll('label:`Delete ${A.capitalized}`', 'label:A.lowercase==="workspace"?"删除工作区":"删除项目"');
  sourceText = sourceText.replace(
    'B.createElement("span",null,"Permanently delete"," ",B.createElement("strong",null,H||`this ${A.lowercase}`),D&&B.createElement(B.Fragment,null," including ",B.createElement("strong",null,D)),".")',
    'B.createElement("span",null,"永久删除 ",B.createElement("strong",null,H||(A.lowercase==="workspace"?"此工作区":"此项目")),D&&B.createElement(B.Fragment,null,"（含 ",B.createElement("strong",null,D),"）"),"。")'
  );
  sourceText = sourceText.replaceAll('},"Delete ",A.capitalized)}', '},A.lowercase==="workspace"?"删除工作区":"删除项目")}' );
  sourceText = sourceText.replace(
    'function nPb({activeCount:a,archivedCount:b}){var c=[];a>0&&c.push(a===1?"1 active conversation":`${a} active conversations`);b>0&&c.push(b===1?"1 archived conversation":`${b} archived conversations`);return c.join(" and ")}',
    'function nPb({activeCount:a,archivedCount:b}){var c=[];a>0&&c.push(`${a} 个活动对话`);b>0&&c.push(`${b} 个已归档对话`);return c.join(" 与 ")}'
  );
  sourceText = sourceText.replace(
    'title:`Delete ${h.capitalized}`,className:"rounded-md max-w-md"},B.createElement("div",null,B.createElement("p",\n{className:"text-foreground opacity-80 leading-relaxed mb-3"},"Are you sure you want to delete the ",h.lowercase," ",B.createElement("strong",null,b),"?"),n&&B.createElement("p",{className:"text-foreground opacity-80 leading-relaxed mb-4"},"This will permanently delete ",B.createElement("strong",null,n)," ","within it."),B.createElement("div",{className:"flex justify-end gap-3"},B.createElement(Uy,{size:"md",variant:"secondary",onClick:m},"Cancel"),B.createElement(Uy,{size:"md",variant:"destructive",\nonClick:l,"data-autofocus":"true"},"Delete")))',
    'title:h.lowercase==="workspace"?"删除工作区":"删除项目",className:"rounded-md max-w-md"},B.createElement("div",null,B.createElement("p",\n{className:"text-foreground opacity-80 leading-relaxed mb-3"},"确定要删除",h.lowercase==="workspace"?"工作区":"项目"," ",B.createElement("strong",null,b)," 吗？"),n&&B.createElement("p",{className:"text-foreground opacity-80 leading-relaxed mb-4"},"此操作将永久删除其中的 ",B.createElement("strong",null,n),"。"),B.createElement("div",{className:"flex justify-end gap-3"},B.createElement(Uy,{size:"md",variant:"secondary",onClick:m},"取消"),B.createElement(Uy,{size:"md",variant:"destructive",\nonClick:l,"data-autofocus":"true"},"删除")))'
  );
  sourceText = sourceText.replaceAll('var h=a[0],k=h.name||"Untitled project";return B.createElement("span",{className:"inline-block"},"Modified in"," "', 'var h=a[0],k=h.name||"未命名项目";return B.createElement("span",{className:"inline-block"},"修改于 "," "');
  sourceText = sourceText.replaceAll(',a.length," projects"', ',a.length," 个项目"');
  sourceText = sourceText.replaceAll('l.name||"Untitled project"', 'l.name||"未命名项目"');
  sourceText = sourceText.replaceAll('description:"Controls the actions the agent can take."', 'description:"控制智能体可执行的各类操作。"');
  sourceText = sourceText.replaceAll('description:"Whether the agent asks you to review its documents."', 'description:"控制智能体在生成计划或文档后是否请求你评审。"');
  sourceText = sourceText.replaceAll('Je=G?B.createElement(dMb,null):"Controls the actions the agent can take."', 'Je=G?B.createElement(dMb,null):"控制智能体可执行的各类操作。"');
  sourceText = sourceText.replaceAll('De=G?B.createElement(eMb,null):"Whether the agent asks you to review its documents."', 'De=G?B.createElement(eMb,null):"控制智能体在生成计划或文档后是否请求你评审。"');
  sourceText = sourceText.replaceAll('{title:"Tool Permissions",description:sc', '{title:"工具权限",description:sc');
  sourceText = sourceText.replaceAll('{title:"File Permissions",onBack:', '{title:"文件权限",onBack:');
  sourceText = sourceText.replaceAll('{title:"Network Permissions",onBack:', '{title:"网络权限",onBack:');
  sourceText = sourceText.replaceAll('{title:"Terminal Commands",onBack:', '{title:"终端命令",onBack:');
  sourceText = sourceText.replaceAll('{title:"Commands Outside Sandbox",onBack:', '{title:"沙箱外命令",onBack:');
  sourceText = sourceText.replaceAll('{title:"MCP Tools",onBack:', '{title:"MCP 工具",onBack:');
  sourceText = sourceText.replaceAll('label:"File Reads",description:"Allow/deny agent read access to specific files or directories."', 'label:"文件读取",description:"允许或拒绝智能体读取指定文件或目录。"');
  sourceText = sourceText.replaceAll('label:"File Writes",description:"Allow/deny agent write access to specific files or directories."', 'label:"文件写入",description:"允许或拒绝智能体写入指定文件或目录。"');
  sourceText = sourceText.replaceAll('label:"Read URLs",description:"Allow/deny agent read access to specific URLs or domains."', 'label:"读取网址",description:"允许或拒绝智能体访问指定网址或域名。"');
  sourceText = sourceText.replaceAll('label:"Terminal Commands",description:"Allow/deny specific terminal commands."', 'label:"终端命令",description:"允许或拒绝执行指定的终端命令。"');
  sourceText = sourceText.replaceAll('label:"Commands Outside Sandbox",description:"Allow/deny agent command execution outside the sandbox."', 'label:"沙箱外命令",description:"允许或拒绝智能体在沙箱外执行命令。"');
  sourceText = sourceText.replaceAll('label:"MCP Tools",description:"External tools the agent can call via Model Context Protocol."', 'label:"MCP 工具",description:"智能体可通过模型上下文协议 (MCP) 调用的外部工具。"');
  sourceText = sourceText.replaceAll('placeholder:"Enter tool name or server..."', 'placeholder:"输入工具或服务器名称..."');
  sourceText = sourceText.replaceAll('label:"File Access Rules",badge:Zc>0?Zc:void 0,description:"Configure allowed and denied paths for file reads and writes.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("file")}},"Open")', 'label:"文件访问规则",badge:Zc>0?Zc:void 0,description:"配置允许或拒绝文件读写的路径。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("file")}},"打开")');
  sourceText = sourceText.replaceAll('label:"Network Access Rules",badge:bd>0?bd:void 0,description:"Configure allowed and denied URLs for reading.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("network")}},"Open")', 'label:"网络访问规则",badge:bd>0?bd:void 0,description:"配置允许或拒绝读取的网址。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("network")}},"打开")');
  sourceText = sourceText.replaceAll('label:"Terminal Commands",badge:rd>0?rd:void 0,description:"Configure allowed terminal commands.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("command")}},"Open")', 'label:"终端命令",badge:rd>0?rd:void 0,description:"配置允许执行的终端命令。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("command")}},"打开")');
  sourceText = sourceText.replaceAll('label:"Commands Outside Sandbox",badge:Sb>0?Sb:void 0,description:"Configure allowed commands outside the sandbox.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("unsandboxed")}},"Open")', 'label:"沙箱外命令",badge:Sb>0?Sb:void 0,description:"配置允许在沙箱外执行的命令。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("unsandboxed")}},"打开")');
  sourceText = sourceText.replaceAll('label:"MCP Tools",badge:Jd>0?Jd:void 0,description:"Configure external tools via Model Context Protocol.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("mcp")}},"Open")', 'label:"MCP 工具",badge:Jd>0?Jd:void 0,description:"通过模型上下文协议 (MCP) 配置外部工具。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("mcp")}},"打开")');
  sourceText = sourceText.replaceAll('label:"GitHub",description:"Configure GitHub access policies.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("github")}},"Open")', 'label:"GitHub",description:"配置 GitHub 访问策略。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",onClick:()=>{Ma("github")}},"打开")');
  sourceText = sourceText.replaceAll('sc=Ng?"Modify permissions for file, terminal, and MCP tools.":"Modify permissions for file and terminal tools."', 'sc=Ng?"修改文件、终端和 MCP 工具的相关权限。":"修改文件和终端工具的相关权限。"');
  sourceText = sourceText.replaceAll('label:"Tool Permissions",badge:hg>0?hg:void 0,description:sc,rightElement:B.createElement(Uy,{variant:"secondary",size:"md",onClick:()=>{Ma("tools")}},"Open")', 'label:"工具权限",badge:hg>0?hg:void 0,description:sc,rightElement:B.createElement(Uy,{variant:"secondary",size:"md",onClick:()=>{Ma("tools")}},"打开")');
  sourceText = sourceText.replaceAll('label:"Outside of folders file access policy",description:"Configures how the agent tries to access files outside of its working folders."', 'label:"工作区外文件访问策略",description:"配置智能体尝试访问工作目录以外文件时的行为。"');
  sourceText = sourceText.replaceAll('?"Inherit Global":Xb===E.AgentSettingPolicy.ALLOW?"Allow":Xb===E.AgentSettingPolicy.DENY?"Deny":"Always Ask"', '?"继承全局":Xb===E.AgentSettingPolicy.ALLOW?"允许":Xb===E.AgentSettingPolicy.DENY?"拒绝":"始终询问"');
  sourceText = sourceText.replaceAll('?"Inherit Global":Qa===E.AgentSettingPolicy.ALLOW?\n"Allow":Qa===E.AgentSettingPolicy.DENY?"Deny":"Always Ask"', '?"继承全局":Qa===E.AgentSettingPolicy.ALLOW?\n"允许":Qa===E.AgentSettingPolicy.DENY?"拒绝":"始终询问"');
  sourceText = sourceText.replaceAll('"Disabled by organization policy"', '"已被组织策略禁用"');
  sourceText = sourceText.replaceAll('label:"Terminal Command Auto Execution",description:"Controls whether terminal commands require your approval before running."', 'label:"终端命令自动执行",description:"控制终端命令运行前是否需要你的确认批准。"');
  sourceText = sourceText.replaceAll('"Inherit Global":w6a(', '"继承全局":w6a(');
  sourceText = sourceText.replaceAll('"Terminal sandbox is not supported in this environment"', '"当前环境不支持终端沙箱"');
  sourceText = sourceText.replaceAll('?"Inherit Global":Qa===E.CascadeCommandsAutoExecution.EAGER?"Always Proceed":Qa===E.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX?"Proceed in Sandbox":"Require Review"', '?"继承全局":Qa===E.CascadeCommandsAutoExecution.EAGER?"始终自动执行":Qa===E.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX?"沙箱内自动执行":"需要审核"');
  sourceText = sourceText.replaceAll('label:"Enable Sandbox Mode",description:"Restricts agent tools to a secure, isolated local sandbox."', 'label:"启用沙箱模式",description:"将智能体工具限制在安全隔离的本地沙箱中运行。"');
  sourceText = sourceText.replaceAll('label:"Enable Sandbox Mode",labelId:fe,description:"Restricts agent tools to a secure, isolated local sandbox."', 'label:"启用沙箱模式",labelId:fe,description:"将智能体工具限制在安全隔离的本地沙箱中运行。"');
  sourceText = sourceText.replaceAll('"managed by your organization"', '"由你的组织统一管理"');
  sourceText = sourceText.replaceAll('"Enabled":ec===void 0?"Inherit Global":ec?"Enabled":"Disabled":"Disabled"', '"已启用":ec===void 0?"继承全局":ec?"已启用":"已禁用":"已禁用"');
  sourceText = sourceText.replaceAll('Qa===void 0?"Inherit Global":Qa===!0?"Enabled":"Disabled"', 'Qa===void 0?"继承全局":Qa===!0?"已启用":"已禁用"');
  sourceText = sourceText.replaceAll('VP,{title:G?"Global Permissions":"Agent Settings"}', 'VP,{title:G?"全局权限":"智能体设置"}');
  sourceText = sourceText.replaceAll('label:"Security Preset"', 'label:"安全预设"');
  sourceText = sourceText.replaceAll('Ze==="use_global"?\n"Inherit Global":Ze==="custom"?"Custom":ZS[lb][Ze]?.displayName??"Custom"', 'Ze==="use_global"?\n"继承全局":Ze==="custom"?"自定义":ZS[lb][Ze]?.displayName??"自定义"');
  sourceText = sourceText.replaceAll('Qa==="use_global"?"Inherit Global":Qa==="custom"?"Custom":ZS[lb][Qa]?.displayName??"Custom"', 'Qa==="use_global"?"继承全局":Qa==="custom"?"自定义":ZS[lb][Qa]?.displayName??"自定义"');
  sourceText = sourceText.replaceAll('Qa==="use_global"?`Inherits your Global Permissions when working ${M}.`:Qa==="custom"?"Manually customize individual settings.":ZS[lb][Qa]?.shortDescription', 'Qa==="use_global"?`在${M==="in these conversations"?"这些对话":M==="in this workspace"?"此工作区":"此项目"}中工作时继承全局权限。`:Qa==="custom"?"手动自定义各项设置。":ZS[lb][Qa]?.shortDescription');
  sourceText = sourceText.replaceAll('"Your agent\\u2019s ability to execute commands is also controlled by enterprise security policies."', '"智能体执行命令的权限同时受企业安全策略控制。"');
  sourceText = sourceText.replaceAll('VP,{title:"Agent Behavior"}', 'VP,{title:"智能体行为"}');
  sourceText = sourceText.replaceAll('a==="use_global"?"Inherit Global":a==="turbo"?"Always Proceed":"Always Ask"', 'a==="use_global"?"继承全局":a==="turbo"?"始终继续":"始终询问"');
  sourceText = sourceText.replaceAll('Qa==="use_global"?"Inherit Global":Qa==="turbo"?"Always Proceed":"Always Ask"', 'Qa==="use_global"?"继承全局":Qa==="turbo"?"始终继续":"始终询问"');
  sourceText = sourceText.replaceAll('VP,{title:ra?"Permissions":"Global Permissions"', 'VP,{title:ra?"权限":"全局权限"');
  sourceText = sourceText.replaceAll('"Configure global allowed and denied resource permissions."', '"配置全局允许和拒绝的资源权限。"');
  sourceText = sourceText.replaceAll('label:ra?"This Computer":"Permission Preset"', 'label:ra?"本地电脑":"权限预设"');
  sourceText = sourceText.replaceAll('description:"Controls permissions for remote conversations."', 'description:"控制远程对话的权限。"');
  sourceText = sourceText.replaceAll('B.createElement("span",null,"Advanced")', 'B.createElement("span",null,"高级")');
  sourceText = sourceText.replaceAll('VP,{title:"Permission Settings",', 'VP,{title:"权限设置",');
  sourceText = sourceText.replaceAll('label:"Permission Preset"', 'label:"权限预设"');
  sourceText = sourceText.replaceAll('v!=="use_global"&&v?AB[ta(v)]?.label??v:"Inherit Global"', 'v!=="use_global"&&v?AB[ta(v)]?.label??v:"继承全局"');
  sourceText = sourceText.replaceAll('Qa==="use_global"?"Inherit Global":AB[Qa]?.label??Qa', 'Qa==="use_global"?"继承全局":AB[Qa]?.label??Qa');
  sourceText = sourceText.replaceAll('Qa==="use_global"?`Inherits your Global Permissions when working ${M}.`:AB[Qa]?.description??""', 'Qa==="use_global"?`在${M==="in these conversations"?"这些对话":M==="in this workspace"?"此工作区":"此项目"}中工作时继承全局权限。`:AB[Qa]?.description??""');
  sourceText = sourceText.replaceAll('VP,{title:"Local Permissions",subtitle:kf}', 'VP,{title:"本地权限",subtitle:kf}');
  sourceText = sourceText.replaceAll('VP,{title:"Permission Details"}', 'VP,{title:"权限详情"}');
  sourceText = sourceText.replaceAll(
    'var AB={request_review:{label:"Request Review",description:"Every command requires approval.",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.OFF,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,permissionPreset:E.AgentPermissionPreset.REQUEST_REVIEW}},"default":{label:"Default",description:"Ask before sensitive operations.",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,\npermissionPreset:E.AgentPermissionPreset.DEFAULT}},auto:{label:"Auto",description:"Automatically decide if commands run.",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.AUTO,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,permissionPreset:E.AgentPermissionPreset.AUTO}},turbo:{label:"Turbo",description:"Run all commands without restrictions.",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.EAGER,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ALLOW,\npermissionPreset:E.AgentPermissionPreset.TURBO}}}',
    'var AB={request_review:{label:"请求审核",description:"每条命令均需人工批准。",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.OFF,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,permissionPreset:E.AgentPermissionPreset.REQUEST_REVIEW}},"default":{label:"默认",description:"敏感操作前向你询问确认。",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,\npermissionPreset:E.AgentPermissionPreset.DEFAULT}},auto:{label:"自动",description:"自动判断是否运行命令。",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.AUTO,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ASK,permissionPreset:E.AgentPermissionPreset.AUTO}},turbo:{label:"极速",description:"无限制直接运行所有命令。",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:E.CascadeCommandsAutoExecution.EAGER,nonWorkspaceFileAccessPolicy:E.AgentSettingPolicy.ALLOW,\npermissionPreset:E.AgentPermissionPreset.TURBO}}}'
  );
  sourceText = sourceText.replace(
    'ZS={macos_linux:{default_unix:{displayName:"Default",shortDisplayName:"Default",shortDescription:"Requires manual review for all terminal commands and file accesses outside of the working folders.",\nlongDescription:"Useful for typical development with an emphasis on security. It prioritizes safety over speed by requiring manual approval for all terminal commands and files outside the project directory.",iconName:"shield_lock"},full_machine_unix:{displayName:"Full machine",shortDisplayName:"Machine",shortDescription:"All terminal commands require review. The agent can read or write to any file in the machine.",longDescription:"Useful for tasks that require file access across your full machine. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running.",\niconName:"laptop_shield"},unrestricted_unix:{displayName:"Turbo mode",shortDisplayName:"Turbo",shortDescription:"Disables all safety barriers for maximal iteration velocity.",longDescription:"A high-risk mode that disables all safety barriers. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts.",iconName:"gpp_maybe"}},windows:{default_windows:{displayName:"Default",shortDisplayName:"Default",shortDescription:"Requires manual review for all terminal commands and file accesses outside of the working folders.",\nlongDescription:"Useful for typical development with an emphasis on security. It prioritizes safety over speed by requiring manual approval for all terminal commands and files outside the project directory.",iconName:"shield_lock"},full_machine_windows:{displayName:"Full machine",shortDisplayName:"Machine",shortDescription:"All terminal commands require review. The agent can read or write to any file in the machine.",longDescription:"Useful for tasks that require file access across your full machine. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running.",\niconName:"laptop_shield"},unrestricted_windows:{displayName:"Turbo mode",shortDisplayName:"Turbo",shortDescription:"Disables all safety barriers for maximal iteration velocity.",longDescription:"A high-risk mode that disables all safety barriers. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts.",iconName:"gpp_maybe"}}}',
    'ZS={macos_linux:{default_unix:{displayName:"默认",shortDisplayName:"默认",shortDescription:"所有终端命令及工作目录外的文件访问均需人工审核。",\nlongDescription:"适合注重安全性的日常开发。通过要求对所有终端命令与项目目录外的文件访问进行人工确认，优先保障安全。",iconName:"shield_lock"},full_machine_unix:{displayName:"全机模式",shortDisplayName:"整机",shortDescription:"所有终端命令均需审核；智能体可读写本机任意文件。",longDescription:"适合需要跨整个系统访问文件的任务。智能体拥有所有本地文件的完整读写权限，但所有终端命令在运行前均需人工审核批准。",\niconName:"laptop_shield"},unrestricted_unix:{displayName:"极速模式",shortDisplayName:"极速",shortDescription:"禁用全部安全防护以获得最快迭代速度。",longDescription:"此高风险模式将关闭所有安全护栏。智能体拥有完整系统访问权限，会自动执行全部终端命令并读写所有本地文件，不再弹窗确认。",iconName:"gpp_maybe"}},windows:{default_windows:{displayName:"默认",shortDisplayName:"默认",shortDescription:"所有终端命令及工作目录外的文件访问均需人工审核。",\nlongDescription:"适合注重安全性的日常开发。通过要求对所有终端命令与项目目录外的文件访问进行人工确认，优先保障安全。",iconName:"shield_lock"},full_machine_windows:{displayName:"全机模式",shortDisplayName:"整机",shortDescription:"所有终端命令均需审核；智能体可读写本机任意文件。",longDescription:"适合需要跨整个系统访问文件的任务。智能体拥有所有本地文件的完整读写权限，但所有终端命令在运行前均需人工审核批准。",\niconName:"laptop_shield"},unrestricted_windows:{displayName:"极速模式",shortDisplayName:"极速",shortDescription:"禁用全部安全防护以获得最快迭代速度。",longDescription:"此高风险模式将关闭所有安全护栏。智能体拥有完整系统访问权限，会自动执行全部终端命令并读写所有本地文件，不再弹窗确认。",iconName:"gpp_maybe"}}}'
  );
  sourceText = sourceText.replace(
    'kj={project4k:{title:"Project 4K",description:"Project 4K interface without developer tooling."},default:{title:"Default",description:"The full developer experience."}};',
    'kj={project4k:{title:"知识工作",description:"专为研究、写作与日常任务打造的精简界面。"},default:{title:"软件工程",description:"包含代码编写、开发工具及智能体管理的完整开发界面。"}};'
  );
  // GitHub 4 级权限与 PAT 配置全链路
  sourceText = sourceText.replaceAll('title:"GitHub Personal Access Token"', 'title:"GitHub 个人访问令牌 (PAT)"');
  sourceText = sourceText.replaceAll('"Validated with GitHub and stored in"', '"通过 GitHub 验证并安全存储于"');
  sourceText = sourceText.replaceAll('". It is not visible in the agent\'s sandbox and is shared across all your projects."', '"，对智能体沙箱不可见且在你的所有项目中共享。"');
  sourceText = sourceText.replaceAll('"Create a token"', '"创建令牌"');
  sourceText = sourceText.replaceAll('placeholder:"(empty)"', 'placeholder:"（空）"');
  sourceText = sourceText.replaceAll('g?"Hide token":"Show token"', 'g?"隐藏令牌":"显示令牌"');
  sourceText = sourceText.replaceAll('"Authenticated as"', '"当前已认证身份："');
  sourceText = sourceText.replaceAll('k.length>0?k.map(Shd).join(", "):"No access"', 'k.length>0?k.map(m=>({"read":"读取","update":"更新","merge":"合并","approve":"批准","create":"创建","delete":"删除"}[m]||Shd(m))).join("、"):"无权限"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"capitalize"},m)', 'B.createElement("span",{className:"capitalize"},({"read":"读取","update":"更新","merge":"合并","approve":"批准","create":"创建","delete":"删除"}[m]||m))');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-[11px] text-foreground"},"Agent can")', 'B.createElement("span",{className:"text-[11px] text-foreground"},"智能体可")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-[11px] text-foreground"},"for")', 'B.createElement("span",{className:"text-[11px] text-foreground"},"针对")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-[11px] text-foreground"},"Agent can run")', 'B.createElement("span",{className:"text-[11px] text-foreground"},"智能体可运行")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-[11px] text-foreground"},"at ref")', 'B.createElement("span",{className:"text-[11px] text-foreground"},"所属分支/引用")');
  sourceText = sourceText.replaceAll('"aria-label":"Remove policy"', '"aria-label":"移除策略"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Organizations")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"组织")');
  sourceText = sourceText.replaceAll('"aria-label":"Delete organization policy"', '"aria-label":"删除组织策略"');
  sourceText = sourceText.replaceAll('"A comma-separated list like org-a, org-b, or * for all."', '"使用逗号分隔列表，如 org-a, org-b，或填 * 表示全部。"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Repositories")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"仓库")');
  sourceText = sourceText.replaceAll('"aria-label":"Delete repository policy"', '"aria-label":"删除仓库策略"');
  sourceText = sourceText.replaceAll('"A comma-separated list like repo-a, repo-b, or * for all."', '"使用逗号分隔列表，如 repo-a, repo-b，或填 * 表示全部。"');
  sourceText = sourceText.replaceAll('"Contents"),B.createElement("span",{className:"text-[11px] text-muted-foreground"},"Read access to code, refs, commits, and other repository contents.")', '"代码库内容"),B.createElement("span",{className:"text-[11px] text-muted-foreground"},"对代码、引用、提交等仓库内容的只读访问权限。")');
  sourceText = sourceText.replaceAll('"Read access"),B.createElement("span",{className:"text-[11px] text-muted-foreground"},"Toggle this on to enable read access on contents.")', '"读取权限"),B.createElement("span",{className:"text-[11px] text-muted-foreground"},"开启后将允许读取仓库内容。")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Issues")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"议题 (Issues)")');
  sourceText = sourceText.replaceAll('"Allow creating issues and grant access to specific issues."', '"允许创建议题，并授予特定议题的访问权限。"');
  sourceText = sourceText.replaceAll('"Issue creation"', '"创建议题"');
  sourceText = sourceText.replaceAll('"Toggle this on to allow creating new issues."', '"开启后将允许创建新议题。"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-[11px] font-semibold text-foreground"},"Access rules")', 'B.createElement("span",{className:"text-[11px] font-semibold text-foreground"},"访问规则")');
  sourceText = sourceText.replaceAll('"Grant the selected actions on the listed issue numbers \\u2014 a comma-separated list like 1, 2, 3, or * for all."', '"为所列议题编号授予指定操作权限——用逗号分隔，如 1, 2, 3，或 * 表示全部。"');
  sourceText = sourceText.replaceAll('"+ Add issue policy"', '"+ 添加议题策略"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Pull requests")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"拉取请求 (PR)")');
  sourceText = sourceText.replaceAll('"Allow opening pull requests and grant access to specific PRs."', '"允许发起拉取请求，并授予特定 PR 的访问权限。"');
  sourceText = sourceText.replaceAll('"Pull request creation"', '"发起拉取请求"');
  sourceText = sourceText.replaceAll('"Toggle this on to allow creating new pull requests."', '"开启后将允许发起新的拉取请求。"');
  sourceText = sourceText.replaceAll('"Grant the selected actions on the listed pull request numbers \\u2014 a comma-separated list like 1, 2, 3, or * for all."', '"为所列 PR 编号授予指定操作权限——用逗号分隔，如 1, 2, 3，或 * 表示全部。"');
  sourceText = sourceText.replaceAll('"+ Add pull request policy"', '"+ 添加 PR 策略"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Remote branches")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"远程分支")');
  sourceText = sourceText.replaceAll('"Grant create, update, or delete access to specific branches."', '"授予对特定分支的创建、更新或删除权限。"');
  sourceText = sourceText.replaceAll('"Grant the selected actions on the listed branch names \\u2014 a comma-separated list like main, dev, prod (glob patterns like fix-* allowed), or * for all."', '"为所列分支授予指定操作权限——逗号分隔如 main, dev, prod（支持通配符 fix-*），或 * 表示全部。"');
  sourceText = sourceText.replaceAll('"+ Add branch policy"', '"+ 添加分支策略"');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm font-semibold text-foreground"},"Workflow runs")', 'B.createElement("span",{className:"text-sm font-semibold text-foreground"},"工作流运行")');
  sourceText = sourceText.replaceAll('"Grant read access to workflow runs and allow dispatching workflows on specific files and refs."', '"授予工作流运行的读取权限，并允许在指定文件和引用分支上触发工作流。"');
  sourceText = sourceText.replaceAll('"Run visibility"', '"运行记录可见性"');
  sourceText = sourceText.replaceAll('"Allow reading workflow runs (list, view, watch) across the whole repository."', '"允许读取整个仓库的工作流运行记录（列表、查看、监听）。"');
  sourceText = sourceText.replaceAll('"Each rule lets the agent run the listed workflow files on the listed refs \\u2014 each a comma-separated list like ci.yml, deploy.yml and main, dev (glob patterns like fix-* allowed), or * for all. Both fields must be set for a rule to grant anything."', '"每条规则允许智能体在指定引用分支上运行所列工作流文件——均支持逗号分隔列表或通配符（如 fix-*），填 * 表示全部，且两个字段均须填写方可生效。"');
  sourceText = sourceText.replaceAll('"+ Add workflow run policy"', '"+ 添加工作流策略"');
  sourceText = sourceText.replaceAll('title:"GitHub Policies",subtitle:"Enable fine-grained GitHub permissions and define the org, repository, and resource-level access the agent is allowed to use."', 'title:"GitHub 策略",subtitle:"启用精细化 GitHub 权限，定义允许智能体访问的组织、仓库与资源级权限。"');
  sourceText = sourceText.replaceAll('"Host"', '"主机"');
  sourceText = sourceText.replaceAll('"+ Add Organization policy"', '"+ 添加组织策略"');
  sourceText = sourceText.replaceAll('title:"GitHub Permissions",description:"Manage fine-grained permissions for GitHub."', 'title:"GitHub 权限",description:"管理 GitHub 的精细化访问权限。"');

  // 9.8 2.31.0 全量菜单、模型微章、侧边栏、自动化、搜索、外观与提示组件修复
  sourceText = sourceText.replace(
    'var g={id:f,label:d.label,type:d.type&&d.type!=="item"&&d.type!=="label"?d.type:"normal"',
    'var _mL={"Rename":"重命名","Pin":"置顶","Unpin":"取消置顶","Mark Read":"标记为已读","Mark Unread":"标记为未读","Copy":"复制","Cut":"剪切","Paste":"粘贴","Select All":"全选","Undo":"撤销","Redo":"重做","Delete":"删除","Delete Permanently":"永久删除","Archive":"归档","Restore":"恢复","Share":"分享","Stop":"停止","Split":"拆分","Fork":"分支","View Debug":"查看调试信息","Telemetry":"遥测","New Group":"新建分组","Remove from Group":"从分组中移除","Conversation Name":"对话名称","Conversation ID":"对话 ID","Project Name":"项目名称","Workspace Name":"工作区名称","Worktree Name":"工作树名称","Split Right":"向右拆分","Split Down":"向下拆分","Replace with New":"替换为新对话","Replace With New":"替换为新对话","Remove from Split":"从拆分中移除","Copy Image":"复制图片","Save Image":"保存图片","Save Video":"保存视频","Open in Tab":"在标签页中打开","Open in New Tab":"在新标签页中打开","Copy Link Address":"复制链接地址","Open Link in New Tab":"在新标签页中打开链接","Open Link in External Browser":"在外部浏览器中打开链接","Open Image in New Tab":"在新标签页中打开图片","Copy Image Address":"复制图片地址","Copy Message":"复制消息","Copy Path":"复制路径","Undo to Here":"撤销到此处","Fork in Shared Workspace":"在共享工作区中分叉","Fork in New Workspace":"在新工作区中分叉","Close Other Tabs":"关闭其他标签页","Close Tabs to the Left":"关闭左侧标签页","Close Tabs to the Right":"关闭右侧标签页","Comment":"评论","Open in Code Search":"在代码搜索中打开","Edit Shortcut":"编辑快捷键","Add Shortcut":"添加快捷键","Remove Shortcut":"移除快捷键","Reset to Default":"恢复默认"};var g={id:f,label:(_mL[d.label]||globalThis.__AGY_ZHCN_TRANSLATE__?.(d.label)||d.label),type:d.type&&d.type!=="item"&&d.type!=="label"?d.type:"normal"'
  );
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\(\{option:a,iconOnly:b=!1\}\)\s*=>\s*\{var c=([a-zA-Z0-9_$]+)\(\);return a\.tagTitle&&a\.tagDescription\?([A-Za-z0-9_$]+)\.createElement\(\3\.Fragment,null,\3\.createElement\("div",\{"data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1\.5 text-sm\${b\?" h-4 flex-none":""}`\},!b&&\3\.createElement\("span",null,a\.tagTitle\),\3\.createElement\(([a-zA-Z0-9_$]+),\{name:"info",className:"h-3 w-3 flex-none"\}\)\),\3\.createElement\(([a-zA-Z0-9_$]+),\{id:c\},\3\.createElement\("div",\{className:"max-w-\[200px\]"\},a\.tagDescription\)\)\):a\.tagTitle\?\3\.createElement\("div",\s*\{className:"bg-secondary rounded-full px-1\.5 text-sm"\},a\.tagTitle\):null\};/g,
    'var $1=({option:a,iconOnly:b=!1})=>{var c=$2(),tT=({"Notice":"提示","Unavailable":"不可用","New":"新","Fast":"快速","Default":"默认","Leaving Soon":"即将下线","Leaving soon":"即将下线","Paid Pro":"付费 Pro","Paid Plus":"付费 Plus","Paid Ultra":"付费 Ultra"}[a.tagTitle]||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagTitle)||a.tagTitle),tD=a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":(a.tagDescription&&(globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__?.(a.tagDescription)||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagDescription)||a.tagDescription));return a.tagTitle&&a.tagDescription?$3.createElement($3.Fragment,null,$3.createElement("div",{"data-model-selector-badge":"true","data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&$3.createElement("span",{"data-model-selector-badge":"true"},tT),$3.createElement($4,{name:"info",className:"h-3 w-3 flex-none"})),$3.createElement($5,{id:c},$3.createElement("div",{className:"max-w-[200px]"},tD))):a.tagTitle?$3.createElement("div",\n{"data-model-selector-badge":"true",className:"bg-secondary rounded-full px-1.5 text-sm"},tT):null};'
  );
  // 模型思考程度二级菜单标题、说明与选项原生汉化（跨版本正则通配混淆名）
  sourceText = sourceText.replace(
    /function ([A-Za-z0-9_$]+)\(a,b,c\)\{if\(b=([A-Za-z0-9_$]+)\.get\(b\)\)if\(c=\(c=([A-Za-z0-9_$]+)\(b,c\)\)\?b\.groupsByKey\.get\(c\.groupKey\)\?\.labels\.get\(a\):void 0\)return c;return\(Object\.hasOwn\(([A-Za-z0-9_$]+),a\)\?\4\[a\]:void 0\)\?\?a\}/g,
    'function $1(a,b,c){var _r;if(b=$2.get(b))if(c=(c=$3(b,c))?b.groupsByKey.get(c.groupKey)?.labels.get(a):void 0)_r=c;if(_r===void 0)_r=(Object.hasOwn($4,a)?$4[a]:void 0)??a;return ({low:"低",medium:"中",high:"高",xhigh:"超高",max:"极高",Low:"低",Medium:"中",High:"高",Extra:"超高","Extra High":"超高",Max:"极高"}[_r]||_r)}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Thinking effort"',
    /([A-Za-z0-9_$]+)\.createElement\("span",\{className:"whitespace-nowrap"\},\s*"Thinking effort"\)/g,
    '$1.createElement("span",{className:"whitespace-nowrap"},"思考程度")'
  );
  // 对话步骤进度胶囊（例如 0/4 steps, 6/6 steps）跨版本原生汉化
  sourceText = fastAnchorReplace(
    sourceText,
    ' steps`:""',
    /\[([A-Za-z0-9_$]+)>0\?`\$\{([A-Za-z0-9_$]+)\}\/\$\{\1\} steps`:"",([A-Za-z0-9_$]+)>0\?`\$\{\3\} failed`:"",([A-Za-z0-9_$]+)>0\?`\$\{\4\} skipped`:""\]/g,
    '[$1>0?`${$2}/${$1} 步骤`:"",$3>0?`${$3} 项失败`:"",$4>0?`${$4} 项已跳过`:""]'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"data-testid":"step-plan-chip"',
    /("data-testid":"step-plan-chip"[\s\S]{0,60}?"aria-label":`\$\{([A-Za-z0-9_$]+)\}\. )\$\{([A-Za-z0-9_$]+)\?"Hide":"Show"\} plan`/g,
    '$1${$3?"收起":"展开"}计划`'
  );
  // 代码块头部与文件预览视图切换器（Preview / Raw -> 预览 / 源码）
  sourceText = sourceText.replaceAll('"aria-label":"Markdown view mode"', '"aria-label":"Markdown 视图模式"');
  sourceText = fastAnchorReplace(
    sourceText,
    '"code-block-preview-button"',
    /(value:"preview","data-testid":"code-block-preview-button"\s*\},\s*)"Preview"/g,
    '$1"预览"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"code-block-raw-button"',
    /(value:"raw","data-testid":"code-block-raw-button"\s*\},\s*)"Raw"/g,
    '$1"源码"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'previewMode:"preview"',
    /(previewMode:"preview"\s*\}\s*\}\s*,\s*[A-Za-z0-9_$]+\s*\)\s*\}\s*\}\s*,\s*)"Preview"/g,
    '$1"预览"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'previewMode:"raw"',
    /(previewMode:"raw"\s*\}\s*\}\s*,\s*[A-Za-z0-9_$]+\s*\)\s*\}\s*\}\s*,\s*)"Raw"/g,
    '$1"源码"'
  );
  sourceText = sourceText.replace(
    /`Preview unavailable (?:\\u2014|—) \$\{([A-Za-z0-9_$]+)\}`/g,
    '`无法预览 — ${$1}`'
  );
  sourceText = sourceText.replaceAll(
    '"Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use."',
    '"控制模型在回复前用于思考推理的时间与配额。提高思考程度可提升复杂问题的解答准确率，但会增加回复耗时并消耗更多配额。"'
  );

  sourceText = sourceText.replaceAll('function S2b(a){switch(a){case "system":return"System UI";case "inter":return"Inter";case "google-sans":return"Google Sans"}}', 'function S2b(a){switch(a){case "system":return"系统默认";case "inter":return"Inter";case "google-sans":return"Google Sans"}}');
  sourceText = sourceText.replaceAll('label:"Screen Reader Mode",description:"Optimize the interface and terminal output for screen readers."', 'label:"屏幕阅读器模式",description:"针对屏幕阅读器优化界面和终端输出。"');
  sourceText = sourceText.replaceAll('label:"Conversation Width",description:"Configure the maximum width of the conversation panel."', 'label:"对话宽度",description:"配置对话面板的最大显示宽度。"');
  sourceText = sourceText.replaceAll('case 2:return"Narrow";case 3:return"Wide";case 4:return"Fill";default:return"Default"', 'case 2:return"窄";case 3:return"宽";case 4:return"铺满";default:return"默认"');
  sourceText = sourceText.replaceAll('label:"Terminal Placement",description:"Choose where terminal sessions appear."', 'label:"终端位置",description:"选择终端会话的显示位置。"');
  sourceText = sourceText.replaceAll('case "bottomPanel":return"Bottom Panel";default:return"Side Panel"', 'case "bottomPanel":return"底部面板";default:return"侧面板"');
  sourceText = sourceText.replaceAll('emptyText:d="No artifacts generated"', 'emptyText:d="暂无已生成的工件"');
  sourceText = sourceText.replaceAll('emptyText:g="No artifacts generated"', 'emptyText:g="暂无已生成的工件"');
  sourceText = sourceText.replaceAll('h.length===0?B.createElement(m4,null,"No active terminals")', 'h.length===0?B.createElement(m4,null,"暂无活动终端")');
  sourceText = sourceText.replaceAll('"No active terminals"),B.createElement(Uy', '"暂无活动终端"),B.createElement(Uy');
  sourceText = sourceText.replaceAll(',"New Terminal")', ',"新建终端")');
  sourceText = sourceText.replaceAll('"Cannot revert a message sent while the agent was running"', '"无法还原在智能体运行期间发送的消息"');
  sourceText = sourceText.replaceAll('"Cannot revert messages before or at the point where Best of N mode was triggered"', '"无法还原触发多候选生成 (Best of N) 当时及之前的消息"');
  sourceText = sourceText.replaceAll('uppercase tracking-wider"},"Quick Start")', 'uppercase tracking-wider"},"快速开始")');
  sourceText = sourceText.replaceAll('k=k?"subagent conversation":"main conversation"', 'k=k?"子智能体对话":"主对话"');
  sourceText = sourceText.replaceAll('g=g?.isMidTurn?"Started during":"Started from"', 'g=g?.isMidTurn?"始于":"发起自"');
  sourceText = sourceText.replaceAll('A?"See less":`See all (${c})`', 'A?"收起":`查看全部 (${c})`');
  sourceText = sourceText.replaceAll('C?`See all (${z.items.length})`:"See less"', 'C?`查看全部 (${z.items.length})`:"收起"');
  sourceText = sourceText.replaceAll('"aria-label":h?"Copied":"Copy code"', '"aria-label":h?"已复制":"复制代码"');
  sourceText = sourceText.replaceAll('B.createElement(Sy,{id:n,place:"top"},h?"Copied":"Copy code")', 'B.createElement(Sy,{id:n,place:"top"},h?"已复制":"复制代码")');
  sourceText = sourceText.replaceAll('B.createElement(Sy,{id:l,place:"top"},"Insert in Terminal")', 'B.createElement(Sy,{id:l,place:"top"},"在终端中插入")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm"},"Comment")', 'B.createElement("span",{className:"text-sm"},"评论")');
  sourceText = sourceText.replaceAll('"aria-label":b?"Copied":"Copy"', '"aria-label":b?"已复制":"复制"');
  sourceText = sourceText.replaceAll('"aria-label":t?"Copied":"Copy"', '"aria-label":t?"已复制":"复制"');
  sourceText = sourceText.replaceAll('B.createElement(Sy,{id:f,place:"top-end"},b?"Copied":"Copy")', 'B.createElement(Sy,{id:f,place:"top-end"},b?"已复制":"复制")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm"},"Quote")', 'B.createElement("span",{className:"text-sm"},"引用")');
  sourceText = sourceText.replaceAll('id:"quote",label:"Quote"', 'id:"quote",label:"引用"');
  sourceText = sourceText.replaceAll('B.createElement("span",null,"Quote")', 'B.createElement("span",null,"引用")');
  sourceText = sourceText.replaceAll('B.createElement("span",{className:"text-sm whitespace-nowrap"},\n"Quote")', 'B.createElement("span",{className:"text-sm whitespace-nowrap"},\n"引用")');
  sourceText = sourceText.replaceAll('B.createElement(Sy,{id:m,place:"top"},\n"At Mention Code Block")', 'B.createElement(Sy,{id:m,place:"top"},\n"@ 提及代码块")');
  sourceText = sourceText.replaceAll('B.createElement("span",null,a," of ",c)', 'B.createElement("span",null,a," / ",c)');
  sourceText = sourceText.replaceAll('"aria-label":`Go to turn ${a} of ${c}`', '"aria-label":`前往第 ${a} 轮，共 ${c} 轮`');
  sourceText = sourceText.replaceAll(':"the main conversation"', ':"主会话"');
  sourceText = sourceText.replaceAll('"aria-label":`${q}. Show in ${k}`', '"aria-label":`${q}。在${k}中显示`');
  sourceText = sourceText.replaceAll('"See all (",b.length,")"', '"查看全部 (",b.length,")"');
  sourceText = sourceText.replaceAll('placeholder:J?"Search or enter a URL":"Search tabs, files and more"', 'placeholder:J?"搜索或输入网址":"搜索标签页、文件等更多内容"');
  sourceText = sourceText.replaceAll('"Previous match"', '"上一个匹配项"');
  sourceText = sourceText.replaceAll('"Next match"', '"下一个匹配项"');
  sourceText = sourceText.replaceAll('B.createElement(tT,null,"GitHub Repositories")', 'B.createElement(tT,null,"GitHub 仓库")');
  sourceText = sourceText.replaceAll('B.createElement(tT,null,\n"Remote Projects")', 'B.createElement(tT,null,\n"远程项目")');
  sourceText = sourceText.replaceAll('B.createElement(tT,null,"Recent")', 'B.createElement(tT,null,"最近")');
  sourceText = sourceText.replaceAll('searchPlaceholder:D?"Search Workspaces\\u2026":"Search Projects\\u2026"', 'searchPlaceholder:D?"搜索工作区\\u2026":"搜索项目\\u2026"');
  sourceText = sourceText.replaceAll('searchPlaceholder:D?"Search Workspaces\\u2026":\n"Search Projects\\u2026"', 'searchPlaceholder:D?"搜索工作区\\u2026":\n"搜索项目\\u2026"');
  sourceText = sourceText.replaceAll('f.trim()?"No matching repositories":"No repositories found"', 'f.trim()?"未找到匹配的仓库":"未找到仓库"');
  sourceText = sourceText.replaceAll('"No projects created"', '"尚未创建项目"');
  sourceText = sourceText.replaceAll('"Missing a repository? Configure on GitHub"', '"找不到仓库？前往 GitHub 配置"');
  sourceText = sourceText.replaceAll('"No ",C," found"', '"未找到",({"projects":"项目","workspaces":"工作区"}[C]||C)');
  sourceText = sourceText.replaceAll('"No matching ",C', '"未找到匹配的",({"projects":"项目","workspaces":"工作区"}[C]||C)');
  sourceText = sourceText.replaceAll('Gb.trim()?`No matching ${C}`:`No remote ${C}`', 'Gb.trim()?`未找到匹配的${({"projects":"项目","workspaces":"工作区"}[C]||C)}`:`暂无远程${({"projects":"项目","workspaces":"工作区"}[C]||C)}`');
  sourceText = sourceText.replaceAll('title:"Create Project"', 'title:"创建项目"');
  sourceText = sourceText.replaceAll(',"New Workspace")', ',"新建工作区")');
  // 自动化与定时任务界面原生静态汉化（通用正则兼容各版本构建）
  sourceText = fastAnchorReplace(
    sourceText,
    '"sidecar-list-empty"',
    /([A-Za-z_$][A-Za-z0-9_$]*)\.createElement\("p",\{className:"px-2\.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"\},[\s\r\n]*"No ",([A-Za-z_$][A-Za-z0-9_$]*)\.emptyMessagePlural,[\s\r\n]*" match \\u201c",([A-Za-z_$][A-Za-z0-9_$]*),"\\u201d\."\)/g,
    '$1.createElement("p",{className:"px-2.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"},"未找到匹配“",$3,"”的",({"automations":"自动化","scheduled tasks":"定时任务"}[$2.emptyMessagePlural]||$2.emptyMessagePlural),"。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'className:"m-0 text-lg text-foreground"',
    /([A-Za-z_$][A-Za-z0-9_$]*)\.createElement\("p",\{className:"m-0 text-lg text-foreground"\},"No ",([A-Za-z_$][A-Za-z0-9_$]*)\.emptyMessagePlural," yet"\)/g,
    '$1.createElement("p",{className:"m-0 text-lg text-foreground"},"暂无",({"automations":"自动化","scheduled tasks":"定时任务"}[$2.emptyMessagePlural]||$2.emptyMessagePlural))'
  );
  sourceText = sourceText.replace(
    /"aria-label":`Add \${([A-Za-z_$][A-Za-z0-9_$]*)\.emptyMessageSingular\}`,"data-testid":"sidecar-new-button"/g,
    '"aria-label":$1.emptyMessageSingular==="automation"?"新建自动化":"新建定时任务","data-testid":"sidecar-new-button"'
  );
  sourceText = sourceText.replace(
    /"data-testid":"sidecar-new-button",paddingClassName:"pl-2\.5 pr-3",icon:([A-Za-z_$][A-Za-z0-9_$]*)\.createElement\(([A-Za-z_$][A-Za-z0-9_$]*),\{name:"add",size:14\}\)\},"New"\)\)\)/g,
    '"data-testid":"sidecar-new-button",paddingClassName:"pl-2.5 pr-3",icon:$1.createElement($2,{name:"add",size:14})},"新建")))'
  );
  sourceText = sourceText.replace(
    /emptyMessage:([A-Za-z_$][A-Za-z0-9_$]*)\?`No \${([A-Za-z_$][A-Za-z0-9_$]*)\.emptyMessagePlural\} matching your search`:`No \${\2\.emptyMessagePlural\} configured\.`/g,
    'emptyMessage:$1?`未找到匹配搜索的${({"automations":"自动化","scheduled tasks":"定时任务"}[$2.emptyMessagePlural]||$2.emptyMessagePlural)}`:`未配置${({"automations":"自动化","scheduled tasks":"定时任务"}[$2.emptyMessagePlural]||$2.emptyMessagePlural)}。`'
  );
  sourceText = sourceText.replaceAll('B.createElement("p",{className:"px-2.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"},"No ",t.emptyMessagePlural,\n" match \\u201c",P,"\\u201d.")', 'B.createElement("p",{className:"px-2.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"},"未找到匹配“",P,"”的",({"automations":"自动化","scheduled tasks":"定时任务"}[t.emptyMessagePlural]||t.emptyMessagePlural),"。")');
  sourceText = sourceText.replaceAll('B.createElement("p",{className:"m-0 text-lg text-foreground"},"No ",t.emptyMessagePlural," yet")', 'B.createElement("p",{className:"m-0 text-lg text-foreground"},"暂无",({"automations":"自动化","scheduled tasks":"定时任务"}[t.emptyMessagePlural]||t.emptyMessagePlural))');
  sourceText = sourceText.replaceAll('paddingClassName:"pl-2.5 pr-3",\nicon:B.createElement(dq,{name:"add",size:14})},"New")))', 'paddingClassName:"pl-2.5 pr-3",\nicon:B.createElement(dq,{name:"add",size:14})},"新建")))');
  sourceText = sourceText.replaceAll('title:"Scheduled Tasks",sidebarLabel:"Scheduled Tasks",searchPlaceholder:"Search tasks..."', 'title:"定时任务",sidebarLabel:"定时任务",searchPlaceholder:"搜索任务..."');
  sourceText = sourceText.replaceAll('title:"Automations",sidebarLabel:"Automations",searchPlaceholder:"Search automations..."', 'title:"自动化",sidebarLabel:"自动化",searchPlaceholder:"搜索自动化..."');
  sourceText = sourceText.replaceAll('g?.isGoogleInternal===!1&&"Powered by Gemini Live \\u00b7 ","You can change this in"', 'g?.isGoogleInternal===!1&&"由 Gemini Live 提供技术支持 · ","你稍后可在"');
  sourceText = sourceText.replaceAll('onClick:()=>{y();a();f({targetScreen:"General",targetSection:"voice"})},className:"p-0 bg-transparent border-none text-sm text-muted-foreground underline cursor-pointer hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"},\n"Settings")," ","later."', 'onClick:()=>{y();a();f({targetScreen:"General",targetSection:"voice"})},className:"p-0 bg-transparent border-none text-sm text-muted-foreground underline cursor-pointer hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"},\n"设置")," ","中更改。"');
  sourceText = sourceText.replaceAll(',"copy link"),"."', ',"复制链接"),"。"');
  sourceText = sourceText.replace(
    'B.createElement("p",{className:"opacity-70"},"Visit"," ",B.createElement("a",{href:"https://support.google.com/legal/troubleshooter/1114905?hl=en#ts=1115658",target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"Legal Help")," ","to ask for content changes for legal reasons.")',
    'B.createElement("p",{className:"opacity-70"},"如有法律方面的修改诉求，请访问"," ",B.createElement("a",{href:"https://support.google.com/legal/troubleshooter/1114905?hl=zh-Hans#ts=1115658",target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"法律帮助")," ","提交申请。")'
  );
  sourceText = sourceText.replace(
    'var BBb=[{value:E.ArtifactReviewMode.TURBO,label:"Always Proceed",description:"Agent never asks for review. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content."},{value:E.ArtifactReviewMode.ALWAYS,label:"Always Ask",description:"Agent always asks for review."}];',
    'var BBb=[{value:E.ArtifactReviewMode.TURBO,label:"始终继续",description:"智能体始终不会请求人工评审。这可最大限度提高智能体自主性，但也具有执行不安全或注入工件内容的最高风险。"},{value:E.ArtifactReviewMode.ALWAYS,label:"始终询问",description:"智能体每次都会请求你进行评审。"}];'
  );
  sourceText = sourceText.replaceAll(',"Change\\u2026"))})),g&&B.createElement(UP,{label:"Browsing History",description:c?"Clear visited URLs and autocomplete suggestions from side panel preview.":"Clear visited URLs and autocomplete suggestions from the built-in browser.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",disabled:p.length===0,onClick:q,"data-testid":"clear-browser-history-button"},"Clear")', ',"更改…"))})),g&&B.createElement(UP,{label:"浏览记录",description:c?"清除侧面板预览中的访问网址与自动填充建议。":"清除内置浏览器中的访问网址与自动填充建议。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",disabled:p.length===0,onClick:q,"data-testid":"clear-browser-history-button"},"清除")');
  sourceText = sourceText.replaceAll(',"Reset")', ',"重置")');
  sourceText = sourceText.replaceAll('},"Edit")}))', '},"编辑")}))');
  sourceText = sourceText.replace(
    'title:"Customizations",description:B.createElement("span",null,"Configure default behaviors, skills, and MCP servers.",x?.docsCustomizations&&\nB.createElement(B.Fragment,null," ",B.createElement("a",{href:x.docsCustomizations,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"Learn more"),"."))',
    'title:"插件",description:B.createElement("span",null,"配置默认行为、技能与 MCP 服务器。",x?.docsCustomizations&&\nB.createElement(B.Fragment,null," ",B.createElement("a",{href:x.docsCustomizations,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"了解更多"),"。"))'
  );
  sourceText = sourceText.replaceAll('VP,{title:"Default Customizations"}', 'VP,{title:"默认自定义项"}');
  sourceText = sourceText.replaceAll('label:"Include Jetski Default Customizations",\ndescription:"When enabled, the agent will include default customizations, including default skills."', 'label:"包含默认自定义项",\ndescription:"启用后，智能体会包含默认自定义内容，包括默认技能。"');
  sourceText = sourceText.replaceAll('VP,{title:"Token Usage"}', 'VP,{title:"Token 用量"}');
  sourceText = sourceText.replaceAll('placeholder:"Search MCP servers by name"', 'placeholder:"按名称搜索 MCP 服务器"');
  sourceText = sourceText.replaceAll('"aria-label":"Clear search"', '"aria-label":"清空搜索"');
  sourceText = sourceText.replaceAll('title:"Customizations"}', 'title:"插件"}');
  sourceText = sourceText.replaceAll('title:"Add MCP Servers",onBack:', 'title:"添加 MCP 服务器",onBack:');
  sourceText = sourceText.replaceAll('title:"Manage Hooks",onBack:', 'title:"管理钩子",onBack:');
  sourceText = sourceText.replaceAll('title:"Build With Google Plugins",onBack:', 'title:"使用 Google 插件构建",onBack:');
  sourceText = sourceText.replaceAll('title:"Select your license",onBack:', 'title:"选择你的许可证",onBack:');
  sourceText = sourceText.replaceAll('title:"Browser Actuation Permissions",onBack:', 'title:"浏览器执行权限",onBack:');
  sourceText = sourceText.replaceAll('title:"Notifications",description:"Manage your notification preferences."', 'title:"通知",description:"管理你的通知偏好设置。"');
  sourceText = sourceText.replaceAll('VP,{title:"Sound"}', 'VP,{title:"声音"}');
  sourceText = sourceText.replaceAll('label:"Volume",description:"Set the volume of agent sounds."', 'label:"音量",description:"设置智能体提示音音量。"');
  sourceText = sourceText.replaceAll('VP,{title:"Remote Agents Data"}', 'VP,{title:"远程智能体数据"}');
  sourceText = sourceText.replaceAll('UP,{label:"Delete All Remote Agents Data"', 'UP,{label:"删除所有远程智能体数据"');
  sourceText = sourceText.replaceAll('"Permanently delete your remote conversations, projects, scheduled tasks, connected plugins and settings. Data in the desktop app and your Google account are not affected."', '"永久删除你的远程对话、项目、定时任务、已连接插件和设置。桌面应用本地数据与你的 Google 账户不受影响。"');
  sourceText = sourceText.replace(
    'B.createElement(VP,{title:"Browser Subagent",\nsubtitle:n?"The browser subagent has been disabled by your administrator. Contact your administrator to enable browser use.":',
    'B.createElement(VP,{title:"浏览器子智能体",\nsubtitle:n?"你的管理员已禁用浏览器子智能体。请联系管理员以启用浏览器功能。":'
  );
  sourceText = sourceText.replaceAll(
    '"Reconnect"),B.createElement(Uy,{variant:"secondary",size:"xs","aria-label":`Disconnect ${f}`,onClick:()=>{d(f)}},"Disconnect")',
    '"重新连接"),B.createElement(Uy,{variant:"secondary",size:"xs","aria-label":`断开 ${f} 连接`,onClick:()=>{d(f)}},"断开连接")'
  );
  sourceText = sourceText.replaceAll(
    '"aria-label":`More for ${a}`},B.createElement(dq,{name:"more_vert",size:18}))),B.createElement(mT,{align:"end"},B.createElement(nT,{disabled:c,onClick:()=>{if(!f.current){var g=b();g&&(f.current=!0,d(!0),Promise.resolve(g).finally(()=>{f.current=!1;d(!1)}))}}},"Disconnect")',
    '"aria-label":`更多选项：${a}`},B.createElement(dq,{name:"more_vert",size:18}))),B.createElement(mT,{align:"end"},B.createElement(nT,{disabled:c,onClick:()=>{if(!f.current){var g=b();g&&(f.current=!0,d(!0),Promise.resolve(g).finally(()=>{f.current=!1;d(!1)}))}}},"断开连接")'
  );
  sourceText = sourceText.replaceAll(
    '"Nothing said yet"):B.createElement("ol",{"data-testid":"live-transcript"',
    '"暂无对话记录"):B.createElement("ol",{"data-testid":"live-transcript"'
  );
  sourceText = sourceText.replace(
    'var EBb=new Map([["Appearance",{sections:[{title:"Chat",settings:["verboseConversationSteps"]},{title:"Chat Layout",settings:["themeMode","conversationWidth","artifactWidth","contextUsageIndicatorEnabled"]},{title:"Terminal",settings:["terminalPlacement"]},{title:"Accessibility",settings:["customContextMenusEnabled","screenReaderMode"]}]}],["General",{sections:[{title:"Execution",settings:["queuedMessageDeliveryStrategy"]},{title:"Chat Input",settings:["enterToSendOnMobile"]}]}],["Browser",{sections:[{title:"General",\nsettings:["defaultLinkOpenTarget","agentBrowserTools","browserJsExecutionPolicy"]}]}],["Account",{sections:[{title:"General",settings:["disableCodeSnippetTelemetry"]}]}],["Models",{sections:[{title:"Quota",settings:["useAICredits"]}]}],["Customizations",{sections:[{title:"Default Customizations",settings:["includeJetskiDefaultCustomizations"]},{title:"Customize Global Skills",settings:["antigravity.customization.skills"]},{title:"Custom Agents",settings:["antigravity.customization.customAgents"]},\n{title:"MCP Servers",settings:["antigravity.customization.mcp"]}]}],["Notifications",{sections:[{title:"General",settings:["enableNotificationsForSpecialEvents","enableSoundsForSpecialEvents"]}]}],["App",{sections:[{title:"General",settings:["keepComputerAwake","runInBackground"]},{title:"Updater",settings:["autoCheckForUpdates"]}]}],["Jetski Chat",{sections:[]}],["Developer",{sections:[]}]]);',
    'var EBb=new Map([["Appearance",{sections:[{title:"对话",settings:["verboseConversationSteps"]},{title:"对话布局",settings:["themeMode","conversationWidth","artifactWidth","contextUsageIndicatorEnabled"]},{title:"终端",settings:["terminalPlacement"]},{title:"辅助功能",settings:["customContextMenusEnabled","screenReaderMode"]}]}],["General",{sections:[{title:"消息执行",settings:["queuedMessageDeliveryStrategy"]},{title:"对话输入",settings:["enterToSendOnMobile"]}]}],["Browser",{sections:[{title:"通用",\nsettings:["defaultLinkOpenTarget","agentBrowserTools","browserJsExecutionPolicy"]}]}],["Account",{sections:[{title:"通用",settings:["disableCodeSnippetTelemetry"]}]}],["Models",{sections:[{title:"配额",settings:["useAICredits"]}]}],["Customizations",{sections:[{title:"默认自定义项",settings:["includeJetskiDefaultCustomizations"]},{title:"自定义全局技能",settings:["antigravity.customization.skills"]},{title:"自定义智能体",settings:["antigravity.customization.customAgents"]},\n{title:"MCP 服务器",settings:["antigravity.customization.mcp"]}]}],["Notifications",{sections:[{title:"通用",settings:["enableNotificationsForSpecialEvents","enableSoundsForSpecialEvents"]}]}],["App",{sections:[{title:"通用",settings:["keepComputerAwake","runInBackground"]},{title:"自动更新",settings:["autoCheckForUpdates"]}]}],["Jetski Chat",{sections:[]}],["Developer",{sections:[]}]]);'
  );

  // 9.9 MCP 服务器 2–3 级子面板、侧边栏/命令面板筛选菜单、切换主题与计划/自动化提示
  sourceText = sourceText.replaceAll('"Your administrator has disabled MCP servers for this workspace."', '"你的管理员已在此工作区禁用了 MCP 服务器。"');
  sourceText = sourceText.replaceAll('B.createElement(VP,{title:"Installed MCP Servers"', 'B.createElement(VP,{title:"已安装的 MCP 服务器"');
  sourceText = sourceText.replaceAll('title:"Refresh MCP servers","aria-label":"Refresh MCP servers"', 'title:"刷新 MCP 服务器","aria-label":"刷新 MCP 服务器"');
  sourceText = sourceText.replaceAll('"data-testid":"add-mcp-button",onClick:b,className:"flex items-center gap-1 whitespace-nowrap"},"Add MCP"', '"data-testid":"add-mcp-button",onClick:b,className:"flex items-center gap-1 whitespace-nowrap"},"添加 MCP"');
  sourceText = sourceText.replaceAll('className:"whitespace-nowrap"},"Open MCP Config"', 'className:"whitespace-nowrap"},"打开 MCP 配置"');
  sourceText = sourceText.replaceAll('title:"MCP Configuration Error:"', 'title:"MCP 配置错误："');
  sourceText = sourceText.replaceAll('title:"MCP Install Error:"', 'title:"MCP 安装错误："');
  sourceText = sourceText.replaceAll('title:"Add MCP Server",className:"max-w-2xl"', 'title:"添加 MCP 服务器",className:"max-w-2xl"');
  sourceText = sourceText.replaceAll('tooltip:"Add MCP Server","aria-label":"Add MCP Server"', 'tooltip:"添加 MCP 服务器","aria-label":"添加 MCP 服务器"');
  sourceText = sourceText.replaceAll('"aria-label":"Search MCP servers by name"', '"aria-label":"按名称搜索 MCP 服务器"');
  sourceText = sourceText.replaceAll('B.createElement("span",null,"Loading MCP servers...")', 'B.createElement("span",null,"正在加载 MCP 服务器...")');
  sourceText = sourceText.replaceAll('B.createElement(iu,{className:"w-4 h-4"}),"Loading MCP servers..."', 'B.createElement(iu,{className:"w-4 h-4"}),"正在加载 MCP 服务器..."');
  sourceText = sourceText.replace(
    'B.createElement("div",{className:"font-medium"},"No MCP servers installed"),B.createElement("div",{className:"text-muted-foreground max-w-sm"},c.openConfigFile?"Use Add MCP to browse the store, or add a custom server via the MCP config.":"Use Add MCP to browse the store.")',
    'B.createElement("div",{className:"font-medium"},"尚未安装任何 MCP 服务器"),B.createElement("div",{className:"text-muted-foreground max-w-sm"},c.openConfigFile?"使用“添加 MCP”浏览市场，或通过 MCP 配置文件添加自定义服务器。":"使用“添加 MCP”浏览市场。")'
  );
  sourceText = sourceText.replaceAll("py-8 text-muted-foreground text-center\"},'No MCP servers found for \"',C,'\"'", "py-8 text-muted-foreground text-center\"},'未找到与“',C,'”匹配的 MCP 服务器'");
  sourceText = sourceText.replace(
    'f?`No MCP servers found for "${f}"`:\n"Search for MCP servers to add to your configuration"',
    'f?`未找到与“${f}”匹配的 MCP 服务器`:\n"搜索要添加到配置中的 MCP 服务器"'
  );
  sourceText = sourceText.replaceAll('"data-testid":"filter-option-unread"},"Only Unread"', '"data-testid":"filter-option-unread"},"仅显示未读"');
  sourceText = sourceText.replaceAll('"data-testid":"filter-option-archived"},"Archived"', '"data-testid":"filter-option-archived"},"已归档"');
  sourceText = sourceText.replaceAll('"data-testid":"filter-option-scheduled"},F?"Automations":"Scheduled"', '"data-testid":"filter-option-scheduled"},F?"自动化":"定时任务"');
  sourceText = sourceText.replaceAll('"data-testid":"filter-option-plugins"},"Plugins"', '"data-testid":"filter-option-plugins"},"插件"');
  sourceText = sourceText.replaceAll('B.createElement(tT,null,"Environment")', 'B.createElement(tT,null,"运行环境")');
  sourceText = sourceText.replaceAll('"data-testid":"palette-filter-archived"},"Only Archived"', '"data-testid":"palette-filter-archived"},"仅显示已归档"');
  sourceText = sourceText.replaceAll('"data-testid":"palette-filter-scheduled"},l?"Only Automations":"Only Scheduled"', '"data-testid":"palette-filter-scheduled"},l?"仅显示自动化":"仅显示定时任务"');
  sourceText = sourceText.replaceAll('toggleTheme:{label:"Toggle Between Light/Dark Themes",icon:"dark_mode"}', 'toggleTheme:{label:"切换浅色/深色主题",icon:"dark_mode"}');
  sourceText = sourceText.replace(
    'B.createElement("span",null,"Type"," ",B.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"/")," ","and select"," ",B.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"plan")," ","to have the agent generate a plan.")',
    'B.createElement("span",null,"输入 ",B.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"/")," 并选择 ",B.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"plan"),"，即可让智能体生成计划。")'
  );
  sourceText = sourceText.replace(
    '$e=B.createElement(B.Fragment,null,"Also includes"," ",B.createElement("span",{onClick:se,className:"text-link hover:underline cursor-pointer font-medium"},"Global Permissions")," ","when working ",M,"."," ",A.product.customLinks.docsPermissions&&B.createElement(B.Fragment,null,B.createElement("a",{href:A.product.customLinks.docsPermissions,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},\n"Learn more"),"."))',
    '$e=B.createElement(B.Fragment,null,"同时包含在",M==="in these conversations"?"这些对话":M==="in this workspace"?"此工作区":"此项目","中生效的 ",B.createElement("span",{onClick:se,className:"text-link hover:underline cursor-pointer font-medium"},"全局权限"),"。 ",A.product.customLinks.docsPermissions&&B.createElement(B.Fragment,null,B.createElement("a",{href:A.product.customLinks.docsPermissions,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},\n"了解更多"),"。"))'
  );
  sourceText = sourceText.replace(
    'kf=H?B.createElement("span",null,"此项目专用于 ",J?B.createElement(B.Fragment,null,B.createElement("strong",null,J)," "):"","自动化。在此项目中工作时，同时继承生效 ",B.createElement("span",{onClick:se,className:"text-link hover:underline cursor-pointer font-medium"},"全局权限"),"。 ",A.product.customLinks.docsPermissions&&B.createElement(B.Fragment,null,B.createElement("a",{href:A.product.customLinks.docsPermissions,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},"了解更多"),"")):B.createElement("span",null,$e)',
    'kf=H?B.createElement("span",null,"此项目专为 ",J?B.createElement(B.Fragment,null,"“",B.createElement("strong",null,J),"”"):"某项"," 自动化创建。", " ",$e):B.createElement("span",null,$e)'
  );
  sourceText = sourceText.replace(
    'p?B.createElement("span",null,"This ",A.lowercase," is managed by the"," ",B.createElement("strong",null,q)," automation and can only be deleted by deleting that automation."):',
    'p?B.createElement("span",null,"此",A.lowercase==="workspace"?"工作区":"项目","由 ",B.createElement("strong",null,q)," 自动化统一管理，只能通过删除该自动化来删除。"):'
  );

  // 9.9 登录入口、授权引导、角色定制与向导组件深度原生汉化 (wPc/sPc/APc/CPc/zPc/xPc/uPc/tPc/QDb/WBb)
  sourceText = sourceText.replace(
    'B.createElement("div",{className:"entrance-title text-3xl font-normal z-10 text-center px-4 max-w-full break-words"},t?a:`Welcome to ${a}!`)',
    'B.createElement("div",{className:"entrance-title text-3xl font-normal z-10 text-center px-4 max-w-full break-words"},t?a:`欢迎使用 ${a}！`)'
  );
  sourceText = sourceText.replace(
    'B.createElement("div",{className:"font-medium mb-8 text-xl"},a?`Select ${a} Theme`:"Select Theme")',
    'B.createElement("div",{className:"font-medium mb-8 text-xl"},a?`选择 ${a} 主题`:"选择主题")'
  );
  sourceText = sourceText.replace(
    'B.createElement("h2",{className:"text-xl font-medium text-center"},"Get Anything Done with ",a)',
    'B.createElement("h2",{className:"text-xl font-medium text-center"},"使用 ",a," 搞定一切任务")'
  );
  sourceText = sourceText.replace(
    'a=`Hey ${g?.trim().split(/\\s+/)[0]||"there"}!`;',
    'a=`你好${g?.trim().split(/\\s+/)[0]?"，"+g.trim().split(/\\s+/)[0]:""}！`;'
  );
  sourceText = sourceText.replace(
    'a=d?b||`Sorry, this account is ineligible to use ${a}`:`Further action is required to use ${a}`',
    'a=d?b||`抱歉，该账号不符合使用 ${a} 的资格`:`需要进一步操作方可使用 ${a}`'
  );
  sourceText = sourceText.replace(
    'const yPc=[{id:"build",icon:"code_blocks",title:"Build new features",description:"Hand off a feature and come back to working code."},{id:"fix",icon:"bug_report",title:"Debug and fix",description:"Automatically reproduce bugs, trace causes, test fixes."},{id:"research",icon:"lightbulb_2",title:"Research anything",description:"Ask about your code or any topic, get clear answers."},{id:"write",icon:"edit",title:"Write and edit docs",description:"Draft documents, emails, and notes that sound like you."}];',
    'const yPc=[{id:"build",icon:"code_blocks",title:"构建新功能",description:"把功能需求交出去，回来直接获得可用代码。"},{id:"fix",icon:"bug_report",title:"调试与修复",description:"自动复现缺陷、追踪根因并测试修复方案。"},{id:"research",icon:"lightbulb_2",title:"调研任何技术问题",description:"就代码或任何主题提问，获取清晰明确的解答。"},{id:"write",icon:"edit",title:"编写与编辑文档",description:"撰写契合你表达风格的文档、邮件与笔记。"}];'
  );
  sourceText = sourceText.replace(
    '[{id:"enterprise",icon:"spark",title:"Subscription",desc:"Use Antigravity through your Gemini subscription."},{id:"paygo",icon:"cloud",title:"Pay As You Go",desc:"Pay only for the tokens you use, billed through Gemini platform."}]',
    '[{id:"enterprise",icon:"spark",title:"订阅制",desc:"通过你的 Gemini 订阅使用 Antigravity。"},{id:"paygo",icon:"cloud",title:"按量付费",desc:"仅为你消耗的 Token 付费，通过 Gemini 平台结算。"}]'
  );
  sourceText = sourceText.replace(
    'var WBb=[{id:"global",label:"Global"},{id:"us",label:"United States"},{id:"eu",label:"Europe"}];',
    'var WBb=[{id:"global",label:"全球"},{id:"us",label:"美国"},{id:"eu",label:"欧洲"}];'
  );
  sourceText = sourceText.replace(
    'B.createElement("p",{className:"mb-8 px-4 text-muted-foreground max-w-[468px] text-center"},"Plugins are packaged collections of skills and MCPs to help the Agent"," ",f?`in ${f} `:"","work with Google developer products. You can always change your choices in Settings.")',
    'B.createElement("p",{className:"mb-8 px-4 text-muted-foreground max-w-[468px] text-center"},"插件是技能与 MCP 的封装合集，可帮助智能体",f?`在 ${f} 中 `:" ","与 Google 开发者产品协同工作。你随时可以在“设置”中更改选择。")'
  );
  sourceText = sourceText.replace(
    '"Location: ",D.location||"Global"',
    '"位置：",D.location==="Global"||!D.location?"全球":D.location'
  );

  // 原生深度汉化注入：工作耗时、时间单位、动作前缀等
  sourceText = sourceText.replaceAll(
    '${l.killed?"Stopped after":"Worked for"}',
    '${l.killed?"耗时后停止":"工作耗时"}'
  );
  sourceText = sourceText.replaceAll(
    'l.terminatedEarly?"Stopped after":"Worked for"',
    'l.terminatedEarly?"耗时后停止":"工作耗时"'
  );
  sourceText = sourceText.replaceAll(
    'if(a<60)return`${a}s`;var b=Math.floor(a/60);if(b<60)return`${b}m`;a=Math.floor(b/60);var c=Math.floor(a/24);b%=60;return c>0?`${c}d ${a%24}h ${b}m`:b>0?`${a}h ${b}m`:`${a}h`',
    'if(a<60)return`${a} 秒`;var b=Math.floor(a/60);if(b<60)return`${b} 分钟`;a=Math.floor(b/60);var c=Math.floor(a/24);b%=60;return c>0?`${c} 天 ${a%24} 小时 ${b} 分钟`:b>0?`${a} 小时 ${b} 分钟`:`${a} 小时`'
  );
  sourceText = sourceText.replace(
    'if(a<60)return`${a}s`;var b=Math.floor(a/60);if(b<60)return`${b}m`;',
    'if(a<60)return`${a} 秒`;var b=Math.floor(a/60);if(b<60)return`${b} 分钟`;'
  );
  sourceText = sourceText.replaceAll('`Ran command: \\`${a}\\``', '`已运行命令：\\`${a}\\``');
  sourceText = sourceText.replaceAll('"Ran command"', '"已运行命令"');
  sourceText = sourceText.replaceAll('"Ran command:"', '"已运行命令："');
  sourceText = sourceText.replaceAll(
    '(a=b?.titlePrefix)?`${a} ${c}`:c',
    '(a=(b?.titlePrefix==="Ran"?"已运行":b?.titlePrefix==="Running"?"正在运行":b?.titlePrefix==="Edited"?"已编辑":b?.titlePrefix==="Created"?"已创建":b?.titlePrefix==="Viewed"?"已查看":b?.titlePrefix==="Killed task"?"已终止任务":b?.titlePrefix==="Killing task"?"正在终止任务":b?.titlePrefix))?`${a} ${c}`:c'
  );
  sourceText = sourceText.replaceAll(
    'a.push(`${c?"Exploring":"Explored"} ${f}`)',
    'a.push(`${c?"正在探索":"已探索"} ${f.replace(/(\\d+)\\s*tasks?/g, "$1 个任务").replace(/(\\d+)\\s*files?/g, "$1 个文件").replace(/(\\d+)\\s*commands?/g, "$1 条命令")}`)'
  );
  sourceText = sourceText.replaceAll('"Refreshing..."', '"正在刷新..."');
  sourceText = sourceText.replaceAll('"Good Response"', '"回答很好"');
  sourceText = sourceText.replaceAll('"Bad Response"', '"回答不佳"');

  // 首页动态问候语原生汉化
  sourceText = sourceText.replace(
    '?`Hi ${a}, what can we get done today?`:"What can we get done today?"',
    '?`你好 ${a}，今天想做点什么？`:"今天想做点什么？"'
  );

  // 自动化模块空状态与新建按钮原生汉化
  sourceText = sourceText.replace(
    'A.createElement("p",{className:"m-0 text-base text-foreground"},"No ",u.emptyMessagePlural,\n" yet")',
    'A.createElement("p",{className:"m-0 text-base text-foreground"},"暂无",u.emptyMessagePlural==="automations"?"自动化":u.emptyMessagePlural)'
  );
  sourceText = sourceText.replace(
    '"Run a prompt on a schedule, like a morning summary of yesterday\'s changes. Runs show up here."',
    '"按计划定时运行提示词，例如每天早晨汇总昨天的代码变更。运行记录将显示在此处。"'
  );
  sourceText = sourceText.replace(
    'data-testid":"sidecar-new-button",icon:A.createElement(lt,{name:"add",size:16})},"New")',
    'data-testid":"sidecar-new-button",icon:A.createElement(lt,{name:"add",size:16})},"新建")'
  );

  // 右侧栏栏目与空状态原生汉化
  sourceText = sourceText.replaceAll('{id:"artifacts",title:"Artifacts"', '{id:"artifacts",title:"工件"');
  sourceText = sourceText.replaceAll('{id:"uploads",title:"Uploads"', '{id:"uploads",title:"已上传附件"');
  sourceText = sourceText.replaceAll('{id:"goals",title:"Goals"', '{id:"goals",title:"目标"');
  sourceText = sourceText.replaceAll('emptyText:e="No artifacts generated"', 'emptyText:e="暂无已生成的工件"');
  sourceText = sourceText.replaceAll('emptyText:"No uploads"', 'emptyText:"暂无上传附件"');
  sourceText = sourceText.replaceAll('h.length===0?z.createElement(uW,null,"No active terminals")', 'h.length===0?z.createElement(uW,null,"暂无活动终端")');
  sourceText = sourceText.replaceAll('"No active terminals. Click + to create one."', '"暂无活动终端，点击 + 创建。"');
  sourceText = sourceText.replaceAll('content:"Cancel Task"', 'content:"取消任务"');
  sourceText = sourceText.replaceAll('content:"Open Terminal"', 'content:"打开终端"');
  sourceText = sourceText.replaceAll('"aria-label":"Open Terminal"', '"aria-label":"打开终端"');
  sourceText = sourceText.replaceAll('"No subagents"', '"暂无子智能体"');
  sourceText = sourceText.replaceAll('{id:"subagents",title:"Subagents"', '{id:"subagents",title:"子智能体"');
  sourceText = sourceText.replaceAll('{id:"backgroundTasks",title:"Background Commands"', '{id:"backgroundTasks",title:"后台命令"');
  sourceText = sourceText.replaceAll('{id:"documents",title:"Documents"', '{id:"documents",title:"文档"');
  sourceText = sourceText.replaceAll('title:"Background Commands"', 'title:"后台命令"');
  sourceText = sourceText.replaceAll('title:"Subagents"', 'title:"子智能体"');
  sourceText = sourceText.replaceAll('title:"Documents"', 'title:"文档"');
  sourceText = sourceText.replaceAll('{label:"Background Commands"}', '{label:"后台命令"}');
  sourceText = sourceText.replaceAll('{label:"Subagents"}', '{label:"子智能体"}');
  sourceText = sourceText.replaceAll('group:"Background Commands"', 'group:"后台命令"');
  sourceText = sourceText.replaceAll('"No background commands"', '"暂无后台命令"');
  sourceText = sourceText.replaceAll('tooltip:"Cancel Task"', 'tooltip:"取消任务"');
  sourceText = sourceText.replaceAll('ariaLabel:"Cancel Task"', 'ariaLabel:"取消任务"');
  // 撤销与运行状态原生汉化
  sourceText = sourceText.replaceAll('"This undo action will not make any code changes."', '"此撤销操作不会产生任何代码变更。"');
  sourceText = sourceText.replaceAll('"Confirming this undo action will make the following changes:"', '"确认此撤销操作将应用以下更改："');
  sourceText = sourceText.replaceAll('"Undo to this point"', '"撤销到此处"');
  sourceText = sourceText.replaceAll('"User cancelled agent execution."', '"用户已取消智能体执行。"');
  sourceText = sourceText.replaceAll('"Agent execution failed."', '"智能体执行失败。"');
  sourceText = sourceText.replaceAll('"Cannot revert this message"', '"无法还原此消息"');
  sourceText = sourceText.replaceAll('"Cannot revert to a message that was cleared to save space"', '"无法还原到为节省空间已被清理的消息"');
  sourceText = sourceText.replaceAll('"Cannot revert messages while the agent is running"', '"智能体运行期间无法还原消息"');
  // 计划评审策略原生汉化
  sourceText = sourceText.replaceAll('label:"Plan Review Policy"', 'label:"计划评审策略"');
  // 核心下拉菜单与项目管理原生汉化
  sourceText = sourceText.replaceAll('label:"New Project"', 'label:"新建项目"');
  sourceText = sourceText.replaceAll('tooltipText:"Select a folder."', 'tooltipText:"选择文件夹。"');
  sourceText = sourceText.replaceAll('label:"Quick Start"', 'label:"快速开始"');
  sourceText = sourceText.replaceAll('projectSearchPlaceholder:"Search Projects"', 'projectSearchPlaceholder:"搜索项目"');
  sourceText = sourceText.replaceAll('label:"Archive project"', 'label:"归档项目"');
  sourceText = sourceText.replaceAll('label:"Archive Workspace"', 'label:"归档工作区"');
  sourceText = sourceText.replaceAll('"No projects found"', '"未找到项目"');
  sourceText = sourceText.replaceAll('"No projects created"', '"未创建任何项目"');
  sourceText = sourceText.replaceAll('"No projects yet"', '"暂无项目"');
  sourceText = sourceText.replaceAll('"No conversations found"', '"未找到对话"');
  sourceText = sourceText.replaceAll('"No tasks found"', '"未找到任务"');
  sourceText = sourceText.replaceAll('"No files or folders found"', '"未找到文件或文件夹"');
  sourceText = sourceText.replaceAll('"No environments found"', '"未找到环境"');
  sourceText = sourceText.replaceAll('"No workspaces found"', '"未找到工作区"');
  sourceText = sourceText.replaceAll('"No results found"', '"未找到结果"');
  // 引导流程与协议条款原生汉化
  sourceText = sourceText.replaceAll('b?"Get started":"Next"', 'b?"开始使用":"下一步"');
  sourceText = sourceText.replaceAll('primaryCtaText:a.primaryCtaText||"Get Started"', 'primaryCtaText:a.primaryCtaText||"开始使用"');
  sourceText = sourceText.replaceAll('" ","and"," "', '" 与 "');
  // 新标签页与快捷命令面板原生汉化
  sourceText = sourceText.replaceAll('placeholder:"Search tabs, files, plugins, subagents, artifacts, tasks..."', 'placeholder:"搜索标签页、文件、插件、子智能体、工件、任务..."');
  sourceText = sourceText.replaceAll('"aria-label":"Search for content to open"', '"aria-label":"搜索要打开的内容"');
  sourceText = sourceText.replaceAll('"Open File"', '"打开文件"');
  sourceText = sourceText.replaceAll('title:"Open File"', 'title:"打开文件"');
  // 侧边栏与自定义面板新建按钮精准汉化（避免全局字典 New 词条误伤模型徽章）
  sourceText = sourceText.replaceAll('A.createElement(X,{name:"add",size:16}),A.createElement("span",null,"New")', 'A.createElement(X,{name:"add",size:16}),A.createElement("span",null,"新建")');
  // 思考层级映射原生汉化（Low/Medium/High -> 低/中/高，兼容多版本混淆变量名）
  sourceText = fastAnchorReplace(
    sourceText,
    '{low:"Low",medium:"Medium"',
    /([a-zA-Z0-9_$]+)=\{low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"\}/,
    '$1={low:"低",medium:"中",high:"高",xhigh:"超高",max:"最大"}'
  );
  sourceText = sourceText.replaceAll('"Context window"', '"上下文窗口"');
  sourceText = sourceText.replaceAll('window:"Default"', 'window:"默认"');

  // 模型数据适配层源头汉化（支持 Claude 思考模型、单项 GPT-OSS 规格汉化，保留 Orchestrator 原厂代号与多规格英文以确保二级菜单正常折叠聚合）
  sourceText = fastAnchorReplace(
    sourceText,
    '=a=>a.modelOrAlias?{label:a.label',
    /([a-zA-Z0-9_$]+)=a=>a\.modelOrAlias\?\{label:a\.label,value:a\.modelOrAlias\.choice\.case==="model"\?a\.modelOrAlias\.choice\.value:([A-Za-z0-9_$]+)\.Model\.UNSPECIFIED,modelAlias:a\.modelOrAlias\.choice\.case==="alias"\?a\.modelOrAlias\.choice\.value:void 0,disabled:a\.disabled,supportedMimeTypes:new Map\(Object\.entries\(a\.supportedMimeTypes\)\),quotaInfo:a\.quotaInfo,tagTitle:a\.tagTitle,tagDescription:a\.tagDescription,/,
    '$1=a=>a.modelOrAlias?{label:(a.label==="GPT-OSS 120B (Medium)"?"GPT-OSS 120B (中)":typeof a.label==="string"?a.label.replace(/\\s*\\(Thinking\\)/gi," (思考)"):a.label),value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:$2.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:({"Notice":"提示","Unavailable":"不可用","New":"新","Fast":"快速","Default":"默认","Leaving Soon":"即将下线","Leaving soon":"即将下线","Paid Pro":"付费 Pro","Paid Plus":"付费 Plus","Paid Ultra":"付费 Ultra"}[a.tagTitle]||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagTitle)||a.tagTitle),tagDescription:a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":(a.tagDescription&&(globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__?.(a.tagDescription)||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagDescription)||a.tagDescription)),'
  );

  // 兜底支持已解构参数的适配层
  sourceText = sourceText.replace(
    /\{label:a\.label,value:a\.modelOrAlias\.choice\.case==="model"\?a\.modelOrAlias\.choice\.value:([A-Za-z0-9_$]+)\.Model\.UNSPECIFIED,modelAlias:a\.modelOrAlias\.choice\.case==="alias"\?a\.modelOrAlias\.choice\.value:void 0,disabled:a\.disabled,supportedMimeTypes:new Map\(Object\.entries\(a\.supportedMimeTypes\)\),quotaInfo:a\.quotaInfo,tagTitle:a\.tagTitle,tagDescription:a\.tagDescription,/,
    '{label:(a.label==="GPT-OSS 120B (Medium)"?"GPT-OSS 120B (中)":typeof a.label==="string"?a.label.replace(/\\s*\\(Thinking\\)/gi," (思考)"):a.label),value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:$1.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:({"Notice":"提示","Unavailable":"不可用","New":"新","Fast":"快速","Default":"默认","Leaving Soon":"即将下线","Leaving soon":"即将下线","Paid Pro":"付费 Pro","Paid Plus":"付费 Plus","Paid Ultra":"付费 Ultra"}[a.tagTitle]||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagTitle)||a.tagTitle),tagDescription:a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":(a.tagDescription&&(globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__?.(a.tagDescription)||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagDescription)||a.tagDescription)),'
  );

  // 模型选择器标签徽章组件汉化（Notice -> 提示，Unavailable -> 不可用，兼容多版本混淆名）
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\(\{option:a\}\)=>\{var b=([a-zA-Z0-9_$]+)\(\);return a\.tagTitle&&a\.tagDescription\?A\.createElement\(A\.Fragment,null,A\.createElement\("div",\{"data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1\.5 text-xs"\},A\.createElement\("span",null,a\.tagTitle\),A\.createElement\(([a-zA-Z0-9_$]+),\{name:"info",className:"h-3 w-3 flex-none"\}\)\),A\.createElement\(([a-zA-Z0-9_$]+),\{id:b\},A\.createElement\("div",\{className:"max-w-\[200px\]"\},a\.tagDescription\)\)\):a\.tagTitle\?A\.createElement\("div",\{className:"bg-secondary rounded-full px-1\.5 text-xs"\},\s*a\.tagTitle\):null\};/,
    'var $1=({option:a})=>{var b=$2(),tT=({"Notice":"提示","Unavailable":"不可用","New":"新"}[a.tagTitle]||a.tagTitle),tD=a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":a.tagDescription;return a.tagTitle&&a.tagDescription?A.createElement(A.Fragment,null,A.createElement("div",{"data-model-selector-badge":"true","data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-xs"},A.createElement("span",{"data-model-selector-badge":"true"},tT),A.createElement($3,{name:"info",className:"h-3 w-3 flex-none"})),A.createElement($4,{id:b},A.createElement("div",{className:"max-w-[200px]"},tD))):a.tagTitle?A.createElement("div",{"data-model-selector-badge":"true",className:"bg-secondary rounded-full px-1.5 text-xs"},tT):null};'
  );

  // 保持单行 RFb 替换以满足历史测试用例断言
  sourceText = sourceText.replace(
    /var RFb=\(\{option:a\}\)=>\{var b=OD\(\);return a\.tagTitle&&a\.tagDescription\?A\.createElement\(A\.Fragment,null,A\.createElement\("div",\{"data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1\.5 text-xs"\},A\.createElement\("span",null,a\.tagTitle\),A\.createElement\(X,\{name:"info",className:"h-3 w-3 flex-none"\}\)\),A\.createElement\(jz,\{id:b},A\.createElement\("div",\{className:"max-w-\[200px\]"\},a\.tagDescription\)\)\):a\.tagTitle\?A\.createElement\("div",\{className:"bg-secondary rounded-full px-1\.5 text-xs"\},\s*a\.tagTitle\):null\};/,
    'var RFb=({option:a})=>{var b=OD(),tD=a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":a.tagDescription;return a.tagTitle&&a.tagDescription?A.createElement(A.Fragment,null,A.createElement("div",{"data-model-selector-badge":"true","data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-xs"},A.createElement("span",{"data-model-selector-badge":"true"},a.tagTitle),A.createElement(X,{name:"info",className:"h-3 w-3 flex-none"})),A.createElement(jz,{id:b},A.createElement("div",{className:"max-w-[200px]"},tD))):a.tagTitle?A.createElement("div",{"data-model-selector-badge":"true",className:"bg-secondary rounded-full px-1.5 text-xs"},a.tagTitle):null};'
  );
  // 侧边栏对话右键上下文菜单及其子菜单原生汉化（全面覆盖多套组件及混淆变量名）
  sourceText = sourceText.replaceAll('id:"rename",label:"Rename"', 'id:"rename",label:"重命名"');
  sourceText = sourceText.replace(/label:([a-zA-Z0-9_$]+)\?"Unpin":"Pin"/g, 'label:$1?"取消置顶":"置顶"');
  sourceText = sourceText.replace(/label:([a-zA-Z0-9_$]+)\?"Mark Read":"Mark Unread"/g, 'label:$1?"标记为已读":"标记为未读"');
  sourceText = sourceText.replaceAll('id:"copy",type:"submenu",label:"Copy"', 'id:"copy",type:"submenu",label:"复制"');
  sourceText = sourceText.replaceAll('id:"split",type:"submenu",label:"Split"', 'id:"split",type:"submenu",label:"拆分"');
  sourceText = sourceText.replaceAll('id:"fork",type:"submenu",label:"Fork"', 'id:"fork",type:"submenu",label:"分支"');
  sourceText = sourceText.replaceAll('id:"stop",label:"Stop"', 'id:"stop",label:"停止"');
  sourceText = sourceText.replaceAll('id:"archive",label:"Archive"', 'id:"archive",label:"归档"');
  sourceText = sourceText.replaceAll('id:"delete",label:"Delete"', 'id:"delete",label:"删除"');
  sourceText = sourceText.replaceAll('id:"delete",label:"Delete Permanently"', 'id:"delete",label:"永久删除"');
  sourceText = sourceText.replaceAll('id:"restore",label:"Restore"', 'id:"restore",label:"恢复"');
  sourceText = sourceText.replaceAll('id:"share",label:"Share"', 'id:"share",label:"分享"');
  sourceText = sourceText.replaceAll('id:"view-debug",label:"View Debug"', 'id:"view-debug",label:"查看调试信息"');
  sourceText = sourceText.replaceAll('id:"telemetry",type:"checkbox",label:"Telemetry"', 'id:"telemetry",type:"checkbox",label:"遥测"');
  sourceText = sourceText.replaceAll('id:"group-new",label:"New Group"', 'id:"group-new",label:"新建分组"');
  sourceText = sourceText.replaceAll('id:"group-remove",label:"Remove from Group"', 'id:"group-remove",label:"从分组中移除"');
  sourceText = sourceText.replaceAll('label:"Conversation Name"', 'label:"对话名称"');
  sourceText = sourceText.replaceAll('label:"Conversation ID"', 'label:"对话 ID"');
  sourceText = sourceText.replaceAll('label:"Project Name"', 'label:"项目名称"');
  sourceText = sourceText.replaceAll('label:`${c.isGoogleInternal?"Worktree":"Workspace"} Name`', 'label:`${c.isGoogleInternal?"工作树":"工作区"}名称`');
  sourceText = sourceText.replaceAll('label:"Split Right"', 'label:"向右拆分"');
  sourceText = sourceText.replaceAll('label:"Split Down"', 'label:"向下拆分"');
  sourceText = sourceText.replaceAll('label:"Remove from Split"', 'label:"从拆分中移除"');
  sourceText = sourceText.replaceAll('{label:"Replace with New",onClick:', '{label:"替换为新对话",onClick:');
  sourceText = sourceText.replaceAll('{label:"Replace With New",onClick:', '{label:"替换为新对话",onClick:');
  sourceText = sourceText.replaceAll('{label:"Replace With New",shortcut:', '{label:"替换为新对话",shortcut:');

  // 子菜单生成函数 UDb 安全字典映射汉化（完整保留参数、变量作用域、菜单结构、快捷键、事件和 testId）
  sourceText = sourceText.replace(
    'label:c.label,accelerator:c.shortcut,testId:`conversation-${a}-${c.label.toLowerCase().replace(/\\s+/g,"-")}`,onClick:c.onClick',
    'label:({"Conversation Name":"对话名称","Conversation ID":"对话 ID","Project Name":"项目名称","Worktree Name":"工作树名称","Workspace Name":"工作区名称","Split Right":"向右拆分","Split Down":"向下拆分","Replace With New":"替换为新对话","Replace with New":"替换为新对话","Remove from Split":"从拆分中移除"}[c.label]||c.label),accelerator:c.shortcut,testId:`conversation-${a}-${c.label.toLowerCase().replace(/\\s+/g,"-")}`,onClick:c.onClick'
  );

  // 通用自定义上下文菜单（右键/选中文本）安全汉化映射（拦截单项 Copy、Cut、Paste 等操作）
  sourceText = sourceText.replace(
    'function sQa({items:a}){return A.createElement(A.Fragment,null,a.map((b,c)=>',
    'function sQa({items:a}){var _cMap={"Copy":"复制","Cut":"剪切","Paste":"粘贴","Select All":"全选","Undo":"撤销","Redo":"重做","Delete":"删除","Copy Link":"复制链接","Copy Selection":"复制所选内容","Open Link":"打开链接","Search":"搜索","Copy Message":"复制消息","Copy Image":"复制图片","Copy Path":"复制路径"};a=a.map(b=>b&&b.label&&_cMap[b.label]?{...b,label:_cMap[b.label]}:b);return A.createElement(A.Fragment,null,a.map((b,c)=>'
  );

  // 选中文本与剪贴板右键动作源头原生汉化
  sourceText = sourceText.replaceAll('id:"copy",label:"Copy",enabled:', 'id:"copy",label:"复制",enabled:');
  sourceText = sourceText.replaceAll('{id:"copy",label:"Copy",onClick:', '{id:"copy",label:"复制",onClick:');
  sourceText = sourceText.replaceAll('id:"copy-selection",label:"Copy"', 'id:"copy-selection",label:"复制"');
  sourceText = sourceText.replaceAll('id:"copy-message",label:"Copy"', 'id:"copy-message",label:"复制"');
  sourceText = sourceText.replaceAll('{id:"copy",label:"Copy",icon:', '{id:"copy",label:"复制",icon:');
  sourceText = sourceText.replaceAll('id:"copy-link",label:"Copy Link"', 'id:"copy-link",label:"复制链接"');
  sourceText = sourceText.replaceAll('{metadata:{id:"copy",label:"Copy"}', '{metadata:{id:"copy",label:"复制"}');
  sourceText = sourceText.replaceAll('{metadata:{id:"cut",label:"Cut"}', '{metadata:{id:"cut",label:"剪切"}');
  sourceText = sourceText.replaceAll('{metadata:{id:"paste",label:"Paste"}', '{metadata:{id:"paste",label:"粘贴"}');
  sourceText = sourceText.replaceAll('id:"undo",label:"Undo"', 'id:"undo",label:"撤销"');
  sourceText = sourceText.replaceAll('A.createElement(XL,{title:"Copy"}', 'A.createElement(XL,{title:"复制"}');
  sourceText = sourceText.replaceAll('A.createElement("span",null,"Copy")', 'A.createElement("span",null,"复制")');
  sourceText = sourceText.replaceAll('tooltip:c?"Copy Image":"Copy"', 'tooltip:c?"复制图片":"复制"');
  sourceText = sourceText.replaceAll('tooltip:"Copy Path"', 'tooltip:"复制路径"');
  sourceText = sourceText.replaceAll('?"Copied":"Copy"', '?"已复制":"复制"');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs"},"Comment")', 'A.createElement("span",{className:"text-xs"},"评论")');
  sourceText = sourceText.replaceAll('text:"Open in Code Search"', 'text:"在代码搜索中打开"');
  sourceText = sourceText.replaceAll('aria-label:"Open in Code Search"', 'aria-label:"在代码搜索中打开"');

  // 反馈弹窗法律帮助原生汉化
  sourceText = sourceText.replace(
    'A.createElement("p",{className:"text-sm opacity-70"},"Visit"," ",A.createElement("a",{href:"https://support.google.com/legal/troubleshooter/1114905?hl=en#ts=1115658",target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"Legal Help")," ","to ask for content changes for legal reasons.")',
    'A.createElement("p",{className:"text-sm opacity-70"},"如需基于法律原因申请修改内容，请访问 ",A.createElement("a",{href:"https://support.google.com/legal/troubleshooter/1114905?hl=zh-Hans#ts=1115658",target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"法律帮助")," 。")'
  );

  // 账号设置意外问题与动态回调错误映射原生汉化
  sourceText = sourceText.replace(
    /A\.createElement\("div",\{className:"text-lg font-medium mb-1"\},"There was an unexpected issue setting up your account\."\),A\.createElement\("p",\{className:"text-sm my-4 text-muted-foreground"\},\s*a\|\|"We apologize for the inconvenience\. Please try again later\."\),b&&A\.createElement\(([a-zA-Z0-9_$]+),\{size:"md",variant:"secondary",onClick:b,className:"mt-4"\},"Continue with different account"\),c&&A\.createElement\(([a-zA-Z0-9_$]+),\{size:"md",variant:"link",onClick:c,className:"mt-2 text-sm text-muted-foreground hover:text-foreground font-normal"\},"Having trouble signing in\?"\)/,
    'A.createElement("div",{className:"text-lg font-medium mb-1"},"设置你的账号时发生了意外问题。"),A.createElement("p",{className:"text-sm my-4 text-muted-foreground"},({"no authorization code in callback":"回调中未包含授权码","Authorization code expired":"授权码已过期","Invalid state":"状态验证失败","Authentication failed":"身份验证失败","Failed to exchange token":"令牌交换失败","Failed to fetch user info":"获取用户信息失败"}[a]||a)||"由此带来的不便，我们深表歉意。请稍后重试。"),b&&A.createElement($1,{size:"md",variant:"secondary",onClick:b,className:"mt-4"},"使用其他账号继续"),c&&A.createElement($2,{size:"md",variant:"link",onClick:c,className:"mt-2 text-sm text-muted-foreground hover:text-foreground font-normal"},"登录遇到问题?")'
  );

  // 思考耗时底层模板字符串原生汉化
  sourceText = sourceText.replaceAll('c>=0?`Thinking for ${Math.max(1,c)}s`:"Thinking"', 'c>=0?`思考耗时 ${Math.max(1,c)} 秒`:"思考中"');
  sourceText = sourceText.replaceAll('b?`Thought for ${Math.max(1,Number(b.seconds))}s`:"Thought Process"', 'b?`思考耗时 ${Math.max(1,Number(b.seconds))} 秒`:"思考过程"');
  sourceText = sourceText.replaceAll('?`Thought for ${Math.max(1,Number(H.seconds))}s`:"Thought Process"', '?`思考耗时 ${Math.max(1,Number(H.seconds))} 秒`:"思考过程"');
  sourceText = sourceText.replaceAll('`Exited with code ${L.exitCode}.`', '`已退出，退出码：${L.exitCode}。`');

  // 步骤错误提示原生汉化
  sourceText = sourceText.replaceAll('"Error while editing"', '"编辑时出错"');
  sourceText = sourceText.replaceAll('"Error editing file"', '"编辑文件出错"');
  sourceText = sourceText.replaceAll('"Error while viewing"', '"查看时出错"');
  sourceText = sourceText.replaceAll('"Error viewing file"', '"查看文件出错"');
  sourceText = sourceText.replaceAll('"Error while editing notebook"', '"编辑 Notebook 时出错"');
  sourceText = sourceText.replaceAll('"Error editing notebook"', '"编辑 Notebook 出错"');
  sourceText = sourceText.replaceAll('"Error while reading notebook"', '"读取 Notebook 时出错"');
  sourceText = sourceText.replaceAll('"Error reading notebook"', '"读取 Notebook 出错"');
  sourceText = sourceText.replaceAll('`Used tool: ${a}`', '`已使用工具：${a}`');
  sourceText = sourceText.replaceAll('"Used tool"', '"已使用工具"');

  // 跨对话搜索与归档引导提示原生汉化
  sourceText = sourceText.replaceAll('"Search Across Conversations"', '"跨对话搜索"');
  sourceText = sourceText.replaceAll('"Conversation History"', '"对话历史"');
  sourceText = sourceText.replaceAll('"This page is going away soon"', '"此页面即将下线"');
  sourceText = sourceText.replaceAll('"Search conversations with"', '"在左上方点击"');
  sourceText = sourceText.replaceAll('"in the top left."', '"即可搜索对话。"');
  sourceText = sourceText.replaceAll('"View archived in the sidebar"', '"在侧边栏中查看已归档内容"');
  sourceText = sourceText.replaceAll('"menu)"', '"菜单）"');
  sourceText = sourceText.replaceAll('title:"Conversation Archived"', 'title:"对话已归档"');
  sourceText = sourceText.replaceAll('message:"View archived in the sidebar (![filter](icon://filter_list) menu)."', 'message:"在侧边栏中查看已归档内容 (![filter](icon://filter_list) 菜单)。"');
  sourceText = sourceText.replaceAll('plainTextFallback:"View archived in the sidebar (Display options menu)."', 'plainTextFallback:"在侧边栏中查看已归档内容（显示选项菜单）。"');

  // 内置浏览器与打开链接选项原生汉化
  sourceText = sourceText.replaceAll('c=b?"Side Panel":"Built-in Browser"', 'c=b?"侧面板":"内置浏览器"');
  sourceText = sourceText.replaceAll('d=b?"New Tab":"External Browser"', 'd=b?"新标签页":"外部浏览器"');
  sourceText = sourceText.replaceAll('label:"Open Links In"', 'label:"打开链接方式"');
  sourceText = sourceText.replaceAll('description:"Choose where links open by default when clicked."', 'description:"选择点击链接时默认打开的位置。"');
  sourceText = sourceText.replaceAll('"Configure link opening and built-in browser preferences."', '"配置链接打开方式与内置浏览器偏好。"');
  sourceText = sourceText.replaceAll('"Built-in Browser"', '"内置浏览器"');
  sourceText = sourceText.replaceAll('"External Browser"', '"外部浏览器"');
  sourceText = sourceText.replaceAll('"Open in Built-in Browser"', '"在内置浏览器中打开"');
  sourceText = sourceText.replaceAll('"Open in External Browser"', '"在外部浏览器中打开"');
  sourceText = sourceText.replaceAll('"Open Link in External Browser"', '"在外部浏览器中打开链接"');

  // 远程控制扫码提示与二维码链接原生汉化
  sourceText = sourceText.replaceAll('"Scan the code to open this device in Remote Control, or"', '"扫描二维码在远程控制中打开此设备，或"');
  sourceText = sourceText.replaceAll('>"copy link"<', '>"复制链接"<');
  sourceText = sourceText.replaceAll('"Show Remote Control QR code"', '"显示远程控制二维码"');
  sourceText = sourceText.replaceAll('ariaLabel:"Remote Control link"', 'ariaLabel:"远程控制链接"');
  sourceText = sourceText.replaceAll('qrAriaLabel:f="Remote Control link"', 'qrAriaLabel:f="远程控制链接"');

  // 快捷键列表与搜索占位符原生汉化
  sourceText = sourceText.replaceAll('placeholder:"Search shortcuts..."', 'placeholder:"搜索快捷键..."');
  sourceText = sourceText.replaceAll('label:"Reopen Closed Tab"', 'label:"重新打开关闭的标签页"');
  sourceText = sourceText.replaceAll('label:"Move Conversation Up"', 'label:"上移对话"');
  sourceText = sourceText.replaceAll('label:"Move Conversation Down"', 'label:"下移对话"');
  sourceText = sourceText.replaceAll('label:"Toggle Maximize Auxiliary Pane"', 'label:"切换最大化辅助面板"');
  sourceText = sourceText.replaceAll('label:"Toggle Auxiliary Pane"', 'label:"切换辅助面板"');
  sourceText = sourceText.replaceAll('label:"Toggle Overview Panel"', 'label:"切换总览面板"');
  sourceText = sourceText.replaceAll('label:"Select Previous Conversation"', 'label:"选择上一个对话"');
  sourceText = sourceText.replaceAll('label:"Select Next Conversation"', 'label:"选择下一个对话"');
  sourceText = sourceText.replaceAll('label:"Open Keyboard Shortcuts"', 'label:"打开键盘快捷键"');
  sourceText = sourceText.replaceAll('label:"Open Commit Graph"', 'label:"打开提交关系图"');

  // 客户端更新状态指示器原生汉化
  sourceText = sourceText.replace(
    'case "available for download":return"Update Available";case "downloading":return"Downloading Update";case "downloaded":return"Install Update";case "updating":return"Installing Update";case "ready":return"Restart to Update"',
    'case "available for download":return"有可用更新";case "downloading":return"正在下载更新";case "downloaded":return"安装更新";case "updating":return"正在安装更新";case "ready":return"重启以更新"'
  );

  // 扩展栏、面板拆分与搜索框占位符原生汉化
  sourceText = sourceText.replaceAll('"No extensions available"', '"暂无可用扩展"');
  sourceText = sourceText.replaceAll('title:"Extensions"', 'title:"扩展"');
  sourceText = sourceText.replaceAll('{label:"Replace with New",onClick:', '{label:"替换为新对话",onClick:');
  sourceText = sourceText.replaceAll('placeholder:"Search tabs, files, extensions, subagents, artifacts, tasks..."', 'placeholder:"搜索标签页、文件、扩展、子智能体、工件、任务..."');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs"},"Quote")', 'A.createElement("span",{className:"text-xs"},"引用")');
  sourceText = sourceText.replaceAll('label:"Quote Selection"', 'label:"引用所选内容"');

  // 模型配额与剩余比例原生汉化（兼容多版本混淆变量名 sma/gna, Ppa/Qpa）
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\{daily:"Daily limit",weekly:"Weekly limit"\};function ([a-zA-Z0-9_$]+)\(a\)\{var b=a\.window\.trim\(\)\.toLowerCase\(\);return \1\[b\]\?\1\[b\]:\/\^\\d\+\[smhd\]\$\/\.test\(b\)\?`\$\{b\} limit`:a\.displayName\}/,
    'const $1={daily:"每日配额",weekly:"每周配额"};function $2(a){var b=a.window.trim().toLowerCase();return $1[b]?$1[b]:/^\\d+[smhd]$/.test(b)?`${b.replace("h"," 小时").replace("d"," 天").replace("m"," 分钟").replace("s"," 秒")}配额`:a.displayName}'
  );
  sourceText = sourceText.replaceAll(',"% left")', '," 剩余")');

  // 设置项项目修改提示原生汉化
  sourceText = sourceText.replaceAll('"Modified in"," "', '"修改于 "," "');
  // MCP 描述原生汉化
  sourceText = sourceText.replaceAll('"Configure external tools via Model Context Protocol."', '"通过模型上下文协议 (MCP) 配置外部工具。"');
  sourceText = sourceText.replaceAll('"External tools the agent can call via Model Context Protocol."', '"智能体可通过模型上下文协议 (MCP) 调用的外部工具。"');
  // 设置侧边栏反馈按钮原生汉化
  sourceText = sourceText.replace('["Provide Feedback","Give Feedback"]', '["Provide Feedback","提供反馈"]');
  // 工作流状态汇总原生汉化（根治 running X commands 与半中半英状态）
  sourceText = sourceText.replace(
    'zX={files:["file","files"],folders:["folder","folders"],edits:["file","files"],searches:["search","searches"],terminal:["command","commands"],tasks:["task","tasks"],web:["page","pages"],browser:["browser","browsers"],images:["image","images"],actions:["action","actions"],artifacts:["artifact","artifacts"]}',
    'zX={files:["个文件","个文件"],folders:["个文件夹","个文件夹"],edits:["处编辑","处编辑"],searches:["次搜索","次搜索"],terminal:["条命令","条命令"],tasks:["个任务","个任务"],web:["个网页","个网页"],browser:["个浏览器操作","个浏览器操作"],images:["张图片","张图片"],actions:["次操作","次操作"],artifacts:["个工件","个工件"]}'
  );
  sourceText = sourceText.replaceAll('f=c?g?"Running":"running":g?"Ran":"ran";', 'f=c?"正在运行":"已运行";');
  sourceText = sourceText.replaceAll('${c?"Editing":"Edited"} ${BX(a)||"files"}', '${c?"正在编辑":"已编辑"} ${BX(a)||"个文件"}');
  sourceText = sourceText.replaceAll('${e.length===1?"command":"commands"}', '"条命令"');
  sourceText = sourceText.replaceAll('b?`${c?"Exploring":"Explored"} ${b}`:c?"Working":"Done"', 'b?`${c?"正在探索":"已探索"} ${b}`:c?"工作中":"已完成"');

  sourceText = sourceText.replace(
    `z.createElement("span",null,"Type"," ",z.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"/")," ","and select"," ",z.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},\n"plan")," ","to have the agent generate a plan.")`,
    `z.createElement("span",null,"输入 "," ",z.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"/")," 并选择 ",z.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},\n"plan")," 可让智能体生成计划。")`
  );


  sourceText = sourceText.replaceAll('"aria-label":"Cancel Task"', '"aria-label":"取消任务"');

  // 查看全部与折叠展开原生汉化
  sourceText = sourceText.replaceAll('D?"See less":`See all (${c})`', 'D?"收起":`查看全部 (${c})`');
  sourceText = sourceText.replaceAll('da?`See all (${aa.items.length})`:"See less"', 'da?`查看全部 (${aa.items.length})`:"收起"');
  sourceText = sourceText.replaceAll('n?g?"Show less":"See less":g?`Show finished (${q})`:`See all (${e})`', 'n?g?"收起":"收起":g?`显示已完成 (${q})`:`查看全部 (${e})`');
  sourceText = sourceText.replaceAll('h?"See less":`See all (${c.length})`', 'h?"收起":`查看全部 (${c.length})`');
  sourceText = sourceText.replaceAll('"See all (",c.length,")"', '"查看全部 (",c.length,")"');
  sourceText = sourceText.replaceAll('k===10?`See all (${e.length})`:"See less"', 'k===10?`查看全部 (${e.length})`:"收起"');

  // 媒体名称与中文日期时间原生汉化
  sourceText = sourceText.replace(
    'c=a.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0})',
    'c=(a.getHours()<12?"上午 ":"下午 ")+(a.getHours()%12||12)+":"+String(a.getMinutes()).padStart(2,"0")'
  );
  sourceText = sourceText.replace(
    'if(a.toDateString()===b.toDateString())return`Today ${c}`;var e=new Date(b);e.setDate(e.getDate()-1);return a.toDateString()===e.toDateString()?`Yesterday ${c}`:a.getFullYear()===b.getFullYear()?`${a.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${c}`:`${a.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} ${c}`',
    'if(a.toDateString()===b.toDateString())return`今天 ${c}`;var e=new Date(b);e.setDate(e.getDate()-1);return a.toDateString()===e.toDateString()?`昨天 ${c}`:a.getFullYear()===b.getFullYear()?`${a.getMonth()+1}月${a.getDate()}日 ${c}`:`${a.getFullYear()}年${a.getMonth()+1}月${a.getDate()}日 ${c}`'
  );
  sourceText = sourceText.replace(
    'if(WLa.test(a))return"Scratchpad";var [,b,c]=a.match(/^(.+?)_(\\d{13})$/)||[null,a,null];a=b.replace(/[_-]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").split(/\\s+/).filter(e=>e.length>0).map(e=>e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()).join(" ");return c?`${a} (${$La(c)})`:a',
    'if(WLa.test(a))return"便签本";var [,b,c]=a.match(/^(.+?)_(\\d{13})$/)||[null,a,null];a=b.replace(/[_-]/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").split(/\\s+/).filter(e=>e.length>0).map(e=>e.charAt(0).toUpperCase()+e.slice(1).toLowerCase()).join(" ");a=(a==="Media"?"媒体":a==="Screenshot"?"屏幕截图":a==="Scratchpad"?"便签本":a);return c?`${a} (${$La(c)})`:a'
  );

  // 2.29.0 通用设置：内置浏览器下载与历史清理、语音模式与麦克风设备
  sourceText = sourceText.replaceAll('"Side Panel Preview"', '"侧面板预览"');
  sourceText = sourceText.replaceAll('title:p?"Side Panel Preview":"Built-in Browser"', 'title:p?"侧面板预览":"内置浏览器"');
  sourceText = sourceText.replaceAll('title:p?"Side Panel Preview":"内置浏览器"', 'title:p?"侧面板预览":"内置浏览器"');
  sourceText = sourceText.replaceAll('subtitle:p?void 0:"Configure link opening and built-in browser preferences."', 'subtitle:p?void 0:"配置链接打开方式与内置浏览器偏好。"');
  sourceText = sourceText.replaceAll('d=b?"Side Panel":"Built-in Browser",f=b?"New Tab":"External Browser"', 'd=b?"侧面板":"内置浏览器",f=b?"新标签页":"外部浏览器"');
  sourceText = sourceText.replaceAll('label:"Download Location"', 'label:"下载位置"');
  sourceText = sourceText.replaceAll('"Folder where files downloaded in the built-in browser are saved."', '"内置浏览器下载文件的保存目录。"');
  sourceText = sourceText.replaceAll('"CitC workspace paths are world-readable and permanently snapshotted. Choose a local folder outside CitC."', '"CitC 工作区路径对所有人可见且永久保留快照，请选择 CitC 之外的本地文件夹。"');
  sourceText = sourceText.replaceAll('},"Change\\u2026"))})),m&&A.createElement(XP,{label:"Browsing History"', '},"更改…"))})),m&&A.createElement(XP,{label:"浏览记录"');
  sourceText = sourceText.replaceAll('label:"Browsing History"', 'label:"浏览记录"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from the built-in browser."', '"清除内置浏览器的访问网址与自动填充建议。"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from side panel preview."', '"清除侧面板预览中的访问网址与自动填充建议。"');
  sourceText = sourceText.replaceAll('"builtin-browser-download-dir-reset",onClick:()=>{v(null);T.setPrefValue("builtinBrowserDownloadDir","")}},"Reset")', '"builtin-browser-download-dir-reset",onClick:()=>{v(null);T.setPrefValue("builtinBrowserDownloadDir","")}},"重置")');
  sourceText = sourceText.replaceAll('title:b?"Voice":"Voice mode"', 'title:b?"语音":"语音模式"');
  sourceText = sourceText.replaceAll('label:"Voice",description:b?"The voice Jetski speaks with.":"The voice used in Voice mode. Powered by Gemini Live."', 'label:"语音",description:b?"Jetski 发音使用的声音。":"语音模式使用的声音，由 Gemini Live 提供技术支持。"');
  sourceText = sourceText.replaceAll('c||"Not set"', 'c||"未设置"');
  sourceText = sourceText.replaceAll('"data-testid":"voice-settings-change",onClick:()=>{f(!0)}},"Change"', '"data-testid":"voice-settings-change",onClick:()=>{f(!0)}},"更改"');
  sourceText = sourceText.replaceAll("`Choose \\${g?.isGoogleInternal===!1?\"Antigravity\":\"Jetski\"}'s Voice`", "`选择 \\${g?.isGoogleInternal===!1?\"Antigravity\":\"Jetski\"} 的语音`");
  sourceText = sourceText.replaceAll('g?.isGoogleInternal===!1&&"Powered by Gemini Live \\u00b7 "', 'g?.isGoogleInternal===!1&&"由 Gemini Live 提供技术支持 · "');
  sourceText = sourceText.replaceAll('"You can change this in"', '"你稍后可在"');
  sourceText = sourceText.replaceAll('},"Settings")," ","later."))', '},"设置")," ","中更改。"))');
  sourceText = sourceText.replaceAll('"Use ",G.name', '"使用 ",G.name');
  sourceText = sourceText.replaceAll('"aria-label":"Voices"', '"aria-label":"语音选项"');
  sourceText = sourceText.replaceAll('tone:"Clear and friendly"', 'tone:"清晰友好"');
  sourceText = sourceText.replaceAll('tone:"Confident and clear"', 'tone:"自信清晰"');
  sourceText = sourceText.replaceAll('tone:"Warm and engaging"', 'tone:"温暖生动"');
  sourceText = sourceText.replaceAll('tone:"Warm and approachable"', 'tone:"温暖亲切"');
  sourceText = sourceText.replaceAll('tone:"Deep and velvety"', 'tone:"深沉醇厚"');
  sourceText = sourceText.replaceAll('tone:"Light and precise"', 'tone:"轻盈精准"');
  sourceText = sourceText.replaceAll('label:"Microphone",description:"Input device for voice mode and dictation."', 'label:"麦克风",description:"用于语音模式与听写的输入设备。"');
  sourceText = sourceText.replaceAll('vxb={id:"",label:"System default"}', 'vxb={id:"",label:"系统默认"}');
  sourceText = sourceText.replaceAll('label:"Volume"', 'label:"音量"');
  sourceText = sourceText.replaceAll('description:b?"How loud Jetski\'s voice is.":"How loud Antigravity\'s voice is."', 'description:b?"Jetski 的发音音量。":"Antigravity 的发音音量。"');
  sourceText = sourceText.replaceAll('"aria-label":"Voice volume"', '"aria-label":"语音音量"');
  sourceText = sourceText.replaceAll('label:"Recordings"', 'label:"录音记录"');
  sourceText = sourceText.replaceAll('a===0?"No recordings":', 'a===0?"无录音记录":');
  sourceText = sourceText.replaceAll('title:"Delete all recordings?"', 'title:"删除所有录音记录？"');
  sourceText = sourceText.replaceAll('disabled:b.bytes===0,"data-testid":"voice-settings-delete-recordings",onClick:()=>{f(!0)}},"Delete all"', 'disabled:b.bytes===0,"data-testid":"voice-settings-delete-recordings",onClick:()=>{f(!0)}},"全部删除"');
  sourceText = sourceText.replaceAll('label:"System default"', 'label:"系统默认"');

  // 2.29.0 外观设置：辅助功能屏幕阅读器与字体选择器、浅深色主题
  sourceText = sourceText.replaceAll('{title:"Accessibility",settings:["customContextMenusEnabled","screenReaderMode"]}', '{title:"辅助功能",settings:["customContextMenusEnabled","screenReaderMode"]}');
  sourceText = sourceText.replaceAll('label:"Screen Reader Mode",description:"Optimize the interface and terminal output for screen readers.",settingType:"switch"', 'label:"屏幕阅读器模式",description:"针对屏幕阅读器优化界面和终端输出。",settingType:"switch"');
  sourceText = sourceText.replaceAll('label:"Font",value:JOb(m),options:IOb,displayResolver:JOb,onSelect:hPb,nativeOnMobile:!0', 'label:"字体",value:JOb(m),options:IOb,displayResolver:JOb,onSelect:hPb,nativeOnMobile:!0');
  sourceText = sourceText.replaceAll('function JOb(a){switch(a){case "system":return"System UI";case "inter":return"Inter";case "google-sans":return"Google Sans"}}', 'function JOb(a){switch(a){case "system":return"系统默认";case "inter":return"Inter";case "google-sans":return"Google Sans"}}');
  sourceText = sourceText.replaceAll('title:"Light Theme"', 'title:"浅色主题"');
  sourceText = sourceText.replaceAll('title:"Dark Theme"', 'title:"深色主题"');

  // 2.29.0 项目与工作区选择器原生汉化
  sourceText = sourceText.replaceAll('C=B?.renameProjectsToWorkspaces??!1,E=C?"workspaces":"projects"', 'C=B?.renameProjectsToWorkspaces??!1,E=C?"工作区":"项目"');
  sourceText = sourceText.replaceAll('F=B?.projectSearchPlaceholder??(C?"Search Recent Workspaces":"Search Projects")', 'F=B?.projectSearchPlaceholder??(C?"搜索最近工作区":"搜索项目")');
  sourceText = sourceText.replaceAll('gb=C?"Select Workspace":"Select Project"', 'gb=C?"选择工作区":"选择项目"');
  sourceText = sourceText.replaceAll('case "magicWorkspace":return"New Workspace"', 'case "magicWorkspace":return"新建工作区"');
  sourceText = sourceText.replaceAll('case "standalone":return"No Project"', 'case "standalone":return"无项目"');
  sourceText = sourceText.replaceAll('"No ",E," found"', '"未找到",E');
  sourceText = sourceText.replaceAll('"No matching ",E', '"未找到匹配的",E');
  sourceText = sourceText.replaceAll('Sa.trim()?`No matching ${E}`:`No remote ${E}`', 'Sa.trim()?`未找到匹配的${E}`:`暂无远程${E}`');
  sourceText = sourceText.replaceAll('title:"This Computer"', 'title:"本地电脑"');
  sourceText = sourceText.replaceAll('searchPlaceholder:C?"Search Workspaces\\u2026":"Search Projects\\u2026"', 'searchPlaceholder:C?"搜索工作区\\u2026":"搜索项目\\u2026"');
  sourceText = sourceText.replaceAll('title:"Remote"', 'title:"远程"');
  sourceText = sourceText.replaceAll('searchPlaceholder:"Search Remote\\u2026"', 'searchPlaceholder:"搜索远程\\u2026"');
  sourceText = sourceText.replaceAll('A.createElement(WS,null,"GitHub Repositories")', 'A.createElement(WS,null,"GitHub 仓库")');
  sourceText = sourceText.replaceAll('"Loading Repositories\\u2026"', '"正在加载仓库\\u2026"');
  sourceText = sourceText.replaceAll('g.trim()?"No matching repositories":"No repositories found"', 'g.trim()?"未找到匹配的仓库":"未找到仓库"');
  sourceText = sourceText.replaceAll('A.createElement(WS,null,"Recent")', 'A.createElement(WS,null,"最近")');
  sourceText = sourceText.replace(/\bA\.createElement\(WS,null,\s*"Remote Projects"\)/g, 'A.createElement(WS,null,"远程项目")');

  // 附件汇总与单复数文案原生汉化
  sourceText = sourceText.replaceAll('"1 image attachment"', '"1 张图片附件"');
  sourceText = sourceText.replaceAll('`${c.numImages} image attachments`', '`${c.numImages} 张图片附件`');
  sourceText = sourceText.replaceAll('"1 video attachment"', '"1 个视频附件"');
  sourceText = sourceText.replaceAll('`${c.numVideos} video attachments`', '`${c.numVideos} 个视频附件`');
  sourceText = sourceText.replaceAll('"1 audio attachment"', '"1 个音频附件"');
  sourceText = sourceText.replaceAll('`${c.numAudio} audio attachments`', '`${c.numAudio} 个音频附件`');
  sourceText = sourceText.replaceAll('`${d[0]} and ${d[1]}`', '`${d[0]} 与 ${d[1]}`');
  sourceText = sourceText.replaceAll('`${d[0]}, ${d[1]}, and ${d[2]}`', '`${d[0]}、${d[1]} 与 ${d[2]}`');
  sourceText = sourceText.replaceAll('`${b} attachment(s)`', '`${b} 个附件`');
  sourceText = sourceText.replaceAll('`+${d} attachments`', '`+${d} 个附件`');
  sourceText = sourceText.replaceAll('"Maximum number of attachments reached"', '"已达到最大附件数量限制"');

  // 各类附件类型原生汉化
  sourceText = sourceText.replaceAll('video:"Video attachment"', 'video:"视频附件"');
  sourceText = sourceText.replaceAll('pdf:"PDF attachment"', 'pdf:"PDF 附件"');
  sourceText = sourceText.replaceAll('text:"Text attachment"', 'text:"文本附件"');
  sourceText = sourceText.replaceAll('csv:"CSV spreadsheet attachment"', 'csv:"CSV 表格附件"');
  sourceText = sourceText.replaceAll('json:"JSON attachment"', 'json:"JSON 附件"');
  sourceText = sourceText.replaceAll('md:"Markdown attachment"', 'md:"Markdown 附件"');
  sourceText = sourceText.replaceAll('image:"Image attachment"', 'image:"图片附件"');
  sourceText = sourceText.replaceAll('audio:"Audio attachment"', 'audio:"音频附件"');
  sourceText = sourceText.replaceAll('document:"Document attachment"', 'document:"文档附件"');
  sourceText = sourceText.replaceAll('archive:"Zip attachment"', 'archive:"压缩包附件"');
  sourceText = sourceText.replaceAll('unknown:"File attachment"', 'unknown:"文件附件"');
  sourceText = sourceText.replaceAll('"Video attachment"', '"视频附件"');
  sourceText = sourceText.replaceAll('"Image attachment"', '"图片附件"');
  sourceText = sourceText.replaceAll('"Click to load"', '"点击加载"');
  sourceText = sourceText.replaceAll('`${b} comment${b>1?"s":""} in ${c}`', '`${c} 中的 ${b} 条批注`');

  // 消息卡片加载状态与分支提问来源原生汉化
  sourceText = sourceText.replaceAll('h?"Couldn\'t load message":"No message text"', 'h?"无法加载消息":"无消息内容"');
  sourceText = sourceText.replaceAll('c?.isMidTurn?"Started during":"Started from"', 'c?.isMidTurn?"始于":"发起自"');
  sourceText = sourceText.replaceAll('f=d?`${c} \\u201c${d}\\u201d`:`${c} the main conversation`', 'f=d?`${c} \\u201c${d}\\u201d`:`${c}主会话`');
  sourceText = sourceText.replaceAll('`${f}. Show in main conversation`', '`${f}。在主会话中显示`');

  // 高频菜单与操作按钮原生汉化
  sourceText = sourceText.replaceAll('label:"Undo to Here"', 'label:"撤销到此处"');
  sourceText = sourceText.replaceAll('label:"Copy Message"', 'label:"复制消息"');
  sourceText = sourceText.replaceAll('label:"Fork in Shared Workspace"', 'label:"在共享工作区中分叉"');
  sourceText = sourceText.replaceAll('label:"Fork in New Workspace"', 'label:"在新工作区中分叉"');
  sourceText = sourceText.replaceAll('label:"Open Link in New Tab"', 'label:"在新标签页中打开链接"');
  sourceText = sourceText.replaceAll('label:"Copy Link Address"', 'label:"复制链接地址"');
  sourceText = sourceText.replaceAll('label:"Open Image in New Tab"', 'label:"在新标签页中打开图片"');
  sourceText = sourceText.replaceAll('label:"Copy Image Address"', 'label:"复制图片地址"');
  sourceText = sourceText.replaceAll('label:"Close Other Tabs"', 'label:"关闭其他标签页"');
  sourceText = sourceText.replaceAll('label:"Close Tabs to the Left"', 'label:"关闭左侧标签页"');
  sourceText = sourceText.replaceAll('label:"Close Tabs to the Right"', 'label:"关闭右侧标签页"');
  sourceText = sourceText.replaceAll('tooltip:"Stop Editing"', 'tooltip:"停止编辑"');
  sourceText = sourceText.replaceAll('tooltip:"Edit Shortcut"', 'tooltip:"编辑快捷键"');
  sourceText = sourceText.replaceAll('tooltip:"Remove Shortcut"', 'tooltip:"移除快捷键"');
  sourceText = sourceText.replaceAll('tooltip:"Add Shortcut"', 'tooltip:"添加快捷键"');
  sourceText = sourceText.replaceAll('tooltip:"Reset All to Defaults"', 'tooltip:"全部重置为默认值"');
  sourceText = sourceText.replaceAll('tooltip:"Open in side pane"', 'tooltip:"在侧面板中打开"');
  sourceText = sourceText.replaceAll('tooltip:"Open in Notebook View"', 'tooltip:"在笔记本视图中打开"');
  sourceText = sourceText.replaceAll('tooltip:"Download File"', 'tooltip:"下载文件"');
  sourceText = sourceText.replaceAll('tooltip:"Kill Terminal"', 'tooltip:"终止终端"');

  // 对话时间轴轮次与步骤卡片原生汉化
  sourceText = sourceText.replaceAll('g=[`${g} turn${g===1?"":"s"}`];', 'g=[`${g} 轮对话`];');
  sourceText = sourceText.replaceAll('a===b?`Turn ${a}`:`Turns ${a}\\u2013${b}`', 'a===b?`第 ${a} 轮`:`第 ${a}–${b} 轮`');
  sourceText = sourceText.replaceAll('d||`Turn ${a.turnIndex+1}`', 'd||`第 ${a.turnIndex+1} 轮`');
  sourceText = sourceText.replaceAll('"aria-label":`Go to turn ${a} of ${c}`', '"aria-label":`前往第 ${a} 步（共 ${c} 步）`');
  sourceText = sourceText.replaceAll('"aria-label":`Turn ${a+1} of ${b}`', '"aria-label":`第 ${a+1} 步（共 ${b} 步）`');
  sourceText = sourceText.replaceAll(/([A-Za-z_$][\w$]*)\.createElement\("span",null,a," of ",c\)/g, '$1.createElement("span",null,a," / ",c)');
  sourceText = sourceText.replaceAll('A.createElement(hn,null,"Card "),m+1," of ",l', 'A.createElement(hn,null,"卡片 "),m+1," / ",l');
  sourceText = sourceText.replaceAll('"aria-label":a==="up"?"Scroll turns up":"Scroll turns down"', '"aria-label":a==="up"?"向上滚动轮次":"向下滚动轮次"');
  sourceText = sourceText.replaceAll('"aria-label":"Conversation turns"', '"aria-label":"对话轮次"');

  // 历史更早消息加载与上下文压缩提示原生汉化
  sourceText = sourceText.replaceAll('a?"Load older messages":"No more older messages"', 'a?"加载更早的消息":"没有更早的消息了"');
  sourceText = sourceText.replaceAll('a?`Load older messages, showing ${b} of ${c}`:`No more older messages, showing ${b} of ${c}`', 'a?`加载更早的消息（已显示 ${b} / ${c}）`:`没有更早的消息了（已显示 ${b} / ${c}）`');
  sourceText = sourceText.replaceAll('"The conversation was compacted to fit within the context window."', '"对话已压缩，以适应上下文窗口。"');
  sourceText = sourceText.replaceAll('"The conversation was compacted while generating this response."', '"在生成此回复时，对话已自动压缩。"');

  // 章节小结标题智能翻译增强（全量内置 23 个真实标题 + 完整动宾复合解析器）
  sourceText = sourceText.replace(
    'A.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"text-sm font-medium leading-snug text-foreground"},d??SCc(a,b))',
    'A.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"text-sm font-medium leading-snug text-foreground"},(d?((t)=>{const m={"Analyzing software localization and promotion strategies":"分析软件本地化与推广策略","Auditing and localizing desktop app":"审查并本地化桌面应用","Comparing translation pack projects":"对比汉化包项目","Completing localization and debugging of Antigravity":"完成 Antigravity 本地化与问题调试","Completing UI localization and rules adjustment":"完成界面本地化与规则调整","Continuing translation and reviewing improvements":"继续汉化并审查改进","Fixing and releasing software localization":"修复并发布软件本地化","Fixing the desktop app localization":"修复桌面应用本地化","Fixing translation and UI bug":"修复汉化与界面问题","Iterating software localization and UI translations":"迭代软件本地化与界面汉化","Locating missing desktop shortcut":"查找丢失的桌面快捷方式","Optimizing app localization and rules":"优化应用本地化与规则","Publishing and updating the localization project":"发布与更新本地化项目","Publishing new antigravity localization release":"发布 Antigravity 汉化新版本","Refining UI localization and error messages":"优化界面汉化与错误提示","Releasing v1.0.0 and finalizing localization":"发布 v1.0.0 并定稿本地化","Setting up and fixing Antigravity GitHub repository":"配置并修复 Antigravity GitHub 仓库","Translating context menu and tooltips":"汉化右键菜单与提示气泡","Translating missing UI elements and tooltips":"汉化遗漏的界面元素与提示","Translating remaining untranslated error messages":"汉化剩余未翻译的错误提示","Translating the user interface":"汉化用户界面","Understanding the antigravity hot reload update":"解析 Antigravity 热重载更新机制","Updating and uploading localization files":"更新与上传本地化文件"};if(m[t])return m[t];let s=t.trim();s=s.replace(/^Completing UI localization and rules adjustment/i,"完成界面本地化与规则调整").replace(/^Completing localization and debugging of Antigravity/i,"完成 Antigravity 本地化与问题调试").replace(/^Fixing and releasing software localization/i,"修复并发布软件本地化").replace(/^Publishing and updating the localization project/i,"发布与更新本地化项目").replace(/^Setting up and fixing Antigravity GitHub repository/i,"配置并修复 Antigravity GitHub 仓库").replace(/^Releasing v1.0.0 and finalizing localization/i,"发布 v1.0.0 并定稿本地化").replace(/^Translating missing UI elements and tooltips/i,"汉化遗漏的界面元素与提示").replace(/^Translating context menu and tooltips/i,"汉化右键菜单与提示气泡").replace(/^Translating remaining untranslated error messages/i,"汉化剩余未翻译的错误提示").replace(/^Comparing translation pack projects/i,"对比汉化包项目").replace(/^Understanding the antigravity hot reload update/i,"解析 Antigravity 热重载更新机制").replace(/^Locating missing desktop shortcut/i,"查找丢失的桌面快捷方式").replace(/^Fixing translation and UI bug/i,"修复汉化与界面问题").replace(/^Continuing translation and reviewing improvements/i,"继续汉化并审查改进").replace(/^Iterating software localization and UI translations/i,"迭代软件本地化与界面汉化").replace(/^Fixing the desktop app localization/i,"修复桌面应用本地化").replace(/^Updating and uploading localization files/i,"更新与上传本地化文件").replace(/^Auditing and localizing desktop app/i,"审查并本地化桌面应用").replace(/^Analyzing software localization and promotion strategies/i,"分析软件本地化与推广策略").replace(/^Translating the user interface/i,"汉化用户界面").replace(/^Optimizing app localization and rules/i,"优化应用本地化与规则");if(s!==t)return s;const vm=[[/^Completing\\s+/i,"完成 "],[/^Fixing and releasing\\s+/i,"修复并发布 "],[/^Updating and uploading\\s+/i,"更新并上传 "],[/^Publishing and updating\\s+/i,"发布并更新 "],[/^Auditing and localizing\\s+/i,"审查并本地化 "],[/^Continuing translation and reviewing\\s+/i,"继续汉化并审查 "],[/^Setting up and fixing\\s+/i,"配置并修复 "],[/^Fixing\\s+/i,"修复 "],[/^Updating\\s+/i,"更新 "],[/^Publishing\\s+/i,"发布 "],[/^Comparing\\s+/i,"对比 "],[/^Building\\s+/i,"构建 "],[/^Testing\\s+/i,"测试 "],[/^Creating\\s+/i,"创建 "],[/^Configuring\\s+/i,"配置 "],[/^Deploying\\s+/i,"部署 "],[/^Analyzing\\s+/i,"分析 "],[/^Refining\\s+/i,"优化 "],[/^Optimizing\\s+/i,"优化 "],[/^Iterating\\s+/i,"迭代 "],[/^Locating\\s+/i,"查找 "],[/^Translating\\s+/i,"汉化 "],[/^Debugging\\s+/i,"调试 "]];let mv="";for(const [vr,vz] of vm){if(vr.test(s)){mv=vz;s=s.replace(vr,"");break;}}const nm=[[/the desktop app localization/gi,"桌面应用本地化"],[/desktop app localization/gi,"桌面应用本地化"],[/desktop app/gi,"桌面应用"],[/software localization/gi,"软件本地化"],[/localization files/gi,"本地化文件"],[/the localization project/gi,"本地化项目"],[/localization project/gi,"本地化项目"],[/translation pack projects/gi,"汉化包项目"],[/translation pack/gi,"汉化包"],[/UI localization/gi,"界面本地化"],[/UI translations/gi,"界面汉化"],[/user interface/gi,"用户界面"],[/the user interface/gi,"用户界面"],[/rules adjustment/gi,"规则调整"],[/app localization and rules/gi,"应用本地化与规则"],[/localization and debugging of Antigravity/gi,"Antigravity 本地化与调试"],[/debugging of Antigravity/gi,"Antigravity 调试"],[/error messages/gi,"错误提示"],[/context menu and tooltips/gi,"右键菜单与提示气泡"],[/missing UI elements and tooltips/gi,"遗漏的界面元素与提示气泡"],[/antigravity GitHub repository/gi,"Antigravity GitHub 仓库"]];for(const [nr,nz] of nm){s=s.replace(nr,nz);}s=s.replace(/\\s+and\\s+/gi," 与 ");return mv?(mv.trim()+" "+s.trim()).trim():s;})(d):d)??SCc(a,b))'
  );

  // 复制与剪贴板提示原生汉化
  sourceText = sourceText.replaceAll('"aria-label":b?"Copied":"Copy"', '"aria-label":b?"已复制":"复制"');
  sourceText = sourceText.replaceAll('A.createElement(ZA,{id:f,place:"top-end"},b?"Copied":"Copy"))', 'A.createElement(ZA,{id:f,place:"top-end"},b?"已复制":"复制"))');
  sourceText = sourceText.replaceAll('"aria-label":G?"Copied":"Copy"', '"aria-label":G?"已复制":"复制"');
  sourceText = sourceText.replaceAll('A.createElement(ZA,{id:f,place:"top-end"},G?"Copied":"Copy")', 'A.createElement(ZA,{id:f,place:"top-end"},G?"已复制":"复制")');
  sourceText = sourceText.replaceAll('"aria-label":p?"Copied":"Copy",tooltip:p?"Copied":"Copy"', '"aria-label":p?"已复制":"复制",tooltip:p?"已复制":"复制"');
  sourceText = sourceText.replaceAll('tooltip:P?"Copy Image":"Copy"', 'tooltip:P?"复制图片":"复制"');
  sourceText = sourceText.replaceAll('tooltip:"Copy Path"', 'tooltip:"复制路径"');
  sourceText = sourceText.replaceAll('tooltip:"Copy Content"', 'tooltip:"复制内容"');
  sourceText = sourceText.replaceAll('{metadata:{id:"copy",label:"Copy"}', '{metadata:{id:"copy",label:"复制"}');
  sourceText = sourceText.replaceAll('{metadata:{id:"cut",label:"Cut"}', '{metadata:{id:"cut",label:"剪切"}');
  sourceText = sourceText.replaceAll('{metadata:{id:"paste",label:"Paste"}', '{metadata:{id:"paste",label:"粘贴"}');
  sourceText = sourceText.replaceAll('{id:"copy",label:"Copy"', '{id:"copy",label:"复制"');
  sourceText = sourceText.replaceAll('{id:"paste",label:"Paste"', '{id:"paste",label:"粘贴"');
  sourceText = sourceText.replaceAll('{id:"copy-selection",label:"Copy"', '{id:"copy-selection",label:"复制"');
  sourceText = sourceText.replaceAll('A.createElement(XS,{title:"Copy"},A.createElement(YS,null,A.createElement(lt,{name:"content_copy",size:16,className:"text-secondary-foreground shrink-0"}),A.createElement("span",null,"Copy"))', 'A.createElement(XS,{title:"复制"},A.createElement(YS,null,A.createElement(lt,{name:"content_copy",size:16,className:"text-secondary-foreground shrink-0"}),A.createElement("span",null,"复制"))');
  sourceText = sourceText.replaceAll('"Copied to clipboard"', '"已复制到剪贴板"');
  sourceText = sourceText.replaceAll('placeholder:"Enter authorization code..."', 'placeholder:"输入授权码..."');
  sourceText = sourceText.replaceAll('"aria-label":h?"Copied":"Copy code"', '"aria-label":h?"已复制":"复制代码"');
  sourceText = sourceText.replaceAll('A.createElement(ZA,{id:n,place:"top"},h?"Copied":"Copy code")', 'A.createElement(ZA,{id:n,place:"top"},h?"已复制":"复制代码")');
  sourceText = sourceText.replaceAll('b?"Copied":"Copy transcript"', 'b?"已复制":"复制对话记录"');
  sourceText = sourceText.replaceAll('A.createElement(ZA,{id:l,place:"top"},"Insert in Terminal")', 'A.createElement(ZA,{id:l,place:"top"},"在终端中插入")');
  sourceText = sourceText.replaceAll('A.createElement(ZA,{id:m,place:"top"},"At Mention Code Block")', 'A.createElement(ZA,{id:m,place:"top"},"@ 提及代码块")');

  // 2.29.0 图片/视频右键菜单与 Electron 原生上下文菜单深度汉化
  sourceText = sourceText.replaceAll('label:a==="video"?"Save Video":"Save Image"', 'label:a==="video"?"保存视频":"保存图片"');
  sourceText = sourceText.replaceAll('id:"copy-image",label:"Copy Image"', 'id:"copy-image",label:"复制图片"');
  sourceText = sourceText.replaceAll('id:"save-media",label:"Save Image"', 'id:"save-media",label:"保存图片"');
  sourceText = sourceText.replaceAll('id:"save-media",label:"Save Video"', 'id:"save-media",label:"保存视频"');
  sourceText = sourceText.replaceAll('id:"open-in-tab",label:"Open in Tab"', 'id:"open-in-tab",label:"在标签页中打开"');
  sourceText = sourceText.replaceAll('id:"open-in-new-tab",label:"Open in New Tab"', 'id:"open-in-new-tab",label:"在新标签页中打开"');
  sourceText = sourceText.replace(
    'function $Ra({items:a}){return A.createElement(A.Fragment,null,a.map((b,c)=>',
    'function $Ra({items:a}){var _cMap={"Copy":"复制","Cut":"剪切","Paste":"粘贴","Select All":"全选","Undo":"撤销","Redo":"重做","Delete":"删除","Copy Link":"复制链接","Copy Selection":"复制所选内容","Open Link":"打开链接","Search":"搜索","Copy Message":"复制消息","Copy Image":"复制图片","Save Image":"保存图片","Save Video":"保存视频","Copy Path":"复制路径","Open in Tab":"在标签页中打开","Open in New Tab":"在新标签页中打开"};a=a.map(b=>b&&b.label&&(_cMap[b.label]||globalThis.__AGY_ZHCN_TRANSLATE__?.(b.label))?{...b,label:_cMap[b.label]||globalThis.__AGY_ZHCN_TRANSLATE__(b.label)}:b);return A.createElement(A.Fragment,null,a.map((b,c)=>'
  );
  sourceText = sourceText.replace(
    'label:d.label,type:d.type&&d.type!=="item"?d.type:void 0',
    'label:(({"Copy Image":"复制图片","Save Image":"保存图片","Save Video":"保存视频","Open in Tab":"在标签页中打开","Open in New Tab":"在新标签页中打开","Copy":"复制","Cut":"剪切","Paste":"粘贴","Select All":"全选","Undo":"撤销","Redo":"重做","Delete":"删除","Copy Link":"复制链接","Copy Path":"复制路径","Copy Message":"复制消息","Rename":"重命名","Archive":"归档","Share":"分享","Stop":"停止","Restore":"恢复","Delete Permanently":"永久删除"}[d.label])||globalThis.__AGY_ZHCN_TRANSLATE__?.(d.label)||d.label),type:d.type&&d.type!=="item"?d.type:void 0'
  );

  // 2.29.0 权限配置、计划评审策略润色、外观主题预设与宽度、远程智能体推广卡片原生汉化
  sourceText = sourceText.replaceAll(
    '"Configure what the agent can do in local and remote conversations. "',
    '"配置智能体在本地和远程对话中的操作权限。 "'
  );
  sourceText = sourceText.replaceAll(
    '"Configure what the agent can do in local and remote conversations."',
    '"配置智能体在本地和远程对话中的操作权限。"'
  );
  sourceText = sourceText.replaceAll(
    'description:"Whether the agent asks you to review its documents."',
    'description:"控制智能体在生成计划或文档后是否请求你评审。"'
  );
  sourceText = sourceText.replaceAll('{label:"Verbose",value:"verbose"}', '{label:"详细",value:"verbose"}');
  sourceText = sourceText.replaceAll('{value:"fill",label:"Fill"}', '{value:"fill",label:"铺满"}');
  sourceText = sourceText.replaceAll('title:"Introducing Remote Agents"', 'title:"重磅推出：远程智能体"');
  sourceText = sourceText.replaceAll(
    'description:"Your agents can now run in the cloud and keep working after you close the app. Check on them from any browser at antigravity.google.com. Create a Remote Project to get started."',
    'description:"智能体支持在云端持续运行，即使关闭客户端也不会中断。你可以随时通过浏览器访问 antigravity.google.com 查看进度，创建远程项目即可开始使用。"'
  );
  sourceText = sourceText.replaceAll(
    '"Uploaded files and connected resources are mounted in your cloud environment."',
    '"上传的文件与已连接的资源会自动挂载到你的云端环境中。"'
  );
  sourceText = sourceText.replaceAll('"Select Resource(s)"', '"选择资源"');
  sourceText = sourceText.replaceAll('"+ Add Resource"', '"+ 添加资源"');

  // 2.29.0 自定义模块（插件市场/已安装/插件与技能详情页/Markdown概览与文档渲染器 Q3）深度汉化
  sourceText = sourceText.replace(
    'function Q3({markdown:a,className:b,baseDirUri:c}){return A.createElement(oB,{value:void 0},A.createElement(h3,{cascadeId:void 0,markdown:a,',
    'function Q3({markdown:a,className:b,baseDirUri:c}){a=globalThis.__AGY_ZHCN_TRANSLATE_MD__?globalThis.__AGY_ZHCN_TRANSLATE_MD__(a):a;return A.createElement(oB,{value:void 0},A.createElement(h3,{cascadeId:void 0,markdown:a,'
  );
  sourceText = sourceText.replace(
    'const ckc=[{id:"overview",label:"Overview"},{id:"accounts",label:"Accounts"},{id:"skills",label:"Skills"},{id:"mcp",label:"MCP"},{id:"agents",label:"Agents"},{id:"hooks",label:"Hooks"},{id:"rules",label:"Rules"},{id:"uiExtensions",label:"UI Extensions"},{id:"sidecars",label:"Automations"},{id:"context-providers",label:"Context Providers"}];',
    'const ckc=[{id:"overview",label:"概览"},{id:"accounts",label:"账号"},{id:"skills",label:"技能"},{id:"mcp",label:"MCP"},{id:"agents",label:"智能体"},{id:"hooks",label:"钩子"},{id:"rules",label:"规则"},{id:"uiExtensions",label:"UI 扩展"},{id:"sidecars",label:"自动化"},{id:"context-providers",label:"上下文提供程序"}];'
  );
  sourceText = sourceText.replaceAll('{title:"Commands",count:k.length}', '{title:"命令",count:k.length}');
  sourceText = sourceText.replaceAll('{title:"Skills",count:l.length}', '{title:"技能",count:l.length}');
  sourceText = sourceText.replaceAll('{title:"Agents",count:a.agents.length}', '{title:"智能体",count:a.agents.length}');
  sourceText = sourceText.replaceAll('{title:"MCP servers",count:a.mcpServers.length}', '{title:"MCP 服务器",count:a.mcpServers.length}');
  sourceText = sourceText.replaceAll('{title:"Rules",count:a.rules.length}', '{title:"规则",count:a.rules.length}');
  sourceText = sourceText.replaceAll('{title:"Hooks",count:m}', '{title:"钩子",count:m}');
  sourceText = sourceText.replaceAll('{title:"UI extensions",count:b.length}', '{title:"UI 扩展",count:b.length}');
  sourceText = sourceText.replaceAll('{title:"Automations",count:c.length}', '{title:"自动化",count:c.length}');
  sourceText = sourceText.replaceAll('{title:"Context Providers",count:d.length}', '{title:"上下文提供程序",count:d.length}');
  sourceText = sourceText.replaceAll('{title:"Themes",count:a.themes.length}', '{title:"主题",count:a.themes.length}');
  sourceText = sourceText.replaceAll('"Developer"),A.createElement("dd"', '"开发者"),A.createElement("dd"');
  sourceText = sourceText.replaceAll('"Version"),A.createElement("dd"', '"版本"),A.createElement("dd"');
  sourceText = sourceText.replaceAll('"Links"),A.createElement("dd"', '"链接"),A.createElement("dd"');
  sourceText = sourceText.replaceAll('label:"Website",testId:"plugin-detail-footer-homepage"', 'label:"网站",testId:"plugin-detail-footer-homepage"');
  sourceText = sourceText.replaceAll('label:"Repository",testId:"plugin-detail-footer-repository"', 'label:"代码仓库",testId:"plugin-detail-footer-repository"');

  // 三级弹窗与二级浮窗（钩子、运行状态、任务日志、MCP 服务、复制路径等）原生深度汉化
  sourceText = sourceText.replaceAll('label:b="Copy Path"', 'label:b="复制路径"');
  sourceText = sourceText.replaceAll('tooltip:b,"aria-label":b', 'tooltip:b,"aria-label":b');
  sourceText = sourceText.replaceAll('ariaLabel:p?"Open skill page":"Open plugin page"', 'ariaLabel:p?"打开技能页面":"打开插件页面"');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"Event:")', 'A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"触发事件：")');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"Target Tools:")', 'A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"目标工具：")');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"Command:")', 'A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"执行命令：")');
  sourceText = sourceText.replaceAll('A.createElement("div",{className:"text-xs text-muted-foreground"},"Timeout:"," "', 'A.createElement("div",{className:"text-xs text-muted-foreground"},"超时时间："," "');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"Definition:")', 'A.createElement("span",{className:"text-xs text-muted-foreground font-medium"},"配置定义：")');
  sourceText = sourceText.replaceAll('"Unnamed MCP Server"', '"未命名 MCP 服务器"');
  sourceText = sourceText.replaceAll('A.createElement("h2",{className:"text-sm font-medium text-foreground"},"Context usage"', 'A.createElement("h2",{className:"text-sm font-medium text-foreground"},"上下文用量"');
  sourceText = sourceText.replaceAll('"Loading logs..."', '"正在加载日志..."');
  sourceText = sourceText.replaceAll('"No logs available."', '"暂无可用日志。"');
  sourceText = sourceText.replaceAll('A.createElement("h2",{className:"text-lg font-semibold text-foreground"},"Task Logs")', 'A.createElement("h2",{className:"text-lg font-semibold text-foreground"},"任务日志")');
  sourceText = sourceText.replaceAll('"Close Logs Modal"', '"关闭日志弹窗"');
  sourceText = sourceText.replaceAll('"Copy command"', '"复制命令"');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-muted-foreground shrink-0"},"Host Endpoint")', 'A.createElement("span",{className:"text-muted-foreground shrink-0"},"主机端点")');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs font-semibold text-foreground"},"Recent Events")', 'A.createElement("span",{className:"text-xs font-semibold text-foreground"},"近期事件")');
  sourceText = sourceText.replaceAll('"Full Logs"', '"完整日志"');
  sourceText = sourceText.replaceAll('"Loading events..."', '"正在加载事件..."');
  sourceText = sourceText.replaceAll('"No events recorded"', '"暂无记录事件"');
  sourceText = sourceText.replaceAll('"Events and stdout streams will appear here as they occur."', '"事件及标准输出流将在产生时实时显示于此处。"');
  sourceText = sourceText.replaceAll('"This automation is currently stopped. Events and stdout streams will appear here once started."', '"此自动化当前已停止运行。启动后将在此处实时显示事件与标准输出流。"');
  sourceText = sourceText.replaceAll('"This extension is currently stopped. Events and stdout streams will appear here once started."', '"此扩展当前已停止运行。启动后将在此处实时显示事件与标准输出流。"');
  sourceText = sourceText.replaceAll('f==="sidecar"?"Start Automation":"Start Extension"', 'f==="sidecar"?"启动自动化":"启动扩展"');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-muted-foreground"},"Managed by plugin"', 'A.createElement("span",{className:"text-muted-foreground"},"由插件托管"');
  sourceText = sourceText.replaceAll('"Working Directory: "', '"工作目录："');

  // 基线配额刷新横幅与升级提示原生汉化
  sourceText = sourceText.replace(
    'g+=` Your plan\'s baseline quota will refresh on ${h}.`',
    'g+=` 你的方案基线配额将于 ${h} 刷新。`'
  );
  sourceText = sourceText.replaceAll(
    'Switch to another available model to continue.',
    '请切换到其他可用模型以继续。'
  );
  sourceText = sourceText.replaceAll(
    'To continue using this model now, enable AI Credit overages.',
    '若要立即继续使用此模型，请启用 AI 点数超额使用。'
  );
  sourceText = sourceText.replaceAll(
    'To continue using this model now, purchase more AI Credits.',
    '若要立即继续使用此模型，请购买更多 AI 点数。'
  );
  sourceText = sourceText.replace(
    'd||"See plans"',
    'd||"查看方案"'
  );
  sourceText = sourceText.replace(
    'b=`${f} ${b}`',
    'b=`${f} ${b?(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(b):b):""}`'
  );

  // -------------------------------------------------------------------------
  // 维护增强：动态问候语、配额重置倒计时、界面布局模式卡片与浏览器规则深度汉化
  // -------------------------------------------------------------------------

  // 1. 主界面问候语动态原生汉化（无论用户名称为何种变量，均优雅自然呈现）
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\[\{named:([a-zA-Z0-9_$]+)=>`Hi \$\{\2\}\.`,\s*unnamed:"Hi there\."\},\{named:([a-zA-Z0-9_$]+)=>`Hello, \$\{\3\}\.`,\s*unnamed:"Hello\."\},\{named:([a-zA-Z0-9_$]+)=>`Welcome back, \$\{\4\}\.`,\s*unnamed:"Welcome back\."\},\{named:([a-zA-Z0-9_$]+)=>`Good to see you, \$\{\5\}\.`,\s*unnamed:"Good to see you\."\}\];/,
    'const $1=[{named:$2=>`你好 ${$2}。`,unnamed:"你好。"},{named:$3=>`你好，${$3}。`,unnamed:"你好。"},{named:$4=>`欢迎回来，${$4}。`,unnamed:"欢迎回来。"},{named:$5=>`很高兴见到你，${$5}。`,unnamed:"很高兴见到你。"}];'
  );

  // 2. 配额重置时间与配额项原生汉化（杜绝周限额, resets in 3d 18h 等中英混杂）
  sourceText = sourceText.replace(
    /c=h<=0\?"Resets in <1m":`Resets in \$\{d>0\?f>0\?`\$\{d\}d \$\{f\}h`:`\$\{d\}d`:f>0\?g>0\?`\$\{f\}h \$\{g\}m`:`\$\{f\}h`:g>0\?`\$\{g\}m`:"<1m"\}`/g,
    'c=h<=0?"将在 1 分钟内重置":`将在 ${d>0?f>0?`${d} 天 ${f} 小时`:`${d} 天`:f>0?g>0?`${f} 小时 ${g} 分钟`:`${f} 小时`:g>0?`${g} 分钟`:"1 分钟内"}后重置`'
  );
  sourceText = sourceText.replace(
    /\bc=c&&a\.subtext\?`\$\{c\}, \$\{a\.subtext\[0\]\.toLowerCase\(\)\}\$\{a\.subtext\.slice\(1\)\}`:c\|\|a\.subtext\b/g,
    'c=c&&a.subtext?`${c}，${a.subtext}`:c||a.subtext'
  );
  sourceText = sourceText.replaceAll('"No quota information available."', '"暂无可用配额信息。"');

  // 3. 通用设置 -> 界面布局双卡片与模式描述原生汉化
  sourceText = sourceText.replaceAll('{title:"Interface Layout"}', '{title:"界面布局"}');
  sourceText = sourceText.replaceAll('"Interface Layout"', '"界面布局"');
  sourceText = sourceText.replaceAll(
    'var dj={project4k:{title:"Project 4K",description:"Project 4K interface without developer tooling."},default:{title:"Default",description:"The full developer experience."}};',
    'var dj={project4k:{title:"知识工作",description:"专为研究、写作与日常任务打造的精简界面。"},default:{title:"软件工程",description:"包含代码编写、开发工具及智能体管理的完整开发界面。"}}; '
  );
  sourceText = sourceText.replace(
    'label:c.project4k.title,description:c.project4k.description',
    'label:(({"Knowledge Work":"知识工作","Project 4K":"知识工作"}[c.project4k.title])||c.project4k.title),description:(({"Simplified interface for research, writing, and everyday tasks.":"专为研究、写作与日常任务打造的精简界面。","Project 4K interface without developer tooling.":"专为研究、写作与日常任务打造的精简界面。"}[c.project4k.description])||c.project4k.description)'
  );
  sourceText = sourceText.replace(
    'label:c.default.title,description:c.default.description',
    'label:(({"Software Engineering":"软件工程","Default":"软件工程"}[c.default.title])||c.default.title),description:(({"Full interface for coding, developer tools, and managing agents.":"包含代码编写、开发工具及智能体管理的完整开发界面。","The full developer experience.":"包含代码编写、开发工具及智能体管理的完整开发界面。"}[c.default.description])||c.default.description)'
  );

  // 4. 设置 -> 浏览器偏好设置与子智能体执行规则断句深度原生汉化
  sourceText = sourceText.replaceAll(
    '"Configure built-in browser, link opening, and browser subagent preferences."',
    '"配置内置浏览器、链接打开方式以及浏览器子智能体偏好设置。"'
  );
  sourceText = sourceText.replaceAll(
    '"Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed."',
    '"配置浏览器子智能体允许和拒绝访问的网址。该智能体运行于内置浏览器中，无需单独安装浏览器。"'
  );
  sourceText = sourceText.replaceAll(
    '"Configure allowed and denied URLs for the browser subagent (invoked with /browser). Requires"',
    '"配置浏览器子智能体（通过 /browser 调用）允许和拒绝访问的网址。需要安装并运行 "'
  );
  sourceText = sourceText.replaceAll('label:"Browser Actuation Rules"', 'label:"浏览器执行规则"');

  // 5. 查找栏（Find in page）结果计数、占位符与悬浮按钮原生汉化
  sourceText = sourceText.replace(
    'b===0?"No Results":`${a+1} of ${c!==void 0&&b>=c?`${c}+`:`${b}`}`',
    'b===0?"无结果":`第 ${a+1} 项，共 ${c!==void 0&&b>=c?`${c}+`:`${b}`} 项`'
  );
  sourceText = sourceText.replaceAll('"Match Case (Aa)"', '"区分大小写 (Aa)"');
  sourceText = sourceText.replaceAll('"Match Whole Word (ab)"', '"全字匹配 (ab)"');
  sourceText = sourceText.replaceAll('"Use Regular Expression (.*)"', '"使用正则表达式 (.*)"');
  sourceText = sourceText.replaceAll('"Previous Match"', '"上一个匹配项"');
  sourceText = sourceText.replaceAll('"Next Match"', '"下一个匹配项"');
  sourceText = sourceText.replaceAll('placeholder:"Find"', 'placeholder:"查找"');

  // 6. 跨版本与插件详情面板通用兜底标题映射
  sourceText = sourceText.replaceAll('title:"Commands"', 'title:"命令"');
  sourceText = sourceText.replaceAll('title:"Skills"', 'title:"技能"');
  sourceText = sourceText.replaceAll('title:"Agents"', 'title:"智能体"');
  sourceText = sourceText.replaceAll('title:"MCP servers"', 'title:"MCP 服务器"');
  sourceText = sourceText.replaceAll('title:"Rules"', 'title:"规则"');
  sourceText = sourceText.replaceAll('title:"Hooks"', 'title:"钩子"');
  sourceText = sourceText.replaceAll('title:"UI extensions"', 'title:"UI 扩展"');
  sourceText = sourceText.replaceAll('title:"Automations"', 'title:"自动化"');
  sourceText = sourceText.replaceAll('title:"Context Providers"', 'title:"上下文提供程序"');
  sourceText = sourceText.replaceAll('title:"Themes"', 'title:"主题"');
  sourceText = sourceText.replace(
    '"Also includes"," ",B.createElement("span",{onClick:se,className:"text-link hover:underline cursor-pointer font-medium"},"Global Permissions")," ","when working ",M,"."," "',
    '"同时包含在",M==="in these conversations"?"这些对话":M==="in this workspace"?"此工作区":"此项目","中生效的 ",B.createElement("span",{onClick:se,className:"text-link hover:underline cursor-pointer font-medium"},"全局权限"),"。 "'
  );

  
  
  // 9.8 插件市场详情页：V4 (UI 扩展/自动化描述)、ABc (侧边栏弹窗类型)、SAc (MCP 退出确认)、qBc (MCP 备注)
  sourceText = sourceText.replace('n=k.config?.description||(c==="sidecar"?n:void 0)||k.sidecarId;', 'n=k.config?.description||(c==="sidecar"?n:void 0)||k.sidecarId;n=(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(n):n);');
  sourceText = sourceText.replace('var m=BBc(k.sidecarId,k.config?.displayName)||(c==="extension"?`UI Extension ${l+1}`:`Automation ${l+1}`),', 'var m=BBc(k.sidecarId,k.config?.displayName)||(c==="extension"?`UI 扩展 ${l+1}`:`自动化 ${l+1}`);if(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__)m=globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(m);var ');

  // 安全注入 1：设置页技能项 DKb 调用点前置翻译 name 与 description（绝不修改 VS 组件内部避免破坏 Hook 声明导致白屏）
  sourceText = sourceText.replace(
    'const DKb=({item:a,onCopyPath:b,isLast:c,showBadge:d=!0})=>B.createElement(VS,{name:a.name,path:a.path,onCopyPath:b,description:a.description',
    'const DKb=({item:a,onCopyPath:b,isLast:c,showBadge:d=!0})=>B.createElement(VS,{name:(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(a.name):a.name),path:a.path,onCopyPath:b,description:(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(a.description):a.description)'
  );

  // 安全注入 2：作用域徽章 BKb 杜绝“全球”与“Workspace”
  sourceText = sourceText.replace(
    'const BKb=({isGlobal:a,workspaceName:b})=>B.createElement("span",{className:`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a?"bg-blue-500/10 text-blue-400":"bg-green-500/10 text-green-400"}`},a?"Global":b?b.length>15?b.substring(0,15)+"\\u2026":b:"Workspace");',
    'const BKb=({isGlobal:a,workspaceName:b})=>B.createElement("span",{className:`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a?"bg-blue-500/10 text-blue-400":"bg-green-500/10 text-green-400"}`},a?"全局":b?b.length>15?b.substring(0,15)+"\\u2026":b:"工作区");'
  );

  // 安全注入 3：主界面底部模型选择弹窗气泡中的配额说明
  sourceText = sourceText.replace(
    'B.createElement("span",null,b?.userTier?.upgradeSubscriptionText)',
    'B.createElement("span",null,(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(b?.userTier?.upgradeSubscriptionText):b?.userTier?.upgradeSubscriptionText))'
  );

  // 安全注入 4：账户设置页中的方案配额说明
  sourceText = sourceText.replace(
    'B.createElement("div",\n{className:"font-medium"},"Your Plan: ",l),description:m,rightElement:',
    'B.createElement("div",\n{className:"font-medium"},"Your Plan: ",l),description:(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(m):m),rightElement:'
  );

  // 安全注入 5：会话中配额耗尽黄色错误横幅
  sourceText = sourceText.replace(
    'l||p?d=B.createElement("span",null,f):(b=`${f} ${b}`',
    'l||p?d=B.createElement("span",null,f):(b=`${f} ${globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(b):b}`'
  );
  sourceText = sourceText.replace('D=f==="extension"||c.config?.hasWebUi?"UI Extension (SidePanel)":c.config?.mode?.case==="builtin"&&c.config?.mode?.value==="schedule"?"Scheduled Task":"Automation"', 'D=f==="extension"||c.config?.hasWebUi?"UI 扩展（侧面板）":c.config?.mode?.case==="builtin"&&c.config?.mode?.value==="schedule"?"计划任务":"自动化"');
  sourceText = sourceText.replace('window.confirm("Sign out of this server?")', 'window.confirm("确定要退出登录此服务器吗？")');
  sourceText = sourceText.replace('k=d?.get(f.serverName);', 'k=d?.get(f.serverName);if(k)k=(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(k):k);');

  // 9.10 跨版本 (2.31.0 / 2.32.2+) 混淆名自适应增强与 Gemini 4 新模型卡片、会话标题拦截
  // 首页问候语自适应 (R6 / S6)
  sourceText = sourceText.replace(
    '[{named:a=>`Hey ${a}, what should we build today?`,unnamed:"Hey there, what should we build today?"},{named:a=>`Welcome back, ${a}. Where should we pick up?`,unnamed:"Welcome back. Where should we pick up?"},{named:a=>`Good to see you, ${a}. What\'s next?`,unnamed:"Good to see you. What\'s next?"}]',
    '[{named:a=>`嘿 ${a}，今天想一起打造些什么？`,unnamed:"嘿，今天想一起打造些什么？"},{named:a=>`欢迎回来，${a}。我们从哪里继续？`,unnamed:"欢迎回来，我们从哪里继续？"},{named:a=>`很高兴见到你，${a}。接下来做什么？`,unnamed:"很高兴见到你，接下来做什么？"}]'
  );
  // 工作耗时与进度更新自适应 (Is / Ws)
  sourceText = sourceText.replace(
    /v=`\${v} \${v===1\?"update":"updates"}`;t=t>0\?`Worked for \${([a-zA-Z0-9_$]+)\(t\)} \\u00b7 \${v}`:v;/g,
    'v=`${v} 条进度更新`;t=t>0?`工作耗时 ${$1(t)} \\u00b7 ${v}`:v;'
  );
  // 插件详情头部、弹窗、标签栏、Markdown 渲染器、MCP 状态自适应 (LAc/VEc, K4/H5, RBc/gGc, Y4/T5, PBc/eGc, BBc/LFc)
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(\{name:a,titleId:b,logo:c,badges:d,subtitle:f,actions:g,description:h,layout:k="page"\}\)\{(?!var _h)/g,
    'function $1({name:a,titleId:b,logo:c,badges:d,subtitle:f,actions:g,description:h,layout:k="page"}){var _h=h&&(globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(h)||globalThis.__AGY_ZHCN_TRANSLATE__?.(h));if(_h)h=_h;'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(\{title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n\}\)\{(?!var _d)/g,
    'function $1({title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n}){var _d=d&&(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?.(d)??globalThis.__AGY_ZHCN_TRANSLATE__?.(d)??globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(d));if(_d)d=_d;var _f=f&&globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(f);if(_f)f=_f;'
  );
  sourceText = sourceText.replace(
    '[{id:"overview",label:"Overview"},{id:"accounts",label:"Accounts"},{id:"skills",label:"Skills"},{id:"mcp",label:"MCP"},{id:"agents",label:"Agents"},{id:"hooks",label:"Hooks"},{id:"rules",label:"Rules"},{id:"uiExtensions",label:"UI Extensions"},{id:"sidecars",label:"Automations"},{id:"context-providers",label:"Context Providers"}]',
    '[{id:"overview",label:"概览"},{id:"accounts",label:"账户"},{id:"skills",label:"技能"},{id:"mcp",label:"MCP"},{id:"agents",label:"智能体"},{id:"hooks",label:"钩子"},{id:"rules",label:"规则"},{id:"uiExtensions",label:"UI 扩展"},{id:"sidecars",label:"自动化"},{id:"context-providers",label:"上下文提供程序"}]'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(\{markdown:a,className:b,baseDirUri:c\}\)\{(?!a=globalThis)/g,
    'function $1({markdown:a,className:b,baseDirUri:c}){a=globalThis.__AGY_ZHCN_TRANSLATE_MD__?globalThis.__AGY_ZHCN_TRANSLATE_MD__(a):a;'
  );
  sourceText = sourceText.replace(
    '{starting:"Starting...",stopping:"Stopping...",disabled:"Disabled",idle:void 0}',
    '{starting:"正在启动...",stopping:"正在停止...",disabled:"已禁用",idle:void 0}'
  );
  sourceText = sourceText.replace(
    /var m=([a-zA-Z0-9_$]+)\(k\.sidecarId,k\.config\?\.displayName\)\|\|\(c==="extension"\?`UI Extension \${l\+1}`:`Automation \${l\+1}`\),/g,
    'var m=$1(k.sidecarId,k.config?.displayName)||(c==="extension"?`UI 扩展 ${l+1}`:`自动化 ${l+1}`);if(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__)m=globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(m);var '
  );
  // 设置页技能项与作用域徽章跨版本安全注入 (DKb/cNb, BKb/aNb，绝不修改 VS/KT 内部避免白屏)
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\(\{item:a,onCopyPath:b,isLast:c,showBadge:d=!0\}\)\s*=>\s*([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{name:a\.name,path:a\.path,onCopyPath:b,description:a\.description/g,
    'const $1=({item:a,onCopyPath:b,isLast:c,showBadge:d=!0})=>$2.createElement($3,{name:(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(a.name):a.name),path:a.path,onCopyPath:b,description:(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(a.description):a.description)'
  );
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\(\{isGlobal:a,workspaceName:b\}\)\s*=>\s*([A-Za-z_$][\w$]*)\.createElement\("span",\{className:`text-\[10px\] px-1\.5 py-0\.5 rounded shrink-0 \${a\?"bg-blue-500\/10 text-blue-400":"bg-green-500\/10 text-green-400"}`\},a\?"Global":b\?b\.length>15\?b\.substring\(0,15\)\+"\\u2026":b:"Workspace"\);/g,
    'const $1=({isGlobal:a,workspaceName:b})=>$2.createElement("span",{className:`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a?"bg-blue-500/10 text-blue-400":"bg-green-500/10 text-green-400"}`},a?"全局":b?b.length>15?b.substring(0,15)+"\\u2026":b:"工作区");'
  );
  // 账户/模型设置页方案配额说明跨版本注入（兼容 Your Plan / Your plan）
  sourceText = sourceText.replace(
    /"Your [Pp]lan: ",([a-zA-Z0-9_$]+)\),description:([a-zA-Z0-9_$]+),rightElement:/g,
    '"你的方案：",globalThis.__AGY_ZHCN_TRANSLATE_PLAN__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN__($1):$1),description:(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__($2):$2),rightElement:'
  );
  // 右下角 NUX 新模型发布卡片组件 (M_) 原生前置翻译
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\(\{nux:a,logEvent:b,handleDismissNux:c,bodyContent:d,primaryCtaText:f,onPrimaryClick:g,secondaryCtaText:h,onSecondaryClick:k,onClose:l\}\)\s*=>\s*\{/g,
    'var $1=({nux:a,logEvent:b,handleDismissNux:c,bodyContent:d,primaryCtaText:f,onPrimaryClick:g,secondaryCtaText:h,onSecondaryClick:k,onClose:l})=>{if(a){var _nt=a.title&&(globalThis.__AGY_ZHCN_TRANSLATE__?.(a.title)||a.title),_nb=a.body&&(globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__?.(a.body)||globalThis.__AGY_ZHCN_TRANSLATE__?.(a.body)||a.body);if(_nt!==a.title||_nb!==a.body)a={...a,title:_nt,body:_nb};}if(typeof d==="string")d=globalThis.__AGY_ZHCN_TRANSLATE_MODEL_DESC__?.(d)||globalThis.__AGY_ZHCN_TRANSLATE__?.(d)||d;'
  );
  // 会话标题提取函数 (ct / vt) 纯英文标题自动中文化拦截
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{return a\?\.annotations\?\.title\?\.trim\(\)\|\|a\?\.summary\?\.trim\(\)\|\|void 0\}/g,
    'function $1(a){var _t=a?.annotations?.title?.trim()||a?.summary?.trim()||void 0;return _t&&!/[\\u4e00-\\u9fff]/.test(_t)&&(globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__?.(_t)||globalThis.__AGY_ZHCN_TRANSLATE__?.(_t))||_t}'
  );

  // =========================================================================
  // 9.11 Antigravity 2.32.2+ 全量动态变量、权限预设与深层设置组件跨版本自适应根治
  // =========================================================================

  // [核心修复 1] 设置 -> 项目 -> 危险区域：“此项目由 Swarm 自动化统一管理，只能通过删除该自动化来删除。”
  sourceText = fastAnchorReplace(
    sourceText,
    '" is managed by the"',
    /([a-zA-Z0-9_$]+)\?([A-Za-z_$][\w$]*)\.createElement\("span",[\s\r\n]*null,"This ",([a-zA-Z0-9_$]+)\.lowercase," is managed by the",[\s\r\n]*" ",\2\.createElement\("strong",null,([a-zA-Z0-9_$]+)\)," automation and can only be deleted by deleting that automation\."\):/g,
    '$1?$2.createElement("span",null,"此",$3.lowercase==="workspace"?"工作区":"项目","由 ",$2.createElement("strong",null,$4)," 自动化统一管理，只能通过删除该自动化来删除。"):'
  );

  // [核心修复 2] 设置 -> 项目 -> 权限设置副标题（兼容 A/B/E 任意 React 变量名）
  sourceText = sourceText.replace(
    /"Also includes",\s*" ",\s*([A-Za-z_$][\w$]*)\.createElement\("span",\{onClick:([a-zA-Z0-9_$]+),className:"text-link hover:underline cursor-pointer font-medium"\},"Global Permissions"\),\s*" ",\s*"when working ",\s*([a-zA-Z0-9_$]+),\s*"\.",\s*" "/g,
    '"同时包含在",$3==="in these conversations"?"这些对话":$3==="in this workspace"?"此工作区":"此项目","中生效的 ",$1.createElement("span",{onClick:$2,className:"text-link hover:underline cursor-pointer font-medium"},"全局权限"),"。 "'
  );
  sourceText = sourceText.replaceAll(
    'target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},"Learn more"),"."',
    'target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},"了解更多"),"。"'
  );
  sourceText = sourceText.replaceAll(
    'target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},\n"Learn more"),"."',
    'target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},\n"了解更多"),"。"'
  );
  sourceText = sourceText.replace(
    /"This project was created for",\s*" ",\s*([a-zA-Z0-9_$]+)\?([A-Za-z_$][\w$]*)\.createElement\(\2\.Fragment,null,"the ",\2\.createElement\("strong",null,\1\)\):"an",\s*" ",\s*"automation\. "/g,
    '"此项目专为 ",$1?$2.createElement($2.Fragment,null,"“",$2.createElement("strong",null,$1),"”"):"某项"," 自动化创建。"'
  );

  // [核心修复 3] 权限预设 (AB / jC)、安全预设 (ZS / OT)、界面布局 (kj / sj)、向导卡片 (yPc / zUc)、设置搜索映射 (EBb / ZDb / TOb) 跨版本自适应
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\{request_review:\{label:"Request Review",description:"Every command requires approval\.",prefValues:\{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:([A-Za-z_$][\w$]*)\.CascadeCommandsAutoExecution\.OFF,nonWorkspaceFileAccessPolicy:\2\.AgentSettingPolicy\.ASK,permissionPreset:\2\.AgentPermissionPreset\.REQUEST_REVIEW\}\},"default":\{label:"Default",description:"Ask before sensitive operations\.",prefValues:\{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:\2\.CascadeCommandsAutoExecution\.PROCEED_IN_SANDBOX,nonWorkspaceFileAccessPolicy:\2\.AgentSettingPolicy\.ASK,\s*permissionPreset:\2\.AgentPermissionPreset\.DEFAULT\}\},auto:\{label:"Auto",description:"Automatically decide if commands run\.",prefValues:\{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:\2\.CascadeCommandsAutoExecution\.AUTO,nonWorkspaceFileAccessPolicy:\2\.AgentSettingPolicy\.ASK,permissionPreset:\2\.AgentPermissionPreset\.AUTO\}\},turbo:\{label:"Turbo",description:"Run all commands without restrictions\.",prefValues:\{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:\2\.CascadeCommandsAutoExecution\.EAGER,nonWorkspaceFileAccessPolicy:\2\.AgentSettingPolicy\.ALLOW,\s*permissionPreset:\2\.AgentPermissionPreset\.TURBO\}\}\}/g,
    'var $1={request_review:{label:"请求审核",description:"每条命令均需人工批准。",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:$2.CascadeCommandsAutoExecution.OFF,nonWorkspaceFileAccessPolicy:$2.AgentSettingPolicy.ASK,permissionPreset:$2.AgentPermissionPreset.REQUEST_REVIEW}},"default":{label:"默认",description:"敏感操作前向你询问确认。",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:$2.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX,nonWorkspaceFileAccessPolicy:$2.AgentSettingPolicy.ASK,permissionPreset:$2.AgentPermissionPreset.DEFAULT}},auto:{label:"自动",description:"自动判断是否运行命令。",prefValues:{enableTerminalSandbox:!0,cascadeAutoExecutionPolicy:$2.CascadeCommandsAutoExecution.AUTO,nonWorkspaceFileAccessPolicy:$2.AgentSettingPolicy.ASK,permissionPreset:$2.AgentPermissionPreset.AUTO}},turbo:{label:"极速",description:"无限制直接运行所有命令。",prefValues:{enableTerminalSandbox:!1,cascadeAutoExecutionPolicy:$2.CascadeCommandsAutoExecution.EAGER,nonWorkspaceFileAccessPolicy:$2.AgentSettingPolicy.ALLOW,permissionPreset:$2.AgentPermissionPreset.TURBO}}}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '{macos_linux:{default_unix:',
    /([a-zA-Z0-9_$]+)=\{macos_linux:\{default_unix:\{displayName:"Default",shortDisplayName:"Default",shortDescription:"Requires manual review for all terminal commands and file accesses outside of the working folders\.",\s*longDescription:"Useful for typical development with an emphasis on security\. It prioritizes safety over speed by requiring manual approval for all terminal commands and files outside the project directory\.",iconName:"shield_lock"\},full_machine_unix:\{displayName:"Full machine",shortDisplayName:"Machine",shortDescription:"All terminal commands require review\. The agent can read or write to any file in the machine\.",longDescription:"Useful for tasks that require file access across your full machine\. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running\.",\s*iconName:"laptop_shield"\},unrestricted_unix:\{displayName:"Turbo mode",shortDisplayName:"Turbo",shortDescription:"Disables all safety barriers for maximal iteration velocity\.",longDescription:"A high-risk mode that disables all safety barriers\. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts\.",iconName:"gpp_maybe"\}\},windows:\{default_windows:\{displayName:"Default",shortDisplayName:"Default",shortDescription:"Requires manual review for all terminal commands and file accesses outside of the working folders\.",\s*longDescription:"Useful for typical development with an emphasis on security\. It prioritizes safety over speed by requiring manual approval for all terminal commands and files outside the project directory\.",iconName:"shield_lock"\},full_machine_windows:\{displayName:"Full machine",shortDisplayName:"Machine",shortDescription:"All terminal commands require review\. The agent can read or write to any file in the machine\.",longDescription:"Useful for tasks that require file access across your full machine\. The agent has full read and write access to all local files, but all proposed terminal commands require manual review and approval before running\.",\s*iconName:"laptop_shield"\},unrestricted_windows:\{displayName:"Turbo mode",shortDisplayName:"Turbo",shortDescription:"Disables all safety barriers for maximal iteration velocity\.",longDescription:"A high-risk mode that disables all safety barriers\. The agent operates with full system access, auto-executes all terminal commands, and reads or writes to all local files without review prompts\.",iconName:"gpp_maybe"\}\}\}/g,
    '$1={macos_linux:{default_unix:{displayName:"默认",shortDisplayName:"默认",shortDescription:"所有终端命令及工作目录外的文件访问均需人工审核。",longDescription:"适合注重安全性的日常开发。通过要求对所有终端命令与项目目录外的文件访问进行人工确认，优先保障安全。",iconName:"shield_lock"},full_machine_unix:{displayName:"全机模式",shortDisplayName:"整机",shortDescription:"所有终端命令均需审核；智能体可读写本机任意文件。",longDescription:"适合需要跨整个系统访问文件的任务。智能体拥有所有本地文件的完整读写权限，但所有终端命令在运行前均需人工审核批准。",iconName:"laptop_shield"},unrestricted_unix:{displayName:"极速模式",shortDisplayName:"极速",shortDescription:"禁用全部安全防护以获得最快迭代速度。",longDescription:"此高风险模式将关闭所有安全护栏。智能体拥有完整系统访问权限，会自动执行全部终端命令并读写所有本地文件，不再弹窗确认。",iconName:"gpp_maybe"}},windows:{default_windows:{displayName:"默认",shortDisplayName:"默认",shortDescription:"所有终端命令及工作目录外的文件访问均需人工审核。",longDescription:"适合注重安全性的日常开发。通过要求对所有终端命令与项目目录外的文件访问进行人工确认，优先保障安全。",iconName:"shield_lock"},full_machine_windows:{displayName:"全机模式",shortDisplayName:"整机",shortDescription:"所有终端命令均需审核；智能体可读写本机任意文件。",longDescription:"适合需要跨整个系统访问文件的任务。智能体拥有所有本地文件的完整读写权限，但所有终端命令在运行前均需人工审核批准。",iconName:"laptop_shield"},unrestricted_windows:{displayName:"极速模式",shortDisplayName:"极速",shortDescription:"禁用全部安全防护以获得最快迭代速度。",longDescription:"此高风险模式将关闭所有安全护栏。智能体拥有完整系统访问权限，会自动执行全部终端命令并读写所有本地文件，不再弹窗确认。",iconName:"gpp_maybe"}}}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '{project4k:{title:"Project 4K"',
    /([a-zA-Z0-9_$]+)=\{project4k:\{title:"Project 4K",description:"Project 4K interface without developer tooling\."\},default:\{title:"Default",description:"The full developer experience\."\}\};/g,
    '$1={project4k:{title:"知识工作",description:"专为研究、写作与日常任务打造的精简界面。"},default:{title:"软件工程",description:"包含代码编写、开发工具及智能体管理的完整开发界面。"}};'
  );
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\[\{id:"build",icon:"code_blocks",title:"Build new features",description:"Hand off a feature and come back to working code\."\},\{id:"fix",icon:"bug_report",title:"Debug and fix",description:"Automatically reproduce bugs, trace causes, test fixes\."\},\{id:"research",icon:"lightbulb_2",title:"Research anything",description:"Ask about your code or any topic, get clear answers\."\},\{id:"write",icon:"edit",title:"Write and edit docs",description:"Draft documents, emails, and notes that sound like you\."\}\];/g,
    'const $1=[{id:"build",icon:"code_blocks",title:"构建新功能",description:"把功能需求交出去，回来直接获得可用代码。"},{id:"fix",icon:"bug_report",title:"调试与修复",description:"自动复现缺陷、追踪根因并测试修复方案。"},{id:"research",icon:"lightbulb_2",title:"调研任何技术问题",description:"就代码或任何主题提问，获取清晰明确的解答。"},{id:"write",icon:"edit",title:"编写与编辑文档",description:"撰写契合你表达风格的文档、邮件与笔记。"}];'
  );
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\[\{id:"global",label:"Global"\},\{id:"us",label:"United States"\},\{id:"eu",label:"Europe"\}\];/g,
    'var $1=[{id:"global",label:"全球"},{id:"us",label:"美国"},{id:"eu",label:"欧洲"}];'
  );
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=\[\{value:([A-Za-z_$][\w$]*)\.ArtifactReviewMode\.TURBO,label:"Always Proceed",description:"Agent never asks for review\. This maximizes the autonomy of the Agent, but also has the highest risk of the Agent operating over unsafe or injected Artifact content\."\},\{value:\2\.ArtifactReviewMode\.ALWAYS,label:"Always Ask",description:"Agent always asks for review\."\}\];/g,
    'var $1=[{value:$2.ArtifactReviewMode.TURBO,label:"始终继续",description:"智能体始终不会请求人工评审。这可最大限度提高智能体自主性，但也具有执行不安全或注入工件内容的最高风险。"},{value:$2.ArtifactReviewMode.ALWAYS,label:"始终询问",description:"智能体每次都会请求你进行评审。"}];'
  );
  sourceText = sourceText.replace(
    /var ([a-zA-Z0-9_$]+)=new Map\(\[\["Appearance",\{sections:\[\{title:"Chat",settings:\["verboseConversationSteps"\]\},\{title:"Chat Layout",settings:\["themeMode","conversationWidth","artifactWidth","contextUsageIndicatorEnabled"\]\},\{title:"Terminal",settings:\["terminalPlacement"\]\},\{title:"Accessibility",settings:\["customContextMenusEnabled","screenReaderMode"\]\}\]\}\],\["General",\{sections:\[\{title:"Execution",settings:\["queuedMessageDeliveryStrategy"\]\},\{title:"Chat Input",settings:\["enterToSendOnMobile"\]\}\]\}\],\["Browser",\{sections:\[\{title:"General",\s*settings:\["defaultLinkOpenTarget","agentBrowserTools","browserJsExecutionPolicy"\]\}\]\}\],\["Account",\{sections:\[\{title:"General",settings:\["disableCodeSnippetTelemetry"\]\}\]\}\],\["Models",\{sections:\[\{title:"Quota",settings:\["useAICredits"\]\}\]\}\],\["Customizations",\{sections:\[\{title:"Default Customizations",settings:\["includeJetskiDefaultCustomizations"\]\},\{title:"Customize Global Skills",settings:\["antigravity\.customization\.skills"\]\},\{title:"Custom Agents",settings:\["antigravity\.customization\.customAgents"\]\},\s*\{title:"MCP Servers",settings:\["antigravity\.customization\.mcp"\]\}\]\}\],\["Notifications",\{sections:\[\{title:"General",settings:\["enableNotificationsForSpecialEvents","enableSoundsForSpecialEvents"\]\}\]\}\],\["App",\{sections:\[\{title:"General",settings:\["keepComputerAwake","runInBackground"\]\},\{title:"Updater",settings:\["autoCheckForUpdates"\]\}\]\}\],\["Jetski Chat",\{sections:\[\]\}\],\["Developer",\{sections:\[\]\}\]\]\);/g,
    'var $1=new Map([["Appearance",{sections:[{title:"对话",settings:["verboseConversationSteps"]},{title:"对话布局",settings:["themeMode","conversationWidth","artifactWidth","contextUsageIndicatorEnabled"]},{title:"终端",settings:["terminalPlacement"]},{title:"辅助功能",settings:["customContextMenusEnabled","screenReaderMode"]}]}],["General",{sections:[{title:"消息执行",settings:["queuedMessageDeliveryStrategy"]},{title:"对话输入",settings:["enterToSendOnMobile"]}]}],["Browser",{sections:[{title:"通用",settings:["defaultLinkOpenTarget","agentBrowserTools","browserJsExecutionPolicy"]}]}],["Account",{sections:[{title:"通用",settings:["disableCodeSnippetTelemetry"]}]}],["Models",{sections:[{title:"配额",settings:["useAICredits"]}]}],["Customizations",{sections:[{title:"默认自定义项",settings:["includeJetskiDefaultCustomizations"]},{title:"自定义全局技能",settings:["antigravity.customization.skills"]},{title:"自定义智能体",settings:["antigravity.customization.customAgents"]},{title:"MCP 服务器",settings:["antigravity.customization.mcp"]}]}],["Notifications",{sections:[{title:"通用",settings:["enableNotificationsForSpecialEvents","enableSoundsForSpecialEvents"]}]}],["App",{sections:[{title:"通用",settings:["keepComputerAwake","runInBackground"]},{title:"自动更新",settings:["autoCheckForUpdates"]}]}],["Jetski Chat",{sections:[]}],["Developer",{sections:[]}]]);'
  );

  // [核心修复 4] 权限与安全预设下拉框选项、继承全局说明、工具权限列表行跨版本正则替换
  sourceText = fastAnchorReplace(
    sourceText,
    '==="use_global"?',
    /([a-zA-Z0-9_$]+)==="use_global"\?\s*"Inherit Global":\1==="custom"\?"Custom":([a-zA-Z0-9_$]+)\[([a-zA-Z0-9_$]+)\]\[\1\]\?\.displayName\?\?\s*"Custom"/g,
    '$1==="use_global"?"继承全局":$1==="custom"?"自定义":$2[$3][$1]?.displayName??"自定义"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Inherits your Global Permissions when working ',
    /([a-zA-Z0-9_$]+)==="use_global"\?`Inherits your Global Permissions when working \$\{([a-zA-Z0-9_$]+)\}\.`:\1==="custom"\?"Manually customize individual settings\.":([a-zA-Z0-9_$]+)\[([a-zA-Z0-9_$]+)\]\[\1\]\?\.(longDescription|shortDescription)/g,
    '$1==="use_global"?`在${$2==="in these conversations"?"这些对话":$2==="in this workspace"?"此工作区":"此项目"}中工作时继承全局权限。`:$1==="custom"?"手动自定义各项设置。":$3[$4][$1]?.$5'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '!=="use_global"&&',
    /([a-zA-Z0-9_$]+)!=="use_global"&&\1\?([a-zA-Z0-9_$]+)\[([a-zA-Z0-9_$]+)\(\1\)\]\?\.label\?\?\1:"Inherit Global"/g,
    '$1!=="use_global"&&$1?$2[$3($1)]?.label??$1:"继承全局"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '==="use_global"?',
    /([a-zA-Z0-9_$]+)==="use_global"\?\s*"Inherit Global":([a-zA-Z0-9_$]+)\[\1\]\?\.label\?\?\1/g,
    '$1==="use_global"?"继承全局":$2[$1]?.label??$1'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Inherits your Global Permissions when working ',
    /([a-zA-Z0-9_$]+)==="use_global"\?`Inherits your Global Permissions when working \$\{([a-zA-Z0-9_$]+)\}\.`:([a-zA-Z0-9_$]+)\[\1\]\?\.description\?\?""/g,
    '$1==="use_global"?`在${$2==="in these conversations"?"这些对话":$2==="in this workspace"?"此工作区":"此项目"}中工作时继承全局权限。`:$3[$1]?.description??""'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.AgentSettingPolicy.ALLOW?',
    /\?"Inherit Global":([a-zA-Z0-9_$]+)===([A-Za-z_$][\w$]*)\.AgentSettingPolicy\.ALLOW\?\s*"Allow":\1===\2\.AgentSettingPolicy\.DENY\?"Deny":"Always Ask"/g,
    '?"继承全局":$1===$2.AgentSettingPolicy.ALLOW?"允许":$1===$2.AgentSettingPolicy.DENY?"拒绝":"始终询问"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Inherit Global":',
    /\?"Inherit Global":([a-zA-Z0-9_$]+)\(/g,
    '?"继承全局":$1('
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.CascadeCommandsAutoExecution.EAGER?',
    /\?"Inherit Global":([a-zA-Z0-9_$]+)===([A-Za-z_$][\w$]*)\.CascadeCommandsAutoExecution\.EAGER\?\s*"Always Proceed":\1===\2\.CascadeCommandsAutoExecution\.PROCEED_IN_SANDBOX\?"Proceed in Sandbox":"Require Review"/g,
    '?"继承全局":$1===$2.CascadeCommandsAutoExecution.EAGER?"始终自动执行":$1===$2.CascadeCommandsAutoExecution.PROCEED_IN_SANDBOX?"沙箱内自动执行":"需要审核"'
  );
  sourceText = sourceText.replace(
    /"Enabled":([a-zA-Z0-9_$]+)===void 0\?"Inherit Global":\s*\1\?"Enabled":"Disabled":"Disabled"/g,
    '"已启用":$1===void 0?"继承全局":$1?"已启用":"已禁用":"已禁用"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '===void 0?"Inherit Global":',
    /([a-zA-Z0-9_$]+)===void 0\?"Inherit Global":[\s\r\n]*\1===!0\?"Enabled":"Disabled"/g,
    '$1===void 0?"继承全局":$1===!0?"已启用":"已禁用"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '==="use_global"?"Inherit Global":',
    /([a-zA-Z0-9_$]+)==="use_global"\?"Inherit Global":[\s\r\n]*\1==="turbo"\?"Always Proceed":"Always Ask"/g,
    '$1==="use_global"?"继承全局":$1==="turbo"?"始终继续":"始终询问"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Restricts agent tools to a secure, isolated local sandbox."',
    /label:"Enable [Ss]andbox [Mm]ode",\s*labelId:([a-zA-Z0-9_$]+),\s*description:"Restricts agent tools to a secure, isolated local sandbox\."/g,
    'label:"启用沙箱模式",labelId:$1,description:"将智能体工具限制在安全隔离的本地沙箱中运行。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Restricts agent tools to a secure, isolated local sandbox."',
    /label:"Enable [Ss]andbox [Mm]ode",\s*description:"Restricts agent tools to a secure, isolated local sandbox\."/g,
    'label:"启用沙箱模式",description:"将智能体工具限制在安全隔离的本地沙箱中运行。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Controls whether terminal commands require your approval before running."',
    /label:"Terminal [Cc]ommand [Aa]uto [Ee]xecution",\s*description:"Controls whether terminal commands require your approval before running\."/g,
    'label:"终端命令自动执行",description:"控制终端命令运行前是否需要你的确认批准。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allow/deny agent read access to specific files or directories."',
    /label:"File [Rr]eads",\s*description:"Allow\/deny agent read access to specific files or directories\."/g,
    'label:"文件读取",description:"允许或拒绝智能体读取指定文件或目录。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allow/deny agent write access to specific files or directories."',
    /label:"File [Ww]rites",\s*description:"Allow\/deny agent write access to specific files or directories\."/g,
    'label:"文件写入",description:"允许或拒绝智能体写入指定文件或目录。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allow/deny agent read access to specific URLs or domains."',
    /label:"Read URLs",\s*description:"Allow\/deny agent read access to specific URLs or domains\."/g,
    'label:"读取网址",description:"允许或拒绝智能体读取指定网址或域名。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allow/deny specific terminal commands."',
    /label:"Terminal [Cc]ommands",\s*description:"Allow\/deny specific terminal commands\."/g,
    'label:"终端命令",description:"允许或拒绝执行指定的终端命令。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allow/deny agent command execution outside the sandbox."',
    /label:"Commands [Oo]utside [Ss]andbox",\s*description:"Allow\/deny agent command execution outside the sandbox\."/g,
    'label:"沙箱外命令",description:"允许或拒绝智能体在沙箱外执行命令。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"MCP ',
    /label:"MCP [Tt]ools",\s*description:"(?:External tools the agent can call via Model Context Protocol\.|智能体可通过模型上下文协议 \(MCP\) 调用的外部工具。)"/g,
    'label:"MCP 工具",description:"智能体可通过模型上下文协议 (MCP) 调用的外部工具。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'placeholder:"Enter tool name or server..."',
    /placeholder:"Enter tool name or server\.\.\."/g,
    'placeholder:"输入工具或服务器名称..."'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'id:"local",label:"This Computer"',
    /\[\{id:"local",label:"This Computer"\},[\s\r\n]*\{id:"cloud",label:"Remote"\}\]/g,
    '[{id:"local",label:"本机"},{id:"cloud",label:"远程"}]'
  );
  const permissionRowDefs = [
    ['File [Aa]ccess [Rr]ules', '文件访问规则', 'Configure allowed and denied paths for file reads and writes\\.', '配置允许或拒绝文件读写的路径。', 'file'],
    ['Network [Aa]ccess [Rr]ules', '网络访问规则', 'Configure allowed and denied URLs for reading\\.', '配置允许或拒绝读取的网址。', 'network'],
    ['Terminal [Cc]ommands', '终端命令', 'Configure allowed terminal commands\\.', '配置允许执行的终端命令。', 'command'],
    ['Commands [Oo]utside [Ss]andbox', '沙箱外命令', 'Configure allowed commands outside the sandbox\\.', '配置允许在沙箱外执行的命令。', 'unsandboxed'],
    ['MCP [Tt]ools', 'MCP 工具', '(?:Configure external tools via Model Context Protocol\\.|通过模型上下文协议 \\(MCP\\) 配置外部工具。)', '通过模型上下文协议 (MCP) 配置外部工具。', 'mcp'],
    ['Plugin [Pp]ermissions', '插件权限', 'Changes plugins can make without asking\\.', '插件无需询问即可做出的更改。', 'plugins'],
  ];
  for (const [enLabel, zhLabel, enDesc, zhDesc, tabName] of permissionRowDefs) {
    sourceText = fastAnchorReplace(
      sourceText,
      `("${tabName}")`,
      new RegExp(
        `((?:"data-testid":"[^"]+",\\s*)?)label:"${enLabel}",\\s*badge:([a-zA-Z0-9_$]+)>0\\?\\2:void 0,\\s*description:"${enDesc}",\\s*rightElement:([A-Za-z_$][\\w$]*)\\.createElement\\(([a-zA-Z0-9_$]+),\\{\\s*variant:"secondary",\\s*size:"sm",\\s*onClick:\\(\\)\\s*=>\\s*\\{([a-zA-Z0-9_$]+)\\("${tabName}"\\)\\}\\s*\\},\\s*"Open"\\)`,
        'g'
      ),
      `$1label:"${zhLabel}",badge:$2>0?$2:void 0,description:"${zhDesc}",rightElement:$3.createElement($4,{variant:"secondary",size:"sm",onClick:()=>{$5("${tabName}")}},"打开")`
    );
  }
  sourceText = fastAnchorReplace(
    sourceText,
    '("github")',
    /label:"GitHub",\s*description:"Configure GitHub access policies\.",\s*rightElement:([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{\s*variant:"secondary",\s*size:"sm",\s*onClick:\(\)\s*=>\s*\{([a-zA-Z0-9_$]+)\("github"\)\}\s*\},\s*"Open"\)/g,
    'label:"GitHub",description:"配置 GitHub 访问策略。",rightElement:$1.createElement($2,{variant:"secondary",size:"sm",onClick:()=>{$3("github")}},"打开")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Modify permissions for file, terminal, and MCP tools."',
    /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)\?"Modify permissions for file, terminal, and MCP tools\.":"Modify permissions for file and terminal tools\."/g,
    '$1=$2?"修改文件、终端和 MCP 工具的相关权限。":"修改文件和终端工具的相关权限。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '("tools")',
    /((?:"data-testid":"tool-permissions-row",\s*)?)label:"Tool [Pp]ermissions",\s*badge:([a-zA-Z0-9_$]+)>0\?\2:void 0,\s*description:([a-zA-Z0-9_$]+),\s*rightElement:([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{\s*variant:"secondary",\s*size:"md",\s*onClick:\(\)\s*=>\s*\{([a-zA-Z0-9_$]+)\("tools"\)\}\s*\},\s*"Open"\)/g,
    '$1label:"工具权限",badge:$2>0?$2:void 0,description:$3,rightElement:$4.createElement($5,{variant:"secondary",size:"md",onClick:()=>{$6("tools")}},"打开")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Tool ',
    /\{title:"Tool [Pp]ermissions",description:([a-zA-Z0-9_$]+)/g,
    '{title:"工具权限",description:$1'
  );
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"Plugin [Pp]ermissions",onBack:/g, '{title:"插件权限",onBack:');
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"File [Pp]ermissions",onBack:/g, '{title:"文件权限",onBack:');
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"Network [Pp]ermissions",onBack:/g, '{title:"网络权限",onBack:');
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"Terminal [Cc]ommands",onBack:/g, '{title:"终端命令",onBack:');
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"Commands [Oo]utside [Ss]andbox",onBack:/g, '{title:"沙箱外命令",onBack:');
  sourceText = fastAnchorReplace(sourceText, 'onBack:', /\{title:"MCP [Tt]ools",onBack:/g, '{title:"MCP 工具",onBack:');

  // [核心修复 5] 设置区块标题组件 (VP / bV) 与设置行组件 (UP / aV) 跨版本通用替换（兼容 A/B/E 任意 React 变量名与大小写）
  const staticBlockTitles = [
    ['Danger Zone', '危险区域'],
    ['Agent Behavior', '智能体行为'],
    ['Permission Settings', '权限设置'],
    ['Permission Details', '权限详情'],
    ['Network Permissions', '网络权限'],
    ['Terminal & Tooling Permissions', '终端与工具权限'],
    ['Default Customizations', '默认自定义项'],
    ['Token Usage', 'Token 用量'],
    ['Sound', '声音'],
    ['Remote Agents Data', '远程智能体数据'],
    ['Installed MCP Servers', '已安装的 MCP 服务器'],
    ['Orchestrator Settings', 'Orchestrator 设置'],
  ];
  for (const [enTitle, zhTitle] of staticBlockTitles) {
    sourceText = fastAnchorReplace(
      sourceText,
      `title:"${enTitle}"`,
      new RegExp(`([A-Za-z_$][\\w$]*)\\.createElement\\(([a-zA-Z0-9_$]+),\\{title:"${enTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `$1.createElement($2,{title:"${zhTitle}"`
    );
  }
  sourceText = fastAnchorReplace(sourceText, '"Global Permissions":"Agent Settings"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:([a-zA-Z0-9_$]+)\?"Global Permissions":"Agent Settings"\}/g, '$1.createElement($2,{title:$3?"全局权限":"智能体设置"}');
  sourceText = fastAnchorReplace(sourceText, '"Permissions":"Global Permissions"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:([a-zA-Z0-9_$]+)\?"Permissions":"Global Permissions"/g, '$1.createElement($2,{title:$3?"权限":"全局权限"');
  sourceText = fastAnchorReplace(sourceText, 'title:"Local Permissions",subtitle:', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Local Permissions",subtitle:([a-zA-Z0-9_$]+)\}/g, '$1.createElement($2,{title:"本地权限",subtitle:$3}');
  sourceText = sourceText.replace(/label:([a-zA-Z0-9_$]+)\?"This [Cc]omputer":"Permission [Pp]reset"/g, 'label:$1?"本地电脑":"权限预设"');
  sourceText = sourceText.replace(/label:"Security [Pp]reset"/g, 'label:"安全预设"');
  sourceText = sourceText.replace(/label:"Permission [Pp]reset"/g, 'label:"权限预设"');
  sourceText = sourceText.replace(/label:"Include Jetski [Dd]efault [Cc]ustomizations",\s*description:"(?:When enabled, the agent will include default customizations, including default skills\.|Include default customizations, such as default skills\.)"/g, 'label:"包含系统默认定制项",description:"包含默认定制项，例如内置默认技能。"');
  sourceText = fastAnchorReplace(sourceText, 'emote ', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{label:"Delete [Aa]ll [Rr]emote [Aa]gents [Dd]ata"/g, '$1.createElement($2,{label:"删除所有远程智能体数据"');
  sourceText = fastAnchorReplace(sourceText, 'title:"Browser Subagent"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Browser Subagent",\s*subtitle:([a-zA-Z0-9_$]+)\?"The browser subagent has been disabled by your administrator\. Contact your administrator to enable browser use\.":/g, '$1.createElement($2,{title:"浏览器子智能体",subtitle:$3?"你的管理员已禁用浏览器子智能体。请联系管理员以启用浏览器功能。":');
  sourceText = sourceText.replace(/title:"Refresh MCP servers",\s*"aria-label":"Refresh MCP servers"/g, 'title:"刷新 MCP 服务器","aria-label":"刷新 MCP 服务器"');
  sourceText = fastAnchorReplace(
    sourceText,
    'Configure default behaviors, skills, and MCP servers.',
    /title:"Customizations",description:([A-Za-z_$][\w$]*)\.createElement\("span",null,"Configure default behaviors, skills, and MCP servers\.",([a-zA-Z0-9_$]+)\?\.docsCustomizations&&\s*\1\.createElement\(\1\.Fragment,null," ",\1\.createElement\("a",\{href:\2\.docsCustomizations,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"\},\s*"Learn more"\),"\."\)\)/g,
    'title:"插件",description:$1.createElement("span",null,"配置默认行为、技能与 MCP 服务器。",$2?.docsCustomizations&&$1.createElement($1.Fragment,null," ",$1.createElement("a",{href:$2.docsCustomizations,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"了解更多"),"。"))'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Browse and enable plugins from the Build With Google catalog.',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Plugins"\},\1\.createElement\(([a-zA-Z0-9_$]+),null,\1\.createElement\(([a-zA-Z0-9_$]+),\{label:"Build With Google plugins",description:"Browse and enable plugins from the Build With Google catalog\."/g,
    '$1.createElement($2,{title:"官方插件"},$1.createElement($3,null,$1.createElement($4,{label:"与 Google 共建插件",description:"从“与 Google 共建”目录中浏览并启用插件。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Configure agent execution, queued message delivery, and permissions.',
    /title:"General",description:"Configure agent execution, queued message delivery, and permissions\."/g,
    'title:"通用",description:"配置智能体执行、消息排队发送和权限。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Interface Layout"',
    /title:"Interface Layout"/g,
    'title:"界面布局"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Configure the agent\'s visual theme and display preferences.',
    /title:"Appearance",description:"Configure the agent's visual theme and display preferences\."/g,
    'title:"外观",description:"配置智能体的视觉主题与显示偏好设置。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    ' app settings.`',
    /title:"Application",description:`Manage \$\{([a-zA-Z0-9_$]+)\} app settings\.`/g,
    'title:"应用",description:`管理 ${$1} 应用设置。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Advanced Settings"',
    /label:"Advanced Settings"/g,
    'label:"高级设置"'
  );
  // 2.35.1+ Settings sections Map (TOb)
  sourceText = fastAnchorReplace(
    sourceText,
    'settings:["queuedMessageDeliveryStrategy","sendMessageShortcut","enterToSendOnMobile"]',
    /var ([a-zA-Z0-9_$]+)=new Map\(\[\["Appearance",\{sections:\[\{title:"Chat",settings:\["verboseConversationSteps"\]\},\{title:"Chat Layout",advanced:!0,settings:\["conversationWidth","artifactWidth","contextUsageIndicatorEnabled"\]\},\{title:"Terminal",advanced:!0,settings:\["terminalPlacement"\]\},\{title:"Accessibility",advanced:!0,settings:\["customContextMenusEnabled","screenReaderMode"\]\}\]\}\],\["General",\{sections:\[\{title:"Input Box",settings:\["queuedMessageDeliveryStrategy","sendMessageShortcut","enterToSendOnMobile"\]\},\{title:"Terminal",\s*advanced:!0,settings:\["shellSetupScript"\]\},\{title:"Workspaces",id:"workspace-creation",advanced:!0,settings:\["magicWorkspaceVcs","magicWorkspaceCogRepo","magicWorkspaceCogBranch","syncJjWorkspaceToHead"\]\},\{title:"Best of N",id:"best-of-n",advanced:!0,settings:\["bestOfNFullVcsClone","bestOfNGitFullClone"\]\},\{title:"Labs",id:"labs",advanced:!0,settings:\[\]\}\]\}\],\["Browser",\{sections:\[\{title:"(?:Built-in Browser|内置浏览器)",id:"defaultLinkOpenTarget",settings:\["defaultLinkOpenTarget","builtinBrowserDownloadDir"\]\},\{title:"Browser Subagent",\s*id:"browser-subagent",settings:\["agentBrowserTools","browserJsExecutionPolicy"\]\}\]\}\],\["Account",\{sections:\[\{title:"General",settings:\["disableCodeSnippetTelemetry"\]\}\]\}\],\["Models",\{sections:\[\{title:"Model Credits",settings:\["useAICredits"\]\}\]\}\],\["Customizations",\{sections:\[\{title:"Default Customizations",settings:\["includeJetskiDefaultCustomizations"\]\},\{title:"Customize Global Skills",settings:\["antigravity\.customization\.skills"\]\},\{title:"Custom Agents",settings:\["antigravity\.customization\.customAgents"\]\},\s*\{title:"MCP Servers",settings:\["antigravity\.customization\.mcp"\]\}\]\}\],\["Notifications",\{sections:\[\{title:"General",settings:\["enableNotificationsForSpecialEvents"\]\},\{title:"Sound",id:"notifications-sound",settings:\["enableSoundsForSpecialEvents","agentSoundVolume"\]\}\]\}\],\["App",\{sections:\[\{title:"General",settings:\["keepComputerAwake","runInBackground"\]\},\{advanced:!0,settings:\["autoCheckForUpdates"\]\}\]\}\]\s*\]\);/g,
    'var $1=new Map([["Appearance",{sections:[{title:"对话",settings:["verboseConversationSteps"]},{title:"对话布局",advanced:!0,settings:["conversationWidth","artifactWidth","contextUsageIndicatorEnabled"]},{title:"终端",advanced:!0,settings:["terminalPlacement"]},{title:"辅助功能",advanced:!0,settings:["customContextMenusEnabled","screenReaderMode"]}]}],["General",{sections:[{title:"输入框",settings:["queuedMessageDeliveryStrategy","sendMessageShortcut","enterToSendOnMobile"]},{title:"终端",advanced:!0,settings:["shellSetupScript"]},{title:"工作区",id:"workspace-creation",advanced:!0,settings:["magicWorkspaceVcs","magicWorkspaceCogRepo","magicWorkspaceCogBranch","syncJjWorkspaceToHead"]},{title:"多方案优选 (Best of N)",id:"best-of-n",advanced:!0,settings:["bestOfNFullVcsClone","bestOfNGitFullClone"]},{title:"实验室",id:"labs",advanced:!0,settings:[]}]}],["Browser",{sections:[{title:"内置浏览器",id:"defaultLinkOpenTarget",settings:["defaultLinkOpenTarget","builtinBrowserDownloadDir"]},{title:"浏览器子智能体",id:"browser-subagent",settings:["agentBrowserTools","browserJsExecutionPolicy"]}]}],["Account",{sections:[{title:"通用",settings:["disableCodeSnippetTelemetry"]}]}],["Models",{sections:[{title:"模型点数",settings:["useAICredits"]}]}],["Customizations",{sections:[{title:"默认自定义项",settings:["includeJetskiDefaultCustomizations"]},{title:"自定义全局技能",settings:["antigravity.customization.skills"]},{title:"自定义智能体",settings:["antigravity.customization.customAgents"]},{title:"MCP 服务器",settings:["antigravity.customization.mcp"]}]}],["Notifications",{sections:[{title:"通用",settings:["enableNotificationsForSpecialEvents"]},{title:"声音",id:"notifications-sound",settings:["enableSoundsForSpecialEvents","agentSoundVolume"]}]}],["App",{sections:[{title:"通用",settings:["keepComputerAwake","runInBackground"]},{advanced:!0,settings:["autoCheckForUpdates"]}]}]]);'
  );
  // 2.35.1+ UOb 设置项与选项/描述原生替换 (Queued messages / Send message / ZTb / Conversation steps / Artifact width / Voice Mode)
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Queued messages"',
    /label:"Queued messages",description:"Configure when follow-up messages are sent\.",options:\[([A-Za-z_$][\w$]*)\.MessageDeliveryStrategy\.WHEN_IDLE,\1\.MessageDeliveryStrategy\.NEXT_INVOCATION\],resolveSelectedOption:([^,]+),resolveOptionToString:([a-zA-Z0-9_$]+)=>\{switch\(\3\)\{case \1\.MessageDeliveryStrategy\.NEXT_INVOCATION:return"Send Immediately";\s*default:return"Queue"\}\},resolveOptionToDescription:([a-zA-Z0-9_$]+)=>\{switch\(\4\)\{case \1\.MessageDeliveryStrategy\.NEXT_INVOCATION:return"Interrupt the agent and send immediately\.";default:return"Queue until after the current turn\."\}\}/g,
    'label:"排队中的消息",description:"配置后续消息的发送时机。",options:[$1.MessageDeliveryStrategy.WHEN_IDLE,$1.MessageDeliveryStrategy.NEXT_INVOCATION],resolveSelectedOption:$2,resolveOptionToString:$3=>{switch($3){case $1.MessageDeliveryStrategy.NEXT_INVOCATION:return"立即发送";default:return"排队发送"}},resolveOptionToDescription:$4=>{switch($4){case $1.MessageDeliveryStrategy.NEXT_INVOCATION:return"中断智能体并立即发送。";default:return"等待当前回合结束后再发送。"}}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Send message"',
    /label:"Send message",description:"Choose which key sends a message in the chat composer\.",options:\["enter","modEnter"\],resolveSelectedOption:([^,]+),resolveOptionToString:([a-zA-Z0-9_$]+)=>\{switch\(\2\)\{case "modEnter":return ([a-zA-Z0-9_$]+(?:\?\.isMac)?)\?"Cmd\+Enter":"Ctrl\+Enter";default:return"Enter"\}\},resolveOptionToDescription:([a-zA-Z0-9_$]+)=>\{switch\(\4\)\{case "modEnter":return \3\?"Press Cmd\+Enter to send, Enter for a new line\.":"Press Ctrl\+Enter to send, Enter for a new line\.";default:return"Press Enter to send, Shift\+Enter for a new line\."\}\}/g,
    'label:"发送消息",description:"选择在对话输入框中发送消息的按键。",options:["enter","modEnter"],resolveSelectedOption:$1,resolveOptionToString:$2=>{switch($2){case "modEnter":return $3?"Cmd+Enter":"Ctrl+Enter";default:return"回车"}},resolveOptionToDescription:$4=>{switch($4){case "modEnter":return $3?"按 Cmd+Enter 发送，按 Enter 换行。":"按 Ctrl+Enter 发送，按 Enter 换行。";default:return"按 Enter 发送，按 Shift+Enter 换行。"}}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"On empty prompt, sends next in queue"',
    /MessageDeliveryStrategy\.NEXT_INVOCATION\?`\$\{([a-zA-Z0-9_$]+)\} Sends immediately`:`\$\{\1\} Queues after the turn`;([\s\S]{0,650}?)createElement\("span",null,"Keyboard shortcuts"\)/g,
    (m) => m
      .replaceAll('Sends immediately', '立即发送')
      .replaceAll('Queues after the turn', '本轮结束后排队发送')
      .replaceAll('On empty prompt, sends next in queue', '输入为空时发送队列下一条')
      .replace('"Keyboard shortcuts"', '"键盘快捷键"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Conversation steps"',
    /label:"Conversation steps",description:"Choose how much detail is shown during a conversation\.",settingType:"toggle-group",options:\[!1,!0\],resolveOptionToString:([a-zA-Z0-9_$]+)=>\1\?"Verbose":"Default"/g,
    'label:"对话步骤",description:"选择对话过程中展示的步骤详细程度。",settingType:"toggle-group",options:[!1,!0],resolveOptionToString:$1=>$1?"详细":"默认"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Markdown artifact width"',
    /label:"Markdown artifact width",description:"Configure the default width of markdown artifacts\.",settingType:"toggle-group",options:\[1,2,3\],resolveOptionToString:([a-zA-Z0-9_$]+)=>\{switch\(\1\)\{case 2:return"Wide";case 3:return"Fill";default:return"Default"\}\}/g,
    'label:"Markdown 工件宽度",description:"配置 Markdown 工件的默认显示宽度。",settingType:"toggle-group",options:[1,2,3],resolveOptionToString:$1=>{switch($1){case 2:return"宽";case 3:return"铺满";default:return"默认"}}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Voice Mode"',
    /([A-Za-z_$][\w$]*)\.createElement\("div",\{className:"font-medium"\},"Voice Mode"\)/g,
    '$1.createElement("div",{className:"font-medium"},"语音模式")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Voice engine"',
    /label:"Voice engine"/g,
    'label:"语音引擎"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"aria-label":"Voice engine address"',
    /"aria-label":"Voice engine address"/g,
    '"aria-label":"语音引擎地址"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Save audio recordings"',
    /label:"Save audio recordings",description:"Only stored on your machine\."/g,
    'label:"保存录音",description:"仅保存在你的本地设备上。"'
  );
  // 2.35.1+ Plugin Permissions (c_b)、Hooks 规则映射、Clear Browsing Data?、Cookies by Site、Browser 页头
  sourceText = fastAnchorReplace(
    sourceText,
    '"Allowed by you"',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"Allowed by you"\),\s*([a-zA-Z0-9_$]+)\.length===0\?\1\.createElement\("div",\{className:"px-1 text-sm text-muted-foreground"\},\s*"Nothing is always allowed\. You'll be asked before this plugin makes changes\."\)/g,
    '$1.createElement($2,null,"你已允许"),$3.length===0?$1.createElement("div",{className:"px-1 text-sm text-muted-foreground"},"暂无始终允许的权限。此插件进行更改前都会先询问你。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"These come with the plugin and can\'t be revoked."',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"Included with plugin"\),\s*\1\.createElement\("div",\{className:"px-1 text-xs text-muted-foreground"\},"These come with the plugin and can't be revoked\."\)/g,
    '$1.createElement($2,null,"插件自带"),$1.createElement("div",{className:"px-1 text-xs text-muted-foreground"},"这些权限随插件附带，无法撤销。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Revoke all"',
    /`Revoke all: \$\{([a-zA-Z0-9_$]+)\}`,\s*onClick:\(\)\s*=>\s*\{([a-zA-Z0-9_$]+)\(!0\)\}\},\s*"Revoke all"/g,
    '`全部撤销：${$1}`,onClick:()=>{$2(!0)}},"全部撤销"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Hook will trigger if any tool is executed.',
    /\{value:"\*",label:"All tools \(\*\)",description:"Hook will trigger if any tool is executed\."\},\{value:"run_command",label:"run_command",description:"Hook will only trigger if the tool name matches run_command\."\},\{value:"run_command\|view_file",label:"run_command or view_file",description:"Hook will only trigger if the tool name matches run_command or view_file\."\},\s*\{value:"browser_\.\*",label:"Browser tools \(browser_\.\*\)",description:"Hook will only trigger if the tool name starts with browser_\."\}/g,
    '{value:"*",label:"所有工具 (*)",description:"只要执行任何工具，钩子就会触发。"},{value:"run_command",label:"run_command",description:"仅当工具名称匹配 run_command 时，钩子才会触发。"},{value:"run_command|view_file",label:"run_command 或 view_file",description:"仅当工具名称匹配 run_command 或 view_file 时，钩子才会触发。"},{value:"browser_.*",label:"浏览器工具 (browser_.*)",description:"仅当工具名称以 browser_ 开头时，钩子才会触发。"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'PreToolUse:"Pre Tool Use"',
    /\{PreToolUse:"Pre Tool Use",PostToolUse:"Post Tool Use",PreInvocation:"Pre Invocation",PostInvocation:"Post Invocation",Stop:"Stop"\}/g,
    '{PreToolUse:"工具调用前",PostToolUse:"工具调用后",PreInvocation:"模型调用前",PostInvocation:"模型调用后",Stop:"停止"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Fires before a tool step executes.',
    /\{PreToolUse:"Fires before a tool step executes\.",PostToolUse:"Fires after a tool step completes\.",PreInvocation:"Fires before the model is called\.",PostInvocation:"Fires after tool calls finish\.",Stop:"Fires when the execution loop terminates\."\}/g,
    '{PreToolUse:"在工具步骤执行前触发。",PostToolUse:"在工具步骤完成后触发。",PreInvocation:"在调用模型前触发。",PostInvocation:"在工具调用结束后触发。",Stop:"在执行循环终止时触发。"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Clear Browsing Data?"',
    /title:"Clear Browsing Data\?"\},([A-Za-z_$][\w$]*)\.createElement\("div",null,\1\.createElement\("p",\s*\{id:([a-zA-Z0-9_$]+),className:"text-foreground opacity-80 leading-relaxed mb-3"\},"Choose what to clear from the built-in browser\. It can't be undone\."\),([\s\S]{0,2400}?)"Couldn't clear browsing data\. Try again\."\)/g,
    (m) => m
      .replace('title:"Clear Browsing Data?"', 'title:"清除浏览数据？"')
      .replace('"Choose what to clear from the built-in browser. It can\'t be undone."', '"选择要从内置浏览器中清除的数据，此操作无法撤销。"')
      .replace('"Browsing history"', '"浏览记录"')
      .replace('"Visited URLs and autocomplete suggestions."', '"访问过的网址和自动填充建议。"')
      .replace('"Cookies and other site data"', '"Cookie 及其他网站数据"')
      .replace('"Cookies, site storage and cache. Signs you out of all sites in the built-in browser and reloads its open tabs."', '"包括 Cookie、站点存储和缓存。会退出你在内置浏览器中所有网站的登录状态，并重新加载已打开的标签页。"')
      .replace('"An agent is using the built-in browser. Clearing its data signs the agent out of sites and may interrupt its task."', '"有智能体正在使用内置浏览器。清除其数据会让智能体退出已登录的网站，并可能中断它的任务。"')
      .replace('"Couldn\'t clear browsing data. Try again."', '"无法清除浏览数据，请重试。"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Cookies by Site"',
    /title:"Cookies by Site"/g,
    'title:"按网站查看 Cookie"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Browser",',
    /title:"Browser",\s*description:"(?:Configure built-in browser, link opening, and browser subagent preferences\.|配置内置浏览器、链接打开方式以及浏览器子智能体偏好设置。)"/g,
    'title:"浏览器",description:"配置内置浏览器、链接打开方式以及浏览器子智能体偏好设置。"'
  );
  sourceText = sourceText.replace(
    /,"Change\\u2026"\)\)\}\),([a-zA-Z0-9_$]+)&&([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{label:"(?:Browsing [Hh]istory|浏览记录)",description:([a-zA-Z0-9_$]+)\?"(?:Clear visited URLs and autocomplete suggestions from side panel preview\.|清除侧面板预览中的访问网址与自动填充建议。)":"(?:Clear visited URLs and autocomplete suggestions from the built-in browser\.|清除内置浏览器的访问网址与自动填充建议。|清除内置浏览器中的访问网址与自动填充建议。)",rightElement:\2\.createElement\(([a-zA-Z0-9_$]+),\{variant:"secondary",size:"sm",disabled:([a-zA-Z0-9_$]+)\.length===0,onClick:([a-zA-Z0-9_$]+),"data-testid":"clear-browser-history-button"\},"Clear"\)/g,
    ',"更改…"))}),$1&&$2.createElement($3,{label:"浏览记录",description:$4?"清除侧面板预览中的访问网址与自动填充建议。":"清除内置浏览器中的访问网址与自动填充建议。",rightElement:$2.createElement($5,{variant:"secondary",size:"sm",disabled:$6.length===0,onClick:$7,"data-testid":"clear-browser-history-button"},"清除")'
  );

  // [核心修复 6] 账户设置页、模型与用量页、Orchestrator 设置、配额重置函数跨版本模块化替换
  sourceText = sourceText.replace(
    /B\.createElement\(([a-zA-Z0-9_$]+),\{title:"Account"\},B\.createElement\(([a-zA-Z0-9_$]+),\s*null,P&&B\.createElement\(([a-zA-Z0-9_$]+),\{label:B\.createElement\("div",\{className:"font-medium"\},F\?`Your Plan: \$\{F\}`:"Your Plan",C&&" \(ADC\)"\),description:d\?"Authenticated via Enterprise Gateway":g&&h\?B\.createElement\(B\.Fragment,null,B\.createElement\("span",\{className:"text-foreground"\},"Project ID: ",h\),G&&B\.createElement\(B\.Fragment,null,B\.createElement\("br",null\),G\)\):G,rightElement:d\|\|x\?void 0:w&&g\?B\.createElement\(([a-zA-Z0-9_$]+),\{variant:"secondary",size:"sm",onClick:\(\)\s*=>\s*\{z\(!0\)\}\},"Manage"\):c\?\.userTier\?\.upgradeSubscriptionUri\?\s*B\.createElement\("a",\{href:([a-zA-Z0-9_$]+)\(c\.userTier\.upgradeSubscriptionUri,"utm_campaign","ARGON_SETTINGS_PAGE"\),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary\/90"\},c\.userTier\?\.upgradeButtonText\|\|"Upgrade"\):void 0\}\),H&&B\.createElement\(\3,\{label:"Google One Referral",description:"Share your referral link with friends",rightElement:B\.createElement\(\4,\{variant:"secondary",size:"sm",\s*"data-testid":"g1-referral-invite-button",onClick:\(\)\s*=>\s*\{u\(H\)\}\},"Invite a Friend"\)\}\),J&&B\.createElement\(\3,\{label:B\.createElement\("div",\{className:"font-medium"\},f==="projectPicker"\?"Project Required":"License Required"\),description:f==="projectPicker"\?"A Google Cloud project is required to use Antigravity\.":"A license or project selection is required to use Antigravity\.",rightElement:B\.createElement\(\4,\{variant:"primary",size:"sm",onClick:\(\)\s*=>\s*\{z\(!0\)\}\},f==="projectPicker"\?"Select Project":"Manage License"\)\},\s*l\.settings\.isVisible\("antigravity\.section\.authChange"\)&&\(d\?B\.createElement\(\3,\{label:"Email",description:"Managed by Enterprise Gateway"\}\):K\?B\.createElement\(\3,\{label:"Email",description:c\?\.email,rightElement:B\.createElement\("span",\{"data-tooltip-id":v,tabIndex:n\?0:void 0\},B\.createElement\(\4,\{variant:"secondary",size:"sm",disabled:!!n\|\|A,onClick:async\(\)\s*=>\s*\{var O=e,Q=e;try\{D\(!0\);try\{Q\(await O\(a\.logout\(\)\)\)\}finally\{Q\(\),D\(!1\)\}\}finally\{O\(\)\}\}\},A\?"Signing Out\.\.\.":"Sign Out"\),B\.createElement\(([a-zA-Z0-9_$]+),\{id:v,content:n\}\)\)\}\):\s*B\.createElement\(\3,\{label:"Not Signed In",description:t\?`Sign in from the \$\{([a-zA-Z0-9_$]+)\} panel\.`:`Sign in to use \$\{\7\}!`/g,
    'B.createElement($1,{title:"账户"},B.createElement($2,null,P&&B.createElement($3,{label:B.createElement("div",{className:"font-medium"},F?`你的方案：${globalThis.__AGY_ZHCN_TRANSLATE_PLAN__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN__(F):F}`:"你的方案",C&&" (ADC)"),description:d?"已通过企业网关验证":g&&h?B.createElement(B.Fragment,null,B.createElement("span",{className:"text-foreground"},"项目 ID：",h),G&&B.createElement(B.Fragment,null,B.createElement("br",null),(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(G):G))):G&&(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(G):G),rightElement:d||x?void 0:w&&g?B.createElement($4,{variant:"secondary",size:"sm",onClick:()=>{z(!0)}},"管理"):c?.userTier?.upgradeSubscriptionUri?B.createElement("a",{href:$5(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_SETTINGS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},({"Upgrade":"升级","Manage":"管理","Learn more":"了解更多"}[c.userTier?.upgradeButtonText]||c.userTier?.upgradeButtonText||"升级")):void 0}),H&&B.createElement($3,{label:"Google One 推荐",description:"与好友分享你的推荐链接",rightElement:B.createElement($4,{variant:"secondary",size:"sm","data-testid":"g1-referral-invite-button",onClick:()=>{u(H)}},"邀请好友")}),J&&B.createElement($3,{label:B.createElement("div",{className:"font-medium"},f==="projectPicker"?"需要关联项目":"需要许可证"),description:f==="projectPicker"?"使用 Antigravity 需要关联 Google Cloud 项目。":"使用 Antigravity 需要配置许可证或选择项目。",rightElement:B.createElement($4,{variant:"primary",size:"sm",onClick:()=>{z(!0)}},f==="projectPicker"?"选择项目":"管理许可证")}),l.settings.isVisible("antigravity.section.authChange")&&(d?B.createElement($3,{label:"邮箱",description:"由企业网关统一管理"}):K?B.createElement($3,{label:"邮箱",description:c?.email,rightElement:B.createElement("span",{"data-tooltip-id":v,tabIndex:n?0:void 0},B.createElement($4,{variant:"secondary",size:"sm",disabled:!!n||A,onClick:async()=>{var O=e,Q=e;try{D(!0);try{Q(await O(a.logout()))}finally{Q(),D(!1)}}finally{O()}}},A?"正在退出登录...":"退出登录"),B.createElement($6,{id:v,content:n}))}):B.createElement($3,{label:"未登录",description:t?`请在 ${$7} 面板中登录。`:`登录后即可使用 ${$7}！`'
  );
  // 2.35.1+ 模块化 Account / Telemetry / Models & Usage / Orchestrator 跨变量名补全
  sourceText = sourceText.replaceAll('title:"Account",description:"Manage your plan, credentials, and general preferences."', 'title:"账户",description:"管理你的订阅方案、凭据与常规偏好设置。"');
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"General"},',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"General"\},\1\.createElement\(/g,
    '$1.createElement($2,{title:"通用"},$1.createElement('
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Account"},',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Account"\},\1\.createElement\(/g,
    '$1.createElement($2,{title:"账户"},$1.createElement('
  );
  sourceText = sourceText.replace(
    /label:"Enable [Tt]elemetry",\s*description:`When toggled on, \$\{([^}]+)\} collects usage data to help Google enhance performance and features\.`/g,
    'label:"启用遥测",description:`开启后，${$1} 会收集使用数据，帮助 Google 改进产品性能与功能。`'
  );
  sourceText = sourceText.replace(
    /label:"Marketing [Ee]mails",\s*description:`Receive product updates, tips, and promotions from Google \$\{([^}]+)\} via email\.`/g,
    'label:"营销邮件",description:`通过电子邮件接收来自 Google ${$1} 的产品更新、使用技巧与推广资讯。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'lan: ${',
    /([a-zA-Z0-9_$]+)\?`Your [Pp]lan: \$\{\1\}`:"Your [Pp]lan"/g,
    '$1?`你的方案：${globalThis.__AGY_ZHCN_TRANSLATE_PLAN__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN__($1):$1}`:"你的方案"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Authenticated via Enterprise Gateway"',
    /description:([a-zA-Z0-9_$]+)\?"Authenticated via Enterprise Gateway":([a-zA-Z0-9_$]+)&&([a-zA-Z0-9_$]+)\?([A-Za-z_$][\w$]*)\.createElement\(\4\.Fragment,null,\4\.createElement\("span",\{className:"text-foreground"\},"Project ID: ",\3\),([a-zA-Z0-9_$]+)&&\4\.createElement\(\4\.Fragment,null,\4\.createElement\("br",null\),\5\)\):\5/g,
    'description:$1?"已通过企业网关验证":$2&&$3?$4.createElement($4.Fragment,null,$4.createElement("span",{className:"text-foreground"},"项目 ID：",$3),$5&&$4.createElement($4.Fragment,null,$4.createElement("br",null),(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__($5):$5))):($5&&(globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__?globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__($5):$5))'
  );
  sourceText = sourceText.replace(
    /onClick:\(\)\s*=>\s*\{([a-zA-Z0-9_$]+)\(!0\)\}\},"Manage"\)/g,
    'onClick:()=>{$1(!0)}},"管理")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'upgradeButtonText||"Upgrade"',
    /([a-zA-Z0-9_$]+\??\.userTier\??\.upgradeButtonText)\|\|"Upgrade"/g,
    '({"Upgrade":"升级","Manage":"管理","Learn more":"了解更多"}[$1]||$1||"升级")'
  );
  sourceText = sourceText.replace(
    /label:"Google One [Rr]eferral",description:"Share your referral link with friends",rightElement:([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{variant:"secondary",size:"sm","data-testid":"g1-referral-invite-button",onClick:([^}]+)\}\},"Invite a Friend"\)/g,
    'label:"Google One 好友推荐",description:"与好友分享你的推荐链接",rightElement:$1.createElement($2,{variant:"secondary",size:"sm","data-testid":"g1-referral-invite-button",onClick:$3}},"邀请好友")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '==="projectPicker"?"Project ',
    /([a-zA-Z0-9_$]+)==="projectPicker"\?"Project [Rr]equired":"License [Rr]equired"/g,
    '$1==="projectPicker"?"需要关联项目":"需要许可证"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '==="projectPicker"?"Select Project"',
    /([a-zA-Z0-9_$]+)==="projectPicker"\?"Select Project":"Manage License"/g,
    '$1==="projectPicker"?"选择项目":"管理许可证"'
  );
  sourceText = sourceText.replaceAll('label:"Email",description:"Managed by Enterprise Gateway"', 'label:"邮箱",description:"由企业网关统一管理"');
  sourceText = sourceText.replace(/label:"Email",description:([a-zA-Z0-9_$]+)\?\.email,/g, 'label:"邮箱",description:$1?.email,');
  sourceText = fastAnchorReplace(sourceText, '"Signing Out...":"Sign Out"', /([a-zA-Z0-9_$]+)\?"Signing Out\.\.\.":"Sign Out"/g, '$1?"正在退出登录...":"退出登录"');
  sourceText = fastAnchorReplace(sourceText, '"Refresh quota and credits data"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:([A-Za-z_$][\w$]*)\.createElement\("div",\s*\{className:"flex items-center gap-1\.5"\},\s*\1\.createElement\("span",null,"Models & Usage"\),\s*\1\.createElement\(([a-zA-Z0-9_$]+),\{variant:"ghost",size:"icon-lg",onClick:([a-zA-Z0-9_$]+),disabled:([a-zA-Z0-9_$]+)===void 0,title:"Refresh quota and credits data","aria-label":"Refresh quota and credits data"\},\s*\1\.createElement\(([a-zA-Z0-9_$]+),\{name:"refresh",size:20,className:\6===void 0\?"animate-spin":""\}\)\)\),\s*description:"Manage your model quota and credits\."\}/g, '$1.createElement($2,{title:$1.createElement("div",{className:"flex items-center gap-1.5"},$1.createElement("span",null,"模型与用量"),$1.createElement($4,{variant:"ghost",size:"icon-lg",onClick:$5,disabled:$6===void 0,title:"刷新配额与点数数据","aria-label":"刷新配额与点数数据"},$1.createElement($7,{name:"refresh",size:20,className:$6===void 0?"animate-spin":""}))),description:"管理你的模型配额与 AI 点数。"}');
  sourceText = fastAnchorReplace(sourceText, 'title:"Plan"}', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Plan"\},\s*\1\.createElement\(/g, '$1.createElement($2,{title:"订阅方案"},$1.createElement(');
  sourceText = fastAnchorReplace(sourceText, 'title:"Model Credits"}', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Model Credits"\},\s*\1\.createElement\(/g, '$1.createElement($2,{title:"模型点数"},$1.createElement(');
  sourceText = sourceText.replace(
    /label:"Enable AI [Cc]redit [Oo]verages",description:`When toggled on, \$\{([a-zA-Z0-9_$]+)\} will use your AI credits to fulfill model requests once you're out of model quota\. \$\{\1\} will always use your model quota first before using AI credits\.`/g,
    'label:"启用 AI 点数超额使用",description:`开启后，当模型配额用尽时，${$1} 将自动使用你的 AI 点数继续处理请求。系统始终优先消耗模型配额。`'
  );
  sourceText = sourceText.replace(/label:`Available AI [Cc]redits: \$\{([a-zA-Z0-9_$]+)\?\?"0"\}`/g, 'label:`可用 AI 点数：${$1??"0"}`');
  sourceText = sourceText.replace(
    /"For Antigravity Business consumption options, see"," ",([A-Za-z_$][\w$]*)\.createElement\("a",\{href:"https:\/\/antigravity\.google\/docs\/enterprise",className:"text-link hover:underline",target:"_blank",rel:"noopener noreferrer"\},"documentation"\),"\."/g,
    '"如需了解 Antigravity 企业版用量选项，请参阅"," ",$1.createElement("a",{href:"https://antigravity.google/docs/enterprise",className:"text-link hover:underline",target:"_blank",rel:"noopener noreferrer"},"说明文档"),"。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '=(a,b,c,d,f,g)=>{if(g)return a=',
    /([a-zA-Z0-9_$]+)=\(a,b,c,d,f,g\)=>\{if\(g\)return a=a(?:\?\.trim\(\))?\|\|"this model",b&&\(b=new Date\(b\),!Number\.isNaN\(b\.getTime\(\)\)\)\?`Your quota for \$\{a\} will reset on \$\{b\.toLocaleString\(\)\}\. (?:Switch to another available model to continue\.|请切换到其他可用模型以继续。)`:`Your quota for \$\{a\} has been reached\. (?:Switch to another available model to continue\.|请切换到其他可用模型以继续。)`;g="";var h=d!==void 0;h&&c&&\(f===void 0\|\|d<f\)&&\(g=`You need \$\{f\?"at least "\+f:"more"\} AI Credits to send messages\. To continue using \$\{a\|\|"this model"\} now, purchase more AI Credits\.`\);if\(b\)try\{let k=[\s\r\n]*\(new Date\(b\)\)\.toLocaleString\(\);[\s\r\n]*g\+=` (?:Your plan's baseline quota will refresh on|你的方案基线配额将于) \$\{k\}(?:\.| 刷新。)`\}catch\(k\)\{console\.warn\("Failed to parse quota reset timestamp",k\)\}h&&!c&&\(g\+=" (?:To continue using this model now, enable AI Credit overages\.|若要立即继续使用此模型，请启用 AI 点数超额使用。)"\);return g\};/g,
    '$1=(a,b,c,d,f,g)=>{if(g)return a=a?.trim()||"此模型",b&&(b=new Date(b),!Number.isNaN(b.getTime()))?`你的 ${a} 配额将于 ${b.toLocaleString()} 重置。请切换到其他可用模型以继续。`:`你的 ${a} 配额已达上限。请切换到其他可用模型以继续。`;g="";var h=d!==void 0;h&&c&&(f===void 0||d<f)&&(g=`你还需要 ${f?"至少 "+f:"更多"} AI 点数才能继续发送消息。若要立即继续使用${a||"此模型"}，请购买更多 AI 点数。`);if(b)try{let k=(new Date(b)).toLocaleString();g+=` 你的方案基线配额将于 ${k} 刷新。`}catch(k){console.warn("Failed to parse quota reset timestamp",k)}h&&!c&&(g+=" 若要立即继续使用此模型，请启用 AI 点数超额使用。");return g};'
  );

  // [核心修复 7] 首次引导最后一步弹窗（模块化拆分，容忍换行/变量名变更与遥测文案差异）
  sourceText = fastAnchorReplace(
    sourceText,
    'One last thing before getting started',
    /([A-Za-z_$][\w$]*)\.createElement\("h2",\{className:([a-zA-Z0-9_$]+)\},"One last thing before getting started\\u2026"\),\s*\1\.createElement\("p",\{className:([a-zA-Z0-9_$]+)\?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"\},"A few things to know, and a couple settings to review\."\)/g,
    '$1.createElement("h2",{className:$2},"开始使用前，还有最后几项确认…"),$1.createElement("p",{className:$3?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"},"请了解以下说明，并确认相关偏好设置。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Optimized for you"',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Optimized for you"\},\s*"Customize your experience across the agent, plugins, and product from the settings and marketplace\. We won\\u2019t show you ads or let advertisers influence what ",\s*([a-zA-Z0-9_$]+),\s*" says\."\)/g,
    '$1.createElement($2,{title:"专属定制优化"},"你可以通过设置与插件市场，自由定制智能体、插件与整体产品体验。我们绝不向你展示广告，也不会允许任何广告商影响 ",$3," 的回复。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Built to help, not hurt"',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Built to help, not hurt"\},\s*"Automated safeguards help to protect your conversations from insecure or unsafe content\. That being said, users should be aware of potential agentic risks, including data exfiltration\."\)/g,
    '$1.createElement($2,{title:"秉持安全设计，赋能开发"},"内置自动安全防护机制有助于保护你的对话免受不安全或风险内容影响。尽管如此，请依然留意智能体操作潜在的安全风险（包括数据泄露）。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"You are in control"',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"You are in control"\},\s*([a-zA-Z0-9_$]+),\s*"\\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent\."\)/g,
    '$1.createElement($2,{title:"一切由你掌控"},$3," 的智能体功能强大，可助你更快、更出色地完成任务，但请务必仔细核实智能体执行的操作。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'does not collect any of your prompts, content, or model responses',
    /((?:"For ",[a-zA-Z0-9_$]+,", "|"Telemetry is turned off for your account\. ")),\s*([a-zA-Z0-9_$]+),\s*" does not collect any of your prompts, content, or model responses but will still collect general usage patterns \(e\.g\., feature adoption, active user counts\)\."/g,
    (_, head, prodVar) => `${head.startsWith('"For') ? '"对于 ",k,"，"' : '"你的账号已关闭遥测数据收集。"'},${prodVar}," 不会收集你的提示词、代码内容或模型回复，但仍会收集常规使用模式（例如功能启用情况与活跃用户数）。"`
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Allow Google to collect and use your Interactions data',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:`Help us improve \$\{([a-zA-Z0-9_$]+)\}\.`\},\s*"Allow Google to collect and use your Interactions data, subject to the",\s*" ",\s*\1\.createElement\("a",\{href:"https:\/\/antigravity\.google\/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"\},"Google ",\3," Terms of Service"\),\s*(?:" ","and"," "|"\s*与\s*"),\s*\1\.createElement\("a",\{href:"https:\/\/policies\.google\.com\/privacy",className:"text-link hover:underline",\s*target:"_blank",rel:"noreferrer"\},"Google Privacy Policy"\),"\. You can control this from your settings at any point\."\)/g,
    '$1.createElement($2,{title:`帮助改进 ${$3}。`},"允许 Google 依据 ",$1.createElement("a",{href:"https://antigravity.google/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google ",$3," 服务条款")," 与 ",$1.createElement("a",{href:"https://policies.google.com/privacy",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google 隐私权政策")," 收集并使用你的交互数据。你随时可以在设置中管理此选项。")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Stay up to date."',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{title:"Stay up to date\."\},\s*"Sign up for newsletters, tips and tricks, and other notifications about ",\s*([a-zA-Z0-9_$]+),\s*"\."\)/g,
    '$1.createElement($2,{title:"订阅最新资讯。"},"订阅关于 ",$3," 的产品动态、实用技巧及其他通知邮件。")'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(\{activeCount:a,archivedCount:b\}\)\{var c=\[\];a>0&&c\.push\(a===1\?"1 active conversation":`\$\{a\} active conversations`\);b>0&&c\.push\(b===1\?"1 archived conversation":`\$\{b\} archived conversations`\);return c\.join\(" and "\)\}/g,
    'function $1({activeCount:a,archivedCount:b}){var c=[];a>0&&c.push(`${a} 个活动对话`);b>0&&c.push(`${b} 个已归档对话`);return c.join(" 与 ")}'
  );
  sourceText = sourceText.replace(
    /title:`Delete \$\{h\.capitalized\}`,className:"rounded-md max-w-md"\},([A-Za-z_$][\w$]*)\.createElement\("div",null,\1\.createElement\("p",\s*\{className:"text-foreground opacity-80 leading-relaxed mb-3"\},"Are you sure you want to delete the ",h\.lowercase," ",\1\.createElement\("strong",null,b\),"\\?"\),n&&\1\.createElement\("p",\{className:"text-foreground opacity-80 leading-relaxed mb-4"\},"This will permanently delete ",\1\.createElement\("strong",null,n\)," ","within it\."\),(\1)\.createElement\("div",\{className:"flex justify-end gap-3"\},\1\.createElement\(([a-zA-Z0-9_$]+),\{size:"md",variant:"secondary",onClick:m\},"Cancel"\),\1\.createElement\(\3,\{size:"md",variant:"destructive",\s*onClick:l,"data-autofocus":"true"\},"Delete"\)\)\)/g,
    'title:h.lowercase==="workspace"?"删除工作区":"删除项目",className:"rounded-md max-w-md"},$1.createElement("div",null,$1.createElement("p",{className:"text-foreground opacity-80 leading-relaxed mb-3"},"确定要删除",h.lowercase==="workspace"?"工作区":"项目"," ",$1.createElement("strong",null,b)," 吗？"),n&&$1.createElement("p",{className:"text-foreground opacity-80 leading-relaxed mb-4"},"此操作将永久删除其中的 ",$1.createElement("strong",null,n),"。"),$1.createElement("div",{className:"flex justify-end gap-3"},$1.createElement($3,{size:"md",variant:"secondary",onClick:m},"取消"),$1.createElement($3,{size:"md",variant:"destructive",onClick:l,"data-autofocus":"true"},"删除")))'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Plugins are packaged collections of skills and MCPs',
    /([A-Za-z_$][\w$]*)\.createElement\("p",\{className:"text-muted-foreground mb-4"\},"Plugins are packaged collections of skills and MCPs to help the Agent in ",\s*([a-zA-Z0-9_$]+)," work with Google developer products\. You can always change your choices in Settings\."\)/g,
    '$1.createElement("p",{className:"text-muted-foreground mb-4"},"插件是技能与 MCP 的封装合集，可帮助智能体在 ",$2," 中与 Google 开发者产品协同工作。你随时可以在“设置”中更改选择。")'
  );
  sourceText = sourceText.replace(
    /"There are currently no Build with ",([a-zA-Z0-9_$]+)," plugins available\."/g,
    '"当前暂无与 ",$1," 共建的可用插件。"'
  );

  // [核心修复 8] 进度耗时、思考计时、步骤汇总、章节标题、时间格式化跨版本正则替换
  sourceText = fastAnchorReplace(sourceText, 'null,"Card "),m+1," of ",l', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"Card "\),m\+1," of ",l/g, '$1.createElement($2,null,"卡片 "),m+1," / ",l');
  sourceText = sourceText.replace(/headerText:`Worked for \$\{([a-zA-Z0-9_$]+)\(a\)\}`/g, 'headerText:`工作耗时 ${$1(a)}`');
  sourceText = sourceText.replace(
    /subtitle:P\?"Killed":N\?void 0:L\?"Working\.\.\.":l\?\.createdAtMs&&l\?\.lastModifiedAtMs\?`Worked for \$\{([a-zA-Z0-9_$]+)\(l\.lastModifiedAtMs-l\.createdAtMs\)\}`:""/g,
    'subtitle:P?"已终止":N?void 0:L?"处理中...":l?.createdAtMs&&l?.lastModifiedAtMs?`工作耗时 ${$1(l.lastModifiedAtMs-l.createdAtMs)}`:""'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{return a\.active\?"Working":a\.durationMs!==void 0&&a\.durationMs>0\?`Worked for \$\{([a-zA-Z0-9_$]+)\(a\.durationMs\)\}`:"Worked"\}/g,
    'function $1(a){return a.active?"处理中":a.durationMs!==void 0&&a.durationMs>0?`工作耗时 ${$2(a.durationMs)}`:"已完成"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?w.startTimeMs?`Running for ',
    /([a-zA-Z0-9_$]+)\?w\.startTimeMs\?`Running for \$\{([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+)\.getTime\(\)-Number\(w\.startTimeMs\)\)\}`:"Starting":"Paused\."/g,
    '$1?w.startTimeMs?`已运行 ${$2($3.getTime()-Number(w.startTimeMs))}`:"正在启动":"已暂停。"'
  );
  sourceText = sourceText.replace(
    /a\.startTimeMs\?`Up \$\{([a-zA-Z0-9_$]+)\(g\.getTime\(\)-Number\(a\.startTimeMs\)\)\}`:"Running"/g,
    'a.startTimeMs?`已运行 ${$1(g.getTime()-Number(a.startTimeMs))}`:"运行中"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.exitCode===-1?"Validation timed out.":',
    /([a-zA-Z0-9_$]+)\.exitCode===-1\?"Validation timed out\.":([a-zA-Z0-9_$]+)\|\|`Exited with code \$\{\1\.exitCode\}\.`/g,
    '$1.exitCode===-1?"验证超时。":$2||`已退出，退出码 ${$1.exitCode}。`'
  );
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=new Intl\.DateTimeFormat\(void 0,\{timeStyle:"short"\}\),([a-zA-Z0-9_$]+)=new Intl\.DateTimeFormat\(void 0,\{weekday:"long"\}\),([a-zA-Z0-9_$]+)=new Intl\.DateTimeFormat\(void 0,\{weekday:"short",month:"short",day:"numeric"\}\),([a-zA-Z0-9_$]+)=new Intl\.DateTimeFormat\(void 0,\{weekday:"short",month:"short",day:"numeric",year:"numeric"\}\);var ([a-zA-Z0-9_$]+)=\(\{date:a\}\)\s*=>\s*\{\{var b=new Date;let g=\1\.format\(a\);if\(([a-zA-Z0-9_$]+)\(a,b\)\)a=\{dayPart:"Today",timePart:g\};else\{var c=new Date\(b\);c\.setDate\(b\.getDate\(\)-1\);a=\6\(a,c\)\?\{dayPart:"Yesterday",timePart:g\}:Math\.abs\(([a-zA-Z0-9_$]+)\(b,a\)\)<7\?\{dayPart:\2\.format\(a\),timePart:g\}:\{dayPart:a\.getFullYear\(\)===b\.getFullYear\(\)\?\3\.format\(a\):\4\.format\(a\),timePart:`at \$\{g\}`\}\}\}/g,
    'const $1=new Intl.DateTimeFormat("zh-CN",{timeStyle:"short"}),$2=new Intl.DateTimeFormat("zh-CN",{weekday:"long"}),$3=new Intl.DateTimeFormat("zh-CN",{weekday:"short",month:"short",day:"numeric"}),$4=new Intl.DateTimeFormat("zh-CN",{weekday:"short",month:"short",day:"numeric",year:"numeric"});var $5=({date:a})=>{{var b=new Date;let g=$1.format(a);if($6(a,b))a={dayPart:"今天",timePart:g};else{var c=new Date(b);c.setDate(b.getDate()-1);a=$6(a,c)?{dayPart:"昨天",timePart:g}:Math.abs($7(b,a))<7?{dayPart:$2.format(a),timePart:g}:{dayPart:a.getFullYear()===b.getFullYear()?$3.format(a):$4.format(a),timePart:g}}}'
  );
  sourceText = sourceText.replace(
    /return a\?\/\^running\\b\/i\.test\(a\)\?a\.replace\(\/\^running\\b\/i,"Running"\):`Running \$\{([a-zA-Z0-9_$]+)\(a\)\}`:"Running command"\}/g,
    'return a?/^running\\b/i.test(a)?a.replace(/^running\\b/i,"正在运行"):`正在运行 ${$1(a)}`:"正在运行命令"}'
  );
  sourceText = sourceText.replace(
    /return c\?c:d==="edit"\?`Editing \$\{([a-zA-Z0-9_$]+)\(\[a\],b\)\}`:"Exploring"\}/g,
    'return c?c:d==="edit"?`正在编辑 ${$1([a],b)}`:"正在探索"}'
  );
  sourceText = sourceText.replace(
    /return c\?`Editing \$\{c\}`:void 0;if\(b\.step\.case==="viewFile"\|\|a\.metadata\?\.toolCall\?\.name==="read_file"\|\|([a-zA-Z0-9_$]+)\(a\)\?\.aggregationKey==="files"\)return c\?`Reading \$\{c\}`:void 0;if\(b\.step\.case==="listDirectory"\)return\(a=([a-zA-Z0-9_$]+)\(b\.step\.value\.directoryPathUri\)\)\?`Listing \$\{a\}`:void 0;/g,
    'return c?`正在编辑 ${c}`:void 0;if(b.step.case==="viewFile"||a.metadata?.toolCall?.name==="read_file"||$1(a)?.aggregationKey==="files")return c?`正在读取 ${c}`:void 0;if(b.step.case==="listDirectory")return(a=$2(b.step.value.directoryPathUri))?`正在列出 ${a}`:void 0;'
  );
  sourceText = sourceText.replace(
    /b\|\|!a\|\|a\.error\|\|([a-zA-Z0-9_$]+)\(a\)!=="plannerResponse"\?\(d=b\?\?d\[d\.length-1\]\)\?([a-zA-Z0-9_$]+)\(d,c\):"Working":"Thinking";b=d\.filter\(g=>([a-zA-Z0-9_$]+)\(g\)==="other"\);a=d\.filter\(g=>\3\(g\)==="terminal"\);var f=d\.filter\(g=>\3\(g\)==="edit"\);d=\[\];b\.length>0&&\(b=([a-zA-Z0-9_$]+)\(b,c\),d\.push\(b\?`Explored \$\{b\}`:"Explored"\)\);a\.length>0&&d\.push\(`\$\{d\.length===0\?"Ran":"ran"\} \$\{a\.length===1\?"command":"commands"\}`\);\s*f\.length>0&&\(c=\4\(f,c\),d\.push\(`\$\{d\.length===0\?"Edited":"edited"\} \$\{c\}`\)\);/g,
    'b||!a||a.error||$1(a)!=="plannerResponse"?(d=b??d[d.length-1])?$2(d,c):"处理中":"思考中";b=d.filter(g=>$3(g)==="other");a=d.filter(g=>$3(g)==="terminal");var f=d.filter(g=>$3(g)==="edit");d=[];b.length>0&&(b=$4(b,c),d.push(b?`已探索 ${b}`:"已探索"));a.length>0&&d.push(`已运行 ${a.length} 条命令`);f.length>0&&(c=$4(f,c),d.push(`已编辑 ${c}`));'
  );
  sourceText = sourceText.replace(
    /\)\?`Thought for \$\{Math\.max\(1,Number\(([a-zA-Z0-9_$]+)\.seconds\)\)\}s`:"Thought Process"/g,
    ')?`思考耗时 ${Math.max(1,Number($1.seconds))} 秒`:"思考过程"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"font-medium leading-snug text-foreground"',
    /([A-Za-z_$][\w$]*)\.createElement\("span",\{ref:h,"data-titled":d\?"true":void 0,className:"font-medium leading-snug text-foreground"\},d\?\?([a-zA-Z0-9_$]+)\(a,b\)\)/g,
    '$1.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"font-medium leading-snug text-foreground"},(d?(globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__?globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__(d):d):d)??$2(a,b))'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '(`Turn ${',
    /([a-zA-Z0-9_$]+)\(`Turn \$\{([a-zA-Z0-9_$]+)\+\s*1\} of \$\{([a-zA-Z0-9_$]+)\.current\.turns\?\.length\}`,"polite"\)/g,
    '$1(`第 ${$2+1} 轮，共 ${$3.current.turns?.length} 轮`,"polite")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Compacting":',
    /([a-zA-Z0-9_$]+\.createElement\([a-zA-Z0-9_$]+,null,[a-zA-Z0-9_$]+\?\?[a-zA-Z0-9_$]+\?\?\([a-zA-Z0-9_$]+\?)"Compacting":([a-zA-Z0-9_$]+\?\?)"Working"\)/g,
    '$1"正在压缩上下文":$2"工作中")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '{context_summary:"Compacting"}',
    /const ([a-zA-Z0-9_$]+)=\{context_summary:"Compacting"\};function ([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+)\)\{\3=Math\.floor\(\3\/1E3\);return \3<60\?`\$\{\3\}s`:`\$\{Math\.floor\(\3\/60\)\}m \$\{\3%60\}s`\}/g,
    'const $1={context_summary:"正在压缩上下文"};function $2($3){$3=Math.floor($3/1E3);return $3<60?`${$3} 秒`:`${Math.floor($3/60)} 分 ${$3%60} 秒`}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Model unavailable, retrying',
    /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)\.attempt;([a-zA-Z0-9_$]+)=\2\.maxAttempts;\1=\1>0&&\3>0\?` \(attempt \$\{\1\}\/\$\{\3\}\)`:"";([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)!==void 0\?Math\.max\(0,Math\.ceil\(\(\5-([a-zA-Z0-9_$]+)\)\/1E3\)\):0;return \4>0\?`Model unavailable, retrying in \$\{\4\}s\$\{\1\}`:`Model unavailable, retrying\$\{\1\}`/g,
    '$1=$2.attempt;$3=$2.maxAttempts;$1=$1>0&&$3>0?`（第 ${$1}/${$3} 次重试）`:"";$4=$5!==void 0?Math.max(0,Math.ceil(($5-$6)/1E3)):0;return $4>0?`模型暂不可用，${$4} 秒后重试${$1}`:`模型暂不可用，正在重试${$1}`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Waiting for your approval":',
    /(\([a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+&&![a-zA-Z0-9_$]+\)\?)"Waiting for your approval":([a-zA-Z0-9_$]+\.isSubagent\?[a-zA-Z0-9_$]+\.focus\|\|)"Working"/g,
    '$1"正在等待你的批准":$2"工作中"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.join(", "):"Done"',
    /return ([a-zA-Z0-9_$]+)\.length>0\?\1\.join\(", "\):"Done"/g,
    'return $1.length>0?$1.join("、"):"已完成"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'return null;',
    /if\(([a-zA-Z0-9_$]+)&&([a-zA-Z0-9_$]+)\|\|!\1&&!([a-zA-Z0-9_$]+)\)return null;\2="Working";/g,
    'if($1&&$2||!$1&&!$3)return null;$2="工作中";'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Waiting for your approval":',
    /([a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+\?[a-zA-Z0-9_$]+:[a-zA-Z0-9_$]+\?[a-zA-Z0-9_$]+\?)"Waiting for your approval":([a-zA-Z0-9_$]+\?\?)"Working":/g,
    '$1"正在等待你的批准":$2"工作中":'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'CortexStepStatus.RUNNING?',
    /(CortexStepStatus\.RUNNING\?[a-zA-Z0-9_$]+\|\|)"Working":""/g,
    '$1"工作中":""'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '||"Working";',
    /([a-zA-Z0-9_$]+=([a-zA-Z0-9_$]+)&&[a-zA-Z0-9_$]+===void 0&&![a-zA-Z0-9_$]+&&\([a-zA-Z0-9_$]+\|\|!!([a-zA-Z0-9_$]+)\),[a-zA-Z0-9_$]+=\3\|\|)"Working";/g,
    '$1"工作中";'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Summarizing call',
    /([a-zA-Z0-9_$]+\.createElement\([a-zA-Z0-9_$]+,\{className:"text-muted-foreground"\},)"Summarizing call(?:\\u2026|…)"/g,
    '$1"正在总结通话…"'
  );

  // [核心修复 9] 插件页、气泡提示、终端空状态、工作区/项目选择器、MCP 搜索跨版本替换（全面通配 React 变量）
  sourceText = sourceText.replace(/"Removing\.\.\.":([a-zA-Z0-9_$]+)\?"Enabling\.\.\.":"Adding\.\.\."/g, '"正在移除...":$1?"正在启用...":"正在添加..."');
  sourceText = sourceText.replace(/"Signed in as"," ",([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+)/g, '"当前登录账号"," ",$1.createElement($2');
  sourceText = fastAnchorReplace(
    sourceText,
    '"Configured servers"',
    /([a-zA-Z0-9_$]+)\.length>0&&([A-Za-z_$][\w$]*)\.createElement\("div",\{className:"mb-2 px-3 font-semibold text-foreground"\},\s*"Configured servers"\)/g,
    '$1.length>0&&$2.createElement("div",{className:"mb-2 px-3 font-semibold text-foreground"},"已配置的服务器")'
  );
  sourceText = sourceText.replace(/case ([a-zA-Z0-9_$]+)\.SidecarStatus\.RUNNING:return\{label:"Running"/g, 'case $1.SidecarStatus.RUNNING:return{label:"运行中"');
  sourceText = sourceText.replace(/case ([a-zA-Z0-9_$]+)\.SidecarStatus\.STARTING:return\{label:"Starting"/g, 'case $1.SidecarStatus.STARTING:return{label:"启动中"');
  sourceText = sourceText.replace(/case ([a-zA-Z0-9_$]+)\.SidecarStatus\.STOPPED:return\{label:"Stopped"/g, 'case $1.SidecarStatus.STOPPED:return{label:"已停止"');
  sourceText = sourceText.replace(/case ([a-zA-Z0-9_$]+)\.SidecarStatus\.ERRORED:return\{label:"Error"/g, 'case $1.SidecarStatus.ERRORED:return{label:"错误"');
  sourceText = sourceText.replace(/case ([a-zA-Z0-9_$]+)\.SidecarStatus\.BACKOFF:return\{label:"Backoff"/g, 'case $1.SidecarStatus.BACKOFF:return{label:"重试等待"');
  sourceText = sourceText.replace(/function ([a-zA-Z0-9_$]+)\(\{path:a,label:b="Copy Path"/g, 'function $1({path:a,label:b="复制路径"');
  sourceText = fastAnchorReplace(
    sourceText,
    '?"No resources added yet.":"No folders added yet."',
    /([a-zA-Z0-9_$]+)\?"No resources added yet\.":"No folders added yet\."/g,
    '$1?"尚未添加资源。":"尚未添加文件夹。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Controls the actions the agent can take."',
    /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)\?([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null\):"Controls the actions the agent can take\."/g,
    '$1=$2?$3.createElement($4,null):"控制智能体可执行的各类操作。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Whether the agent asks you to review its documents."',
    /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)\?([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null\):"Whether the agent asks you to review its documents\."/g,
    '$1=$2?$3.createElement($4,null):"控制智能体在生成计划或文档后是否请求你评审。"'
  );
  sourceText = sourceText.replace(/k\.length>0\?k\.map\(([a-zA-Z0-9_$]+)\)\.join\(", "\):"No access"/g, 'k.length>0?k.map(m=>({"read":"读取","update":"更新","merge":"合并","approve":"批准","create":"创建","delete":"删除"}[m]||$1(m))).join("、"):"无权限"');
  sourceText = sourceText.replace(/function ([a-zA-Z0-9_$]+)\(a\)\{switch\(a\)\{case "system":return"System UI";case "inter":return"Inter";case "google-sans":return"Google Sans"\}\}/g, 'function $1(a){switch(a){case "system":return"系统默认";case "inter":return"Inter";case "google-sans":return"Google Sans"}}');
  sourceText = sourceText.replace(/h\.length===0\?([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"No active terminals"\)/g, 'h.length===0?$1.createElement($2,null,"暂无活动终端")');
  sourceText = sourceText.replace(/"No active terminals"\),([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+)/g, '"暂无活动终端"),$1.createElement($2');
  sourceText = fastAnchorReplace(
    sourceText,
    '.items.length})`:"See less"',
    /([a-zA-Z0-9_$]+)\?`See all \(\$\{([a-zA-Z0-9_$]+)\.items\.length\}\)`:"See less"/g,
    '$1?`查看全部 (${$2.items.length})`:"收起"'
  );
  sourceText = fastAnchorReplace(sourceText, '?"Copied":"Copy code"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{id:([a-zA-Z0-9_$]+),place:"top"\},([a-zA-Z0-9_$]+)\?"Copied":"Copy code"\)/g, '$1.createElement($2,{id:$3,place:"top"},$4?"已复制":"复制代码")');
  sourceText = fastAnchorReplace(sourceText, '"Insert in Terminal"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{id:([a-zA-Z0-9_$]+),place:"top"\},"Insert in Terminal"\)/g, '$1.createElement($2,{id:$3,place:"top"},"在终端中插入")');
  sourceText = fastAnchorReplace(sourceText, 'place:"top-end"}', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{id:([a-zA-Z0-9_$]+),place:"top-end"\},([a-zA-Z0-9_$]+)\?"Copied":"Copy"\)/g, '$1.createElement($2,{id:$3,place:"top-end"},$4?"已复制":"复制")');
  sourceText = fastAnchorReplace(sourceText, '"At Mention Code Block"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{id:([a-zA-Z0-9_$]+),place:"top"\},\s*"At Mention Code Block"\)/g, '$1.createElement($2,{id:$3,place:"top"},"@ 提及代码块")');
  sourceText = sourceText.replace(/placeholder:([a-zA-Z0-9_$]+)\?"Search or enter a URL":"Search tabs, files and more"/g, 'placeholder:$1?"搜索或输入网址":"搜索标签页、文件等更多内容"');
  sourceText = fastAnchorReplace(sourceText, '"GitHub Repositories"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"GitHub Repositories"\)/g, '$1.createElement($2,null,"GitHub 仓库")');
  sourceText = fastAnchorReplace(sourceText, '"Remote Projects"', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,\s*"Remote Projects"\)/g, '$1.createElement($2,null,"远程项目")');
  sourceText = fastAnchorReplace(sourceText, ',null,"Recent")', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"Recent"\)/g, '$1.createElement($2,null,"最近")');
  sourceText = fastAnchorReplace(sourceText, ',null,"Environment")', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),null,"Environment"\)/g, '$1.createElement($2,null,"运行环境")');
  sourceText = fastAnchorReplace(
    sourceText,
    '.trim()?`No matching ${',
    /([a-zA-Z0-9_$]+)\.trim\(\)\?`No matching \$\{([a-zA-Z0-9_$]+)\}`:`No remote \$\{\2\}`/g,
    '$1.trim()?`未找到匹配的${({"projects":"项目","workspaces":"工作区"}[$2]||$2)}`:`暂无远程${({"projects":"项目","workspaces":"工作区"}[$2]||$2)}`'
  );
  sourceText = fastAnchorReplace(sourceText, '"sidecar-list-empty"', /([A-Za-z_$][\w$]*)\.createElement\("p",\{className:"px-2\.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"\},"No ",([a-zA-Z0-9_$]+)\.emptyMessagePlural,\s*" match \\u201c",([a-zA-Z0-9_$]+),"\\u201d\."\)/g, '$1.createElement("p",{className:"px-2.5 py-10 text-muted-foreground","data-testid":"sidecar-list-empty"},"未找到匹配“",$3,"”的",({"automations":"自动化","scheduled tasks":"定时任务"}[$2.emptyMessagePlural]||$2.emptyMessagePlural),"。")');
  sourceText = sourceText.replace(/paddingClassName:"pl-2\.5 pr-3",\s*icon:([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{name:"add",size:14\}\)\},"New"\)\)\)/g, 'paddingClassName:"pl-2.5 pr-3",icon:$1.createElement($2,{name:"add",size:14})},"新建")))');
  sourceText = sourceText.replace(/"Reconnect"\),([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{variant:"secondary",size:"xs","aria-label":`Disconnect \$\{([a-zA-Z0-9_$]+)\}`,onClick:\(\)\s*=>\s*\{([a-zA-Z0-9_$]+)\(\3\)\}\},"Disconnect"\)/g, '"重新连接"),$1.createElement($2,{variant:"secondary",size:"xs","aria-label":`断开 ${$3} 连接`,onClick:()=>{$4($3)}},"断开连接")');
  sourceText = sourceText.replace(/"aria-label":`More for \$\{a\}`\},([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{name:"more_vert",size:18\}\)\)\),\1\.createElement\(([a-zA-Z0-9_$]+),\{align:"end"\},\1\.createElement\(([a-zA-Z0-9_$]+),\{disabled:c,onClick:\(\)\s*=>\s*\{if\(!f\.current\)\{var g=b\(\);g&&\(f\.current=!0,d\(!0\),Promise\.resolve\(g\)\.finally\(\(\)\s*=>\s*\{f\.current=!1;d\(!1\)\}\)\)\}\}\},"Disconnect"\)/g, '"aria-label":`更多选项：${a}`},$1.createElement($2,{name:"more_vert",size:18}))),$1.createElement($3,{align:"end"},$1.createElement($4,{disabled:c,onClick:()=>{if(!f.current){var g=b();g&&(f.current=!0,d(!0),Promise.resolve(g).finally(()=>{f.current=!1;d(!1)}))}}},"断开连接")');
  sourceText = fastAnchorReplace(sourceText, '"Loading MCP servers..."', /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{className:"w-4 h-4"\}\),"Loading MCP servers\.\.\."/g, '$1.createElement($2,{className:"w-4 h-4"}),"正在加载 MCP 服务器..."');
  sourceText = fastAnchorReplace(sourceText, '"No MCP servers installed"', /([A-Za-z_$][\w$]*)\.createElement\("div",\{className:"font-medium"\},\s*"No MCP servers installed"\),\1\.createElement\("div",\{className:"text-muted-foreground max-w-sm"\},c\.openConfigFile\?"Use Add MCP to browse the store, or add a custom server via the MCP config\.":"Use Add MCP to browse the store\."\)/g, '$1.createElement("div",{className:"font-medium"},"尚未安装任何 MCP 服务器"),$1.createElement("div",{className:"text-muted-foreground max-w-sm"},c.openConfigFile?"使用“添加 MCP”浏览市场，或通过 MCP 配置文件添加自定义服务器。":"使用“添加 MCP”浏览市场。")');
  sourceText = sourceText.replace(/py-8 text-muted-foreground text-center"\},'No MCP servers found for "',([a-zA-Z0-9_$]+),'"'/g, 'py-8 text-muted-foreground text-center"},\'未找到与“\',$1,\'”匹配的 MCP 服务器\'');
  sourceText = fastAnchorReplace(sourceText, '"to have the agent generate a plan."', /([A-Za-z_$][\w$]*)\.createElement\("span",null,"Type"," ",\1\.createElement\("code",\{className:"px-1\.5 py-0\.5 rounded bg-secondary text-foreground font-mono text-\[11px\] border border-border"\},"\/"\)," ","and select"," ",\1\.createElement\("code",\{className:"px-1\.5 py-0\.5 rounded bg-secondary text-foreground font-mono text-\[11px\] border border-border"\},\s*"plan"\)," ","to have the agent generate a plan\."\)/g, '$1.createElement("span",null,"输入 ",$1.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"/")," 并选择 ",$1.createElement("code",{className:"px-1.5 py-0.5 rounded bg-secondary text-foreground font-mono text-[11px] border border-border"},"plan"),"，即可让智能体生成计划。")');

  // [核心修复 10] 2.32.2+ 新增通用/浏览器/定制设置项与 MCP 工具展开状态原生汉化
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{switch\(a\)\{case "newWorkspace":return"(?:New Workspace|新建工作区)";case "noProject":return"(?:No Project|无项目)";case "lastWorkspace":return"Last Workspace"\}\}function ([a-zA-Z0-9_$]+)\(a\)\{switch\(a\)\{case "newWorkspace":return"Create a new workspace from your first message\.";case "noProject":return"Start without a workspace, for general questions\.";case "lastWorkspace":return"Reuse your last workspace\."\}\}/g,
    'function $1(a){switch(a){case "newWorkspace":return"新建工作区";case "noProject":return"无项目";case "lastWorkspace":return"上次工作区"}}function $2(a){switch(a){case "newWorkspace":return"从你的第一条消息自动创建一个新工作区。";case "noProject":return"不关联工作区直接开始，适合日常通用提问。";case "lastWorkspace":return"复用你上次使用的工作区。"}}'
  );
  sourceText = sourceText.replaceAll(
    /label:"New [Cc]onversation [Bb]utton",description:"Which workspace the New Conversation button and keyboard shortcut start you in\."/g,
    'label:"新建对话按钮",description:"设置点击“新建对话”按钮或按下对应快捷键时默认进入的工作区。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Browser actuation rules',
    /label:"Browser actuation rules",([\s\S]{0,650}?),"(?:Edit|编辑)"\)/g,
    (m) => m
      .replace('label:"Browser actuation rules"', 'label:"浏览器操作规则"')
      .replaceAll('"Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed."', '"配置浏览器子智能体允许和拒绝访问的网址。该智能体运行于内置浏览器中，无需单独安装浏览器。"')
      .replace('"Configure allowed and denied URLs for the browser subagent (invoked with /browser). Requires"," "', '"配置浏览器子智能体（通过 /browser 调用）允许和拒绝访问的网址。需要安装并运行 "')
      .replace('"需要安装并运行 "," "', '"需要安装并运行 "')
      .replace(',".")', ',"。")')
      .replace(',"Edit")', ',"编辑")')
  );
  sourceText = sourceText.replace(
    /z\?`\$\{C\} tool\$\{C!==1\?"s":""\}\s*enabled`:`\$\{v\.tools\.length\} tool\$\{v\.tools\.length!==\s*1\?"s":""\}\s*disabled`/g,
    'z?`已启用 ${C} 个工具`:`已禁用 ${v.tools.length} 个工具`'
  );
  sourceText = sourceText.replaceAll(
    'G?"Click to disable tool":"Click to enable tool"',
    'G?"点击禁用工具":"点击启用工具"'
  );
  sourceText = sourceText.replaceAll(
    'placeholder:"Paste auth code","aria-label":`Auth code for ${x}`',
    'placeholder:"粘贴授权码","aria-label":`${x} 的授权码`'
  );

  // =========================================================================
  // 9.12 自动化 (Automations) 创建页、定时计划编辑器与“通过提示词创建”全链路原生汉化
  // =========================================================================

  // 1. 点击“通过提示词创建”自动填入聊天输入框的默认提示词中文化（保留 [/automation](slashCommand;automation) 触发协议）
  sourceText = sourceText.replace(
    /\(f="\[\/automation\]\(slashCommand;automation\) Guide me through creating an automated task"\)\s*=>/g,
    '(f="[/automation](slashCommand;automation) 引导我创建一个自动化任务")=>'
  );

  // 2. 自动化创建页面：本地电脑与远程云端环境说明
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Uses your local files and tools. Schedules only.":',
    /([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+)=>\2==="local"\?"Uses your local files and tools\. Schedules only\.":`Runs even when your computer is off\. \$\{([a-zA-Z0-9_$]+)\?"Schedules and events\.":"Schedules only\."\}`/g,
    '$1=$2=>$2==="local"?"使用你的本地文件与工具。仅支持定时计划。":`即使电脑关机也能继续运行。${$3?"支持定时计划与事件触发。":"仅支持定时计划。"}`'
  );

  // 3. 定时计划时间选择器：AM/PM 时间格式、连接词 (at / on / on the / Repeat every)、频率与星期选项
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a,b\)\{var c=a<12\?"AM":"PM";return`\$\{a%12===0\?12:a%12\}:\$\{String\(b\)\.padStart\(2,"0"\)\} \$\{c\}`\}/g,
    'function $1(a,b){var c=a<12?"上午":"下午";return`${c} ${a%12===0?12:a%12}:${String(b).padStart(2,"0")}`}'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{return`\$\{a%12===0\?12:a%12\} \$\{a<12\?"AM":"PM"\}`\}/g,
    'function $1(a){return`${a<12?"上午":"下午"} ${a%12===0?12:a%12} 点`}'
  );
  sourceText = sourceText.replace(
    /const ([a-zA-Z0-9_$]+)=\[\{value:"hourly",label:"Every hour"\},\{value:"daily",label:"Every day"\},\{value:"weekdays",label:"Every weekday"\},\{value:"weekly",label:"Every week"\},\{value:"custom",label:"Custom\\u2026"\}\],([a-zA-Z0-9_$]+)=\["hourly","daily","weekly"\],([a-zA-Z0-9_$]+)=\[\{value:"hours",label:"hours"\},\{value:"week",label:"week"\},\{value:"month",label:"month"\}\],([a-zA-Z0-9_$]+)="Sun Mon Tue Wed Thu Fri Sat"\.split\(" "\),([a-zA-Z0-9_$]+)="Sunday Monday Tuesday Wednesday Thursday Friday Saturday"\.split\(" "\)/g,
    'const $1=[{value:"hourly",label:"每小时"},{value:"daily",label:"每天"},{value:"weekdays",label:"每个工作日"},{value:"weekly",label:"每周"},{value:"custom",label:"自定义\\u2026"}],$2=["hourly","daily","weekly"],$3=[{value:"hours",label:"小时"},{value:"week",label:"周"},{value:"month",label:"个月"}],$4="日 一 二 三 四 五 六".split(" "),$5="周日 周一 周二 周三 周四 周五 周六".split(" ")'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{return a>=11&&a<=13\?`\$\{a\}th`:`\$\{a\}\$\{\["th","st","nd","rd"\]\[a%10\]\?\?"th"\}`\}/g,
    'function $1(a){return`${a} 日`}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'text-muted-foreground select-none"},"at"',
    /([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-muted-foreground select-none"\},"at"\)/g,
    '$1.createElement("span",{className:"text-muted-foreground select-none"},"于")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'text-muted-foreground select-none"},"on"',
    /([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-muted-foreground select-none"\},"on"\)/g,
    '$1.createElement("span",{className:"text-muted-foreground select-none"},"于")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'text-muted-foreground select-none"},"on the"',
    /([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-muted-foreground select-none"\},"on the"\)/g,
    '$1.createElement("span",{className:"text-muted-foreground select-none"},"于每月")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Repeat every"',
    /([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-muted-foreground select-none"\},\s*"Repeat every"\)/g,
    '$1.createElement("span",{className:"text-muted-foreground select-none"},"重复周期：每")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"schedule-custom-unit"',
    /([A-Za-z_$][\w$]*)\.createElement\(([a-zA-Z0-9_$]+),\{value:v,label:v,options:([a-zA-Z0-9_$]+),onChange:d,testId:"schedule-custom-unit",ariaLabel:"Repeat unit"\}\)/g,
    '$1.createElement($2,{value:v,label:({"hours":"小时","week":"周","month":"个月"}[v]||v),options:$3,onChange:d,testId:"schedule-custom-unit",ariaLabel:"重复单位"})'
  );

  // 4. 自动化列表、下次/上次运行时间、分组标题与创建向导字段
  sourceText = sourceText.replace(
    /if\(f===0\)return`Today \$\{d\}`;if\(f===1\)return`Tomorrow \$\{d\}`;if\(f===-1\)return`Yesterday \$\{d\}`;/g,
    'if(f===0)return`今天 ${d}`;if(f===1)return`明天 ${d}`;if(f===-1)return`昨天 ${d}`;'
  );
  sourceText = sourceText.replace(
    /function ([a-zA-Z0-9_$]+)\(a\)\{switch\(a\)\{case "scheduled":return"Scheduled";case "live":return"Always on";case "paused":return"Paused";default:return a\}\}/g,
    'function $1(a){switch(a){case "scheduled":return"已设定期限";case "live":return"常驻运行";case "paused":return"已暂停";default:return a}}'
  );
  sourceText = sourceText.replaceAll(
    'a==="outside-of-project"?"Standalone":b',
    'a==="outside-of-project"?"独立运行":b'
  );
  sourceText = sourceText.replaceAll(
    'placeholder:"What should the agent do on each run? For example: summarize new bugs assigned to me and anything that changed overnight."',
    'placeholder:"智能体在每次运行时应做什么？例如：汇总分配给我的新缺陷以及昨晚发生的所有变更。"'
  );
  sourceText = sourceText.replaceAll(
    'label:"What should it do?",placeholder:"For example: every morning, summarize new bugs assigned to me and anything that changed overnight."',
    'label:"它应该执行什么任务？",placeholder:"例如：每天早晨汇总分配给我的新缺陷以及昨晚发生的所有变更。"'
  );
  sourceText = sourceText.replaceAll(
    'placeholder:"For example: Morning bug summary"',
    'placeholder:"例如：每日晨间缺陷汇总"'
  );
  sourceText = sourceText.replaceAll(
    '"Where should it run?"',
    '"在哪里运行？"'
  );
  sourceText = sourceText.replaceAll(
    '"When should it run?"',
    '"何时运行？"'
  );
  sourceText = sourceText.replaceAll(
    '{kind:"local",title:"This computer",icon:"computer"},{kind:"cloud",title:"Remote",icon:"cloud"}',
    '{kind:"local",title:"本地电脑",icon:"computer"},{kind:"cloud",title:"远程",icon:"cloud"}'
  );
  sourceText = sourceText.replaceAll(
    'title:a?"Approximate; may start a few minutes later":void 0',
    'title:a?"预计时间；实际可能推迟几分钟启动":void 0'
  );
  sourceText = sourceText.replaceAll(
    'customSubtitle:`Triggered ${u}`',
    'customSubtitle:`触发于 ${u}`'
  );
  sourceText = sourceText.replaceAll(
    '"Triggered ",u',
    '"触发于 ",u'
  );
  sourceText = sourceText.replaceAll(
    '"Your quota for this model is running low."',
    '"此模型的剩余配额即将耗尽。"'
  );
  sourceText = sourceText.replaceAll(
    '"Custom models are only supported on Linux machines."',
    '"自定义模型仅在 Linux 设备上受支持。"'
  );
  sourceText = sourceText.replaceAll(
    '"Loading models..."',
    '"正在加载模型..."'
  );
  sourceText = sourceText.replaceAll(
    '"No Model Selected"',
    '"未选择模型"'
  );
  sourceText = sourceText.replaceAll(
    '`${K.length} models selected`',
    '`已选择 ${K.length} 个模型`'
  );

  // =========================================================================
  // 9.13 新开对话英文标题实时自动转中文 + 原生持久化写回数据库钩子（跨版本自适应）
  // =========================================================================
  sourceText = sourceText.replace(
    /("trajectorySummaries\/markConversationAsReadThunk",async\(a,b\)=>\{var c=e,d=e;try\{let f=a\.cascadeId,g=a\.agentService;b\.dispatch\(([a-zA-Z0-9_$]+)\(\{cascadeId:f,annotations:\{markedAsUnread:!1\}\}\)\);d\(await c\(g\.updateConversationAnnotations\?\.\(f,([a-zA-Z0-9_$]+)\(([a-zA-Z0-9_$]+)\.ConversationAnnotationsSchema,\{markedAsUnread:!1,lastUserViewTime:([a-zA-Z0-9_$]+)\(new Date\)\}\),!0\)\)\)\}finally\{c\(\)\}\}\);)/g,
    '$1globalThis.__AGY_ZHCN_ANNOT_HELPERS__={localAction:(p)=>$2(p),makeProto:(o)=>$3($4.ConversationAnnotationsSchema,o)};'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'getStartingConversationIds:',
    /(\{updateConversationAnnotations:([a-zA-Z0-9_$]+)\}=[a-zA-Z0-9_$]+\(\),([a-zA-Z0-9_$]+)=[a-zA-Z0-9_$]+\(\),([a-zA-Z0-9_$]+)=[a-zA-Z0-9_$]+\(\);\s*\(0,[a-zA-Z0-9_$]+\.useEffect\)\(\(\)=>[a-zA-Z0-9_$]+\(\{subscribeToRoute:[a-zA-Z0-9_$]+=>[a-zA-Z0-9_$]+\.subscribe\("onResolved",[a-zA-Z0-9_$]+\),getCascadeIdParam:[a-zA-Z0-9_$]+,getBattleIdParam:[a-zA-Z0-9_$]+,dispatch:([a-zA-Z0-9_$]+)\.dispatch,deps:\{updateConversationAnnotations:\2,recordError:\3,getStartingConversationIds:\(\)=>[a-zA-Z0-9_$]+\(\5\.getState\(\)\)\}\}\),\[[^\]]+\]\);)(return \4\?)/g,
    '$1globalThis.__AGY_ZHCN_BIND_TITLE_WATCHER__?.($5,$2);$6'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'reportedByCaller:!0',
    /([a-zA-Z0-9_$]+=\(0,[a-zA-Z0-9_$]+\.useCallback\)\(async ([a-zA-Z0-9_$]+)=>\{)(var ([a-zA-Z0-9_$]+)=[a-zA-Z0-9_$]+,[a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+;try\{let [a-zA-Z0-9_$]+=[a-zA-Z0-9_$]+\(await \4\([a-zA-Z0-9_$]+\(\{cascadeId:([a-zA-Z0-9_$]+),annotations:\{title:\2\},onError:\{reportedByCaller:!0\}\}\)\)\);)/g,
    '$1globalThis.__AGY_ZHCN_RECORD_MANUAL_TITLE__?.($5,$2);$3'
  );

  // =========================================================================
  // 9.14 打开 SSH 主机弹窗（引导语、配置文件、连接进度、空状态与隐藏列表直替）
  // =========================================================================
  sourceText = fastAnchorReplace(
    sourceText,
    "or pick a host from your SSH config.",
    /"Enter \[user@\]host\[:port\], or pick a host from your SSH config\.",([a-zA-Z0-9_$]+)==="newProject"&&" Then create the project in its window\."/g,
    '"请输入 [user@]host[:port]，或从你的 SSH 配置中选择主机。",$1==="newProject"&&" 然后在其窗口中创建项目。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "ssh-connect-host-input",
    /(placeholder:"user@host:port","aria-label":)"SSH host"/g,
    '$1"SSH 主机"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "ssh-connect-button",
    /("ssh-connect-button",[^}]{0,220}?\},)([a-zA-Z0-9_$]+)\?"Connecting(?:\\u2026|…)":"Connect"/g,
    '$1$2?"正在连接…":"连接"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "Connecting to ${",
    /return ([a-zA-Z0-9_$]+)\.progress\?\?`Connecting to \$\{\1\.host\}(?:\\u2026|…)`/g,
    'return $1.progress??`正在连接到 ${$1.host}…`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Couldn\'t connect to "',
    /"Couldn't connect to ",([a-zA-Z0-9_$]+\.host)/g,
    '"无法连接到 ",$1'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "`SSH Config (${",
    /([a-zA-Z0-9_$]+)\("Recent",([\s\S]{0,180}?)\),\1\(([a-zA-Z0-9_$]+)\?`SSH Config \(\$\{\3\}\)`:"SSH Config",/g,
    '$1("最近使用",$2),$1($3?`SSH 配置（${$3}）`:"SSH 配置",'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "hidden hosts`",
    /([a-zA-Z0-9_$]+)\.length===1\?"1 hidden host":`\$\{\1\.length\} hidden hosts`/g,
    '`${$1.length} 个已隐藏主机`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Hidden hosts"',
    /role:"group","aria-label":"Hidden hosts"/g,
    'role:"group","aria-label":"已隐藏主机"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Loading hosts',
    /"Loading hosts(?:\\u2026|…)"/g,
    '"正在加载主机…"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "Couldn't load your SSH hosts",
    /"Couldn't load your SSH hosts\. You can still type one\."/g,
    '"无法加载 SSH 主机列表，你仍可直接输入一个。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"No hosts in "',
    /"No hosts in ",([a-zA-Z0-9_$]+)\?\?"~\/\.ssh\/config"," yet\. Type one above\."/g,
    '$1??"~/.ssh/config"," 中还没有主机，请在上方输入一个。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"SSH config: "',
    /"SSH config: "/g,
    '"SSH 配置："'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"~/.ssh/config (default)"',
    /"~\/\.ssh\/config \(default\)"/g,
    '"~/.ssh/config（默认）"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "ssh-config-file-choose",
    /("ssh-config-file-choose"[^}]{0,180}?\},)"Choose File(?:\\u2026|…)"/g,
    '$1"选择文件…"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    "ssh-config-file-use-default",
    /("ssh-config-file-use-default"[^}]{0,180}?\},)"Use Default"/g,
    '$1"恢复默认"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Remove from Recent"',
    /tooltip:"Remove from Recent",[\s\r\n]*label:`Remove \$\{([a-zA-Z0-9_$]+)\.host\} from Recent`/g,
    'tooltip:"从最近列表中移除",label:`从最近列表中移除 ${$1.host}`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Hide from this list"',
    /tooltip:([a-zA-Z0-9_$]+)\?"Hide from this list":"Show in the list again",[\s\r\n]*label:\1\?`Hide \$\{([a-zA-Z0-9_$]+)\.host\} from this list`:`Show \$\{\2\.host\} in the list again`/g,
    'tooltip:$1?"从列表中隐藏":"在列表中重新显示",label:$1?`从列表中隐藏 ${$2.host}`:`在列表中重新显示 ${$2.host}`'
  );

  // =========================================================================
  // 9.15 全客户端 2.35.1+ 深度补齐（项目设置、Token用量明细、快捷键方案、侧栏定制、自动化频率、通用弹窗与提示）
  // =========================================================================

  // 1. 项目/工作区设置页副标题、同名警告、定制筛选框与 Terminal/Environment 分组
  sourceText = fastAnchorReplace(
    sourceText,
    'with this name already exists.")',
    /"A ",([a-zA-Z0-9_$]+)\.lowercase," with this name already exists\."/g,
    '"已存在同名的",$1.lowercase==="workspace"?"工作区":"项目","。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"folders"}',
    /`Manage \$\{([a-zA-Z0-9_$]+)\.lowercase\} \$\{([a-zA-Z0-9_$]+)\?"resources":"folders"\}, agent settings, and permissions\.`/g,
    '`管理${$1.lowercase==="workspace"?"工作区":"项目"}${$2?"资源":"文件夹"}、智能体设置与权限。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"folders"} and settings.',
    /`Manage \$\{([a-zA-Z0-9_$]+)\.lowercase\} \$\{([a-zA-Z0-9_$]+)\?"resources":"folders"\} and settings\.`/g,
    '`管理${$1.lowercase==="workspace"?"工作区":"项目"}${$2?"资源":"文件夹"}与设置。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"project-customizations-workspace-filter"',
    /title:"Customizations",headerRight:([\s\S]{0,600}?)value:"all"\},"All Workspaces"\)([\s\S]{0,180}?)\|\|"Workspace"/g,
    (m) => m
      .replace('title:"Customizations"', 'title:"插件"')
      .replace('"All Workspaces"', '"全部工作区"')
      .replace('||"Workspace"', '||"工作区"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '?"Environment":"Terminal"',
    /title:([a-zA-Z0-9_$]+)\?"Environment":"Terminal"/g,
    'title:$1?"环境":"终端"'
  );

  // 2. Token 用量分布进度条、展开明细按钮 (Show N breakdowns) 与预算超限说明
  sourceText = fastAnchorReplace(
    sourceText,
    'Hide breakdown',
    /([a-zA-Z0-9_$]+)\?"Hide breakdown":`Show \$\{([a-zA-Z0-9_$]+)\.length\} breakdown\$\{\2\.length===1\?"":"s"\}`/g,
    '$1?"收起明细":`显示 ${$2.length} 项明细`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.toLocaleString()," / "',
    /\.toLocaleString\(\)," \/ ",([a-zA-Z0-9_$]+)\.toLocaleString\(\),(?:" tokens \(",|" ","tokens \(",)/g,
    '.toLocaleString()," / ",$1.toLocaleString()," Token (",'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.tokens.toLocaleString()," tokens)"',
    /\.tokens\.toLocaleString\(\)," tokens\)"/g,
    '.tokens.toLocaleString()," Token)"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '.tokens.toLocaleString()} tokens`',
    /`\$\{([a-zA-Z0-9_$]+)\.label\}: \$\{\1\.tokens\.toLocaleString\(\)\} tokens`/g,
    '`${$1.label}：${$1.tokens.toLocaleString()} Token`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'exceeded the customization budget and were excluded from context.',
    /if\(([a-zA-Z0-9_$]+)\)if\(([a-zA-Z0-9_$]+)\)\{var ([a-zA-Z0-9_$]+)="Demoted";var ([a-zA-Z0-9_$]+)=`Exceeded the rules token budget\. Full rule content \(\$\{([a-zA-Z0-9_$]+)\.numTokens\.toLocaleString\(\)\} tokens\) was replaced with a lightweight file-path pointer in context\.`\}else ([a-zA-Z0-9_$]+)&&\s*([a-zA-Z0-9_$]+)\?\(([a-zA-Z0-9_$]+)=Math\.max\(0,\5\.numTokens-\1\.numTokens\),\3=\8===0\?"Excluded":`\$\{([a-zA-Z0-9_$]+)\.size\} \$\{\9\.size===1\?"tool":"tools"\} excluded`,\4=\8===0\?`All tools in this MCP server \(\$\{\5\.numTokens\.toLocaleString\(\)\} tokens\) exceeded the customization budget and were excluded from context\.`:`\$\{\9\.size\} \$\{\9\.size===1\?"tool":"tools"\} in this MCP server \(\$\{\1\.numTokens\.toLocaleString\(\)\} tokens\) exceeded the customization budget and were excluded from context\.`\):\s*\(\3="Excluded",\4=`Exceeded the customization token budget \(\$\{\5\.numTokens\.toLocaleString\(\)\} tokens\) and was excluded from context\.`\);/g,
    'if($1)if($2){var $3="已降级";var $4=`已超出规则 Token 预算。完整规则内容（${$5.numTokens.toLocaleString()} Token）在上下文中已被替换为轻量文件路径指针。`}else $6&&$7?($8=Math.max(0,$5.numTokens-$1.numTokens),$3=$8===0?"已排除":`已排除 ${$9.size} 个工具`,$4=$8===0?`此 MCP 服务器的所有工具（${$5.numTokens.toLocaleString()} Token）超出了自定义预算，未纳入上下文。`:`此 MCP 服务器中的 ${$9.size} 个工具（${$1.numTokens.toLocaleString()} Token）超出了自定义预算，未纳入上下文。`):($3="已排除",$4=`已超出自定义项 Token 预算（${$5.numTokens.toLocaleString()} Token），未纳入上下文。`);'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Exceeded the customization token budget',
    /`Exceeded the customization token budget \(\$\{([a-zA-Z0-9_$.]+)\.numTokens\.toLocaleString\(\)\} tokens\) and was excluded from context\.`/g,
    '`已超出自定义项 Token 预算（${$1.numTokens.toLocaleString()} Token），未纳入上下文。`'
  );

  // 3. 快捷键方案设置页 (Shortcuts / Keybinding Scheme / VS Code Default / Antigravity Style)
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"VS Code Default"',
    /\[\{value:"vscode",label:"VS Code Default",recommended:!0,description:([a-zA-Z0-9_$]+)=>`Honors standard VS Code shortcuts without collisions \(e\.g\. \$\{\1\?"\\u2318L Focus Input, \\u2318\\u21e7L New Conversation, \\u2318\\u21e7A Picker, \\u2318\\u21e7, Settings":"Ctrl\+L Focus Input, Ctrl\+Shift\+L New Conversation, Ctrl\+Shift\+A Picker, Ctrl\+Shift\+, Settings"\}\)\.`\},\{value:"agy",label:"Antigravity \(AGY\) Style",description:([a-zA-Z0-9_$]+)=>`Uses standalone Antigravity chords \(e\.g\. \$\{\2\?"\\u2318I Focus Input, \\u2318\\u21e7O New Conversation, \\u2318K Picker in chat, \\u2318, Settings, \\u2318\[\/\] History\)\. Replaces Go to Symbol \(\\u2318\\u21e7O\) and Trigger Suggest \(\\u2318I\), and rebinds VS Code Settings to \\u2318\\u2325,\.":\s*"Ctrl\+I Focus Input, Ctrl\+Shift\+O New Conversation, Ctrl\+K Picker in chat, Ctrl\+, Settings, Ctrl\+\[\/\] History\)\. Replaces Go to Symbol \(Ctrl\+Shift\+O\) and Trigger Suggest \(Ctrl\+I\), and rebinds VS Code Settings to Ctrl\+Alt\+,\."\}`\}\]/g,
    '[{value:"vscode",label:"VS Code 默认",recommended:!0,description:$1=>`沿用标准 VS Code 快捷键且避免冲突（如 ${$1?"⌘L 聚焦输入框、⌘⇧L 新建对话、⌘⇧A 快速选择器、⌘⇧, 打开设置":"Ctrl+L 聚焦输入框、Ctrl+Shift+L 新建对话、Ctrl+Shift+A 快速选择器、Ctrl+Shift+, 打开设置"}）。`},{value:"agy",label:"Antigravity (AGY) 风格",description:$2=>`使用独立 Antigravity 组合键（如 ${$2?"⌘I 聚焦输入框、⌘⇧O 新建对话、⌘K 对话选择器、⌘, 打开设置、⌘[/] 历史记录）。会覆盖“转到符号 (⌘⇧O)”和“触发建议 (⌘I)”，并将 VS Code 设置重绑为 ⌘⌥,。":"Ctrl+I 聚焦输入框、Ctrl+Shift+O 新建对话、Ctrl+K 对话选择器、Ctrl+, 打开设置、Ctrl+[/] 历史记录）。会覆盖“转到符号 (Ctrl+Shift+O)”和“触发建议 (Ctrl+I)”，并将 VS Code 设置重绑为 Ctrl+Alt+,。"}`}]'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Shortcuts",description:"Manage your keybinding scheme',
    /title:"Shortcuts",description:"Manage your keybinding scheme and customize shortcuts in VS Code\."/g,
    'title:"快捷键",description:"管理你的快捷键方案并在 VS Code 中自定义快捷键。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'title:"Keybinding Scheme"',
    /title:"Keybinding Scheme",subtitle:"Choose between non-colliding VS Code defaults or standalone Antigravity chords\."/g,
    'title:"快捷键方案",subtitle:"选择互不冲突的 VS Code 默认快捷键，或使用独立的 Antigravity 组合键。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"aria-label":"Keybinding Scheme"',
    /"aria-label":"Keybinding Scheme"/g,
    '"aria-label":"快捷键方案"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Recommended"',
    /\.recommended&&([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-\[10px\] font-semibold leading-none bg-secondary text-secondary-foreground px-1\.5 py-0\.5 rounded-full border border-border"\},\s*"Recommended"\)/g,
    '.recommended&&$1.createElement("span",{className:"text-[10px] font-semibold leading-none bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full border border-border"},"推荐")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"VS Code keyboard shortcuts"',
    /"VS Code keyboard shortcuts"\),([A-Za-z_$][\w$]*)\.createElement\("span",\{className:"text-xs text-muted-foreground leading-relaxed"\},"Inspect live bindings or record custom key chords filtered to"," ",\1\.createElement\("code",\{className:"px-1 py-0\.5 rounded bg-secondary text-foreground font-mono text-\[11px\]"\},"antigravity\."\),"\s*","commands\."\)([\s\S]{0,420}?)"Open Keyboard Shortcuts"/g,
    (m) => m
      .replace('"VS Code keyboard shortcuts"', '"VS Code 键盘快捷键"')
      .replace('"Inspect live bindings or record custom key chords filtered to"," "', '"查看实时按键绑定，或录制已按 "')
      .replace('" ","commands."', '" 过滤的自定义组合键。"')
      .replace('"Open Keyboard Shortcuts"', '"打开键盘快捷键"')
  );

  // 4. 定制侧边栏 & 收件箱分组/排序菜单 (Customize Sidebar / Inbox Mode / Auto-Resolve / Filters)
  sourceText = fastAnchorReplace(
    sourceText,
    'label:"Never"},{value:3,label:"3 days"',
    /\[\{value:0,label:"Never"\},\{value:3,label:"3 days"\},\{value:7,label:"7 days"\},\{value:14,label:"14 days"\}\],([a-zA-Z0-9_$]+)=\[\{value:"any",label:"Any time"\},\{value:7,label:"7 days"\},\{value:14,label:"14 days"\},\{value:21,label:"21 days"\}\],([a-zA-Z0-9_$]+)=\[\{value:"last_updated",label:"Last Updated"\},\{value:"last_user_prompt",label:"Last Prompt"\},\{value:"custom",label:"Manual Order"\}\]/g,
    '[{value:0,label:"从不"},{value:3,label:"3 天"},{value:7,label:"7 天"},{value:14,label:"14 天"}],$1=[{value:"any",label:"任意时间"},{value:7,label:"7 天"},{value:14,label:"14 天"},{value:21,label:"21 天"}],$2=[{value:"last_updated",label:"最近更新"},{value:"last_user_prompt",label:"最近提问"},{value:"custom",label:"手动排序"}]'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'id:"env:local",label:"This Computer"',
    /\[\{id:"env:local",label:"This Computer",icon:"monitor"\},\{id:"env:cloud",label:"Remote",icon:"cloud"\}\];const ([a-zA-Z0-9_$]+)=\{last_updated:"Last Updated",last_user_prompt:"Last Prompt",custom:"Custom Order"\},([a-zA-Z0-9_$]+)=\{\.\.\.\1,custom:"Manual Order"\}/g,
    '[{id:"env:local",label:"本机",icon:"monitor"},{id:"env:cloud",label:"远程",icon:"cloud"}];const $1={last_updated:"最近更新",last_user_prompt:"最近提问",custom:"自定义排序"},$2={...$1,custom:"手动排序"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Customize Sidebar"',
    /"aria-label":"Customize Sidebar"([\s\S]{0,600}?)"Customize Sidebar"\)/g,
    (m) => m.replaceAll('"Customize Sidebar"', '"定制侧边栏"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'value:"repo",label:"Repo"',
    /\{value:"project",label:([a-zA-Z0-9_$]+)\},\.\.\.\(([a-zA-Z0-9_$]+)\?\[\{value:"repo",label:"Repo"\},\{value:"location",label:"Environment"\}\]:\[\]\),\{value:"status",label:"Status"\},\{value:"none",label:"None"\}\]([\s\S]{0,300}?)"Last Updated"/g,
    (m) => m
      .replace('label:"Repo"', 'label:"仓库"')
      .replace('label:"Environment"', 'label:"环境"')
      .replace('label:"Status"', 'label:"状态"')
      .replace('label:"None"', 'label:"无"')
      .replaceAll('"Last Updated"', '"最近更新"')
      .replaceAll('"All"', '"全部"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Locked while grouped by Status"',
    /"Inbox Mode"([\s\S]{0,1600}?)"Archived Only"([\s\S]{0,300}?)"Advanced"/g,
    (m) => m
      .replaceAll('"Inbox Mode"', '"收件箱模式"')
      .replaceAll('"Group By"', '"分组方式"')
      .replaceAll('"Sort By"', '"排序方式"')
      .replace('"Locked while grouped by Status"', '"按状态分组时已锁定"')
      .replaceAll('"Archived Only"', '"仅看已归档"')
      .replace('"Advanced"', '"高级"')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Keep running conversations in a separate Working section instead of in the Inbox."',
    /"Working Section"([\s\S]{0,1600}?)"Filters"([\s\S]{0,500}?)"Any time"/g,
    (m) => m
      .replaceAll('"Working Section"', '"进行中分组"')
      .replace('"Keep running conversations in a separate Working section instead of in the Inbox."', '"将运行中的对话保留在独立的“进行中”分组中，而不放入收件箱。"')
      .replaceAll('"Auto-Resolve"', '"自动归档"')
      .replace('"Move idle Inbox conversations to Resolved automatically after the selected time."', '"在超过所选时间后，自动将空闲的收件箱对话移至“已处理”。"')
      .replace('"7 days"', '"7 天"')
      .replaceAll('"Filters"', '"筛选"')
      .replaceAll('"Last Activity"', '"最近活动"')
      .replace('"Any time"', '"任意时间"')
  );

  // 5. 自动化列表频率展示器 (byd / cyd / dyd / eyd / fyd / hyd / D6)
  sourceText = fastAnchorReplace(
    sourceText,
    '"Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" ")',
    /const ([a-zA-Z0-9_$]+)="Sunday Monday Tuesday Wednesday Thursday Friday Saturday"\.split\(" "\),([a-zA-Z0-9_$]+)="Sun Mon Tue Wed Thu Fri Sat"\.split\(" "\);[\s\S]{0,1800}?`Daily at \$\{g\}`/g,
    (m) => m
      .replace('"Sunday Monday Tuesday Wednesday Thursday Friday Saturday"', '"周日 周一 周二 周三 周四 周五 周六"')
      .replace('"Sun Mon Tue Wed Thu Fri Sat"', '"日 一 二 三 四 五 六"')
      .replace('return`${a}th`;switch(a%10){case 1:return`${a}st`;case 2:return`${a}nd`;case 3:return`${a}rd`;default:return`${a}th`}', 'return`${a}日`;switch(a%10){case 1:return`${a}日`;case 2:return`${a}日`;case 3:return`${a}日`;default:return`${a}日`}')
      .replace('"weekdays"', '"工作日"')
      .replace('"weekends"', '"周末"')
      .replace('`${a[0]} and ${a[1]}`', '`${a[0]} 和 ${a[1]}`')
      .replace('`${a.slice(0,-1).join(", ")} and ${a[a.length-1]}`', '`${a.slice(0,-1).join("、")} 和 ${a[a.length-1]}`')
      .replaceAll('"Custom schedule"', '"自定义计划"')
      .replace('` on ${f}`', '` · ${f}`')
      .replace('`Every ${f[1]} minutes${g}`', '`每 ${f[1]} 分钟${g}`')
      .replace('"Every hour"', '"每小时"')
      .replace('`Every hour at :${String(h).padStart(2,\n"0")}`', '`每小时 :${String(h).padStart(2,"0")}`')
      .replace('`Every ${f[1]} hours${g}`', '`每 ${f[1]} 小时${g}`')
      .replace('`Every ${k[1]} hours${g}`', '`每 ${k[1]} 小时${g}`')
      .replace('`Every hour, ${', '`每小时，${')
      .replace(', on ${f}`', '（${f}）`')
      .replace('`Monthly on the ${', '`每月 ${')
      .replace('} at ${g}`', '} ${g}`')
      .replace('`${f.charAt(0).toUpperCase()+f.slice(1)} at ${g}`', '`${f} ${g}`')
      .replace('`Daily at ${g}`', '`每天 ${g}`')
  );

  // 6. 浏览数据行、立即发送提示条、全部撤销确认弹窗、插件动作映射、Orchestrator 模型器、终端命令发送状态、旁问条、插件包提示与 Git 推送
  sourceText = fastAnchorReplace(
    sourceText,
    '"data-testid":"browsing-data-row"',
    /"data-testid":"browsing-data-row",[\s\S]{0,420}?"Manage"\)/g,
    (m) => m
      .replace('label:"Browsing data"', 'label:"浏览数据"')
      .replace('description:"Clear history, cookies and site data from the built-in browser, or manage cookies for each site."', 'description:"清除内置浏览器中的历史记录、Cookie 和网站数据，或按网站分别管理 Cookie。"')
      .replace(',"Manage")', ',"管理")')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Messages now send immediately. Configure in"',
    /"Messages now send immediately\. Configure in",([\s\S]{0,180}?),"settings"\)/g,
    '"现在按回车会立即发送消息。可前往 ",$1,"设置")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"confirm-revoke-all"',
    /,"Cancel"\),([\s\S]{0,180}?)"confirm-revoke-all",onClick:([a-zA-Z0-9_$]+)\},"Revoke all"\)/g,
    ',"取消"),$1"confirm-revoke-all",onClick:$2},"全部撤销")'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'action:"download_url",label:"Browser downloads"',
    /\{action:"write_file",label:"Write files"\},\{action:"read_url",label:"Read URLs"\},\{action:"execute_url",label:"Browser actions"\},\{action:"download_url",label:"Browser downloads",icon:"download"\},\{action:"mcp",label:"MCP tools"\},\{action:"escalate_admin",label:"Admin escalation"\},\{action:"custom",label:"Custom"\}/g,
    '{action:"write_file",label:"写入文件"},{action:"read_url",label:"读取网址"},{action:"execute_url",label:"浏览器操作"},{action:"download_url",label:"浏览器下载",icon:"download"},{action:"mcp",label:"MCP 工具"},{action:"escalate_admin",label:"管理员提权"},{action:"custom",label:"自定义"}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Default (Gemini Pro)"',
    /\?"Default \(Gemini Pro\)":([^:]+):"The Orchestrator's own planner"/g,
    '?"默认 (Gemini Pro)":$1:"Orchestrator 默认规划器"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Default (Gemini Pro)"',
    /"Default \(Gemini Pro\)"/g,
    '"默认 (Gemini Pro)"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Suggested sending ${',
    /`Rejected sending \$\{([a-zA-Z0-9_$]+)\} to command`:([a-zA-Z0-9_$]+)===[A-Za-z_$][\w$]*\.CortexStepStatus\.DONE\?`Sent \$\{\1\} to command`:\2===[A-Za-z_$][\w$]*\.CortexStepStatus\.WAITING\?`Suggested sending \$\{\1\} to command`:\2===[A-Za-z_$][\w$]*\.CortexStepStatus\.ERROR\?`Error sending \$\{\1\} to command`:`Sending \$\{\1\} to command`([\s\S]{0,420}?)"Error Details:"/g,
    (m) => m
      .replace(/`Rejected sending \$\{([^}]+)\} to command`/, '`已拒绝将 ${$1} 发送到命令`')
      .replace(/`Sent \$\{([^}]+)\} to command`/, '`已将 ${$1} 发送到命令`')
      .replace(/`Suggested sending \$\{([^}]+)\} to command`/, '`建议将 ${$1} 发送到命令`')
      .replace(/`Error sending \$\{([^}]+)\} to command`/, '`将 ${$1} 发送到命令时出错`')
      .replace(/`Sending \$\{([^}]+)\} to command`/, '`正在将 ${$1} 发送到命令`')
      .replace('"Error Details:"', '"错误详情："')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"data-testid":"side-question-toolbar-button"',
    /`\$\{([a-zA-Z0-9_$]+)\} Help \\u00b7 \$\{([a-zA-Z0-9_$]+)\} Side Question\$\{\2===1\?"":"s"\}`:([a-zA-Z0-9_$]+)\?([a-zA-Z0-9_$]+)===1\?"Help":`\$\{\4\} Help`:`\$\{\4\} Side Question\$\{\4===1\?"":"s"\}`;([a-zA-Z0-9_$]+)=[\s\r\n]*([a-zA-Z0-9_$]+)\?`View \$\{\1\} help\$\{\1===1\?"":" items"\} and \$\{\2\} side question\$\{\2===1\?"":"s"\}`:\3\?`View \$\{\4\} help\$\{\4===1\?"":" items"\}`:`View \$\{\4\} side question\$\{\4===1\?"":"s"\}`/g,
    '`${$1} 项帮助 · ${$2} 个旁问`:$3?"帮助":`${$4} 个旁问`;$5=$6?`查看 ${$1} 项帮助和 ${$2} 个旁问`:$3?`查看 ${$4} 项帮助`:`查看 ${$4} 个旁问`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'conversations in progress. Updating will',
    /`You have \$\{([a-zA-Z0-9_$]+)\.length\} conversations in progress\. Updating will interrupt them, and they will automatically resume once the update completes\.`:`You have \$\{\1\.length\} conversations in progress\. Updating will cancel them and you'll need to manually restart them\.`:\1\.length===1\?([a-zA-Z0-9_$]+)\?"You have a conversation in progress\. Updating will interrupt it, and it will automatically resume once the update completes\.":"You have a conversation in progress\. Updating will cancel it and you'll need to manually restart it\."/g,
    '`你有 ${$1.length} 个对话正在进行中。更新将会中断这些对话，待更新完成后将自动恢复。`:`你有 ${$1.length} 个对话正在进行中。更新将会取消这些对话，之后需要手动重新启动。`:$1.length===1?$2?"你当前有 1 个对话正在进行中。更新将会中断该对话，待更新完成后将自动恢复。":"你当前有 1 个对话正在进行中。更新将会取消该对话，之后需要手动重新启动。"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Add bundle installs',
    /function ([a-zA-Z0-9_$]+)\(a\)\{return`\$\{a\} \$\{a===1\?"plugin":"plugins"\}`\}function ([a-zA-Z0-9_$]+)\(\{memberCount:a,remainingCount:b,allInstalled:c\}\)\{var d=\1\(a\);return c\?`\$\{d\}, all already installed\. Adding the bundle installs plugins it gains later\.`:b===0\?`\$\{d\}\. Adding the bundle installs plugins it gains later\.`:b>=a\?a===1\?`\$\{d\}\. Add bundle installs it\.`:`\$\{d\}\. Add bundle installs all of them\.`:`\$\{d\}\. Add bundle installs \$\{b\}; the ones you already have stay as they are\.`\}/g,
    'function $1(a){return`${a} 个插件`}function $2({memberCount:a,remainingCount:b,allInstalled:c}){var d=$1(a);return c?`${d}，均已安装。添加此插件包后，后续新增的插件将自动安装。`:b===0?`${d}。添加此插件包后，后续新增的插件将自动安装。`:b>=a?`${d}。添加此插件包将全部安装。`:`${d}。添加此插件包将安装其中尚未安装的 ${b} 个；已安装插件保持不变。`}'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'may have looser code review. Review',
    /`This plugin in \$\{([a-zA-Z0-9_$]+)\} may have looser code review\. Review its contents before adding the bundle\.`:`These plugins in \$\{\1\} may have looser code review\. Review their contents before adding the bundle\.`/g,
    '`来自 ${$1} 的此插件可能代码审查较为宽松。添加插件包前请先检查其内容。`:`来自 ${$1} 的这些插件可能代码审查较为宽松。添加插件包前请先检查其内容。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'key:"git-push",label:"Push"',
    /key:"git-push",label:"Push",tooltip:([a-zA-Z0-9_$]+)\?`Push \$\{([a-zA-Z0-9_$]+)\} commit\$\{\2===1\?"":"s"\} to \$\{\1\}`:([a-zA-Z0-9_$]+)\?\.currentRef\?`Publish \$\{\3\.currentRef\} to origin`:"Push",([\s\S]{0,420}?)disabledReason:\3\?\.hasPushRemote===!1\?"No remote configured":\3\?\.currentRef\?\1!==void 0&&\2===0\?"No commits to push":void 0:"Not on a branch",([\s\S]{0,220}?)("Pushing\.\.\.")/g,
    (m) => m
      .replace('key:"git-push",label:"Push"', 'key:"git-push",label:"推送"')
      .replace(/`Push \$\{([^}]+)\} commit\$\{\1===1\?"":"s"\} to \$\{([^}]+)\}`/, '`推送 ${$1} 个提交到 ${$2}`')
      .replace(/`Publish \$\{([^}]+)\.currentRef\} to origin`/, '`将 ${$1.currentRef} 发布到 origin`')
      .replace(':"Push",', ':"推送",')
      .replace('"No remote configured"', '"未配置远程仓库"')
      .replace('"No commits to push"', '"没有待推送的提交"')
      .replace('"Not on a branch"', '"当前不在分支上"')
      .replace('"Pushing..."', '"正在推送..."')
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Hide non-admin ("',
    /"Hide non-admin \(",[\s\r\n]*([a-zA-Z0-9_$]+\.length),[\s\r\n]*"\)"/g,
    '"隐藏非管理员 (",$1,")"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Show all ("',
    /"Show all \(",[\s\r\n]*([a-zA-Z0-9_$]+\.length),[\s\r\n]*"\)"/g,
    '"显示全部 (",$1,")"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '"Show all ("',
    /"Show all \(",[\s\r\n]*([a-zA-Z0-9_$]+),[\s\r\n]*" hidden\)"/g,
    '"显示全部 (",$1," 个已隐藏)"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'docKindLabel:`Google Doc',
    /docKindLabel:`Google Doc\$\{(\/\\bprd\\b\/i\.test\([a-zA-Z0-9_$]+\)\?[\s\r\n]*" \\u00b7 PRD":\/design\\s\*doc\|\\brfc\\b\/i\.test\([a-zA-Z0-9_$]+\)\?)" \\u00b7 Design Doc":(""\})`/g,
    'docKindLabel:`Google 文档${$1" \\u00b7 设计文档":$2`'
  );

  // 9.16 其他订阅方案、企业组织托管、管理员策略与自动化凭据提示
  sourceText = fastAnchorReplace(
    sourceText,
    'Managed by your organization.',
    /`\$\{([a-zA-Z0-9_$]+\([a-zA-Z0-9_$.]+\))\}\. Managed by your organization\.`:`\$\{\1\}\. Managed by your organization\. Disabling the bundle turns off its plugins\.`:[\s\r\n]*([a-zA-Z0-9_$]+)\?`\$\{\1\}\. Disabling or removing the bundle applies only to the ones it installed\.`/g,
    '`${$1}。由你的组织托管。`:`${$1}。由你的组织托管。停用此组合包将关闭其包含的插件。`:$2?`${$1}。停用或移除此组合包仅作用于它所安装的插件。`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '(disabled by admin)',
    /`\$\{([a-zA-Z0-9_$]+)\} \(disabled by admin\)`/g,
    '`${$1}（已被管理员禁用）`'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '" (ADC)"',
    /&&" \(ADC\)"/g,
    '&&"（ADC）"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    'Grant permission',
    /"Administrator access \(UAC\)",detail:([a-zA-Z0-9_$]+)\?\.reason\|\|"Grant one-time administrator access",canInlineApprove:!0\}:\{label:`Permission: \$\{([a-zA-Z0-9_$]+)\}`,detail:\(([a-zA-Z0-9_$]+)\?\.target\?\?""\)\|\|"Grant permission"/g,
    '"管理员权限 (UAC)",detail:$1?.reason||"授予一次性管理员权限",canInlineApprove:!0}:{label:`权限：${$2}`,detail:($3?.target??"")||"授予权限"'
  );
  sourceText = fastAnchorReplace(
    sourceText,
    '104857600-byte',
    /`upload file size \(\$\{String\(([a-zA-Z0-9_$]+)\)\} bytes\) exceeds 52428800-byte \(50 MiB\) limit`([\s\S]{0,120}?)`total upload size \(\$\{([a-zA-Z0-9_$]+)\} bytes\) exceeds 104857600-byte \(100 MiB\) limit`([\s\S]{0,160}?)`total upload size \(\$\{([a-zA-Z0-9_$.]+)\} bytes\) exceeds 104857600-byte \(100 MiB\) limit`/g,
    '`上传文件大小（${String($1)} 字节）超过 52428800 字节（50 MiB）上限`$2`总上传大小（${$3} 字节）超过 104857600 字节（100 MiB）上限`$4`总上传大小（${$5} 字节）超过 104857600 字节（100 MiB）上限`'
  );

  const overlay = createRuntimeOverlay(dictionary);
  const localized = Buffer.from(
    `${sourceText}\n/* __AGY_ZHCN_SIDECAR_OVERLAY_BEGIN__ */\n${overlay}\n/* __AGY_ZHCN_SIDECAR_OVERLAY_END__ */`,
    "utf8",
  );
  return {
    buffer: localized,
    sha256: sha256Buffer(localized),
    coverage: skipCoverage ? { hits: 0, total: Object.keys(dictionary.exact).length } : countBundleDictionaryHits(sourceText, dictionary),
  };
}

export async function writeLocalizedBundle(outputPath, localizedBuffer) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, localizedBuffer, { flag: "w" });
}
