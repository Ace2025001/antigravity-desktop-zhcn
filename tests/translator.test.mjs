import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import {
  countBundleDictionaryHits,
  createLocalizedBundle,
  createRuntimeOverlay,
  loadDomTranslations,
  translateDictionaryValue,
} from "../src/lib/translator.mjs";

const dictionary = {
  schemaVersion: 2,
  exact: {
    Settings: "设置",
    "New Conversation": "新建对话",
  },
  patterns: [
    {
      source:
        "^Quota refreshes in ([0-9]+) hours?, ([0-9]+) minutes?\\.$",
      target: "额度将在 $1 小时 $2 分钟后恢复。",
      flags: "u",
    },
  ],
};

test("runtime overlay keeps the original bundle unchanged", () => {
  const source = Buffer.from(
    `const state = "Settings"; console.log("New Conversation");`,
    "utf8",
  );
  const localized = createLocalizedBundle(source, dictionary);
  const output = localized.buffer.toString("utf8");

  assert.ok(output.startsWith(source.toString("utf8")));
  assert.match(output, /const state = "Settings"/);
  assert.match(output, /exactTranslations/);
  assert.match(output, /patternTranslations/);
  assert.equal(localized.coverage.hits, 2);
});

test("runtime overlay excludes editors and code-like regions", () => {
  const overlay = createRuntimeOverlay(dictionary);
  assert.match(overlay, /contenteditable/);
  assert.match(overlay, /monaco-editor/);
  assert.match(overlay, /blockedAttributeSelector/);
  assert.match(overlay, /isAttributeBlocked/);
  assert.match(overlay, /model-selector/);
  assert.match(overlay, /Node\.TEXT_NODE/);
});

test("dictionary hit count is deterministic", () => {
  assert.deepEqual(
    countBundleDictionaryHits("Settings only", dictionary),
    { hits: 1, total: 2 },
  );
});

test("dictionary translation supports exact and narrowly scoped dynamic text", () => {
  assert.equal(translateDictionaryValue("  Settings  ", dictionary), "  设置  ");
  assert.equal(
    translateDictionaryValue("Quota refreshes in 2 hours, 3 minutes.", dictionary),
    "额度将在 2 小时 3 分钟后恢复。",
  );
  assert.equal(translateDictionaryValue("Quota refreshes tomorrow.", dictionary), null);
});

test("Antigravity 2.5.0 settings and usage strings are covered", async () => {
  const current = await loadDomTranslations();
  const visibleStrings = [
    "Models & Usage",
    "Manage your model quota and credits.",
    "Plan",
    "You can upgrade to a Google AI Ultra plan to receive higher rate limits.",
    "Model Credits",
    "Enable AI Credit Overages",
    "When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits.",
    "Gemini Models",
    "Weekly Limit",
    "You have used some of your weekly limit, it will fully refresh in 2 days, 23 hours.",
    "Five Hour Limit",
    "Claude and GPT models",
    "Configure agent execution, queued message delivery, and permissions.",
    "Execution",
    "Queued Messages",
    "Configure when follow-up messages are sent.",
    "Keyboard shortcuts",
    "Queue After Turn",
    "Send Immediately",
    "Verbose Agent Chat",
    "Display and preserve intermediate thinking steps.",
    "Conversation Width",
    "Configure the maximum width of the conversation panel.",
    "Default",
    "Open IDE",
    "Message input",
    "Ask anything, @ to mention, / for actions",
    "Add context",
    "Select model, current: Gemini 3.6 Flash (High)",
    "Gemini 3.6 Flash (High)",
    "Record voice memo",
    "Send message",
    "Select Agent",
    "Main Agent",
    "Display Options",
    "Project options",
    "New Conversation in Project",
    "Typeahead menu",
    "Always Ask",
    "File Permissions",
    "Network Permissions",
    "Terminal & Tooling Permissions",
    "Dark",
    "Light",
    "System",
    "Requires manual review for all terminal commands and file accesses outside of the working folders.",
    "Full machine",
    "All terminal commands require review. The agent can read or write to any file in the machine.",
    "Turbo mode",
    "Disables all safety barriers for maximal iteration velocity.",
    "Manually customize individual settings.",
    "Outside of folders file access policy",
    "Configures how the agent tries to access files outside of its working folders.",
    "Require Review",
    "Build With Google Plugins",
    "Customize",
    "Block all browser JavaScript execution.",
    "Prompt for approval before running browser scripts.",
    "Allow full browser script execution without prompting.",
  ];

  for (const source of visibleStrings) {
    const translated = translateDictionaryValue(source, current);
    assert.ok(translated, `missing screenshot translation: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u, `translation is not Chinese: ${source}`);
  }
});

test("Antigravity 2.6.0 settings and plugin strings are covered", async () => {
  const current = await loadDomTranslations();
  const visibleStrings = [
    "Agent Terminal Customizations",
    "Allow sandboxed commands to make network requests.",
    "Autonomous",
    "Autonomous mode active: the agent works independently, and does not ask questions or request new permissions.",
    "Discover helpful skills & plugins",
    "Every terminal command requires approval.",
    "Hooks",
    "Keep the app accessible from the menu bar and running in the background when all windows are closed.",
    "Let the agent access past conversations to inform its responses.",
    "Open files in the background if the agent creates or edits them",
    "Open the agent panel on window reload",
    "Plugin details",
    "Predict the location of your next edit and navigate you there with a tab keypress.",
    "Terminal Setup Script",
    "The agent always asks for confirmation before executing terminal commands (except those in the Allow list).",
    "The agent always asks for review.",
    "The agent asks for permission before executing commands matched by a deny list entry.",
    "The agent auto-executes commands matched by an allow list entry.",
    "Use my conversation history to tell me which skills and plugins would be helpful for me.",
    "View Usage",
  ];

  for (const source of visibleStrings) {
    const translated = current.exact[source];
    assert.ok(translated, `missing translation for: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u, `translation is not Chinese: ${source}`);
  }
});

test("Antigravity 2.15.0 agent permission confirmation dialog strings and templates are covered", async () => {
  const current = await loadDomTranslations();
  const exactStrings = [
    "Allow reading this URL?",
    "Allow executing actions on this URL?",
    "Allow read access to this path?",
    "Allow write access to this path?",
    "Allow running this command?",
    "Allow running this command outside the sandbox?",
    "Allow using this MCP tool?",
    "Allow a one-time administrator (UAC) elevation?",
    "Allow access to this resource?",
    "Save rule to always allow reading this URL?",
    "Save rule to always allow executing actions on this URL?",
    "Save rule to always allow read access to this path?",
    "Save rule to always allow write access to this path?",
    "Save rule to always allow running this command?",
    "Save rule to always allow running this command outside the sandbox?",
    "Save rule to always allow using this MCP tool?",
    "Save rule to always allow a one-time administrator (UAC) elevation?",
    "Save rule to always allow access to this resource?",
    "Yes, allow",
    "Yes, allow this time",
    "Yes, and always allow",
    "Yes, and always allow in this conversation",
    "Yes, and always allow in this project",
    "Yes, and always allow in this workspace",
    "Yes, and always allow when not in a project",
    "Yes, save rule",
    "Yes, save rule globally",
    "Yes, save rule in this conversation",
    "Yes, save rule in this project",
    "Yes, save rule in this workspace",
    "Yes, save rule when not in a project",
    "No (tell the agent what to do instead)",
    "(tell the agent what to do instead)",
    "Skip",
    "Skip All",
    "Always Allow",
    "Allow Once",
    "Allow once",
    "Deny",
    "Edit permission target",
    "Confirm the command is safe to run outside of the sandbox with full network and disk access.",
    "Requesting a one-time administrator (UAC) elevation",
    "Requires manual confirmation.",
    "Agent needs permission to execute JavaScript",
  ];

  for (const source of exactStrings) {
    const translated = translateDictionaryValue(source, current);
    assert.ok(translated, `missing exact permission translation: ${source}`);
    assert.match(translated, /[\u3400-\u9fff]/u, `translation is not Chinese: ${source}`);
  }

  const dynamicTemplates = [
    {
      source: "Yes, and always allow 'github.com' in this conversation",
      expected: "是，并始终在当前对话中允许“github.com”",
    },
    {
      source: "Yes, and always allow 'C:/dev/project' when not in a project",
      expected: "是，并在非项目环境下始终允许“C:/dev/project”",
    },
    {
      source: "Yes, and always allow 'npm test' in this project",
      expected: "是，并在此项目中始终允许“npm test”",
    },
    {
      source: "Yes, and always allow 'my-tool' in this workspace",
      expected: "是，并在此工作区中始终允许“my-tool”",
    },
    {
      source: "Yes, and always allow 'api.example.com'",
      expected: "是，并始终允许“api.example.com”",
    },
    {
      source: "Yes, save rule for 'github.com' in this conversation",
      expected: "是，并在当前对话中为“github.com”保存规则",
    },
    {
      source: "Yes, save rule for 'C:/dev/project' when not in a project",
      expected: "是，并在非项目环境下为“C:/dev/project”保存规则",
    },
    {
      source: "Yes, save rule for 'npm test' in this project",
      expected: "是，并在此项目中为“npm test”保存规则",
    },
    {
      source: "Yes, save rule for 'my-tool' in this workspace",
      expected: "是，并在此工作区中为“my-tool”保存规则",
    },
    {
      source: "Yes, save rule for 'api.example.com' globally",
      expected: "是，并全局为“api.example.com”保存规则",
    },
    {
      source: "Yes, save rule for 'api.example.com'",
      expected: "是，并为“api.example.com”保存规则",
    },
    {
      source: "Requesting permission to read C:/app/src",
      expected: "正在请求读取 C:/app/src 的权限",
    },
    {
      source: "Requesting permission to write C:/app/src/main.rs",
      expected: "正在请求写入 C:/app/src/main.rs 的权限",
    },
    {
      source: "Requesting permission to run git status",
      expected: "正在请求运行 git status 的权限",
    },
    {
      source: "Requesting permission to run (unsandboxed) cargo build",
      expected: "正在请求在沙箱外运行 cargo build 的权限",
    },
    {
      source: "Requesting permission to use sqlite_query",
      expected: "正在请求使用 sqlite_query 的权限",
    },
    {
      source: "Requesting permission to grant administrator access for netsh",
      expected: "正在请求为 netsh 提升管理员权限",
    },
    {
      source: "Conflicts with your configured Ask permission: read_file(/etc/hosts)",
      expected: "与已配置的“询问”权限冲突：read_file(/etc/hosts)",
    },
    {
      source: "Requires manual confirmation: command(rm -rf /)",
      expected: "需要手动确认：command(rm -rf /)",
    },
    {
      source: "Agent needs permission to execute JavaScript on docs.anthropic.com",
      expected: "智能体需要权限以在 docs.anthropic.com 上执行 JavaScript",
    },
    {
      source: "Agent needs permission to act on example.com",
      expected: "智能体需要权限以在 example.com 上执行操作",
    },
  ];

  for (const { source, expected } of dynamicTemplates) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `dynamic pattern translation mismatch for: ${source}`,
    );
  }

  const unknownDynamicStrings = [
    "Allow custom tool execution on target?",
  ];
  for (const source of unknownDynamicStrings) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      null,
      `unknown permission string should not produce partial translation: ${source}`,
    );
  }
});

test("system tray and native menu strings are covered by exact and pattern rules", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    { source: "No agents running", expected: "无正在运行的智能体" },
    { source: "Open Antigravity", expected: "打开 Antigravity" },
    { source: "Quit", expected: "退出" },
    { source: "New Window", expected: "新建窗口" },
    { source: "Docs", expected: "文档" },
    { source: "Check for Updates", expected: "检查更新" },
    { source: "1 agent running", expected: "1 个智能体正在运行" },
    { source: "3 agents running", expected: "3 个智能体正在运行" },
    {
      source: "when working in these conversations.",
      expected: "在这些对话中生效。",
    },
    {
      source: "when working in these conversations",
      expected: "在这些对话中生效",
    },
    {
      source: "Inherits your Global Permissions when working in these conversations.",
      expected: "在这些对话中工作时继承你的全局权限。",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `tray menu string translation mismatch for: ${source}`,
    );
  }
});

test("task and subagent running and blocked dynamic status strings are covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    { source: "1 task running", expected: "1 个任务正在运行" },
    { source: "2 tasks running", expected: "2 个任务正在运行" },
    { source: "1 subagent running", expected: "1 个子智能体正在运行" },
    { source: "3 subagents running", expected: "3 个子智能体正在运行" },
    { source: "2 subagents/tasks running", expected: "2 个子智能体/任务正在运行" },
    { source: "1 subagent blocked", expected: "1 个子智能体受阻" },
    { source: "2 subagents blocked", expected: "2 个子智能体受阻" },
    { source: "1 blocked", expected: "1 个受阻" },
    { source: "3 blocked", expected: "3 个受阻" },
    { source: "Background Task", expected: "后台任务" },
    { source: "Background Tasks", expected: "后台任务" },
    { source: "1 conversations", expected: "1 个对话" },
    { source: "5 files changed", expected: "5 个文件发生变更" },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `running status translation mismatch for: ${source}`,
    );
  }
});

test("desktop screenshots UI audit items are fully covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    // Tooltips with keyboard shortcuts
    { source: "Select Project Ctrl+;", expected: "选择项目 Ctrl+;" },
    { source: "Select Model Ctrl+/", expected: "选择模型 Ctrl+/" },
    { source: "Record Audio Ctrl+M", expected: "录制音频 Ctrl+M" },
    { source: "Send message Enter", expected: "发送消息 Enter" },
    { source: "Queue message Enter", expected: "排队消息 Enter" },

    // IDE install tooltip
    {
      source: "Install Antigravity IDE to run and edit your workspace scripts.",
      expected: "安装 Antigravity IDE 以运行和编辑工作区脚本。",
    },

    // Reset countdown patterns (no partial English)
    { source: "Resets in 4h 42m", expected: "将在 4 小时 42 分钟后重置" },
    { source: "Resets in 11h 48m", expected: "将在 11 小时 48 分钟后重置" },
    { source: "Resets in 6d 12h", expected: "将在 6 天 12 小时后重置" },
    { source: "Resets in 2d 5h", expected: "将在 2 天 5 小时后重置" },
    { source: "Resets in 30m", expected: "将在 30 分钟后重置" },

    // Slash command descriptions
    {
      source: "Run until the specified goal is completely finished.",
      expected: "运行直至指定目标完全完成。",
    },
    {
      source: "Run an instruction on a recurring schedule or as a one-time timer.",
      expected: "按循环计划或作为一次性定时器运行指令。",
    },
    {
      source: "Invoke a browser agent for web tasks.",
      expected: "调用浏览器智能体执行网页任务。",
    },
    {
      source: "Interview me to align on a plan.",
      expected: "通过问答访谈与我对齐方案。",
    },
    {
      source: "Invoke a team of agents to autonomously tackle large projects.",
      expected: "调用智能体团队自主处理大型项目。",
    },
    {
      source: "Reflect on recent successes or corrections to capture reusable skills or rules.",
      expected: "反思近期的成功经验或纠错记录，沉淀可复用的技能或规则。",
    },
    {
      source: "Invoke the Boost multi-agent orchestrator for complex tasks.",
      expected: "调用 Boost 多智能体编排器处理复杂任务。",
    },
    {
      source: "Ask a quick question without interrupting the main conversation.",
      expected: "快速提问而不中断主对话。",
    },

    // Add context popup menu items
    { source: "Media", expected: "媒体" },
    { source: "Mentions", expected: "提及" },
    { source: "Screen Recording", expected: "屏幕录制" },
    { source: "Screenshot", expected: "屏幕截图" },
    { source: "Console logs", expected: "控制台日志" },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `screenshot audit translation mismatch for: ${source}`,
    );
  }
});

test("welcome and onboarding authentication strings are fully covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    { source: "Welcome to Antigravity", expected: "欢迎使用 Antigravity" },
    { source: "Sign in", expected: "登录" },
    { source: "Awaiting Authentication...", expected: "正在等待身份验证..." },
    { source: "Awaiting Authentication…", expected: "正在等待身份验证…" },
    { source: "Use business account", expected: "使用企业账号" },
    { source: "Having trouble? Let us know", expected: "遇到问题？请告诉我们" },
    { source: "Continue with Google", expected: "通过 Google 继续" },
    { source: "Sign in with business account", expected: "使用企业账号登录" },
    { source: "Security Notice & Data Use", expected: "安全须知与数据使用" },
    {
      source: "AI coding agents are known to have certain security limitations. Users should be aware of potential risks, including data exfiltration and possible code execution. Avoid processing highly sensitive data and verify all the actions taken by the agent.",
      expected: "AI 编程智能体存在一定的安全局限性。用户应当了解潜在风险，包括数据渗漏和可能的代码执行。请避免处理高度敏感的数据，并核验智能体执行的所有操作。"
    },
    { source: "Finish", expected: "完成" },
    { source: "Google Privacy Policy", expected: "Google 隐私权政策" },
    {
      source: "Yes, I agree to help improve Antigravity by allowing Google to collect and use my Interactions data, subject to the Google Antigravity Terms of Service and Google Privacy Policy. I understand I can choose to opt out later whenever I want via my settings.",
      expected: "是的，我同意通过允许 Google 收集并使用我的互动数据来帮助改进 Antigravity，须遵守 Google Antigravity Terms of Service 和 Google 隐私权政策。我知晓自己随时可以在设置中选择退出。"
    },
    {
      source: "Yes, I agree to help improve ",
      expected: "是的，我同意帮助改进 "
    },
    {
      source: " by allowing Google to collect and use my Interactions data, subject to the",
      expected: " （允许 Google 收集并使用我的互动数据），须遵守"
    },
    {
      source: ". I understand I can choose to opt out later whenever I want via my settings.",
      expected: "。我知晓自己随时可以在设置中选择退出。"
    },
    {
      source: "Yes, I'd like to receive product updates, tips, and promotions from Google Antigravity via email.",
      expected: "是的，我希望通过电子邮件接收来自 Google Antigravity 的产品更新、技巧与促销信息。"
    },
    {
      source: "Get started",
      expected: "开始使用"
    },
    {
      source: "Get Started",
      expected: "开始使用"
    },
    {
      source: "The full developer experience with code and tooling.",
      expected: "包含代码与工具链的完整开发者体验。"
    },
    {
      source: "General work",
      expected: "常规办公"
    },
    {
      source: "Research, writing, and everyday tasks, without code.",
      expected: "研究、写作与日常任务，无需编写代码。"
    },
    {
      source: "Copy sign-in link",
      expected: "复制登录链接"
    },
    {
      source: "Continue with SSO",
      expected: "通过单点登录 (SSO) 继续"
    },
    {
      source: "Use Business Account",
      expected: "使用企业账号"
    }
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `onboarding translation mismatch for: ${source}`,
    );
  }
});

test("third-party model access notice and notifications are covered by exact and pattern rules", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    { source: "Changes to third-party model access", expected: "第三方模型访问权限变更" },
    { source: "Third-party model access", expected: "第三方模型访问" },
    { source: "Notice", expected: null },
    {
      source: "Opus 5.5 and Sonnet 5.5 are available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.",
      expected: "Opus 5.5 与 Sonnet 5.5 仅适用于付费的 Pro 和 Ultra 方案。自 2026 年 11 月 2 日起，你当前的方案将不再支持第三方模型访问。"
    },
    {
      source: "Sonnet 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.",
      expected: "Sonnet 5.5 现已在付费 Pro 与 Ultra 方案中可用。自 2026 年 11 月 2 日起，你当前的方案将不再支持访问第三方模型。"
    },
    {
      source: "Opus 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 2, 2026.",
      expected: "Opus 5.5 现已在付费 Pro 与 Ultra 方案中可用。自 2026 年 11 月 2 日起，你当前的方案将不再支持访问第三方模型。"
    },
    {
      source: "GPT-OSS 120B is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on December 1, 2026.",
      expected: "GPT-OSS 120B 现已在付费 Pro 与 Ultra 方案中可用。自 2026 年 12 月 1 日起，你当前的方案将不再支持访问第三方模型。"
    },
    {
      source: "Sonnet 5.5 is now available on paid Pro and Ultra plans. Third-party model access will no longer be available on your current plan starting on November 18, 2026.",
      expected: "Sonnet 5.5 现已在付费 Pro 与 Ultra 方案中可用。自 2026 年 11 月 18 日起，你当前的方案将不再支持访问第三方模型。"
    },
    {
      source: "Third-party model access will no longer be available on your current plan starting on November 2, 2026.",
      expected: "自 2026 年 11 月 2 日起，你当前的方案将不再支持访问第三方模型。"
    },
    {
      source: "GPT-OSS will be removed from Antigravity on November 2, 2026.",
      expected: "GPT-OSS 将于 2026 年 11 月 2 日从 Antigravity 中移除。"
    },
    {
      source: "Claude 3.5 Sonnet will be removed from Antigravity on December 15, 2026.",
      expected: "Claude 3.5 Sonnet 将于 2026 年 12 月 15 日从 Antigravity 中移除。"
    },
    {
      source: "Gemini 1.5 Pro will be removed from Antigravity on January 1, 2027.",
      expected: "Gemini 1.5 Pro 将于 2027 年 1 月 1 日从 Antigravity 中移除。"
    },
    {
      source: "Llama 3 70B will be removed from Antigravity on March 31, 2027.",
      expected: "Llama 3 70B 将于 2027 年 3 月 31 日从 Antigravity 中移除。"
    },
    {
      source: "Mistral Large will be removed from Antigravity.",
      expected: "Mistral Large 将从 Antigravity 中移除。"
    },
    {
      source: "Upgrade to Google AI Ultra to continue using Opus 4.6.",
      expected: "升级到 Google AI Ultra 以继续使用 Opus 4.6。"
    },
    {
      source: "Manage your model quota and AI credits.",
      expected: "管理你的模型配额与 AI 点数。"
    },
    {
      source: "Selected model does not support this media type",
      expected: "所选模型不支持此媒体类型"
    },
    {
      source: "Gemini 3.6 & 3.7 Flash Deprecation",
      expected: "Gemini 3.6 & 3.7 Flash 弃用通知"
    },
    {
      source: "Make sure you are using Gemini 3.8 Flash! We will be turning down Gemini 3.6 Flash and Gemini 3.7 Flash shortly.",
      expected: "请确保你正在使用 Gemini 3.8 Flash！我们将很快停用 Gemini 3.6 Flash 和 Gemini 3.7 Flash。"
    },
    {
      source: "Make sure you are using Gemini 3.8 Flash!",
      expected: "请确保你正在使用 Gemini 3.8 Flash！"
    },
    {
      source: "We will be turning down Gemini 3.6 Flash shortly.",
      expected: "我们将很快停用 Gemini 3.6 Flash。"
    },
    {
      source: "Claude 3.5 Sonnet Deprecation",
      expected: "Claude 3.5 Sonnet 弃用通知"
    },
    {
      source: "Make sure you are using Claude 3.7 Sonnet! We will be turning down Claude 3.5 Sonnet shortly.",
      expected: "请确保你正在使用 Claude 3.7 Sonnet！我们将很快停用 Claude 3.5 Sonnet。"
    },
    {
      source: "GPT-4o Sunset",
      expected: "GPT-4o 下线通知"
    },
    {
      source: "Support for Mistral Large is ending shortly.",
      expected: "对 Mistral Large 的支持即将终止。"
    },
    {
      source: "Llama 3 70B will be retired shortly.",
      expected: "Llama 3 70B 即将退役。"
    },
    {
      source: "Please switch to Gemini 2.0 Flash! Gemini 1.5 Flash will be turned down shortly.",
      expected: "请切换到 Gemini 2.0 Flash！Gemini 1.5 Flash 即将停用。"
    },
    {
      source: "Gemini 1.5 Pro Discontinuation",
      expected: "Gemini 1.5 Pro 终止支持通知"
    },
    {
      source: "Gemini 1.5 Flash End of Life",
      expected: "Gemini 1.5 Flash 生命周期结束通知"
    },
    {
      source: "Model Deprecation Notice",
      expected: "模型弃用通知"
    },
    {
      source: "We will be retiring GPT-4 shortly.",
      expected: "我们将很快退役 GPT-4。"
    },
    {
      source: "Claude 3 Haiku will be deprecated shortly.",
      expected: "Claude 3 Haiku 即将弃用。"
    },
    {
      source: "Mistral Medium is no longer available.",
      expected: "Mistral Medium 已不再可用。"
    },
    {
      source: "We recommend switching to Claude 3.7 Sonnet! Claude 3.5 Sonnet will be turned down shortly.",
      expected: "我们建议切换到 Claude 3.7 Sonnet！Claude 3.5 Sonnet 即将停用。"
    },
    {
      source: "Consider upgrading to Gemini 3.8 Flash.",
      expected: "请考虑升级到 Gemini 3.8 Flash。"
    }
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `third-party notice translation mismatch for: ${source}`,
    );
  }
});

test("new models and plans availability notifications are covered by exact and pattern rules", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source: "New Models Available",
      expected: "新模型现已推出",
    },
    {
      source: "Models Available",
      expected: "可用模型",
    },
    {
      source: "Claude Opus 5.5 and Claude Sonnet 5.5 now available in your plan!",
      expected: "Claude Opus 5.5 and Claude Sonnet 5.5 现已在你的订阅方案中可用！",
    },
    {
      source: "Claude Opus 5.5 is now available in your plan",
      expected: "Claude Opus 5.5 现已在你的订阅方案中可用！",
    },
    {
      source: "Gemini 3.0 Pro available on your plan!",
      expected: "Gemini 3.0 Pro 现已在你的订阅方案中可用！",
    },
    {
      source: "GPT-5 is now available!",
      expected: "GPT-5 现已可用！",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `model availability translation mismatch for: ${source}`,
    );
  }
});

test("model quota policy description and comprehensive UI strings are covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source:
        "Within each group, models share a weekly limit and a 5-hour limit. Quota is consumed proportionally to the cost of the tokens. Thus, limits will last longer with shorter tasks or using more cost-effective models. The 5-hour limit smooths out aggregate demand to fairly distribute global capacity across all users, while your weekly limit is tied directly to your individual tier.",
      expected:
        "在每个组内，模型共享每周配额和 5 小时配额。配额根据 Token 的消耗成本按比例扣减。因此，对于耗时较短的任务或使用更高性价比的模型，配额使用时间将更持久。5 小时配额用于平滑总体请求峰值，以在所有用户间公平分配全局算力；而你的每周配额则直接与你的个人套餐级别挂钩。",
    },
    {
      source: "Manage your model quota and credits.",
      expected: "管理你的模型配额与点数。",
    },
    {
      source: "Enable AI Credit Overages",
      expected: "允许超额使用 AI 点数",
    },
    {
      source: "Your quota for this model is running low.",
      expected: "你在此模型的配额即将耗尽。",
    },
    {
      source: "Available AI Credits: 1,500",
      expected: "可用 AI 点数：1,500",
    },
    {
      source: "Shared with: Gemini 3.8 Flash",
      expected: "共享对象：Gemini 3.8 Flash",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `quota and UI translation mismatch for: ${source}`,
    );
  }
});

test("Antigravity 2.23.0 agent execution mode popover and permission policy strings are fully covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source: "Every command requires approval.",
      expected: "每条命令都需要批准。",
    },
    {
      source: "Run all commands without restrictions.",
      expected: "无限制运行所有命令。",
    },
    {
      source: "Use Global Settings",
      expected: "使用全局设置",
    },
    {
      source: "Ask before sensitive operations.",
      expected: "在执行敏感操作前进行确认。",
    },
    {
      source: "Security agent decides if commands run.",
      expected: "由安全智能体决定是否运行命令。",
    },
    {
      source: "Automatically decide if commands run.",
      expected: "由系统自动决定是否执行命令。",
    },
    {
      source: "Request Review",
      expected: "请求评审",
    },
    {
      source: "Vetted (Preview)",
      expected: "审核模式（预览）",
    },
    {
      source: "Auto (Preview)",
      expected: "自动（预览版）",
    },
    {
      source: "Turbo",
      expected: "极速",
    },
    {
      source: "Project Settings",
      expected: "项目设置",
    },
    {
      source: "Workspace Settings",
      expected: "工作区设置",
    },
    {
      source: "Global Settings",
      expected: "全局设置",
    },
    {
      source: "This project overrides your global permission settings.",
      expected: "此项目覆盖了你的全局权限设置。",
    },
    {
      source: "This workspace overrides your global permission settings.",
      expected: "此工作区覆盖了你的全局权限设置。",
    },
    {
      source: "Agent permissions preset selector, current: Default",
      expected: "智能体权限预设选择器，当前：Default",
    },
    {
      source: "Terminal commands the agent can execute in this workspace.",
      expected: "智能体在此工作区中可执行的终端命令。",
    },
    {
      source: "Background Task Output",
      expected: "后台任务输出",
    },
    {
      source: "Custom View",
      expected: "自定义视图",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `execution mode and permission translation mismatch for: ${source}`,
    );
  }
});

test("Antigravity model subscriber availability tooltip strings and patterns are covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source: "Gemini 4 Argon is currently available to Ultra plan subscribers.",
      expected: "Gemini 4 Argon 当前仅向 Ultra 方案订阅者开放。",
    },
    {
      source: "Claude 3.7 Sonnet is currently available to Pro plan subscribers.",
      expected: "Claude 3.7 Sonnet 当前仅向 Pro 方案订阅者开放。",
    },
    {
      source: "GPT-5 is currently available to Enterprise plan subscribers.",
      expected: "GPT-5 当前仅向 Enterprise 方案订阅者开放。",
    },
    {
      source: "DeepSeek R2 is available to Team plan subscribers.",
      expected: "DeepSeek R2 仅向 Team 方案订阅者开放。",
    },
    {
      source: "Model X is currently available to Ultra subscribers.",
      expected: "Model X 当前仅向 Ultra 订阅者开放。",
    },
    {
      source: "Gemini 4 Argon is now available to paid Pro plan subscribers.",
      expected: "Gemini 4 Argon 现已面向付费 Pro 方案订阅者开放。",
    },
    {
      source: "Gemini 4 Argon is now available to paid Pro plan subscribers",
      expected: "Gemini 4 Argon 现已面向付费 Pro 方案订阅者开放。",
    },
    {
      source: "Gemini 4 Argon is available to paid Pro plan subscribers.",
      expected: "Gemini 4 Argon 适用于付费 Pro 方案订阅者。",
    },
    {
      source: "Gemini 4 Argon is now available to paid Pro and Ultra plan subscribers.",
      expected: "Gemini 4 Argon 现已面向付费 Pro 与 Ultra 方案订阅者开放。",
    },
    {
      source: "Claude 3.7 Sonnet is now available to paid Ultra subscribers.",
      expected: "Claude 3.7 Sonnet 现已面向付费 Ultra 订阅者开放。",
    },
    {
      source: "Gemini 4 Argon is now available to paid Pro plan subscribers. As part of Pro, we've rolled out a separate weekly-only Argon quota on top of your existing Gemini quota for 3.8 Flash.",
      expected: "Gemini 4 Argon 现已面向付费 Pro 方案订阅者开放。作为 Pro 权益的一部分，我们在你现有的 Gemini（3.8 Flash）配额之外，额外推出了独立的仅限周额度的 Argon 配额。",
    },
    {
      source: "Gemini 4 Argon is now available to paid Pro plan subscribers. As part of Pro, we've rolled out a separate weekly-only Argon quota on top of your existing Gemini quota for 3.8 Flash",
      expected: "Gemini 4 Argon 现已面向付费 Pro 方案订阅者开放。作为 Pro 权益的一部分，我们在你现有的 Gemini（3.8 Flash）配额之外，额外推出了独立的仅限周额度的 Argon 配额。",
    },
    {
      source: "New",
      expected: null,
    },
    {
      source: "Notice",
      expected: null,
    },
    {
      source: "Notice ⓘ",
      expected: null,
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `model subscriber availability translation mismatch for: ${source}`,
    );
  }

  // 验证含原生换行符 \n 的 RFb 源码被准确替换并保留英文 a.tagTitle
  const realMultilineRFb = 'var RFb=({option:a})=>{var b=OD();return a.tagTitle&&a.tagDescription?A.createElement(A.Fragment,null,A.createElement("div",{"data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-xs"},A.createElement("span",null,a.tagTitle),A.createElement(X,{name:"info",className:"h-3 w-3 flex-none"})),A.createElement(jz,{id:b},A.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?A.createElement("div",{className:"bg-secondary rounded-full px-1.5 text-xs"},\na.tagTitle):null};';
  const localized = createLocalizedBundle(Buffer.from(realMultilineRFb, "utf8"), current);
  const bundleOut = localized.buffer.toString("utf8");
  assert.match(bundleOut, /"data-model-selector-badge":"true"/);
  assert.doesNotMatch(bundleOut, /a\.tagTitle==="New"\?"新建"/);
  assert.doesNotMatch(bundleOut, /a\.tagTitle==="Notice"\?"提示"/);
});

test("relative time strings including seconds, minutes, hours, days, weeks, months, years are fully covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    { source: "just now", expected: "刚刚" },
    { source: "a few seconds ago", expected: "刚刚" },
    { source: "a moment ago", expected: "刚刚" },
    { source: "1s ago", expected: "1 秒前" },
    { source: "10s ago", expected: "10 秒前" },
    { source: "1m ago", expected: "1 分钟前" },
    { source: "5m ago", expected: "5 分钟前" },
    { source: "59m ago", expected: "59 分钟前" },
    { source: "1 min ago", expected: "1 分钟前" },
    { source: "2 mins ago", expected: "2 分钟前" },
    { source: "1h ago", expected: "1 小时前" },
    { source: "3h ago", expected: "3 小时前" },
    { source: "23h ago", expected: "23 小时前" },
    { source: "1 hour ago", expected: "1 小时前" },
    { source: "2 hours ago", expected: "2 小时前" },
    { source: "1d ago", expected: "1 天前" },
    { source: "2d ago", expected: "2 天前" },
    { source: "1w ago", expected: "1 周前" },
    { source: "3w ago", expected: "3 周前" },
    { source: "1mo ago", expected: "1 个月前" },
    { source: "6mo ago", expected: "6 个月前" },
    { source: "1y ago", expected: "1 年前" },
    { source: "2y ago", expected: "2 年前" },
    { source: "yesterday", expected: "昨天" },
    { source: "in 5m", expected: "5 分钟后" },
    { source: "in 2h", expected: "2 小时后" },
    { source: "in 3d", expected: "3 天后" },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `relative time translation mismatch for: ${source}`,
    );
  }
});

test("customizations marketplace plugins, empty notes, and see more expansion buttons are fully covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source: "Search customizations...",
      expected: "搜索插件...",
    },
    {
      source: "Find skills, agents, and more in the Marketplace.",
      expected: "在插件市场中探索技能、智能体及更多内容。",
    },
    {
      source: "Browse the Marketplace",
      expected: "浏览插件市场",
    },
    {
      source: "No custom agents yet.",
      expected: "暂无自定义智能体。",
    },
    {
      source: "No MCP servers yet. Use Add to browse the store.",
      expected: "暂无 MCP 服务器。使用“添加”浏览商店。",
    },
    {
      source: "+ See 6 more",
      expected: "+ 查看更多 (6)",
    },
    {
      source: "+ See 10 more",
      expected: "+ 查看更多 (10)",
    },
    {
      source: "Connect to Google Workspace, including Docs, Sheets, Slides, Drive, and Calendar.",
      expected: "连接至 Google Workspace，包含文档、表格、幻灯片、云端硬盘与日历。",
    },
    {
      source: "Build with Google",
      expected: "使用 Google 技术构建",
    },
    {
      source: "Read, draft, and edit docs.",
      expected: "阅读、起草和编辑文档。",
    },
    {
      source: "Read, write, and format spreadsheets.",
      expected: "读取、编写和设置电子表格格式。",
    },
    {
      source: "Search, upload, download, and share files.",
      expected: "搜索、上传、下载和共享文件。",
    },
    {
      source: "Check availability, schedule events, and RSVP.",
      expected: "查看空闲状态、安排日程活动与回复邀请。",
    },
    {
      source: "Core tools and knowledge required to develop for Android.",
      expected: "Android 开发所需的核心工具与专业知识。",
    },
    {
      source: "Using the Google Antigravity Python SDK to build AI agents",
      expected: "使用 Google Antigravity Python SDK 构建 AI 智能体。",
    },
    {
      source: "Keep your coding agent up to date with the latest web best practices.",
      expected: "让你的代码智能体始终与最新的 Web 最佳实践保持同步。",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `customizations marketplace translation mismatch for: ${source}`,
    );
  }
});

test("entity empty states, dropdowns, and common action phrases are fully covered by exact and patterns", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    // 项目下拉与空状态
    { source: "No projects found", expected: "未找到项目" },
    { source: "No projects found.", expected: "未找到项目。" },
    { source: "No project found", expected: "未找到项目" },
    { source: "No matching projects found", expected: "未找到匹配的项目" },
    { source: "No projects created", expected: "尚未创建项目" },
    { source: "No projects yet", expected: "暂无项目" },
    { source: "No Project", expected: "未选择项目" },
    { source: "No project selected", expected: "未选择项目" },
    { source: "Select a folder.", expected: "选择文件夹。" },
    { source: "Select a folder to create a new project.", expected: "选择一个文件夹以创建新项目。" },
    { source: "Quick Start", expected: "快速开始" },
    { source: "Instantly create a new project and folder to start building.", expected: "立即创建新项目和文件夹以开始构建。" },
    { source: "Search Projects", expected: "搜索项目" },
    { source: "Search projects...", expected: "搜索项目..." },

    // 动态模式规则测试（各种动静态句式，无半中半英）
    { source: "No conversations found", expected: "未找到对话" },
    { source: "No conversations found.", expected: "未找到对话。" },
    { source: "No matching conversations found", expected: "未找到匹配的对话" },
    { source: "No conversations match your search criteria.", expected: "没有匹配你搜索条件的对话。" },
    { source: "No tasks found", expected: "未找到任务" },
    { source: "No background tasks", expected: "无后台任务" },
    { source: "No automations configured.", expected: "未配置计划任务。" },
    { source: "No scheduled tasks configured.", expected: "未配置计划任务。" },
    { source: "No plugins found", expected: "未找到插件" },
    { source: "No plugins available", expected: "暂无可用插件" },
    { source: "No matching plugins found.", expected: "未找到匹配的插件。" },
    { source: "No skills found", expected: "未找到技能" },
    { source: "No recommended skills found in workspace", expected: "工作区中未找到推荐技能" },
    { source: "No customizations found", expected: "未找到插件" },
    { source: "No matching customizations found.", expected: "未找到匹配的插件。" },
    { source: "No files or folders found", expected: "未找到文件或文件夹" },
    { source: "No environments found", expected: "未找到环境" },
    { source: "No repositories found.", expected: "未找到代码仓库。" },
    { source: "No workspaces found", expected: "未找到工作区" },
    { source: "No active terminals", expected: "无活跃终端" },
    { source: "No file changes detected", expected: "未检测到文件更改" },
    { source: "No artifacts generated", expected: "未生成工件" },
    { source: "No step data available", expected: "暂无步骤数据" },
    { source: "No trajectory metadata available", expected: "暂无轨迹元数据" },
    { source: "No description available", expected: "暂无可用描述" },
    { source: "No data available", expected: "暂无可用数据" },
    { source: "No content available", expected: "暂无可用内容" },
    { source: "No internet. Agent features may not work.", expected: "无网络连接。智能体功能可能无法正常工作。" },

    // 常见操作短语
    { source: "Select project, current: No Project", expected: "选择项目，当前：未选择项目" },
    { source: "Select Project Ctrl+;", expected: "选择项目 Ctrl+;" },
    { source: "Select Model Ctrl+/", expected: "选择模型 Ctrl+/" },
    { source: "Create Project", expected: "创建项目" },
    { source: "Create Cloud Project", expected: "创建云端项目" },
    { source: "Create a Plugin with the Agent", expected: "使用智能体创建插件" },
    { source: "Create a new scratch file", expected: "创建新的临时暂存文件" },
    { source: "Choose the experience that fits how you work.", expected: "选择适合你工作方式的体验。" },
    { source: "Choose a model", expected: "选择模型" },
    { source: "Archive project", expected: "归档项目" },
    { source: "Archive Workspace", expected: "归档工作区" },

    // 快速打开与新标签页短语测试（杜绝“打开 File”与“搜索 tabs...”半中半英）
    { source: "Search tabs, files, plugins, subagents, artifacts, tasks...", expected: "搜索标签页、文件、插件、子智能体、工件、任务..." },
    { source: "Search for content to open", expected: "搜索要打开的内容" },
    { source: "Open File", expected: "打开文件" },
    { source: "Open file", expected: "打开文件" },
    { source: "Open link", expected: "打开链接" },
    { source: "Open Tabs", expected: "打开标签页" },
    { source: "Open Search", expected: "打开搜索" },
    { source: "New Tab", expected: "新建标签页" },
    { source: "New tab", expected: "新建标签页" },
    { source: "Delete comment", expected: "删除评论" },
    { source: "Delete Skill", expected: "删除技能" },
    { source: "Delete workspace", expected: "删除工作区" },
    { source: "Edit comment", expected: "编辑评论" },
    { source: "Edit config", expected: "编辑配置" }
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `empty state / action phrase mismatch for: ${source}`,
    );
  }
});

test("account eligibility, regional availability, and authentication error strings are fully covered", async () => {
  const current = await loadDomTranslations();

  const testCases = [
    // 截图核心标题与动态正文
    {
      source: "Sorry, this account is ineligible to use Antigravity",
      expected: "抱歉，该账号暂无使用 Antigravity 的权限",
    },
    {
      source: "Sorry, this account is ineligible to use Antigravity.",
      expected: "抱歉，该账号暂无使用 Antigravity 的权限。",
    },
    {
      source: "Your current account is not eligible for Antigravity, because it is not currently available in your location.",
      expected: "你当前的账号暂无使用 Antigravity 的资格，因为该服务目前尚未在你所在的地区提供。",
    },
    {
      source: "Your current account is not eligible for Antigravity, because it is not currently available in your region.",
      expected: "你当前的账号暂无使用 Antigravity 的资格，因为该服务目前尚未在你所在的地区提供。",
    },
    {
      source: "Your account is not eligible for Antigravity, because it is not currently available in your country.",
      expected: "你当前的账号暂无使用 Antigravity 的资格，因为该服务目前尚未在你所在的地区提供。",
    },
    {
      source: "Your current account is not eligible for Antigravity",
      expected: "你当前的账号暂无使用 Antigravity 的资格",
    },
    {
      source: "Your account is not eligible for Antigravity",
      expected: "你的账号暂无使用 Antigravity 的资格",
    },
    {
      source: "Further action is required to use Antigravity",
      expected: "需要进一步操作方可使用 Antigravity",
    },
    {
      source: "Please verify your account, then sign in again to continue.",
      expected: "请先验证你的账号，然后重新登录以继续。",
    },
    {
      source: "Please verify your account to continue using Antigravity.",
      expected: "请先验证你的账号以继续使用 Antigravity。",
    },
    {
      source: "Learn more by visiting our",
      expected: "访问我们的",
    },
    {
      source: "FAQ",
      expected: "常见问题解答",
    },
    {
      source: "Submit Appeal",
      expected: "提交申诉",
    },
    {
      source: "Sign in again",
      expected: "重新登录",
    },
    {
      source: "Verify",
      expected: "验证",
    },
    {
      source: "There was an unexpected issue setting up your account.",
      expected: "设置你的账号时发生了意外问题。",
    },
    {
      source: "Business Account Sign In",
      expected: "企业账号登录",
    },
    {
      source: "Connect your account to browse",
      expected: "关联账号以进行浏览",
    },
    {
      source: "Log in to use the agent",
      expected: "登录以使用智能体",
    },
    {
      source: "Sign in required",
      expected: "需要登录",
    },
    {
      source: "Signed-in accounts",
      expected: "已登录账号",
    },
    {
      source: "This Google Cloud project is not supported. Input a different project, or sign in with another account.",
      expected: "不支持此 Google Cloud 项目。请输入其他项目，或使用其他账号登录。",
    },
    {
      source: "This sign-in option is only available to invited teams.",
      expected: "此登录方式仅适用于受邀团队。",
    },
    {
      source: "Browser tools are not available in the Antigravity Android desktop app.",
      expected: "Antigravity 安卓桌面应用中不支持浏览器工具。",
    },
    {
      source: "Concierge conversation is unavailable",
      expected: "引导对话不可用",
    },
    {
      source: "No agent client available to start conversation",
      expected: "没有可用的智能体客户端来发起对话",
    },
    {
      source: "No workspace window available",
      expected: "暂无可用的工作区窗口",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `auth eligibility string mismatch for: ${source}`,
    );
  }
});

test("image comments and context menu strings are covered", async () => {
  const current = await loadDomTranslations();
  const testCases = [
    {
      source: "Leave a comment",
      expected: "写下评论",
    },
    {
      source: "Add Comment",
      expected: "添加评论",
    },
    {
      source: "Edit comment",
      expected: "编辑评论",
    },
    {
      source: "Save Comment",
      expected: "保存评论",
    },
    {
      source: "Drag to select a region to comment",
      expected: "拖动以选择要评论的区域",
    },
    {
      source: "Copy Image",
      expected: "复制图片",
    },
    {
      source: "Save Image",
      expected: "保存图片",
    },
    {
      source: "Copy File Path",
      expected: "复制文件路径",
    },
    {
      source: "Copy File Name",
      expected: "复制文件名",
    },
    {
      source: "Add to Chat",
      expected: "添加到对话",
    },
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `image comment or context menu string mismatch for: ${source}`,
    );
  }
});

test("translator localizes context menu, notifications, extensions and model quotas", async () => {
  const current = await loadDomTranslations();

  const testCases = [
        { source: "Downloading Update", expected: "正在下载更新" },
    { source: "Install Update", expected: "安装更新" },
    { source: "Installing Update", expected: "正在安装更新" },
    { source: "Update Available", expected: "有可用更新" },
    { source: "Restart to Update", expected: "重启以更新" },
        { source: "Thinking for 9s", expected: "思考耗时 9 秒" },
    { source: "Thought for 12s", expected: "思考耗时 12 秒" },
    
    { source: "Thinking for 1m 20s", expected: "思考耗时 1 分钟 20 秒" },
    { source: "Worked for 15s", expected: "工作耗时 15 秒" },
    { source: "Stopped after 30s", expected: "耗时 30 秒后停止" },
    { source: "Exited with code 1", expected: "已退出，退出码 1。" },
    { source: "Folder", expected: "文件夹" },
    { source: "Folders", expected: "文件夹" },
    { source: "folder", expected: "文件夹" },
    { source: "Show system notifications when your action is needed or the agent finishes.", expected: "当需要你操作或智能体完成时显示系统通知。" },
    { source: "Play a sound when your action is needed or the agent finishes.", expected: "当需要你操作或智能体完成时播放提示音。" },
    { source: "Set the volume of agent sounds.", expected: "设置智能体提示音音量。" },
    { source: "Controls whether the agent can run custom JavaScript to automate complex browser actions.", expected: "控制智能体是否可以运行自定义 JavaScript 来自动执行复杂的浏览器操作。" },
    { source: "No extensions available", expected: "暂无可用扩展" },
    { source: "Extensions", expected: "扩展" },
    { source: "Replace with New", expected: "替换为新对话" },
    { source: "Search tabs, files, extensions, subagents, artifacts, tasks...", expected: "搜索标签页、文件、扩展、子智能体、工件、任务..." },
    { source: "Quote", expected: "引用" },
    { source: "Quote Selection", expected: "引用所选内容" },
    { source: "Weekly limit", expected: "每周配额" },
    { source: "Daily limit", expected: "每日配额" },
    { source: "5h limit", expected: "5 小时配额" },
    
    { source: "Unavailable", expected: "不可用" },
    { source: "98% left", expected: "剩余 98%" },
    { source: "100% left", expected: "剩余 100%" },
    { source: "Search Across Conversations", expected: "跨对话搜索" },
    { source: "Search conversations with", expected: "在左上方点击" },
    { source: "in the top left.", expected: "即可搜索对话。" },
    { source: "View archived in the sidebar (", expected: "在侧边栏中查看已归档内容（" },
    { source: "View archived in the sidebar", expected: "在侧边栏中查看已归档内容" },
    { source: "menu).", expected: "菜单）。" },
    { source: "Conversation History", expected: "对话历史" },
    { source: "This page is going away soon", expected: "此页面即将下线" },
    { source: "Conversation Archived", expected: "对话已归档" },
    { source: "Built-in Browser", expected: "内置浏览器" },
    { source: "External Browser", expected: "外部浏览器" },
    { source: "Open Links In", expected: "打开链接方式" },
    { source: "Choose where links open by default when clicked.", expected: "选择点击链接时默认打开的位置。" },
    { source: "Configure link opening and built-in browser preferences.", expected: "配置链接打开方式与内置浏览器偏好。" },
    { source: "Browser Subagent", expected: "浏览器子智能体" },
    { source: "Search shortcuts...", expected: "搜索快捷键..." },
    { source: "Reopen Closed Tab", expected: "重新打开关闭的标签页" },
    { source: "Move Conversation Up", expected: "上移对话" },
    { source: "Move Conversation Down", expected: "下移对话" },
    { source: "Toggle Maximize Auxiliary Pane", expected: "切换最大化辅助面板" },
    { source: "检索右键菜单定义代码段 · Exited with code 1", expected: "检索右键菜单定义代码段 · 退出码 1" },
    { source: "Exited with code 1", expected: "已退出，退出码 1。" },
    { source: "Background Commands", expected: "后台命令" },
    { source: "No background commands", expected: "暂无后台命令" },
    { source: "6s timer", expected: "6 秒定时器" },
    { source: "15s timer", expected: "15 秒定时器" },
    { source: "Timer: 6s, Prompt: 检查视频渲染任务是否结束", expected: "定时器：6 秒，提示：检查视频渲染任务是否结束" },
    { source: "run-workflow", expected: "运行工作流" },
    {
      source: "How to write and run a dynamic workflow script with the `run_workflow` tool: a Python script that orchestrates many agents with `agent`, `parallel`, `pipeline`, and `phase`. Use when a task splits into many independent or staged pieces of agent work (fan out over files, modules, bugs, or review angles, then aggregate), or when the user asks for a workflow. Don't use for a single delegated task (use a subagent) or for legacy workflow files (see migrate-workflows).",
      expected: "如何使用 `run_workflow` 工具编写并运行动态工作流脚本：一个使用 `agent`、`parallel`、`pipeline` 和 `phase` 编排多个智能体的 Python 脚本。适用于任务可拆分为独立或分阶段执行的多个子任务时（例如按文件、模块、缺陷或审查角度分散执行后再聚合），或用户要求使用工作流时。单项委托任务请使用子智能体，旧版工作流文件请参见工作流迁移。"
    },
    { source: "Scan the code to open this device in Remote Control, or", expected: "扫描二维码在远程控制中打开此设备，或" },
    { source: "copy link", expected: "复制链接" },
    { source: "Show Remote Control QR code", expected: "显示远程控制二维码" }
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `mismatch for: ${source}`
    );
  }
});


test("createLocalizedBundle handles conversation context menu items and models natively", () => {
  const fakeSource = Buffer.from(`
    id:"rename",label:"Rename"
    label:y?"Unpin":"Pin"
    label:h?"Mark Read":"Mark Unread"
    id:"copy",type:"submenu",label:"Copy"
    id:"split",type:"submenu",label:"Split"
    id:"fork",type:"submenu",label:"Fork"
    id:"stop",label:"Stop"
    id:"delete",label:"Delete"
    id:"delete",label:"Delete Permanently"
    id:"restore",label:"Restore"
    id:"share",label:"Share"
    id:"view-debug",label:"View Debug"
    label:"Conversation Name"
    label:"Conversation ID"
    label:"Project Name"
    label:\`\${c.isGoogleInternal?"Worktree":"Workspace"} Name\`
    label:"Split Right"
    label:"Split Down"
    label:"Remove from Split"
    z6={low:"Low",medium:"Medium",high:"High",xhigh:"Extra",max:"Max"}
    {label:a.label,value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:B.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:a.tagTitle,tagDescription:a.tagDescription,
    var KTb=({option:a})=>{var b=KE();return a.tagTitle&&a.tagDescription?A.createElement(A.Fragment,null,A.createElement("div",{"data-tooltip-id":b,className:"bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-xs"},A.createElement("span",null,a.tagTitle),A.createElement(Z,{name:"info",className:"h-3 w-3 flex-none"})),A.createElement(iA,{id:b},A.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?A.createElement("div",{className:"bg-secondary rounded-full px-1.5 text-xs"},a.tagTitle):null};
  `);
  const localized = createLocalizedBundle(fakeSource, dictionary);
  const out = localized.buffer.toString("utf8");
  assert.ok(out.includes('id:"rename",label:"重命名"'));
  assert.ok(out.includes('label:y?"取消置顶":"置顶"'));
  assert.ok(out.includes('label:h?"标记为已读":"标记为未读"'));
  assert.ok(out.includes('id:"copy",type:"submenu",label:"复制"'));
  assert.ok(out.includes('id:"split",type:"submenu",label:"拆分"'));
  assert.ok(out.includes('id:"stop",label:"停止"'));
  assert.ok(out.includes('id:"delete",label:"删除"'));
  assert.ok(out.includes('label:"对话名称"'));
  assert.ok(out.includes('label:"对话 ID"'));
  assert.ok(out.includes('label:"项目名称"'));
  assert.ok(out.includes('label:"向右拆分"'));
  assert.ok(out.includes('label:"向下拆分"'));
  assert.ok(out.includes('label:"从拆分中移除"'));
  assert.ok(out.includes('(思考)'));
  assert.ok(out.includes('"Unavailable":"不可用"'));
  assert.ok(out.includes('"Notice":"提示"'));
  assert.ok(out.includes('z6={low:"低",medium:"中",high:"高",xhigh:"超高",max:"最大"}'));
  assert.ok(out.includes('"data-model-selector-badge":"true"'));
});

test("UDb submenu translation preserves structure, parameters, testId, and maintains valid syntax", () => {
  const fakeSource = Buffer.from(`
    const UDb=(a,b)=>b.map((c,e)=>({id:\`\${a}-\${e}\`,label:c.label,accelerator:c.shortcut,testId:\`conversation-\${a}-\${c.label.toLowerCase().replace(/\\s+/g,"-")}\`,onClick:c.onClick}));
  `);
  const localized = createLocalizedBundle(fakeSource, dictionary);
  const out = localized.buffer.toString("utf8");

  // 1. 验证绝不包含破坏性逗号表达式
  assert.ok(!out.includes("c,e.map"), "必须不能包含错误的逗号表达式 c,e.map");

  // 2. 验证 JavaScript 语法完全合法
  assert.doesNotThrow(() => {
    new vm.Script(out);
  }, "生成的代码必须是合法的 JavaScript 语法");

  // 3. 执行沙箱模拟测试其真实行为
  const context = {
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    document: {
      readyState: "loading",
      documentElement: { lang: "" },
      body: {},
      addEventListener: () => {},
      createElement: () => ({ style: {} }),
      head: { appendChild: () => {} },
    },
    window: {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    testA: "copy",
    testItems: [
      { label: "Conversation Name", shortcut: "Ctrl+C", onClick: () => "name_clicked" },
      { label: "Conversation ID", shortcut: void 0, onClick: () => "id_clicked" },
      { label: "Custom Label", shortcut: void 0, onClick: () => "custom_clicked" },
    ],
    console,
  };
  vm.createContext(context);
  vm.runInContext(out + "\nvar res = UDb(testA, testItems);", context);
  const res = context.res;

  assert.equal(res.length, 3);
  // 对话名称被翻译，且 testId 保留英文，onClick 可执行
  assert.equal(res[0].label, "对话名称");
  assert.equal(res[0].testId, "conversation-copy-conversation-name");
  assert.equal(res[0].accelerator, "Ctrl+C");
  assert.equal(res[0].onClick(), "name_clicked");

  // 对话 ID 被翻译，且 testId 保留英文
  assert.equal(res[1].label, "对话 ID");
  assert.equal(res[1].testId, "conversation-copy-conversation-id");

  // 未匹配的项保持原生 label
  assert.equal(res[2].label, "Custom Label");
  assert.equal(res[2].testId, "conversation-copy-custom-label");
});

test("attachment summaries, counts, and card state strings are fully covered", async () => {
  const dictionary = await loadDomTranslations();
  const testCases = [
    { source: "1 image attachment", expected: "1 张图片附件" },
    { source: "(1 image attachment)", expected: "（1 张图片附件）" },
    { source: "2 image attachments", expected: "2 张图片附件" },
    { source: "(5 image attachments)", expected: "（5 张图片附件）" },
    { source: "1 video attachment", expected: "1 个视频附件" },
    { source: "(3 video attachments)", expected: "（3 个视频附件）" },
    { source: "1 audio attachment", expected: "1 个音频附件" },
    { source: "(4 audio attachments)", expected: "（4 个音频附件）" },
    { source: "Video attachment", expected: "视频附件" },
    { source: "Image attachment", expected: "图片附件" },
    { source: "PDF attachment", expected: "PDF 附件" },
    { source: "CSV spreadsheet attachment", expected: "CSV 表格附件" },
    { source: "JSON attachment", expected: "JSON 附件" },
    { source: "Markdown attachment", expected: "Markdown 附件" },
    { source: "Maximum number of attachments reached", expected: "已达到附件数量上限" },
    { source: "Couldn't load message", expected: "无法加载消息" },
    { source: "No message text", expected: "无消息内容" },
    { source: "Copy Message", expected: "复制消息" },
    { source: "Undo to Here", expected: "撤销到此处" },
  ];

  for (const { source, expected } of testCases) {
    const actual = translateDictionaryValue(source, dictionary);
    assert.equal(actual, expected, `翻译失败: "${source}" 应该为 "${expected}"，但实际为 "${actual}"`);
  }
});

test("user reported issues and expanded UI elements are fully covered", async () => {
  const current = await loadDomTranslations();

  // 1. 设置面板新字段
  const settingsCases = [
    { source: "Download Location", expected: "下载位置" },
    { source: "Folder where files downloaded in the built-in browser are saved.", expected: "内置浏览器下载文件的保存目录。" },
    { source: "Change…", expected: "更改…" },
    { source: "Browsing History", expected: "浏览记录" },
    { source: "Clear visited URLs and autocomplete suggestions from the built-in browser.", expected: "清除内置浏览器的访问网址与自动填充建议。" },
    { source: "Voice mode", expected: "语音模式" },
    { source: "Microphone", expected: "麦克风" },
    { source: "Input device for voice mode and dictation.", expected: "用于语音模式与听写的输入设备。" },
    { source: "System default", expected: "系统默认" },
    { source: "Voice volume", expected: "语音音量" },
    { source: "Recordings", expected: "录音记录" },
    { source: "Delete all recordings?", expected: "删除所有录音记录？" },
    { source: "Delete all", expected: "全部删除" },
    { source: "Not set", expected: "未设置" },
    { source: "Clear and friendly", expected: "清晰友好" },
    { source: "Confident and clear", expected: "自信清晰" },
    { source: "Warm and engaging", expected: "温暖生动" },
    { source: "Warm and approachable", expected: "温暖亲切" },
    { source: "Deep and velvety", expected: "深沉醇厚" },
    { source: "Light and precise", expected: "轻盈精准" },
    { source: "Choose Antigravity's Voice", expected: "选择 Antigravity 的语音" },
    { source: "Choose Jetski's Voice", expected: "选择 Jetski 的语音" },
    { source: "Use Fola", expected: "使用 Fola" },
    { source: "Use Arlo", expected: "使用 Arlo" }
  ];

  for (const { source, expected } of settingsCases) {
    const res = translateDictionaryValue(source, current);
    assert.equal(res, expected, `Settings term failed: ${source}`);
  }

  // 2. 模型可用性与方案过滤（杜绝 Ultra and paid Pro）
  const modelCases = [
    {
      source: "Gemini 4 Argon is currently available to Ultra and paid Pro plan subscribers.",
      expected: "Gemini 4 Argon 当前仅向 Ultra 及付费 Pro 方案订阅者开放。"
    },
    {
      source: "Gemini 4 Argon is currently available to Ultra and paid Pro subscribers.",
      expected: "Gemini 4 Argon 当前仅向 Ultra 及付费 Pro 订阅者开放。"
    },
    {
      source: "Sonnet 5.5 is currently available to Pro and Ultra plan subscribers.",
      expected: "Sonnet 5.5 当前仅向 Pro 及 Ultra 方案订阅者开放。"
    }
  ];

  for (const { source, expected } of modelCases) {
    const res = translateDictionaryValue(source, current);
    assert.equal(res, expected, `Model subscriber term failed: ${source}`);
  }

  // 3. 历史章节小结 23 个真实标题全量断言（杜绝中英夹杂）
  const chapterTitles = [
    "Completing localization and debugging of Antigravity",
    "Completing UI localization and rules adjustment",
    "Optimizing app localization and rules",
    "Setting up and fixing Antigravity GitHub repository",
    "Releasing v1.0.0 and finalizing localization",
    "Translating missing UI elements and tooltips",
    "Continuing translation and reviewing improvements",
    "Iterating software localization and UI translations",
    "Publishing new antigravity localization release",
    "Fixing and releasing software localization",
    "Fixing the desktop app localization",
    "Updating and uploading localization files",
    "Auditing and localizing desktop app",
    "Analyzing software localization and promotion strategies",
    "Translating the user interface",
    "Refining UI localization and error messages",
    "Translating context menu and tooltips",
    "Publishing and updating the localization project",
    "Comparing translation pack projects",
    "Translating remaining untranslated error messages",
    "Locating missing desktop shortcut",
    "Understanding the antigravity hot reload update",
    "Fixing translation and UI bug"
  ];

  for (const title of chapterTitles) {
    const res = translateDictionaryValue(title, current);
    assert.ok(res, `Chapter title must be translated: ${title}`);
    const cleaned = res.replace(/\b(Antigravity|GitHub|UI)\b/g, "");
    assert.doesNotMatch(cleaned, /[a-zA-Z]{3,}/, `Chapter title must not have English residual words: ${res}`);
  }

  // 4. 附件文案全量断言
  const attachmentCases = [
    { source: "1 image attachment", expected: "1 张图片附件" },
    { source: "2 image attachments", expected: "2 张图片附件" },
    { source: "(1 image attachment)", expected: "（1 张图片附件）" },
    { source: "(2 image attachments)", expected: "（2 张图片附件）" },
    { source: "1 video attachment", expected: "1 个视频附件" },
    { source: "(1 video attachment)", expected: "（1 个视频附件）" }
  ];

  for (const { source, expected } of attachmentCases) {
    const res = translateDictionaryValue(source, current);
    assert.equal(res, expected, `Attachment term failed: ${source}`);
  }
});


test("automations, home greetings, and marketplace shelves and cards are covered", async () => {
  const current = await loadDomTranslations();

  // 1. 首页动态问候语
  assert.equal(
    translateDictionaryValue("Hi Ann, what can we get done today?", current),
    "你好 Ann，今天想做点什么？"
  );
  assert.equal(
    translateDictionaryValue("What can we get done today?", current),
    "今天想做点什么？"
  );

  // 2. 自动化模块
  assert.equal(
    translateDictionaryValue("No automations yet", current),
    "暂无自动化"
  );
  assert.equal(
    translateDictionaryValue(
      "Run a prompt on a schedule, like a morning summary of yesterday's changes. Runs show up here.",
      current
    ),
    "按计划定时运行提示词，例如每天早晨汇总昨天的代码变更。运行记录将显示在此处。"
  );
  assert.equal(
    translateDictionaryValue("No automations match “test”.", current),
    "未找到匹配“test”的自动化。"
  );

  // 3. 插件市场分类与卡片
  assert.equal(translateDictionaryValue("Featured", current), "精选");
  assert.equal(translateDictionaryValue("Design, Creative & Media", current), "设计、创意与媒体");
  assert.equal(translateDictionaryValue("Productivity & Project Management", current), "生产力与项目管理");
  assert.equal(translateDictionaryValue("Cloud Hosting & Deployment", current), "云托管与部署");
  assert.equal(translateDictionaryValue("Business", current), "商业与业务");
  assert.equal(translateDictionaryValue("More Plugins", current), "更多插件");

  // 4. 插件市场卡片描述
  assert.ok(translateDictionaryValue("Turn Figma designs into production code, map components with Code Connect, and create or edit Figma files in Antigravity.", current));
  assert.ok(translateDictionaryValue("The product development system for teams and agents.", current));
  assert.ok(translateDictionaryValue("Accept payments and grow your business. Stripe is a financial infrastructure platform for the internet.", current));

  // 5. 免责声明
  assert.ok(
    translateDictionaryValue(
      "Google does not control the availability or functionality of third party developer tools. Your data from third party developer tools connected to your Antigravity instance may be shared with Google. Google will protect any such data in accordance with the Google Privacy Policy, found here:",
      current
    )
  );

  // 6. 远程智能体推广卡片与远程项目
  assert.equal(
    translateDictionaryValue("Introducing Remote Agents", current),
    "隆重推出远程智能体"
  );
  assert.equal(
    translateDictionaryValue(
      "Your agents can now run in the cloud and keep working after you close the app. Check on them from any browser at antigravity.google.com. Create a Remote Project to get started.",
      current
    ),
    "你的智能体现在可以在云端运行，即使关闭应用也会继续工作。随时可通过任意浏览器访问 antigravity.google.com 查看进度。创建一个远程项目即可开始使用。"
  );
  assert.equal(translateDictionaryValue("Remote Agents", current), "远程智能体");
  assert.equal(translateDictionaryValue("Remote Project", current), "远程项目");
  assert.equal(translateDictionaryValue("Create a Remote Project", current), "创建远程项目");
  assert.equal(translateDictionaryValue("New Remote Project", current), "新建远程项目");
  assert.equal(
    translateDictionaryValue("Create a project whose conversations run remotely.", current),
    "创建一个对话在远程运行的项目。"
  );
});

test("2.29.0 6-screenshot audit: native image context menu, permissions, appearance presets, dynamic model limits, and marketplace cards", async () => {
  const current = await loadDomTranslations();

  // 图 1: 图片/视频右键菜单
  assert.equal(translateDictionaryValue("Copy Image", current), "复制图片");
  assert.equal(translateDictionaryValue("Save Image", current), "保存图片");
  assert.equal(translateDictionaryValue("Save Video", current), "保存视频");
  assert.equal(translateDictionaryValue("Open in Tab", current), "在标签页中打开");
  assert.equal(translateDictionaryValue("Open in New Tab", current), "在新标签页中打开");

  // 图 2: 设置 -> 通用 -> 权限配置 & 计划评审策略润色
  assert.equal(
    translateDictionaryValue("Configure what the agent can do in local and remote conversations.", current),
    "配置智能体在本地和远程对话中的操作权限。"
  );
  assert.equal(
    translateDictionaryValue("Whether the agent asks you to review its documents.", current),
    "控制智能体在生成计划或文档后是否请求你评审。"
  );

  // 图 3 & 图 4: 设置 -> 外观 -> Verbose / Fill / 主题预设
  assert.equal(translateDictionaryValue("Verbose", current), "详细");
  assert.equal(translateDictionaryValue("Fill", current), "铺满");
  assert.equal(translateDictionaryValue("Legacy Light", current), "经典浅色");
  assert.equal(translateDictionaryValue("Legacy Dark", current), "经典深色");
  assert.equal(translateDictionaryValue("Gruvbox Material", current), null); // 国际经典代码主题保留原名

  // 图 5: 模型与用量动态配额变量
  assert.equal(
    translateDictionaryValue("Gemini 4 Argon Weekly Limit", current),
    "Gemini 4 Argon 每周剩余配额"
  );
  assert.equal(
    translateDictionaryValue("Claude Opus 4.6 Daily Limit", current),
    "Claude Opus 4.6 每日剩余配额"
  );
  assert.equal(
    translateDictionaryValue("Gemini 3.1 Pro 5-Hour Limit", current),
    "Gemini 3.1 Pro 5 小时剩余配额"
  );

  // 图 6: 插件市场全部卡片（含截断状态与完整状态）
  const marketplaceSamples = [
    "Databricks skills for the CLI, Apps, Lakebase, ...",
    "Search Intercom conversations, contacts, and ...",
    "SEO workflows on live Semrush data: keyword...",
    "Accept payments and grow your business. Stri...",
    "Search and read your Wispr Flow meeting not...",
    "Connect your agent to invideo's AI-native vide...",
    "Agent skills for Neo4j graph database — write...",
    "Access and clone GitHub repositories in remot..."
  ];
  for (const sample of marketplaceSamples) {
    const res = translateDictionaryValue(sample, current);
    assert.ok(res && /[一-鿿]/.test(res), `Marketplace card should be translated: ${sample}`);
  }

  // 源码级替换验证 (createLocalizedBundle)
  const mockBundle = Buffer.from(
    [
      'label:a==="video"?"Save Video":"Save Image"',
      'id:"copy-image",label:"Copy Image"',
      'const gna={daily:"Daily limit",weekly:"Weekly limit"};function cm(a){var b=a.window.trim().toLowerCase();return gna[b]?gna[b]:/^\\d+[smhd]$/.test(b)?`${b} limit`:a.displayName}',
      '{label:"Verbose",value:"verbose"}',
      '{value:"fill",label:"Fill"}'
    ].join(";"),
    "utf8"
  );
  const localized = createLocalizedBundle(mockBundle, current).buffer.toString("utf8");
  assert.ok(localized.includes('label:a==="video"?"保存视频":"保存图片"'));
  assert.ok(localized.includes('id:"copy-image",label:"复制图片"'));
  assert.ok(localized.includes('const gna={daily:"每日配额",weekly:"每周配额"}'));
  assert.ok(localized.includes('{label:"详细",value:"verbose"}'));
  assert.ok(localized.includes('{value:"fill",label:"铺满"}'));
  assert.ok(localized.includes("hookNativeContextMenu"));
});

test("all 71 marketplace plugins, suggestedPrompts, skill descriptions, and Q3 Markdown detail pages are fully covered without half-Chinese-half-English", async () => {
  const current = await loadDomTranslations();

  // 1. 图 1: Developer Tools 分类及滚动后插件卡片
  assert.equal(translateDictionaryValue("Developer Tools", current), "开发者工具");
  assert.equal(
    translateDictionaryValue("APIs, services, and tools to build, test, secure, and run your apps.", current),
    "用于构建、测试、保护和运行应用的 API、服务与工具。"
  );
  const scrolledCards = [
    "Build, publish, and manage WordPress.com an...",
    "Give your agent a real browser: navigate, click...",
    "AI-powered code review and review comment...",
    "Up-to-date documentation lookup. Pull versio...",
    "Use the official CrowdStrike hosted MCP serv..."
  ];
  for (const card of scrolledCards) {
    const tr = translateDictionaryValue(card, current);
    assert.ok(tr && /[\u4e00-\u9fff]/.test(tr), `Scrolled card should be translated: ${card}`);
  }

  // 2. 图 2: Google Docs 等自定义项详情页（推荐提示词、概览 README、/gdocs 命令截断描述）
  assert.ok(translateDictionaryValue("Summarize this design doc and list the open questions", current));
  assert.ok(translateDictionaryValue("Draft a launch announcement in a new doc from my notes", current));
  assert.ok(translateDictionaryValue("Reply to the open comments on my doc and resolve them", current));

  const gdocsReadme = "Read and write your Google Docs. Summarize any doc from its link, draft\nproposals and announcements in a new doc, and reply to and resolve open\ncomments.";
  const trGdocsReadme = translateDictionaryValue(gdocsReadme, current);
  assert.ok(trGdocsReadme && !trGdocsReadme.includes("and write"), `gdocs README must be fully translated, got: ${trGdocsReadme}`);

  const gdocsCmdTruncated = "Read, create, edit, and manage Google Docs. Use when the user shares a docs.google.com URL, asks to sum...";
  const trGdocsCmd = translateDictionaryValue(gdocsCmdTruncated, current);
  assert.ok(trGdocsCmd && /[\u4e00-\u9fff]/.test(trGdocsCmd) && !trGdocsCmd.includes("create, edit"), `gdocs command description must be translated: ${trGdocsCmd}`);

  // 3. 验证未知的以 Read 开头的英文长句不会被拆成 "已读取 + 英文"
  const unknownReadSentence = "Read through the entire architecture document before making changes.";
  assert.equal(translateDictionaryValue(unknownReadSentence, current), null);

  // 4. 验证 Q3 Markdown 渲染器注入
  const mockQ3 = Buffer.from(
    'function Q3({markdown:a,className:b,baseDirUri:c}){return A.createElement(oB,{value:void 0},A.createElement(h3,{cascadeId:void 0,markdown:a,context:"artifact"}))}',
    "utf8"
  );
  const localized = createLocalizedBundle(mockQ3, current).buffer.toString("utf8");
  assert.ok(localized.includes("globalThis.__AGY_ZHCN_TRANSLATE_MD__"));
});


test("level-3 modals, sub-entries, quota reset banner, and natural plugin naming are fully covered", async () => {
  const current = await loadDomTranslations();

  // 1. 自然产品命名（插件 vs 自定义）
  assert.equal(translateDictionaryValue("Customizations", current), "插件");
  assert.equal(translateDictionaryValue("Search customizations...", current), "搜索插件...");
  assert.equal(translateDictionaryValue("No customizations found", current), "未找到插件");

  // 2. 三级子弹窗/浮窗/模态框词条
  assert.equal(translateDictionaryValue("Task Logs", current), "任务日志");
  assert.equal(translateDictionaryValue("Recent Events", current), "近期事件");
  assert.equal(translateDictionaryValue("Copy Path", current), "复制路径");
  assert.equal(translateDictionaryValue("Event:", current), "触发事件：");
  assert.equal(translateDictionaryValue("Target Tools:", current), "目标工具：");
  assert.equal(translateDictionaryValue("Settings for conversations outside of projects.", current), "项目外独立对话的设置选项。");

  // 3. 最新截图中的基线配额上限横幅（动态日期时间正则）
  const bannerText = "Your plan's baseline quota will refresh on 2026/11/14 17:02:51. You can upgrade to a Google AI Ultra plan to receive higher rate limits. See plans.";
  const bannerTr = translateDictionaryValue(bannerText, current);
  assert.ok(bannerTr, "Quota banner should be translated");
  assert.match(bannerTr, /你的方案基线配额将于 2026\/11\/14 17:02:51 刷新。你可以升级至 Google AI Ultra 方案以获取更高配额。查看方案。/);

  // 4. 三级 SKILL.md 文档段落（/twg-setup 及 /gdocs）
  const twgHeading = "TWG Setup";
  assert.equal(translateDictionaryValue(twgHeading, current), "TWG 环境配置");

  const twgHost = "Recognized installer hosts: `antigravity`, `claude-code`, `codex`, `copilot`, `cursor`, `devin`, `gemini`, `hermes`, `intellij`, `opencode`, `pi`, `qoder`, `vscode`.";
  assert.ok(translateDictionaryValue(twgHost, current), "TWG host list should be translated");

  const gdocsText = "Work with a Google Doc the user names or links to. Everything here assumes you already have the **document ID** — the segment between `/d/` and `/edit` in a `https://docs.google.com/document/d/<DOCUMENT_ID>/edit` URL.";
  assert.ok(translateDictionaryValue(gdocsText, current), "Google Docs level-3 description should be translated");
});

test("free user quota upgrade and search across conversations NUX tooltip are fully covered", async () => {
  const dict = await loadDomTranslations();
  const quotaCases = [
    ["Free users and Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.", "免费用户与 Google AI Plus 用户在 Antigravity 上享有最低基础配额。你可以升级到 Google AI Pro 或更高方案以获取更高配额。"],
    ["Free users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.", "免费用户在 Antigravity 上享有最低基础配额。你可以升级到 Google AI Pro 或更高方案以获取更高配额。"],
    ["Free users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro to receive higher rate limits.", "免费用户在 Antigravity 上享有最低基础配额。你可以升级到 Google AI Pro 以获取更高配额。"],
    ["Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.", "Google AI Plus 用户在 Antigravity 上享有最低基础配额。你可以升级到 Google AI Pro 或更高方案以获取更高配额。"],
    ["Free users receive the minimum base limits on Antigravity.", "免费用户在 Antigravity 上享有最低基础配额。"]
  ];
  for (const [src, expected] of quotaCases) {
    const res = translateDictionaryValue(src, dict);
    assert.equal(res, expected, "Quota case mismatch: " + src);
    assert.ok(!res.includes("or above") && !res.includes("Free") && !res.includes("receive"), "Quota translation should have no leftover English: " + res);
    assert.ok(!/限额|速率限制|最低基础限制|更高额度限制/.test(res), "Quota translation must unify to 配额: " + res);
  }

  const nuxCases = [
    ["Search Across Conversations", "跨对话搜索"],
    ["Search conversations with", "在左上方点击"],
    ["in the top left.", "即可搜索对话。"],
    ["View archived in the sidebar (", "在侧边栏中查看已归档内容（"],
    ["View archived in the sidebar", "在侧边栏中查看已归档内容"],
    ["menu).", "菜单）。"],
    ["Dismiss", "忽略"],
    ["Search conversations with 🔍 in the top left.", "在左上方点击 🔍 即可搜索对话。"],
    ["View archived in the sidebar (🝕 menu).", "在侧边栏中查看已归档内容（🝕 菜单）。"]
  ];
  for (const [src, expected] of nuxCases) {
    const res = translateDictionaryValue(src, dict);
    assert.equal(res, expected, "NUX case mismatch: " + src);
  }
});

test("in-page find widget, Y4 markdown renderer injection, and plugin sublevel commands are fully covered", async () => {
  const dict = await loadDomTranslations();

  // 1. 查找栏（Find in page）计数及操作
  assert.equal(translateDictionaryValue("2 of 2", dict), "第 2 项，共 2 项");
  assert.equal(translateDictionaryValue("1 of 10", dict), "第 1 项，共 10 项");
  assert.equal(translateDictionaryValue("No Results", dict), "无结果");
  assert.equal(translateDictionaryValue("Match Case (Aa)", dict), "区分大小写 (Aa)");
  assert.equal(translateDictionaryValue("Match Whole Word (ab)", dict), "全字匹配 (ab)");
  assert.equal(translateDictionaryValue("Use Regular Expression (.*)", dict), "使用正则表达式 (.*)");
  assert.equal(translateDictionaryValue("Previous Match", dict), "上一个匹配项");
  assert.equal(translateDictionaryValue("Next Match", dict), "下一个匹配项");

  // 2. 插件详情子级（Commands, Skills, MCP, 状态提示）
  assert.equal(translateDictionaryValue("Commands", dict), "命令");
  assert.equal(translateDictionaryValue("Skills", dict), "技能");
  assert.equal(translateDictionaryValue("Agents", dict), "智能体");
  assert.equal(translateDictionaryValue("MCP servers", dict), "MCP 服务器");
  assert.equal(translateDictionaryValue("Setup required", dict), "需要配置");
  assert.equal(translateDictionaryValue("Accounts tab", dict), "“账户”标签页");
  assert.equal(translateDictionaryValue("UI Extension 1", dict), "UI 扩展 1");
  assert.equal(translateDictionaryValue("Automation 2", dict), "自动化 2");

  // 3. Gmail 概览与命令
  const gmailOverview = "Run your Gmail inbox. Search and summarize threads, draft replies, organize labels, and send messages with your approval.";
  assert.equal(translateDictionaryValue(gmailOverview, dict), "高效管理你的 Gmail 收件箱。搜索并总结邮件会话、起草回复、整理标签，并在获得你的确认后发送邮件。");

  const gmailCmdTruncated = "Read, search, send, and manage Gmail messages, drafts, labels, and emoji reactions using a Go CLI. Use when...";
  assert.equal(translateDictionaryValue(gmailCmdTruncated, dict), "使用 Go 命令行工具读取、搜索、发送并管理 Gmail 邮件、草稿、标签和表情回应。适用于…");

  // 4. 2.31.0 Y4 MarkdownRenderer 注入验证
  const mockY4 = Buffer.from(
    'function Y4({markdown:a,className:b,baseDirUri:c}){return B.createElement(cz,{value:void 0},B.createElement(j4,{cascadeId:void 0,markdown:a,context:"artifact"}))}',
    "utf8"
  );
  const localizedY4 = createLocalizedBundle(mockY4, dict).buffer.toString("utf8");
  assert.ok(localizedY4.includes("globalThis.__AGY_ZHCN_TRANSLATE_MD__"), "Y4 MarkdownRenderer must be injected with translateMarkdownText hook");
});

test("Antigravity 2.31.0 (v2.3.9) 10-screenshot & 1-4 level overlay, chapter, quota, progress, and layout regression suite", async () => {
  const dict = await loadDomTranslations();

  // 1. 词库边界断言（禁词检查 + 术语统一）
  assert.equal(dict.exact["Stay up to date."], "订阅最新资讯。");
  assert.equal(translateDictionaryValue("1 update", dict), "1 条进度更新");
  assert.equal(translateDictionaryValue("2 updates", dict), "2 条进度更新");
  assert.notEqual(dict.exact["1 update"], "1 条更新");
  assert.equal(dict.exact["Replace with New"], "替换为新对话");
  assert.equal(dict.exact["Google Privacy Policy"], "Google 隐私权政策");
  assert.equal(dict.exact["Request Review"], "请求评审");

  // 2. 在 vm 沙箱中执行真实 createRuntimeOverlay，验证运行时导出函数
  const overlayCode = createRuntimeOverlay(dict);
  const ctx = {
    globalThis: {},
    window: {},
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    document: {
      readyState: "loading",
      documentElement: { lang: "" },
      body: {},
      addEventListener: () => {},
      createElement: () => ({ style: {} }),
      head: { appendChild: () => {} },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    console,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  new vm.Script(overlayCode).runInContext(ctx);

  // 图 10: 进度更新 & 耗时统一为 "条进度更新" 与 4 单位中文耗时
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("1 update"), "1 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("2 updates"), "2 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("14 updates"), "14 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("Worked for 31s · 2 updates"), "工作耗时 31 秒 · 2 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("Worked for 14s · 1 update"), "工作耗时 14 秒 · 1 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE__("Worked for 15m 20s · 3 updates"), "工作耗时 15 分钟 20 秒 · 3 条进度更新");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_DUR__("3d 18h"), "3 天 18 小时");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_DUR__("2h 5m 10s"), "2 小时 5 分钟 10 秒");

  // 图 4 & 6: 套餐名称与多句描述统一使用 "配额" 且无 "限额/速率限制/最低基础限制"
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN__("Antigravity Starter Quota"), "Antigravity 入门版配额");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN__("Antigravity Pro Quota"), "Antigravity 专业版配额");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN__("Antigravity Ultra Quota"), "Antigravity 旗舰版配额");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN__("Google AI Pro"), "Google AI Pro");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN__("Enterprise Gateway"), "企业网关");

  const starterDesc = "Google AI Plus users receive the minimum base limits on Antigravity. You can upgrade to Google AI Pro or above to receive higher rate limits.";
  const trStarterDesc = ctx.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(starterDesc);
  assert.equal(trStarterDesc, "Google AI Plus 用户在 Antigravity 上享有最低基础配额。你可以升级到 Google AI Pro 或更高方案以获取更高配额。");
  assert.ok(!/限额|速率限制|最低基础限制|更高额度限制/.test(trStarterDesc));

  const proDesc = "You can upgrade to Google AI Ultra plan to receive higher rate limits.";
  const trProDesc = ctx.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(proDesc);
  assert.equal(trProDesc, "你可以升级至 Google AI Ultra 方案以获取更高配额。");

  const proForDesc = "You can upgrade to Google AI Ultra for higher rate limits.";
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(proForDesc), "你可以升级至 Google AI Ultra 方案以获取更高配额。");

  const plusForDesc = "Google AI Plus users get minimum baseline limits on Antigravity. You can upgrade to Google AI Pro or above for higher rate limits.";
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_PLAN_DESC__(plusForDesc), "Google AI Plus 用户在 Antigravity 上享有最低基础配额。你可以升级至 Google AI Pro 或更高方案以获取更高配额。");

  // 图 7 / 8 / 9: 章节标题 & 未知标题含时间后缀不出现错位/残词
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_CHAPTER__("Refining Antigravity desktop Chinese localization"), "优化 Antigravity 桌面端中文本地化");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_CHAPTER__("Fixing missed code fragments during debugging"), "修复调试期间遗漏的代码片段");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_CHAPTER__("Synchronizing local and GitHub repositories"), "同步本地与 GitHub 仓库");
  const dynChapter = ctx.__AGY_ZHCN_TRANSLATE_CHAPTER__("Resolving bilingual interface text issues during debugging");
  assert.equal(dynChapter, "解决调试期间的双语界面文本问题");
  assert.equal(ctx.__AGY_ZHCN_TRANSLATE_CHAPTER__("Fixing bilingual UI text issues during debugging"), "修复调试期间的双语界面文本问题");

  // 3. 首页布局红线：BXc 与 flexBasis:"clamp(72px, calc(32vh - 66px), 264px)" 绝对零修改 + 2.31.0 核心注入通过语法检查
  const sample231Source = [
    'B.createElement("div",{"aria-hidden":"true",className:"shrink min-h-0 -mb-6",style:{flexBasis:"clamp(72px, calc(32vh - 66px), 264px)"}}),B.createElement(BXc,null)',
    'const R6=[{named:a=>`Hey ${a}, what should we build today?`,unnamed:"Hey there, what should we build today?"},{named:a=>`Welcome back, ${a}. Where should we pick up?`,unnamed:"Welcome back. Where should we pick up?"},{named:a=>`Good to see you, ${a}. What\'s next?`,unnamed:"Good to see you. What\'s next?"}];',
    'v=`${v} ${v===1?"update":"updates"}`;t=t>0?`Worked for ${Is(t)} \\u00b7 ${v}`:v;',
    'B.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"font-medium leading-snug text-foreground"},d??DVc(a,b))',
    'const RBc=[{id:"overview",label:"Overview"},{id:"accounts",label:"Accounts"},{id:"skills",label:"Skills"},{id:"mcp",label:"MCP"},{id:"agents",label:"Agents"},{id:"hooks",label:"Hooks"},{id:"rules",label:"Rules"},{id:"uiExtensions",label:"UI Extensions"},{id:"sidecars",label:"Automations"},{id:"context-providers",label:"Context Providers"}];',
    'B.createElement(RP,{title:B.createElement("div",\n{className:"flex items-center gap-1.5"},B.createElement("span",null,"Models & Usage"),B.createElement(Uy,{variant:"ghost",size:"icon-lg",onClick:w,disabled:n===void 0,title:"Refresh quota and credits data","aria-label":"Refresh quota and credits data"},B.createElement(dq,{name:"refresh",size:20,className:n===void 0?"animate-spin":""}))),description:"Manage your model quota and credits."},h==="signedIn"&&l&&B.createElement(VP,{title:"Plan"},B.createElement(TP,null,B.createElement(UP,{label:B.createElement("div",\n{className:"font-medium"},"Your Plan: ",l),description:m,rightElement:c?.userTier?.upgradeSubscriptionUri&&B.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_MODELS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},c.userTier.upgradeButtonText||"Upgrade")}))),y!==void 0&&B.createElement(VP,{title:"Model Credits"},B.createElement(TP,\nnull,B.createElement(wIb,{label:"Enable AI Credit Overages",description:`When toggled on, ${g} will use your AI credits to fulfill model requests once you\'re out of model quota. ${g} will always use your model quota first before using AI credits.`,isSwitchOn:x,pushUpdate:A}),x&&B.createElement(UP,{label:`Available AI Credits: ${y??"0"}`,description:"Remaining AI credits"}))));',
    'kj={project4k:{title:"Project 4K",description:"Project 4K interface without developer tooling."},default:{title:"Default",description:"The full developer experience."}};'
  ].join("\n");
  const out231 = createLocalizedBundle(Buffer.from(sample231Source, "utf8"), dict).buffer.toString("utf8");
  assert.doesNotThrow(() => new vm.Script(out231), "2.31.0 localized output must be valid JavaScript");
  assert.ok(out231.includes('style:{flexBasis:"clamp(72px, calc(32vh - 66px), 264px)"}}),B.createElement(BXc,null)'));
  assert.ok(out231.includes("条进度更新"));
  assert.ok(out231.includes("__AGY_ZHCN_TRANSLATE_CHAPTER__"));
  assert.ok(out231.includes('{id:"overview",label:"概览"}'));
  assert.ok(out231.includes("__AGY_ZHCN_TRANSLATE_PLAN__"));
  assert.ok(out231.includes('title:"知识工作"'));
});

test("Antigravity 2.31.0 (v2.3.10) onboarding, entrance, and auth components are fully localized", async () => {
  const dict = await loadDomTranslations();

  // 1. Exact 覆盖核查
  assert.equal(dict.exact["Welcome to Antigravity!"], "欢迎使用 Antigravity！");
  assert.equal(dict.exact["Sign In with SSO"], "使用 SSO 登录");
  assert.equal(dict.exact["Trouble signing in? Enter authorization code"], "登录遇到问题？输入授权码");
  assert.equal(dict.exact["Authorization code"], "授权码");
  assert.equal(dict.exact["Paste authorization code"], "粘贴授权码");
  assert.equal(dict.exact["Submit code"], "提交代码");
  assert.equal(dict.exact["Select Billing Model"], "选择结算模式");
  assert.equal(dict.exact["Choose a Subscription"], "选择订阅方案");

  // 2. Dynamic 动态正则匹配核查
  const dynWelcome = "Welcome to Antigravity!".replace(
    new RegExp(Object.keys(dict.dynamic).find(k => new RegExp(k).test("Welcome to Antigravity!"))),
    dict.dynamic["^Welcome to (.+?)!$"]
  );
  assert.equal(dynWelcome, "欢迎使用 Antigravity！");

  // 3. 源码级精准替换与语法核查
  const sampleOnboarding = [
    'B.createElement("div",{className:"entrance-title text-3xl font-normal z-10 text-center px-4 max-w-full break-words"},t?a:`Welcome to ${a}!`)',
    'B.createElement("div",{className:"font-medium mb-8 text-xl"},a?`Select ${a} Theme`:"Select Theme")',
    'B.createElement("h2",{className:"text-xl font-medium text-center"},"Get Anything Done with ",a)',
    'a=`Hey ${g?.trim().split(/\\s+/)[0]||"there"}!`;',
    'a=d?b||`Sorry, this account is ineligible to use ${a}`:`Further action is required to use ${a}`',
    'const yPc=[{id:"build",icon:"code_blocks",title:"Build new features",description:"Hand off a feature and come back to working code."},{id:"fix",icon:"bug_report",title:"Debug and fix",description:"Automatically reproduce bugs, trace causes, test fixes."},{id:"research",icon:"lightbulb_2",title:"Research anything",description:"Ask about your code or any topic, get clear answers."},{id:"write",icon:"edit",title:"Write and edit docs",description:"Draft documents, emails, and notes that sound like you."}];',
    '[{id:"enterprise",icon:"spark",title:"Subscription",desc:"Use Antigravity through your Gemini subscription."},{id:"paygo",icon:"cloud",title:"Pay As You Go",desc:"Pay only for the tokens you use, billed through Gemini platform."}]',
    'var WBb=[{id:"global",label:"Global"},{id:"us",label:"United States"},{id:"eu",label:"Europe"}];',
    'B.createElement("p",{className:"mb-8 px-4 text-muted-foreground max-w-[468px] text-center"},"Plugins are packaged collections of skills and MCPs to help the Agent"," ",f?`in ${f} `:"","work with Google developer products. You can always change your choices in Settings.")',
    '"Location: ",D.location||"Global"'
  ].join("\n");

  const out = createLocalizedBundle(Buffer.from(sampleOnboarding, "utf8"), dict).buffer.toString("utf8");
  assert.doesNotThrow(() => new vm.Script(out), "Onboarding output must be valid JavaScript");
  assert.ok(out.includes("欢迎使用 ${a}！"));
  assert.ok(out.includes("选择 ${a} 主题"));
  assert.ok(out.includes('使用 ",a," 搞定一切任务'));
  assert.ok(out.includes('你好${g?.trim().split(/\\s+/)[0]?"，"+g.trim().split(/\\s+/)[0]:""}！'));
  assert.ok(out.includes("构建新功能"));
  assert.ok(out.includes("订阅制"));
  assert.ok(out.includes('{id:"global",label:"全球"}'));
  assert.ok(out.includes("位置："));
});

test("v2.3.11: comprehensive audit for deep menus, variables, timeline and marketplace", async () => {
  const current = await loadDomTranslations();

  // 1. 快捷键与各级子菜单
  assert.equal(current.exact["Submit Prompt (Alternate to Enter)"], "提交提示词（Enter 的备用快捷键）");
  assert.equal(current.exact["Enter always submits. This adds a second shortcut."], "按 Enter 键始终可提交。此项用于添加备用快捷键。");
  assert.equal(current.exact["Jump to Previous Prompt"], "跳转到上一条提示词");
  assert.equal(current.exact["Jump to Next Prompt"], "跳转到下一条提示词");
  assert.equal(current.exact["Pin / Unpin Conversation"], "置顶/取消置顶对话");
  assert.equal(current.exact["Toggle Word Wrap"], "切换自动换行");
  assert.equal(current.exact["Connect to SSH Host…"], "连接到 SSH 主机…");
  assert.equal(current.exact["Stop SSH Server…"], "停止 SSH 服务器…");
  assert.equal(current.exact["Switch to This Computer"], "切换到此电脑");
  assert.equal(current.exact["Delete Side Question"], "删除侧边提问");
  assert.equal(current.exact["Coordinator settings"], "协调智能体设置");

  // 2. 账户与方案名称
  assert.equal(current.exact["Your Plan:"], "你的方案：");
  assert.equal(current.exact["Antigravity Starter Quota"], "Antigravity 入门版配额");
  assert.equal(current.exact["Google AI Pro"], undefined);
  assert.equal(current.exact["Thinking effort"], "思考程度");
  assert.equal(current.exact["Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use."], "控制模型在回复前用于思考推理的时间与配额。提高思考程度可提升复杂问题的解答准确率，但会增加回复耗时并消耗更多配额。");

  // 3. 首次启动弹窗与欢迎登录页
  assert.equal(current.exact["Welcome to Antigravity!"], "欢迎使用 Antigravity！");
  assert.equal(current.exact["One last thing before getting started…"], "开始前最后确认一下…");
  assert.equal(current.exact["A few things to know, and a couple settings to review."], "在开始之前，有一些注意事项和几项设置需要你确认。");

  // 4. 源码级补丁断言：章节挂接、项目权限、删除项目、Your Plan
  const sampleBundle = [
    'var card = B.createElement("span",{ref:h,"data-titled":d?"true":void 0,className:"font-medium leading-snug text-foreground"},d??E_c(a,b));',
    'var plan = B.createElement(UP,{label:B.createElement("div",\n{className:"font-medium"},"Your Plan: ",l),description:m,rightElement:c?.userTier?.upgradeSubscriptionUri&&B.createElement("a",{href:jA(c.userTier.upgradeSubscriptionUri,"utm_campaign","ARGON_MODELS_PAGE"),target:"_blank",rel:"noopener noreferrer",className:"select-none rounded px-3 py-1 font-medium transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"},c.userTier.upgradeButtonText||"Upgrade")});',
    'var del = {description:p?B.createElement("span",null,"This ",A.lowercase," is managed by the"," ",B.createElement("strong",null,q)," automation and can only be deleted by deleting that automation."):null};',
    'var kf = H?B.createElement("span",null,"This project was created for"," ",J?B.createElement(B.Fragment,null,"the ",B.createElement("strong",null,J)):"an"," ","automation. ",$e):null;',
    'var v=u.length;v=`${v} ${v===1?"update":"updates"}`;t=t>0?`Worked for ${Is(t)} \\u00b7 ${v}`:v;'
  ].join("\n");

  const out = createLocalizedBundle(Buffer.from(sampleBundle, "utf8"), current).buffer.toString("utf8");
  assert.doesNotThrow(() => new vm.Script(out), "Localized bundle must have valid syntax");
  assert.ok(out.includes("__AGY_ZHCN_TRANSLATE_CHAPTER__"), "Must hook chapter translation on E_c");
  assert.ok(out.includes("你的方案：") || out.includes("当前方案："), "Must translate Your Plan");
  assert.ok(out.includes("此项目由 "), "Must eliminate project in deletion");
  assert.ok(out.includes("此项目专为 "), "Must eliminate broken Swarm automation text");
  assert.ok(out.includes("条进度更新"), "Must localize update/updates in progress");
});

test("v2.3.12: deep penetration audit for onboarding modal, plan names, skills, and marketplace", async () => {
  const current = await loadDomTranslations();

  // 1. 新增内置技能与插件说明
  assert.equal(current.exact["mcp-app-development"], "MCP 应用开发");
  assert.ok(current.exact["Build, package, and debug MCP Apps for Antigravity: MCP server tools whose results render as interactive UI in the conversation, in the side pane, or full-page from the sidebar. Use when adding interactive app capabilities or full-page views to your tools."].includes("为 Antigravity 构建、打包和调试 MCP 应用"));

  // 2. 插件市场与深度子菜单
  assert.equal(current.exact["Custom Context Menus"], "自定义右键菜单");
  assert.equal(current.exact["Open Links In"], "打开链接方式");
  assert.equal(current.exact["Enable Browser Tools"], "启用浏览器工具");
  assert.equal(current.exact["Browser Javascript Execution Policy"], "浏览器 JavaScript 执行策略");
  assert.equal(current.exact["Browser Actuation Rules"], "浏览器操作规则");
  assert.equal(current.exact["Coordinators"], "协调器");
  assert.equal(current.exact["Environments"], "运行环境");

  // 3. 首次引导弹窗源码替换验证
  const modalSample = [
    'B.createElement("h2",{className:q},"One last thing before getting started\\u2026"),B.createElement("p",{className:n?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"},"A few things to know, and a couple settings to review.")),B.createElement("ul",{className:"list-none p-0 m-0 flex flex-col gap-4"},B.createElement("li",null,B.createElement(iqc,{title:"Optimized for you"},',
    '"Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\\u2019t show you ads or let advertisers influence what ",a," says.")),B.createElement("li",null,B.createElement(iqc,{title:"Built to help, not hurt"},"Automated safeguards help to protect your conversations from insecure or unsafe content. That being said, users should be aware of potential agentic risks, including data exfiltration.")),B.createElement("li",null,B.createElement(iqc,{title:"You are in control"},',
    'a,"\\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent."))),B.createElement("hr",{className:"border-t border-border my-4"}),h?B.createElement("p",{className:"text-sm text-muted-foreground leading-normal"},"For ",k,", ",a," does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts)."):B.createElement("div",',
    '{className:"flex flex-col gap-3"},B.createElement(tz,{checked:b,onChange:c,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:`Help us improve ${a}.`},"Allow Google to collect and use your Interactions data, subject to the"," ",B.createElement("a",{href:"https://antigravity.google/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google ",a," Terms of Service")," ","and"," ",B.createElement("a",{href:"https://policies.google.com/privacy",className:"text-link hover:underline",',
    'target:"_blank",rel:"noreferrer"},"Google Privacy Policy"),". You can control this from your settings at any point.")}),B.createElement(tz,{checked:d,onChange:f,disabled:g,alignTop:!0,label:B.createElement(jqc,{title:"Stay up to date."},"Sign up for newsletters, tips and tricks, and other notifications about ",a,".")}))'
  ].join("\n");

  const out = createLocalizedBundle(Buffer.from(modalSample, "utf8"), current).buffer.toString("utf8");
  assert.ok(out.includes("开始使用前，还有最后几项确认…"), "Must translate modal title");
  assert.ok(out.includes("专属定制优化"), "Must translate section 1");
  assert.ok(out.includes("秉持安全设计，赋能开发"), "Must translate section 2");
  assert.ok(out.includes("一切由你掌控"), "Must translate section 3");
  assert.ok(out.includes("帮助改进 ${a}。") || out.includes("帮助我们改进 ${a}。"), "Must translate checkbox 1 title");
  assert.ok(out.includes("始终保持最新版本。") || out.includes("订阅最新资讯。"), "Must translate checkbox 2 title");
});


test("Case 137: translate plugin marketplace commands, tabs and descriptions via K4 hook and dictionary", async () => {
  const current = await loadDomTranslations();
  const sample = [
    'const RBc=[{id:"overview",label:"Overview"},{id:"accounts",label:"Accounts"},{id:"skills",label:"Skills"},{id:"mcp",label:"MCP"},{id:"agents",label:"Agents"},{id:"hooks",label:"Hooks"},{id:"rules",label:"Rules"},{id:"uiExtensions",label:"UI Extensions"},{id:"sidecars",label:"Automations"},{id:"context-providers",label:"Context Providers"}];',
    'const PBc={starting:"Starting...",stopping:"Stopping...",disabled:"Disabled",idle:void 0};',
    'function K4({title:a,displayPath:b,copyPath:c,description:d,content:f,modalChildren:g,badge:h,actions:k,actionsPaddingClass:l,disabled:m=!1,MarkdownRenderer:n}){var [p,q]=(0,B.useState)(!1),t=!!d||!!f||!!g,u=d||b;',
    'B.createElement("div",{className:"flex items-center gap-1.5 mb-1.5 px-3 font-semibold text-foreground"},"Setup required",B.createElement(w4,{variant:"muted"},ic.length)),B.createElement("p",{className:"px-3 text-sm text-muted-foreground mb-2 leading-relaxed"},ic.length===1?"This server needs you to sign in before the agent can use its tools.":"These servers need you to sign in before the agent can use their tools.")',
    'ic.length>0&&B.createElement("div",{className:"mb-2 px-3 font-semibold text-foreground"},\n"Configured servers")'
  ].join("\n");

  const out = createLocalizedBundle(Buffer.from(sample, "utf8"), current).buffer.toString("utf8");
  assert.ok(out.includes('{id:"overview",label:"概览"}'), "Must translate plugin overview tab");
  assert.ok(out.includes('{id:"skills",label:"技能"}'), "Must translate plugin skills tab");
  assert.ok(out.includes('{id:"agents",label:"智能体"}'), "Must translate plugin agents tab");
  assert.ok(out.includes('PBc={starting:"正在启动...",stopping:"正在停止...",disabled:"已禁用",idle:void 0}'), "Must translate MCP status");
  assert.ok(out.includes('globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__?.(d)'), "Must hook K4 description");
  assert.ok(out.includes('"需要配置"'), "Must translate setup required");
  assert.ok(out.includes('"已配置的服务器"'), "Must translate configured servers");
});

test("Case 138: translate plugin overview markdown, table cells, V4 UI extensions, and MCP server notes", async () => {
  const current = await loadDomTranslations();

  // 1. 词典深度录入核验
  assert.equal(current.exact["Your meetings in your workflow."], "会议融入你的工作流。");
  assert.equal(current.exact["Swarm Plugin"], "蜂群插件");
  assert.equal(current.exact["Live view of the native swarm board, roster and @mention graph for the current conversation's swarm."], "实时查看当前对话所属蜂群的原生留言板、成员名单和 @提及关系图。");
  assert.ok(current.exact["Equip your agent with current SDK patterns, CLI workflows, model identifiers, and live documentation lookup for building with the Gemini API."].includes("为你的智能体配备最新的 SDK 规范"));

  // 2. 测试 V4 UI 扩展拦截与 ABc 弹窗本地化
  const sampleV4 = [
    'n=k.config?.description||(c==="sidecar"?n:void 0)||k.sidecarId;',
    'D=f==="extension"||c.config?.hasWebUi?"UI Extension (SidePanel)":c.config?.mode?.case==="builtin"&&c.config?.mode?.value==="schedule"?"Scheduled Task":"Automation"',
    'window.confirm("Sign out of this server?")',
    'k=d?.get(f.serverName);'
  ].join("\n");

  const bundleOut = createLocalizedBundle(Buffer.from(sampleV4, "utf8"), current).buffer.toString("utf8");
  assert.ok(bundleOut.includes("globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__"), "Must hook V4 description");
  assert.ok(bundleOut.includes('"UI 扩展（侧面板）"'), "Must translate UI Extension SidePanel（侧面板，与左侧“侧边栏”区分）");
  assert.ok(bundleOut.includes('"确定要退出登录此服务器吗？"'), "Must translate sign out confirm");
  assert.ok(bundleOut.includes('k=(globalThis.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__'), "Must hook MCP server note");
});

test("Case 140: safe translate settings skills/rules without white screen, Google Workspace shelf and rate limits", async () => {
  const current = await loadDomTranslations();

  // 1. 作用域标签：Global -> 全局
  assert.equal(translateDictionaryValue("Global", current), "全局");

  // 2. 紧凑时间：2h ago -> 2 小时前
  assert.equal(translateDictionaryValue("2h ago", current), "2 小时前");

  // 3. 插件市场首页 Google Workspace 货架最新描述
  const gwsDesc = "Connect to Google Workspace, including Docs, Sheets, Slides, Drive, Calendar, and Gmail.";
  assert.equal(translateDictionaryValue(gwsDesc, current), "连接至 Google Workspace，涵盖文档、表格、幻灯片、云端硬盘、日历与 Gmail。");

  // 4. 企业配额说明
  const quotaText = "Antigravity does not support higher rate limits on this Google plan. Consider paid Google AI plans via a personal account or logging in with a Google Cloud project from a business account.";
  assert.equal(translateDictionaryValue(quotaText, current), "Antigravity 不支持在此 Google 方案下提升速率限制。请考虑通过个人账号购买付费 Google AI 方案，或使用企业账号的 Google Cloud 项目登录。");

  // 5. 内置技能名称与官方描述
  assert.equal(translateDictionaryValue("mcp-app-development", current), "MCP 应用开发");
  assert.equal(translateDictionaryValue("swarm", current), "蜂群协作");
  assert.equal(translateDictionaryValue("swarm_monitor", current), "蜂群监视者");
  assert.equal(translateDictionaryValue("swarm_narrator", current), "蜂群旁白员");
});

test("Case 141: verify full patterns retention (chat history times, weekly limits, timers) and Looker overview", async () => {
  const current = await loadDomTranslations();

  // 1. 会话历史时间 (图 1)
  assert.equal(translateDictionaryValue("2d", current), "2天");
  assert.equal(translateDictionaryValue("4d", current), "4天");
  assert.equal(translateDictionaryValue("15d", current), "15天");
  assert.equal(translateDictionaryValue("1mo", current), "1月");
  assert.equal(translateDictionaryValue("2mo", current), "2月");

  // 2. 配额限制刷新语句 (图 3)
  const weeklyText = "You have used some of your weekly limit, it will fully refresh in 6 days, 9 hours.";
  assert.equal(translateDictionaryValue(weeklyText, current), "你已使用部分每周配额，将在 6 天 9 小时后完全恢复。");
  const fiveHourText = "You have used some of your 5-hour limit, it will fully refresh in 33 minutes.";
  assert.equal(translateDictionaryValue(fiveHourText, current), "你已使用部分 5 小时配额，将在 33 分钟后完全恢复。");

  // 3. 任务栏定时器 (图 4)
  assert.equal(translateDictionaryValue("35s timer", current), "35 秒定时器");
  assert.equal(translateDictionaryValue("1m timer", current), "1 分钟定时器");
  assert.equal(translateDictionaryValue("20s timer", current), "20 秒定时器");

  // 4. Looker 插件详情页 (图 2)
  assert.equal(translateDictionaryValue("Looker Plugin for Antigravity", current), "Antigravity 的 Looker 插件");
  assert.equal(translateDictionaryValue("Register the OAuth Client App in Looker (One-Time Admin Setup)", current), "在 Looker 中注册 OAuth 客户端应用（管理员一次性设置）");

  // 5. 覆盖层动态规则绝不能为 0
  const overlay = createRuntimeOverlay(current);
  const m = overlay.match(/const patternTranslations\s*=\s*(\[[\s\S]*?\])\.map/);
  assert.ok(m, "patternTranslations array must exist in overlay");
  const parsed = JSON.parse(m[1]);
  assert.ok(parsed.length >= 3000, "patternTranslations must contain >= 3000 rules, got: " + parsed.length);
});

test("Case 142: translate Gemini 4 Carbon/Hydrogen/Argon promo cards, Orchestrator tooltips, Fast badge, Final Step and 2.32.2 components", async () => {
  const current = await loadDomTranslations();

  // 1. Gemini 4 推广卡片描述 (图 1 & 图 4)
  assert.equal(
    translateDictionaryValue("Our most advanced model yet!", current),
    "迄今为止我们最先进的模型！"
  );
  assert.equal(
    translateDictionaryValue("Our daily driver for rapid coding and dependable agentic execution!", current),
    "专为快速编码与可靠智能体执行打造的日常主力模型！"
  );

  // 2. Orchestrator (Carbon / Argon) 悬停气泡描述 (图 2 & 图 3)
  assert.equal(
    translateDictionaryValue("Carbon that may offload routine steps to Hydrogen. Same Carbon-level quality, fewer tokens used.", current),
    "可将常规步骤交由 Hydrogen 分担执行的 Carbon 模型。保持同等的 Carbon 级质量，消耗更少 Token。"
  );
  assert.equal(
    translateDictionaryValue("Argon that may offload routine steps to Hydrogen. Same Argon-level quality, fewer tokens used.", current),
    "可将常规步骤交由 Hydrogen 分担执行的 Argon 模型。保持同等的 Argon 级质量，消耗更少 Token。"
  );

  // 3. 搜索框最近文件与对话英文标题
  assert.equal(translateDictionaryValue("Final Step 28", current), "最终步骤 28");
  assert.equal(translateDictionaryValue("Using Chrome to Open Doubao", current), "使用 Chrome 打开豆包");
  assert.equal(translateDictionaryValue("Google Superiority Video Script", current), "谷歌优势对比视频剧本");

  // 4. 验证 2.32.2 组件名 (q2, T5, cNb, aNb, M_, vt) 在 createLocalizedBundle 中 100% 命中
  const sample2322 = [
    'var q2=({option:a,iconOnly:b=!1})=>{var c=eC();return a.tagTitle&&a.tagDescription?B.createElement(B.Fragment,null,B.createElement("div",{"data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&B.createElement("span",null,a.tagTitle),B.createElement(nq,{name:"info",className:"h-3 w-3 flex-none"})),B.createElement(qz,{id:c},B.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?B.createElement("div",\n{className:"bg-secondary rounded-full px-1.5 text-sm"},a.tagTitle):null};',
    'function T5({markdown:a,className:b,baseDirUri:c}){return a}',
    'const cNb=({item:a,onCopyPath:b,isLast:c,showBadge:d=!0})=>B.createElement(KT,{name:a.name,path:a.path,onCopyPath:b,description:a.description});',
    'const aNb=({isGlobal:a,workspaceName:b})=>B.createElement("span",{className:`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${a?"bg-blue-500/10 text-blue-400":"bg-green-500/10 text-green-400"}`},a?"Global":b?b.length>15?b.substring(0,15)+"\\u2026":b:"Workspace");',
    'var M_=({nux:a,logEvent:b,handleDismissNux:c,bodyContent:d,primaryCtaText:f,onPrimaryClick:g,secondaryCtaText:h,onSecondaryClick:k,onClose:l})=>{return null};',
    'function vt(a){return a?.annotations?.title?.trim()||a?.summary?.trim()||void 0}'
  ].join("\n");

  const bundleOut = createLocalizedBundle(Buffer.from(sample2322, "utf8"), current).buffer.toString("utf8");
  assert.ok(bundleOut.includes('"Fast":"快速"'), "Must translate Fast badge in q2");
  assert.ok(bundleOut.includes("__AGY_ZHCN_TRANSLATE_MODEL_DESC__"), "Must hook model tag description");
  assert.ok(bundleOut.includes("function T5({markdown:a,className:b,baseDirUri:c}){a=globalThis.__AGY_ZHCN_TRANSLATE_MD__"), "Must hook T5 MarkdownRenderer in 2.32.2");
  assert.ok(bundleOut.includes('a?"全局":b?b.length>15?b.substring(0,15)+"\\u2026":b:"工作区"'), "Must translate aNb badge in 2.32.2");
  assert.ok(bundleOut.includes("__AGY_ZHCN_TRANSLATE_CHAPTER__"), "Must hook vt conversation title in 2.32.2");
});

test("Case 143: translate 2.32.2 Swarm automation managed project notice, permission settings subtitle, and 2.32.2 settings components", async () => {
  const current = await loadDomTranslations();

  // 1. 验证 2.32.2 真实混淆源码片段在 createLocalizedBundle 中 100% 转化为纯正中文，绝无半中半英
  const sample2322Settings = [
    // 图 1：设置 -> 项目 -> 危险区域 -> 删除项目（含换行符）
    'p?B.createElement("span",null,"This ",A.lowercase," is managed by the",\n" ",B.createElement("strong",null,q)," automation and can only be deleted by deleting that automation."):',
    // 图 2：设置 -> 项目 -> 权限设置副标题（2.32.2 新变量名 pe, yc, I, y, ke, F, G 及换行符）
    'pe=B.createElement(B.Fragment,null,"Also includes"," ",B.createElement("span",{onClick:yc,className:"text-link hover:underline cursor-pointer font-medium"},"Global Permissions")," ","when working ",I,"."," ",y.product.customLinks.docsPermissions&&B.createElement(B.Fragment,null,B.createElement("a",{href:y.product.customLinks.docsPermissions,target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline cursor-pointer font-medium"},"Learn more"),".")),ke=F?B.createElement("span",\nnull,"This project was created for"," ",G?B.createElement(B.Fragment,null,"the ",B.createElement("strong",null,G)):"an"," ","automation. ",pe):B.createElement("span",null,pe)',
    // 2.32.2 权限行与新建对话按钮设置
    'ch=B.createElement(KQ,{label:"File Access Rules",badge:Wb>0?Wb:void 0,description:"Configure allowed and denied paths for file reads and writes.",rightElement:B.createElement(sz,{variant:"secondary",size:"sm",onClick:()=>{lb("file")}},"Open")})',
    'function KOb(a){switch(a){case "newWorkspace":return"New Workspace";case "noProject":return"No Project";case "lastWorkspace":return"Last Workspace"}}function LOb(a){switch(a){case "newWorkspace":return"Create a new workspace from your first message.";case "noProject":return"Start without a workspace, for general questions.";case "lastWorkspace":return"Reuse your last workspace."}}'
  ].join("\n");

  const bundleOut = createLocalizedBundle(Buffer.from(sample2322Settings, "utf8"), current).buffer.toString("utf8");
  const sourcePart = bundleOut.split("(() => {")[0];

  // 断言图 1 完全中文化且无 " is managed by the" 残留
  assert.ok(
    sourcePart.includes('p?B.createElement("span",null,"此",A.lowercase==="workspace"?"工作区":"项目","由 ",B.createElement("strong",null,q)," 自动化统一管理，只能通过删除该自动化来删除。"):'),
    "Must translate 2.32.2 Swarm managed project notice with newline"
  );
  assert.ok(!sourcePart.includes('" is managed by the"'), "Must not leave English 'is managed by the'");

  // 断言图 2 完全中文化且无 "This project was created for" 或 "Also includes" 残留
  assert.ok(
    sourcePart.includes('"此项目专为 ",G?B.createElement(B.Fragment,null,"“",B.createElement("strong",null,G),"”"):"某项"," 自动化创建。"'),
    "Must translate 2.32.2 'This project was created for' with variable G"
  );
  assert.ok(
    sourcePart.includes('"同时包含在",I==="in these conversations"?"这些对话":I==="in this workspace"?"此工作区":"此项目","中生效的 ",B.createElement("span",{onClick:yc,className:"text-link hover:underline cursor-pointer font-medium"},"全局权限"),"。 "'),
    "Must translate 2.32.2 'Also includes Global Permissions when working' with variables yc and I"
  );
  assert.ok(!sourcePart.includes('"This project was created for"'), "Must not leave English 'This project was created for'");

  // 断言 2.32.2 权限行与新建对话默认工作区设置
  assert.ok(sourcePart.includes('label:"文件访问规则"'), "Must translate KQ File Access Rules in 2.32.2");
  assert.ok(sourcePart.includes('return"上次工作区"'), "Must translate KOb Last Workspace in 2.32.2");
  assert.ok(sourcePart.includes('return"从你的第一条消息自动创建一个新工作区。"'), "Must translate LOb description in 2.32.2");
});

test("Case 144: translate 2.32.2 Automations schedule editor, local/cloud description, create-with-prompt default text, and conversation title", async () => {
  const current = await loadDomTranslations();

  assert.equal(
    translateDictionaryValue("Google Superiority Video Script Review", current),
    "谷歌优势对比视频脚本评审"
  );
  assert.equal(
    translateDictionaryValue("Uses your local files and tools. Schedules only.", current),
    "使用你的本地文件与工具。仅支持定时计划。"
  );
  assert.equal(
    translateDictionaryValue("Orchestrator (Carbon)", current),
    null
  );
  assert.equal(
    translateDictionaryValue("Orchestrator (Argon)", current),
    null
  );

  const sampleAutomation = [
    'function K$c({goToHome:a,draftKey:b}){var {draftsRef:c,getLexicalEditor:d}=(0,B.useContext)(rC);return(0,B.useCallback)((f="[/automation](slashCommand;automation) Guide me through creating an automated task")=>{return f})}',
    'S=ac=>ac==="local"?"Uses your local files and tools. Schedules only.":`Runs even when your computer is off. ${N?"Schedules and events.":"Schedules only."}`',
    'function $6(a,b){var c=a<12?"AM":"PM";return`${a%12===0?12:a%12}:${String(b).padStart(2,"0")} ${c}`}',
    'B.createElement("span",{className:"text-muted-foreground select-none"},"at")',
    'var Upa=a=>a.modelOrAlias?{label:a.label,value:a.modelOrAlias.choice.case==="model"?a.modelOrAlias.choice.value:E.Model.UNSPECIFIED,modelAlias:a.modelOrAlias.choice.case==="alias"?a.modelOrAlias.choice.value:void 0,disabled:a.disabled,supportedMimeTypes:new Map(Object.entries(a.supportedMimeTypes)),quotaInfo:a.quotaInfo,tagTitle:a.tagTitle,tagDescription:a.tagDescription,'
  ].join("\n");

  const bundleOut = createLocalizedBundle(Buffer.from(sampleAutomation, "utf8"), current).buffer.toString("utf8");
  const sourcePart = bundleOut.split("(() => {")[0];

  assert.ok(
    sourcePart.includes('(f="[/automation](slashCommand;automation) 引导我创建一个自动化任务")=>'),
    "Must translate create-with-prompt default text while preserving [/automation](slashCommand;automation)"
  );
  assert.ok(
    sourcePart.includes('ac==="local"?"使用你的本地文件与工具。仅支持定时计划。":`即使电脑关机也能继续运行。${N?"支持定时计划与事件触发。":"仅支持定时计划。"}`'),
    "Must translate local and cloud automation descriptions"
  );
  assert.ok(
    sourcePart.includes('function $6(a,b){var c=a<12?"上午":"下午";return`${c} ${a%12===0?12:a%12}:${String(b).padStart(2,"0")}`}'),
    "Must translate $6 time formatter to Chinese AM/PM"
  );
  assert.ok(
    sourcePart.includes('B.createElement("span",{className:"text-muted-foreground select-none"},"于")'),
    "Must translate schedule connector 'at' to '于'"
  );
  assert.ok(
    !sourcePart.includes('编排器 ('),
    "Must preserve official model tier names Orchestrator (Carbon/Argon) without renaming to 编排器"
  );

  assert.equal(
    translateDictionaryValue("Your current account is not eligible for Antigravity. To use Antigravity you must be 18 years old or older. If you think you are receiving this message in error, please ensure you have verified your age and try to log in again.", current),
    "你当前的账号暂无使用 Antigravity 的资格。若要使用 Antigravity，你必须年满 18 周岁。如果你认为此提示有误，请确保已验证年龄并尝试重新登录。"
  );
  assert.equal(
    translateDictionaryValue("To use Antigravity you must be 18 years old or older.", current),
    "若要使用 Antigravity，你必须年满 18 周岁。"
  );
  assert.equal(
    translateDictionaryValue("If you think you are receiving this message in error, please ensure you have verified your age and try to log in again.", current),
    "如果你认为此提示有误，请确保已验证年龄并尝试重新登录。"
  );
  assert.equal(
    translateDictionaryValue("Learn more by visiting our FAQ.", current),
    "访问我们的常见问题解答。"
  );
});

test("Case 145: 3-tier funnel anti-MT auto-translation, persistent auto-learned dict, conversation title writeback, and zero-console VBS launcher", async () => {
  const vm = await import("node:vm");
  const os = await import("node:os");
  const path = await import("node:path");
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { mergeAutoLearnedEntries, readAutoLearnedDict } = await import("../src/lib/auto-learned-dict.mjs");
  const { buildSilentLauncherVbs, buildSilentDaemonVbs } = await import("../src/lib/auto-follow-task.mjs");

  // 1. 测试硬盘级永久自学习词库读写与主词库合并优先级
  const tempStateDir = await mkdtemp(path.join(os.tmpdir(), "agy-auto-dict-test-"));
  const prevStateEnv = process.env.AGY_ZHCN_STATE_DIR;
  try {
    process.env.AGY_ZHCN_STATE_DIR = tempStateDir;
    const added = await mergeAutoLearnedEntries({
      "Brand New Official Feature Toggle": "全新官方功能开关",
      "Copy": "机翻错误覆盖测试"
    });
    assert.equal(added, 2);
    const diskDict = await readAutoLearnedDict();
    assert.equal(diskDict["Brand New Official Feature Toggle"], "全新官方功能开关");

    const merged = await loadDomTranslations();
    // 持久化标题词库不再混入静态主词库，避免污染普通界面翻译
    assert.equal(merged.exact["Brand New Official Feature Toggle"], undefined);
    // 人工精校主词库保持纯粹（"Copy" 仍保持 "复制"）
    assert.equal(merged.exact["Copy"], "复制");
  } finally {
    if (prevStateEnv === undefined) delete process.env.AGY_ZHCN_STATE_DIR;
    else process.env.AGY_ZHCN_STATE_DIR = prevStateEnv;
    await rm(tempStateDir, { recursive: true, force: true });
  }

  // 2. 测试运行时四道防机翻护栏 + 新对话英文标题自动转中文持久化写回
  const current = await loadDomTranslations();
  const sampleHooks = [
    'var U4b=fk("trajectorySummaries/markConversationAsReadThunk",async(a,b)=>{var c=e,d=e;try{let f=a.cascadeId,g=a.agentService;b.dispatch(nl({cascadeId:f,annotations:{markedAsUnread:!1}}));d(await c(g.updateConversationAnnotations?.(f,Vb(uf.ConversationAnnotationsSchema,{markedAsUnread:!1,lastUserViewTime:Xe(new Date)}),!0)))}finally{c()}});',
    'var b5b=()=>{var a=eH(),b=yk(),c=lI(),d=HI(),{updateConversationAnnotations:f}=kt(),g=ju(),h=GI();(0,B.useEffect)(()=>$4b({subscribeToRoute:k=>a.subscribe("onResolved",k),getCascadeIdParam:c,getBattleIdParam:d,dispatch:b.dispatch,deps:{updateConversationAnnotations:f,recordError:g,getStartingConversationIds:()=>Iva(b.getState())}}),[a,b,c,d,f,g]);return h?B.createElement(a5b,{battleId:h}):null};'
  ].join("\n");

  const bundleOut = createLocalizedBundle(Buffer.from(sampleHooks, "utf8"), { exact: {}, patterns: [], fragments: [] }).buffer.toString("utf8");
  assert.ok(bundleOut.includes("globalThis.__AGY_ZHCN_ANNOT_HELPERS__="), "Must inject annotation helpers hook");
  assert.ok(bundleOut.includes("globalThis.__AGY_ZHCN_BIND_TITLE_WATCHER__?.(b,f);"), "Must inject b5b global title watcher hook");

  // 在沙箱中执行 overlay 验证防机翻占位保护、术语锚定、译后润色与标题写回
  const overlayCode = createRuntimeOverlay({ exact: {}, patterns: [] });
  const persistedBatches = [];
  const dispatchedActions = [];
  const persistedAnnotations = [];
  const sandbox = {
    document: {
      readyState: "loading",
      documentElement: { lang: "en" },
      addEventListener() {}
    },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
    MutationObserver: class { observe() {} },
    setTimeout,
    clearTimeout,
    __AGY_ZHCN_CUSTOM_TRANSLATE_FETCH__: async (prepared) => {
      // 验证专有名词已被占位符 ⟦0⟧ (`plan`) 和 ⟦1⟧ (Gemini 4 Carbon) 保护，且 agent/workspace 已被预锚定为 智能体/工作区
      if (prepared.includes("智能体") && prepared.includes("工作区")) {
        return "允许智能体在工作区中使用 ⟦ 1 ⟧ 运行 ⟦0⟧。";
      }
      if (prepared.includes("豆包")) {
        return "使用 ⟦0⟧ 分析豆包视频脚本。";
      }
      return "设计现代客厅布局。";
    },
    __AGY_ZHCN_ON_PERSIST_DICT__: async (batch) => {
      persistedBatches.push(batch);
    },
    __AGY_ZHCN_ANNOT_HELPERS__: {
      localAction: (p) => ({ type: "LOCAL_ANNOT", payload: p }),
      makeProto: (o) => ({ proto: o })
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(overlayCode, sandbox);

  // 联网仅用于纯英文会话标题：普通界面文案一律不再送去联网；标题仍严格受隐私与保护规则约束
  {
    const makeEl = (tag, testid, parent = null, attrs = {}) => {
      const el = {
        nodeType: 1, tagName: tag.toUpperCase(), parentElement: parent,
        getAttribute: (n) => (n === "data-testid" ? testid : (attrs[n] ?? null)),
        closest(sel) {
          const parts = sel.split(",").map((s) => s.trim());
          for (let n = this; n; n = n.parentElement) {
            for (const s of parts) {
              if (s === n.tagName.toLowerCase()) return n;
              if (s.startsWith(".") && (n.getAttribute("class") || "").split(" ").includes(s.slice(1))) return n;
              const m = s.match(/^\[([\w-]+)(?:='([^']*)')?\]$/);
              if (m && (m[2] === undefined ? n.getAttribute(m[1]) !== null : n.getAttribute(m[1]) === m[2])) return n;
            }
          }
          return null;
        }
      };
      return el;
    };
    const eligible = sandbox.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__;
    const shortcutRow = makeEl("div", "shortcut-row-terminalSelectAll");
    assert.equal(eligible("Terminal: Select All", makeEl("span", null, shortcutRow), false), true, "界面联网补充翻译：快捷键行不能因标识含 terminal 被误排除");
    assert.equal(eligible("No terminals running yet", makeEl("p", "bottom-terminal-panel-empty"), false), true, "终端面板空状态属于界面文字");
    assert.equal(eligible("Message the agent here", makeEl("span", null, makeEl("div", "settings-error-messages-card")), false), true);
    const hostInput = makeEl("input", null, makeEl("div", "ssh-host-picker"));
    assert.equal(eligible("Search Hosts...", hostInput, false, true), true, "输入框自身的占位符可以联网补译");
    assert.equal(eligible("Search Hosts...", hostInput, false, false), false, "输入框内的文字不补译");
    for (const id of ["user-message-content", "live-transcript", "terminal-surface", "browser-subagent-thinking", "conversation-navigator-turn", "agent-response-message", "turn-12"]) {
      assert.equal(eligible("Please refactor the build script", makeEl("span", null, makeEl("div", id)), true), false, id + " 内的内容不得联网");
    }
    assert.equal(eligible("Please refactor the build script", makeEl("span", null, makeEl("div", "x", null, { class: "xterm" })), true), false);
    assert.equal(eligible("Analyzing Doubao Video Script with Gemini", null, true), true, "纯英文会话标题允许自动翻译");
    // 文件名、链接、路径、行内代码不论出现在标题中何处都不联网
    for (const s of ["Close package-usage.txt", "Opens external link: https://127.0", "`/Applications/Ant", "Open report in /tmp/out", "Edited silent-auto-follow.vbs"]) {
      assert.equal(eligible(s, null, true, false), false, s + " 不得联网");
    }
  }

  // 组合标签：变量部分查词库后套句式，旧的联网机翻结果不再覆盖
  {
    const overlay = createRuntimeOverlay({
      exact: { "Toggle Terminal": "切换终端", "Open Settings": "打开设置", "Fixing bugs": "修复错误" },
      patterns: []
    });
    const box = { document: { readyState: "loading", documentElement: { lang: "en" }, addEventListener() {} }, Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 }, MutationObserver: class { observe() {} }, setTimeout, clearTimeout };
    box.globalThis = box;
    vm.runInNewContext(overlay, box);
    const tv = box.__AGY_ZHCN_TRANSLATE_VALUE__;
    assert.equal(tv("Shortcut Ctrl+J for Toggle Terminal"), "“切换终端”的快捷键 Ctrl+J");
    assert.equal(tv("Remove shortcut Ctrl+, for Open Settings"), "删除“打开设置”的快捷键 Ctrl+,");
    assert.equal(tv("Shortcut Ctrl+J for Unknown Action"), null);
    assert.equal(tv("Install Better Stack"), "安装 Better Stack");
    assert.equal(tv("Install monday.com"), "安装 monday.com");
    assert.equal(tv("Install the CLI to continue"), null);
    assert.equal(tv("Fixing bugs, 14 turns"), "修复错误，14 轮对话");
  }
  {
    const { isObsoleteLearnedKey } = await import("../src/lib/auto-learned-dict.mjs");
    assert.equal(isObsoleteLearnedKey("Shortcut Ctrl+Shift+. for Next Side Panel Tab"), true);
    assert.equal(isObsoleteLearnedKey("Install Stripe"), true);
    assert.equal(isObsoleteLearnedKey("Close package-usage.txt"), true);
    assert.equal(isObsoleteLearnedKey("Fixing bugs, 2 turns"), true);
    assert.equal(isObsoleteLearnedKey("Copied sign-in link to clipboard"), false);
    assert.equal(isObsoleteLearnedKey("Better Stack"), true, "品牌名的旧机翻要丢弃");
    assert.equal(sandbox.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__("Grafana Cloud", null, true, false), false, "品牌名不联网");
    // 账号卡片（头像 + 邮箱）里的姓名不联网；用虚构姓名测试，公开仓库不写真实个人信息
    {
      const card = {
        nodeType: 1, parentElement: null, textContent: "Jane Example jane@example.com",
        getAttribute: () => null,
        closest(sel) { return sel.includes("div") ? this : null; },
        querySelector: (sel) => (sel.includes("rounded-full") ? {} : null)
      };
      const nameEl = { nodeType: 1, parentElement: card, getAttribute: () => null, closest(sel) { return sel.includes("div") ? card : null; } };
      assert.equal(sandbox.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__("Jane Example", nameEl, true, false), false, "账号卡片里的姓名不联网");
    }
  }

  // 界面联网补充翻译同样走防机翻流水线：命令和模型名占位保护，智能体 / 工作区预先锚定
  assert.equal(
    await sandbox.__AGY_ZHCN_AUTO_TRANSLATE__("Allow agents to run `/plan` with Gemini 4 Carbon in workspaces", { isTitle: false }),
    "允许智能体在工作区中使用 Gemini 4 Carbon 运行 `/plan`"
  );
  const titleTranslated = await sandbox.__AGY_ZHCN_AUTO_TRANSLATE__(
    "Allow agents to run `/plan` with Gemini 4 Carbon in workspaces",
    { isTitle: true }
  );
  assert.equal(titleTranslated, "允许智能体在工作区中使用 Gemini 4 Carbon 运行 `/plan`");

  // 验证新开对话英文标题自动转中文并写回 store 与 updateConversationAnnotations
  const fakeStore = {
    state: {
      trajectorySummaries: {
        summaries: {
          "conv-new-1": { summary: "Analyzing Doubao Video Script with Gemini", annotations: {} }
        }
      }
    },
    getState() { return this.state; },
    dispatch(act) { dispatchedActions.push(act); },
    subscribe() { return () => {}; }
  };
  const fakeUpdateAnnotations = async (cid, proto, merge) => {
    persistedAnnotations.push({ cid, proto, merge });
  };

  // 默认（未开启“标题写回”）：仅加入标题显示缓存，不改对话记录，也不污染普通 UI 静态词库
  sandbox.__AGY_ZHCN_BIND_TITLE_WATCHER__(fakeStore, fakeUpdateAnnotations);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(dispatchedActions.length, 0, "默认不得写回对话记录");
  assert.equal(persistedAnnotations.length, 0, "默认不得调用 updateConversationAnnotations");
  assert.equal(sandbox.__AGY_ZHCN_LOOKUP__("Analyzing Doubao Video Script with Gemini"), "使用 Gemini 分析豆包视频脚本");
  assert.equal(sandbox.__AGY_ZHCN_TRANSLATE_VALUE__("Analyzing Doubao Video Script with Gemini"), null, "标题缓存不得污染普通 UI 翻译");

  // 用户在“汉化设置”中开启“标题写回”后才写回 store 与 updateConversationAnnotations
  const writeBackSandbox = { ...sandbox, fetch: async (url) => ({ ok: String(url) === "agy-zhcn://settings", json: async () => ({ titleAutoTranslate: true, titleWriteBack: true }) }) };
  writeBackSandbox.globalThis = writeBackSandbox;
  vm.runInNewContext(overlayCode, writeBackSandbox);
  await writeBackSandbox.__AGY_ZHCN_LOAD_SETTINGS__();
  const writeBackStore = { ...fakeStore, state: { trajectorySummaries: { summaries: { "conv-new-1": { summary: "Analyzing Doubao Video Script with Gemini", annotations: {} } } } } };
  writeBackSandbox.__AGY_ZHCN_BIND_TITLE_WATCHER__(writeBackStore, fakeUpdateAnnotations);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(dispatchedActions.length, 1);
  assert.equal(dispatchedActions[0].payload.annotations.title, "使用 Gemini 分析豆包视频脚本");
  assert.equal(persistedAnnotations.length, 1);
  assert.equal(persistedAnnotations[0].cid, "conv-new-1");
  assert.equal(persistedAnnotations[0].proto.proto.title, "使用 Gemini 分析豆包视频脚本");

  // 3. 验证零黑框 VBScript 启动器与守护包装器 100% 纯 7-bit ASCII 编码（彻底免疫 GBK/ANSI 800A0409 语法错误）及隐藏窗口模式 0
  const launcherVbs = buildSilentLauncherVbs();
  const daemonVbs = buildSilentDaemonVbs({
    nodeExePath: "D:\\Antigravity\\antigravity汉化包\\win启动\\配套程序\\node.exe",
    daemonScriptPath: "D:\\Antigravity\\antigravity汉化包\\语言包\\核心程序\\scripts\\silent-auto-follow-daemon.mjs",
    languagePackDir: "D:\\Antigravity\\antigravity汉化包\\语言包"
  });
  assert.ok(!/[^\x09\x0a\x0d\x20-\x7e]/.test(launcherVbs), "Launcher VBS must be 100% pure 7-bit ASCII");
  assert.ok(!/[^\x09\x0a\x0d\x20-\x7e]/.test(daemonVbs), "Daemon VBS must be 100% pure 7-bit ASCII even with Chinese paths");
  assert.ok(launcherVbs.includes("shell.Run(cmd, 0, True)"), "Launcher VBS must use window style 0 (hidden)");
  assert.ok(daemonVbs.includes("shell.Run cmd, 0, False"), "Daemon VBS must use window style 0 (hidden)");

  if (process.platform === "win32") {
    const { execFileSync } = await import("node:child_process");
    const vbsRoot = await mkdtemp(path.join(os.tmpdir(), "agy-vbs-probe-"));
    try {
      const vbsProbeDir = path.join(vbsRoot, "中文目录测试", "win启动");
      await mkdir(vbsProbeDir, { recursive: true });
      const probeVbsPath = path.join(vbsProbeDir, "probe.vbs");
      const probeOutPath = path.join(vbsRoot, "probe-out.txt");
      const allLines = launcherVbs.split("\r\n");
      const cutIdx = allLines.findIndex((l) => l.startsWith("scriptPath = "));
      const probeLines = allLines
        .slice(0, cutIdx + 1)
        .concat([
          "Dim outStream",
          `Set outStream = fso.CreateTextFile("${probeOutPath.replaceAll('"', '""')}", True, True)`,
          'outStream.Write packDir & "|" & coreDir & "|" & nodeExe',
          "outStream.Close",
          ""
        ]);
      await writeFile(probeVbsPath, probeLines.join("\r\n"), "ascii");
      execFileSync("cscript.exe", ["//NoLogo", probeVbsPath], { windowsHide: true });
      const { readFile: readFs } = await import("node:fs/promises");
      const cscriptOut = (await readFs(probeOutPath, "utf16le")).replace(/^\uFEFF/, "").trim();
      assert.ok(cscriptOut.includes("中文目录测试\\语言包|"), `Expected resolved Chinese packDir, got: ${cscriptOut}`);
      assert.ok(cscriptOut.includes("语言包\\核心程序|"), `Expected resolved Chinese coreDir, got: ${cscriptOut}`);
      assert.ok(cscriptOut.endsWith("|node.exe"), `Expected fallback node.exe when bundled node absent, got: ${cscriptOut}`);
    } finally {
      await rm(vbsRoot, { recursive: true, force: true });
    }
  }
});

test("Case 145: 自动化与定时任务界面空状态与新建按钮本地化", async () => {
  const dictionary = await loadDomTranslations();

  // 1. 词库精确命中
  assert.equal(translateDictionaryValue("Add automation", dictionary), "新建自动化");
  assert.equal(translateDictionaryValue("Add scheduled task", dictionary), "新建定时任务");
  assert.equal(translateDictionaryValue("No automations configured.", dictionary), "未配置计划任务。");
  assert.equal(translateDictionaryValue("No scheduled tasks configured.", dictionary), "未配置计划任务。");
  assert.equal(translateDictionaryValue("No automations matching your search", dictionary), "未找到匹配搜索的自动化");
  assert.equal(translateDictionaryValue("No scheduled tasks matching your search", dictionary), "未找到匹配搜索的定时任务");

  // 2. 静态源码替换覆盖最新 React 结构
  const sampleSource = [
    'var sample = D.createElement("div",{className:"px-2.5 py-16","data-testid":"sidecar-list-empty"},D.createElement("p",{className:"m-0 text-lg text-foreground"},"No ",t.emptyMessagePlural," yet"));',
    'var btn = D.createElement(Qz,{"aria-label":`Add ${t.emptyMessageSingular}`,"data-testid":"sidecar-new-button",paddingClassName:"pl-2.5 pr-3",icon:D.createElement(Nq,{name:"add",size:14})},"New")));',
    'var emptyList = D.createElement(a5c,{sidecars:Q,emptyMessage:O?`No ${t.emptyMessagePlural} matching your search`:`No ${t.emptyMessagePlural} configured.`});'
  ].join("\\n");

  const localized = createLocalizedBundle(Buffer.from(sampleSource, "utf8"), dictionary, { skipCoverage: true }).buffer.toString("utf8");

  assert.ok(localized.includes('D.createElement("p",{className:"m-0 text-lg text-foreground"},"暂无"'), "Empty state must be localized to '暂无'");
  assert.ok(localized.includes('"data-testid":"sidecar-new-button",paddingClassName:"pl-2.5 pr-3",icon:D.createElement(Nq,{name:"add",size:14})},"新建")))'), "New button text must be localized to '新建'");
  assert.ok(localized.includes('"aria-label":t.emptyMessageSingular==="automation"?"新建自动化":"新建定时任务"'), "Aria-label must be localized");
  assert.ok(localized.includes('emptyMessage:O?`未找到匹配搜索的'), "List empty message must be localized");
});

test("Case 146: 模型思考程度选项、说明与方案名称 Google AI Pro 本地化规范", async () => {
  const dictionary = await loadDomTranslations();

  // 1. 词典精确命中与品牌保护验证
  assert.equal(translateDictionaryValue("Thinking effort", dictionary), "思考程度");
  assert.equal(translateDictionaryValue("Thinking Effort", dictionary), "思考程度");
  assert.equal(
    translateDictionaryValue(
      "Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use.",
      dictionary
    ),
    "控制模型在回复前用于思考推理的时间与配额。提高思考程度可提升复杂问题的解答准确率，但会增加回复耗时并消耗更多配额。"
  );
  // Google AI Pro 保持品牌原文，不被误译为专业版
  assert.equal(translateDictionaryValue("Google AI Pro", dictionary), null);

  // 2. 静态 bundle 替换验证
  const sampleSource = [
    'function iW(a,b,c){if(b=cW.get(b))if(c=(c=fW(b,c))?b.groupsByKey.get(c.groupKey)?.labels.get(a):void 0)return c;return(Object.hasOwn(aW,a)?aW[a]:void 0)??a}',
    'E.createElement("span",{className:"whitespace-nowrap"},"Thinking effort")',
    'E.createElement(zI,{id:y},"Controls how much time and quota the model spends reasoning before responding. Higher effort improves accuracy on hard problems, at the cost of slower responses and higher quota use.")'
  ].join("\n");

  const localized = createLocalizedBundle(Buffer.from(sampleSource, "utf8"), dictionary, { skipCoverage: true }).buffer.toString("utf8");

  assert.ok(localized.includes('low:"低",medium:"中",high:"高"'), "iW mapping must localize low, medium, high to Chinese");
  assert.ok(localized.includes('E.createElement("span",{className:"whitespace-nowrap"},"思考程度")'), "Thinking effort must be localized to 思考程度");
  assert.ok(localized.includes("控制模型在回复前用于思考推理的时间与配额。提高思考程度可提升复杂问题的解答准确率，但会增加回复耗时并消耗更多配额。"), "Tooltip text must be localized");

  // 3. 运行时 DOM 覆盖层验证
  const overlayScript = createRuntimeOverlay(dictionary);
  const blockedMatch = overlayScript.match(/const blockedSelector = \[([\s\S]*?)\]\.join/);
  assert.ok(blockedMatch, "blockedSelector definition found");
  assert.ok(!blockedMatch[1].includes("model-selector-effort-group"), "Effort group should not be in blockedSelector");
  assert.ok(!blockedMatch[1].includes("model-selector-effort-option"), "Effort option should not be in blockedSelector");
  assert.ok(overlayScript.includes("model-selector-effort-option"), "DOM overlay must target effort options");
});

test("文件编辑分组标题不带量词：原文没有数字，不能出现“已编辑 个文件”", () => {
  const source = 'function h1b(a,b){var c=1,d=0;return c>0?c+d===1?"file":"files":d>0?d===1?"artifact":"artifacts":""}';
  const out = createLocalizedBundle(Buffer.from(source, "utf8"), { exact: {}, patterns: [], fragments: [] }).buffer.toString("utf8");
  assert.ok(out.includes('return c>0?"文件":d>0?"工件":""'), out);
  assert.ok(!out.includes("个文件") && !out.includes("个工件"));
});

test("Case 147: 2.35.1 跨版本模型标签、下线机翻纠偏、swarm_pane 技能与 steps 进度胶囊", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
  const dictionary = await loadDomTranslations();
  const { isObsoleteLearnedKey } = await import("../src/lib/auto-learned-dict.mjs");

  // 1. 词典与动态正则对步骤胶囊、新版本提示与漏翻技能的覆盖验证
  assert.equal(translateDictionaryValue("swarm_pane", dictionary), "蜂群面板");
  assert.equal(translateDictionaryValue("conversations", dictionary), "对话管理");
  assert.equal(translateDictionaryValue("Leaving Soon", dictionary), "即将下线");
  assert.equal(translateDictionaryValue("0/4 steps", dictionary), "0/4 步骤");
  assert.equal(translateDictionaryValue("6/6 steps", dictionary), "6/6 步骤");
  assert.equal(translateDictionaryValue("2/5 steps · 1 failed · 1 skipped", dictionary), "2/5 步骤 · 1 项失败 · 1 项已跳过");
  assert.equal(translateDictionaryValue("Load older messages, showing 100 of 20559", dictionary), "加载旧消息（已显示 100 / 20559 条）");
  assert.equal(
    translateDictionaryValue("Use Hydrogen for better quality with lower quota usage. Leaving on Nov 30.", dictionary),
    "建议使用 Hydrogen，模型质量更优且配额消耗更低。此模型将于 11 月 30 日下线。"
  );
  assert.equal(
    translateDictionaryValue("Available on paid Google AI Pro and Ultra plans. Not included with your current plan.", dictionary),
    "仅限付费 Google AI Pro 与 Ultra 方案使用。当前方案不包含此模型。"
  );

  // 2. 跨版本混淆名源码 (2.35.1 E.createElement / WV / G5 / step-plan-chip) 静态本地化
  const sample235Source = [
    'var G5=({option:a,iconOnly:b=!1})=>{var c=NL();return a.tagTitle&&a.tagDescription?E.createElement(E.Fragment,null,E.createElement("div",{"data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&E.createElement("span",null,a.tagTitle),E.createElement(sx,{name:"info",className:"h-3 w-3 flex-none"})),E.createElement(jJ,{id:c},E.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?E.createElement("div",{className:"bg-secondary rounded-full px-1.5 text-sm"},a.tagTitle):null};',
    'function WV(a,b,c){if(b=TV.get(b))if(c=(c=UV(b,c))?b.groupsByKey.get(c.groupKey)?.labels.get(a):void 0)return c;return(Object.hasOwn(eVb,a)?eVb[a]:void 0)??a}',
    'B.createElement("span",{className:"whitespace-nowrap"},"Thinking effort")',
    'var {done:d,total:f,skipped:g,failed:h}=zTc(a);a=[f>0?`${d}/${f} steps`:"",h>0?`${h} failed`:"",g>0?`${g} skipped`:""].filter(Boolean).join(" \\u00b7 ");return E.createElement(m4,{"data-testid":"step-plan-chip","aria-expanded":b,"aria-label":`${a}. ${b?"Hide":"Show"} plan`})'
  ].join("\n");

  const localized = createLocalizedBundle(Buffer.from(sample235Source, "utf8"), dictionary, { skipCoverage: true }).buffer.toString("utf8");
  assert.ok(localized.includes('"Leaving Soon":"即将下线"'), "2.35.1 G5 component must include Leaving Soon mapping");
  assert.ok(localized.includes('xhigh:"超高"'), "2.35.1 WV must map xhigh to 超高");
  assert.ok(localized.includes('B.createElement("span",{className:"whitespace-nowrap"},"思考程度")'), "Thinking effort with B.createElement must be localized");
  assert.ok(localized.includes('`${d}/${f} 步骤`') && localized.includes('`${h} 项失败`') && localized.includes('`${g} 项已跳过`'), "step-plan-chip must localize steps, failed, and skipped");
  assert.ok(localized.includes('${b?"收起":"展开"}计划'), "step-plan-chip aria-label must be localized");

  // 3. 废弃与机翻旧词条目清理校验
  assert.equal(isObsoleteLearnedKey("Leaving Soon"), true);
  assert.equal(isObsoleteLearnedKey("Load older messages, showing 100 of 20559"), true);
  assert.equal(isObsoleteLearnedKey("Use Hydrogen for better quality with lower quota usage. Leaving on Nov 30."), true);
  assert.equal(isObsoleteLearnedKey("Model: Gemini 4 Hydrogen Extra High, Model cannot be changed while the agent is running"), true);
  assert.equal(isObsoleteLearnedKey("Paid Pro"), true);
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 148: Paid Pro 模型徽章汉化为“付费 Pro”与第三方插件名（Git包名/卡片标题）免翻保护", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    const { isObsoleteLearnedKey } = await import("../src/lib/auto-learned-dict.mjs");

    // 1. Paid Pro / Ultra / Plus 标签规则验证
    assert.equal(translateDictionaryValue("Paid Pro", current), "付费 Pro");
    assert.equal(translateDictionaryValue("Paid Ultra", current), "付费 Ultra");
    assert.equal(translateDictionaryValue("Paid Plus", current), "付费 Plus");

    const sampleG5 = 'var G5=({option:a,iconOnly:b=!1})=>{var c=NL();return a.tagTitle&&a.tagDescription?E.createElement(E.Fragment,null,E.createElement("div",{"data-tooltip-id":c,className:`bg-secondary opacity-70 flex items-center gap-1 rounded-full px-1.5 text-sm${b?" h-4 flex-none":""}`},!b&&E.createElement("span",null,a.tagTitle),E.createElement(sx,{name:"info",className:"h-3 w-3 flex-none"})),E.createElement(jJ,{id:c},E.createElement("div",{className:"max-w-[200px]"},a.tagDescription))):a.tagTitle?E.createElement("div",{className:"bg-secondary rounded-full px-1.5 text-sm"},a.tagTitle):null};';
    const localized = createLocalizedBundle(Buffer.from(sampleG5, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes('"Paid Pro":"付费 Pro"'), "G5 component must localize Paid Pro");

    // 2. 第三方包名/Git 项目名隔离与已学条目清理（Issue #30）
    assert.equal(isObsoleteLearnedKey("agy-fast"), true);
    assert.equal(isObsoleteLearnedKey("agy-capsule"), true);
    assert.equal(isObsoleteLearnedKey("@scope/my-plugin"), true);

    const overlay = createRuntimeOverlay(current);
    const sandbox = {
      globalThis: {},
      window: { location: { protocol: "https:" } },
      document: {
        readyState: "loading",
        documentElement: { lang: "en" },
        addEventListener: () => {},
      },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
      MutationObserver: class { observe() {} },
      fetch: () => Promise.resolve({ ok: false }),
      setTimeout,
      clearTimeout,
      Set,
      Map,
      WeakMap,
      RegExp,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Math,
      Date,
    };
    sandbox.globalThis = sandbox;
    new vm.Script(overlay).runInContext(vm.createContext(sandbox));
    const isEligible = sandbox.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__;

    // 连字符开源项目名/作用域包名不允许送去联网
    assert.equal(isEligible("agy-fast", null, false), false);
    assert.equal(isEligible("agy-capsule", null, true), false);
    assert.equal(isEligible("@org/custom-plugin", null, true), false);

    // 插件卡片标题区（.font-medium）和普通说明区（.text-muted-foreground）都不送去联网翻译
    const cardTitleEl = { closest: (sel) => (sel === "[data-testid='customization-card']" || sel === ".font-medium" ? {} : null) };
    const cardDescEl = { closest: (sel) => (sel === "[data-testid='customization-card']" || sel === ".text-muted-foreground" ? {} : null) };
    assert.equal(isEligible("My Custom Plugin", cardTitleEl, true), false);
    assert.equal(isEligible("Provide fast helpers for daily workflows.", cardDescEl, false), false);
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 149: 代码块与文件预览头部 Preview / Raw 切换器汉化为 预览 / 源码", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    assert.equal(translateDictionaryValue("Markdown view mode", current), "Markdown 视图模式");
    assert.equal(translateDictionaryValue("Preview unavailable — binary file", current), "无法预览 — binary file");

    const sampleCodeBlockAndFileView = [
      'E.createElement(KV,{size:"xs","aria-label":"Markdown view mode","data-testid":"code-block-preview-toggle",value:f,onValueChange:w=>{w!=="preview"&&w!=="raw"||g(w)}},E.createElement(KV.Item,{value:"preview","data-testid":"code-block-preview-button"},"Preview"),E.createElement(KV.Item,{value:"raw","data-testid":"code-block-raw-button"},"Raw"))',
      'E.createElement("div",{onClick:()=>{x||d({type:"fileView",fileView:{...c,previewMode:"preview"}},b)}},"Preview"),E.createElement("div",{onClick:()=>{d({type:"fileView",fileView:{...c,previewMode:"raw"}},b)}},"Raw"),h!=null&&E.createElement(jJ,{id:m,place:"bottom"},`Preview unavailable \\u2014 ${h}`)'
    ].join("\n");

    const localized = createLocalizedBundle(Buffer.from(sampleCodeBlockAndFileView, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes('"aria-label":"Markdown 视图模式"'));
    assert.ok(localized.includes('"data-testid":"code-block-preview-button"},"预览"'));
    assert.ok(localized.includes('"data-testid":"code-block-raw-button"},"源码"'));
    assert.ok(localized.includes('previewMode:"preview"}},b)}},"预览"'));
    assert.ok(localized.includes('previewMode:"raw"}},b)}},"源码"'));
    assert.ok(localized.includes('`无法预览 — ${h}`'));
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 150: 智能体状态栏 Working / Compacting / 重试倒计时 / 通话摘要源码直替", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    assert.equal(translateDictionaryValue("Waiting", current), "等待中");
    assert.equal(translateDictionaryValue("Summarizing call…", current), "正在总结通话…");
    assert.equal(translateDictionaryValue("Compacting · 32s", current), "正在压缩上下文 · 32s");

    const sampleStatusBundle = [
      'E.createElement(aY,null,g??k??(c?"Compacting":b??"Working"))',
      'const CUc={context_summary:"Compacting"};function DUc(a){a=Math.floor(a/1E3);return a<60?`${a}s`:`${Math.floor(a/60)}m ${a%60}s`}',
      'a=f.attempt;f=f.maxAttempts;a=a>0&&f>0?` (attempt ${a}/${f})`:"";f=b!==void 0?Math.max(0,Math.ceil((b-c)/1E3)):0;return f>0?`Model unavailable, retrying in ${f}s${a}`:`Model unavailable, retrying${a}`',
      'a=(f=f&&!b)?"Waiting for your approval":a.isSubagent?a.focus||"Working":KUc({steps:a.steps})',
      'return d.length>0?d.join(", "):"Done"',
      'if(b&&c||!b&&!g)return null;c="Working";',
      'l=p?u:q?m?"Waiting for your approval":f??"Working":b;',
      'return c?c:a.status===K.CortexStepStatus.RUNNING?b||"Working":""',
      'C=n&&z===void 0&&!c&&(b||!!g),D=g||"Working";',
      'E.createElement(aY,{className:"text-muted-foreground"},"Summarizing call\\u2026")',
    ].join("\n");

    const localized = createLocalizedBundle(Buffer.from(sampleStatusBundle, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes('?"正在压缩上下文":b??"工作中")'));
    assert.ok(localized.includes('const CUc={context_summary:"正在压缩上下文"};function DUc(a){a=Math.floor(a/1E3);return a<60?`${a} 秒`:`${Math.floor(a/60)} 分 ${a%60} 秒`}'));
    assert.ok(localized.includes('（第 ${a}/${f} 次重试）'));
    assert.ok(localized.includes('模型暂不可用，${f} 秒后重试${a}'));
    assert.ok(localized.includes('?"正在等待你的批准":a.isSubagent?a.focus||"工作中":KUc'));
    assert.ok(localized.includes('return d.length>0?d.join("、"):"已完成"'));
    assert.ok(localized.includes('return null;c="工作中";'));
    assert.ok(localized.includes('m?"正在等待你的批准":f??"工作中":b'));
    assert.ok(localized.includes('CortexStepStatus.RUNNING?b||"工作中":""'));
    assert.ok(localized.includes('D=g||"工作中";'));
    assert.ok(localized.includes('"正在总结通话…"'));
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 151: 打开 SSH 主机弹窗全量源码级汉化与空列表自然语序", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    assert.equal(translateDictionaryValue("Open SSH Host", current), "打开 SSH 主机");
    assert.equal(translateDictionaryValue("Use Default", current), "恢复默认");
    assert.equal(translateDictionaryValue("~/.ssh/config (default)", current), "~/.ssh/config（默认）");

    const sampleSshDialog = [
      'function wfc(a){return a.progress??`Connecting to ${a.host}\\u2026`}',
      'tooltip:"Remove from Recent",\nlabel:`Remove ${ka.host} from Recent`',
      'tooltip:ka?"Hide from this list":"Show in the list again",\nlabel:ka?`Hide ${xa.host} from this list`:`Show ${xa.host} in the list again`',
      'E.createElement("div",{"data-testid":"ssh-connect-dialog",className:"flex flex-col gap-3"},E.createElement("p",{id:z},"Enter [user@]host[:port], or pick a host from your SSH config.",b==="newProject"&&" Then create the project in its window."),E.createElement("input",{ref:D,"data-testid":"ssh-connect-host-input",placeholder:"user@host:port","aria-label":"SSH host"}),E.createElement(lJ,{size:"md",variant:"primary","data-testid":"ssh-connect-button",onClick:Y},W?"Connecting\\u2026":"Connect"),E.createElement("span",null,"Couldn\'t connect to ",c.host),va("Recent",qa(M)),va(ca?`SSH Config (${ca})`:"SSH Config",qa(N)),E.createElement(lJ,null,ba.length===1?"1 hidden host":`${ba.length} hidden hosts`),E.createElement("div",{role:"group","aria-label":"Hidden hosts"}),"Loading hosts\\u2026","Couldn\'t load your SSH hosts. You can still type one.",ja&&E.createElement("p",null,"No hosts in ",ca??"~/.ssh/config"," yet. Type one above."))',
      'E.createElement("span",{className:"shrink-0"},"SSH config: "),E.createElement("span",{"data-testid":"ssh-config-file-name"},a?lh(a):"~/.ssh/config (default)"),E.createElement(lJ,{size:"xs","data-testid":"ssh-config-file-choose",onClick:()=>{c||d()}},"Choose File\\u2026"),a&&E.createElement(lJ,{size:"xs","data-testid":"ssh-config-file-use-default",onClick:()=>{f()}},"Use Default")',
    ].join("\n");

    const localized = createLocalizedBundle(Buffer.from(sampleSshDialog, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes('return a.progress??`正在连接到 ${a.host}…`'));
    assert.ok(localized.includes('tooltip:"从最近列表中移除",label:`从最近列表中移除 ${ka.host}`'));
    assert.ok(localized.includes('tooltip:ka?"从列表中隐藏":"在列表中重新显示",label:ka?`从列表中隐藏 ${xa.host}`:`在列表中重新显示 ${xa.host}`'));
    assert.ok(localized.includes('"请输入 [user@]host[:port]，或从你的 SSH 配置中选择主机。",b==="newProject"&&" 然后在其窗口中创建项目。"'));
    assert.ok(localized.includes('"aria-label":"SSH 主机"'));
    assert.ok(localized.includes('W?"正在连接…":"连接"'));
    assert.ok(localized.includes('"无法连接到 ",c.host'));
    assert.ok(localized.includes('va("最近使用",qa(M)),va(ca?`SSH 配置（${ca}）`:"SSH 配置",qa(N))'));
    assert.ok(localized.includes('`${ba.length} 个已隐藏主机`'));
    assert.ok(localized.includes('"aria-label":"已隐藏主机"'));
    assert.ok(localized.includes('"正在加载主机…"'));
    assert.ok(localized.includes('"无法加载 SSH 主机列表，你仍可直接输入一个。"'));
    assert.ok(localized.includes('ca??"~/.ssh/config"," 中还没有主机，请在上方输入一个。"'));
    assert.ok(localized.includes('"SSH 配置："'));
    assert.ok(localized.includes('"~/.ssh/config（默认）"'));
    assert.ok(localized.includes('"选择文件…"'));
    assert.ok(localized.includes('"恢复默认"'));
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 152: 2.35.1 React 压缩名变体 (E.useEffect) 仍可挂载对话标题自动翻译监听器", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    const sample2351 =
      'var sjc=()=>{var a=TQ(),b=tl(),c=aS(),d=BS(),{updateConversationAnnotations:f}=wA(),g=vE(),h=AS();(0,E.useEffect)(()=>qjc({subscribeToRoute:k=>a.subscribe("onResolved",k),getCascadeIdParam:c,getBattleIdParam:d,dispatch:b.dispatch,deps:{updateConversationAnnotations:f,recordError:g,getStartingConversationIds:()=>Uwa(b.getState())}}),[a,b,c,d,f,g]);return h?E.createElement(rjc,{battleId:h}):null};';
    const localized = createLocalizedBundle(Buffer.from(sample2351, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes("globalThis.__AGY_ZHCN_BIND_TITLE_WATCHER__?.(b,f);return h?"));
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 153: 配额重置连写时长格式修复与全端本地命名/原始标识全面保护", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();

    // 1. 配额提示连写时长与多余英文句号彻底修复（Node 侧与运行时沙箱侧）
    assert.equal(
      translateDictionaryValue("Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h23m29s.", current),
      "已达到个人配额上限。请升级订阅以提高配额。配额将于 1 小时 23 分钟 29 秒后重置。"
    );
    assert.equal(
      translateDictionaryValue("Individual quota reached. Please upgrade your subscription to increase your limits. Resets in <1m.", current),
      "已达到个人配额上限。请升级订阅以提高配额。配额将于 1 分钟内重置。"
    );
    assert.equal(translateDictionaryValue("Resets in 1h23m29s.", current), "将在 1 小时 23 分钟 29 秒后重置");
    assert.equal(translateDictionaryValue("Weekly limit, resets in 3d18h.", current), "每周配额，将在 3 天 18 小时后重置");
    assert.equal(translateDictionaryValue("Model unavailable, retrying in 1m30s...", current), "模型暂不可用，将在 1 分钟 30 秒后重试...");
    assert.equal(translateDictionaryValue("Select project, current: InteractiveSurface-Assets", current), "选择项目，当前：InteractiveSurface-Assets");
    assert.equal(translateDictionaryValue("Select project, current: No Project", current), "选择项目，当前：未选择项目");

    // 2. 历史误学词条自动失效清洗
    const { isObsoleteLearnedKey } = await import("../src/lib/auto-learned-dict.mjs");
    assert.equal(isObsoleteLearnedKey("InteractiveSurface-Assets"), true);
    assert.equal(isObsoleteLearnedKey("--text-muted"), true);
    assert.equal(isObsoleteLearnedKey("\".mode-tab\""), true);
    assert.equal(isObsoleteLearnedKey("Ace2025001/antigravity-desktop-zhcn#28 (Unknown)"), true);
    assert.equal(isObsoleteLearnedKey('Searching "openai/codex" custom model provider'), true);

    // 3. 运行时沙箱全面保护守卫校验
    const overlay = createRuntimeOverlay(current);
    const sandbox = {
      globalThis: {},
      window: { location: { protocol: "https:" } },
      document: {
        readyState: "loading",
        documentElement: { lang: "en" },
        addEventListener: () => {},
      },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
      MutationObserver: class { observe() {} },
      fetch: () => Promise.resolve({ ok: false }),
      setTimeout,
      clearTimeout,
      Set,
      Map,
      WeakMap,
      RegExp,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Math,
      Date,
    };
    sandbox.globalThis = sandbox;
    new vm.Script(overlay).runInContext(vm.createContext(sandbox));

    assert.equal(
      sandbox.__AGY_ZHCN_TRANSLATE_VALUE__("Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 1h23m10s."),
      "已达到个人配额上限。请升级订阅以提高配额。配额将于 1 小时 23 分钟 10 秒后重置。"
    );
    assert.equal(sandbox.__AGY_ZHCN_TRANSLATE_DUR__("1h23m29s."), "1 小时 23 分钟 29 秒");
    assert.equal(sandbox.__AGY_ZHCN_TRANSLATE_DUR__("500ms"), "500 毫秒");

    const isProtected = sandbox.__AGY_ZHCN_IS_PROTECTED_ELEMENT__;
    const isEligible = sandbox.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__;
    const mkEl = (testids, extra = {}) => ({
      nodeType: 1,
      textContent: extra.textContent ?? "",
      parentElement: extra.parentElement ?? null,
      previousElementSibling: extra.previousElementSibling ?? null,
      getAttribute: (name) => (name === "data-testid" ? testids[0] ?? null : extra.attrs?.[name] ?? null),
      closest: (sel) => {
        for (const id of testids) {
          if (sel.includes(`[data-testid='${id}']`)) return {};
        }
        if (extra.classes) {
          for (const cls of extra.classes) {
            if (sel.includes(cls)) return {};
          }
        }
        if (extra.tag && sel.split(",").some((s) => s.trim() === extra.tag || s.trim().endsWith(` ${extra.tag}`))) {
          return {};
        }
        if (sel.includes("[data-testid^='settings-nav-item-']") && testids.some((id) => id.startsWith("settings-nav-item-"))) {
          return { parentElement: extra.navRowWrap ?? null };
        }
        if (sel.includes("[data-testid='project-customizations-workspace-filter'] option") && extra.wsValue !== undefined) {
          return { value: extra.wsValue, getAttribute: () => extra.wsValue };
        }
        return null;
      },
    });

    // 项目名保护 vs 固定 UI 按钮放行
    const projHeader = mkEl(["project-header"]);
    const projItem = mkEl(["project-selector-item"]);
    const projItemSettings = mkEl(["project-selector-item", "project-selector-item-settings"]);
    const projTriggerSelected = mkEl(["project-selector-trigger"], { textContent: "InteractiveSurface-Assets" });
    const projTriggerPlaceholder = mkEl(["project-selector-trigger"], { textContent: "No project selected" });
    assert.equal(isProtected(projHeader, false, "Docs"), true);
    assert.equal(isProtected(projItem, false, "Tools"), true);
    assert.equal(isProtected(projItemSettings, false, "Project Settings"), false);
    assert.equal(isProtected(projTriggerSelected, false, "InteractiveSurface-Assets"), true);
    assert.equal(isProtected(projTriggerPlaceholder, false, "No project selected"), false);
    assert.equal(isEligible("InteractiveSurface-Assets", projHeader, false), false);

    // 设置左侧栏 Projects 分组保护 vs 常规设置放行
    const navInProjects = mkEl(["settings-nav-item-Assets"], {
      navRowWrap: { parentElement: { previousElementSibling: { textContent: "Projects" } } },
    });
    const navInSettings = mkEl(["settings-nav-item-Account"], {
      navRowWrap: { parentElement: { previousElementSibling: { textContent: "Settings" } } },
    });
    assert.equal(isProtected(navInProjects, false, "Assets"), true);
    assert.equal(isProtected(navInSettings, false, "Account"), false);

    // 工作区筛选仅保护真实工作区项，放行 All Workspaces
    assert.equal(isProtected(mkEl([], { wsValue: "MyWorkspace" }), false, "MyWorkspace"), true);
    assert.equal(isProtected(mkEl([], { wsValue: "all" }), false, "All Workspaces"), false);

    // 文件树真实节点受保护，工作区折叠标题放行
    const fileTreeNode = mkEl([], { previousElementSibling: { getAttribute: (k) => (k === "data-testid" ? "file-tree-node-icon" : null) } });
    const fileTreeHeader = mkEl(["tab-file-tree-sidebar"]);
    assert.equal(isProtected(fileTreeNode, false, "Scripts"), true);
    assert.equal(isProtected(fileTreeHeader, false, "Workspaces"), false);

    // 插件详情标题、MCP 服务器名、分支名、文件名与引用芯片保护，MCP 操作按钮放行
    assert.equal(isProtected(mkEl(["plugin-detail"], { tag: "h1" }), false, "Linear"), true);
    assert.equal(isProtected(mkEl(["mcp-server-row"], { classes: [".font-medium"] }), false, "Tools"), true);
    assert.equal(isProtected(mkEl(["mcp-server-row"], { tag: "button" }), false, "Configure"), false);
    assert.equal(isProtected(mkEl(["branch-pill-label"]), false, "main"), true);
    assert.equal(isProtected(mkEl(["file-title-name"]), false, "README.md"), true);

    // 回复气泡、产物面板与搜索查询禁止在线翻译
    assert.equal(isEligible("Summary of recent edits and tool results.", mkEl(["agent-response"]), false), false);
    assert.equal(isEligible("Implementation plan overview for the project.", mkEl(["artifact-view"]), false), false);
    assert.equal(isEligible('Searching "openai/codex" custom model provider', null, false), false);
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 154: 手动重命名对话永久保英文，且支持独立关闭 autoTranslateTitles 开关", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();

    // 1. handleRename 源码挂载点验证
    const sampleHandleRename =
      'aa=(0,E.useCallback)(Z=>{Z?.stopPropagation();R({pinned:!1},"unpin")},[R,r]),Y=(0,E.useCallback)(async Z=>{var ba=e,oa=e;try{let qa=oa(await ba(v({cascadeId:a,annotations:{title:Z},onError:{reportedByCaller:!0}})));if(!qa.ok)throw c(qa.error)}finally{ba()}},[a,v,n,c]);';
    const localized = createLocalizedBundle(Buffer.from(sampleHandleRename, "utf8"), current, { skipCoverage: true }).buffer.toString("utf8");
    assert.ok(localized.includes("globalThis.__AGY_ZHCN_RECORD_MANUAL_TITLE__?.(a,Z);var ba=e"));

    const overlay = createRuntimeOverlay(current);

    // 2. 场景 A：autoTranslateTitles=true，但 conv-1 被手动改名为 "API Refactor"，不应被翻译；conv-2 正常翻译
    const makeSandbox = async (settingsPayload) => {
      const sentQueries = [];
      const postedManual = [];
      const sb = {
        globalThis: {},
        window: { location: { protocol: "https:" } },
        document: { readyState: "loading", documentElement: { lang: "en" }, addEventListener: () => {} },
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
        MutationObserver: class { observe() {} },
        fetch: async (url, opts) => {
          const u = String(url);
          if (u === "agy-zhcn://settings") return { ok: true, json: async () => settingsPayload };
          if (u === "agy-zhcn://manual-titles") {
            if (opts?.method === "POST") postedManual.push(JSON.parse(opts.body));
            return { ok: true, json: async () => ({ ok: true, ids: [], titles: [] }) };
          }
          if (u.startsWith("agy-zhcn://translate?")) {
            const params = new URLSearchParams(u.slice("agy-zhcn://translate?".length));
            const q = params.get("q") || "";
            sentQueries.push(q);
            return { ok: true, json: async () => ({ ok: true, translated: `译_${q}` }) };
          }
          return { ok: false };
        },
        setTimeout,
        clearTimeout,
        Set,
        Map,
        WeakMap,
        RegExp,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Math,
        Date,
        Promise,
      };
      sb.globalThis = sb;
      new vm.Script(overlay).runInContext(vm.createContext(sb));
      await sb.__AGY_ZHCN_LOAD_SETTINGS__();
      return { sb, sentQueries, postedManual };
    };

    const { sb: sbA, sentQueries: sentA, postedManual } = await makeSandbox({
      titleAutoTranslate: true,
      titleWriteBack: false,
    });
    sbA.__AGY_ZHCN_RECORD_MANUAL_TITLE__("conv-1", "API Refactor");
    assert.deepEqual(postedManual, [{ cascadeId: "conv-1", title: "API Refactor" }]);

    const storeA = {
      getState: () => ({
        trajectorySummaries: {
          summaries: {
            "conv-1": { annotations: { title: "API Refactor" } },
            "conv-2": { annotations: { title: "Deploy Production" } },
          },
        },
      }),
      subscribe: () => () => {},
    };
    sbA.__AGY_ZHCN_BIND_TITLE_WATCHER__(storeA, null);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sentA.includes("API Refactor"), false, "手动重命名的英文标题绝不自动翻译");
    assert.equal(sentA.includes("Deploy Production"), true, "AI 自动生成的英文标题仍正常自动汉化");

    const mkConvRowTitle = (cid) => ({
      nodeType: 1,
      textContent: "API Refactor",
      getAttribute: () => null,
      closest: (sel) => {
        if (sel.includes("[data-testid^='conversation-row-'][data-cascade-id]")) {
          return { getAttribute: (k) => (k === "data-cascade-id" ? cid : null) };
        }
        if (sel.includes(".truncate")) return {};
        return null;
      },
    });
    assert.equal(sbA.__AGY_ZHCN_IS_PROTECTED_ELEMENT__(mkConvRowTitle("conv-1"), false, "API Refactor"), true);

    // 3. 场景 B：关闭 titleAutoTranslate=false 后，连普通新英文对话也不自动翻译且 DOM 受保护
    const { sb: sbB, sentQueries: sentB } = await makeSandbox({
      titleAutoTranslate: false,
      titleWriteBack: false,
    });
    const storeB = {
      getState: () => ({
        trajectorySummaries: {
          summaries: {
            "conv-3": { summary: "Fix Payment Bug" },
          },
        },
      }),
      subscribe: () => () => {},
    };
    sbB.__AGY_ZHCN_BIND_TITLE_WATCHER__(storeB, null);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sentB.length, 0, "关闭标题自动翻译开关后不再发送任何标题去翻译");
    const breadcrumbEl = {
      nodeType: 1,
      textContent: "Fix Payment Bug",
      getAttribute: () => null,
      closest: (sel) => (sel.includes("breadcrumb-segment") ? {} : null),
    };
    assert.equal(sbB.__AGY_ZHCN_IS_PROTECTED_ELEMENT__(breadcrumbEl, false, "Fix Payment Bug"), true);
    // 设置里没有 onlineTranslate（旧配置或未开启）时，界面文字一律不联网
    assert.equal(await sbB.__AGY_ZHCN_AUTO_TRANSLATE__("Manage project rules", { isTitle: false }), null);
    assert.equal(sentB.length, 0, "未开启界面联网补充翻译时不发送任何界面文字");

    // 场景 C：开启 onlineTranslate 后，未收录的界面文字走 kind=ui 联网补译并记住结果；标题开关关闭不影响界面补译
    const { sb: sbC, sentQueries: sentC } = await makeSandbox({
      onlineTranslate: true,
      titleAutoTranslate: false,
      titleWriteBack: false,
    });
    assert.equal(await sbC.__AGY_ZHCN_AUTO_TRANSLATE__("Manage project rules", { isTitle: false }), "译_Manage project rules");
    assert.deepEqual(sentC, ["Manage project rules"]);
    assert.equal(sbC.__AGY_ZHCN_LOOKUP__("Manage project rules"), "译_Manage project rules");
    assert.equal(await sbC.__AGY_ZHCN_AUTO_TRANSLATE__("Fix Payment Bug", { isTitle: true }), null, "标题开关关闭时标题仍不联网");
    // 自定义项卡片（用户自己的技能、规则）里的说明属于用户内容，不送联网
    const cardDesc = { closest: (sel) => (sel === "[data-testid='customization-card']" ? {} : null) };
    assert.equal(sbC.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__("Provide fast helpers for daily workflows.", cardDesc, false), false);

    // 4. 2.35.1 轮次导航计数 (E.createElement) 本地直替 + 章节标题卡片联网翻译（普通轮次提示保留原文）
    const navBundle = createLocalizedBundle(
      Buffer.from('h?"Couldn\'t load message":"No message text",E.createElement("span",null,a," of ",c)', "utf8"),
      current,
      { skipCoverage: true },
    ).buffer.toString("utf8");
    assert.ok(navBundle.includes('E.createElement("span",null,a," / ",c)'));
    assert.ok(navBundle.includes('"无法加载消息"'));
    assert.ok(navBundle.includes('"无消息内容"'));

    const { sb: sbChapter, sentQueries: chapterSent } = await makeSandbox({
      titleAutoTranslate: true,
      titleWriteBack: false,
    });
    const chapterEl = {
      nodeType: 1,
      tagName: "SPAN",
      parentElement: null,
      getAttribute: (k) => (k === "data-titled" ? "true" : null),
      closest(sel) {
        if (sel.includes("[data-titled='true']")) return this;
        if (sel.includes("[data-testid='conversation-navigator-group-card-header']")) return { getAttribute: () => "conversation-navigator-group-card-header" };
        if (sel.includes("[data-testid='conversation-navigator-group-card']")) return { getAttribute: () => "conversation-navigator-group-card" };
        return null;
      },
    };
    const chapterTextNode = { nodeType: 3, parentElement: chapterEl, nodeValue: "Fixing UI localization and translation regressions" };
    sbChapter.__AGY_ZHCN_BIND_TITLE_WATCHER__({ getState: () => ({}), subscribe: () => () => {} }, null);
    // Simulate MutationObserver / initial walk via translateTree on a minimal documentElement wrapper
    sbChapter.document.documentElement.childNodes = [];
    assert.equal(sbChapter.__AGY_ZHCN_IS_ONLINE_ELIGIBLE__("Fixing UI localization and translation regressions", chapterEl, true), true);
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 155: 多词句大小写无关回退与 2.35.1 设置页/权限/引导弹窗全场景兼容", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();

    // 1. 多词句大小写无关回退（Sentence Case 命中，全大写常量与全小写命令行不误翻）
    const syntheticDict = {
      schemaVersion: 2,
      exact: {
        "Tool Permissions": "工具权限",
        "Permission Preset": "权限预设",
        AUTO: "自动",
      },
      patterns: [],
    };
    assert.equal(translateDictionaryValue("Tool permissions", syntheticDict), "工具权限");
    assert.equal(translateDictionaryValue("Permission preset", syntheticDict), "权限预设");
    assert.equal(translateDictionaryValue("TOOL PERMISSIONS", syntheticDict), null);
    assert.equal(translateDictionaryValue("tool permissions", syntheticDict), null);
    assert.equal(translateDictionaryValue("auto", syntheticDict), null);

    // 运行时 overlay 同等遵守大小写回退与护栏
    const overlay = createRuntimeOverlay(current);
    const sb = {
      globalThis: {},
      window: { location: { protocol: "https:" } },
      document: { readyState: "loading", documentElement: { lang: "en" }, addEventListener: () => {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
      MutationObserver: class { observe() {} },
      fetch: async () => ({ ok: false }),
      setTimeout,
      clearTimeout,
      Set,
      Map,
      WeakMap,
      RegExp,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Math,
      Date,
      Promise,
    };
    sb.globalThis = sb;
    new vm.Script(overlay).runInContext(vm.createContext(sb));
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("Tool permissions"), "工具权限");
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("Permission preset"), "权限预设");
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("Network access rules"), "网络访问规则");
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("Queued messages"), "排队中的消息");
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("TOOL PERMISSIONS"), null);
    assert.equal(sb.__AGY_ZHCN_TRANSLATE__("git status"), null);

    // 2. 模拟 2.35.1 客户端压缩片段（含 E/G 标识符重命名、换行符、新字段与引导弹窗）
    const snippet2351 = `
      var Aa=[{id:"local",label:"This Computer"},{id:"cloud",label:"Remote"}];
      var TOb=new Map([["Appearance",{sections:[{title:"Chat",settings:["verboseConversationSteps"]},{title:"Chat Layout",advanced:!0,settings:["conversationWidth","artifactWidth","contextUsageIndicatorEnabled"]},{title:"Terminal",advanced:!0,settings:["terminalPlacement"]},{title:"Accessibility",advanced:!0,settings:["customContextMenusEnabled","screenReaderMode"]}]}],["General",{sections:[{title:"Input Box",settings:["queuedMessageDeliveryStrategy","sendMessageShortcut","enterToSendOnMobile"]},{title:"Terminal",\nadvanced:!0,settings:["shellSetupScript"]},{title:"Workspaces",id:"workspace-creation",advanced:!0,settings:["magicWorkspaceVcs","magicWorkspaceCogRepo","magicWorkspaceCogBranch","syncJjWorkspaceToHead"]},{title:"Best of N",id:"best-of-n",advanced:!0,settings:["bestOfNFullVcsClone","bestOfNGitFullClone"]},{title:"Labs",id:"labs",advanced:!0,settings:[]}]}],["Browser",{sections:[{title:"Built-in Browser",id:"defaultLinkOpenTarget",settings:["defaultLinkOpenTarget","builtinBrowserDownloadDir"]},{title:"Browser Subagent",\nid:"browser-subagent",settings:["agentBrowserTools","browserJsExecutionPolicy"]}]}],["Account",{sections:[{title:"General",settings:["disableCodeSnippetTelemetry"]}]}],["Models",{sections:[{title:"Model Credits",settings:["useAICredits"]}]}],["Customizations",{sections:[{title:"Default Customizations",settings:["includeJetskiDefaultCustomizations"]},{title:"Customize Global Skills",settings:["antigravity.customization.skills"]},{title:"Custom Agents",settings:["antigravity.customization.customAgents"]},\n{title:"MCP Servers",settings:["antigravity.customization.mcp"]}]}],["Notifications",{sections:[{title:"General",settings:["enableNotificationsForSpecialEvents"]},{title:"Sound",id:"notifications-sound",settings:["enableSoundsForSpecialEvents","agentSoundVolume"]}]}],["App",{sections:[{title:"General",settings:["keepComputerAwake","runInBackground"]},{advanced:!0,settings:["autoCheckForUpdates"]}]}]]);
      var u=["queuedMessageDeliveryStrategy",{isProviderSetting:!0,screen:"General",label:"Queued messages",description:"Configure when follow-up messages are sent.",options:[K.MessageDeliveryStrategy.WHEN_IDLE,K.MessageDeliveryStrategy.NEXT_INVOCATION],resolveSelectedOption:g=>g,resolveOptionToString:g=>{switch(g){case K.MessageDeliveryStrategy.NEXT_INVOCATION:return"Send Immediately";\ndefault:return"Queue"}},resolveOptionToDescription:g=>{switch(g){case K.MessageDeliveryStrategy.NEXT_INVOCATION:return"Interrupt the agent and send immediately.";default:return"Queue until after the current turn."}}}];
      var s=["sendMessageShortcut",{isProviderSetting:!0,screen:"General",label:"Send message",description:"Choose which key sends a message in the chat composer.",options:["enter","modEnter"],resolveSelectedOption:g=>g,resolveOptionToString:g=>{switch(g){case "modEnter":return a?.isMac?"Cmd+Enter":"Ctrl+Enter";default:return"Enter"}},resolveOptionToDescription:g=>{switch(g){case "modEnter":return a?.isMac?"Press Cmd+Enter to send, Enter for a new line.":"Press Ctrl+Enter to send, Enter for a new line.";default:return"Press Enter to send, Shift+Enter for a new line."}}}];
      var w=E.createElement(YU,{title:"General",description:"Configure agent execution, queued message delivery, and permissions."},E.createElement(bV,{title:"Interface Layout"}));
      var p=E.createElement(PV,{action:"command",label:"Terminal commands",\ndescription:"Allow/deny specific terminal commands."});
      var m=E.createElement(PV,{action:"mcp",label:"MCP tools",description:"External tools the agent can call via Model Context Protocol.",placeholder:"Enter tool name or server..."});
      var ue=E.createElement(aV,{label:"File access rules",badge:pb>0?pb:void 0,description:"Configure allowed and denied paths for file reads and writes.",rightElement:E.createElement(lJ,{variant:"secondary",size:"sm",\nonClick:()=>{nb("file")}},"Open")});
      var vc=E.createElement(aV,{"data-testid":"tool-permissions-row",label:"Tool permissions",badge:ed>0?ed:void 0,description:Vc,rightElement:E.createElement(lJ,{variant:"secondary",size:"md",onClick:()=>{nb("tools")}},"Open")});
      var acc=E.createElement(YU,{title:"Account",description:"Manage your plan, credentials, and general preferences."},E.createElement(bV,{title:"General"},E.createElement($U,null,E.createElement(dPb,{label:"Enable telemetry",\ndescription:\`When toggled on, \${f.product.nameShort} collects usage data to help Google enhance performance and features.\`}),E.createElement(aV,{label:"Google One referral",description:"Share your referral link with friends",rightElement:E.createElement(lJ,{variant:"secondary",size:"sm","data-testid":"g1-referral-invite-button",onClick:()=>{u(H)}},"Invite a Friend")}))));
      var mod=E.createElement(YU,{title:E.createElement("div",{className:"flex items-center gap-1.5"},E.createElement("span",null,"Models & Usage"),E.createElement(lJ,{variant:"ghost",size:"icon-lg",onClick:x,disabled:y===void 0,title:"Refresh quota and credits data","aria-label":"Refresh quota and credits data"},E.createElement(sx,{name:"refresh",size:20,className:y===void 0?"animate-spin":""}))),description:"Manage your model quota and credits."});
      var mc=E.createElement(bV,{title:"Model Credits"},\nE.createElement($U,null,E.createElement(UVb,{label:"Enable AI credit overages",description:\`When toggled on, \${g} will use your AI credits to fulfill model requests once you're out of model quota. \${g} will always use your model quota first before using AI credits.\`})));
      var br=E.createElement(YU,{title:"Browser",description:"Configure built-in browser, link opening, and browser subagent preferences."},E.createElement(aV,{label:"Browser actuation rules",description:l?"Configure allowed and denied URLs for the browser subagent. It runs in the built-in browser, so no separate browser install is needed.":E.createElement(E.Fragment,\nnull,"Configure allowed and denied URLs for the browser subagent (invoked with /browser). Requires"," ",E.createElement("a",{href:"https://www.google.com/chrome/",target:"_blank",rel:"noopener noreferrer",className:"text-link hover:underline"},"Google Chrome"),"."),rightElement:E.createElement(lJ,{variant:"secondary",size:"sm",onClick:()=>{y(!0)}},"Edit")}));
      var pp=E.createElement("div",null,E.createElement(b_b,null,"Allowed by you"),f.length===0?E.createElement("div",{className:"px-1 text-sm text-muted-foreground"},\n"Nothing is always allowed. You'll be asked before this plugin makes changes."):null,E.createElement(b_b,null,"Included with plugin"),\nE.createElement("div",{className:"px-1 text-xs text-muted-foreground"},"These come with the plugin and can't be revoked."),E.createElement(lJ,{variant:"ghost",size:"xs",disabled:k,"aria-label":\`Revoke all: \${a}\`,onClick:()=>\n{h(!0)}},"Revoke all"));
      var ob=E.createElement("div",null,E.createElement("h2",{className:p},"One last thing before getting started\\u2026"),E.createElement("p",{className:m?"text-secondary-foreground mt-1":"text-secondary-foreground mt-1 text-center"},"A few things to know, and a couple settings to review."),E.createElement(VBc,{title:"Optimized for you"},"Customize your experience across the agent, plugins, and product from the settings and marketplace. We won\\u2019t show you ads or let advertisers influence what ",\na," says."),E.createElement(VBc,{title:"Built to help, not hurt"},"Automated safeguards help to protect your conversations from insecure or unsafe content. That being said, users should be aware of potential agentic risks, including data exfiltration."),E.createElement(VBc,{title:"You are in control"},a,"\\u2019s agents are powerful and will help you get a lot done better and faster than before, but still make sure to verify the actions taken by the agent."),h?E.createElement("p",{className:"text-sm text-muted-foreground leading-normal"},"Telemetry is turned off for your account. ",a," does not collect any of your prompts, content, or model responses but will still collect general usage patterns (e.g., feature adoption, active user counts)."):E.createElement("div",null,E.createElement(JJ,{checked:b,onChange:c,disabled:g,alignTop:!0,label:E.createElement(WBc,{title:\`Help us improve \${a}.\`},\n"Allow Google to collect and use your Interactions data, subject to the"," ",E.createElement("a",{href:"https://antigravity.google/terms",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google ",a," Terms of Service")," ","and"," ",E.createElement("a",{href:"https://policies.google.com/privacy",className:"text-link hover:underline",target:"_blank",rel:"noreferrer"},"Google Privacy Policy"),". You can control this from your settings at any point.")}),E.createElement(JJ,{checked:d,onChange:f,disabled:g,alignTop:!0,label:E.createElement(WBc,{title:"Stay up to date."},"Sign up for newsletters, tips and tricks, and other notifications about ",a,".")})));
    `;

    const bundled = createLocalizedBundle(Buffer.from(snippet2351, "utf8"), current, { skipCoverage: true })
      .buffer.toString("utf8");

    // 验证输出仍然是合法 JavaScript，无语法错误
    assert.doesNotThrow(() => new vm.Script(bundled));

    const overlayMarker = bundled.indexOf("\n;");
    const mainBundled = overlayMarker > 0 ? bundled.slice(0, overlayMarker) : bundled;

    for (const expected of [
      'label:"本机"',
      'title:"输入框"',
      'label:"排队中的消息"',
      'return"立即发送"',
      'return"排队发送"',
      'label:"发送消息"',
      'return"回车"',
      'title:"通用",description:"配置智能体执行、消息排队发送和权限。"',
      'title:"界面布局"',
      'label:"终端命令",description:"允许或拒绝执行指定的终端命令。"',
      'label:"MCP 工具",description:"智能体可通过模型上下文协议 (MCP) 调用的外部工具。"',
      'placeholder:"输入工具或服务器名称..."',
      'label:"文件访问规则"',
      'label:"工具权限"',
      '"打开"',
      'title:"账户",description:"管理你的订阅方案、凭据与常规偏好设置。"',
      'label:"启用遥测"',
      'label:"Google One 好友推荐"',
      '"邀请好友"',
      '"模型与用量"',
      'title:"模型点数"',
      'label:"启用 AI 点数超额使用"',
      'title:"浏览器",description:"配置内置浏览器、链接打开方式以及浏览器子智能体偏好设置。"',
      'label:"浏览器操作规则"',
      '"编辑"',
      '"你已允许"',
      '"插件自带"',
      '"全部撤销"',
      '"开始使用前，还有最后几项确认…"',
      'title:"专属定制优化"',
      'title:"秉持安全设计，赋能开发"',
      'title:"一切由你掌控"',
      '"你的账号已关闭遥测数据收集。"',
      'title:`帮助改进 ${a}。`',
      'title:"订阅最新资讯。"',
    ]) {
      assert.ok(mainBundled.includes(expected), `应包含中文片段: ${expected}`);
    }
    assert.equal(mainBundled.includes("Customize your experience across"), false);
    assert.equal(mainBundled.includes("You can control this from your settings at any point"), false);

    // 3. 验证 9.15 全客户端深度补全（项目设置副标题、Token 明细展开、快捷键方案、侧栏定制菜单、自动化频率与全局确认弹窗）
    const extra2351 = `
      var sub1=Ia?\`Manage \${A.lowercase} \${Ea?"resources":"folders"}, agent settings, and permissions.\`:\`Manage \${A.lowercase} \${Ea?"resources":"folders"} and settings.\`;
      var tb=[E.createElement(lJ,{variant:"link",onClick:()=>{}},B?"Hide breakdown":\`Show \${A.length} breakdown\${A.length===1?"":"s"}\`),p.toLocaleString()," / ",c.toLocaleString()," tokens (",(c>0?p/c*100:0).toFixed(1),"%)","(",u.tokens.toLocaleString()," tokens)"];
      const FXb=[{value:"vscode",label:"VS Code Default",recommended:!0,description:a=>\`Honors standard VS Code shortcuts without collisions (e.g. \${a?"\\u2318L Focus Input, \\u2318\\u21e7L New Conversation, \\u2318\\u21e7A Picker, \\u2318\\u21e7, Settings":"Ctrl+L Focus Input, Ctrl+Shift+L New Conversation, Ctrl+Shift+A Picker, Ctrl+Shift+, Settings"}).\`},{value:"agy",label:"Antigravity (AGY) Style",description:a=>\`Uses standalone Antigravity chords (e.g. \${a?"\\u2318I Focus Input, \\u2318\\u21e7O New Conversation, \\u2318K Picker in chat, \\u2318, Settings, \\u2318[/] History). Replaces Go to Symbol (\\u2318\\u21e7O) and Trigger Suggest (\\u2318I), and rebinds VS Code Settings to \\u2318\\u2325,.":"Ctrl+I Focus Input, Ctrl+Shift+O New Conversation, Ctrl+K Picker in chat, Ctrl+, Settings, Ctrl+[/] History). Replaces Go to Symbol (Ctrl+Shift+O) and Trigger Suggest (Ctrl+I), and rebinds VS Code Settings to Ctrl+Alt+,."}\`}];
      var sc=E.createElement(YU,{title:"Shortcuts",description:"Manage your keybinding scheme and customize shortcuts in VS Code."},E.createElement(bV,{title:"Keybinding Scheme",subtitle:"Choose between non-colliding VS Code defaults or standalone Antigravity chords."},p.recommended&&E.createElement("span",{className:"text-[10px] font-semibold leading-none bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full border border-border"},"Recommended")));
      var sbMenus=[{value:0,label:"Never"},{value:3,label:"3 days"},{value:7,label:"7 days"},{value:14,label:"14 days"}],csd=[{value:"any",label:"Any time"},{value:7,label:"7 days"},{value:14,label:"14 days"},{value:21,label:"21 days"}],dsd=[{value:"last_updated",label:"Last Updated"},{value:"last_user_prompt",label:"Last Prompt"},{value:"custom",label:"Manual Order"}];
      var bd=E.createElement(aV,{"data-testid":"browsing-data-row",label:"Browsing data",description:"Clear history, cookies and site data from the built-in browser, or manage cookies for each site.",rightElement:E.createElement("div",null,"Manage")});
      var orch=H=x?"Default (Gemini Pro)":F?tVb(F,k):"The Orchestrator's own planner";
      var rev=E.createElement("div",null,E.createElement(lJ,{onClick:()=>{}},"Cancel"),E.createElement(lJ,{"data-testid":"confirm-revoke-all",onClick:m},"Revoke all"));
    `;
    const extraBundled = createLocalizedBundle(Buffer.from(extra2351, "utf8"), current, { skipCoverage: true })
      .buffer.toString("utf8");
    assert.doesNotThrow(() => new vm.Script(extraBundled));
    const extraOverlayMarker = extraBundled.indexOf("\n;");
    const extraMain = extraOverlayMarker > 0 ? extraBundled.slice(0, extraOverlayMarker) : extraBundled;
    for (const expected of [
      "智能体设置与权限。",
      '?"收起明细":`显示 ${A.length} 项明细`',
      '" Token ("',
      '" Token)"',
      'label:"VS Code 默认"',
      'title:"快捷键",description:"管理你的快捷键方案并在 VS Code 中自定义快捷键。"',
      'title:"快捷键方案"',
      '"推荐"',
      'label:"从不"',
      'label:"手动排序"',
      'label:"浏览数据"',
      ',"管理")',
      '?"默认 (Gemini Pro)"',
      '"Orchestrator 默认规划器"',
      '"全部撤销"',
    ]) {
      assert.ok(extraMain.includes(expected), `9.15 应包含中文片段: ${expected}`);
    }
    assert.equal(extraMain.includes("Manage ${A.lowercase}"), false);
    assert.equal(extraMain.includes("Show ${A.length} breakdown"), false);
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("Case 156: 插件市场全量目录/截断/Gemini 2.9.0 与 chrome-devtools 技能防半译回归", async () => {
  const savedPack = process.env.AGY_LANGUAGE_PACK;
  delete process.env.AGY_LANGUAGE_PACK;
  try {
    const current = await loadDomTranslations();
    const overlay = createRuntimeOverlay(current);
    const sb = {
      globalThis: {},
      window: { location: { protocol: "https:" } },
      document: { readyState: "loading", documentElement: { lang: "en" }, addEventListener: () => {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
      MutationObserver: class { observe() {} },
      fetch: async () => ({ ok: false }),
      setTimeout,
      clearTimeout,
      Set,
      Map,
      WeakMap,
      RegExp,
      Object,
      Array,
      String,
      Number,
      Boolean,
      Math,
      Date,
      Promise,
    };
    sb.globalThis = sb;
    new vm.Script(overlay).runInContext(vm.createContext(sb));

    // 1. 前缀正则收紧与优先级修复：短按钮保留，长英文句子严禁被 ^Connect (.+) / ^Add (.+) 拆成半中半英
    assert.equal(translateDictionaryValue("Connect GitHub", current), "连接 GitHub");
    assert.equal(translateDictionaryValue("Adding plugins from GitHub", current), "正在添加来自 GitHub 的插件");
    assert.equal(translateDictionaryValue("Add 3 plugins from GitHub", current), "从 GitHub 添加 3 个插件");
    assert.equal(translateDictionaryValue("Add MyTool", current), "添加 MyTool");
    assert.equal(
      translateDictionaryValue("Connect Antigravity to some future workspace — manage tasks without switching.", current),
      null
    );
    assert.equal(
      translateDictionaryValue("Add a platform and period if you want, for example last 7 days.", current),
      null
    );

    // 2. ClickUp 与全部 28 个新增/改版插件市场卡片（全文与截断态）均完整汉化
    const clickUpFull = "Connect Antigravity to your ClickUp workspace — manage tasks, track time, and collaborate with your team without switching context.";
    assert.ok(translateDictionaryValue(clickUpFull, current)?.startsWith("将 Antigravity 连接到你的 ClickUp 工作区"));
    assert.ok(sb.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__("Connect Antigravity to your ClickUp workspace — manage tasks, track time...").includes("ClickUp 工作区"));
    for (const [cardDesc, expectedSnippet] of [
      ["Antigravity for science highlights, and an overview of the main science plugins.", "科研能力亮点"],
      ["Antigravity for science highlights, and an over...", "科研能力亮点"],
      ["AlphaGenome and major genetics databases t…", "AlphaGenome"],
      ["Salaries, jobs & career advice. Levels.fyi is you...", "Levels.fyi"],
      ["Generate images and V4 videos with Kling AI. Supports multimodal references, reusable subjects, motion control, and task tracking through secure OAuth.", "可灵 AI"],
      ["Read-only marketing analytics: report spend, conversions, CPA and ROAS across ad platforms, GA4 and Search Console. It never changes your accounts.", "只读营销数据分析"],
      ["Build applications and shell workflows with the Gemini Interactions API, Decisions API, Live API, Genie 4 interactive worlds, and Gemini API CLI, including text, image, video, speech, and music generation, managed agents, and real-time multimodal streaming.", "Genie 4 交互世界"],
    ]) {
      const translated = sb.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(cardDesc);
      assert.ok(translated && translated.includes(expectedSnippet), `插件卡片未命中预期中文: ${cardDesc} => ${translated}`);
    }

    // 3. Gemini API 2.9.0 表格单元格（含 Decisions API / Voice Remixing / Genie 4 / CLI）支持 Markdown 整段与单格翻译
    const geminiDevCell = "Build applications with the [Interactions API](https://aistudio.google.com/docs/interactions-overview) and [Decisions API](https://aistudio.google.com/docs/decisions-api). Covers text generation, stateful multi-turn chat, streaming, function calling, structured output, calibrated decisions (`gemini-decision-1`), image generation, speech generation (TTS), Voice Design, Voice Replication, Voice Remixing, music generation, managed agents, Deep Research, and migrations from `generateContent`.";
    const mdCellResult = sb.__AGY_ZHCN_TRANSLATE_MD__(`| \`gemini-api-dev\` | ${geminiDevCell} |`);
    assert.ok(mdCellResult.includes("语音重混"), `Gemini 2.9.0 单元格应完整汉化: ${mdCellResult}`);

    // 4. chrome-devtools-plugin 技能标题在技能列表内规范命名（Chrome DevTools 统一保持英文专有名词）
    for (const [skillId, zhName] of [
      ["a11y-debugging", "无障碍调试"],
      ["chrome-devtools", "Chrome DevTools"],
      ["cookie-debugging", "Cookie 调试"],
      ["debug-optimize-lcp", "LCP 性能调优"],
      ["memory-leak-debugging", "内存泄漏排查"],
      ["troubleshooting", "连接与故障排查"],
    ]) {
      assert.equal(sb.__AGY_ZHCN_TRANSLATE_PLUGIN_DESC__(skillId), zhName);
    }
  } finally {
    if (savedPack === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = savedPack;
  }
});

test("用语统一：侧面板与侧边栏分开、分叉、工件、组合包、你", async () => {
  const { exact } = await loadDomTranslations();
  assert.equal(exact["Toggle Sidebar"], "切换侧边栏");
  assert.equal(exact["Toggle Side Panel"], "切换侧面板");
  assert.notEqual(exact["Toggle Sidebar"], exact["Toggle Side Panel"], "侧边栏与侧面板不能同名");
  assert.equal(exact["Fork"], "分叉");
  assert.equal(exact["Fork Conversation"], "分叉对话");
  assert.equal(exact["Download Artifact"], "下载工件");
  assert.equal(exact["Bundle"], "组合包");
  const values = Object.values(exact);
  assert.equal(values.filter((v) => v.includes("您")).length, 0, "统一用“你”");
  assert.equal(values.filter((v) => v.includes("侧边面板")).length, 0, "Side Panel 统一为“侧面板”");
  assert.equal(exact["Microphone blocked in system settings."], "麦克风已在系统设置中被禁止。");
  assert.equal(exact["Creating the forked conversation..."], "正在创建分叉对话…");
});

test("变量赋值、三元表达式、模板字符串和 JSX 拆段里的界面文案都要覆盖", async () => {
  const dictionary = await loadDomTranslations();
  const t = (s) => translateDictionaryValue(s, dictionary);
  // 三元表达式赋给变量后再作为 tooltip（Markdown 预览工具栏）
  assert.equal(t("Switch to RTL text direction"), "切换为从右到左的文字方向");
  assert.equal(t("Switch to default text direction"), "恢复默认文字方向");
  // 模板字符串：`Enable Word Wrap${shortcut}`
  assert.equal(t("Enable Word Wrap (Alt+Z)"), "启用自动换行 (Alt+Z)");
  assert.equal(t("Disable Word Wrap"), "停用自动换行");
  assert.equal(t("Toggle Word Wrap (Alt+Z)"), "切换自动换行 (Alt+Z)");
  assert.equal(t("Connected to devbox"), "已连接到 devbox");
  assert.equal(t("More actions for main.py"), "main.py 的更多操作");
  assert.equal(t("Pushed 2 commits to main."), "已推送 2 个提交到 main。");
  assert.equal(t("Go to slide 3"), "转到第 3 张幻灯片");
  // JSX 拆段：前缀单独成一个文字节点，带尾随空格
  assert.equal(t("Clearing cookies and site data for "), "清除以下网站的 Cookie 和网站数据： ");
  assert.equal(t("Yes, allow downloads from "), "是，允许下载来源 ");
  // 新句式不能抢走已有精确译文
  assert.equal(t("Move to Project"), "移动到项目");
  assert.equal(t("Confirm & Save"), "确认并保存");
});

test("2.35.2 /btw 提示、图标颜色选择器与 Swarm 扩展面板无宿主沙箱翻译回归", async () => {
  const current = await loadDomTranslations();
  const t = (s) => translateDictionaryValue(s, current);

  // 1. 2.35.2 模型选择器新文案与 Swarm 常用静态/动态文案
  assert.equal(
    t("Applies to /btw and messages sent after this turn"),
    "适用于 /btw 与本轮结束后的消息",
  );
  assert.equal(
    t("Applies to messages sent after this turn"),
    "适用于本轮结束后的消息",
  );
  assert.equal(t("No swarm in this conversation"), "当前对话暂无蜂群");
  assert.equal(t("Watching for a swarm"), "正在监听蜂群动态");
  assert.equal(t("Board"), "留言板");
  assert.equal(t("Graph"), "关系图");
  assert.equal(t("Hive"), "蜂巢视图");
  assert.equal(t("Working for @researcher"), "正在为 @researcher 工作");
  assert.equal(t("Working for 5 minutes"), "已工作 5 minutes");
  assert.equal(t("Waiting on 3"), "正在等待 3 项");
  assert.equal(t("Waiting on @coordinator"), "正在等待 @coordinator");
  assert.equal(t("read #12 · updated 2m 10s ago"), "已读 #12 · 2 分 10 秒前更新");
  assert.equal(t("3 of 5 tasks done"), "已完成 3 / 5 项任务");

  // 2. 验证 createLocalizedBundle 注入侧面板边界标记，并能在无 electronNative 的本地侧面板环境中安全运行
  const bundle = createLocalizedBundle(Buffer.from("console.log('main');", "utf8"), current)
    .buffer.toString("utf8");
  const beginMarker = "/* __AGY_ZHCN_SIDECAR_OVERLAY_BEGIN__ */";
  const endMarker = "/* __AGY_ZHCN_SIDECAR_OVERLAY_END__ */";
  const bIdx = bundle.indexOf(beginMarker);
  const eIdx = bundle.indexOf(endMarker);
  assert.ok(bIdx >= 0 && eIdx > bIdx, "构建产物缺少侧面板边界标记");
  const sidecarOverlay = bundle.slice(bIdx + beginMarker.length, eIdx).trim();

  class MockNode {
    constructor(nodeType, tagName = "") {
      this.nodeType = nodeType;
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map();
      this.childNodes = [];
      this.parentElement = null;
      this.id = "";
      this.dataset = {};
      this._classes = new Set();
      this.classList = {
        add: (c) => this._classes.add(c),
        contains: (c) => this._classes.has(c),
      };
    }
    appendChild(child) {
      child.parentElement = this.nodeType === 1 ? this : this.parentElement;
      this.childNodes.push(child);
      return child;
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    setAttribute(name, val) {
      this.attributes.set(name, String(val));
      if (name === "id") this.id = String(val);
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    matches(selector) {
      return selector.split(",").some((part) => {
        const p = part.trim();
        if (!p) return false;
        if (p === this.tagName.toLowerCase()) return true;
        if (p.startsWith("#") && this.id === p.slice(1)) return true;
        if (p.startsWith(".") && this._classes.has(p.slice(1))) return true;
        const tid = p.match(/^\[data-testid=['"]([^'"]+)['"]\]$/);
        if (tid && this.getAttribute("data-testid") === tid[1]) return true;
        return false;
      });
    }
    closest(selector) {
      let cur = this;
      while (cur) {
        if (cur.nodeType === 1 && cur.matches(selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    get textContent() {
      return this.childNodes
        .map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent))
        .join("");
    }
    set textContent(v) {
      this.childNodes = [];
      this.appendChild(new MockText(String(v)));
    }
    set innerHTML(html) {
      this._innerHTML = html;
      this.childNodes = [new MockText(html.replace(/<[^>]+>/g, ""))];
    }
    get innerHTML() {
      return this._innerHTML || "";
    }
  }
  class MockText extends MockNode {
    constructor(v) {
      super(3);
      this.nodeValue = v;
    }
  }

  const body = new MockNode(1, "body");
  // 空状态段落（含内联 <code>/swarm</code>）
  const emptyP = new MockNode(1, "p");
  emptyP.setAttribute("id", "empty-body");
  emptyP.setAttribute("data-testid", "swarm-empty-body");
  emptyP.appendChild(new MockText("Open this pane from a conversation to see its swarm. Swarms started there appear here automatically; start one with "));
  const codeEl = new MockNode(1, "code");
  codeEl.appendChild(new MockText("/swarm"));
  emptyP.appendChild(codeEl);
  emptyP.appendChild(new MockText("."));
  body.appendChild(emptyP);

  // 图标选择器与颜色选择器
  const iconFlask = new MockNode(1, "button");
  iconFlask.setAttribute("data-testid", "coordinator-icon-option-science");
  iconFlask.setAttribute("aria-label", "Flask");
  body.appendChild(iconFlask);

  const iconBot = new MockNode(1, "button");
  iconBot.setAttribute("data-testid", "coordinator-icon-option-bot");
  iconBot.setAttribute("aria-label", "Bot");
  body.appendChild(iconBot);

  const globalFlask = new MockNode(1, "button");
  globalFlask.setAttribute("aria-label", "Flask");
  body.appendChild(globalFlask);

  const colorTeal = new MockNode(1, "button");
  colorTeal.setAttribute("data-testid", "coordinator-color-option-teal");
  colorTeal.setAttribute("aria-label", "Teal");
  body.appendChild(colorTeal);

  // GIF 预览图片 alt 与成员多行 tooltip、回放分段、Now 徽章
  const gifImg = new MockNode(1, "img");
  gifImg.setAttribute("data-testid", "swarm-gif-modal-img");
  gifImg.setAttribute("alt", "Exported swarm graph replay");
  body.appendChild(gifImg);

  const memberChip = new MockNode(1, "button");
  memberChip.setAttribute("data-testid", "swarm-member-chip");
  memberChip.setAttribute("title", "worker-1\nHidden from the board; click to show");
  body.appendChild(memberChip);

  const replayLabel = new MockNode(1, "span");
  replayLabel.setAttribute("id", "replay-label");
  const overText = new MockText(" over 2m 10s");
  replayLabel.appendChild(overText);
  body.appendChild(replayLabel);

  const nowTag = new MockNode(1, "span");
  nowTag.classList.add("o2-rtag");
  const nowText = new MockText("Now");
  nowTag.appendChild(nowText);
  body.appendChild(nowTag);

  const pendingTimers = new Set();
  const sb = {
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, SHOW_ALL: 0xffffffff },
    Element: MockNode,
    HTMLElement: MockNode,
    SVGElement: MockNode,
    document: {
      readyState: "complete",
      documentElement: body,
      body,
      querySelectorAll: () => [],
      querySelector: () => null,
      createTreeWalker: (root) => {
        const list = [];
        (function walk(n) {
          for (const c of n.childNodes) {
            list.push(c);
            walk(c);
          }
        })(root);
        let idx = -1;
        return { nextNode: () => (++idx < list.length ? list[idx] : null) };
      },
      addEventListener: () => {},
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout: (fn, ms, ...args) => {
      const id = setTimeout(() => {
        pendingTimers.delete(id);
        fn(...args);
      }, ms);
      pendingTimers.add(id);
      return id;
    },
    clearTimeout: (id) => {
      pendingTimers.delete(id);
      clearTimeout(id);
    },
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    location: { protocol: "http:", hostname: "127.0.0.1", port: "49999", href: "http://127.0.0.1:49999/" },
    localStorage: { getItem: () => null, setItem: () => {} },
    __AGY_ZHCN_DISABLE_AUTO_TRANSLATE__: true,
    console,
  };
  sb.window = sb;
  sb.self = sb;
  sb.globalThis = sb;
  try {
    new vm.Script(sidecarOverlay).runInContext(vm.createContext(sb));

    assert.ok(emptyP.innerHTML.includes("<code>/swarm</code>"), "Swarm 空状态应保留 /swarm 代码块");
    assert.ok(emptyP.innerHTML.includes("请从某个对话中打开此面板以查看对应的蜂群"));

    const emptyConvP = new MockNode(1, "p");
    emptyConvP.setAttribute("id", "empty-body");
    emptyConvP.setAttribute("data-testid", "swarm-empty-body");
    emptyConvP.appendChild(new MockText("Swarms started in this conversation appear here automatically, with their board, members and @mention graph. Start one with "));
    const codeConvEl = new MockNode(1, "code");
    codeConvEl.appendChild(new MockText("/swarm"));
    emptyConvP.appendChild(codeConvEl);
    emptyConvP.appendChild(new MockText("."));
    const convBundleSb = {
      ...sb,
      document: {
        ...sb.document,
        documentElement: emptyConvP,
        body: emptyConvP,
      },
    };
    convBundleSb.window = convBundleSb;
    convBundleSb.self = convBundleSb;
    convBundleSb.globalThis = convBundleSb;
    new vm.Script(sidecarOverlay).runInContext(vm.createContext(convBundleSb));
    assert.ok(emptyConvP.innerHTML.includes("<code>/swarm</code>"));
    assert.ok(emptyConvP.innerHTML.includes("在此对话中启动的蜂群会自动显示在这里"));
    assert.equal(iconFlask.getAttribute("aria-label"), "烧瓶");
    assert.equal(iconBot.getAttribute("aria-label"), "机器人");
    assert.equal(globalFlask.getAttribute("aria-label"), "Flask 框架");
    assert.equal(colorTeal.getAttribute("aria-label"), "青色");
    assert.equal(gifImg.getAttribute("alt"), "导出的蜂群关系图回放");
    assert.equal(memberChip.getAttribute("title"), "worker-1\n当前已在留言板中隐藏，点击恢复显示");
    assert.equal(overText.nodeValue, "，历时 2 分 10 秒");
    assert.equal(nowText.nodeValue, "当前");
  } finally {
    pendingTimers.forEach((id) => clearTimeout(id));
    pendingTimers.clear();
  }
});

test("左上角 Antigravity 菜单合并为三项极简入口，并可在旧补丁回退态与完整可控卡片态下工作", async () => {
  const current = await loadDomTranslations();
  const sampleReactMenu = Buffer.from(
    'k=(0,E.useMemo)(()=>{var v=[];c?.appVersion&&v.push({label:`Version ${c.appVersion}`,onClick:()=>{},nonSelectable:!0});c?.checkForUpdates&&v.push({label:"Check for Updates",onClick:()=>{c.checkForUpdates?.()}});return v},[c]);',
    "utf8",
  );
  const localized = createLocalizedBundle(sampleReactMenu, { ...current, packVersion: "3.1.99", maxAppVersion: "2.35.9" });
  const text = localized.buffer.toString("utf8");

  assert.match(text, /label:`版本 \$\{c\.appVersion\}`/);
  assert.match(text, /label:"检查更新"/);
  assert.match(text, /label:"汉化中心 v3\.1\.99"/);
  const idxAppVersion = text.indexOf("label:`版本 ${c.appVersion}`");
  const idxAppUpdate = text.indexOf('label:"检查更新"');
  const idxPackCenter = text.indexOf('label:"汉化中心 v3.1.99"');
  assert.ok(
    idxAppVersion !== -1 &&
      idxAppVersion < idxAppUpdate &&
      idxAppUpdate < idxPackCenter,
    "顶部 Antigravity 菜单顺序应依次为：版本、检查更新、汉化中心 v3.1.99",
  );
  assert.ok(!text.includes('label:"汉化包版本 '), "不应再有单独的汉化包版本只读项");
  assert.ok(!text.includes('label:"检查汉化包更新"'), "不应再有重复的检查更新入口");
  assert.match(text, /__AGY_ZHCN_CHECK_PACK_UPDATE__/);
  assert.match(text, /__AGY_ZHCN_OPEN_PACK_PANEL__/);
  assert.ok(!text.includes('label:"Check for Updates"'), "原菜单项应已转为中文");

  const bIdx = text.indexOf("/* __AGY_ZHCN_SIDECAR_OVERLAY_BEGIN__ */");
  const eIdx = text.indexOf("/* __AGY_ZHCN_SIDECAR_OVERLAY_END__ */", bIdx);
  const overlay = text.slice(bIdx + "/* __AGY_ZHCN_SIDECAR_OVERLAY_BEGIN__ */".length, eIdx).trim();

  function makeMockSandbox(fetchHandler) {
    const timers = new Set();
    const allElements = [];
    let bodyChild = null;
    const makeEl = (tagName = "DIV") => {
      const el = {
        tagName: String(tagName).toUpperCase(),
        attrs: {},
        style: {},
        children: [],
        textContent: "",
        href: "",
        disabled: false,
        onclick: null,
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { this.children.push(c); return c; },
        remove() { if (bodyChild === this) bodyChild = null; },
      };
      allElements.push(el);
      return el;
    };
    const sb = {
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, SHOW_ALL: 0xffffffff },
      Element: class {},
      HTMLElement: class {},
      SVGElement: class {},
      document: {
        readyState: "complete",
        documentElement: { nodeType: 1, tagName: "HTML", childNodes: [], hasAttribute: () => false, getAttribute: () => null, closest: () => null, querySelector: () => null, querySelectorAll: () => [] },
        body: {
          nodeType: 1,
          tagName: "BODY",
          childNodes: [],
          hasAttribute: () => false,
          getAttribute: () => null,
          closest: () => null,
          querySelector: () => null,
          querySelectorAll: () => [],
          appendChild(el) { bodyChild = el; return el; },
        },
        createElement: (tag) => makeEl(tag),
        createTreeWalker: () => ({ nextNode: () => null }),
        querySelector: (sel) => (sel.includes("data-agy-zhcn-pack-toast") ? bodyChild : null),
        querySelectorAll: () => [],
        addEventListener: () => {},
      },
      MutationObserver: class { observe() {} disconnect() {} },
      fetch: fetchHandler,
      setTimeout: (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
      clearTimeout: (id) => { timers.delete(id); clearTimeout(id); },
      setInterval: () => 0,
      clearInterval: () => {},
      requestAnimationFrame: () => 0,
      location: { protocol: "vscode-file:", hostname: "", href: "vscode-file://vscode-app/", reload: () => {} },
      localStorage: { getItem: () => null, setItem: () => {} },
      __AGY_ZHCN_DISABLE_AUTO_TRANSLATE__: true,
      console,
    };
    sb.window = sb;
    sb.self = sb;
    sb.globalThis = sb;
    return { sb, timers, allElements, getPanel: () => bodyChild };
  }

  // 场景 1：旧版 app.asar（只读 settings 可用、无 pack-update-check）回退提示
  {
    const { sb, timers, allElements, getPanel } = makeMockSandbox(async (url) => {
      if (String(url).includes("agy-zhcn://settings")) {
        return {
          headers: { get: () => "application/json; charset=utf-8" },
          json: async () => ({ packAutoUpdate: "ask", autoFollow: "auto", onlineTranslate: false, titleAutoTranslate: true, platform: "win32" }),
        };
      }
      return { headers: { get: () => "application/javascript; charset=utf-8" } };
    });
    try {
      new vm.Script(overlay).runInContext(vm.createContext(sb));
      assert.equal(sb.__AGY_ZHCN_PACK_VERSION__, "3.1.99");
      assert.equal(sb.__AGY_ZHCN_MAX_APP_VERSION__, "2.35.9");
      await sb.__AGY_ZHCN_CHECK_PACK_UPDATE__();
      const panel = getPanel();
      assert.ok(panel && panel.attrs["data-agy-zhcn-pack-toast"] === "1", "应弹出汉化中心控制卡片");
      const texts = allElements.map((e) => e.textContent).join("\n");
      assert.match(texts, /当前版本：v3\.1\.99\s+·\s+已适配最高客户端：2\.35\.9/);
      assert.match(texts, /旧版汉化文件/);
    } finally {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    }
  }

  // 场景 2：新版主进程代理完整闭环（自动检查设为 off 时打开不自动联网 -> 点击检查发现新版 -> 点击更新 -> 切换设置保存）
  {
    const calls = [];
    const savedState = { packAutoUpdate: "off", autoFollow: "auto", onlineTranslate: false, titleAutoTranslate: true, writable: true, platform: "win32", hasHook: true };
    const { sb, timers, allElements, getPanel } = makeMockSandbox(async (url, opts = {}) => {
      const u = String(url);
      calls.push(`${opts.method || "GET"} ${u}`);
      if (u.startsWith("agy-zhcn://settings")) {
        if (opts.method === "POST") {
          const patch = JSON.parse(opts.body);
          Object.assign(savedState, patch);
          return { headers: { get: () => "application/json" }, json: async () => ({ ok: true, handled: true, ...savedState }) };
        }
        return { headers: { get: () => "application/json" }, json: async () => ({ ...savedState }) };
      }
      if (u.startsWith("agy-zhcn://pack-update-check")) {
        return {
          headers: { get: () => "application/json" },
          json: async () => ({
            ok: true,
            handled: true,
            status: "update-available",
            currentVersion: "3.1.99",
            latestVersion: "3.2.0",
            notes: "- 新增可控汉化中心面板",
            maxAppVersion: "2.35.9",
            releaseUrl: "https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/tag/v3.2.0",
            hasHook: true,
            platform: "win32",
          }),
        };
      }
      if (u.startsWith("agy-zhcn://pack-update-apply")) {
        return {
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true, handled: true, status: "updated", currentVersion: "3.2.0", latestVersion: "3.2.0", maxAppVersion: "2.35.10", hot: true }),
        };
      }
      return { headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
    });
    try {
      new vm.Script(overlay).runInContext(vm.createContext(sb));
      await sb.__AGY_ZHCN_OPEN_PACK_PANEL__();
      assert.ok(getPanel(), "应弹出卡片");
      assert.ok(!calls.some((c) => c.includes("pack-update-check")), "设为关闭时打开面板不得自动联网检查版本（守住红线 1）");

      const findBtn = (txt) => allElements.find((e) => e.tagName === "BUTTON" && e.textContent.includes(txt));
      await findBtn("检查更新").onclick();
      assert.match(allElements.map((e) => e.textContent).join("\n"), /发现新版本 v3\.2\.0/);
      const homeLink = allElements.find((e) => e.tagName === "A" && e.textContent === "GitHub 主页");
      assert.ok(homeLink && homeLink.href === "https://github.com/Ace2025001/antigravity-desktop-zhcn", "卡片链接应指向 GitHub 项目主页");

      await findBtn("立即更新").onclick();
      const textsAfterUpdate = allElements.map((e) => e.textContent).join("\n");
      assert.match(textsAfterUpdate, /已更新至 v3\.2\.0/);
      assert.match(textsAfterUpdate, /当前版本：v3\.2\.0\s+·\s+已适配最高客户端：2\.35\.10/);

      // 切换配置按钮：“汉化包自动更新 -> 自动” 与 “界面联网补充 -> 开启”（验证“询问”文案生效）
      const askPackBtn = allElements.find((e) => e.attrs["data-setting-key"] === "packAutoUpdate" && e.attrs["data-setting-val"] === "ask");
      const askFollowBtn = allElements.find((e) => e.attrs["data-setting-key"] === "autoFollow" && e.attrs["data-setting-val"] === "ask");
      assert.equal(askPackBtn?.textContent, "询问");
      assert.equal(askFollowBtn?.textContent, "询问");
      const packAutoBtn = allElements.find((e) => e.attrs["data-setting-key"] === "packAutoUpdate" && e.attrs["data-setting-val"] === "auto");
      await packAutoBtn.onclick();
      assert.equal(savedState.packAutoUpdate, "auto", "应成功提交并写入设置到主进程");
      const onlineOnBtn = allElements.find((e) => e.attrs["data-setting-key"] === "onlineTranslate" && e.attrs["data-setting-val"] === "true");
      await onlineOnBtn.onclick();
      assert.equal(savedState.onlineTranslate, true, "界面联网补充开关应成功提交并写入");
    } finally {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    }
  }
});
