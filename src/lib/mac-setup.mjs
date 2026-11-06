// Keep the interactive workflow separate so failures can be tested without a Mac.
export async function runMacSetup({ inspect, waitUntilClosed, openOriginal, ready, capture, install, launch, log }) {
  log("正在检查已安装的 Antigravity…");
  const info = await inspect();
  await waitUntilClosed();
  log("正在打开官方应用，请等待首页显示。");
  await openOriginal(info.original);
  await ready();
  log("正在准备中文界面…");
  await capture(info);
  await waitUntilClosed();
  log("正在安装中文，请稍候…");
  await install(info);
  await launch();
  log("安装完成！以后双击“启动中文”即可。恢复时双击“恢复英文”。");
}
