import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../app/douyin-sync-focus.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildDouyinSyncFocus, compactDouyinSyncSnapshot } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const now = Date.parse("2026-09-17T18:00:00+08:00");

test("newest post is reviewed even before retention detail arrives", () => {
  const rows = buildDouyinSyncFocus([], [{ platformId: "new", title: "新稿", publishedAt: "2026-09-17T14:40:00+08:00", views: 72, detailCollected: false }], now);
  assert.equal(rows[0].id, "new");
  assert.equal(rows[0].platformStatus, "no_explicit_restriction");
  assert.match(rows[0].reason, /逐稿留存尚未返回/);
});

test("changed recent post is prioritized; stale unchanged work is not", () => {
  const previous = [{ platformId: "a", title: "变化稿", publishedAt: "2026-09-16T14:00:00+08:00", views: 100, detailCollected: false }];
  const current = [{ ...previous[0], views: 160, detailCollected: true }];
  const rows = buildDouyinSyncFocus(previous, current, now);
  assert.equal(rows[0].viewDelta, 60);
  assert.match(rows[0].reason, /逐稿明细刚返回/);
  assert.equal(buildDouyinSyncFocus(current, current, now).length, 1, "latest work remains under watch");
});

test("direct platform restriction is distinct from risk notice", () => {
  const base = { platformId: "b", title: "状态稿", publishedAt: "2026-09-17T14:00:00+08:00", views: 2, detailCollected: false };
  assert.equal(buildDouyinSyncFocus([], [{ ...base, riskNotice: "个人观点，仅供参考" }], now)[0].platformStatus, "no_explicit_restriction");
  assert.equal(buildDouyinSyncFocus([], [{ ...base, isProhibited: true }], now)[0].platformStatus, "abnormal");
  assert.ok(!("riskNotice" in compactDouyinSyncSnapshot([{ ...base, riskNotice: "个人观点" }])[0]));
});
