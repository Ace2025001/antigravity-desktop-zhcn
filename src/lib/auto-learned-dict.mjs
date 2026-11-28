import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AUTO_LEARNED_DICT_FILENAME = "auto-learned-translations.json";

// Learned entries that are now handled by built-in composite rules, or that
// look like user content (file names, links, paths, inline code), are ignored
// so earlier machine translations cannot shadow the curated rules.
// Keep in sync with __isObsoleteLearnedKey in translator.mjs (runtime overlay).
export const OBSOLETE_LEARNED_KEY_PATTERNS = [
  /^(?:Remove shortcut|Shortcut)\s+\S+\s+for\s+/,
  /^Add\s+shortcut\s+for\s+/,
  /^Install\s+\S/,
  /^Reset\s+.+\s+to\s+default$/,
  /,\s+\d+\s+turns?$/,
  /^Waiting\s+for\s+.+?\s+timer(?:,|\s*\u00b7|\s*·)/i,
  /^.+?\s+timer:\s*Timer\s+has\s+expired$/i,
  /^No\s+more\s+older\s+messages,\s*showing\s+\d+\s+of\s+\d+$/i,
  /^(?:Adding\.\.\.\s+\S|Plugin\s+installed:\s+\S)/,
  /^Added\s+(?:Chrome DevTools|[A-Z][A-Za-z0-9 .+-]{1,40})$/,
  /^(?:failed to get load code assist response:|This service has been disabled in this account for violation of Terms of Service)/i,
  /(?:width|height|max-width|min-width|display|grid-template|margin|padding|border-radius|gap)\s*:/i,
  /^(?:application|text|image|audio|video|font|multipart)\/[a-z0-9.+-]+$/i,
  /\b(?:Set|Get|Remove|New|Add|Clear|Copy|Move|Test|Invoke|Start|Stop|Write|Read)-[A-Z][A-Za-z0-9]+\b|\bEnv:[A-Za-z0-9_]+\b/,
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+\s+[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/,
  /^[（(][A-Za-z0-9\s_-]+$/u,
  /^Thinking\s+effort$/i,
  /^GitHub\s+Release\s+/i,
  /^Load(?:ing)?\s+older\s+messages/i,
  /^Plan,\s*\d+\s+of\s+\d+\s+steps?\s+done$/i,
  /^\d+\/\d+\s+steps?/i,
  /^Leaving\s+Soon$/i,
  /\bLeaving\s+on\s+[A-Za-z]+\s+\d/i,
  /^Model:.*Model cannot be changed/i,
  /^Extra\s+High$/i,
  /^Available on paid\b/i,
  /^Paid\s+(?:Plus|Pro|Ultra)$/i,
  /^Toggle\s+Swarm$/i,
  /(?:^@[a-z0-9_.-]+\/[a-z0-9_.-]+$|^[a-z0-9]+(?:[-_][a-z0-9]+)+$)/,
  /^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]+$/,
  /^--[a-z0-9-]+$/i,
  /^[.#][A-Za-z0-9_-]+(?:\s+[.#]?[A-Za-z0-9_-]+)*$/,
  /^["'`].*["'`]$/,
  /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+/,
  /^Searching\s+(?:marketplace\s+for\s+|github\s+|["'`])/i,
  /^Searching\s+.*(?:"|\bOR\b)/i,
  /[a-z][a-z0-9+.-]*:\/\/|`|(?:^|[\s(])(?:~|\.{1,2})?\/[\w.-]|[A-Za-z]:\\/i,
  /[\w-]+\.(?:txt|md|log|json|ya?ml|toml|lock|vbs|bat|cmd|ps1|sh|py|js|mjs|cjs|ts|tsx|jsx|csv|pdf|png|jpe?g|gif|webp|svg|zip|exe|dll|asar|pbtxt)\b/i
];

// Plugin marketplace / service names shown as-is: never machine-translated.
// Never list real people's names here: personal info is excluded by UI region instead
// (account / profile / avatar cards in translator.mjs).
export const KEEP_ORIGINAL_NAMES = [
  "CrowdStrike Falcon", "Wispr Flow", "Grafana Cloud", "Better Stack", "Chrome DevTools", "Android CLI",
  "Atlassian Teamwork Graph CLI", "PandaDoc", "Base44", "Intercom", "Mobbin", "Bigin", "Browserbase",
  "Granola", "Stripe", "Wix", "Semrush", "Context7", "Cloudflare", "CodeRabbit", "Firebase", "WordPress",
  "Gmail", "Gemini API", "monday.com", "Science", "Robotics",
  "Structural Biology", "Scientific Literature", "Science Overview", "Midpage Legal Research",
  "Descrybe Legal Engine", "Kling AI", "Adspirer Marketing Analytics", "Passim AI", "Orca Security",
  "Google AI Pro", "Google AI Plus", "Google AI Ultra", "Google AI Free", "Thinking effort"
];
const KEEP_ORIGINAL_SET = new Set(KEEP_ORIGINAL_NAMES);

export function isObsoleteLearnedKey(key) {
  return typeof key !== "string" || KEEP_ORIGINAL_SET.has(key) || OBSOLETE_LEARNED_KEY_PATTERNS.some((re) => re.test(key));
}

export function resolveCrossPlatformStateRoot() {
  if (process.env.AGY_ZHCN_STATE_DIR) {
    return path.resolve(process.env.AGY_ZHCN_STATE_DIR);
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AntigravityZhcn");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "AntigravityZhcn");
  }
  return path.join(os.homedir(), ".local", "share", "AntigravityZhcn");
}

export function getAutoLearnedDictPath() {
  return path.join(resolveCrossPlatformStateRoot(), AUTO_LEARNED_DICT_FILENAME);
}

export async function readAutoLearnedDict() {
  const filePath = getAutoLearnedDictPath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const exact = parsed.exact && typeof parsed.exact === "object" ? parsed.exact : parsed;
      const clean = {};
      for (const [k, v] of Object.entries(exact)) {
        if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim() && !isObsoleteLearnedKey(k)) {
          clean[k] = v;
        }
      }
      return clean;
    }
  } catch {
    // Return empty dict if file doesn't exist yet or is malformed
  }
  return {};
}

export async function readAutoLearnedTitles() {
  const filePath = getAutoLearnedDictPath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.titles && typeof parsed.titles === "object") {
      const clean = {};
      for (const [k, v] of Object.entries(parsed.titles)) {
        if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
          clean[k] = v;
        }
      }
      return clean;
    }
  } catch {
    // Return empty dict if file doesn't exist yet or is malformed
  }
  return {};
}

export async function mergeAutoLearnedEntries(newEntries) {
  if (!newEntries || typeof newEntries !== "object") return 0;
  const validEntries = Object.entries(newEntries).filter(
    ([k, v]) => typeof k === "string" && typeof v === "string" && k.trim().length > 0 && v.trim().length > 0
  );
  if (validEntries.length === 0) return 0;

  const filePath = getAutoLearnedDictPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const current = await readAutoLearnedDict();
  const currentTitles = await readAutoLearnedTitles();
  let addedOrUpdated = 0;
  for (const [k, v] of validEntries) {
    if (current[k] !== v) {
      current[k] = v;
      addedOrUpdated += 1;
    }
  }
  if (addedOrUpdated === 0) return 0;

  const payloadObj = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    count: Object.keys(current).length,
    exact: current,
  };
  if (Object.keys(currentTitles).length > 0) {
    payloadObj.titleCount = Object.keys(currentTitles).length;
    payloadObj.titles = currentTitles;
  }
  const payload = JSON.stringify(payloadObj, null, 2);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${payload}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return addedOrUpdated;
}
