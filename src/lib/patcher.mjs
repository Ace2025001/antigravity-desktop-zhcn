import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { sha256Buffer, sha256File } from "./hash.mjs";
import {
  getAsarEntry,
  readAsarHeader,
  readFileFromAsar,
  readJsonFromAsar,
} from "./asar-reader.mjs";

const SCHEME_LIST_ANCHOR = `        },
    ]);
}`;

const SCHEME_LIST_REPLACEMENT = `        },
        {
            scheme: 'agy-zhcn',
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                corsEnabled: true,
                codeCache: true,
            },
        },
    ]);
}`;

const HANDLER_ANCHOR = "function registerCustomSchemeHandlers() {";

const HANDLER_REPLACEMENT = `${HANDLER_ANCHOR}
    // Antigravity Desktop ZHCN: serve a verified local UI bundle.
    electron_1.session.defaultSession.clearCache().catch((err) => {
        console.error("Failed to clear cache before loading ZHCN UI:", err);
    });
    const _zhPath = require("path");
    const _zhOs = require("os");
    const _zhFs = require("fs/promises");
    const _zhCp = require("child_process");
    const _zhRepoReleaseUrl = 'https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest';
    const _zhGetStateDir = () => {
        if (process.env.AGY_ZHCN_STATE_DIR) return _zhPath.resolve(process.env.AGY_ZHCN_STATE_DIR);
        if (process.platform === 'win32' && process.env.LOCALAPPDATA) return _zhPath.join(process.env.LOCALAPPDATA, 'AntigravityZhcn');
        if (process.platform === 'darwin') return _zhPath.join(_zhOs.homedir(), 'Library', 'Application Support', 'AntigravityZhcn');
        return _zhPath.join(_zhOs.homedir(), '.antigravity-zhcn');
    };
    const _zhParseSemver = (s) => {
        const m = String(s || '').match(/^(\\d+)\\.(\\d+)\\.(\\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const _zhCompareSemver = (left, right) => {
        const a = _zhParseSemver(left), b = _zhParseSemver(right);
        if (!a || !b) return 0;
        for (let i = 0; i < 3; i += 1) {
            if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
        }
        return 0;
    };
    const _zhReadPackHook = async () => {
        try {
            const hookPath = _zhPath.join(electron_1.app.getPath('userData'), 'agy_zhcn_pack_hook.json');
            const hook = JSON.parse(await _zhFs.readFile(hookPath, 'utf8'));
            if (!hook || !hook.nodePath || !hook.selfUpdateScript) return null;
            await _zhFs.access(hook.selfUpdateScript);
            return hook;
        } catch (_hErr) {
            return null;
        }
    };
    const _zhResolveLocalVer = async (hook, fallback = '0.0.0') => {
        let ver = (hook && typeof hook.currentVersion === 'string' && hook.currentVersion.trim()) ? hook.currentVersion.trim() : fallback;
        if (hook && hook.coreRoot) {
            try {
                const pkg = JSON.parse(await _zhFs.readFile(_zhPath.join(hook.coreRoot, 'package.json'), 'utf8'));
                if (typeof pkg.version === 'string' && pkg.version.trim()) ver = pkg.version.trim();
            } catch (_vErr) {}
        }
        return ver;
    };
    const _zhReadPackState = async (stateDir) => {
        try {
            return JSON.parse(await _zhFs.readFile(_zhPath.join(stateDir, 'pack-update-state.json'), 'utf8')) || {};
        } catch (_psErr) {
            return {};
        }
    };
    const _zhWritePackState = async (stateDir, patch) => {
        const current = await _zhReadPackState(stateDir);
        const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
        await _zhFs.mkdir(stateDir, { recursive: true });
        await _zhFs.writeFile(_zhPath.join(stateDir, 'pack-update-state.json'), JSON.stringify(next, null, 2) + '\\n', 'utf8');
        return next;
    };
    const _zhGetSettingsFile = () => _zhPath.join(_zhGetStateDir(), 'settings.json');
    const _zhReadSettingsState = async () => {
        const now = Date.now();
        if (globalThis.__agyZhcnSettingsCache && now - globalThis.__agyZhcnSettingsCache.at < 3000) {
            return globalThis.__agyZhcnSettingsCache;
        }
        // onlineTranslate (UI fill-in) is off unless the settings file explicitly turns it on.
        const value = { onlineTranslate: false, titleAutoTranslate: true, packAutoUpdate: 'auto', autoFollow: 'auto', titleWriteBack: false };
        let exists = false;
        let startupPackMode = 'off';
        let raw = {};
        try {
            raw = JSON.parse(await _zhFs.readFile(_zhGetSettingsFile(), 'utf8')) || {};
            if (raw && typeof raw === 'object') {
                exists = true;
                if (typeof raw.onlineTranslate === 'boolean') value.onlineTranslate = raw.onlineTranslate;
                if (typeof raw.titleAutoTranslate === 'boolean') {
                    value.titleAutoTranslate = raw.titleAutoTranslate;
                } else if (raw.onlineTranslate === false || raw.autoTranslateTitles === false) {
                    value.titleAutoTranslate = false;
                }
                if (raw.packAutoUpdate === 'auto' || raw.packAutoUpdate === 'ask' || raw.packAutoUpdate === 'off') {
                    value.packAutoUpdate = raw.packAutoUpdate;
                    startupPackMode = raw.packAutoUpdate;
                } else {
                    // Existing installs created before packAutoUpdate stay interactive ("ask") rather than auto-downloading silently.
                    startupPackMode = 'ask';
                }
                if (raw.autoFollow === 'auto' || raw.autoFollow === 'ask' || raw.autoFollow === 'off') {
                    value.autoFollow = raw.autoFollow;
                }
                if (typeof raw.titleWriteBack === 'boolean') value.titleWriteBack = raw.titleWriteBack;
            }
        } catch (_settingsErr) {}
        const snapshot = { at: now, value, exists, startupPackMode, raw };
        globalThis.__agyZhcnSettingsCache = snapshot;
        return snapshot;
    };
    const _zhReadMaxAppVer = async (hook) => {
        if (!hook || !hook.coreRoot) return '';
        const candidates = [];
        try {
            const pkg = JSON.parse(await _zhFs.readFile(_zhPath.join(hook.coreRoot, 'package.json'), 'utf8'));
            const metaVer = typeof pkg?.maxSupportedClientVersion === 'string' ? pkg.maxSupportedClientVersion.trim() : '';
            if (/^\\d+\\.\\d+\\.\\d+$/.test(metaVer)) candidates.push(metaVer);
        } catch (_pkgErr) {}
        try {
            const entries = await _zhFs.readdir(_zhPath.join(hook.coreRoot, 'config', 'compatibility'), { withFileTypes: true });
            for (const e of entries) {
                if (e && typeof e.isDirectory === 'function' && e.isDirectory() && /^\\d+\\.\\d+\\.\\d+$/.test(e.name)) {
                    candidates.push(e.name);
                }
            }
        } catch (_mErr) {}
        candidates.sort((a, b) => _zhCompareSemver(b, a));
        return candidates[0] || '';
    };
    const _zhSyncAutoFollowHook = (hook) => new Promise((resolve) => {
        if (process.platform !== 'win32' || !hook || !hook.nodePath || !hook.coreRoot) return resolve(false);
        const startScript = _zhPath.join(hook.coreRoot, 'scripts', 'start-local.mjs');
        _zhCp.execFile(
            hook.nodePath,
            [startScript, 'sync-autofollow'],
            { env: { ...process.env, AGY_LANGUAGE_PACK: hook.languagePackDir || '' }, windowsHide: true, encoding: 'utf8', timeout: 15000 },
            (err) => resolve(!err)
        );
    });
    const _zhWriteSettings = async (patch, hook) => {
        const current = await _zhReadSettingsState();
        const prev = (current && current.raw && typeof current.raw === 'object') ? current.raw : {};
        const next = {
            schemaVersion: 1,
            autoFollow: current.value.autoFollow,
            packAutoUpdate: current.value.packAutoUpdate,
            onlineTranslate: current.value.onlineTranslate,
            titleAutoTranslate: current.value.titleAutoTranslate,
            titleWriteBack: Boolean(prev.titleWriteBack),
        };
        let autoFollowChanged = false;
        if (patch && (patch.autoFollow === 'auto' || patch.autoFollow === 'ask' || patch.autoFollow === 'off')) {
            autoFollowChanged = next.autoFollow !== patch.autoFollow;
            next.autoFollow = patch.autoFollow;
        }
        if (patch && (patch.packAutoUpdate === 'auto' || patch.packAutoUpdate === 'ask' || patch.packAutoUpdate === 'off')) {
            next.packAutoUpdate = patch.packAutoUpdate;
        }
        if (patch && typeof patch.onlineTranslate === 'boolean') next.onlineTranslate = patch.onlineTranslate;
        if (patch && typeof patch.titleAutoTranslate === 'boolean') next.titleAutoTranslate = patch.titleAutoTranslate;
        next.updatedAt = new Date().toISOString();
        const settingsFile = _zhGetSettingsFile();
        await _zhFs.mkdir(_zhPath.dirname(settingsFile), { recursive: true });
        const tmpFile = settingsFile + '.' + process.pid + '.' + Date.now() + '.tmp';
        await _zhFs.writeFile(tmpFile, JSON.stringify(next, null, 2) + '\\n', 'utf8');
        await _zhFs.rename(tmpFile, settingsFile);
        globalThis.__agyZhcnSettingsCache = null;
        if (autoFollowChanged && process.platform === 'win32') {
            await _zhSyncAutoFollowHook(hook).catch(() => false);
        }
        return next;
    };
    const _zhUpdateMacPackMenuVersion = (newVer) => {
        if (process.platform !== 'darwin' || !newVer || !electron_1.Menu || typeof electron_1.Menu.getApplicationMenu !== 'function') return;
        try {
            const appMenu = electron_1.Menu.getApplicationMenu();
            const appSub = appMenu && appMenu.items && appMenu.items[0] && appMenu.items[0].submenu;
            if (!appSub || !Array.isArray(appSub.items)) return;
            const item = appSub.items.find((it) => it && it.id === 'agy-zhcn-pack-center');
            if (item) {
                item.label = '汉化中心 v' + newVer;
                electron_1.Menu.setApplicationMenu(appMenu);
            }
        } catch (_muErr) {}
    };
    const _zhFetchLatestRelease = async (localVer, timeoutMs = 4500) => {
        try {
            const doFetch = (electron_1.net && typeof electron_1.net.fetch === 'function') ? electron_1.net.fetch.bind(electron_1.net) : fetch;
            const fetchOpts = {
                headers: { 'User-Agent': 'antigravity-desktop-zhcn-updater', 'Accept': 'application/vnd.github+json' },
                ...(typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(timeoutMs) } : {})
            };
            const resp = await doFetch('https://api.github.com/repos/Ace2025001/antigravity-desktop-zhcn/releases/latest', fetchOpts);
            if (!resp || !resp.ok) return { ok: false, reason: 'http-' + (resp ? resp.status : 'err') };
            const rel = await resp.json().catch(() => null);
            if (!rel || typeof rel.tag_name !== 'string') return { ok: false, reason: 'invalid-payload' };
            const latestVer = rel.tag_name.trim().replace(/^v/i, '');
            if (!_zhParseSemver(latestVer)) return { ok: false, reason: 'invalid-semver' };
            const hasNew = _zhCompareSemver(latestVer, localVer) > 0;
            const releaseUrl = (typeof rel.html_url === 'string' && rel.html_url) ? rel.html_url : _zhRepoReleaseUrl;
            const rawBody = typeof rel.body === 'string' ? rel.body.replace(/\\r\\n/g, '\\n').trim() : '';
            const notes = rawBody.length > 600 ? rawBody.slice(0, 600) + '...' : rawBody;
            return { ok: true, localVer, latestVer, hasNew, releaseUrl, notes };
        } catch (err) {
            return { ok: false, reason: (err && err.name === 'TimeoutError') ? 'timeout' : ((err && err.message) || 'network-error') };
        }
    };
    const _zhShowModernOrNativeDialog = async (hook, { kind, current = '', latest = '', detail = '', hot = true, type = 'info', title, message, boxDetail, buttons, defaultId = 0, cancelId = 0, actionMap }) => {
        let action = '';
        if (process.platform === 'win32' && hook && hook.nodePath && hook.coreRoot) {
            const showDialogScript = _zhPath.join(hook.coreRoot, 'scripts', 'show-dialog.mjs');
            try {
                await _zhFs.access(showDialogScript);
                const cliArgs = [showDialogScript, '--kind', kind];
                if (current) cliArgs.push('--current', current);
                if (latest) cliArgs.push('--latest', latest);
                if (detail) cliArgs.push('--detail', detail);
                if (!hot) cliArgs.push('--hot', '0');
                action = await new Promise((resolve) => {
                    _zhCp.execFile(
                        hook.nodePath,
                        cliArgs,
                        { windowsHide: true, encoding: 'utf8', timeout: 120000 },
                        (err, stdout) => resolve(err ? '' : String(stdout || '').trim())
                    );
                });
            } catch (_dlgErr) {}
        }
        if (!action) {
            const win = electron_1.BrowserWindow && electron_1.BrowserWindow.getFocusedWindow ? electron_1.BrowserWindow.getFocusedWindow() : undefined;
            const choice = await electron_1.dialog.showMessageBox(win, {
                type,
                title,
                message,
                detail: boxDetail,
                buttons,
                defaultId,
                cancelId
            });
            const idx = choice && typeof choice.response === 'number' ? choice.response : cancelId;
            action = (actionMap && actionMap[idx]) || '';
        }
        return action;
    };
    const _zhSpawnSelfUpdate = (hook, extraArgs = []) => {
        const child = _zhCp.spawn(hook.nodePath, [hook.selfUpdateScript, '--from-client', '--quiet', ...extraArgs], {
            env: { ...process.env, AGY_LANGUAGE_PACK: hook.languagePackDir || '' },
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
    };
    const _zhRunSelfUpdateWait = (hook, extraArgs = []) => new Promise((resolve) => {
        _zhCp.execFile(
            hook.nodePath,
            [hook.selfUpdateScript, '--from-client', '--quiet', ...extraArgs],
            { env: { ...process.env, AGY_LANGUAGE_PACK: hook.languagePackDir || '' }, windowsHide: true, encoding: 'utf8', timeout: 120000 },
            (err) => resolve(!err)
        );
    });
    const _zhRunManualDialogCheck = async (hook, fallbackVer) => {
        const stateDir = _zhGetStateDir();
        const localVer = await _zhResolveLocalVer(hook, fallbackVer || '0.0.0');
        const rel = await _zhFetchLatestRelease(localVer, 5000);
        if (!rel.ok) {
            const action = await _zhShowModernOrNativeDialog(hook, {
                kind: 'pack-check-error',
                current: localVer,
                detail: rel.reason,
                type: 'warning',
                title: '检查汉化包更新',
                message: '暂时无法获取最新版本信息',
                boxDetail: '当前版本：v' + localVer + '\\n\\n未能连接 GitHub 发布页（' + rel.reason + '），请检查网络连接后重试。',
                buttons: ['关闭', '打开发布页'],
                defaultId: 1,
                cancelId: 0,
                actionMap: ['close', 'open']
            });
            if (action === 'open' && electron_1.shell && typeof electron_1.shell.openExternal === 'function') {
                electron_1.shell.openExternal(_zhRepoReleaseUrl).catch(() => {});
            }
            return { ok: false, status: 'check-failed', currentVersion: localVer, handled: true };
        }
        if (!rel.hasNew) {
            await _zhShowModernOrNativeDialog(hook, {
                kind: 'pack-latest',
                current: localVer,
                latest: rel.latestVer,
                type: 'info',
                title: '检查汉化包更新',
                message: '当前汉化包已是最新版本 v' + localVer,
                boxDetail: '当前安装版本：v' + localVer + '\\nGitHub 最新版本：v' + rel.latestVer + '\\n\\n无需更新。',
                buttons: ['确定'],
                defaultId: 0,
                cancelId: 0,
                actionMap: ['ok']
            });
            return { ok: true, status: 'up-to-date', currentVersion: localVer, latestVersion: rel.latestVer, handled: true };
        }
        if (!hook) {
            const action = await _zhShowModernOrNativeDialog(null, {
                kind: 'pack-startup',
                current: localVer,
                latest: rel.latestVer,
                type: 'info',
                title: '发现汉化包新版本',
                message: '发现 Antigravity 中文汉化包新版本 v' + rel.latestVer,
                boxDetail: '当前版本：v' + localVer + '\\n最新版本：v' + rel.latestVer + '\\n\\n当前目录无法自动更新，请前往发布页下载新版汉化包。',
                buttons: ['打开下载页', '关闭'],
                defaultId: 0,
                cancelId: 1,
                actionMap: ['open', 'close']
            });
            if (action === 'open' && electron_1.shell && typeof electron_1.shell.openExternal === 'function') {
                electron_1.shell.openExternal(rel.releaseUrl).catch(() => {});
            }
            return { ok: true, status: 'update-available', currentVersion: localVer, latestVersion: rel.latestVer, handled: true };
        }
        const action = await _zhShowModernOrNativeDialog(hook, {
            kind: 'pack-startup',
            current: localVer,
            latest: rel.latestVer,
            type: 'info',
            title: 'Antigravity 汉化包有新版本',
            message: '发现 Antigravity 中文汉化包新版本 v' + rel.latestVer,
            boxDetail: '当前版本：v' + localVer + '\\n\\n是否立即在后台下载更新？下载后核对 SHA-256，客户端可以继续使用。',
            buttons: ['立即更新', '稍后再说', '跳过此版本'],
            defaultId: 0,
            cancelId: 1,
            actionMap: ['update', 'later', 'skip']
        });
        if (action === 'update') {
            await _zhWritePackState(stateDir, { skippedVersion: null, snoozedVersion: null, snoozedUntil: 0 }).catch(() => {});
            const okUpd = await _zhRunSelfUpdateWait(hook, []);
            if (okUpd) {
                _zhUpdateMacPackMenuVersion(rel.latestVer);
                await _zhShowModernOrNativeDialog(hook, {
                    kind: 'pack-updated',
                    latest: rel.latestVer,
                    hot: process.platform === 'win32',
                    type: 'info',
                    title: '汉化包更新完成',
                    message: '汉化包已更新至 v' + rel.latestVer,
                    boxDetail: process.platform === 'win32'
                        ? '中文界面已更新，在客户端窗口按 Ctrl+R 刷新即可看到；其余部分在下次退出客户端时自动完成。'
                        : '已完成下载与 SHA-256 校验；按 ⌘Q 退出后，重新打开一次“启动中文.command”即可完成更新。',
                    buttons: ['知道了'],
                    defaultId: 0,
                    cancelId: 0,
                    actionMap: ['ok']
                });
            } else {
                const errAct = await _zhShowModernOrNativeDialog(hook, {
                    kind: 'pack-check-error',
                    current: localVer,
                    detail: '更新执行失败',
                    type: 'warning',
                    title: '汉化包更新未完成',
                    message: '这次更新没有完成，可以重试或前往发布页手动更新。',
                    boxDetail: '请双击“启动中文”重试，或前往 GitHub 发布页下载完整汉化包。',
                    buttons: ['关闭', '打开发布页'],
                    defaultId: 0,
                    cancelId: 0,
                    actionMap: ['close', 'open']
                });
                if (errAct === 'open' && electron_1.shell && typeof electron_1.shell.openExternal === 'function') {
                    electron_1.shell.openExternal(rel.releaseUrl).catch(() => {});
                }
            }
            return { ok: okUpd, status: okUpd ? 'updated' : 'update-failed', currentVersion: localVer, latestVersion: rel.latestVer, handled: true };
        }
        if (action === 'skip') {
            await _zhWritePackState(stateDir, { skippedVersion: rel.latestVer }).catch(() => {});
        }
        return { ok: true, status: action || 'cancelled', currentVersion: localVer, latestVersion: rel.latestVer, handled: true };
    };
    electron_1.protocol.handle('agy-zhcn', async (request) => {
        const path = _zhPath;
        const os = _zhOs;
        const fsPromises = _zhFs;
        const getAutoDictPath = () => {
            if (process.env.AGY_ZHCN_STATE_DIR) return path.join(path.resolve(process.env.AGY_ZHCN_STATE_DIR), 'auto-learned-translations.json');
            if (process.platform === 'win32' && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'AntigravityZhcn', 'auto-learned-translations.json');
            if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'AntigravityZhcn', 'auto-learned-translations.json');
            return path.join(electron_1.app.getPath('userData'), 'auto-learned-translations.json');
        };
        // User switches written by “汉化设置” (src/lib/user-settings.mjs), next to the learned dictionary.
        const getZhcnSettings = async () => (await _zhReadSettingsState()).value;
        try {
            const reqUrl = new URL(request.url);
            if (reqUrl.hostname === 'settings') {
                const hook = await _zhReadPackHook();
                if (request.method === 'POST') {
                    const body = await request.json().catch(() => ({}));
                    const saved = await _zhWriteSettings(body, hook);
                    return new Response(JSON.stringify({
                        ok: true,
                        handled: true,
                        writable: true,
                        platform: process.platform,
                        hasHook: Boolean(hook),
                        ...saved
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                const current = await getZhcnSettings();
                return new Response(JSON.stringify({
                    ...current,
                    writable: true,
                    platform: process.platform,
                    hasHook: Boolean(hook)
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                });
            }
            if (reqUrl.hostname === 'manual-titles') {
                const manualPath = path.join(path.dirname(getAutoDictPath()), 'manual-titles.json');
                let state = { ids: [], titles: [] };
                try {
                    const raw = JSON.parse(await fsPromises.readFile(manualPath, 'utf8'));
                    if (Array.isArray(raw.ids)) state.ids = raw.ids.filter((x) => typeof x === 'string' && x.trim());
                    if (Array.isArray(raw.titles)) state.titles = raw.titles.filter((x) => typeof x === 'string' && x.trim());
                } catch (_mErr) {}
                if (request.method === 'POST') {
                    const body = await request.json().catch(() => ({}));
                    const cid = typeof body.cascadeId === 'string' ? body.cascadeId.trim() : '';
                    const title = typeof body.title === 'string' ? body.title.trim() : '';
                    let changed = false;
                    if (cid && !state.ids.includes(cid)) { state.ids.push(cid); changed = true; }
                    if (title && !state.titles.includes(title)) { state.titles.push(title); changed = true; }
                    if (state.ids.length > 2000) state.ids = state.ids.slice(-2000);
                    if (state.titles.length > 2000) state.titles = state.titles.slice(-2000);
                    if (changed) {
                        await fsPromises.mkdir(path.dirname(manualPath), { recursive: true });
                        const tmp = manualPath + '.' + process.pid + '.' + Date.now() + '.tmp';
                        await fsPromises.writeFile(tmp, JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), ids: state.ids, titles: state.titles }, null, 2) + '\\n', 'utf8');
                        await fsPromises.rename(tmp, manualPath);
                    }
                    return new Response(JSON.stringify({ ok: true, ids: state.ids, titles: state.titles }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                return new Response(JSON.stringify({ ok: true, ids: state.ids, titles: state.titles }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                });
            }
            if (reqUrl.hostname === 'auto-dict') {
                const dictPath = getAutoDictPath();
                if (request.method === 'POST') {
                    const body = await request.json().catch(() => ({}));
                    const entries = (body && typeof body.entries === 'object' && body.entries) ? body.entries : {};
                    let existing = {};
                    try {
                        const raw = await fsPromises.readFile(dictPath, 'utf8');
                        const parsed = JSON.parse(raw);
                        existing = (parsed && typeof parsed.exact === 'object') ? parsed.exact : {};
                    } catch (_e) {}
                    let changed = 0;
                    for (const [k, v] of Object.entries(entries)) {
                        if (typeof k === 'string' && typeof v === 'string' && k.trim() && v.trim() && existing[k] !== v) {
                            existing[k] = v;
                            changed++;
                        }
                    }
                    if (changed > 0) {
                        await fsPromises.mkdir(path.dirname(dictPath), { recursive: true });
                        const tmp = dictPath + '.' + process.pid + '.' + Date.now() + '.tmp';
                        await fsPromises.writeFile(tmp, JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), count: Object.keys(existing).length, exact: existing }, null, 2) + '\\n', 'utf8');
                        await fsPromises.rename(tmp, dictPath);
                    }
                    return new Response(JSON.stringify({ ok: true, changed, total: Object.keys(existing).length }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                let exact = {};
                try {
                    const raw = await fsPromises.readFile(dictPath, 'utf8');
                    const parsed = JSON.parse(raw);
                    exact = (parsed && typeof parsed.exact === 'object') ? parsed.exact : {};
                } catch (_e) {}
                return new Response(JSON.stringify({ ok: true, exact }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                });
            }
            if (reqUrl.hostname === 'translate') {
                // The only translation network exit. UI fill-in (kind=ui) honours onlineTranslate;
                // conversation titles (kind=title, the default) honour titleAutoTranslate.
                const zhcnSettingsNow = await getZhcnSettings();
                const translateKind = reqUrl.searchParams.get('kind') === 'ui' ? 'ui' : 'title';
                if (translateKind === 'ui' ? !zhcnSettingsNow.onlineTranslate : !zhcnSettingsNow.titleAutoTranslate) {
                    return new Response(JSON.stringify({ ok: false, disabled: true }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
                }
                const q = reqUrl.searchParams.get('q') || '';
                if (!q.trim() || q.trim().length > 200) {
                    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
                }
                const targetUrl = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=' + encodeURIComponent(q);
                const doFetch = (electron_1.net && typeof electron_1.net.fetch === 'function') ? electron_1.net.fetch.bind(electron_1.net) : fetch;
                const fetchOpts = (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') ? { signal: AbortSignal.timeout(8000) } : {};
                const resp = await doFetch(targetUrl, fetchOpts);
                const data = await resp.json();
                const translated = Array.isArray(data && data[0]) ? data[0].map((seg) => (Array.isArray(seg) ? seg[0] : '')).join('') : '';
                return new Response(JSON.stringify({ ok: Boolean(translated), translated }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                });
            }
            if (reqUrl.hostname === 'pack-update-check') {
                const mode = reqUrl.searchParams.get('mode') || '';
                const hook = await _zhReadPackHook();
                const fallbackVer = (reqUrl.searchParams.get('current') || '').trim() || '0.0.0';
                if (mode === 'panel') {
                    const localVer = await _zhResolveLocalVer(hook, fallbackVer);
                    const rel = await _zhFetchLatestRelease(localVer, 5000);
                    const maxAppVersion = await _zhReadMaxAppVer(hook);
                    if (!rel.ok) {
                        return new Response(JSON.stringify({
                            ok: false,
                            handled: true,
                            status: 'check-failed',
                            reason: rel.reason,
                            currentVersion: localVer,
                            maxAppVersion,
                            releaseUrl: _zhRepoReleaseUrl,
                            hasHook: Boolean(hook),
                            platform: process.platform
                        }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                        });
                    }
                    return new Response(JSON.stringify({
                        ok: true,
                        handled: true,
                        status: rel.hasNew ? 'update-available' : 'up-to-date',
                        currentVersion: localVer,
                        latestVersion: rel.latestVer,
                        notes: rel.notes || '',
                        maxAppVersion,
                        releaseUrl: rel.releaseUrl,
                        hasHook: Boolean(hook),
                        platform: process.platform
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                if (globalThis.__agyZhcnManualCheckRunning) {
                    return new Response(JSON.stringify({ ok: true, busy: true, handled: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                globalThis.__agyZhcnManualCheckRunning = true;
                try {
                    const res = await _zhRunManualDialogCheck(hook, fallbackVer);
                    return new Response(JSON.stringify(res), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                } finally {
                    globalThis.__agyZhcnManualCheckRunning = false;
                }
            }
            if (reqUrl.hostname === 'pack-update-apply' && request.method === 'POST') {
                if (globalThis.__agyZhcnManualCheckRunning) {
                    return new Response(JSON.stringify({ ok: true, busy: true, handled: true }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                }
                globalThis.__agyZhcnManualCheckRunning = true;
                try {
                    const stateDir = _zhGetStateDir();
                    const hook = await _zhReadPackHook();
                    if (!hook) {
                        return new Response(JSON.stringify({ ok: false, handled: true, status: 'no-hook', releaseUrl: _zhRepoReleaseUrl }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                        });
                    }
                    await _zhWritePackState(stateDir, { skippedVersion: null, snoozedVersion: null, snoozedUntil: 0 }).catch(() => {});
                    const okUpd = await _zhRunSelfUpdateWait(hook, []);
                    const newHook = await _zhReadPackHook();
                    const newVer = await _zhResolveLocalVer(newHook || hook, '');
                    const maxAppVersion = await _zhReadMaxAppVer(newHook || hook);
                    if (okUpd && newVer) _zhUpdateMacPackMenuVersion(newVer);
                    return new Response(JSON.stringify({
                        ok: okUpd,
                        handled: true,
                        status: okUpd ? 'updated' : 'update-failed',
                        currentVersion: newVer,
                        latestVersion: newVer,
                        maxAppVersion,
                        hot: process.platform === 'win32',
                        releaseUrl: _zhRepoReleaseUrl,
                        platform: process.platform
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                    });
                } finally {
                    globalThis.__agyZhcnManualCheckRunning = false;
                }
            }
            if (reqUrl.hostname === 'pack-update-skip' && request.method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const ver = String((body && body.version) || reqUrl.searchParams.get('version') || '').trim().replace(/^v/i, '');
                if (ver) {
                    await _zhWritePackState(_zhGetStateDir(), { skippedVersion: ver }).catch(() => {});
                }
                return new Response(JSON.stringify({ ok: Boolean(ver), handled: true, skippedVersion: ver }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
                });
            }
        } catch (_routeErr) {}

        const bundlePath = path.join(electron_1.app.getPath('userData'), 'agy_zhcn_ui_main.js');
        const content = await fsPromises.readFile(bundlePath);
        return new Response(content, {
            status: 200,
            headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store'
            }
        });
    });
    try {
        if (electron_1.app && !electron_1.app.__zhcnAutoFollowHooked) {
            electron_1.app.__zhcnAutoFollowHooked = true;
            // Startup pack update check (works regardless of how Antigravity was launched on Windows/macOS).
            const runStartupPackUpdateCheck = async () => {
                try {
                    const stateDir = _zhGetStateDir();
                    const sSnap = await _zhReadSettingsState();
                    if (!sSnap.exists || sSnap.startupPackMode === 'off') return;
                    const packMode = sSnap.startupPackMode;

                    const hook = await _zhReadPackHook();
                    if (!hook) return;
                    const localVer = await _zhResolveLocalVer(hook, '0.0.0');
                    const packState = await _zhReadPackState(stateDir);
                    if (packState && packState.pendingMainUpdate && packState.pendingMainUpdate.version === localVer) return;

                    const rel = await _zhFetchLatestRelease(localVer, 3500);
                    if (!rel.ok || !rel.hasNew) return;
                    if (packState && packState.pendingMainUpdate && packState.pendingMainUpdate.version === rel.latestVer) return;

                    if (packMode === 'auto') {
                        _zhSpawnSelfUpdate(hook, []);
                        return;
                    }
                    if (packMode === 'ask') {
                        if (packState && packState.skippedVersion === rel.latestVer) return;
                        if (packState && packState.snoozedVersion === rel.latestVer && Number(packState.snoozedUntil) > Date.now()) return;
                        const action = await _zhShowModernOrNativeDialog(hook, {
                            kind: 'pack-startup',
                            current: localVer,
                            latest: rel.latestVer,
                            type: 'info',
                            title: 'Antigravity 汉化包有新版本',
                            message: '发现 Antigravity 中文汉化包新版本 v' + rel.latestVer,
                            boxDetail: '当前版本：v' + localVer + '\\n\\n是否立即在后台下载更新？下载后核对 SHA-256，客户端可以继续使用。',
                            buttons: ['立即更新', '稍后再说', '跳过此版本'],
                            defaultId: 0,
                            cancelId: 1,
                            actionMap: ['update', 'later', 'skip']
                        });
                        if (action === 'update') {
                            _zhSpawnSelfUpdate(hook, []);
                        } else if (action === 'skip') {
                            await _zhWritePackState(stateDir, { skippedVersion: rel.latestVer });
                        } else {
                            // Snooze "稍后再说" / dialog dismissal for 24 hours so frequent daily releases do not nag repeatedly.
                            await _zhWritePackState(stateDir, {
                                snoozedVersion: rel.latestVer,
                                snoozedUntil: Date.now() + 24 * 60 * 60 * 1000
                            });
                        }
                    }
                } catch (_chkErr) {}
            };
            const _zhOpenMacPanel = async (tab) => {
                try {
                    const wins = (electron_1.BrowserWindow && typeof electron_1.BrowserWindow.getAllWindows === 'function') ? electron_1.BrowserWindow.getAllWindows() : [];
                    const focused = (electron_1.BrowserWindow && typeof electron_1.BrowserWindow.getFocusedWindow === 'function') ? electron_1.BrowserWindow.getFocusedWindow() : null;
                    const target = (focused && !focused.isDestroyed()) ? focused : wins.find((w) => w && !w.isDestroyed());
                    if (target && target.webContents && !target.webContents.isDestroyed()) {
                        if (typeof target.isMinimized === 'function' && target.isMinimized()) target.restore();
                        if (typeof target.focus === 'function') target.focus();
                        const called = await target.webContents.executeJavaScript(
                            '(typeof globalThis.__AGY_ZHCN_OPEN_PACK_PANEL__==="function")?(globalThis.__AGY_ZHCN_OPEN_PACK_PANEL__(' + JSON.stringify(tab) + '),true):false',
                            true
                        ).catch(() => false);
                        if (called) return;
                    }
                    if (tab === 'update') {
                        const hook = await _zhReadPackHook();
                        await _zhRunManualDialogCheck(hook, '0.0.0');
                    }
                } catch (_macPanelErr) {}
            };
            const _zhAttachMacAppMenu = async (attempt = 0) => {
                if (process.platform !== 'darwin' || !electron_1.Menu || typeof electron_1.Menu.getApplicationMenu !== 'function' || typeof electron_1.MenuItem !== 'function') return;
                try {
                    const appMenu = electron_1.Menu.getApplicationMenu();
                    const appSub = appMenu && appMenu.items && appMenu.items[0] && appMenu.items[0].submenu;
                    if (!appSub || !Array.isArray(appSub.items)) {
                        if (attempt < 15) setTimeout(() => { _zhAttachMacAppMenu(attempt + 1).catch(() => {}); }, 400);
                        return;
                    }
                    if (appSub.items.some((it) => it && it.id === 'agy-zhcn-pack-center')) return;
                    const hook = await _zhReadPackHook();
                    const localVer = await _zhResolveLocalVer(hook, '');
                    const checkIdx = appSub.items.findIndex((it) => it && (it.id === 'check-for-updates' || it.label === 'Check for Updates' || it.label === '检查更新'));
                    const insertPos = checkIdx >= 0 ? checkIdx + 1 : Math.min(2, appSub.items.length);
                    const centerLabel = localVer ? ('汉化中心 v' + localVer) : '汉化中心';
                    appSub.insert(insertPos, new electron_1.MenuItem({ id: 'agy-zhcn-pack-center', label: centerLabel, click: () => { _zhOpenMacPanel('update').catch(() => {}); } }));
                    electron_1.Menu.setApplicationMenu(appMenu);
                } catch (_macMenuErr) {}
            };
            electron_1.app.whenReady().then(() => {
                if (process.platform === 'darwin') {
                    setTimeout(() => { _zhAttachMacAppMenu(0).catch(() => {}); }, 1200);
                }
                setTimeout(() => { runStartupPackUpdateCheck().catch(() => {}); }, 4000);
            }).catch(() => {});
            electron_1.app.on('will-quit', () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const cp = require('child_process');
                    const hookFile = path.join(electron_1.app.getPath('userData'), 'agy_zhcn_autofollow_hook.json');
                    if (fs.existsSync(hookFile)) {
                        const hook = JSON.parse(fs.readFileSync(hookFile, 'utf8'));
                        if (process.platform === 'win32' && hook && hook.vbsPath && fs.existsSync(hook.vbsPath)) {
                            const child = cp.spawn('wscript.exe', ['//B', '//NoLogo', hook.vbsPath, '--post-quit'], {
                                detached: true,
                                stdio: 'ignore',
                                windowsHide: true
                            });
                            child.unref();
                        } else if (hook && hook.nodePath && hook.daemonScript && fs.existsSync(hook.daemonScript)) {
                            const child = cp.spawn(hook.nodePath, [hook.daemonScript, '--post-quit'], {
                                detached: true,
                                stdio: 'ignore',
                                windowsHide: true
                            });
                            child.unref();
                        }
                    }
                } catch (_quitErr) {}
            });
            try {
                if (typeof electron_1.app.on === 'function') {
                    const scFs = require('fs/promises');
                    const scPath = require('path');
                    const scBegin = '/* __AGY_ZHCN_SIDECAR_OVERLAY_BEGIN__ */';
                    const scEnd = '/* __AGY_ZHCN_SIDECAR_OVERLAY_END__ */';
                    let sidecarOverlayCache = null;
                    const loadSidecarOverlayScript = async () => {
                        try {
                            const bundlePath = scPath.join(electron_1.app.getPath('userData'), 'agy_zhcn_ui_main.js');
                            const st = await scFs.stat(bundlePath);
                            if (sidecarOverlayCache && sidecarOverlayCache.mtimeMs === st.mtimeMs && sidecarOverlayCache.size === st.size) {
                                return sidecarOverlayCache.body;
                            }
                            const raw = await scFs.readFile(bundlePath, 'utf8');
                            const sIdx = raw.lastIndexOf(scBegin);
                            const eIdx = sIdx >= 0 ? raw.indexOf(scEnd, sIdx + scBegin.length) : -1;
                            if (sIdx < 0 || eIdx < 0) return '';
                            const overlay = raw.slice(sIdx + scBegin.length, eIdx).trim();
                            if (!overlay) return '';
                            const body = '(function(){try{if(globalThis.__AGY_ZHCN_SIDECAR_APPLIED__)return;if(!globalThis.sidecar&&!document.getElementById("swarm-title")&&!document.getElementById("empty-body"))return;globalThis.__AGY_ZHCN_SIDECAR_APPLIED__=true;globalThis.__AGY_ZHCN_DISABLE_AUTO_TRANSLATE__=true;\\n' + overlay + '\\n}catch(_scErr){}})();';
                            sidecarOverlayCache = { mtimeMs: st.mtimeMs, size: st.size, body };
                            return body;
                        } catch (_ovErr) {
                            return '';
                        }
                    };
                    electron_1.app.on('web-contents-created', (_wcEvent, contents) => {
                        try {
                            if (!contents || typeof contents.getType !== 'function' || contents.getType() !== 'window') return;
                            contents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
                                try {
                                    if (isMainFrame) return;
                                    const frame = (event && event.senderFrame) || (electron_1.webFrameMain && typeof electron_1.webFrameMain.fromId === 'function' && Number.isInteger(frameProcessId) && Number.isInteger(frameRoutingId) ? electron_1.webFrameMain.fromId(frameProcessId, frameRoutingId) : null);
                                    if (!frame || !frame.parent || (typeof frame.isDestroyed === 'function' && frame.isDestroyed()) || typeof frame.executeJavaScript !== 'function') return;
                                    const frameUrl = typeof frame.url === 'string' ? frame.url : '';
                                    if (!/^https?:\\/\\/(?:127\\.0\\.0\\.1|localhost)(?::\\d+)?\\//i.test(frameUrl)) return;
                                    Promise.resolve(loadSidecarOverlayScript()).then((script) => {
                                        if (!script || (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) || (typeof frame.isDestroyed === 'function' && frame.isDestroyed())) return;
                                        return frame.executeJavaScript(script, false);
                                    }).catch(() => {});
                                } catch (_frameErr) {}
                            });
                        } catch (_wcErr) {}
                    });
                }
            } catch (_sidecarErr) {}
        }
    } catch (_hookErr) {}
    electron_1.session.defaultSession.webRequest.onBeforeRequest(
        { urls: ['https://127.0.0.1:*/main.js'] },
        (_details, callback) => {
            callback({ redirectURL: 'agy-zhcn://bundle/main.js' });
        }
    );

    // Antigravity Desktop ZHCN: localize Electron native tray, dock, and application menus.
    try {
        const translateNativeMenuText = (text) => {
            if (typeof text !== 'string') return text;
            const trimmed = text.trim();
            if (process.platform === 'darwin') {
                // The official updater dispatches actions by the visible label.
                // Preserve these action keys; translating them would break updates.
                if (/^(Check for Updates|Checking for Updates\\.\\.\\.|Downloading Update\\.\\.\\.|Restart to Update)$/.test(trimmed)) return text;
                const macLabels = {
                    'File': '文件', 'Edit': '编辑', 'View': '视图', 'Window': '窗口', 'Help': '帮助',
                    'About Antigravity': '关于 Antigravity', 'Services': '服务',
                    'Hide Antigravity': '隐藏 Antigravity', 'Hide Others': '隐藏其他', 'Show All': '显示全部',
                    'Quit Antigravity': '退出 Antigravity', 'Close Window': '关闭窗口', 'Close': '关闭',
                    'Undo': '撤销', 'Redo': '重做', 'Cut': '剪切', 'Copy': '复制', 'Paste': '粘贴',
                    'Paste and Match Style': '粘贴并匹配样式', 'Delete': '删除', 'Select All': '全选',
                    'Reload': '重新加载', 'Force Reload': '强制重新加载', 'Toggle Developer Tools': '切换开发者工具',
                    'Actual Size': '实际大小', 'Zoom In': '放大', 'Zoom Out': '缩小',
                    'Toggle Full Screen': '切换全屏', 'Minimize': '最小化', 'Zoom': '缩放',
                    'Bring All to Front': '全部前置', 'Front': '前置'
                };
                if (macLabels[trimmed]) return macLabels[trimmed];
            }
            if (trimmed === 'No agents running') return '无正在运行的智能体';
            if (trimmed === 'Quit') return '退出';
            if (trimmed === 'New Window') return '新建窗口';
            if (trimmed === 'Docs') return '文档';
            if (trimmed === 'Check for Updates') return '检查更新';
            if (trimmed === 'Checking for Updates...') return '正在检查更新...';
            if (trimmed === 'Downloading Update...') return '正在下载更新...';
            if (trimmed === 'Restart to Update') return '重启以更新';
            if (trimmed.startsWith('Open ')) {
                return '打开 ' + trimmed.slice(5);
            }
            if (/^(\\d+)\\s+agents?\\s+running$/i.test(trimmed)) {
                return trimmed.replace(/^(\\d+)\\s+agents?\\s+running$/i, '$1 个智能体正在运行');
            }
            if (/^No\\s+agents?\\s+running$/i.test(trimmed)) {
                return '无正在运行的智能体';
            }
            return text;
        };

        const transformMenuTemplate = (items) => {
            if (!Array.isArray(items)) return items;
            return items.map((item) => {
                if (!item || typeof item !== 'object') return item;
                const copy = { ...item };
                if (typeof copy.label === 'string') {
                    copy.label = translateNativeMenuText(copy.label);
                }
                if (Array.isArray(copy.submenu)) {
                    copy.submenu = transformMenuTemplate(copy.submenu);
                }
                return copy;
            });
        };

        if (electron_1.Menu && !electron_1.Menu.__zhcnPatched) {
            electron_1.Menu.__zhcnPatched = true;
            if (process.platform === 'darwin') {
                const origSetApplicationMenu = electron_1.Menu.setApplicationMenu;
                electron_1.Menu.setApplicationMenu = function (menu) {
                    const walk = (items) => {
                        for (const item of items || []) {
                            if (typeof item.label === 'string') item.label = translateNativeMenuText(item.label);
                            if (item.submenu) walk(item.submenu.items);
                        }
                    };
                    if (menu) walk(menu.items);
                    return origSetApplicationMenu.call(this, menu);
                };
            }
            const origBuildFromTemplate = electron_1.Menu.buildFromTemplate;
            if (typeof origBuildFromTemplate === 'function') {
                electron_1.Menu.buildFromTemplate = function (template) {
                    return origBuildFromTemplate.call(this, transformMenuTemplate(template));
                };
            }
            if (electron_1.Menu.prototype) {
                const origAppend = electron_1.Menu.prototype.append;
                if (typeof origAppend === 'function') {
                    electron_1.Menu.prototype.append = function (menuItem) {
                        if (menuItem && typeof menuItem.label === 'string') {
                            menuItem.label = translateNativeMenuText(menuItem.label);
                        }
                        return origAppend.call(this, menuItem);
                    };
                }
                const origInsert = electron_1.Menu.prototype.insert;
                if (typeof origInsert === 'function') {
                    electron_1.Menu.prototype.insert = function (pos, menuItem) {
                        if (menuItem && typeof menuItem.label === 'string') {
                            menuItem.label = translateNativeMenuText(menuItem.label);
                        }
                        return origInsert.call(this, pos, menuItem);
                    };
                }
            }
        }

        if (electron_1.MenuItem && !electron_1.MenuItem.__zhcnPatched) {
            electron_1.MenuItem.__zhcnPatched = true;
            const proto = electron_1.MenuItem.prototype;
            const origDescriptor = Object.getOwnPropertyDescriptor(proto, 'label');
            if (origDescriptor && origDescriptor.set) {
                Object.defineProperty(proto, 'label', {
                    get: origDescriptor.get,
                    set: function (val) {
                        return origDescriptor.set.call(this, translateNativeMenuText(val));
                    },
                    configurable: true,
                    enumerable: true,
                });
            }
        }

        if (electron_1.Tray && electron_1.Tray.prototype && !electron_1.Tray.__zhcnPatched) {
            electron_1.Tray.__zhcnPatched = true;
            const origSetContextMenu = electron_1.Tray.prototype.setContextMenu;
            if (typeof origSetContextMenu === 'function') {
                electron_1.Tray.prototype.setContextMenu = function (menu) {
                    if (menu && Array.isArray(menu.items)) {
                        for (const item of menu.items) {
                            if (item && typeof item.label === 'string') {
                                item.label = translateNativeMenuText(item.label);
                            }
                        }
                    }
                    return origSetContextMenu.call(this, menu);
                };
            }
        }
    } catch (menuErr) {
        console.error("Failed to hook native menu localization:", menuErr);
    }

    // Antigravity Desktop ZHCN: localize Electron native dialogs (showMessageBox, showErrorBox).
    try {
        const path = require("path");
        const fs = require("fs");
        let externalDialogRules = null;
        let lastExternalDialogCheck = 0;

        const loadExternalDialogRules = () => {
            const now = Date.now();
            if (externalDialogRules && (now - lastExternalDialogCheck) < 5000) {
                return externalDialogRules;
            }
            lastExternalDialogCheck = now;
            try {
                const userData = electron_1.app && typeof electron_1.app.getPath === 'function' ? electron_1.app.getPath('userData') : '';
                if (userData) {
                    const ruleFile = path.join(userData, 'agy_zhcn_dialog.json');
                    if (fs.existsSync(ruleFile)) {
                        const raw = fs.readFileSync(ruleFile, 'utf8');
                        externalDialogRules = JSON.parse(raw);
                        return externalDialogRules;
                    }
                }
            } catch (_loadErr) {}
            return null;
        };

        const nativeDialogExactMap = {
            'Check for Updates': '检查更新',
            'Checking for Updates...': '正在检查更新...',
            'Checking for updates...': '正在检查更新...',
            'Downloading Update...': '正在下载更新...',
            'Downloading update...': '正在下载更新...',
            'Restart to Update': '重启以更新',
            'No updates available': '没有可用的更新',
            'No updates available.': '没有可用的更新。',
            'No update available': '没有可用的更新',
            'No update available.': '没有可用的更新。',
            'Update Available': '发现新版本',
            'Update available': '发现新版本',
            'Update Not Available': '没有可用的更新',
            'Update not available': '没有可用的更新',
            'Update Downloaded': '更新已下载',
            'Update downloaded': '更新已下载',
            'Update Error': '更新失败',
            'Update error': '更新失败',
            'Update Failed': '更新失败',
            'Update failed': '更新失败',
            'Update check failed': '检查更新失败',
            'There are no updates available at this time.': '当前没有可用的更新。',
            'You are running the latest version.': '您当前已是最新版本。',
            'A new version is available. Would you like to download it now?': '发现新版本。您想现在下载吗？',
            'A new version has been downloaded. Restart the application to apply the updates.': '新版本已下载完成。重启应用程序以应用更新。',
            'Confirm Quit': '确认退出',
            'Are you sure you want to quit?': '确定要退出吗？',
            'There may be agents or background tasks running.': '可能有正在运行的智能体或后台任务。',
            'Quit Antigravity': '退出 Antigravity',
            'WSL distro not found': '未找到 WSL 发行版',
            'Antigravity opened on Windows instead.': 'Antigravity 已在 Windows 环境中打开。',
            'Binary not found': '未找到二进制执行文件',
            'WSL setup failed': 'WSL 配置失败',
            'Startup failed': '启动失败',
            'Cannot open folder': '无法打开文件夹',
            'Folder is on the Windows filesystem': '文件夹位于 Windows 文件系统中',
            'Open workspace': '打开工作区',
            'Error': '错误',
            'Warning': '警告',
            'Information': '提示',
            'Question': '提示',
            'OK': '确定',
            'Ok': '确定',
            'Cancel': '取消',
            'Yes': '是',
            'No': '否',
            'Retry': '重试',
            'Ignore': '忽略',
            'Close': '关闭',
            'Quit': '退出',
            'Restart': '重启',
            'Later': '稍后',
            'Install and Relaunch': '安装并重启',
            'Install and Restart': '安装并重启',
            'Download': '下载',
            'Download Now': '立即下载',
            'Learn More': '了解更多',
            'Open Settings': '打开设置',
            'Open Folder': '打开文件夹',
            'Open Workspace': '打开工作区',
            'Continue': '继续'
        };

        const nativeDialogPatterns = [
            { reg: /^A new version\s+([0-9a-zA-Z._-]+)\s+is available/i, rep: '发现新版本 $1 可用' },
            { reg: /^Version\s+([0-9a-zA-Z._-]+)\s+is available/i, rep: '版本 $1 现已可用' },
            { reg: /^Downloading\s+(?:update\s+)?([0-9]+(?:\.[0-9]+)?%)/i, rep: '正在下载更新 ($1)' },
            { reg: /^An error occurred(?::\s*(.*))?$/i, rep: '$1' ? '发生错误：$1' : '发生错误' },
            { reg: /^Failed to check for updates(?::\s*(.*))?$/i, rep: '$1' ? '检查更新失败：$1' : '检查更新失败' },
            { reg: /^Failed to download update(?::\s*(.*))?$/i, rep: '$1' ? '下载更新失败：$1' : '下载更新失败' },
            { reg: /^There is no update available at this time\.?$/i, rep: '当前没有可用的更新。' },
            { reg: /^You are already on the latest version\.?$/i, rep: '您当前已是最新版本。' }
        ];

        const translateDialogText = (text) => {
            if (typeof text !== 'string') return text;
            const trimmed = text.trim();
            if (!trimmed) return text;

            // 1. 外部动态配置优先
            const ext = loadExternalDialogRules();
            if (ext) {
                if (ext.exact && typeof ext.exact[trimmed] === 'string') {
                    return ext.exact[trimmed];
                }
                if (Array.isArray(ext.patterns)) {
                    for (const p of ext.patterns) {
                        try {
                            const r = new RegExp(p.pattern, p.flags || 'i');
                            if (r.test(trimmed)) {
                                return trimmed.replace(r, p.replacement);
                            }
                        } catch (_err) {}
                    }
                }
            }

            // 2. 内置精确翻译
            if (nativeDialogExactMap[trimmed]) {
                return nativeDialogExactMap[trimmed];
            }

            // 3. 内置模式正则
            for (const item of nativeDialogPatterns) {
                if (item.reg.test(trimmed)) {
                    return trimmed.replace(item.reg, item.rep);
                }
            }

            // 4. 泛化词组替换兜底（处理复合短语）
            let result = text;
            let replaced = false;
            for (const [k, v] of Object.entries(nativeDialogExactMap)) {
                if (k.length >= 4 && result.includes(k)) {
                    result = result.split(k).join(v);
                    replaced = true;
                }
            }
            if (replaced) return result;

            return text;
        };

        const localizeDialogOptions = (opts) => {
            if (!opts || typeof opts !== 'object') return opts;
            const copy = { ...opts };
            if (typeof copy.title === 'string') {
                copy.title = translateDialogText(copy.title);
            }
            if (typeof copy.message === 'string') {
                copy.message = translateDialogText(copy.message);
            }
            if (typeof copy.detail === 'string') {
                copy.detail = translateDialogText(copy.detail);
            }
            if (typeof copy.checkboxLabel === 'string') {
                copy.checkboxLabel = translateDialogText(copy.checkboxLabel);
            }
            if (Array.isArray(copy.buttons)) {
                copy.buttons = copy.buttons.map((btn) => {
                    if (typeof btn === 'string') {
                        return translateDialogText(btn);
                    }
                    return btn;
                });
            }
            return copy;
        };

        if (electron_1.dialog && !electron_1.dialog.__zhcnPatched) {
            electron_1.dialog.__zhcnPatched = true;

            const origShowMessageBox = electron_1.dialog.showMessageBox;
            if (typeof origShowMessageBox === 'function') {
                electron_1.dialog.showMessageBox = function (arg1, arg2) {
                    if (arg2 !== undefined && typeof arg2 === 'object') {
                        return origShowMessageBox.call(this, arg1, localizeDialogOptions(arg2));
                    }
                    if (arg1 && typeof arg1 === 'object' && !arg1.webContents) {
                        return origShowMessageBox.call(this, localizeDialogOptions(arg1));
                    }
                    return origShowMessageBox.call(this, arg1, arg2);
                };
            }

            const origShowMessageBoxSync = electron_1.dialog.showMessageBoxSync;
            if (typeof origShowMessageBoxSync === 'function') {
                electron_1.dialog.showMessageBoxSync = function (arg1, arg2) {
                    if (arg2 !== undefined && typeof arg2 === 'object') {
                        return origShowMessageBoxSync.call(this, arg1, localizeDialogOptions(arg2));
                    }
                    if (arg1 && typeof arg1 === 'object' && !arg1.webContents) {
                        return origShowMessageBoxSync.call(this, localizeDialogOptions(arg1));
                    }
                    return origShowMessageBoxSync.call(this, arg1, arg2);
                };
            }

            const origShowErrorBox = electron_1.dialog.showErrorBox;
            if (typeof origShowErrorBox === 'function') {
                electron_1.dialog.showErrorBox = function (title, content) {
                    return origShowErrorBox.call(this, translateDialogText(title), translateDialogText(content));
                };
            }
        }
    } catch (dialogErr) {
        console.error("Failed to hook native dialog localization:", dialogErr);
    }
`;

export function patchCustomSchemeSource(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  if (normalized.includes("agy-zhcn://bundle/main.js")) {
    throw new Error("customScheme.js 已包含本项目补丁。");
  }

  const schemeAnchorCount = normalized.split(SCHEME_LIST_ANCHOR).length - 1;
  const handlerAnchorCount = normalized.split(HANDLER_ANCHOR).length - 1;
  if (schemeAnchorCount !== 1 || handlerAnchorCount !== 1) {
    throw new Error("customScheme.js 补丁锚点不唯一，拒绝修改。");
  }

  return normalized
    .replace(SCHEME_LIST_ANCHOR, SCHEME_LIST_REPLACEMENT)
    .replace(HANDLER_ANCHOR, HANDLER_REPLACEMENT);
}

export function patchLoadingOverlaySource(source) {
  const normalized = source.replaceAll("\r\n", "\n");
  if (normalized.includes("正在加载 Antigravity")) {
    return normalized;
  }
  return normalized.replace(
    '<div class="text">Loading Antigravity</div>',
    '<div class="text">正在加载 Antigravity...</div>',
  );
}

function createArchiveStreams({
  sourceAsarPath,
  sourceUnpackedPath,
  header,
  dataOffset,
  replacementPath,
  replacementBuffer,
  replacements,
}) {
  const replacementMap = new Map();
  if (replacements instanceof Map) {
    for (const [k, v] of replacements.entries()) replacementMap.set(k, v);
  } else if (replacements && typeof replacements === "object") {
    for (const [k, v] of Object.entries(replacements)) replacementMap.set(k, v);
  }
  if (replacementPath && replacementBuffer) {
    replacementMap.set(replacementPath, replacementBuffer);
  }

  const streams = [];

  function walk(directory, parentPath = "") {
    for (const [name, entry] of Object.entries(directory.files ?? {})) {
      const archivePath = parentPath ? `${parentPath}/${name}` : name;

      if (entry.files) {
        streams.push({
          type: "directory",
          path: archivePath,
          unpacked: Boolean(entry.unpacked),
        });
        walk(entry, archivePath);
        continue;
      }

      if (entry.link) {
        streams.push({
          type: "link",
          path: archivePath,
          unpacked: Boolean(entry.unpacked),
          symlink: entry.link,
          stat: {
            size: 0,
            mode: 0o120777,
          },
          streamGenerator: () => Readable.from([]),
        });
        continue;
      }

      const repBuf = replacementMap.get(archivePath);
      const isReplacement = Boolean(repBuf);
      const size = isReplacement ? repBuf.length : Number(entry.size);
      const unpacked = Boolean(entry.unpacked);
      const streamGenerator = isReplacement
        ? () => Readable.from(repBuf)
        : unpacked
          ? () =>
              createReadStream(
                path.join(
                  sourceUnpackedPath,
                  ...archivePath.split("/"),
                ),
              )
          : size === 0
            ? () => Readable.from([])
            : () =>
                createReadStream(sourceAsarPath, {
                  start: dataOffset + Number(entry.offset),
                  end: dataOffset + Number(entry.offset) + size - 1,
                });

      streams.push({
        type: "file",
        path: archivePath,
        unpacked,
        stat: {
          size,
          mode: entry.executable ? 0o100755 : 0o100644,
        },
        streamGenerator,
      });
    }
  }

  walk(header);
  return streams;
}

function alignToFour(value) {
  return value + ((4 - (value % 4)) % 4);
}

function serializeAsarHeader(header) {
  const jsonBuffer = Buffer.from(JSON.stringify(header), "utf8");
  const stringPayloadSize = 4 + alignToFour(jsonBuffer.length);
  const headerPickle = Buffer.alloc(4 + stringPayloadSize);
  headerPickle.writeUInt32LE(stringPayloadSize, 0);
  headerPickle.writeInt32LE(jsonBuffer.length, 4);
  jsonBuffer.copy(headerPickle, 8);

  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  return Buffer.concat([sizePickle, headerPickle]);
}

function restoreExecutableFlags(originalHeader, patchedHeader) {
  function walk(originalDirectory, parentPath = "") {
    for (const [name, originalEntry] of Object.entries(
      originalDirectory.files ?? {},
    )) {
      const archivePath = parentPath ? `${parentPath}/${name}` : name;
      if (originalEntry.files) {
        walk(originalEntry, archivePath);
        continue;
      }

      const patchedEntry = getAsarEntry(patchedHeader, archivePath);
      if (originalEntry.executable) {
        patchedEntry.executable = true;
      } else {
        delete patchedEntry.executable;
      }
    }
  }

  walk(originalHeader);
}

async function rewriteHeaderWithOriginalExecutableFlags({
  outputAsarPath,
  originalHeader,
}) {
  const builtArchive = await readFile(outputAsarPath);
  const { header: builtHeader, dataOffset } =
    await readAsarHeader(outputAsarPath);
  restoreExecutableFlags(originalHeader, builtHeader);
  const serializedHeader = serializeAsarHeader(builtHeader);
  const rewrittenPath = `${outputAsarPath}.${process.pid}.header.tmp`;
  await writeFile(
    rewrittenPath,
    Buffer.concat([serializedHeader, builtArchive.subarray(dataOffset)]),
  );
  await rm(outputAsarPath, { force: true });
  await rename(rewrittenPath, outputAsarPath);
}

export async function buildPatchedAsar({
  sourceAsarPath,
  sourceUnpackedPath = `${sourceAsarPath}.unpacked`,
  outputAsarPath,
  customSchemePath,
  expectedCustomSchemeSha256,
}) {
  const { createPackageFromStreams } = await import("@electron/asar");
  const { header, dataOffset } = await readAsarHeader(sourceAsarPath);
  const originalEntry = getAsarEntry(header, customSchemePath);
  if (originalEntry.unpacked) {
    throw new Error("customScheme.js 意外位于 unpacked 区域，拒绝修改。");
  }

  const originalBuffer = await readFileFromAsar(
    sourceAsarPath,
    customSchemePath,
  );
  const originalHash = sha256Buffer(originalBuffer);
  if (originalHash !== expectedCustomSchemeSha256) {
    throw new Error(`customScheme.js 指纹不匹配：${originalHash}`);
  }

  const patchedBuffer = Buffer.from(
    patchCustomSchemeSource(originalBuffer.toString("utf8")),
    "utf8",
  );

  const replacements = new Map();
  replacements.set(customSchemePath, patchedBuffer);

  // If loadingOverlay.js exists, localize its initial loading text
  const loadingOverlayPath = "dist/loadingOverlay.js";
  const loadingEntry = getAsarEntry(header, loadingOverlayPath);
  if (loadingEntry && !loadingEntry.unpacked) {
    const rawLoadingBuffer = await readFileFromAsar(
      sourceAsarPath,
      loadingOverlayPath,
    );
    const patchedLoadingBuffer = Buffer.from(
      patchLoadingOverlaySource(rawLoadingBuffer.toString("utf8")),
      "utf8",
    );
    replacements.set(loadingOverlayPath, patchedLoadingBuffer);
  }

  const streams = createArchiveStreams({
    sourceAsarPath,
    sourceUnpackedPath,
    header,
    dataOffset,
    replacements,
  });

  await mkdir(path.dirname(outputAsarPath), { recursive: true });
  const isolatedWorkingDirectory = await mkdtemp(
    path.join(os.tmpdir(), "antigravity-zhcn-asar-cwd-"),
  );
  const previousWorkingDirectory = process.cwd();
  try {
    // @electron/asar probes small files by their relative archive path before
    // falling back to streamGenerator(). An empty cwd prevents an unrelated
    // project file (for example package.json) from poisoning ASAR integrity.
    process.chdir(isolatedWorkingDirectory);
    await createPackageFromStreams(outputAsarPath, streams);
  } finally {
    process.chdir(previousWorkingDirectory);
    await rm(isolatedWorkingDirectory, { recursive: true, force: true });
  }
  await rewriteHeaderWithOriginalExecutableFlags({
    outputAsarPath,
    originalHeader: header,
  });

  // The installed app.asar.unpacked directory is left untouched. A temporary
  // sibling created during archive construction is not part of the patch.
  await rm(`${outputAsarPath}.unpacked`, { recursive: true, force: true });

  const packageJson = await readJsonFromAsar(outputAsarPath, "package.json");
  const verifiedPatchedSource = await readFileFromAsar(
    outputAsarPath,
    customSchemePath,
  );
  if (
    !verifiedPatchedSource
      .toString("utf8")
      .includes("agy-zhcn://bundle/main.js")
  ) {
    throw new Error("新 ASAR 包未通过补丁内容验证。");
  }

  return {
    packageVersion: packageJson.version,
    patchedAsarSha256: await sha256File(outputAsarPath),
    patchedCustomSchemeSha256: sha256Buffer(verifiedPatchedSource),
  };
}

export async function atomicReplaceFile({
  currentPath,
  replacementPath,
  currentExpectedHash,
  replacementExpectedHash,
}) {
  const directory = path.dirname(currentPath);
  const token = `${process.pid}-${Date.now()}`;
  const stagedPath = path.join(directory, `.agy-zhcn-new-${token}.tmp`);
  const displacedPath = path.join(directory, `.agy-zhcn-old-${token}.tmp`);

  const currentHash = await sha256File(currentPath);
  if (currentHash !== currentExpectedHash) {
    throw new Error("待替换文件的当前哈希不一致，拒绝替换。");
  }

  await copyFile(replacementPath, stagedPath);
  const stagedHash = await sha256File(stagedPath);
  if (stagedHash !== replacementExpectedHash) {
    await rm(stagedPath, { force: true });
    throw new Error("暂存文件哈希不一致，拒绝替换。");
  }

  await rename(currentPath, displacedPath);
  try {
    const displacedHash = await sha256File(displacedPath);
    if (displacedHash !== currentExpectedHash) {
      throw new Error("被替换文件转移后的哈希验证失败。");
    }
    await rename(stagedPath, currentPath);
    const installedHash = await sha256File(currentPath);
    if (installedHash !== replacementExpectedHash) {
      throw new Error("替换后的文件哈希验证失败。");
    }
  } catch (error) {
    await rm(currentPath, { force: true }).catch(() => {});
    await rename(displacedPath, currentPath).catch(() => {});
    await rm(stagedPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    displacedPath,
    finalize: async () => rm(displacedPath, { force: true }),
    rollback: async () => {
      const rollbackStagedPath = path.join(
        directory,
        `.agy-zhcn-rollback-${token}.tmp`,
      );
      const displacedHash = await sha256File(displacedPath);
      if (displacedHash !== currentExpectedHash) {
        throw new Error("回滚源文件哈希异常。");
      }

      await rename(currentPath, rollbackStagedPath);
      try {
        await rename(displacedPath, currentPath);
        const restoredHash = await sha256File(currentPath);
        if (restoredHash !== currentExpectedHash) {
          throw new Error("回滚后的文件哈希验证失败。");
        }
        await rm(rollbackStagedPath, { force: true });
      } catch (error) {
        await rm(currentPath, { force: true }).catch(() => {});
        await rename(rollbackStagedPath, currentPath).catch(() => {});
        throw error;
      }
    },
  };
}
