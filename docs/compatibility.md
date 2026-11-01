# Antigravity Desktop 中文包：最新版与跨版本动态适配

适用系统：Windows x64。适用产品：Google Antigravity Desktop 独立桌面客户端。

**支持最新版，随客户端更新动态适配，无需为不同客户端版本选择不同补丁包。** 本项目同时提供已知构建的指纹检查和动态自适应两条路径；白名单最高登记版本不是支持上限。

## 如何确认自己的版本能不能安装？

1. 下载 [最新正式便携包](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)。
2. 解压后保存工作，运行 `一键汉化.bat` 按提示安装，或直接运行 `启动 Antigravity（自动汉化）.bat` 使用动态适配。
3. 可用 `一键检查兼容性.bat` 检查已登记构建。相同版本号可能存在不同构建；未登记不代表自适应安装不支持。

## 仓库中登记了哪些版本？

以下为 2026-11-01 核对主分支 `config/compatibility/` 得到的 22 个版本记录；这是清单盘点，不是本次实机测试报告。下载包与主分支可能不同，请以所下载包及检查结果为准。

| 客户端版本 | 本地构建记录 |
| --- | --- |
| 2.2.1 | [win32-x64.json](../config/compatibility/2.2.1/win32-x64.json) |
| 2.3.0 | [win32-x64.json](../config/compatibility/2.3.0/win32-x64.json) |
| 2.3.1 | [win32-x64.json](../config/compatibility/2.3.1/win32-x64.json) |
| 2.4.3 | [win32-x64.json](../config/compatibility/2.4.3/win32-x64.json) |
| 2.5.0 | [win32-x64.json](../config/compatibility/2.5.0/win32-x64.json) |
| 2.6.0 | [win32-x64.json](../config/compatibility/2.6.0/win32-x64.json) |
| 2.7.1 | [win32-x64.json](../config/compatibility/2.7.1/win32-x64.json) |
| 2.8.1 | [win32-x64.json](../config/compatibility/2.8.1/win32-x64.json) |
| 2.9.1 | [win32-x64.json](../config/compatibility/2.9.1/win32-x64.json) |
| 2.10.0 | [win32-x64.json](../config/compatibility/2.10.0/win32-x64.json) |
| 2.11.0 | [win32-x64.json](../config/compatibility/2.11.0/win32-x64.json) |
| 2.12.0 | [win32-x64.json](../config/compatibility/2.12.0/win32-x64.json) |
| 2.12.2 | [win32-x64.json](../config/compatibility/2.12.2/win32-x64.json) |
| 2.13.0 | [win32-x64.json](../config/compatibility/2.13.0/win32-x64.json) |
| 2.14.0 | [win32-x64.json](../config/compatibility/2.14.0/win32-x64.json) |
| 2.15.0 | [win32-x64.json](../config/compatibility/2.15.0/win32-x64.json) |
| 2.15.1 | [win32-x64.json](../config/compatibility/2.15.1/win32-x64.json) |
| 2.16.0 | [win32-x64.json](../config/compatibility/2.16.0/win32-x64.json) |
| 2.17.0 | [win32-x64.json](../config/compatibility/2.17.0/win32-x64.json) |
| 2.19.1 | [win32-x64.json](../config/compatibility/2.19.1/win32-x64.json) |
| 2.23.0 | [win32-x64.json](../config/compatibility/2.23.0/win32-x64.json) |
| 2.23.1 | [win32-x64.json](../config/compatibility/2.23.1/win32-x64.json) |

## 清单登记、结构检查与实机验证有何区别？

- **清单登记**：仓库有对应构建的指纹记录；不代表任何同版本文件都能通过检查。
- **自适应结构检查**：自动跟进入口检查当前客户端的代码结构并尝试生成补丁；不等于已对该版本完成实机验证。
- **实机验证**：需在真实客户端检查安装、界面、日常功能和恢复，并记录环境及结果。本文不把清单登记提升为实机验证。

这些历史指纹记录用于已知构建的检查，**不用于限定最新版或跨版本自适应的支持范围**。自适应路径根据实际安装的客户端读取资源并检查结构；结构验证与逐版本实机验证应分别记录。

## 新版本失败怎么办？

保存检查输出并通过 [版本适配反馈](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues/new/choose) 提交客户端版本和必要诊断信息。移除账号、令牌等隐私。不要删除恢复备份、伪造指纹记录或禁用校验。

[返回项目首页](../README.md) · [AI 助手安装指南](ai-install.md)
