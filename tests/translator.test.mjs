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
    { source: "Notice", expected: "提示" },
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
      expected: "GPT-OSS 120B 现已在付费 Pro 与 Ultra 方案中可用。自 December 1, 2026 起，你当前的方案将不再支持访问第三方模型。"
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
      expected: "管理你的模型额度与 AI 点数。"
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
        "在每个组内，模型共享每周限额和 5 小时限额。配额根据 Token 的消耗成本按比例扣减。因此，对于耗时较短的任务或使用更高性价比的模型，配额使用时间将更持久。5 小时限额用于平滑总体请求峰值，以在所有用户间公平分配全局算力；而你的每周限额则直接与你的个人套餐级别挂钩。",
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
      expected: "此项目覆盖了您的全局权限设置。",
    },
    {
      source: "This workspace overrides your global permission settings.",
      expected: "此工作区覆盖了您的全局权限设置。",
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
  ];

  for (const { source, expected } of testCases) {
    const translated = translateDictionaryValue(source, current);
    assert.equal(
      translated,
      expected,
      `model subscriber availability translation mismatch for: ${source}`,
    );
  }
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
      expected: "搜索自定义项...",
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
      expected: "让您的代码智能体始终与最新的 Web 最佳实践保持同步。",
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
    { source: "No projects created", expected: "未创建任何项目" },
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
    { source: "No conversations match your search criteria.", expected: "没有匹配您搜索条件的对话。" },
    { source: "No tasks found", expected: "未找到任务" },
    { source: "No background tasks", expected: "无后台任务" },
    { source: "No automations configured.", expected: "未配置计划任务。" },
    { source: "No scheduled tasks configured.", expected: "未配置计划任务。" },
    { source: "No plugins found", expected: "未找到插件" },
    { source: "No plugins available", expected: "暂无可用插件" },
    { source: "No matching plugins found.", expected: "未找到匹配的插件。" },
    { source: "No skills found", expected: "未找到技能" },
    { source: "No recommended skills found in workspace", expected: "工作区中未找到推荐技能" },
    { source: "No customizations found", expected: "未找到自定义项" },
    { source: "No matching customizations found.", expected: "未找到匹配的自定义项。" },
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
    { source: "Choose the experience that fits how you work.", expected: "选择适合您工作方式的体验。" },
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











