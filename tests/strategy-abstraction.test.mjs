import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/strategy-profile.ts", import.meta.url), "utf8");

test("strategy adapter isolates historical examples from current research", () => {
  assert.match(source, /split\(\/\[；;\]\//);
  assert.match(source, /历史作品、公司、标题和单次表现仅作为复盘证据/);
  assert.match(source, /researchDirectives/);
});

test("workflow does not send the visible strategy card as model research", () => {
  const workflow = fs.readFileSync(new URL("../app/creator-workflow.tsx", import.meta.url), "utf8");
  assert.match(workflow, /currentResearch\.filter\(\(item\) => item\.key !== "策略约束"\)/);
  assert.match(workflow, /strategyProfile: effectiveStrategyProfile/);
});
