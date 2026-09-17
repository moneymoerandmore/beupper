import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("performance diagnosis does not equate low views with throttling", () => {
  const source = read("app/douyin-performance-baseline.ts");
  assert.match(source, /平台状态异常/);
  assert.match(source, /低分发，未证实限流/);
  assert.match(source, /观察中，逐稿数据未返回/);
  assert.match(source, /isProhibited.*isDeleted.*isPrivate.*selfSee.*inReviewing/s);
});

test("creator sync preserves moderation facts", () => {
  const source = read("scripts/douyin_creator.py");
  for (const field of ["inReviewing", "isProhibited", "isPrivate", "isDeleted", "selfSee", "restrictionReason"]) {
    assert.ok(source.includes(`\"${field}\"`), `missing ${field}`);
  }
});

test("cross-market and causal-strength gates reach every generation stage", () => {
  const files = [
    "skills/discover-financial-topics/SKILL.md",
    "skills/package-financial-video/SKILL.md",
    "skills/write-financial-video-script/SKILL.md",
    "app/hotspot-semantic.ts",
    "scripts/deepseek_packaging.py",
    "scripts/poe_script.py",
  ];
  for (const file of files) {
    const source = read(file);
    assert.match(source, /非重叠|同一时点|时间对齐|不同交易时段/);
  }
  assert.match(read("skills/package-financial-video/SKILL.md"), /因果强度不得高于证据/);
});

test("historical strategy explicitly remains below stable evidence gates", () => {
  assert.match(read("scripts/strategy_iteration.py"), /不得推翻事实核验、平台状态证据门禁、跨市场时间对齐、标题因果强度/);
  assert.match(read("workflow/CONTENT_METHOD.md"), /历史数据形成的动态策略/);
});
