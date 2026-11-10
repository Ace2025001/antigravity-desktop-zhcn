// Runs createLocalizedBundle off the main thread so the caller can keep
// updating an elapsed-time display while the CPU-heavy work runs.
// The caller passes its own dictionary (macOS merges extra rules into it).
import { parentPort, workerData } from "node:worker_threads";
import { createLocalizedBundle } from "./translator.mjs";

try {
  const result = createLocalizedBundle(Buffer.from(workerData.source), workerData.dictionary);
  parentPort.postMessage({ ok: true, buffer: result.buffer, sha256: result.sha256, coverage: result.coverage });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error?.message ?? String(error) });
}
