import assert from "node:assert/strict";
import test from "node:test";
import { runMacSetup } from "../src/lib/mac-setup.mjs";

function fixture(failAt) {
  const calls = [];
  const info = { original: "/Applications/Antigravity.app" };
  const steps = Object.fromEntries(["inspect", "waitUntilClosed", "openOriginal", "ready", "capture", "install", "launch"].map(name => [name, async (value) => {
    calls.push(name);
    if (name === failAt) throw new Error("模拟失败");
    if (name === "inspect") return info;
    if (name === "openOriginal") assert.equal(value, info.original);
    if (name === "capture" || name === "install") assert.equal(value, info);
  }]));
  return { calls, steps: { ...steps, log() {} } };
}

test("Mac guided setup captures the official UI and waits for exit before installation", async () => {
  const { calls, steps } = fixture();
  await runMacSetup(steps);
  assert.deepEqual(calls, ["inspect", "waitUntilClosed", "openOriginal", "ready", "capture", "waitUntilClosed", "install", "launch"]);
});

for (const failAt of ["inspect", "capture", "install"]) {
  test(`Mac setup stops on ${failAt} failure without launching a partial installation`, async () => {
    const { calls, steps } = fixture(failAt);
    await assert.rejects(runMacSetup(steps), /模拟失败/);
    assert.equal(calls.at(-1), failAt);
    assert.equal(calls.includes("launch"), false);
    if (failAt !== "install") assert.equal(calls.includes("install"), false);
  });
}
