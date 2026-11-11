import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";
import { languageFile } from "./language-pack.mjs";

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
  const serialized = JSON.stringify(dictionary.exact);
  const normalizedPatterns = (dictionary.patterns ?? []).map((p) => ({
    ...p,
    target: normalizePatternTarget(p.target),
  }));
  const serializedPatterns = JSON.stringify(normalizedPatterns);
  return `
;(() => {
  "use strict";
  const exactTranslations = new Map(Object.entries(${serialized}));
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
    "[data-testid='model-selector-item']",
    "[data-testid='model-selector-effort-group']",
    "[data-testid='model-selector-effort-option']"
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

  function __fmtDurToZh(dur) {
    if (typeof dur !== "string") return String(dur ?? "");
    return dur.trim()
      .replace(/(\\d+)\\s*d(?:ays?)?\\b/gi, "$1 天")
      .replace(/(\\d+)\\s*h(?:(?:ou)?rs?)?\\b/gi, "$1 小时")
      .replace(/(\\d+)\\s*m(?:ins?|inutes?)?\\b/gi, "$1 分钟")
      .replace(/(\\d+)\\s*s(?:ecs?|econds?)?\\b/gi, "$1 秒")
      .replace(/(\\d+)(天|小时|分钟|秒)/g, "$1 $2")
      .replace(/\\s+/g, " ")
      .trim();
  }

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
    if (dictHit !== undefined && !/Pro\s+配额|Ultra\s+配额|限额/.test(dictHit)) return dictHit;
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
    "Updating and uploading localization files": "更新与上传本地化文件"
  };

  function __translateChapterTitle(title) {
    if (typeof title !== "string" || !title.trim()) return title;
    var t = title.trim();
    if (__chapterExactMap[t]) return __chapterExactMap[t];
    var dictHit = exactTranslations.get(t);
    if (dictHit !== undefined) return dictHit;
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

  globalThis.__AGY_ZHCN_TRANSLATE_PLAN__ = __translatePlanName;
  globalThis.__AGY_ZHCN_TRANSLATE_PLAN_DESC__ = __translatePlanDesc;
  globalThis.__AGY_ZHCN_TRANSLATE_CHAPTER__ = __translateChapterTitle;
  globalThis.__AGY_ZHCN_TRANSLATE_DUR__ = __fmtDurToZh;

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
    m = normalizedCore.match(/^(?:Worked for|工作耗时)\\s+(.+?)\\s*(?:\\u00b7|·)\\s*(\\d+)\\s*(?:updates?|条(?:进度)?更新)$/i);
    if (m) return leading + "工作耗时 " + __fmtDurToZh(m[1]) + " · " + m[2] + " 条进度更新" + trailing;
    m = normalizedCore.match(/^(?:Stopped after|耗时后停止)\\s+(.+?)\\s*(?:\\u00b7|·)\\s*(\\d+)\\s*(?:updates?|条(?:进度)?更新)$/i);
    if (m) return leading + "耗时后停止 " + __fmtDurToZh(m[1]) + " · " + m[2] + " 条进度更新" + trailing;
    m = normalizedCore.match(/^Worked for\\s+(.+)$/i);
    if (m) return leading + "工作耗时 " + __fmtDurToZh(m[1]) + trailing;
    m = normalizedCore.match(/^Stopped after\\s+(.+)$/i);
    if (m) return leading + "耗时后停止 " + __fmtDurToZh(m[1]) + trailing;
    m = normalizedCore.match(/^(\\d+)\\s*updates?$/i);
    if (m) return leading + m[1] + " 条进度更新" + trailing;
    m = normalizedCore.match(/^(\\d+)\\s*turns?$/i);
    if (m) return leading + m[1] + " 轮对话" + trailing;
    m = normalizedCore.match(/^Turn\\s+(\\d+)$/i);
    if (m) return leading + "第 " + m[1] + " 轮" + trailing;
    m = normalizedCore.match(/^Turns\\s+(\\d+)[\\u2013-](\\d+)$/i);
    if (m) return leading + "第 " + m[1] + "–" + m[2] + " 轮" + trailing;

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

    return null;
  }

  function translateTextNode(node) {
    const parent = node.parentElement;
    if (!parent || isBlocked(parent)) return;
    const translated = translateValue(node.nodeValue);
    if (translated !== null && translated !== node.nodeValue) {
      node.nodeValue = translated;
      stats.translatedTextNodes += 1;
    } else if (collector.enabled && translated === null && node.nodeValue?.trim()) {
      collector.record({
        text: node.nodeValue.trim(),
        tagName: parent.tagName,
        role: parent.getAttribute("role") || "",
        attributeName: ""
      });
    }
  }

  function translateElementAttributes(element) {
    if (isAttributeBlocked(element)) return;
    for (const attribute of translatedAttributes) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const translated = translateValue(current);
      if (translated !== null && translated !== current) {
        element.setAttribute(attribute, translated);
        stats.translatedAttributes += 1;
      } else if (collector.enabled && translated === null && current?.trim()) {
        collector.record({
          text: current.trim(),
          tagName: element.tagName,
          role: element.getAttribute("role") || "",
          attributeName: attribute
        });
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
    element.dataset.agyZhcnDynamic = "pending";
    try {
      const response = await fetch("http://127.0.0.1:45831/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: source })
      });
      const result = response.ok ? await response.json() : null;
      if (typeof result?.translatedText === "string" && result.translatedText.trim()) {
        element.textContent = result.translatedText;
        stats.translatedTextNodes += 1;
      }
    } catch (_) {
      // Local translator is optional; leave the original UI visible if unavailable.
    } finally {
      element.dataset.agyZhcnDynamic = "done";
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

export function createLocalizedBundle(sourceBuffer, dictionary) {
  let sourceText = sourceBuffer.toString("utf8");

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
    'return c>0?"个文件":d>0?"个工件":""'
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
    'function K4({title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n}){var _d=d&&(globalThis.__AGY_ZHCN_TRANSLATE__?.(d)??globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(d));if(_d)d=_d;var _f=f&&globalThis.__AGY_ZHCN_TRANSLATE_MD__?.(f);if(_f)f=_f;'
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
  sourceText = sourceText.replaceAll('"UI Extension (SidePanel)"', '"UI 扩展（侧边面板）"');
  sourceText = sourceText.replaceAll('"Scheduled Task"', '"定时任务"');
  sourceText = sourceText.replaceAll(':"Automation"', ':"自动化"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.RUNNING:return{label:"Running"', 'case I.SidecarStatus.RUNNING:return{label:"运行中"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.STARTING:return{label:"Starting"', 'case I.SidecarStatus.STARTING:return{label:"启动中"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.STOPPED:return{label:"Stopped"', 'case I.SidecarStatus.STOPPED:return{label:"已停止"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.ERRORED:return{label:"Error"', 'case I.SidecarStatus.ERRORED:return{label:"错误"');
  sourceText = sourceText.replaceAll('case I.SidecarStatus.BACKOFF:return{label:"Backoff"', 'case I.SidecarStatus.BACKOFF:return{label:"重试等待"');
  sourceText = sourceText.replaceAll('default:return{label:"Unknown"', 'default:return{label:"未知"');
  sourceText = sourceText.replaceAll('"Side Pane UI Available"', '"侧边栏界面可用"');
  sourceText = sourceText.replaceAll('"Stream and control ",q," directly in the side pane."', '"直接在侧边栏中流式传输并控制 ",q,"。"');
  sourceText = sourceText.replaceAll('"Open in Side Pane"', '"在侧边栏中打开"');
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
    'var _mL={"Rename":"重命名","Pin":"置顶","Unpin":"取消置顶","Mark Read":"标记为已读","Mark Unread":"标记为未读","Copy":"复制","Cut":"剪切","Paste":"粘贴","Select All":"全选","Undo":"撤销","Redo":"重做","Delete":"删除","Delete Permanently":"永久删除","Archive":"归档","Restore":"恢复","Share":"分享","Stop":"停止","Split":"拆分","Fork":"分支","View Debug":"查看调试信息","Telemetry":"遥测","New Group":"新建分组","Remove from Group":"从分组中移除","Conversation Name":"对话名称","Conversation ID":"对话 ID","Project Name":"项目名称","Workspace Name":"工作区名称","Worktree Name":"工作树名称","Split Right":"向右拆分","Split Down":"向下拆分","Replace with New":"替换为新对话","Replace With New":"替换为新对话","Remove from Split":"从拆分中移除","Copy Image":"复制图片","Save Image":"保存图片","Save Video":"保存视频","Open in Tab":"在标签页中打开","Open in New Tab":"在新标签页中打开","Copy Link Address":"复制链接地址","Open Link in New Tab":"在新标签页中打开链接","Open Link in External Browser":"在外部浏览器中打开链接","Open Image in New Tab":"在新标签页中打开图片","Copy Image Address":"复制图片地址","Copy Message":"复制消息","Copy Path":"复制路径","Undo to Here":"撤销到此处","Fork in Shared Workspace":"在共享工作区中派生","Fork in New Workspace":"在新建工作区中派生","Close Other Tabs":"关闭其他标签页","Close Tabs to the Left":"关闭左侧标签页","Close Tabs to the Right":"关闭右侧标签页","Comment":"评论","Open in Code Search":"在代码搜索中打开","Edit Shortcut":"编辑快捷键","Add Shortcut":"添加快捷键","Remove Shortcut":"移除快捷键","Reset to Default":"恢复默认"};var g={id:f,label:(_mL[d.label]||globalThis.__AGY_ZHCN_TRANSLATE__?.(d.label)||d.label),type:d.type&&d.type!=="item"&&d.type!=="label"?d.type:"normal"'
  );
  sourceText = sourceText.replace(
    'var s1=({option:a,iconOnly:b=!1})=>{var c=qB();return a.tagTitle&&a.tagDescription?B.createElement(B.Fragment,null,B.createElement("div",{"data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&B.createElement("span",null,a.tagTitle),B.createElement(dq,{name:"info",className:"h-3 w-3 flex-none"})),B.createElement(Sy,{id:c},B.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?B.createElement("div",\n{className:"bg-secondary rounded-full px-1.5 text-sm"},a.tagTitle):null};',
    'var s1=({option:a,iconOnly:b=!1})=>{var c=qB(),tT=({"Notice":"提示","Unavailable":"不可用","New":"新"}[a.tagTitle]||a.tagTitle),tD=a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":(a.tagDescription&&(globalThis.__AGY_ZHCN_TRANSLATE__?.(a.tagDescription)||a.tagDescription));return a.tagTitle&&a.tagDescription?B.createElement(B.Fragment,null,B.createElement("div",{"data-model-selector-badge":"true","data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&B.createElement("span",{"data-model-selector-badge":"true"},tT),B.createElement(dq,{name:"info",className:"h-3 w-3 flex-none"})),B.createElement(Sy,{id:c},B.createElement("div",{className:"max-w-[200px]"},tD))):a.tagTitle?B.createElement("div",\n{"data-model-selector-badge":"true",className:"bg-secondary rounded-full px-1.5 text-sm"},tT):null};'
  );
  sourceText = sourceText.replaceAll('function S2b(a){switch(a){case "system":return"System UI";case "inter":return"Inter";case "google-sans":return"Google Sans"}}', 'function S2b(a){switch(a){case "system":return"系统默认";case "inter":return"Inter";case "google-sans":return"Google Sans"}}');
  sourceText = sourceText.replaceAll('label:"Screen Reader Mode",description:"Optimize the interface and terminal output for screen readers."', 'label:"屏幕阅读器模式",description:"针对屏幕阅读器优化界面和终端输出。"');
  sourceText = sourceText.replaceAll('label:"Conversation Width",description:"Configure the maximum width of the conversation panel."', 'label:"对话宽度",description:"配置对话面板的最大显示宽度。"');
  sourceText = sourceText.replaceAll('case 2:return"Narrow";case 3:return"Wide";case 4:return"Fill";default:return"Default"', 'case 2:return"窄";case 3:return"宽";case 4:return"铺满";default:return"默认"');
  sourceText = sourceText.replaceAll('label:"Terminal Placement",description:"Choose where terminal sessions appear."', 'label:"终端位置",description:"选择终端会话的显示位置。"');
  sourceText = sourceText.replaceAll('case "bottomPanel":return"Bottom Panel";default:return"Side Panel"', 'case "bottomPanel":return"底部面板";default:return"侧边栏面板"');
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
  sourceText = sourceText.replaceAll(',"Change\\u2026"))})),g&&B.createElement(UP,{label:"Browsing History",description:c?"Clear visited URLs and autocomplete suggestions from side panel preview.":"Clear visited URLs and autocomplete suggestions from the built-in browser.",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",disabled:p.length===0,onClick:q,"data-testid":"clear-browser-history-button"},"Clear")', ',"更改…"))})),g&&B.createElement(UP,{label:"浏览记录",description:c?"清除侧边栏预览中的访问网址与自动填充建议。":"清除内置浏览器中的访问网址与自动填充建议。",rightElement:B.createElement(Uy,{variant:"secondary",size:"sm",disabled:p.length===0,onClick:q,"data-testid":"clear-browser-history-button"},"清除")');
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
    'kf=H?B.createElement("span",null,"This project was created for"," ",J?B.createElement(B.Fragment,null,"the ",B.createElement("strong",null,J)):"an"," ","automation. ",$e):B.createElement("span",null,$e)',
    'kf=H?B.createElement("span",null,"此项目专为 ",J?B.createElement(B.Fragment,null,"“",B.createElement("strong",null,J),"”"):"某项"," 自动化创建。", " ",$e):B.createElement("span",null,$e)'
  );
  sourceText = sourceText.replace(
    'p?B.createElement("span",null,"This ",A.lowercase," is managed by the"," ",B.createElement("strong",null,q)," automation and can only be deleted by deleting that automation."):',
    'p?B.createElement("span",null,"此",A.lowercase==="workspace"?"工作区":"项目","由 ",B.createElement("strong",null,q)," 自动化统一管理，只能通过删除该自动化来删除。"):'
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
  sourceText = sourceText.replace(
    /([a-zA-Z0-9_$]+)=\{low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"\}/,
    '$1={low:"低",medium:"中",high:"高",xhigh:"超高",max:"最大"}'
  );
  sourceText = sourceText.replaceAll('"Context window"', '"上下文窗口"');
  sourceText = sourceText.replaceAll('window:"Default"', 'window:"默认"');

  // 模型数据适配层源头汉化（支持 Claude 思考模型、单项 GPT-OSS 规格汉化，保留多规格英文以确保二级菜单正常折叠聚合）
  sourceText = sourceText.replace(
    /([a-zA-Z0-9_$]+)=a=>a\.modelOrAlias\?\{label:a\.label,value:a\.modelOrAlias\.choice\.case==="model"\?a\.modelOrAlias\.choice\.value:([A-Za-z0-9_$]+)\.Model\.UNSPECIFIED,modelAlias:a\.modelOrAlias\.choice\.case==="alias"\?a\.modelOrAlias\.choice\.value:void 0,disabled:a\.disabled,supportedMimeTypes:new Map\(Object\.entries\(a\.supportedMimeTypes\)\),quotaInfo:a\.quotaInfo,tagTitle:a\.tagTitle,tagDescription:a\.tagDescription,/,
    '$1=a=>a.modelOrAlias?{label:(a.label==="GPT-OSS 120B (Medium)"?"GPT-OSS 120B (中)":typeof a.label==="string"?a.label.replace(/\\s*\\(Thinking\\)/gi," (思考)"):a.label),value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:$2.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:({"Notice":"提示","Unavailable":"不可用","New":"新"}[a.tagTitle]||a.tagTitle),tagDescription:a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":a.tagDescription,'
  );

  // 兜底支持已解构参数的适配层
  sourceText = sourceText.replace(
    /\{label:a\.label,value:a\.modelOrAlias\.choice\.case==="model"\?a\.modelOrAlias\.choice\.value:([A-Za-z0-9_$]+)\.Model\.UNSPECIFIED,modelAlias:a\.modelOrAlias\.choice\.case==="alias"\?a\.modelOrAlias\.choice\.value:void 0,disabled:a\.disabled,supportedMimeTypes:new Map\(Object\.entries\(a\.supportedMimeTypes\)\),quotaInfo:a\.quotaInfo,tagTitle:a\.tagTitle,tagDescription:a\.tagDescription,/,
    '{label:(a.label==="GPT-OSS 120B (Medium)"?"GPT-OSS 120B (中)":typeof a.label==="string"?a.label.replace(/\\s*\\(Thinking\\)/gi," (思考)"):a.label),value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:$1.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:({"Notice":"提示","Unavailable":"不可用","New":"新"}[a.tagTitle]||a.tagTitle),tagDescription:a.tagDescription==="GPT-OSS will be removed from Antigravity on November 2, 2026."?"GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。":a.tagDescription,'
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
  sourceText = sourceText.replaceAll('c=b?"Side Panel":"Built-in Browser"', 'c=b?"侧边栏面板":"内置浏览器"');
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
  sourceText = sourceText.replaceAll('"Side Panel Preview"', '"侧边栏预览"');
  sourceText = sourceText.replaceAll('title:p?"Side Panel Preview":"Built-in Browser"', 'title:p?"侧边栏预览":"内置浏览器"');
  sourceText = sourceText.replaceAll('title:p?"Side Panel Preview":"内置浏览器"', 'title:p?"侧边栏预览":"内置浏览器"');
  sourceText = sourceText.replaceAll('subtitle:p?void 0:"Configure link opening and built-in browser preferences."', 'subtitle:p?void 0:"配置链接打开方式与内置浏览器偏好。"');
  sourceText = sourceText.replaceAll('d=b?"Side Panel":"Built-in Browser",f=b?"New Tab":"External Browser"', 'd=b?"侧边栏":"内置浏览器",f=b?"新标签页":"外部浏览器"');
  sourceText = sourceText.replaceAll('label:"Download Location"', 'label:"下载位置"');
  sourceText = sourceText.replaceAll('"Folder where files downloaded in the built-in browser are saved."', '"内置浏览器下载文件的保存目录。"');
  sourceText = sourceText.replaceAll('"CitC workspace paths are world-readable and permanently snapshotted. Choose a local folder outside CitC."', '"CitC 工作区路径对所有人可见且永久保留快照，请选择 CitC 之外的本地文件夹。"');
  sourceText = sourceText.replaceAll('},"Change\\u2026"))})),m&&A.createElement(XP,{label:"Browsing History"', '},"更改…"))})),m&&A.createElement(XP,{label:"浏览记录"');
  sourceText = sourceText.replaceAll('label:"Browsing History"', 'label:"浏览记录"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from the built-in browser."', '"清除内置浏览器的访问网址与自动填充建议。"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from side panel preview."', '"清除侧边栏预览中的访问网址与自动填充建议。"');
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
  sourceText = sourceText.replaceAll('label:"Fork in Shared Workspace"', 'label:"在共享工作区中派生"');
  sourceText = sourceText.replaceAll('label:"Fork in New Workspace"', 'label:"在新建工作区中派生"');
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
  sourceText = sourceText.replaceAll('tooltip:"Open in side pane"', 'tooltip:"在侧边栏中打开"');
  sourceText = sourceText.replaceAll('tooltip:"Open in Notebook View"', 'tooltip:"在笔记本视图中打开"');
  sourceText = sourceText.replaceAll('tooltip:"Download File"', 'tooltip:"下载文件"');
  sourceText = sourceText.replaceAll('tooltip:"Kill Terminal"', 'tooltip:"终止终端"');

  // 对话时间轴轮次与步骤卡片原生汉化
  sourceText = sourceText.replaceAll('g=[`${g} turn${g===1?"":"s"}`];', 'g=[`${g} 轮对话`];');
  sourceText = sourceText.replaceAll('a===b?`Turn ${a}`:`Turns ${a}\\u2013${b}`', 'a===b?`第 ${a} 轮`:`第 ${a}–${b} 轮`');
  sourceText = sourceText.replaceAll('d||`Turn ${a.turnIndex+1}`', 'd||`第 ${a.turnIndex+1} 轮`');
  sourceText = sourceText.replaceAll('"aria-label":`Go to turn ${a} of ${c}`', '"aria-label":`前往第 ${a} 步（共 ${c} 步）`');
  sourceText = sourceText.replaceAll('"aria-label":`Turn ${a+1} of ${b}`', '"aria-label":`第 ${a+1} 步（共 ${b} 步）`');
  sourceText = sourceText.replaceAll('A.createElement("span",null,a," of ",c)', 'A.createElement("span",null,a," / ",c)');
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

  const overlay = createRuntimeOverlay(dictionary);
  const localized = Buffer.from(`${sourceText}\n${overlay}`, "utf8");
  return {
    buffer: localized,
    sha256: sha256Buffer(localized),
    coverage: countBundleDictionaryHits(sourceText, dictionary),
  };
}

export async function writeLocalizedBundle(outputPath, localizedBuffer) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, localizedBuffer, { flag: "w" });
}
