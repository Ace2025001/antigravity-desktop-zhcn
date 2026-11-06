import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadDomTranslations } from "../src/lib/translator.mjs";
import { localizationFingerprint } from "../src/lib/language-pack.mjs";

test("shared language folder overrides bundled dictionaries and changes both fingerprints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agy-language-"));
  const previous = process.env.AGY_LANGUAGE_PACK;
  try {
    process.env.AGY_LANGUAGE_PACK = root;
    await writeFile(path.join(root, "dom-translations.json"), JSON.stringify({schemaVersion:2,exact:{Settings:"测试设置"},patterns:[]}));
    await writeFile(path.join(root, "macos-translations.json"), '{"exact":{},"patterns":[]}');
    assert.equal((await loadDomTranslations()).exact.Settings, "测试设置");
    const before = await Promise.all([localizationFingerprint("win32"), localizationFingerprint("darwin")]);
    await writeFile(path.join(root, "dom-translations.json"), JSON.stringify({schemaVersion:2,exact:{Settings:"新设置"},patterns:[]}));
    const after = await Promise.all([localizationFingerprint("win32"), localizationFingerprint("darwin")]);
    assert.notEqual(before[0], after[0]);
    assert.notEqual(before[1], after[1]);
  } finally {
    if (previous === undefined) delete process.env.AGY_LANGUAGE_PACK;
    else process.env.AGY_LANGUAGE_PACK = previous;
    await rm(root, {recursive:true,force:true});
  }
});
