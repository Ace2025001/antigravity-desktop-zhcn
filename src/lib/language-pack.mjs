import path from "node:path";
import { readFile } from "node:fs/promises";
import { projectRoot } from "./paths.mjs";
import { sha256Buffer } from "./hash.mjs";

export function languageFile(name) {
  return path.join(process.env.AGY_LANGUAGE_PACK || path.join(projectRoot, "config"), name);
}

export async function localizationFingerprint(platform = process.platform) {
  // UI/progress/launcher changes must not invalidate an installed translation.
  const files = ["src/lib/translator.mjs", "src/lib/patcher.mjs"];
  const buffers = await Promise.all(files.map(file => readFile(path.join(projectRoot, file))));
  buffers.push(await readFile(languageFile("dom-translations.json")));
  if (platform === "darwin") buffers.push(await readFile(languageFile("macos-translations.json")));
  // Line endings must not matter: a Windows checkout (CRLF) and the release package (LF)
  // hold the same content and must yield the same fingerprint.
  const normalized = buffers.map((buffer) => Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8"));
  return sha256Buffer(Buffer.concat(normalized));
}
