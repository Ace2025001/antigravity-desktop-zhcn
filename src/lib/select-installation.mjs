// Resolve every candidate before offering a choice; never silently pick the first of many.
export async function selectInstallation({ explicit, remembered, candidates, validate, choose, notify = () => {} }) {
  if (explicit) {
    const result = await validate(explicit);
    if (result.ok) return result.path;
    notify(`指定位置不可用：${result.reason}`);
  }
  if (!explicit && remembered) {
    const result = await validate(remembered);
    if (result.ok) return result.path;
    notify("之前使用的客户端已移动或不可用，正在重新查找。");
  }
  const found = new Map();
  for (const candidate of typeof candidates === "function" ? await candidates() : candidates) {
    const result = await validate(candidate);
    if (result.ok) found.set(result.key ?? result.path, result.path);
  }
  const options = [...found.values()];
  if (!explicit && options.length === 1) return options[0];
  let message = options.length > 1 ? "找到多个客户端，请选择要使用的那个。" : "未找到客户端，请选择已安装的 Antigravity Desktop。";
  for (;;) {
    const selected = await choose(options, message);
    if (!selected) throw new Error("已取消选择，没有修改客户端。");
    const result = await validate(selected);
    if (result.ok) return result.path;
    message = `此位置无法使用：${result.reason}。请重新选择，或取消。`;
  }
}
