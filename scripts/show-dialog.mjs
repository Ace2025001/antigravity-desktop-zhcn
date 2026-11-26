import {
  getClientFollowDialogSpec,
  getPackCheckErrorDialogSpec,
  getPackExitDialogSpec,
  getPackLatestDialogSpec,
  getPackStartupDialogSpec,
  getPackUpdatedDialogSpec,
  getRelaunchConfirmDialogSpec,
  getWarnNotifyDialogSpec,
  showModernWindowsDialog,
} from "../src/lib/modern-dialog.mjs";
import { COMPLETION_DIALOG_BUTTONS, COMPLETION_DIALOG_TITLE, REPO_URL } from "../src/lib/completion-dialog.mjs";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      parsed[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const kind = args.kind || "pack-startup";
const previewOnly = process.argv.includes("--preview");

function buildSpec() {
  if (kind === "pack-exit") return getPackExitDialogSpec({ currentVersion: args.current || "", latestVersion: args.latest || "" });
  if (kind === "pack-latest") return getPackLatestDialogSpec({ currentVersion: args.current || "", latestVersion: args.latest || "" });
  if (kind === "pack-check-error") return getPackCheckErrorDialogSpec({ currentVersion: args.current || "", detail: args.detail || "" });
  if (kind === "pack-updated") return getPackUpdatedDialogSpec({ latestVersion: args.latest || "", hotUpdated: args.hot !== "0" });
  if (kind === "client-follow") return getClientFollowDialogSpec({ version: args.version || "" });
  if (kind === "relaunch-confirm") return getRelaunchConfirmDialogSpec();
  if (kind === "warn") {
    return getWarnNotifyDialogSpec({
      message: args.message || "客户端已更新，但自动汉化没有完成。\n\n请双击 win启动 里的“启动中文”重新汉化。",
    });
  }
  if (kind === "completion-star") {
    return {
      title: COMPLETION_DIALOG_TITLE,
      badge: COMPLETION_DIALOG_TITLE,
      icon: "star",
      headline: "汉化已完成！",
      message: "Antigravity 中文版已准备就绪。\n本项目开源免费维护，持续跟进新版本词库与功能适配；如果觉得好用，欢迎去 GitHub 点一颗 Star 支持一下！",
      cancelId: "close",
      buttons: [
        { id: "close", text: COMPLETION_DIALOG_BUTTONS.close, style: "secondary" },
        previewOnly
          ? { id: "star", text: COMPLETION_DIALOG_BUTTONS.star, style: "primary", isAccept: true }
          : { id: "star", text: COMPLETION_DIALOG_BUTTONS.star, style: "primary", url: REPO_URL, isAccept: true },
      ],
    };
  }
  return getPackStartupDialogSpec({ currentVersion: args.current || "", latestVersion: args.latest || "" });
}

const spec = buildSpec();

try {
  const result = await showModernWindowsDialog(spec);
  process.stdout.write(result);
} catch {
  process.stdout.write(spec.cancelId || "later");
}
