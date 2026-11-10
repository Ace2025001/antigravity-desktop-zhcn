// A running process does not prove that the user has no unsaved work.
export async function closeWithPolicy({running, requestClose, log=console.log, sleep=ms=>new Promise(r=>setTimeout(r,ms)), now=Date.now, responseMs=60000, exitMs=15000, exitHint=""}) {
  if (!(await running())) { log("客户端已退出，可以继续。"); return; }
  log("需要暂时退出 Antigravity。无法可靠判断是否有未完成任务，请先保存工作并正常退出。");
  if (exitHint) log(exitHint);
  log("60 秒后将自动请求正常退出；Ctrl+C 可取消本次操作。不会强制终止进程。");
  const deadline = now()+responseMs;
  let previous;
  const tick = () => {
    const remaining = Math.max(0,Math.ceil((deadline-now())/1000));
    if (remaining === previous) return;
    if (log === console.log && process.stdout.isTTY) process.stdout.write(`\r等待保存并退出：剩余 ${String(remaining).padStart(2," ")} 秒。  `);
    else log(`等待保存并退出：剩余 ${remaining} 秒。`);
    previous = remaining;
  };
  tick();
  const ticker = setInterval(tick,1000);
  try {
    while (await running()) {
      if (now() >= deadline) break;
      await sleep(Math.min(1000,Math.max(1,deadline-now())));
    }
  } finally {
    clearInterval(ticker);
    if (log === console.log && process.stdout.isTTY) process.stdout.write("\n");
  }
  if (!(await running())) {log("客户端已退出，继续处理。");return;}
  log("响应时间已到，正在请求客户端正常退出…");
  await requestClose();
  const exitDeadline = now()+exitMs;
  while (await running()) {
    if (now() >= exitDeadline) throw new Error(`客户端未退出，已停止本次操作。${exitHint || "请处理客户端提示后重试。"}`);
    await sleep(500);
  }
  log("客户端已正常退出，继续处理。");
}
