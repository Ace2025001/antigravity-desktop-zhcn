// Shared look for the launcher window: a title banner, numbered steps, status
// symbols and a closing summary. Colors only appear in an interactive
// terminal; background runs, AI agents and NO_COLOR get plain text.
//
// Step numbers continue across child processes through AGY_UI_STEP, so a
// launcher that hands over to another script keeps counting 1, 2, 3 …

const LINE_WIDTH = 44;

export function colorEnabled(stream = process.stdout, env = process.env) {
  return Boolean(stream.isTTY) && !env.NO_COLOR && env.AGY_PLAIN_OUTPUT !== "1";
}

const paint = (code, text) => (colorEnabled() ? `\x1b[${code}m${text}\x1b[0m` : text);
export const color = Object.freeze({
  green: (text) => paint("32", text),
  yellow: (text) => paint("33", text),
  red: (text) => paint("31", text),
  cyan: (text) => paint("36", text),
  bold: (text) => paint("1", text),
  dim: (text) => paint("2", text),
});

export const SYMBOLS = Object.freeze({ ok: "✔", warn: "!", fail: "✘", step: "▶", bar: "│" });

const out = (line = "") => console.log(line);

export function banner(title, tone = color.cyan) {
  const rule = tone("═".repeat(LINE_WIDTH));
  out("");
  out(rule);
  out(color.bold(`  ${title}`));
  out(rule);
}

export function step(title) {
  const next = Number(process.env.AGY_UI_STEP || 0) + 1;
  process.env.AGY_UI_STEP = String(next);
  out("");
  out(color.bold(color.cyan(`${SYMBOLS.step} 第 ${next} 步  ${title}`)));
  return next;
}

export const ok = (message) => out(`  ${color.green(SYMBOLS.ok)} ${message}`);
export const warn = (message) => out(`  ${color.yellow(SYMBOLS.warn)} ${message}`);
export const fail = (message) => out(`  ${color.red(SYMBOLS.fail)} ${message}`);
export const info = (message) => out(`  ${message}`);
export const note = (message) => out(`  ${color.dim(message)}`);
export const choice = (message) => out(`  ${color.yellow(SYMBOLS.bar)} ${message}`);

/** Technical details (paths, hashes) only show with AGY_VERBOSE=1. */
export const detail = (message) => {
  if (process.env.AGY_VERBOSE === "1") out(`    ${color.dim(message)}`);
};

export function finish(message, extra = []) {
  const rule = color.green("═".repeat(LINE_WIDTH));
  out("");
  out(rule);
  out(color.bold(color.green(`  ${SYMBOLS.ok} ${message}`)));
  for (const line of extra) out(`  ${line}`);
  out(rule);
}

export function failure(message, advice) {
  const rule = color.red("═".repeat(LINE_WIDTH));
  out("");
  out(rule);
  out(color.bold(color.red(`  ${SYMBOLS.fail} 未完成：${message}`)));
  if (advice) out(`  怎么办：${advice}`);
  out(rule);
}

/** Overwrite the current terminal line (used for countdowns and timers). */
export function liveLine(text, stream = process.stdout) {
  stream.write(`\r  ${text}    `);
}

export function endLiveLine(stream = process.stdout) {
  stream.write(`\r${" ".repeat(90)}\r`);
}

export function formatElapsed(seconds) {
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export async function runTimedTask({
  label,
  doneText,
  work,
  log = console.log,
  stdout = process.stdout,
  intervalMs = 1000,
}) {
  const startedAt = Date.now();
  const elapsed = () => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const live = log === console.log && stdout.isTTY;
  let currentLabel = label;
  const setLabel = (nextLabel) => {
    if (!nextLabel) return;
    currentLabel = nextLabel;
    if (live) liveLine(`${currentLabel} 已用时 ${formatElapsed(elapsed())}`, stdout);
  };
  if (live) liveLine(`${currentLabel} 已用时 0 秒`, stdout);
  else log(`  ${currentLabel}`);
  let lastNotice = 0;
  const ticker = setInterval(() => {
    const seconds = elapsed();
    if (live) liveLine(`${currentLabel} 已用时 ${formatElapsed(seconds)}`, stdout);
    else if (seconds - lastNotice >= 15) {
      lastNotice = seconds;
      log(`  ${currentLabel} 已用时 ${formatElapsed(seconds)}…`);
    }
  }, intervalMs);
  try {
    const result = await work({ setLabel, elapsed });
    clearInterval(ticker);
    if (live) endLiveLine(stdout);
    const totalSeconds = elapsed();
    if (doneText) {
      const text = typeof doneText === "function" ? doneText(result, totalSeconds) : doneText;
      if (text) log(`  ${color.green(SYMBOLS.ok)} ${text}（用时 ${formatElapsed(totalSeconds)}）`);
    }
    return result;
  } catch (err) {
    clearInterval(ticker);
    if (live) endLiveLine(stdout);
    throw err;
  }
}
