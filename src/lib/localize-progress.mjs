import { Worker } from "node:worker_threads";
import { createLocalizedBundle } from "./translator.mjs";

export function formatElapsed(seconds) {
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

class WorkerUnavailableError extends Error {}

function runInWorker(sourceBuffer, dictionary) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      // execArgv: [] keeps flags such as --input-type from breaking the worker.
      worker = new Worker(new URL("./localize-worker.mjs", import.meta.url), {
        workerData: { source: sourceBuffer, dictionary },
        execArgv: [],
      });
    } catch (error) {
      reject(new WorkerUnavailableError(error.message));
      return;
    }
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message.ok) resolve({ buffer: Buffer.from(message.buffer), sha256: message.sha256, coverage: message.coverage });
      else reject(new Error(message.message));
    });
    worker.once("error", (error) => { if (!settled) { settled = true; reject(new WorkerUnavailableError(error.message)); } });
    worker.once("exit", (code) => { if (!settled) { settled = true; reject(new WorkerUnavailableError(`线程退出码 ${code}`)); } });
  });
}

/**
 * Same result as createLocalizedBundle, but shows a live “已用时” while it runs.
 * Falls back to the main thread if a worker cannot start.
 */
export async function createLocalizedBundleWithProgress(sourceBuffer, dictionary, { log = console.log, stdout = process.stdout, label = "正在生成中文界面，可能需要几十秒，请勿关闭窗口…" } = {}) {
  const startedAt = Date.now();
  const elapsed = () => Math.floor((Date.now() - startedAt) / 1000);
  const live = log === console.log && stdout.isTTY;
  if (live) stdout.write(`${label}已用时 0 秒`);
  else log(label);
  let last = 0;
  const ticker = setInterval(() => {
    const seconds = elapsed();
    if (live) stdout.write(`\r${label}已用时 ${formatElapsed(seconds)}  `);
    else if (seconds - last >= 15) { last = seconds; log(`仍在生成中文界面，已用时 ${formatElapsed(seconds)}…`); }
  }, 1000);
  let result;
  try {
    try {
      result = await runInWorker(sourceBuffer, dictionary);
    } catch (error) {
      // Only a worker that could not run falls back; translation errors propagate.
      if (!(error instanceof WorkerUnavailableError)) throw error;
      result = createLocalizedBundle(sourceBuffer, dictionary);
    }
  } finally {
    clearInterval(ticker);
    if (live) stdout.write("\n");
  }
  log(`中文界面已生成，用时 ${formatElapsed(elapsed())}。`);
  return result;
}
