import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  areSamePaths,
  getAppAsarPath,
  getExecutablePath,
  getInfoPlistPatchPath,
  getResourcesPath,
  getStateRoot,
  getAntigravityUserDataRoot,
  resolveInstallRoot,
} from "../src/lib/paths.mjs";
import { computeAsarHeaderSha256 } from "../src/lib/patcher.mjs";
import { isAntigravityRunning } from "../src/lib/processes.mjs";

async function createMacDesktopInstall(installRoot) {
  const macOsDir = path.join(installRoot, "Contents", "MacOS");
  const resourcesDir = path.join(installRoot, "Contents", "Resources");
  await mkdir(macOsDir, { recursive: true });
  await mkdir(resourcesDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(macOsDir, "Antigravity"), "mac-binary"),
    writeFile(path.join(resourcesDir, "app.asar"), "mac-asar"),
    writeFile(path.join(installRoot, "Contents", "Info.plist"), "plist-data"),
  ]);
}

test("macOS path helpers correctly map app bundle structure", () => {
  const installRoot = "/Applications/Antigravity.app";
  assert.equal(
    getExecutablePath(installRoot, "darwin"),
    "/Applications/Antigravity.app/Contents/MacOS/Antigravity",
  );
  assert.equal(
    getAppAsarPath(installRoot, "darwin"),
    "/Applications/Antigravity.app/Contents/Resources/app.asar",
  );
  assert.equal(
    getResourcesPath(installRoot, "darwin"),
    "/Applications/Antigravity.app/Contents/Resources",
  );
  assert.equal(
    getInfoPlistPatchPath(installRoot),
    "/Applications/Antigravity.app/Contents/Info.plist",
  );
});

test("macOS stateRoot and userDataRoot resolve to standard Application Support directory", () => {
  const home = os.homedir();
  const stateRoot = getStateRoot();
  const userDataRoot = getAntigravityUserDataRoot();

  assert.equal(
    stateRoot,
    path.join(home, "Library", "Application Support", "AntigravityZhcn"),
  );
  assert.equal(
    userDataRoot,
    path.join(home, "Library", "Application Support", "Antigravity"),
  );
});

test("AGY_INSTALL_PATH with macOS .app bundle has highest priority", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agy-mac-test-"));
  const appRoot = path.join(tempRoot, "Antigravity.app");

  try {
    await createMacDesktopInstall(appRoot);
    const resolved = await resolveInstallRoot({
      env: {
        AGY_INSTALL_PATH: appRoot,
      },
      platform: "darwin",
    });

    assert.equal(resolved.installRoot, appRoot);
    assert.equal(resolved.source, "environment");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("running macOS process candidate is recognized and normalized", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agy-mac-test-"));
  const appRoot = path.join(tempRoot, "Running.app");

  try {
    await createMacDesktopInstall(appRoot);
    const binaryPath = path.join(appRoot, "Contents", "MacOS", "Antigravity");

    const resolved = await resolveInstallRoot({
      env: {},
      platform: "darwin",
      findDarwinCandidates: async () => [
        {
          source: "process",
          value: binaryPath,
        },
      ],
    });

    assert.equal(resolved.installRoot, appRoot);
    assert.equal(resolved.source, "process");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("default macOS install path is discovered when present", async () => {
  const resolved = await resolveInstallRoot({
    env: {},
    platform: "darwin",
    findDarwinCandidates: async () => [],
    validateInstallRoot: async (candidate) => {
      return candidate === "/Applications/Antigravity.app";
    },
  });

  assert.equal(resolved.installRoot, "/Applications/Antigravity.app");
  assert.equal(resolved.source, "default");
});

test("isAntigravityRunning handles darwin environment without throwing", async () => {
  const running = await isAntigravityRunning();
  assert.equal(typeof running, "boolean");
});
