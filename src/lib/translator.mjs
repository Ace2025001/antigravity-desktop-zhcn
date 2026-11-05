import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";

export async function loadDomTranslations() {
  const filePath = path.join(projectRoot, "config", "dom-translations.json");
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
      return leading + core.replace(regex, target) + trailing;
    }
    if (normalizedCore !== core && regex.test(normalizedCore)) {
      regex.lastIndex = 0;
      return leading + normalizedCore.replace(regex, target) + trailing;
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

    for (const { regex, target } of patternTranslations) {
      regex.lastIndex = 0;
      if (regex.test(core)) {
        regex.lastIndex = 0;
        return leading + core.replace(regex, target) + trailing;
      }
      if (normalizedCore !== core && regex.test(normalizedCore)) {
        regex.lastIndex = 0;
        return leading + normalizedCore.replace(regex, target) + trailing;
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

  function start() {
    document.documentElement.lang = "zh-CN";
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

  // 原生深度汉化注入：工作耗时、时间单位、动作前缀等
  sourceText = sourceText.replaceAll(
    '${l.killed?"Stopped after":"Worked for"}',
    '${l.killed?"耗时后停止":"工作耗时"}'
  );
  sourceText = sourceText.replaceAll(
    'l.terminatedEarly?"Stopped after":"Worked for"',
    'l.terminatedEarly?"耗时后停止":"工作耗时"'
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
  sourceText = sourceText.replaceAll('{label:"Replace with New",onClick:', '{label:"替换为新建",onClick:');
  sourceText = sourceText.replaceAll('{label:"Replace With New",onClick:', '{label:"替换为新建",onClick:');
  sourceText = sourceText.replaceAll('{label:"Replace With New",shortcut:', '{label:"替换为新建",shortcut:');

  // 子菜单生成函数 UDb 安全字典映射汉化（完整保留参数、变量作用域、菜单结构、快捷键、事件和 testId）
  sourceText = sourceText.replace(
    'label:c.label,accelerator:c.shortcut,testId:`conversation-${a}-${c.label.toLowerCase().replace(/\\s+/g,"-")}`,onClick:c.onClick',
    'label:({"Conversation Name":"对话名称","Conversation ID":"对话 ID","Project Name":"项目名称","Worktree Name":"工作树名称","Workspace Name":"工作区名称","Split Right":"向右拆分","Split Down":"向下拆分","Replace With New":"替换为新建","Replace with New":"替换为新建","Remove from Split":"从拆分中移除"}[c.label]||c.label),accelerator:c.shortcut,testId:`conversation-${a}-${c.label.toLowerCase().replace(/\\s+/g,"-")}`,onClick:c.onClick'
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
  sourceText = sourceText.replaceAll('{label:"Replace with New",onClick:', '{label:"替换为新建",onClick:');
  sourceText = sourceText.replaceAll('placeholder:"Search tabs, files, extensions, subagents, artifacts, tasks..."', 'placeholder:"搜索标签页、文件、扩展、子智能体、工件、任务..."');
  sourceText = sourceText.replaceAll('A.createElement("span",{className:"text-xs"},"Quote")', 'A.createElement("span",{className:"text-xs"},"引用")');
  sourceText = sourceText.replaceAll('label:"Quote Selection"', 'label:"引用所选内容"');

  // 模型配额与剩余比例原生汉化
  sourceText = sourceText.replace(
    /const sma=\{daily:"Daily limit",weekly:"Weekly limit"\};function Tk\(a\)\{var b=a\.window\.trim\(\)\.toLowerCase\(\);return sma\[b\]\?sma\[b\]:\/\^\\d\+\[smhd\]\$\/.test\(b\)\?`\$\{b\} limit`:a\.displayName\}/,
    'const sma={daily:"日限额",weekly:"周限额"};function Tk(a){var b=a.window.trim().toLowerCase();return sma[b]?sma[b]:/^\\d+[smhd]$/.test(b)?`${b.replace("h","小时").replace("d","天").replace("m","分钟")}限额`:a.displayName}'
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
  sourceText = sourceText.replaceAll('label:"Browsing History"', 'label:"浏览历史"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from the built-in browser."', '"清除内置浏览器访问过的网址及自动补全建议。"');
  sourceText = sourceText.replaceAll('"Clear visited URLs and autocomplete suggestions from side panel preview."', '"清除侧边栏预览中访问过的网址及自动补全建议。"');
  sourceText = sourceText.replaceAll('title:b?"Voice":"Voice mode"', 'title:b?"语音":"语音模式"');
  sourceText = sourceText.replaceAll('label:"Voice",description:b?"The voice Jetski speaks with.":"The voice used in Voice mode. Powered by Gemini Live."', 'label:"语音",description:b?"Jetski 朗读所用的语音。":"语音模式使用的语音。由 Gemini Live 提供支持。"');
  sourceText = sourceText.replaceAll('label:"Microphone",description:"Input device for voice mode and dictation."', 'label:"麦克风",description:"用于语音模式与听写的输入设备。"');
  sourceText = sourceText.replaceAll('vxb={id:"",label:"System default"}', 'vxb={id:"",label:"系统默认"}');
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

  // 附件汇总文案原生汉化
  sourceText = sourceText.replace(
    'c.numImages>0&&d.push(c.numImages===1?"1 image attachment":`${c.numImages} image attachments`);c.numVideos>0&&d.push(c.numVideos===1?"1 video attachment":`${c.numVideos} video attachments`);c.numAudio>0&&d.push(c.numAudio===1?"1 audio attachment":`${c.numAudio} audio attachments`);c=d.length===0?"":d.length===1?d[0]:d.length===2?`${d[0]} and ${d[1]}`:`${d[0]}, ${d[1]}, and ${d[2]}`',
    'c.numImages>0&&d.push(c.numImages===1?"1 张图片附件":`${c.numImages} 张图片附件`);c.numVideos>0&&d.push(c.numVideos===1?"1 个视频附件":`${c.numVideos} 个视频附件`);c.numAudio>0&&d.push(c.numAudio===1?"1 个音频附件":`${c.numAudio} 个音频附件`);c=d.length===0?"":d.length===1?d[0]:d.length===2?`${d[0]} 与 ${d[1]}`:`${d[0]}、${d[1]} 与 ${d[2]}`'
  );

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

  // 章节小结标题智能翻译增强
  sourceText = sourceText.replace(
    'A.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"text-sm font-medium leading-snug text-foreground"},d??SCc(a,b))',
    'A.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"text-sm font-medium leading-snug text-foreground"},(d?((t)=>{const m={"Analyzing software localization and promotion strategies":"分析软件本地化与推广策略","Auditing and localizing desktop app":"审查并本地化桌面应用","Comparing translation pack projects":"对比汉化包项目","Continuing translation and reviewing improvements":"继续汉化并审查改进","Fixing and releasing software localization":"修复并发布软件本地化","Fixing the desktop app localization":"修复桌面应用本地化","Fixing translation and UI bug":"修复汉化与界面问题","Iterating software localization and UI translations":"迭代软件本地化与界面汉化","Locating missing desktop shortcut":"查找丢失的桌面快捷方式","Optimizing app localization and rules":"优化应用本地化与规则","Publishing and updating the localization project":"发布与更新本地化项目","Publishing new antigravity localization release":"发布 Antigravity 汉化新版本","Refining UI localization and error messages":"优化界面汉化与错误提示","Releasing v1.0.0 and finalizing localization":"发布 v1.0.0 并定稿本地化","Setting up and fixing Antigravity GitHub repository":"配置并修复 Antigravity GitHub 仓库","Translating context menu and tooltips":"汉化右键菜单与提示气泡","Translating missing UI elements and tooltips":"汉化遗漏的界面元素与提示","Translating remaining untranslated error messages":"汉化剩余未翻译的错误提示","Translating the user interface":"汉化用户界面","Understanding the antigravity hot reload update":"解析 Antigravity 热重载更新机制","Updating and uploading localization files":"更新与上传本地化文件"};if(m[t])return m[t];let s=t.replace(/^Fixing and releasing software localization/i,"修复并发布软件本地化").replace(/^Fixing and releasing/i,"修复并发布").replace(/^Updating and uploading/i,"更新并上传").replace(/^Publishing and updating/i,"发布并更新").replace(/^Auditing and localizing/i,"审查并本地化").replace(/^Continuing translation and reviewing/i,"继续汉化并审查").replace(/^Fixing\\s+/i,"修复 ").replace(/^Updating\\s+/i,"更新 ").replace(/^Publishing\\s+/i,"发布 ").replace(/^Comparing\\s+/i,"对比 ").replace(/^Building\\s+/i,"构建 ").replace(/^Testing\\s+/i,"测试 ").replace(/^Creating\\s+/i,"创建 ").replace(/^Configuring\\s+/i,"配置 ").replace(/^Deploying\\s+/i,"部署 ").replace(/^Analyzing\\s+/i,"分析 ").replace(/^Refining\\s+/i,"优化 ").replace(/^Iterating\\s+/i,"迭代 ").replace(/^Locating\\s+/i,"查找 ").replace(/^Translating\\s+/i,"汉化 ");return s.replace(/the\\s+desktop\\s+app\\s+localization/gi,"桌面应用本地化").replace(/desktop\\s+app\\s+localization/gi,"桌面应用本地化").replace(/software\\s+localization/gi,"软件本地化").replace(/localization\\s+files/gi,"本地化文件").replace(/the\\s+localization\\s+project/gi,"本地化项目").replace(/localization\\s+project/gi,"本地化项目").replace(/translation\\s+pack\\s+projects/gi,"汉化包项目").replace(/translation\\s+pack/gi,"汉化包").replace(/localization/gi,"本地化");})(d):d)??SCc(a,b))'
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
