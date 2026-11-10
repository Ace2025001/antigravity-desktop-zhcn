import test from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { decodeEmbeddedUiEntry, findEmbeddedUiEntries } from "../src/lib/runtime-bundle.mjs";

const UI = Buffer.from(`'use strict';${"x".repeat(600_000)}"New Conversation""Automations""Plugins""Settings"`);

function zipEntry(name, content, { crc = crc32(content) } = {}) {
  const data = deflateRawSync(content);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(name.length, 26);
  return { bytes: Buffer.concat([header, Buffer.from(name), data]), data };
}

test("在二进制中定位唯一的 main.js 条目并通过校验", () => {
  const other = zipEntry("dist/main.js", Buffer.from("other"));
  const main = zipEntry("main.js", UI);
  const binary = Buffer.concat([Buffer.alloc(1000), other.bytes, Buffer.alloc(77), main.bytes]);
  const entries = findEmbeddedUiEntries(binary);
  assert.equal(entries.length, 1);
  const result = decodeEmbeddedUiEntry(entries[0], main.data);
  assert.ok(result.buffer);
  assert.equal(result.buffer.length, UI.length);
});

test("CRC 不符时拒绝使用", () => {
  const main = zipEntry("main.js", UI, { crc: 1234 });
  const [entry] = findEmbeddedUiEntries(main.bytes);
  assert.match(decodeEmbeddedUiEntry(entry, main.data).reason, /CRC/);
});

test("缺少界面标记时拒绝使用", () => {
  const content = Buffer.from(`'use strict';${"x".repeat(600_000)}`);
  const main = zipEntry("main.js", content);
  const [entry] = findEmbeddedUiEntries(main.bytes);
  assert.match(decodeEmbeddedUiEntry(entry, main.data).reason, /缺少界面标记/);
});

test("尺寸过小的同名文件不当作界面", () => {
  const main = zipEntry("main.js", Buffer.from("tiny"));
  const [entry] = findEmbeddedUiEntries(main.bytes);
  assert.match(decodeEmbeddedUiEntry(entry, main.data).reason, /尺寸异常/);
});
